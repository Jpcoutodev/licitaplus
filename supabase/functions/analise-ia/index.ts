/**
 * Edge Function `analise-ia` — chat de análise de licitação.
 * Chamada pelo navegador (CORS + JWT). A IA recebe como contexto:
 *   - a licitação selecionada (campos estruturados completos);
 *   - os itens do edital, buscados na API do PNCP (quantidades e valores);
 *   - a lista de favoritas do usuário (para comparações);
 *   - o documento anexado à conversa (edital/TR), que mora no banco:
 *     inteiro quando cabe, ou início + trechos recuperados por pergunta
 *     (busca textual em tsvector) quando é grande.
 *
 * Modos, pelo body:
 *   { acao: "listar_arquivos", licitacao_id }
 *   { acao: "analisar_arquivo", licitacao_id, sequencial_documento, conversa_id }
 *   { pdf_base64, pdf_nome, conversa_id }
 *   { conversa_id?, licitacao_id?, mensagens }   → conversa
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  conversarComIA,
  type DefinicaoFerramenta,
  type MensagemChat,
} from "../_shared/ia/minimax.ts";
import {
  baixarArquivoContratacao,
  buscarItensContratacao,
  buscarPorTermoTextual,
  type ItemContratacaoPNCP,
  listarArquivosContratacao,
} from "../_shared/pncp/cliente.ts";
import type { LicitacaoColetada } from "../_shared/pncp/tipos.ts";
import {
  extrairTextoPdfBytes,
  extrairTextoPdfFaixa,
  MAX_CARACTERES_DOCUMENTO,
} from "../_shared/pdf.ts";
import { extrairTextoDocx, pareceZip } from "../_shared/docx.ts";
import { unzipSync } from "npm:fflate@0.8.2";
import {
  clientServico,
  debitarAnalise,
  lerAssinatura,
} from "../_shared/assinatura.ts";
import { dividirEmTrechos, extrairSumario } from "../_shared/trechos.ts";
import { CABECALHOS_CORS, respostaPreflight } from "../_shared/cors.ts";

/** Máximo de licitações da busca ao vivo entregues à IA por chamada. */
const MAX_ACHADOS_BUSCA = 15;
const MAX_MENSAGENS = 16;
const MAX_TAMANHO_MENSAGEM = 4000;
const MAX_ITENS_NO_CONTEXTO = 40;
const MAX_FAVORITAS_NO_CONTEXTO = 15;
/** ~9 MB de base64 ≈ PDF de 6,5 MB — acima disso a extração é recusada. */
const MAX_BASE64_PDF = 9_000_000;
/** Limite de download de arquivo do PNCP para análise (editais escaneados
 *  chegam a dezenas de MB; a function tem memória para isso). */
const MAX_BYTES_ARQUIVO_PNCP = 40_000_000;
/** Teto de páginas de um PDF do PNCP. Acima disso a leitura exigiria dezenas
 *  de idas e vindas — melhor recusar com franqueza do que arrastar o usuário
 *  por dois minutos de barra de progresso. */
const MAX_PAGINAS_PDF_PNCP = 400;
/** Documento até este tamanho vai INTEIRO para a IA; acima, vira trechos.
 *  M3 comporta ~400k chars num pedido; 300k deixa margem para itens,
 *  favoritas, sumário e histórico. */
const LIMITE_DOCUMENTO_INTEIRO = 300_000;
/** Início do documento sempre enviado no modo trechos. */
const TAMANHO_CABECALHO = 20_000;
const MAX_TRECHOS_POR_PERGUNTA = 12;
const LOTE_INSERT_TRECHOS = 200;

type ClienteSupabase = ReturnType<typeof createClient>;

interface TextoDeArquivo {
  texto: string;
  paginas: number;
  /** Preenchido quando a origem é um pacote .zip: os arquivos lidos de dentro. */
  arquivos?: string[];
}

/** Se veio de um pacote com vários arquivos, deixa isso claro no rótulo. */
function nomeComPacote(base: string, arquivos?: string[]): string {
  if (arquivos && arquivos.length > 1) {
    return `${base} — pacote com ${arquivos.length} arquivos`;
  }
  return base;
}

/** Teto de caracteres combinados ao ler um pacote .zip de anexos. */
const MAX_TEXTO_ZIP = 3_000_000;
/** Teto de arquivos lidos de dentro do zip (evita pacotes patológicos). */
const MAX_ARQUIVOS_ZIP = 40;

/**
 * Extrai texto de um pacote .zip de anexos (comum no PNCP): descompacta e lê
 * os PDFs e DOCX de dentro, concatenando com um cabeçalho por arquivo. Zips
 * aninhados são lidos recursivamente. Lança se nada legível for encontrado.
 */
async function extrairTextoDeArchiveZip(
  bytes: Uint8Array,
  profundidade = 0,
): Promise<TextoDeArquivo> {
  const zip = unzipSync(bytes);
  const nomes = Object.keys(zip)
    .filter((n) => !n.endsWith("/") && !n.startsWith("__MACOSX/"))
    .sort((a, b) => a.localeCompare(b, "pt"));

  const partes: string[] = [];
  const lidosNomes: string[] = [];
  const ignorados: string[] = [];
  let paginas = 0;
  let lidos = 0;
  let total = 0;

  for (const nome of nomes) {
    if (lidos >= MAX_ARQUIVOS_ZIP || total >= MAX_TEXTO_ZIP) break;
    const conteudo = zip[nome];
    const minusculo = nome.toLowerCase();
    const nomeCurto = nome.split("/").pop() || nome;

    try {
      let texto = "";
      if (minusculo.endsWith(".pdf")) {
        const ex = await extrairTextoPdfBytes(conteudo);
        texto = ex.texto;
        paginas += ex.paginas;
      } else if (minusculo.endsWith(".docx")) {
        texto = extrairTextoDocx(conteudo);
      } else if (
        minusculo.endsWith(".zip") && profundidade < 2 && pareceZip(conteudo)
      ) {
        const rec = await extrairTextoDeArchiveZip(conteudo, profundidade + 1);
        texto = rec.texto;
        paginas += rec.paginas;
      } else {
        ignorados.push(nomeCurto);
        continue;
      }

      texto = texto.trim();
      if (!texto) {
        ignorados.push(nomeCurto);
        continue;
      }
      const bloco = `\n\n===== ${nomeCurto} =====\n\n${texto}`;
      partes.push(bloco);
      lidosNomes.push(nomeCurto);
      total += bloco.length;
      lidos++;
    } catch {
      ignorados.push(nomeCurto);
    }
  }

  if (lidos === 0) {
    throw new Error(
      "o pacote compactado não tem PDF nem Word legível dentro (pode conter só planilhas, imagens ou .doc antigo) — use o botão Baixar para abrir os arquivos",
    );
  }

  let combinado = partes.join("").slice(0, MAX_TEXTO_ZIP).trim();
  if (ignorados.length > 0) {
    combinado +=
      `\n\n[Arquivos do pacote não lidos automaticamente: ${ignorados.slice(0, 25).join(", ")}]`;
  }
  return { texto: combinado, paginas, arquivos: lidosNomes };
}

/**
 * Extrai texto de PDF, DOCX ou pacote .zip a partir dos bytes, detectando o
 * formato pela assinatura. Lança Error com mensagem amigável nos casos não
 * suportados (PDF escaneado sem texto, .doc antigo, .xlsx, formato desconhecido).
 */
async function extrairTextoDeArquivo(
  bytes: Uint8Array,
): Promise<TextoDeArquivo> {
  const ehPdf = bytes[0] === 0x25 && bytes[1] === 0x50 &&
    bytes[2] === 0x44 && bytes[3] === 0x46;

  if (ehPdf) {
    const extraido = await extrairTextoPdfBytes(bytes);
    if (!extraido.texto.trim()) {
      throw new Error(
        "este PDF foi escaneado como imagem e não tem texto extraível — ainda não lemos editais escaneados. Use o botão Baixar para abri-lo, ou anexe outro documento da licitação (ex.: o Termo de Referência ou o ETP, que costumam ser digitais)",
      );
    }
    return { texto: extraido.texto, paginas: extraido.paginas };
  }

  if (pareceZip(bytes)) {
    // Um .docx também começa com "PK": tenta como Word primeiro.
    try {
      return { texto: extrairTextoDocx(bytes), paginas: 0 };
    } catch (erro) {
      if (!(erro instanceof Error && erro.message === "nao_docx")) {
        throw new Error("não foi possível ler este arquivo Word");
      }
      // Não é .docx → é um pacote .zip de anexos: lê os PDFs/DOCX de dentro.
    }
    return await extrairTextoDeArchiveZip(bytes);
  }

  // .doc antigo (OLE): D0 CF 11 E0
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf) {
    throw new Error(
      "arquivo .doc antigo não suportado — no Word, salve como PDF ou .docx e anexe pelo botão Anexar",
    );
  }

  throw new Error("formato de arquivo não reconhecido (use PDF ou .docx)");
}

interface LicitacaoContexto {
  id: string;
  numero_controle_pncp: string;
  objeto_compra: string;
  informacao_complementar: string | null;
  valor_total_estimado: number | null;
  data_abertura_proposta: string | null;
  data_encerramento_proposta: string | null;
  orgao_razao_social: string | null;
  unidade_nome: string | null;
  uf: string | null;
  municipio_nome: string | null;
  modalidade_nome: string | null;
  situacao_nome: string | null;
  link_sistema_origem: string | null;
}

interface DocumentoContexto {
  nome: string;
  caracteres: number;
  modo: "inteiro" | "trechos";
  conteudo: string;
  sumario: string;
  trechos: Array<{ ordem: number; conteudo: string }>;
}

interface ArquivoLista {
  titulo: string | null;
  tipoDocumentoNome: string | null;
}

const COLUNAS_CONTEXTO =
  `id, numero_controle_pncp, objeto_compra, informacao_complementar,
   valor_total_estimado, data_abertura_proposta, data_encerramento_proposta,
   orgao_razao_social, unidade_nome, uf, municipio_nome, modalidade_nome,
   situacao_nome, link_sistema_origem`;

// ---------------------------------------------------------------------------
// Ferramentas da IA (function calling) — busca ao vivo no PNCP
// ---------------------------------------------------------------------------

