"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { criarClientNavegador } from "@/lib/supabase/client";
import { ParticiparBotao } from "../participar-botao";
import {
  EsperaIA,
  FRASES_PENSANDO,
  FRASES_RESUMO,
  LendoEdital,
  type ProgressoLeitura,
} from "../espera-ia";

interface OpcaoFavorita {
  licitacao_id: string;
  rotulo: string;
}

interface MensagemChat {
  role: "user" | "assistant";
  content: string;
}

interface DocumentoAnexado {
  nome: string;
  caracteres: number;
  paginas: number;
  /** inteiro = a IA vê tudo; trechos = documento grande, busca por pergunta. */
  modo: "inteiro" | "trechos";
}

interface ArquivoLicitacao {
  sequencialDocumento: number;
  titulo: string | null;
  tipoDocumentoNome: string | null;
  url: string;
}

interface DocumentoGravadoResposta {
  nome: string;
  paginas: number;
  caracteres_totais: number;
  modo: "inteiro" | "trechos";
  erro?: string;
  /** false quando o PDF ainda tem páginas a ler nesta leitura em faixas. */
  terminou?: boolean;
  proxima_pagina?: number;
  total_paginas?: number;
  paginas_lidas?: number;
}

/** Acima deste tamanho o servidor trabalha por trechos (mesmo valor de lá). */
const LIMITE_DOCUMENTO_INTEIRO = 300_000;

/** Teto de idas ao servidor por documento (o servidor recusa acima de 400
 *  páginas; ~28 páginas por faixa deixa folga suficiente). */
const MAX_FAIXAS_LEITURA = 40;

/** PDF até ~6 MB (o texto extraído é limitado no servidor). */
const MAX_BYTES_PDF = 6 * 1024 * 1024;
/** A IA recebe só o fim da conversa; o histórico completo fica no banco. */
const MAX_MENSAGENS_PARA_IA = 16;

/** Mensagem do usuário que precede um resumo executivo (marcador de fluxo). */
const MARCADOR_RESUMO = "📋 Gerar resumo executivo do edital anexado";

/** Por que resumo, proposta e declarações precisam do edital anexado. */
const MOTIVO_SEM_EDITAL =
  "Anexe o edital: este documento é montado a partir dele.";

/** A resposta é um resumo executivo? (marcador anterior é o sinal confiável;
 *  o texto é reforço para resumos antigos ou gerados de outra forma.) */
function ehResumoExecutivo(
  mensagens: MensagemChat[],
  indice: number,
): boolean {
  if (mensagens[indice - 1]?.content === MARCADOR_RESUMO) return true;
  return /resumo executivo/i.test(mensagens[indice].content.slice(0, 300));
}

export default function PaginaAnalise() {
  return (
    <Suspense fallback={<p className="texto-suave">Carregando...</p>}>
      <ChatAnalise />
    </Suspense>
  );
}

function lerComoBase64(arquivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => {
      const resultado = String(leitor.result ?? "");
      resolve(resultado.slice(resultado.indexOf(",") + 1));
    };
    leitor.onerror = () => reject(new Error("falha ao ler o arquivo"));
    leitor.readAsDataURL(arquivo);
  });
}

