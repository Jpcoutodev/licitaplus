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
import { conversarComIA, type MensagemChat } from "../_shared/ia/minimax.ts";
import {
  baixarArquivoContratacao,
  buscarItensContratacao,
  type ItemContratacaoPNCP,
  listarArquivosContratacao,
} from "../_shared/pncp/cliente.ts";
import { extrairTextoPdfBytes } from "../_shared/pdf.ts";
import { extrairTextoDocx, pareceZip } from "../_shared/docx.ts";
import { dividirEmTrechos, extrairSumario } from "../_shared/trechos.ts";
import { CABECALHOS_CORS, respostaPreflight } from "../_shared/cors.ts";

const MAX_MENSAGENS = 16;
const MAX_TAMANHO_MENSAGEM = 4000;
const MAX_ITENS_NO_CONTEXTO = 40;
const MAX_FAVORITAS_NO_CONTEXTO = 15;
/** ~9 MB de base64 ≈ PDF de 6,5 MB — acima disso a extração é recusada. */
const MAX_BASE64_PDF = 9_000_000;
/** Limite de download de arquivo do PNCP para análise. */
const MAX_BYTES_ARQUIVO_PNCP = 12_000_000;
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
}

/**
 * Extrai texto de PDF ou DOCX a partir dos bytes, detectando o formato pela
 * assinatura. Lança Error com mensagem amigável nos casos não suportados
 * (PDF escaneado sem texto, .doc antigo, .xlsx, formato desconhecido).
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
        "o PDF não contém texto extraível (provavelmente escaneado como imagem)",
      );
    }
    return { texto: extraido.texto, paginas: extraido.paginas };
  }

  if (pareceZip(bytes)) {
    try {
      const texto = extrairTextoDocx(bytes);
      if (!texto.trim()) throw new Error("vazio");
      return { texto, paginas: 0 };
    } catch (erro) {
      if (erro instanceof Error && erro.message === "nao_docx") {
        throw new Error(
          "este arquivo é uma planilha ou pacote compactado, não um documento de texto — use o botão Baixar",
        );
      }
      throw new Error("não foi possível ler este arquivo Word");
    }
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

Deno.serve(async (req) => {
  const preflight = respostaPreflight(req);
  if (preflight) return preflight;

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

    if (corpo?.acao === "listar_arquivos") {
      return await modoListarArquivos(supabase, corpo);
    }
    if (corpo?.acao === "analisar_arquivo") {
      return await modoAnalisarArquivo(supabase, corpo);
    }
    if (typeof corpo?.pdf_base64 === "string") {
      return await modoPdfAnexado(supabase, corpo);
    }
    return await modoConversa(supabase, corpo);
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

  const bytes = await baixarArquivoContratacao(
    arquivo.url,
    MAX_BYTES_ARQUIVO_PNCP,
  );
  if (!bytes) {
    return respostaJson(
      { erro: "não foi possível baixar o arquivo (grande demais ou PNCP indisponível)" },
      502,
    );
  }

  try {
    const extraido = await extrairTextoDeArquivo(bytes);
    const nome = arquivo.titulo ??
      `documento-${arquivo.sequencialDocumento}`;
    const resumo = await gravarDocumentoNaConversa(
      supabase,
      conversaId,
      nome,
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
      nome,
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

async function modoConversa(
  supabase: ClienteSupabase,
  corpo: Record<string, unknown>,
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

/**
 * Grava o documento extraído na conversa; se for grande, fatia em trechos
 * indexados para a recuperação por pergunta.
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

function formatarLicitacao(l: LicitacaoContexto): string {
  return [
    `Controle PNCP: ${l.numero_controle_pncp}`,
    `Objeto: ${l.objeto_compra}`,
    l.informacao_complementar
      ? `Informação complementar: ${l.informacao_complementar.slice(0, 1500)}`
      : null,
    `Valor total estimado: ${l.valor_total_estimado ?? "não informado"}`,
    `Abertura das propostas: ${l.data_abertura_proposta ?? "não informada"}`,
    `Encerramento das propostas: ${l.data_encerramento_proposta ?? "não informado"}`,
    `Órgão: ${l.orgao_razao_social ?? "?"} (${l.unidade_nome ?? "?"})`,
    `Local: ${l.municipio_nome ?? "?"}/${l.uf ?? "?"}`,
    `Modalidade: ${l.modalidade_nome ?? "?"} | Situação: ${l.situacao_nome ?? "?"}`,
    l.link_sistema_origem ? `Link: ${l.link_sistema_origem}` : null,
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
Licitaplus (aba "Análise IA").

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
partes nem colar texto. Cada conversa mantém UM documento por vez (anexar
outro substitui o atual).`;

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
      "## Licitação em análise\nNenhuma licitação selecionada — responda perguntas gerais normalmente e convide o usuário a escolher uma favorita para análise detalhada.",
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