const FERRAMENTAS: DefinicaoFerramenta[] = [
  {
    type: "function",
    function: {
      name: "buscar_licitacoes",
      description:
        "Busca, em tempo real, licitações com propostas ABERTAS agora na base " +
        "oficial do PNCP (Portal Nacional de Contratações Públicas), cobrindo " +
        "todo o Brasil. Use sempre que o usuário pedir para encontrar/pesquisar " +
        "oportunidades ou disser o que a empresa vende. Retorna as licitações " +
        "mais recentes que casam com o termo.",
      parameters: {
        type: "object",
        properties: {
          termo: {
            type: "string",
            description:
              "Palavras-chave do que a empresa fornece (ex.: 'material de " +
              "limpeza', 'serviço de informática', 'merenda escolar').",
          },
          uf: {
            type: "string",
            description:
              "Opcional. Sigla do estado (ex.: SP, RJ, MG) para restringir. " +
              "Omita para buscar no Brasil inteiro.",
          },
        },
        required: ["termo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "favoritar_licitacao",
      description:
        "Adiciona uma licitação aos Favoritos do usuário. Use quando ele pedir " +
        "para favoritar/salvar/guardar uma das licitações que você encontrou " +
        "com buscar_licitacoes. Passe o numero_controle_pncp EXATO retornado " +
        "pela busca (formato CNPJ-1-SEQ/ANO).",
      parameters: {
        type: "object",
        properties: {
          numero_controle_pncp: {
            type: "string",
            description:
              "Número de controle PNCP exato da licitação (ex.: " +
              "'12345678000199-1-000123/2026'), copiado do resultado da busca.",
          },
        },
        required: ["numero_controle_pncp"],
      },
    },
  },
];

/**
 * Grava no banco as licitações achadas pela busca da IA (best-effort), para
 * que possam ser favoritadas. Usa a service role APENAS neste upsert — a
 * escrita em `licitacoes` (dado compartilhado) é restrita ao servidor.
 * ignoreDuplicates: nunca rebaixa um registro completo vindo da varredura.
 */
async function persistirAchados(achados: LicitacaoColetada[]): Promise<void> {
  try {
    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    await service.from("licitacoes").upsert(achados, {
      onConflict: "numero_controle_pncp",
      ignoreDuplicates: true,
    });
  } catch {
    // best-effort: a busca continua útil mesmo sem persistir
  }
}

async function ferramentaBuscar(
  args: Record<string, unknown>,
): Promise<string> {
  const termo = typeof args.termo === "string" ? args.termo.trim() : "";
  if (!termo) return "Informe um termo de busca (o que a empresa vende).";
  const uf = typeof args.uf === "string" && args.uf.trim()
    ? args.uf.trim().toUpperCase().slice(0, 2)
    : undefined;

  try {
    const achados = await buscarPorTermoTextual(termo, uf);
    if (!achados || achados.length === 0) {
      return `Nenhuma licitação com propostas abertas encontrada para "${termo}"${
        uf ? ` em ${uf}` : " no Brasil"
      } neste momento.`;
    }
    const recorte = achados.slice(0, MAX_ACHADOS_BUSCA);
    await persistirAchados(recorte);
    return formatarAchadosPncp(recorte);
  } catch (erro) {
    return `Não foi possível consultar o PNCP agora: ${
      erro instanceof Error ? erro.message : "erro"
    }.`;
  }
}

async function ferramentaFavoritar(
  supabase: ClienteSupabase,
  userId: string,
  args: Record<string, unknown>,
): Promise<string> {
  const numero = typeof args.numero_controle_pncp === "string"
    ? args.numero_controle_pncp.trim()
    : "";
  if (!numero) {
    return "Informe o numero_controle_pncp exato da licitação (copiado do resultado da busca).";
  }

  const { data: licitacao } = await supabase
    .from("licitacoes")
    .select("id, objeto_compra")
    .eq("numero_controle_pncp", numero)
    .maybeSingle();
  if (!licitacao) {
    return `Licitação ${numero} não encontrada na base. Refaça a busca (buscar_licitacoes) e use o Controle PNCP exato de um dos resultados.`;
  }

  const { error } = await supabase
    .from("favoritos")
    .insert({ user_id: userId, licitacao_id: licitacao.id });
  if (error) {
    if (error.code === "23505") {
      return `A licitação ${numero} já estava nos Favoritos do usuário.`;
    }
    return `Não foi possível favoritar: ${error.message}`;
  }
  return `Favoritada com sucesso: "${
    String(licitacao.objeto_compra).slice(0, 120)
  }" (${numero}). Ela já aparece na aba Favoritos e pode ser selecionada em "Licitação em análise" para análise detalhada.`;
}

/** Cria o executor de ferramentas com o contexto do usuário da requisição. */
function criarExecutorFerramentas(
  supabase: ClienteSupabase,
  userId: string,
): (nome: string, args: Record<string, unknown>) => Promise<string> {
  const service = clientServico();
  return async (nome, args) => {
    const inicio = Date.now();
    if (nome === "buscar_licitacoes") {
      const resultado = await ferramentaBuscar(args);
      const encontradas = Number.parseInt(resultado, 10);
      await registrarEvento(service, {
        user_id: userId,
        acao: "busca_ia",
        sucesso: !resultado.startsWith("Não foi possível"),
        detalhes: {
          termo: typeof args.termo === "string" ? args.termo : null,
          uf: typeof args.uf === "string" ? args.uf : null,
          resultados: Number.isFinite(encontradas) ? encontradas : 0,
        },
        duracao_ms: Date.now() - inicio,
      });
      return resultado;
    }
    if (nome === "favoritar_licitacao") {
      const resultado = await ferramentaFavoritar(supabase, userId, args);
      await registrarEvento(service, {
        user_id: userId,
        acao: "favoritar_ia",
        sucesso: resultado.startsWith("Favoritada") ||
          resultado.includes("já estava"),
        detalhes: {
          numero_controle: typeof args.numero_controle_pncp === "string"
            ? args.numero_controle_pncp
            : null,
        },
        duracao_ms: Date.now() - inicio,
      });
      return resultado;
    }
    return `ferramenta desconhecida: ${nome}`;
  };
}

function formatarAchadosPncp(achados: LicitacaoColetada[]): string {
  const cabecalho =
    `${achados.length} licitação(ões) com propostas abertas encontradas no PNCP:\n`;
  const corpo = achados
    .map((l, i) =>
      [
        `${i + 1}. ${(l.objeto_compra ?? "?").slice(0, 200)}`,
        `   Órgão: ${l.orgao_razao_social ?? "?"} — ${l.municipio_nome ?? "?"}/${l.uf ?? "?"}`,
        `   Modalidade: ${l.modalidade_nome ?? "?"} | Valor estimado: ${l.valor_total_estimado ?? "não informado"}`,
        `   Publicada em: ${l.data_publicacao_pncp ?? "?"} | Controle PNCP: ${l.numero_controle_pncp}`,
        `   Link: ${l.link_sistema_origem ?? "—"}`,
      ].join("\n")
    )
    .join("\n\n");
  return cabecalho + corpo;
}

/** Registra um evento de telemetria da IA (best-effort, nunca derruba a operação). */
async function registrarEvento(
  service: ClienteSupabase,
  evento: {
    user_id: string;
    acao: string;
    sucesso: boolean;
    conversa_id?: string | null;
    licitacao_id?: string | null;
    erro?: string | null;
    detalhes?: Record<string, unknown> | null;
    duracao_ms?: number;
  },
): Promise<void> {
  try {
    await service.from("ia_eventos").insert(evento);
  } catch {
    // telemetria é secundária
  }
}

Deno.serve(async (req) => {
  const preflight = respostaPreflight(req);
  if (preflight) return preflight;
  const inicioReq = Date.now();

  try {
    const corpo = await req.json().catch(() => ({}));

    // Client com o token do usuário: RLS limita tudo ao dono.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization") ?? "" },
        },
      },
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return respostaJson({ erro: "não autenticado" }, 401);

    // Plano/trial: conta expirada não usa a IA; anexar documento debita 1
    // análise (o resumo executivo do documento anexado está incluído).
    const service = clientServico();
    const assinatura = await lerAssinatura(service, user.id, user.email ?? null);

    // Toda ação que chama a IA entra na telemetria com o próprio nome: é por
    // ela que a aba Métricas acompanha o custo de IA.
    const ACOES_NOMEADAS = new Set([
      "resumo_executivo",
      "planilha_materiais",
      "modelo_proposta",
      "modelo_declaracoes",
    ]);
    const acaoLog = corpo?.acao === "analisar_arquivo"
      ? "anexar_pncp"
      : typeof corpo?.acao === "string" && ACOES_NOMEADAS.has(corpo.acao)
        ? corpo.acao
        : typeof corpo?.pdf_base64 === "string"
          ? "anexar_upload"
          : "conversa";
    const idsLog = {
      conversa_id: typeof corpo?.conversa_id === "string" ? corpo.conversa_id : null,
      licitacao_id: typeof corpo?.licitacao_id === "string" ? corpo.licitacao_id : null,
    };

    if (assinatura.estado === "expirado") {
      await registrarEvento(service, {
        user_id: user.id,
        acao: acaoLog,
        sucesso: false,
        ...idsLog,
        erro: "conta expirada",
        duracao_ms: Date.now() - inicioReq,
      });
      return respostaJson(
        { erro: "Seu período de teste terminou. Assine um plano para continuar usando a análise com IA." },
        402,
      );
    }

    if (corpo?.acao === "listar_arquivos") {
      return await modoListarArquivos(supabase, corpo);
    }


    const ehAnaliseNova = corpo?.acao === "analisar_arquivo" ||
      typeof corpo?.pdf_base64 === "string";

    /**
     * A conversa já tinha documento antes desta chamada?
     *
     * Importa para a cobrança: o app anexa automaticamente TODOS os arquivos do
     * PNCP ao abrir a licitação, e edital costuma vir partido em vários (capa,
     * convocatório, termo de referência, minuta, anexos). Cobrar por arquivo
     * faria uma licitação consumir cinco das dez análises do teste grátis. A
     * unidade cobrada é a licitação analisada: o primeiro anexo debita, os
     * demais completam o mesmo contexto.
     */
    let jaTinhaDocumento = false;
    if (ehAnaliseNova && typeof corpo?.conversa_id === "string") {
      const { data: anterior } = await supabase
        .from("conversas_ia")
        .select("documento_texto")
        .eq("id", corpo.conversa_id)
        .maybeSingle();
      jaTinhaDocumento = Boolean(anterior?.documento_texto);
    }
    // Só a primeira peça do edital passa pelo teto: barrar a segunda deixaria o
    // contexto pela metade depois de já ter debitado a análise.
    if (
      ehAnaliseNova && !jaTinhaDocumento && assinatura.estado !== "admin" &&
      assinatura.usadas >= assinatura.limite
    ) {
      await registrarEvento(service, {
        user_id: user.id,
        acao: acaoLog,
        sucesso: false,
        ...idsLog,
        erro: `limite de análises atingido (${assinatura.usadas}/${assinatura.limite}, ${assinatura.estado})`,
        duracao_ms: Date.now() - inicioReq,
      });
      return respostaJson(
        {
          erro: assinatura.estado === "trial"
            ? `Você usou as ${assinatura.limite} análises do teste grátis. Assine um plano para continuar analisando editais.`
            : `Você atingiu o limite de ${assinatura.limite} análises deste mês no seu plano.`,
        },
        402,
      );
    }

    let resposta: Response;
    if (corpo?.acao === "analisar_arquivo") {
      resposta = await modoAnalisarArquivo(supabase, corpo);
    } else if (corpo?.acao === "resumo_executivo") {
      resposta = await modoResumoExecutivo(supabase, corpo);
    } else if (corpo?.acao === "planilha_materiais") {
      // Os números vêm da API do PNCP, não da IA; só o cabeçalho (entrega,
      // pagamento, amostra) sai do edital, quando anexado.
      resposta = await modoPlanilhaMateriais(supabase, corpo);
    } else if (
      corpo?.acao === "modelo_proposta" || corpo?.acao === "modelo_declaracoes"
    ) {
      // Documentos para preencher e assinar, conforme os anexos do edital.
      resposta = await modoDocumentoModelo(supabase, corpo, corpo.acao);
    } else if (typeof corpo?.pdf_base64 === "string") {
      resposta = await modoPdfAnexado(supabase, corpo);
    } else {
      resposta = await modoConversa(supabase, corpo, user.id);
    }

    // Leitura de PDF grande chega em várias faixas: só a última conclui o
    // documento. Debitar e registrar em cada faixa cobraria uma dúzia de
    // análises por edital e encheria a telemetria de ruído.
    let parcial = false;
    try {
      parcial = (await resposta.clone().json())?.terminou === false;
    } catch {
      parcial = false;
    }
    if (parcial) return resposta;

    if (
      ehAnaliseNova && !jaTinhaDocumento && resposta.status === 200 &&
      assinatura.estado !== "admin"
    ) {
      await debitarAnalise(service, user.id);
    }

    // Telemetria: o que aconteceu, com o motivo real em caso de falha.
    let erroLog: string | null = null;
    let detalhesLog: Record<string, unknown> | null = null;
    try {
      const corpoResp = await resposta.clone().json();
      if (resposta.status !== 200) {
        erroLog = (corpoResp?.erro as string) ?? `http ${resposta.status}`;
      } else if (acaoLog === "anexar_pncp" || acaoLog === "anexar_upload") {
        detalhesLog = {
          nome: corpoResp?.nome ?? null,
          paginas: corpoResp?.paginas ?? null,
          caracteres: corpoResp?.caracteres_totais ?? null,
          modo: corpoResp?.modo ?? null,
        };
      } else {
        detalhesLog = {
          caracteres_resposta: typeof corpoResp?.resposta === "string"
            ? corpoResp.resposta.length
            : null,
        };
      }
    } catch {
      // corpo não-JSON: registra só o status
      if (resposta.status !== 200) erroLog = `http ${resposta.status}`;
    }
    await registrarEvento(service, {
      user_id: user.id,
      acao: acaoLog,
      sucesso: resposta.status === 200,
      ...idsLog,
      erro: erroLog,
      detalhes: detalhesLog,
      duracao_ms: Date.now() - inicioReq,
    });
    return resposta;
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    console.error(JSON.stringify({ funcao: "analise-ia", erro: mensagem }));
    return respostaJson({ erro: mensagem }, 500);
  }
});