function ChatAnalise() {
  const parametros = useSearchParams();
  const preSelecionada = parametros.get("licitacao");

  const [favoritas, setFavoritas] = useState<OpcaoFavorita[]>([]);
  const [participando, setParticipando] = useState<Set<string>>(new Set());
  const [gerandoPlanilha, setGerandoPlanilha] = useState(false);
  /**
   * Se a planilha de materiais é possível nesta licitação. Descoberto ao
   * selecioná-la, para o botão não ficar prometendo o que não vai entregar.
   * null = ainda checando.
   */
  const [statusMateriais, setStatusMateriais] = useState<
    { ok: boolean; motivo: string | null } | null
  >(null);
  const [gerandoModelo, setGerandoModelo] = useState<
    "modelo_proposta" | "modelo_declaracoes" | null
  >(null);
  const [avisoPlanilha, setAvisoPlanilha] = useState<string | null>(null);
  /** Identificação de quem cota, para o topo da planilha. */
  const [nomeEmpresa, setNomeEmpresa] = useState<string | null>(null);
  const [emailUsuario, setEmailUsuario] = useState<string | null>(null);
  const [licitacaoId, setLicitacaoId] = useState<string>(preSelecionada ?? "");
  const [conversaId, setConversaId] = useState<string | null>(null);
  const [mensagens, setMensagens] = useState<MensagemChat[]>([]);
  const [texto, setTexto] = useState("");
  const [pensando, setPensando] = useState(false);
  const [gerandoResumo, setGerandoResumo] = useState(false);
  const [carregandoConversa, setCarregandoConversa] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [documento, setDocumento] = useState<DocumentoAnexado | null>(null);
  const [extraindo, setExtraindo] = useState(false);
  const [arquivos, setArquivos] = useState<ArquivoLicitacao[]>([]);
  const [carregandoArquivos, setCarregandoArquivos] = useState(false);
  const [analisandoSequencial, setAnalisandoSequencial] = useState<
    number | null
  >(null);
  /**
   * Arquivos do PNCP já anexados nesta sessão. Complementa a checagem pelo nome
   * do documento (que o servidor corta em 160 caracteres, então com muitos
   * anexos o nome deixa de conter todos).
   */
  const [anexados, setAnexados] = useState<Set<number>>(new Set());
  const [progresso, setProgresso] = useState<ProgressoLeitura>({
    totalPaginas: null,
    paginasLidas: 0,
    finalizando: false,
  });
  const seletorArquivo = useRef<HTMLInputElement>(null);
  const fimDoChat = useRef<HTMLDivElement>(null);
  /** Licitação para a qual o anexo automático já foi tentado nesta sessão. */
  const autoAnexo = useRef<string | null>(null);

  useEffect(() => {
    async function carregarFavoritas() {
      const supabase = criarClientNavegador();
      const { data } = await supabase
        .from("favoritos")
        .select("licitacao_id, licitacoes ( objeto_compra )")
        .order("created_at", { ascending: false });

      const opcoes = ((data ?? []) as unknown as Array<{
        licitacao_id: string;
        licitacoes: { objeto_compra: string };
      }>).map((f) => ({
        licitacao_id: f.licitacao_id,
        rotulo: f.licitacoes.objeto_compra.slice(0, 90),
      }));
      setFavoritas(opcoes);

      // Para o botão Participar saber se esta licitação já está em Licitando.
      const { data: participacoes } = await supabase
        .from("participacoes")
        .select("licitacao_id");
      setParticipando(
        new Set((participacoes ?? []).map((p) => p.licitacao_id as string)),
      );

      // Identificação da própria empresa, que vai no topo da planilha.
      const { data: { user } } = await supabase.auth.getUser();
      setEmailUsuario(user?.email ?? null);
      const { data: conta } = await supabase
        .from("contas")
        .select("nome_empresa")
        .maybeSingle();
      setNomeEmpresa((conta?.nome_empresa as string) ?? null);
    }
    void carregarFavoritas();
  }, []);

  // Carrega a conversa salva (histórico + documento) da licitação selecionada.
  const carregarConversa = useCallback(async (licitacao: string) => {
    setCarregandoConversa(true);
    setErro(null);
    setConversaId(null);
    setMensagens([]);
    setDocumento(null);
    setAnexados(new Set());

    const supabase = criarClientNavegador();
    let consulta = supabase
      .from("conversas_ia")
      .select("id, documento_nome, documento_caracteres");
    consulta = licitacao
      ? consulta.eq("licitacao_id", licitacao)
      : consulta.is("licitacao_id", null);
    const { data: conversa } = await consulta.maybeSingle();

    if (conversa) {
      setConversaId(conversa.id);
      if (conversa.documento_nome && conversa.documento_caracteres) {
        setDocumento({
          nome: conversa.documento_nome,
          caracteres: conversa.documento_caracteres,
          paginas: 0,
          modo: conversa.documento_caracteres > LIMITE_DOCUMENTO_INTEIRO
            ? "trechos"
            : "inteiro",
        });
      }
      const { data: historico } = await supabase
        .from("mensagens_ia")
        .select("role, conteudo")
        .eq("conversa_id", conversa.id)
        .order("ordem", { ascending: true });
      setMensagens(
        (historico ?? []).map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.conteudo,
        })),
      );
    }
    setCarregandoConversa(false);
  }, []);

  useEffect(() => {
    void carregarConversa(licitacaoId);
  }, [licitacaoId, carregarConversa]);

  // Lista os arquivos publicados no PNCP para a licitação selecionada.
  useEffect(() => {
    setArquivos([]);
    setStatusMateriais(null);
    if (!licitacaoId) return;

    let ativo = true;
    async function carregarArquivos() {
      setCarregandoArquivos(true);
      try {
        const supabase = criarClientNavegador();
        const { data } = await supabase.functions.invoke("analise-ia", {
          body: { acao: "listar_arquivos", licitacao_id: licitacaoId },
        });
        if (ativo) {
          setArquivos(
            ((data as { arquivos?: ArquivoLicitacao[] })?.arquivos ?? []),
          );
        }
      } finally {
        if (ativo) setCarregandoArquivos(false);
      }
    }
    // Ao lado disso, pergunta se a planilha de materiais é possível. Vai numa
    // chamada própria (apenas_checar) que não aciona a IA: só a classificação
    // material/serviço dos itens do PNCP.
    async function checarMateriais() {
      setStatusMateriais(null);
      try {
        const supabase = criarClientNavegador();
        const { data } = await supabase.functions.invoke("analise-ia", {
          body: {
            acao: "planilha_materiais",
            licitacao_id: licitacaoId,
            apenas_checar: true,
          },
        });
        const r = data as { eh_material?: boolean; motivo?: string };
        if (ativo) {
          setStatusMateriais({
            ok: Boolean(r?.eh_material),
            motivo: r?.motivo ?? null,
          });
        }
      } catch {
        // Falha na checagem não bloqueia: o botão tenta e o servidor decide.
        if (ativo) setStatusMateriais({ ok: true, motivo: null });
      }
    }

    void carregarArquivos();
    void checarMateriais();
    return () => {
      ativo = false;
    };
  }, [licitacaoId]);

  useEffect(() => {
    fimDoChat.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens, pensando]);

  // Ao selecionar uma licitação cuja conversa ainda não tem documento, anexa
  // o edital automaticamente (uma tentativa por seleção; quem remover o
  // documento não o vê voltar sozinho). Prefere o arquivo do tipo "Edital".
  useEffect(() => {
    if (
      !licitacaoId || carregandoConversa || carregandoArquivos ||
      documento || extraindo || analisandoSequencial !== null ||
      arquivos.length === 0 || autoAnexo.current === licitacaoId
    ) {
      return;
    }
    autoAnexo.current = licitacaoId;
    const edital = arquivos.find(
      (a) =>
        /edital/i.test(a.tipoDocumentoNome ?? "") ||
        /edital/i.test(a.titulo ?? ""),
    ) ?? arquivos[0];
    void analisarArquivo(edital);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [licitacaoId, carregandoConversa, carregandoArquivos, documento, arquivos]);

  /** Garante a linha da conversa no banco e retorna o id. */
  async function garantirConversa(): Promise<string> {
    if (conversaId) return conversaId;
    const supabase = criarClientNavegador();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("Sessão expirada. Entre novamente.");

    const { data, error } = await supabase
      .from("conversas_ia")
      .insert({ user_id: user.id, licitacao_id: licitacaoId || null })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    setConversaId(data.id);
    return data.id;
  }

  /**
   * A Edge Function devolve a explicação real no corpo JSON mesmo em erro
   * (não-2xx); o supabase-js só expõe uma mensagem genérica. Lê o corpo para
   * mostrar ao usuário o motivo de verdade.
   */
  async function mensagemDaFuncao(
    erroFuncao: unknown,
    fallback: string,
  ): Promise<string> {
    const contexto = (erroFuncao as { context?: Response })?.context;
    try {
      const corpo = await contexto?.json?.();
      if (corpo?.erro) return corpo.erro as string;
    } catch {
      // corpo não-JSON: usa o fallback
    }
    return (erroFuncao as { message?: string })?.message ?? fallback;
  }

  /** Atualiza o estado do chat com o documento gravado no servidor. */
  function refletirDocumento(gravado: DocumentoGravadoResposta) {
    setDocumento({
      nome: gravado.nome,
      caracteres: gravado.caracteres_totais,
      paginas: gravado.paginas,
      modo: gravado.modo,
    });
  }

  /**
   * Lê um arquivo do PNCP e anexa à conversa.
   *
   * PDFs grandes chegam em faixas de página: a função responde
   * `terminou: false` com a próxima página, e chamamos de novo até acabar.
   * Isso existe porque extrair texto é CPU pura e as Edge Functions cortam a
   * requisição em 2s de CPU — um edital de 228 páginas custa ~11s e morria
   * calado antes de responder qualquer coisa.
   */
  /**
   * Este arquivo do PNCP já está no contexto? Dois sinais: o que anexamos nesta
   * sessão e o nome do documento acumulado (que sobrevive a recarregar a
   * página, quando não foi cortado).
   */
  function arquivoJaAnexado(arquivo: ArquivoLicitacao): boolean {
    if (anexados.has(arquivo.sequencialDocumento)) return true;
    const titulo = arquivo.titulo ?? `documento-${arquivo.sequencialDocumento}`;
    return Boolean(documento?.nome.includes(titulo));
  }

  /** Anexa um arquivo do PNCP ao contexto. Devolve false se falhou. */
  async function analisarArquivo(arquivo: ArquivoLicitacao): Promise<boolean> {
    if (analisandoSequencial !== null) return false;
    setErro(null);
    setAnalisandoSequencial(arquivo.sequencialDocumento);
    setProgresso({ totalPaginas: null, paginasLidas: 0, finalizando: false });

    try {
      const supabase = criarClientNavegador();
      const conversa = await garantirConversa();
      let pagina = 1;

      // Teto de voltas: rede é imprevisível e um laço infinito na tela do
      // usuário é pior que uma mensagem de erro.
      for (let volta = 0; volta < MAX_FAIXAS_LEITURA; volta++) {
        const { data, error } = await supabase.functions.invoke("analise-ia", {
          body: {
            acao: "analisar_arquivo",
            licitacao_id: licitacaoId,
            sequencial_documento: arquivo.sequencialDocumento,
            conversa_id: conversa,
            pagina_inicial: pagina,
          },
        });
        if (error) {
          throw new Error(
            await mensagemDaFuncao(error, "não foi possível ler o arquivo"),
          );
        }

        const resposta = data as DocumentoGravadoResposta;
        if (resposta?.erro) throw new Error(resposta.erro);

        if (resposta?.terminou === false) {
          pagina = resposta.proxima_pagina ?? pagina;
          setProgresso({
            totalPaginas: resposta.total_paginas ?? null,
            paginasLidas: resposta.paginas_lidas ?? 0,
            finalizando: false,
          });
          // Última faixa costuma ser a mais lenta (indexação e resumo).
          if (
            resposta.total_paginas &&
            pagina > resposta.total_paginas - 30
          ) {
            setProgresso((p) => ({ ...p, finalizando: true }));
          }
          continue;
        }

        if (!resposta?.nome) {
          throw new Error("não foi possível ler o arquivo");
        }
        refletirDocumento(resposta);
        setAnexados((atual) =>
          new Set(atual).add(arquivo.sequencialDocumento)
        );
        return true;
      }

      throw new Error(
        "o edital é longo demais e a leitura não terminou — use o botão Baixar para abrir o arquivo",
      );
    } catch (excecao) {
      setErro(
        excecao instanceof Error
          ? `Não deu para analisar: ${excecao.message}`
          : "Não deu para analisar o arquivo.",
      );
      return false;
    } finally {
      setAnalisandoSequencial(null);
      setProgresso({ totalPaginas: null, paginasLidas: 0, finalizando: false });
    }
  }

  /**
   * Anexa de uma vez todos os arquivos do PNCP que ainda não estão no contexto.
   *
   * Existe porque a lista com um botão por arquivo convidava a anexar só o
   * primeiro — e edital costuma vir partido (capa, instrumento convocatório,
   * termo de referência, minuta). Anexar só a capa faz o resumo dizer, com
   * razão, que não há informação: ele leu tudo o que recebeu.
   *
   * Um por vez, em série: cada arquivo grande é lido em faixas e o servidor
   * acumula o texto na mesma conversa.
   */
  async function anexarTodosOsArquivos() {
    if (analisandoSequencial !== null) return;
    const pendentes = arquivos.filter((a) => !arquivoJaAnexado(a));
    for (const arquivo of pendentes) {
      // O retorno diz se deu certo; ler o estado `erro` aqui pegaria o valor
      // da renderização anterior.
      const ok = await analisarArquivo(arquivo);
      if (!ok) break;
    }
  }

  async function anexarPdf(evento: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = evento.target.files?.[0];
    evento.target.value = "";
    if (!arquivo) return;

    setErro(null);
    const nomeMinusculo = arquivo.name.toLowerCase();
    if (
      !nomeMinusculo.endsWith(".pdf") &&
      !nomeMinusculo.endsWith(".docx") &&
      !nomeMinusculo.endsWith(".zip")
    ) {
      setErro("Anexe um arquivo PDF, Word (.docx) ou um pacote .zip.");
      return;
    }
    if (arquivo.size > MAX_BYTES_PDF) {
      setErro("Arquivo grande demais — o limite é 6 MB.");
      return;
    }

    setExtraindo(true);
    try {
      const base64 = await lerComoBase64(arquivo);
      const supabase = criarClientNavegador();
      const { data, error } = await supabase.functions.invoke("analise-ia", {
        body: {
          pdf_base64: base64,
          pdf_nome: arquivo.name,
          conversa_id: await garantirConversa(),
        },
      });
      if (error) {
        throw new Error(
          await mensagemDaFuncao(error, "não foi possível ler o arquivo"),
        );
      }
      const gravado = data as DocumentoGravadoResposta;
      if (gravado?.erro || !gravado?.nome) {
        throw new Error(gravado?.erro ?? "não foi possível ler o arquivo");
      }
      refletirDocumento(gravado);
    } catch (excecao) {
      setErro(
        excecao instanceof Error
          ? `Não deu para ler o arquivo: ${excecao.message}`
          : "Não deu para ler o arquivo.",
      );
    } finally {
      setExtraindo(false);
    }
  }

  async function removerDocumento() {
    // Remoção manual: o anexo automático não deve trazer o documento de volta.
    autoAnexo.current = licitacaoId;
    setDocumento(null);
    setAnexados(new Set());
    if (conversaId) {
      const supabase = criarClientNavegador();
      await supabase
        .from("conversas_ia")
        .update({
          documento_nome: null,
          documento_texto: null,
          documento_caracteres: null,
          documento_cabecalho: null,
        })
        .eq("id", conversaId);
      await supabase
        .from("documento_trechos")
        .delete()
        .eq("conversa_id", conversaId);
    }
  }

  async function limparConversa() {
    if (!conversaId) {
      setMensagens([]);
      setDocumento(null);
    setAnexados(new Set());
      return;
    }
    const supabase = criarClientNavegador();
    await supabase.from("conversas_ia").delete().eq("id", conversaId);
    setConversaId(null);
    setMensagens([]);
    setDocumento(null);
    setAnexados(new Set());
    setErro(null);
  }

  /** Gera um resumo executivo do edital anexado (exige documento no contexto). */
  async function gerarResumoExecutivo() {
    if (!licitacaoId || pensando || gerandoResumo) return;
    if (!documento) {
      setErro(
        'É necessário anexar o edital ao contexto da conversa antes de gerar o resumo executivo — use "Anexar ao contexto da conversa" em um arquivo do PNCP, ou "Anexar arquivo (PDF ou Word)".',
      );
      return;
    }

    setErro(null);
    const marcador: MensagemChat = {
      role: "user",
      content: MARCADOR_RESUMO,
    };
    const base = [...mensagens, marcador];
    setMensagens(base);
    setGerandoResumo(true);
    setPensando(true);

    try {
      const supabase = criarClientNavegador();
      const id = await garantirConversa();
      const { data, error } = await supabase.functions.invoke("analise-ia", {
        body: {
          acao: "resumo_executivo",
          conversa_id: id,
          licitacao_id: licitacaoId,
        },
      });
      if (error) {
        throw new Error(
          await mensagemDaFuncao(error, "não foi possível gerar o resumo"),
        );
      }
      const resposta = (data as { resposta?: string })?.resposta;
      if (!resposta) throw new Error("resposta vazia da IA");

      setMensagens([...base, { role: "assistant", content: resposta }]);
      await supabase.from("mensagens_ia").insert([
        { conversa_id: id, role: "user", conteudo: marcador.content },
        { conversa_id: id, role: "assistant", conteudo: resposta },
      ]);
    } catch (excecao) {
      setMensagens(mensagens); // desfaz o marcador em caso de falha
      setErro(
        excecao instanceof Error
          ? `Não foi possível gerar o resumo: ${excecao.message}`
          : "Não foi possível gerar o resumo executivo.",
      );
    } finally {
      setGerandoResumo(false);
      setPensando(false);
    }
  }

  /**
   * Planilha de materiais (.xlsx). Só vale para licitação de compras: quem
   * decide isso é o campo materialOuServico dos itens do PNCP, checado no
   * servidor — se vier serviço, o botão explica em vez de baixar um arquivo
   * vazio.
   */
  async function gerarPlanilhaMateriais() {
    if (!licitacaoId || gerandoPlanilha) return;
    setGerandoPlanilha(true);
    setAvisoPlanilha(null);
    setErro(null);
    try {
      const supabase = criarClientNavegador();
      const { data, error } = await supabase.functions.invoke("analise-ia", {
        body: {
          acao: "planilha_materiais",
          licitacao_id: licitacaoId,
          conversa_id: conversaId,
        },
      });
      if (error) {
        throw new Error(
          await mensagemDaFuncao(error, "não foi possível montar a planilha"),
        );
      }

      const r = data as {
        eh_material?: boolean;
        motivo?: string;
        com_edital?: boolean;
        itens_servico_ignorados?: number;
        orcamento_sigiloso?: boolean;
        licitacao?: {
          numero_controle_pncp?: string;
          objeto?: string;
          municipio?: string;
          uf?: string;
          modalidade?: string;
        };
        cabecalho?: Record<string, string | null>;
        itens?: Array<Record<string, unknown>>;
      };

      if (!r?.eh_material) {
        setAvisoPlanilha(
          r?.motivo ?? "esta licitação não é de materiais, então não há planilha a gerar.",
        );
        return;
      }

      const { gerarPlanilhaMateriais: montar } = await import(
        "@/lib/planilha-xlsx"
      );
      const bytes = montar({
        empresa: nomeEmpresa,
        email: emailUsuario,
        objeto: r.licitacao?.objeto ?? null,
        numeroControlePncp: r.licitacao?.numero_controle_pncp ?? null,
        municipio: r.licitacao?.municipio ?? null,
        uf: r.licitacao?.uf ?? null,
        modalidade: r.licitacao?.modalidade ?? null,
        cabecalho: {
          data_certame: r.cabecalho?.data_certame ?? null,
          data_limite: r.cabecalho?.data_limite ?? null,
          orgao: r.cabecalho?.orgao ?? null,
          local_entrega: r.cabecalho?.local_entrega ?? null,
          prazo_entrega: r.cabecalho?.prazo_entrega ?? null,
          forma_entrega: r.cabecalho?.forma_entrega ?? null,
          registro_preco: r.cabecalho?.registro_preco ?? null,
          forma_pagamento: r.cabecalho?.forma_pagamento ?? null,
          amostra_catalogo: r.cabecalho?.amostra_catalogo ?? null,
        },
        itens: (r.itens ?? []).map((i) => ({
          numero: (i.numero as number) ?? null,
          descricao: (i.descricao as string) ?? null,
          quantidade: (i.quantidade as number) ?? null,
          unidade: (i.unidade as string) ?? null,
          valor_unitario: (i.valor_unitario as number) ?? null,
          valor_total: (i.valor_total as number) ?? null,
        })),
      });

      const blob = new Blob([bytes as BlobPart], {
        type:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `planilha-materiais-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      // O que o usuário precisa saber para conferir antes de cotar.
      const notas: string[] = [`${r.itens?.length ?? 0} itens na planilha.`];
      if (!r.com_edital) {
        notas.push(
          "Sem edital anexado: entrega, pagamento e amostra ficaram em branco — anexe o edital e gere de novo para preenchê-los.",
        );
      }
      if (r.itens_servico_ignorados) {
        notas.push(
          `${r.itens_servico_ignorados} item(ns) de serviço ficaram de fora.`,
        );
      }
      if (r.orcamento_sigiloso) {
        notas.push(
          "Orçamento sigiloso: o órgão não divulga o valor de referência, então essa coluna vem vazia.",
        );
      }
      setAvisoPlanilha(notas.join(" "));
    } catch (excecao) {
      setErro(
        excecao instanceof Error
          ? `Não foi possível montar a planilha: ${excecao.message}`
          : "Não foi possível montar a planilha de materiais.",
      );
    } finally {
      setGerandoPlanilha(false);
    }
  }

  /**
   * Modelos para preencher e assinar (proposta e declarações), em Word.
   *
   * Exigem o edital anexado: os dois seguem o anexo do próprio edital, e
   * apresentar proposta fora do modelo exigido desclassifica.
   */
  async function gerarModelo(acao: "modelo_proposta" | "modelo_declaracoes") {
    if (!licitacaoId || gerandoModelo) return;
    const rotulo = acao === "modelo_proposta" ? "proposta" : "declarações";
    setGerandoModelo(acao);
    setAvisoPlanilha(null);
    setErro(null);
    try {
      const supabase = criarClientNavegador();
      const { data, error } = await supabase.functions.invoke("analise-ia", {
        body: {
          acao,
          conversa_id: conversaId,
          licitacao_id: licitacaoId,
        },
      });
      if (error) {
        throw new Error(
          await mensagemDaFuncao(error, `não foi possível montar a ${rotulo}`),
        );
      }
      const markdown = (data as { markdown?: string })?.markdown;
      if (!markdown) throw new Error("resposta vazia da IA");

      const { gerarDocxDoMarkdown } = await import("@/lib/resumo-docx");
      const bytes = gerarDocxDoMarkdown(markdown);
      const blob = new Blob([bytes as BlobPart], {
        type:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const nome = acao === "modelo_proposta" ? "proposta" : "declaracoes";
      a.download = `${nome}-${new Date().toISOString().slice(0, 10)}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      setAvisoPlanilha(
        acao === "modelo_proposta"
          ? "Proposta baixada em Word. Os campos com __________ são para você preencher, e a planilha de itens veio da API do PNCP — confira contra o anexo do edital antes de enviar."
          : "Declarações baixadas em Word. Confira contra os anexos do edital: algumas precisam ir em folha própria.",
      );
    } catch (excecao) {
      setErro(
        excecao instanceof Error
          ? `Não foi possível montar a ${rotulo}: ${excecao.message}`
          : `Não foi possível montar a ${rotulo}.`,
      );
    } finally {
      setGerandoModelo(null);
    }
  }

  /** Baixa o resumo executivo (markdown) como um arquivo Word (.docx). */
  async function baixarResumoDocx(markdown: string) {
    try {
      const { gerarDocxDoMarkdown } = await import("@/lib/resumo-docx");
      const bytes = gerarDocxDoMarkdown(markdown);
      const blob = new Blob([bytes as BlobPart], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `resumo-executivo-${new Date().toISOString().slice(0, 10)}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setErro("Não foi possível gerar o arquivo Word.");
    }
  }

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    const pergunta = texto.trim();
    if (!pergunta || pensando) return;

    setErro(null);
    setTexto("");
    const novasMensagens: MensagemChat[] = [
      ...mensagens,
      { role: "user", content: pergunta },
    ];
    setMensagens(novasMensagens);
    setPensando(true);

    try {
      const supabase = criarClientNavegador();
      const id = await garantirConversa();
      const { data, error } = await supabase.functions.invoke("analise-ia", {
        body: {
          conversa_id: id,
          licitacao_id: licitacaoId || undefined,
          mensagens: novasMensagens.slice(-MAX_MENSAGENS_PARA_IA),
        },
      });
      if (error) throw new Error(error.message);

      const resposta = (data as { resposta?: string })?.resposta;
      if (!resposta) throw new Error("resposta vazia da IA");
      setMensagens([
        ...novasMensagens,
        { role: "assistant", content: resposta },
      ]);

      // Persiste a troca (pergunta + resposta) na conversa.
      await supabase.from("mensagens_ia").insert([
        { conversa_id: id, role: "user", conteudo: pergunta },
        { conversa_id: id, role: "assistant", conteudo: resposta },
      ]);
    } catch (excecao) {
      setErro(
        excecao instanceof Error
          ? `A IA não respondeu: ${excecao.message}`
          : "A IA não respondeu. Tente novamente.",
      );
    } finally {
      setPensando(false);
    }
  }

  // Estado dos botões de documento: o que depende do edital anexado e o que
  // depende da licitação ser de materiais.
  const semEdital = documento === null;
  const checandoMateriais = Boolean(licitacaoId) && statusMateriais === null;
  const planilhaBloqueada = statusMateriais?.ok === false;
  const pendentes = arquivos.filter((a) => !arquivoJaAnexado(a)).length;
  /**
   * Anexou parte dos arquivos: é a causa mais comum de análise dizendo "não
   * informado no edital" — o resumo leu tudo o que recebeu, e recebeu só a capa.
   */
  const anexoIncompleto = !semEdital && arquivos.length > 1 && pendentes > 0;

  return (
    <>
      <div className="cabecalho-pagina">
        <div>
          <h1>Análise com IA</h1>
          <p className="texto-suave sem-margem">
            Converse sobre uma licitação favorita — a conversa fica salva por
            licitação.
          </p>
        </div>
        {mensagens.length > 0 && (
          <button
            type="button"
            className="botao botao-secundario"
            onClick={limparConversa}
          >
            Limpar conversa
          </button>
        )}
      </div>

      <div className="cartao">
        <div className="campo">
          <label htmlFor="licitacao">Licitação em análise</label>
          <select
            id="licitacao"
            value={licitacaoId}
            onChange={(e) => setLicitacaoId(e.target.value)}
          >
            <option value="">Nenhuma (perguntas gerais sobre licitações)</option>
            {favoritas.map((f) => (
              <option key={f.licitacao_id} value={f.licitacao_id}>
                {f.rotulo}
              </option>
            ))}
          </select>
          {favoritas.length === 0 && (
            <p className="ajuda">
              Você ainda não tem favoritas — marque uma licitação com ★ no{" "}
              <Link href="/painel">painel</Link> para analisá-la aqui.
            </p>
          )}

          {/* Junto do seletor, e não no topo da página: a decisão de disputar
              vem depois de ler a análise desta licitação. */}
          {licitacaoId && (
            <div className="acao-participar">
              <ParticiparBotao
                licitacaoId={licitacaoId}
                participando={participando.has(licitacaoId)}
              />
              <span className="ajuda">
                {participando.has(licitacaoId)
                  ? "Esta licitação já está na aba Licitando."
                  : "Vai disputar? Coloque na aba Licitando para acompanhar os prazos."}
              </span>
            </div>
          )}
        </div>

        {licitacaoId && (
          <div className="campo">
            <label>Arquivos da licitação no PNCP</label>
            {carregandoArquivos && (
              <p className="ajuda">Buscando arquivos no PNCP...</p>
            )}
            {!carregandoArquivos && arquivos.length === 0 && (
              <p className="ajuda">
                Nenhum arquivo disponível no PNCP para esta licitação.
              </p>
            )}
            {/* Edital costuma vir partido (capa, convocatório, TR, minuta).
                Anexar só um deixa a análise cega para o resto, então o caminho
                de anexar tudo fica em primeiro plano. */}
            {arquivos.length > 1 && (
              <p className="linha-anexar-todos">
                <button
                  type="button"
                  className="botao botao-mini"
                  disabled={analisandoSequencial !== null || pendentes === 0}
                  onClick={anexarTodosOsArquivos}
                >
                  {analisandoSequencial !== null
                    ? "Anexando..."
                    : pendentes === 0
                    ? `✓ Todos os ${arquivos.length} arquivos no contexto`
                    : `📎 Anexar todos (${pendentes})`}
                </button>
                <span className="ajuda">
                  O edital vem partido em vários arquivos — a análise só vê o
                  que estiver anexado.
                </span>
              </p>
            )}
            {arquivos.map((arquivo) => {
              const jaAnexado = arquivoJaAnexado(arquivo);
              return (
                <div key={arquivo.sequencialDocumento} className="linha-arquivo">
                  <span className="nome-arquivo">
                    {jaAnexado ? "✅" : "📄"}{" "}
                    {arquivo.titulo ?? `documento-${arquivo.sequencialDocumento}`}
                    {arquivo.tipoDocumentoNome && (
                      <span className="texto-suave">
                        {" "}· {arquivo.tipoDocumentoNome}
                      </span>
                    )}
                  </span>
                  <span className="acoes-arquivo">
                    <a
                      className="botao botao-secundario botao-mini"
                      href={arquivo.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Baixar
                    </a>
                    <button
                      type="button"
                      className="botao botao-secundario botao-mini"
                      disabled={analisandoSequencial !== null || jaAnexado}
                      onClick={() => analisarArquivo(arquivo)}
                    >
                      {analisandoSequencial === arquivo.sequencialDocumento
                        ? "Anexando..."
                        : jaAnexado
                        ? "No contexto"
                        : "Anexar ao contexto da conversa"}
                    </button>
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <div className="campo">
          <label>Documento (opcional)</label>
          <input
            ref={seletorArquivo}
            type="file"
            accept=".pdf,application/pdf,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.zip,application/zip"
            style={{ display: "none" }}
            onChange={anexarPdf}
          />
          {documento ? (
            <p style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span className="etiqueta etiqueta-nova">
                📄 {documento.nome}
                {documento.paginas > 0
                  ? ` (${documento.paginas} pág.)`
                  : ` (${Math.round(documento.caracteres / 1000)} mil caracteres)`}
              </span>
              <button
                type="button"
                className="botao-fantasma"
                disabled={extraindo || analisandoSequencial !== null}
                onClick={() => seletorArquivo.current?.click()}
              >
                {extraindo ? "Lendo arquivo..." : "+ Anexar outro"}
              </button>
              <button
                type="button"
                className="botao-fantasma"
                onClick={removerDocumento}
              >
                Remover todos
              </button>
            </p>
          ) : analisandoSequencial !== null ? (
            <LendoEdital progresso={progresso} />
          ) : (
            <p>
              <button
                type="button"
                className="botao botao-secundario"
                disabled={extraindo}
                onClick={() => seletorArquivo.current?.click()}
              >
                {extraindo ? "Lendo arquivo..." : "Anexar arquivo (PDF, Word ou .zip)"}
              </button>
            </p>
          )}
          {documento?.modo === "trechos" && (
            <p className="ajuda">
              Documento grande: a IA lê o início e busca os trechos relevantes
              a cada pergunta — o documento inteiro está indexado.
            </p>
          )}
        </div>

        {licitacaoId && (
          <div className="campo bloco-resumo">
            {gerandoResumo ? (
              <EsperaIA frases={FRASES_RESUMO} intervaloMs={3400} />
            ) : (
              <>
                <div className="acoes-documento">
                  <button
                    type="button"
                    className="botao"
                    disabled={pensando || semEdital}
                    onClick={gerarResumoExecutivo}
                    title={semEdital ? MOTIVO_SEM_EDITAL : undefined}
                  >
                    📋 Resumo executivo
                  </button>
                  <button
                    type="button"
                    className="botao botao-secundario"
                    disabled={pensando || gerandoPlanilha || checandoMateriais ||
                      planilhaBloqueada}
                    onClick={gerarPlanilhaMateriais}
                    title={planilhaBloqueada
                      ? (statusMateriais?.motivo ?? undefined)
                      : undefined}
                  >
                    {gerandoPlanilha
                      ? "Montando planilha..."
                      : checandoMateriais
                      ? "Verificando itens..."
                      : "📊 Planilha materiais"}
                  </button>
                  <button
                    type="button"
                    className="botao botao-secundario"
                    disabled={pensando || gerandoModelo !== null || semEdital}
                    onClick={() => gerarModelo("modelo_proposta")}
                    title={semEdital ? MOTIVO_SEM_EDITAL : undefined}
                  >
                    {gerandoModelo === "modelo_proposta"
                      ? "Montando proposta..."
                      : "📝 Modelo de proposta"}
                  </button>
                  <button
                    type="button"
                    className="botao botao-secundario"
                    disabled={pensando || gerandoModelo !== null || semEdital}
                    onClick={() => gerarModelo("modelo_declaracoes")}
                    title={semEdital ? MOTIVO_SEM_EDITAL : undefined}
                  >
                    {gerandoModelo === "modelo_declaracoes"
                      ? "Montando declarações..."
                      : "✍️ Modelo de declarações"}
                  </button>
                </div>

                {/* Em texto, e não só no title: no celular não existe hover, e
                    botão desabilitado sem explicação parece defeito. */}
                {semEdital && (
                  <p className="aviso-acao">
                    Anexe o edital acima para liberar resumo, proposta e
                    declarações — os três são montados a partir do documento.
                  </p>
                )}
                {anexoIncompleto && (
                  <p className="aviso-acao">
                    <strong>
                      Faltam {pendentes} de {arquivos.length} arquivos do PNCP.
                    </strong>{" "}
                    A análise só lê o que está anexado — se você gerar agora com
                    apenas a capa, o resumo vai dizer "não informado no edital"
                    na maioria das seções. Use <strong>Anexar todos</strong>{" "}
                    acima antes de gerar.
                  </p>
                )}
                {planilhaBloqueada && (
                  <p className="aviso-acao">
                    <strong>Planilha de materiais indisponível:</strong>{" "}
                    {statusMateriais?.motivo}
                    {statusMateriais?.motivo?.includes("não publicou") &&
                      " — os itens podem estar no PDF do edital, mas quantidade e valor só saem daqui quando o PNCP os publica de forma estruturada."}
                  </p>
                )}
                <p className="ajuda">
                  O resumo estrutura o edital anexado (objeto, habilitação,
                  riscos, questionamentos) e não inventa dados. A planilha sai
                  em Excel com um item por linha e só funciona em licitação de
                  materiais — quantidades e valores de referência vêm da API do
                  PNCP. Proposta e declarações saem em Word, com os campos em
                  branco para preencher, seguindo os anexos do edital.
                </p>
                {avisoPlanilha && <p className="aviso-acao">{avisoPlanilha}</p>}
              </>
            )}
          </div>
        )}

        <div className="chat-janela">
          {carregandoConversa && (
            <p className="texto-suave" style={{ padding: 8 }}>
              Carregando conversa...
            </p>
          )}
          {!carregandoConversa && mensagens.length === 0 && (
            <p className="texto-suave" style={{ padding: 8 }}>
              Exemplos: &quot;Vale a pena participar?&quot; · &quot;Quais itens
              têm maior valor?&quot; · &quot;Que documentos costumam ser
              exigidos numa licitação assim?&quot;
            </p>
          )}
          {mensagens.map((mensagem, indice) => (
            <div
              key={indice}
              className={`chat-msg ${
                mensagem.role === "user" ? "chat-msg-usuario" : "chat-msg-ia"
              }`}
            >
              {mensagem.role === "assistant" ? (
                <>
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      a: (props) => (
                        <a {...props} target="_blank" rel="noreferrer" />
                      ),
                    }}
                  >
                    {mensagem.content}
                  </ReactMarkdown>
                  {ehResumoExecutivo(mensagens, indice) && (
                    <p style={{ marginTop: 10 }}>
                      <button
                        type="button"
                        className="botao botao-secundario botao-mini"
                        onClick={() => baixarResumoDocx(mensagem.content)}
                      >
                        ⬇ Baixar em Word (.docx)
                      </button>
                    </p>
                  )}
                </>
              ) : (
                mensagem.content
              )}
            </div>
          ))}
          {pensando && (
            <EsperaIA frases={FRASES_PENSANDO} compacto intervaloMs={2600} />
          )}
          <div ref={fimDoChat} />
        </div>

        {erro && <p className="mensagem-erro">{erro}</p>}

        <form className="chat-entrada" onSubmit={enviar}>
          <input
            type="text"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Pergunte sobre esta licitação..."
            aria-label="Sua pergunta"
          />
          <button type="submit" className="botao" disabled={pensando}>
            Enviar
          </button>
        </form>

        <p className="aviso-ia">
          A IA pode cometer erros e omitir informações. Confira sempre o edital
          oficial no PNCP antes de decidir participar.
        </p>
      </div>
    </>
  );
}