// ---------------------------------------------------------------------------
// Modos
// ---------------------------------------------------------------------------

async function modoListarArquivos(
  supabase: ClienteSupabase,
  corpo: Record<string, unknown>,
): Promise<Response> {
  const licitacao = await carregarLicitacao(supabase, corpo?.licitacao_id);
  if (!licitacao) {
    return respostaJson({ erro: "licitação não encontrada" }, 404);
  }
  const arquivos = await listarArquivosContratacao(
    licitacao.numero_controle_pncp,
  );
  return respostaJson({ arquivos: arquivos ?? [] }, 200);
}

/** Campos do cabeçalho da planilha que só o edital informa. */
const CAMPOS_DO_EDITAL = [
  "data_certame",
  "local_entrega",
  "prazo_entrega",
  "forma_entrega",
  "registro_preco",
  "forma_pagamento",
  "amostra_catalogo",
] as const;

const INSTRUCOES_PLANILHA =
  `Você extrai dados de um edital de licitação para preencher o cabeçalho de uma
planilha de cotação de materiais.

Responda APENAS com JSON válido, sem cercas de código, exatamente neste formato:
{"data_certame": string|null, "local_entrega": string|null, "prazo_entrega":
string|null, "forma_entrega": string|null, "registro_preco": string|null,
"forma_pagamento": string|null, "amostra_catalogo": string|null}

O que cada campo é:
- data_certame: data e hora da sessão pública de disputa, como está no edital.
- local_entrega: onde os materiais devem ser entregues (endereço ou unidade).
- prazo_entrega: prazo para entregar depois do pedido/empenho (ex.: "10 dias
  corridos da ordem de fornecimento").
- forma_entrega: parcelada, integral, sob demanda, cronograma.
- registro_preco: "Sim — Sistema de Registro de Preços" ou "Não", conforme o
  edital; inclua a vigência da ata se disser.
- forma_pagamento: prazo e condição de pagamento.
- amostra_catalogo: se exige amostra, catálogo, prospecto ou laudo — e quando
  deve ser apresentado.

REGRAS:
- Use SOMENTE o texto do edital fornecido. NUNCA invente, estime ou deduza.
- Campo que o edital não trata: null. Não escreva "não informado", use null.
- Seja curto e literal: uma frase por campo, sem comentários.`;

/**
 * Planilha de materiais: dados estruturados para o navegador montar o .xlsx.
 *
 * Divisão de trabalho deliberada, igual à do extrator de contatos: os NÚMEROS
 * (item, quantidade, unidade, valor de referência) vêm da API de itens do PNCP,
 * nunca da IA — errar uma quantidade aqui é errar a proposta. A IA só lê o
 * edital para o cabeçalho qualitativo (entrega, pagamento, amostra), e só
 * quando há edital anexado à conversa.
 *
 * "É licitação de materiais?" também não é palpite: cada item do PNCP traz
 * materialOuServico ("M" ou "S").
 */
async function modoPlanilhaMateriais(
  supabase: ClienteSupabase,
  corpo: Record<string, unknown>,
): Promise<Response> {
  const licitacao = await carregarLicitacao(supabase, corpo?.licitacao_id);
  if (!licitacao) {
    return respostaJson({ erro: "licitação não encontrada" }, 404);
  }

  const itens = await buscarItensContratacao(licitacao.numero_controle_pncp);
  if (!itens || itens.length === 0) {
    return respostaJson({
      eh_material: false,
      motivo:
        "o PNCP não publicou a lista de itens desta licitação, então não há o que planilhar",
    }, 200);
  }

  const materiais = itens.filter((i) => i.materialOuServico === "M");
  const servicos = itens.length - materiais.length;
  if (materiais.length === 0) {
    return respostaJson({
      eh_material: false,
      motivo:
        "esta licitação é de serviços: nenhum dos itens do PNCP está classificado como material",
    }, 200);
  }

  // A tela pergunta "dá para gerar?" ao selecionar a licitação, para o botão já
  // nascer habilitado ou explicado. Mesma regra, sem custo de IA: a resposta
  // sai aqui, antes de qualquer leitura do edital.
  if (corpo?.apenas_checar === true) {
    return respostaJson({
      eh_material: true,
      itens_material: materiais.length,
      itens_servico_ignorados: servicos,
    }, 200);
  }

  // Cabeçalho: o que o PNCP sabe entra direto.
  const cabecalho: Record<string, string | null> = {
    data_certame: null,
    data_limite: licitacao.data_encerramento_proposta ?? null,
    orgao: [licitacao.orgao_razao_social, licitacao.unidade_nome]
      .filter(Boolean)
      .join(" — ") || null,
    local_entrega: null,
    prazo_entrega: null,
    forma_entrega: null,
    registro_preco: null,
    forma_pagamento: null,
    amostra_catalogo: null,
  };

  // O resto sai do edital anexado, se houver.
  let comEdital = false;
  const conversaId = await validarConversa(supabase, corpo?.conversa_id);
  if (conversaId) {
    const { data: conversa } = await supabase
      .from("conversas_ia")
      .select("documento_texto")
      .eq("id", conversaId)
      .maybeSingle();
    const texto = conversa?.documento_texto as string | null;
    if (texto && texto.length > 0) {
      comEdital = true;
      try {
        const bruto = await conversarComIA(
          [
            { role: "system", content: INSTRUCOES_PLANILHA },
            {
              role: "user",
              content: `Edital:\n\n${texto.slice(0, MAX_DOC_RESUMO)}`,
            },
          ],
          800,
        );
        const limpo = bruto.replace(/```json|```/g, "").trim();
        const inicio = limpo.indexOf("{");
        const fim = limpo.lastIndexOf("}");
        if (inicio >= 0 && fim > inicio) {
          const extraido = JSON.parse(limpo.slice(inicio, fim + 1)) as Record<
            string,
            unknown
          >;
          for (const campo of CAMPOS_DO_EDITAL) {
            const valor = extraido[campo];
            if (typeof valor === "string" && valor.trim().length > 0) {
              cabecalho[campo] = valor.trim();
            }
          }
        }
      } catch (erro) {
        // Cabeçalho incompleto não impede a planilha: os itens são o essencial.
        console.error(
          JSON.stringify({
            funcao: "analise-ia",
            acao: "planilha_materiais",
            erro: erro instanceof Error ? erro.message : String(erro),
          }),
        );
      }
    }
  }

  return respostaJson({
    eh_material: true,
    com_edital: comEdital,
    itens_servico_ignorados: servicos,
    // Orçamento sigiloso: o valor de referência vem zerado/nulo por decisão do
    // órgão, não por falha da coleta — a planilha deixa a coluna vazia.
    orcamento_sigiloso: materiais.some((i) => i.orcamentoSigiloso === true),
    licitacao: {
      numero_controle_pncp: licitacao.numero_controle_pncp,
      objeto: licitacao.objeto_compra,
      municipio: licitacao.municipio_nome,
      uf: licitacao.uf,
      modalidade: licitacao.modalidade_nome,
    },
    cabecalho,
    itens: materiais.map((i) => ({
      numero: i.numeroItem,
      descricao: i.descricao,
      quantidade: i.quantidade,
      unidade: i.unidadeMedida,
      valor_unitario: i.orcamentoSigiloso ? null : i.valorUnitarioEstimado,
      valor_total: i.orcamentoSigiloso ? null : i.valorTotal,
    })),
  }, 200);
}

const MARCADOR_TABELA = "{{TABELA_ITENS}}";

const INSTRUCOES_MODELO_PROPOSTA =
  `Você é um consultor sênior em licitações públicas (Lei 14.133/2021). Monte a
PROPOSTA COMERCIAL da licitante seguindo o modelo de proposta (anexo) do edital
anexado, em markdown, pronta para o fornecedor preencher, imprimir e assinar.

REGRA ABSOLUTA — NÃO INVENTE NADA:
- A estrutura e as exigências saem do próprio edital. Se o edital tiver um anexo
  "modelo de proposta", siga a ordem e os campos DELE.
- Nunca preencha dados da licitante nem preços: deixe "__________" para o
  fornecedor completar.
- Se o edital não tratar de um ponto, escreva "não informado no edital" na
  seção de regras, e não crie exigência que não existe.

FORMATO (markdown, nesta ordem):

# Proposta Comercial
Linha com modalidade, número do certame e órgão.

## Identificação da Licitante
Campos em branco para preencher: razão social, CNPJ, inscrição estadual/
municipal, endereço, telefone, email, dados bancários, representante legal com
CPF e cargo. Um por linha, no formato "**Campo:** __________".

## Objeto da Proposta
Duas ou três linhas com o que está sendo ofertado, conforme o objeto do edital.

## Planilha de Preços
Escreva EXATAMENTE a linha ${MARCADOR_TABELA} nesta seção, sozinha, sem tabela
nenhuma em volta. A tabela de itens é inserida pelo sistema a partir dos dados
oficiais do PNCP — você NÃO deve escrever itens, quantidades nem valores.

## Declarações que acompanham esta proposta
Bullets curtos com o que o edital manda a licitante declarar DENTRO da proposta
(ex.: que os preços incluem tributos, fretes e encargos; que a proposta é válida
por N dias; que aceita as condições do edital).

## Regras do Edital para a Proposta
Bullets com o que o edital exige na forma de apresentar a proposta: prazo de
validade, prazo de entrega ou execução, o que deve estar incluído no preço,
número de casas decimais, se admite cotação parcial ou por lote, se exige
planilha de custos ou composição de BDI, se exige papel timbrado ou assinatura
digital, e o que causa desclassificação. Cite o item do edital quando aparecer.

## Local, Data e Assinatura
Linhas em branco para cidade, data, assinatura, nome e cargo do representante.

Não use itálico nem sublinhado como formatação: os campos em branco já usam
underscores, e misturar os dois embaralha o documento.`;

const INSTRUCOES_MODELO_DECLARACOES =
  `Você é um consultor sênior em licitações públicas (Lei 14.133/2021). Monte o
documento de DECLARAÇÕES que o edital anexado exige da licitante, em markdown,
pronto para o fornecedor preencher, imprimir e assinar.

REGRA ABSOLUTA — NÃO INVENTE NADA:
- Inclua APENAS as declarações que o edital exige. Se o edital traz um anexo com
  modelo de declaração, siga o texto e a ordem dele.
- Nunca preencha dados da licitante: deixe "__________".
- Não invente exigência, artigo de lei nem número de anexo. Cite dispositivo
  legal só quando o edital citar, e do jeito que ele citar.

FORMATO (markdown):

# Declarações
Linha com modalidade, número do certame e órgão.

## Identificação da Licitante
"**Razão social:** __________", "**CNPJ:** __________", "**Representante
legal:** __________", "**CPF:** __________" — um por linha.

Depois, uma seção "## " por declaração exigida, com o título da declaração e, no
corpo, o texto pronto para assinar, na primeira pessoa da empresa ("Declaro,
sob as penas da lei, que..."), com "__________" onde o fornecedor preenche.
Ao final de cada uma, se o edital exigir aquela declaração em documento
separado, acrescente um bullet começando com "**Observação:**" avisando que ela
vai em folha própria.

Não use itálico nem sublinhado como formatação: os campos em branco já usam
underscores, e misturar os dois embaralha o documento.

Encerre com:

## Local, Data e Assinatura
Linhas em branco para cidade, data, assinatura, nome e cargo.

Se o edital não listar nenhuma declaração obrigatória, responda apenas com
"# Declarações" e uma linha dizendo que o edital não relaciona declarações
próprias, orientando conferir a plataforma do certame.`;

/** Tabela markdown dos itens, com as colunas de preço em branco para preencher. */
function tabelaItensMarkdown(itens: ItemContratacaoPNCP[]): string {
  const cabecalho =
    "| Item | Descrição | Qtd | Unidade | Valor unit. de referência | Valor unit. ofertado | Valor total ofertado |";
  const separador = "| --- | --- | --- | --- | --- | --- | --- |";
  const linhas = itens.map((i) => {
    const ref = i.orcamentoSigiloso || i.valorUnitarioEstimado === null
      ? "sigiloso"
      : i.valorUnitarioEstimado.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
      });
    const descricao = (i.descricao ?? "").replace(/\|/g, "/").slice(0, 400);
    return `| ${i.numeroItem} | ${descricao} | ${i.quantidade ?? ""} | ${
      i.unidadeMedida ?? ""
    } | ${ref} | __________ | __________ |`;
  });
  return [cabecalho, separador, ...linhas].join("\n");
}

/**
 * Modelos de proposta e de declarações, em markdown para o navegador converter
 * em .docx (mesmo caminho do resumo executivo).
 *
 * Os dois exigem o edital anexado, e isso não é limitação técnica: proposta
 * fora do modelo do anexo é motivo de desclassificação, então gerar um "modelo
 * genérico" sem ler o edital seria entregar um risco embalado de documento.
 *
 * Na proposta, a IA não escreve a planilha de itens: ela deixa um marcador e o
 * servidor injeta a tabela vinda da API do PNCP. Quantidade errada em proposta
 * é proposta perdida.
 */
async function modoDocumentoModelo(
  supabase: ClienteSupabase,
  corpo: Record<string, unknown>,
  acao: "modelo_proposta" | "modelo_declaracoes",
): Promise<Response> {
  const conversaId = await validarConversa(supabase, corpo?.conversa_id);
  if (!conversaId) {
    return respostaJson({ erro: "conversa não encontrada" }, 404);
  }

  const { data: conversa } = await supabase
    .from("conversas_ia")
    .select("documento_nome, documento_texto")
    .eq("id", conversaId)
    .maybeSingle();

  const texto = conversa?.documento_texto as string | null;
  if (!texto || texto.length === 0) {
    return respostaJson({
      erro:
        "anexe o edital primeiro: o documento é montado conforme o anexo do próprio edital, e apresentar proposta ou declaração fora do modelo exigido é motivo de desclassificação",
    }, 400);
  }

  const licitacao = await carregarLicitacao(supabase, corpo?.licitacao_id);
  const ehProposta = acao === "modelo_proposta";

  const blocos = [
    ehProposta ? INSTRUCOES_MODELO_PROPOSTA : INSTRUCOES_MODELO_DECLARACOES,
  ];
  if (licitacao) {
    blocos.push(
      `## Dados oficiais da licitação (PNCP)\n${formatarLicitacao(licitacao)}`,
    );
  }
  blocos.push(
    `## Edital anexado: "${conversa?.documento_nome ?? "edital"}"\n${
      texto.slice(0, MAX_DOC_RESUMO)
    }`,
  );

  // O eco do contexto sai ANTES de injetar a planilha: cortar depois levaria a
  // tabela junto, porque o corte vai do título ecoado até o fim.
  let markdown = removerEcoDoContexto(
    await conversarComIA(
      [
        { role: "system", content: blocos.join("\n\n") },
        {
          role: "user",
          content: ehProposta
            ? "Monte a proposta comercial conforme o modelo do edital."
            : "Monte as declarações exigidas por este edital.",
        },
      ],
      4096,
    ),
  );

  if (ehProposta) {
    const itens = licitacao
      ? await buscarItensContratacao(licitacao.numero_controle_pncp)
      : null;
    const tabela = itens && itens.length > 0
      ? tabelaItensMarkdown(itens)
      : "**Atenção:** os itens não estão publicados na API do PNCP — transcreva a planilha do próprio edital.";
    markdown = markdown.includes(MARCADOR_TABELA)
      ? markdown.replaceAll(MARCADOR_TABELA, tabela)
      // A IA ignorou o marcador: acrescenta a tabela oficial no fim, para a
      // proposta não sair sem planilha de preços.
      : `${markdown}\n\n## Planilha de Preços\n${tabela}`;
  }

  return respostaJson({ markdown }, 200);
}

async function modoAnalisarArquivo(
  supabase: ClienteSupabase,
  corpo: Record<string, unknown>,
): Promise<Response> {
  const licitacao = await carregarLicitacao(supabase, corpo?.licitacao_id);
  if (!licitacao) {
    return respostaJson({ erro: "licitação não encontrada" }, 404);
  }
  const conversaId = await validarConversa(supabase, corpo?.conversa_id);
  if (!conversaId) {
    return respostaJson({ erro: "conversa não encontrada" }, 404);
  }

  const arquivos = await listarArquivosContratacao(
    licitacao.numero_controle_pncp,
  );
  const arquivo = arquivos?.find(
    (a) => a.sequencialDocumento === corpo?.sequencial_documento,
  );
  if (!arquivo) {
    return respostaJson({ erro: "arquivo não encontrado no PNCP" }, 404);
  }

  const download = await baixarArquivoContratacao(
    arquivo.url,
    MAX_BYTES_ARQUIVO_PNCP,
  );
  if (!download.ok) {
    if (download.motivo === "grande") {
      const mb = Math.round(download.bytesTotais / 1_000_000);
      return respostaJson(
        {
          erro:
            `o arquivo tem ${mb} MB — acima do limite de ${MAX_BYTES_ARQUIVO_PNCP / 1_000_000} MB para análise. Use o botão Baixar para abri-lo no computador.`,
        },
        400,
      );
    }
    return respostaJson(
      { erro: "o PNCP não respondeu ao baixar o arquivo — tente novamente em alguns instantes" },
      502,
    );
  }

  const nomeArquivo = arquivo.titulo ??
    `documento-${arquivo.sequencialDocumento}`;

  // PDF direto: leitura em faixas de página, retomável. Zip e Word continuam
  // de uma vez só — são bem menores e não estouram o orçamento de CPU.
  if (ehPdf(download.bytes)) {
    return await lerPdfEmFaixas(
      supabase,
      conversaId,
      download.bytes,
      nomeArquivo,
      Number(corpo?.pagina_inicial) || 1,
    );
  }

  try {
    const extraido = await extrairTextoDeArquivo(download.bytes);
    const nome = nomeComPacote(nomeArquivo, extraido.arquivos);
    const resumo = await gravarDocumentoNaConversa(
      supabase,
      conversaId,
      nome,
      extraido.texto,
      extraido.paginas,
    );
    return respostaJson({ ...resumo, terminou: true }, 200);
  } catch (erro) {
    if (erro instanceof Error && erro.message.startsWith("Falha ao")) throw erro;
    return respostaJson(
      { erro: erro instanceof Error ? erro.message : "não foi possível ler o arquivo" },
      400,
    );
  }
}

/**
 * Lê uma faixa de páginas do PDF e guarda o que leu em `documento_parcial`.
 *
 * O rascunho fica numa coluna própria para não encostar no documento vigente:
 * quem já tinha um edital anexado continua com ele até a nova leitura
 * terminar, e a junção dos dois acontece normalmente no final. Desistir no
 * meio só deixa um rascunho, que a próxima tentativa sobrescreve.
 */
async function lerPdfEmFaixas(
  supabase: ClienteSupabase,
  conversaId: string,
  bytes: Uint8Array,
  nomeArquivo: string,
  paginaInicial: number,
): Promise<Response> {
  let faixa;
  try {
    faixa = await extrairTextoPdfFaixa(bytes, paginaInicial);
  } catch (erro) {
    return respostaJson(
      {
        erro: erro instanceof Error
          ? erro.message
          : "não foi possível ler o PDF",
      },
      400,
    );
  }

  if (faixa.totalPaginas > MAX_PAGINAS_PDF_PNCP) {
    return respostaJson(
      {
        erro:
          `o edital tem ${faixa.totalPaginas} páginas — acima do limite de ${MAX_PAGINAS_PDF_PNCP} para análise automática. Use o botão Baixar para abrir o arquivo.`,
      },
      400,
    );
  }

  // Primeira faixa começa do zero; as seguintes emendam no rascunho.
  let acumulado = "";
  if (paginaInicial > 1) {
    const { data } = await supabase
      .from("conversas_ia")
      .select("documento_parcial")
      .eq("id", conversaId)
      .maybeSingle();
    acumulado = (data?.documento_parcial as string) ?? "";
  }

  const texto = (acumulado + (acumulado ? "\n" : "") + faixa.texto)
    .slice(0, MAX_CARACTERES_DOCUMENTO);

  if (faixa.proximaPagina !== null) {
    const { error } = await supabase
      .from("conversas_ia")
      .update({ documento_parcial: texto })
      .eq("id", conversaId);
    if (error) {
      throw new Error(`Falha ao gravar o documento: ${error.message}`);
    }
    return respostaJson({
      terminou: false,
      proxima_pagina: faixa.proximaPagina,
      total_paginas: faixa.totalPaginas,
      paginas_lidas: faixa.proximaPagina - 1,
      caracteres_parciais: texto.length,
    }, 200);
  }

  // Última faixa: agora sim indexa, resume, junta com anexo anterior se
  // houver, e descarta o rascunho.
  const resumo = await gravarDocumentoNaConversa(
    supabase,
    conversaId,
    nomeArquivo,
    texto.trim(),
    faixa.totalPaginas,
  );
  await supabase
    .from("conversas_ia")
    .update({ documento_parcial: null })
    .eq("id", conversaId);
  return respostaJson({ ...resumo, terminou: true }, 200);
}

/** Assinatura "%PDF" no início do arquivo. */
function ehPdf(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 &&
    bytes[2] === 0x44 && bytes[3] === 0x46;
}

async function modoPdfAnexado(
  supabase: ClienteSupabase,
  corpo: Record<string, unknown>,
): Promise<Response> {
  const base64 = corpo.pdf_base64 as string;
  if (base64.length > MAX_BASE64_PDF) {
    return respostaJson({ erro: "arquivo grande demais (limite ~6 MB)" }, 400);
  }
  const conversaId = await validarConversa(supabase, corpo?.conversa_id);
  if (!conversaId) {
    return respostaJson({ erro: "conversa não encontrada" }, 404);
  }
  const nome = typeof corpo?.pdf_nome === "string" && corpo.pdf_nome
    ? (corpo.pdf_nome as string).slice(0, 120)
    : "documento";

  try {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const extraido = await extrairTextoDeArquivo(bytes);
    const resumo = await gravarDocumentoNaConversa(
      supabase,
      conversaId,
      nomeComPacote(nome, extraido.arquivos),
      extraido.texto,
      extraido.paginas,
    );
    return respostaJson(resumo, 200);
  } catch (erro) {
    if (erro instanceof Error && erro.message.startsWith("Falha ao")) throw erro;
    return respostaJson(
      { erro: erro instanceof Error ? erro.message : "não foi possível ler o arquivo" },
      400,
    );
  }
}

/** Documento até este tamanho vai inteiro para o resumo (M3 comporta ~400k). */
const MAX_DOC_RESUMO = 360_000;

const INSTRUCOES_RESUMO =
  `Você é um consultor sênior em licitações públicas (Lei 14.133/2021). Gere um
RESUMO EXECUTIVO do edital anexado, para o dono de uma PME decidir rápido se
vale participar.

REGRA ABSOLUTA — NÃO INVENTE NADA:
- Baseie-se EXCLUSIVAMENTE no texto do edital anexado e nos dados oficiais do
  PNCP fornecidos abaixo. Não use conhecimento externo para preencher lacunas.
- Se uma informação não constar no material, escreva "não informado no edital"
  naquele campo. NUNCA estime, deduza ou invente valores, datas, prazos,
  percentuais ou exigências.
- Não copie parágrafos inteiros do edital; sintetize em linguagem clara.

FORMA DE ESCREVER (o leitor é o dono da empresa, não conhece o funcionamento
interno do sistema):
- NÃO reproduza no resumo as seções de contexto que você recebeu ("Dados
  oficiais da licitação (PNCP)", "Itens do edital", "Notas extraídas"). Elas são
  a sua fonte; o resumo é só o relatório pedido abaixo. Use os dados dentro das
  seções próprias.
- NUNCA escreva "não consta nas notas extraídas", "não foi extraído" ou
  equivalente. Se a informação faltar, escreva apenas "não informado no edital".
  O leitor não sabe o que é uma nota extraída, e a frase soa como falha do
  sistema.
- Datas e horas: escreva como estão nos dados fornecidos, que já vêm no horário
  de Brasília. Nunca acrescente "UTC" nem converta fuso.

FORMATO (markdown, exatamente estas seções, nesta ordem; pule uma seção só se o
edital realmente não tratar do assunto):

# Resumo Executivo do Edital
Uma linha com a modalidade e número, o órgão e o município (ex.: "Pregão
Eletrônico nº 05/2026 — Câmara Municipal de Valinhos/SP").

## Objeto
Bullets curtos com o que está sendo contratado.

## Informações Principais
Tabela markdown com duas colunas (| Item | Informação |). Inclua, quando
houver: modalidade, critério de julgamento, modo de disputa, forma de
participação (ampla, exclusiva ME/EPP, cota reservada, consórcio permitido ou
vedado), plataforma eletrônica onde ocorre o certame (ex.: Compras.gov.br, BLL,
Licitanet, Portal de Compras Públicas), data/hora da sessão pública, endereço
físico da Administração (entrega, vistoria ou sessão presencial), vigência,
valor estimado total, valores parciais relevantes.

## Escopo dos Serviços / Fornecimento
O que a contratada deverá executar ou entregar (use subitens se ajudar).

## Habilitação Jurídica
Documentos societários e certidões exigidas.

## Habilitação Econômico-Financeira
Índices contábeis com os valores exigidos (ex.: liquidez corrente ≥ 1,0),
capital social ou patrimônio líquido mínimo, balanço patrimonial, certidão de
falência. Transcreva os números exigidos; não arredonde.

## Habilitação Técnica
Registro no conselho de classe, responsável técnico e a forma de vínculo aceita
(empregado, sócio, contrato de prestação de serviços), ART/CAT, atestados de
capacidade técnica com os quantitativos mínimos, se o edital admite SOMA de
atestados (cumulativo) ou exige um único atestado, equipe mínima, vistoria.

## Valores Inexequíveis
Critério ou índice que o edital usa para considerar a proposta inexequível e o
item do edital que prevê isso. Se o edital não fixa critério, diga isso
expressamente — a ausência é relevante para precificar.

## Subcontratação
Se é permitida, com que limite ou percentual, e o que não pode ser
subcontratado.

## Garantia Contratual
Percentual/forma, se exigida; senão, "não informado no edital".

## Pagamento
Prazo e condições.

## Penalidades
Advertência, multas (percentuais), impedimento, inidoneidade — conforme o edital.

## Obrigações Relevantes da Contratada
Bullets com as principais obrigações.

## Contrato Pós-Certame
Da minuta do contrato: vigência e prorrogação, reajuste ou repactuação,
fiscalização e gestor, recebimento provisório/definitivo, hipóteses de rescisão
e alterações contratuais.

## Avaliação de Risco
Tabela markdown (| Risco | Por que importa | Gravidade |), com gravidade alta,
média ou baixa. Cubra risco de habilitação (exigência difícil de cumprir), de
execução (prazo, equipe, local), financeiro (preço, garantia, pagamento) e
contratual. Só riscos que decorrem do que está escrito no edital.

## Conclusão
2 a 4 frases: complexidade, exigências-chave, valor estimado e critério de
disputa. Não dê veredito categórico de "participe/não participe" — aponte os
fatores.

## Questionamentos ao Órgão
Perguntas prontas para enviar como pedido de esclarecimento ou impugnação,
sobre pontos omissos, contraditórios ou possivelmente restritivos à
competição — por exemplo exigência sem previsão legal, atestado com
quantitativo desproporcional, prazo exíguo, ausência de critério de
inexequibilidade, planilha ou anexo mencionado e não disponibilizado.

Regras desta seção:
- Escreva cada item como PERGUNTA dirigida ao órgão, não como afirmação de
  ilegalidade.
- Cite dispositivo da Lei 14.133/2021 SOMENTE se tiver certeza do artigo. Na
  dúvida, faça a pergunta sem citar número de artigo — é melhor não citar do
  que citar errado.
- Aponte só o que decorre do próprio edital. Se o edital estiver completo e
  claro nos pontos acima, escreva "nenhum ponto omisso ou falho identificado".`;

/**
 * Corta do relatório o eco das seções de CONTEXTO.
 *
 * O material que vai no prompt tem títulos markdown ("## Dados oficiais da
 * licitação (PNCP)", "## Itens do edital", "## Notas extraídas") e o modelo
 * insiste em copiá-los para o fim da resposta, entregando ao usuário a matéria-
 * prima junto com o relatório. Pedir no prompt para não fazer isso reduziu, mas
 * não eliminou — então o corte é aqui, onde é determinístico. Nenhuma seção do
 * relatório usa esses títulos, então cortar do primeiro deles até o fim é seguro.
 */
function removerEcoDoContexto(markdown: string): string {
  const padrao =
    /^#{1,6}\s*(dados oficiais|itens do edital|notas extraídas|notas extraidas)/im;
  const achado = markdown.match(padrao);
  if (!achado || achado.index === undefined) return markdown.trim();
  return markdown.slice(0, achado.index).trim();
}

/** Tamanho-alvo de cada parte no modo mapa-e-redução (documentos grandes). */
const CHUNK_RESUMO = 120_000;
/** Máximo de partes processadas (limita nº de chamadas à IA e o tempo). */
const MAX_CHUNKS_RESUMO = 8;
/**
 * Teto de saída do resumo. O relatório cobre habilitação em três blocos,
 * contrato pós-certame, avaliação de risco e questionamentos: com 4096 tokens
 * ele terminava cortado no meio de uma frase.
 */
const MAX_TOKENS_RESUMO = 8192;
/**
 * Teto das notas de CADA parte, no modo mapa-e-redução.
 *
 * Era 1500 — cerca de 4 mil caracteres de notas para 120 mil de edital. Não
 * cabia um capítulo de habilitação, então o extrator comprimia e o resumo final
 * dizia "não consta nas notas extraídas" para exigências que estavam no edital.
 * O gargalo é a saída da extração, não a entrada.
 */
const MAX_TOKENS_NOTAS = 4000;

const INSTRUCOES_MAP =
  `Você recebe UMA PARTE de um edital de licitação. Extraia, em NOTAS curtas
(bullets), apenas os fatos presentes NESTA PARTE que interessam a um resumo
executivo.

O QUE PROCURAR (a lista espelha as seções do resumo final — se um destes
aparecer nesta parte, ele TEM que virar nota):
- objeto, modalidade e número, critério de julgamento, modo de disputa;
- forma de participação: ampla, exclusiva ME/EPP, cota reservada, consórcio;
- plataforma eletrônica do certame (Compras.gov.br, BLL, Licitanet, Portal de
  Compras Públicas etc.) e endereço físico da Administração (entrega, vistoria,
  sessão presencial);
- data/hora da sessão pública, vigência, valores (estimado, parcelas, garantia);
- escopo dos serviços ou do fornecimento;
- habilitação jurídica: documentos societários e certidões;
- habilitação econômico-financeira: índices contábeis COM os valores exigidos,
  capital social ou patrimônio líquido mínimo, balanço, certidão de falência;
- habilitação técnica: registro em conselho, responsável técnico e forma de
  vínculo aceita, ART/CAT, atestados e seus quantitativos mínimos, se admite
  soma de atestados (cumulativo), equipe mínima, vistoria;
- critério de valor inexequível e o item do edital que o prevê;
- subcontratação: permissão, limites, percentuais, o que não pode;
- garantia contratual, condições de pagamento, penalidades, SLA e prazos;
- obrigações da contratada;
- cláusulas da minuta do contrato: vigência e prorrogação, reajuste ou
  repactuação, fiscalização e gestor, recebimento, rescisão, alterações.

REGRAS:
- Use SOMENTE o que está escrito nesta parte. NUNCA invente ou deduza.
- Não escreva um resumo em prosa; escreva notas objetivas com o dado e o valor.
  Transcreva números (índices, percentuais, quantitativos) como estão.
- Anote também o item/cláusula do edital de onde veio o dado, quando aparecer.
- HABILITAÇÃO E PENALIDADES NÃO SE RESUMEM: se esta parte tiver capítulo de
  habilitação (jurídica, econômico-financeira, técnica), de sanções ou de
  pagamento, liste CADA exigência em sua própria linha, com o item do edital.
  Uma linha dizendo "exige documentos de habilitação" é inútil para quem vai
  decidir se consegue se habilitar — é o erro mais caro que você pode cometer
  aqui. Prefira notas longas a notas econômicas.
- Se esta parte não tiver nada relevante, responda apenas: "Sem informações
  relevantes nesta parte."`;

/** Quebra o texto em blocos ~tamanho, preferindo cortar em quebra de linha. */
function dividirEmBlocos(texto: string, tamanho: number): string[] {
  const blocos: string[] = [];
  let i = 0;
  while (i < texto.length) {
    let fim = Math.min(i + tamanho, texto.length);
    if (fim < texto.length) {
      const quebra = texto.lastIndexOf("\n", fim);
      if (quebra > i + tamanho * 0.6) fim = quebra;
    }
    blocos.push(texto.slice(i, fim));
    i = fim;
  }
  return blocos;
}

/**
 * Resumo de documento grande (mapa-e-redução): extrai notas factuais de cada
 * parte (em paralelo) e depois consolida no resumo executivo final. Garante
 * cobertura de todo o documento sem exceder o contexto da IA de uma vez.
 */
async function resumoMapReduce(
  docNome: string,
  texto: string,
  licitacao: LicitacaoContexto | null,
  itens: ItemContratacaoPNCP[] | null,
): Promise<string> {
  const limite = CHUNK_RESUMO * MAX_CHUNKS_RESUMO;
  const truncado = texto.length > limite;
  // Quando não cabe tudo, o corte tira o MEIO e não o fim: a minuta do
  // contrato e os anexos moram nas últimas páginas do edital, e eram justamente
  // eles que ficavam de fora quando o corte era um simples slice do começo.
  const usado = truncado
    ? texto.slice(0, limite - CHUNK_RESUMO) +
      "\n\n[...trecho intermediário omitido por extensão...]\n\n" +
      texto.slice(-CHUNK_RESUMO)
    : texto;
  const blocos = dividirEmBlocos(usado, CHUNK_RESUMO);

  // MAP em paralelo: cada parte vira notas factuais do que ela contém.
  const notas = await Promise.all(
    blocos.map(async (bloco, i) => {
      try {
        const r = await conversarComIA(
          [
            { role: "system", content: INSTRUCOES_MAP },
            {
              role: "user",
              content: `Parte ${i + 1} de ${blocos.length} do edital:\n\n${bloco}`,
            },
          ],
          MAX_TOKENS_NOTAS,
        );
        return `### Notas da parte ${i + 1}\n${r}`;
      } catch {
        return `### Notas da parte ${i + 1}\n(não foi possível processar esta parte)`;
      }
    }),
  );

  // REDUCE: consolida as notas + dados oficiais no resumo executivo final.
  const blocosReduce = [INSTRUCOES_RESUMO];
  if (licitacao) {
    blocosReduce.push(`## Dados oficiais da licitação (PNCP)\n${formatarLicitacao(licitacao)}`);
  }
  if (itens && itens.length > 0) {
    blocosReduce.push(`## Itens do edital (via API do PNCP)\n${formatarItens(itens)}`);
  }
  blocosReduce.push(
    `## Notas extraídas do edital "${docNome}"${
      truncado
        ? " (documento muito extenso; as notas cobrem o início e o fim, com um trecho intermediário omitido)"
        : ""
    }\nEstas notas foram extraídas parte a parte do próprio edital. Baseie o resumo APENAS nelas e nos dados oficiais acima; não invente. Para o leitor, elas SÃO o edital: nunca mencione "notas" no resumo nem diga que algo "não foi extraído" — se faltar, é "não informado no edital".\n\n${
      notas.join("\n\n")
    }`,
  );

  return await conversarComIA(
    [
      { role: "system", content: blocosReduce.join("\n\n") },
      { role: "user", content: "Gere o resumo executivo consolidando as notas." },
    ],
    MAX_TOKENS_RESUMO,
  );
}

/**
 * Gera um resumo executivo estruturado do edital anexado à conversa. Exige o
 * documento no contexto (sem ele, devolve 400 com mensagem amigável) e nunca
 * inventa: envia o texto integral do edital + os dados oficiais do PNCP. Acima
 * de MAX_DOC_RESUMO usa mapa-e-redução para cobrir o documento inteiro.
 */
async function modoResumoExecutivo(
  supabase: ClienteSupabase,
  corpo: Record<string, unknown>,
): Promise<Response> {
  const conversaId = await validarConversa(supabase, corpo?.conversa_id);
  if (!conversaId) {
    return respostaJson({ erro: "conversa não encontrada" }, 404);
  }

  const { data: conversa } = await supabase
    .from("conversas_ia")
    .select("documento_nome, documento_texto, documento_caracteres")
    .eq("id", conversaId)
    .maybeSingle();

  if (!conversa?.documento_nome || !conversa?.documento_texto) {
    return respostaJson(
      {
        erro:
          "É necessário anexar o edital ao contexto da conversa antes de gerar o resumo executivo.",
      },
      400,
    );
  }

  // Dados oficiais (best-effort) para a seção de informações principais.
  const licitacao = await carregarLicitacao(supabase, corpo?.licitacao_id);
  const itens = licitacao
    ? await buscarItensContratacao(licitacao.numero_controle_pncp)
    : null;

  const texto = conversa.documento_texto as string;
  const docNome = conversa.documento_nome as string;
  const grande = texto.length > MAX_DOC_RESUMO;

  let resposta: string;
  if (grande) {
    // Documento extenso: mapa-e-redução cobre o texto inteiro (parte a parte).
    resposta = await resumoMapReduce(docNome, texto, licitacao, itens);
  } else {
    const blocos = [INSTRUCOES_RESUMO];
    if (licitacao) {
      blocos.push(`## Dados oficiais da licitação (PNCP)\n${formatarLicitacao(licitacao)}`);
    }
    if (itens && itens.length > 0) {
      blocos.push(`## Itens do edital (via API do PNCP)\n${formatarItens(itens)}`);
    }
    blocos.push(`## Edital anexado: "${docNome}"\n${texto}`);

    resposta = await conversarComIA(
      [
        { role: "system", content: blocos.join("\n\n") },
        { role: "user", content: "Gere o resumo executivo deste edital." },
      ],
      MAX_TOKENS_RESUMO,
    );
  }

  console.log(
    JSON.stringify({
      funcao: "analise-ia",
      acao: "resumo_executivo",
      conversa_id: conversaId,
      caracteres: texto.length,
      modo: grande ? "mapa_reduce" : "inteiro",
    }),
  );
  return respostaJson({ resposta: removerEcoDoContexto(resposta) }, 200);
}

async function modoConversa(
  supabase: ClienteSupabase,
  corpo: Record<string, unknown>,
  userId: string,
): Promise<Response> {
  const mensagens = validarMensagens(corpo?.mensagens);
  if (!mensagens) {
    return respostaJson({ erro: "mensagens inválidas" }, 400);
  }
  const conversaId = typeof corpo?.conversa_id === "string"
    ? corpo.conversa_id
    : null;

  const ultimaPergunta =
    [...mensagens].reverse().find((m) => m.role === "user")?.content ?? "";

  const [selecionada, favoritas, documento] = await Promise.all([
    carregarLicitacao(supabase, corpo?.licitacao_id),
    carregarFavoritas(supabase),
    carregarDocumento(supabase, conversaId, ultimaPergunta),
  ]);

  // Itens e arquivos da licitação selecionada (best-effort, em paralelo).
  const [itens, arquivos] = selecionada
    ? await Promise.all([
      buscarItensContratacao(selecionada.numero_controle_pncp),
      listarArquivosContratacao(selecionada.numero_controle_pncp),
    ])
    : [null, null];

  const resposta = await conversarComIA(
    [
      {
        role: "system",
        content: montarContexto(
          selecionada,
          itens,
          arquivos,
          favoritas,
          documento,
        ),
      },
      ...mensagens,
    ],
    4096,
    {
      ferramentas: FERRAMENTAS,
      executarFerramenta: criarExecutorFerramentas(supabase, userId),
      maxCiclosFerramenta: 3,
    },
  );

  console.log(
    JSON.stringify({
      funcao: "analise-ia",
      licitacao_id: selecionada?.id ?? null,
      mensagens: mensagens.length,
      itens_pncp: itens?.length ?? 0,
      documento: documento
        ? { nome: documento.nome, modo: documento.modo, trechos: documento.trechos.length }
        : null,
    }),
  );
  return respostaJson({ resposta }, 200);
}

// ---------------------------------------------------------------------------
// Documento (grava, fatia e recupera)
// ---------------------------------------------------------------------------

/** Confirma que a conversa existe e pertence ao usuário (RLS faz o corte). */
async function validarConversa(
  supabase: ClienteSupabase,
  conversaId: unknown,
): Promise<string | null> {
  if (typeof conversaId !== "string" || !conversaId) return null;
  const { data } = await supabase
    .from("conversas_ia")
    .select("id")
    .eq("id", conversaId)
    .maybeSingle();
  return data ? conversaId : null;
}

/** Teto do contexto combinado quando vários documentos são anexados. */
const MAX_TEXTO_COMBINADO = 3_000_000;

/**
 * Grava o documento extraído na conversa. Documentos se ACUMULAM: um novo
 * anexo é acrescentado ao existente com cabeçalho "===== nome =====" (mesmo
 * formato dos pacotes .zip) — a conversa pode ter edital + TR + anexos juntos.
 * Se o conjunto for grande, fatia em trechos indexados para o RAG.
 */
async function gravarDocumentoNaConversa(
  supabase: ClienteSupabase,
  conversaId: string,
  nome: string,
  texto: string,
  paginas: number,
): Promise<{
  nome: string;
  paginas: number;
  caracteres_totais: number;
  modo: "inteiro" | "trechos";
}> {
  const { data: atual } = await supabase
    .from("conversas_ia")
    .select("documento_nome, documento_texto")
    .eq("id", conversaId)
    .maybeSingle();

  if (atual?.documento_texto && atual?.documento_nome) {
    const textoAntigo = atual.documento_texto as string;
    const nomeAntigo = atual.documento_nome as string;
    // Garante cabeçalho no conteúdo antigo (anexos de zip já vêm com um).
    const antigoComCabecalho = textoAntigo.startsWith("=====")
      ? textoAntigo
      : `===== ${nomeAntigo} =====\n\n${textoAntigo}`;
    texto = `${antigoComCabecalho}\n\n===== ${nome} =====\n\n${texto}`
      .slice(0, MAX_TEXTO_COMBINADO);
    nome = `${nomeAntigo} + ${nome}`.slice(0, 160);
  }

  const { error: erroConversa } = await supabase
    .from("conversas_ia")
    .update({
      documento_nome: nome,
      documento_texto: texto,
      documento_caracteres: texto.length,
      documento_cabecalho: texto.slice(0, TAMANHO_CABECALHO),
      documento_sumario: extrairSumario(texto),
    })
    .eq("id", conversaId);
  if (erroConversa) {
    throw new Error(`Falha ao gravar o documento: ${erroConversa.message}`);
  }

  // Trechos antigos saem sempre; novos entram só quando o documento é grande.
  await supabase.from("documento_trechos").delete().eq(
    "conversa_id",
    conversaId,
  );

  const modo = texto.length > LIMITE_DOCUMENTO_INTEIRO ? "trechos" : "inteiro";
  if (modo === "trechos") {
    const trechos = dividirEmTrechos(texto).map((conteudo, indice) => ({
      conversa_id: conversaId,
      ordem: indice + 1,
      conteudo,
    }));
    for (let i = 0; i < trechos.length; i += LOTE_INSERT_TRECHOS) {
      const { error } = await supabase
        .from("documento_trechos")
        .insert(trechos.slice(i, i + LOTE_INSERT_TRECHOS));
      if (error) {
        throw new Error(`Falha ao indexar o documento: ${error.message}`);
      }
    }
  }

  console.log(
    JSON.stringify({
      funcao: "analise-ia",
      acao: "gravar_documento",
      conversa_id: conversaId,
      caracteres: texto.length,
      paginas,
      modo,
    }),
  );
  return { nome, paginas, caracteres_totais: texto.length, modo };
}

/** Monta o contexto do documento: inteiro, ou cabeçalho + trechos relevantes. */
async function carregarDocumento(
  supabase: ClienteSupabase,
  conversaId: string | null,
  pergunta: string,
): Promise<DocumentoContexto | null> {
  if (!conversaId) return null;

  const { data: conversa } = await supabase
    .from("conversas_ia")
    .select(
      "documento_nome, documento_caracteres, documento_cabecalho, documento_sumario",
    )
    .eq("id", conversaId)
    .maybeSingle();
  if (!conversa?.documento_nome || !conversa.documento_caracteres) return null;

  const base = {
    nome: conversa.documento_nome as string,
    caracteres: conversa.documento_caracteres as number,
    sumario: (conversa.documento_sumario as string) ?? "",
  };

  if (base.caracteres <= LIMITE_DOCUMENTO_INTEIRO) {
    const { data } = await supabase
      .from("conversas_ia")
      .select("documento_texto")
      .eq("id", conversaId)
      .maybeSingle();
    return {
      ...base,
      modo: "inteiro",
      conteudo: (data?.documento_texto as string) ?? "",
      trechos: [],
    };
  }

  const { data: trechos } = await supabase.rpc("buscar_trechos_documento", {
    p_conversa_id: conversaId,
    p_consulta: pergunta.slice(0, 500),
    p_limite: MAX_TRECHOS_POR_PERGUNTA,
  });
  return {
    ...base,
    modo: "trechos",
    conteudo: (conversa.documento_cabecalho as string) ?? "",
    trechos: (trechos ?? []) as Array<{ ordem: number; conteudo: string }>,
  };
}

// ---------------------------------------------------------------------------
// Contexto e validações da conversa
// ---------------------------------------------------------------------------

function validarMensagens(entrada: unknown): MensagemChat[] | null {
  if (!Array.isArray(entrada) || entrada.length === 0) return null;
  const mensagens: MensagemChat[] = [];
  for (const item of entrada.slice(-MAX_MENSAGENS)) {
    const role = (item as { role?: string })?.role;
    const content = (item as { content?: string })?.content;
    if (
      (role !== "user" && role !== "assistant") ||
      typeof content !== "string" || !content.trim()
    ) {
      return null;
    }
    mensagens.push({ role, content: content.slice(0, MAX_TAMANHO_MENSAGEM) });
  }
  return mensagens;
}

async function carregarLicitacao(
  supabase: ClienteSupabase,
  licitacaoId: unknown,
): Promise<LicitacaoContexto | null> {
  if (typeof licitacaoId !== "string" || !licitacaoId) return null;
  const { data } = await supabase
    .from("licitacoes")
    .select(COLUNAS_CONTEXTO)
    .eq("id", licitacaoId)
    .maybeSingle<LicitacaoContexto>();
  return data ?? null;
}

async function carregarFavoritas(
  supabase: ClienteSupabase,
): Promise<LicitacaoContexto[]> {
  const { data } = await supabase
    .from("favoritos")
    .select(`licitacoes ( ${COLUNAS_CONTEXTO} )`)
    .order("created_at", { ascending: false })
    .limit(MAX_FAVORITAS_NO_CONTEXTO);
  return ((data ?? []) as unknown as Array<{ licitacoes: LicitacaoContexto }>)
    .map((f) => f.licitacoes)
    .filter(Boolean);
}

/**
 * Prazo do PNCP em texto, no horário de Brasília.
 *
 * A coluna é timestamptz mas guarda o relógio de parede de Brasília (o PNCP
 * publica sem fuso e a coleta grava como está), então formatar em UTC devolve a
 * hora do edital. Entregar o ISO cru fazia a IA ler "+00:00" e escrever "08:00
 * (horário UTC)" no resumo, três horas fora do que está no edital.
 */
function prazoEmBrasilia(iso: string | null): string {
  if (!iso) return "não informada";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p: Record<string, string> = {};
  for (
    const parte of new Intl.DateTimeFormat("pt-BR", {
      timeZone: "UTC",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).formatToParts(d)
  ) p[parte.type] = parte.value;
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute} (horário de Brasília)`;
}

function formatarLicitacao(l: LicitacaoContexto): string {
  return [
    `Controle PNCP: ${l.numero_controle_pncp}`,
    `Objeto: ${l.objeto_compra}`,
    l.informacao_complementar
      ? `Informação complementar: ${l.informacao_complementar.slice(0, 1500)}`
      : null,
    `Valor total estimado: ${l.valor_total_estimado ?? "não informado"}`,
    `Abertura das propostas: ${prazoEmBrasilia(l.data_abertura_proposta)}`,
    `Encerramento das propostas: ${prazoEmBrasilia(l.data_encerramento_proposta)}`,
    `Órgão: ${l.orgao_razao_social ?? "?"} (${l.unidade_nome ?? "?"})`,
    `Local: ${l.municipio_nome ?? "?"}/${l.uf ?? "?"}`,
    `Modalidade: ${l.modalidade_nome ?? "?"} | Situação: ${l.situacao_nome ?? "?"}`,
    // O domínio do link costuma ser a própria plataforma do certame (BLL,
    // Licitanet, Portal de Compras Públicas, Compras.gov.br), que o corpo do
    // edital muitas vezes não nomeia. Dito assim, a IA pode usar sem deduzir.
    l.link_sistema_origem
      ? `Link do sistema de origem (o domínio indica a plataforma do certame): ${l.link_sistema_origem}`
      : null,
  ].filter(Boolean).join("\n");
}

function formatarItens(itens: ItemContratacaoPNCP[]): string {
  return itens
    .slice(0, MAX_ITENS_NO_CONTEXTO)
    .map(
      (i) =>
        `${i.numeroItem}. ${i.descricao ?? "?"} — qtd ${i.quantidade ?? "?"} ${i.unidadeMedida ?? ""}, valor unit. estimado ${i.valorUnitarioEstimado ?? "?"}, total ${i.valorTotal ?? "?"} (${i.situacaoCompraItemNome ?? "?"})`,
    )
    .join("\n");
}

const INSTRUCOES = `Você é um consultor sênior em licitações públicas brasileiras (Lei 14.133/2021)
atendendo donos de pequenas e médias empresas leigos no assunto, dentro do app
SentinelaGov (aba "Análise IA").

BUSCA DE LICITAÇÕES (você TEM esta ferramenta — use-a):
- Você PODE pesquisar, em tempo real, licitações com propostas abertas agora em
  TODO O BRASIL, na base oficial do PNCP, chamando a ferramenta
  buscar_licitacoes (parâmetros: termo e, opcional, uf). Use-a sempre que o
  usuário pedir para encontrar/pesquisar oportunidades ou disser o que a empresa
  vende. Se faltar o ramo/produto, pergunte em uma frase e então busque.
- Depois de buscar, apresente as melhores opções em linguagem simples (objeto,
  órgão, cidade/UF, valor estimado, e SEMPRE o link do PNCP de cada uma).
- Seja honesto sobre o alcance: sua fonte ao vivo é a base oficial do PNCP (que
  reúne as contratações públicas do país inteiro) — você NÃO faz navegação livre
  na web (Google, sites avulsos). Se perguntarem "você tem acesso à internet?",
  responda com franqueza: sim, você consulta em tempo real as licitações abertas
  do PNCP no Brasil todo e pode buscar por ramo/produto/estado; o que você não
  faz é navegar em sites da web em geral.
- NUNCA invente resultados: cite apenas licitações que a ferramenta retornou.
- Você também PODE FAVORITAR uma licitação para o usuário: quando ele pedir
  ("favorita a 2", "salva essa pra mim"), chame favoritar_licitacao com o
  numero_controle_pncp EXATO daquele resultado. Confirme e avise que ela está
  na aba Favoritos e pode ser selecionada em "Licitação em análise" para
  análise detalhada do edital. Se ele indicar uma licitação por posição (ex.:
  "a primeira"), use o resultado correspondente da SUA última busca.

COMO RESPONDER:
- Vá direto ao ponto. Responda a pergunta primeiro, com orientação prática.
- NÃO explique como você "lê o documento", "busca por palavras-chave" ou quais
  são suas limitações técnicas. O usuário não quer saber do mecanismo.
- NÃO mande o usuário "olhar a seção Arquivos da licitação no PNCP" nem
  conferir a interface: você já recebe abaixo a lista de arquivos e o sumário
  do documento. Use-os para responder você mesmo.
- Nunca invente valores, datas ou exigências. Se um número específico não
  estiver no material fornecido, diga em UMA frase que não localizou aquele
  dado e responda o que der.

PERGUNTAS SOBRE A ESTRUTURA DO DOCUMENTO (ex.: "tem o Anexo I?", "o Termo de
Referência está aqui?"): responda com base na LISTA DE ARQUIVOS e no SUMÁRIO
do documento abaixo — os dois juntos dizem se um anexo/TR está embutido no
edital ou é um arquivo à parte. Dê uma resposta conclusiva, não evasiva.

COMO O USUÁRIO ANEXA UM DOCUMENTO AO CONTEXTO (recursos reais da tela):
- Cada arquivo da seção "Arquivos da licitação no PNCP" tem o botão
  "Anexar ao contexto da conversa" — é assim que ele traz o edital ou um anexo
  oficial daquela licitação para você analisar.
- O botão "Anexar arquivo (PDF ou Word)" permite subir um documento próprio
  dele (PDF ou .docx), por exemplo um termo de referência que ele já tenha.
Quando a resposta depender de um documento que NÃO está no seu contexto (ex.:
o usuário pergunta detalhes de um edital/anexo que você ainda não recebeu),
diga a ele, em uma frase, para anexar usando um desses botões — prefira
indicar o arquivo certo da lista quando ele existir. Se o usuário perguntar se
pode enviar documentos, confirme e explique esses dois botões.
Só existem esses dois recursos de anexo: não invente ícone de clipe, upload em
partes nem colar texto. Os documentos anexados se ACUMULAM no contexto da
conversa (edital + TR + anexos, separados por cabeçalhos "===== nome ====="
no texto que você recebe); o botão Remover limpa todos de uma vez.`;

function formatarArquivos(arquivos: ArquivoLista[]): string {
  return arquivos
    .map((a) => `- ${a.titulo ?? "sem título"}${a.tipoDocumentoNome ? ` (${a.tipoDocumentoNome})` : ""}`)
    .join("\n");
}

function montarContexto(
  selecionada: LicitacaoContexto | null,
  itens: ItemContratacaoPNCP[] | null,
  arquivos: ArquivoLista[] | null,
  favoritas: LicitacaoContexto[],
  documento: DocumentoContexto | null,
): string {
  const blocos = [INSTRUCOES];

  if (selecionada) {
    blocos.push(`## Licitação em análise\n${formatarLicitacao(selecionada)}`);
    if (itens && itens.length > 0) {
      blocos.push(
        `## Itens do edital (via API do PNCP)\n${formatarItens(itens)}`,
      );
    }
    if (arquivos && arquivos.length > 0) {
      blocos.push(
        `## Arquivos publicados desta licitação no PNCP (${arquivos.length})\n` +
          formatarArquivos(arquivos) +
          "\n\nEsta é a lista COMPLETA de arquivos oficiais. Se o usuário " +
          "perguntar se há um Termo de Referência ou anexo separado, baseie-se " +
          "nesta lista: se não há um arquivo com esse nome, o conteúdo está " +
          "embutido no edital (confira o sumário do documento).",
      );
    } else {
      blocos.push(
        "## Arquivos publicados desta licitação no PNCP\nNão foi possível obter a lista de arquivos no PNCP agora.",
      );
    }
  } else {
    blocos.push(
      "## Licitação em análise\nNenhuma licitação selecionada. Se o usuário " +
        "quiser encontrar oportunidades, use a ferramenta buscar_licitacoes " +
        "(pergunte o ramo/produto e, se ele quiser, o estado) e apresente os " +
        "resultados com o link do PNCP. Também responda perguntas gerais " +
        "normalmente e, quando fizer sentido, convide-o a escolher uma favorita " +
        "para análise detalhada do edital.",
    );
  }

  if (documento) {
    if (documento.sumario) {
      blocos.push(
        `## Sumário do documento anexado (seções/títulos detectados)\n${documento.sumario}`,
      );
    }
    if (documento.modo === "inteiro") {
      blocos.push(
        `## Documento anexado: "${documento.nome}" (COMPLETO, ${documento.caracteres} caracteres)\n` +
          "Este é o texto integral. Trate-o como fonte primária sobre exigências, prazos e condições.\n\n" +
          documento.conteudo,
      );
    } else {
      blocos.push(
        `## Documento anexado: "${documento.nome}" (${documento.caracteres} caracteres — indexado por inteiro)\n` +
          "Abaixo estão o INÍCIO do documento e os trechos mais relevantes à " +
          "última pergunta. O documento inteiro está indexado (veja o sumário " +
          "acima para a estrutura). Se um dado específico não aparecer nos " +
          "trechos, diga em uma frase que não o localizou e sugira reperguntar " +
          "com o termo exato do edital. NÃO diga que o documento está truncado " +
          "ou incompleto — não está.\n\n" +
          `### Início do documento\n${documento.conteudo}\n\n` +
          `### Trechos relevantes à última pergunta\n` +
          (documento.trechos.length > 0
            ? documento.trechos
              .map((t) => `[trecho ${t.ordem}]\n${t.conteudo}`)
              .join("\n\n")
            : "(a busca não encontrou trechos para os termos desta pergunta)"),
      );
    }
  }

  if (favoritas.length > 0) {
    blocos.push(
      "## Favoritas do usuário (para comparação)\n" +
        favoritas
          .map(
            (f) =>
              `- [${f.numero_controle_pncp}] ${f.objeto_compra.slice(0, 120)} — ${f.municipio_nome ?? "?"}/${f.uf ?? "?"}, valor ${f.valor_total_estimado ?? "?"}, propostas até ${f.data_encerramento_proposta ?? "?"}`,
          )
          .join("\n"),
    );
  }

  return blocos.join("\n\n");
}

function respostaJson(corpo: unknown, status: number): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CABECALHOS_CORS, "Content-Type": "application/json" },
  });
}
