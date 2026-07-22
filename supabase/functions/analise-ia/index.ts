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
import { extrairTextoPdfBytes } from "../_shared/pdf.ts";
import { extrairTextoDocx, pareceZip } from "../_shared/docx.ts";
import { unzipSync } from "npm:fflate@0.8.2";
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
        "o PDF não contém texto extraível (provavelmente escaneado como imagem)",
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
];

/** Executa a ferramenta pedida pela IA e devolve o resultado como texto. */
async function executarFerramenta(
  nome: string,
  args: Record<string, unknown>,
): Promise<string> {
  if (nome !== "buscar_licitacoes") {
    return `ferramenta desconhecida: ${nome}`;
  }
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
    return formatarAchadosPncp(achados.slice(0, MAX_ACHADOS_BUSCA));
  } catch (erro) {
    return `Não foi possível consultar o PNCP agora: ${
      erro instanceof Error ? erro.message : "erro"
    }.`;
  }
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
    if (corpo?.acao === "resumo_executivo") {
      return await modoResumoExecutivo(supabase, corpo);
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
    const nome = nomeComPacote(
      arquivo.titulo ?? `documento-${arquivo.sequencialDocumento}`,
      extraido.arquivos,
    );
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

FORMATO (markdown, exatamente estas seções, nesta ordem; pule uma seção só se o
edital realmente não tratar do assunto):

# Resumo Executivo do Edital
Uma linha com a modalidade e número, o órgão e o município (ex.: "Pregão
Eletrônico nº 05/2026 — Câmara Municipal de Valinhos/SP").

## Objeto
Bullets curtos com o que está sendo contratado.

## Informações Principais
Tabela markdown com duas colunas (| Item | Informação |). Inclua, quando
houver: modalidade, critério de julgamento, modo de disputa, data/hora da
sessão pública, vigência, valor estimado total, valores parciais relevantes,
participação ME/EPP.

## Escopo dos Serviços / Fornecimento
O que a contratada deverá executar ou entregar (use subitens se ajudar).

## Exigências Técnicas e de Habilitação
Registros, certidões, responsável técnico, equipe mínima, atestados, normas.

## Obrigações Relevantes da Contratada
Bullets com as principais obrigações.

## Garantia Contratual
Percentual/forma, se exigida; senão, "não informado no edital".

## Pagamento
Prazo e condições.

## Penalidades
Advertência, multas (percentuais), impedimento, inidoneidade — conforme o edital.

## Pontos de Atenção para o Fornecedor
Bullets iniciados com ✅ destacando o que mais pesa na decisão de participar.

## Conclusão
2 a 4 frases: complexidade, exigências-chave, valor estimado e critério de
disputa. Não dê veredito categórico de "participe/não participe" — aponte os
fatores.`;

/** Tamanho-alvo de cada parte no modo mapa-e-redução (documentos grandes). */
const CHUNK_RESUMO = 120_000;
/** Máximo de partes processadas (limita nº de chamadas à IA e o tempo). */
const MAX_CHUNKS_RESUMO = 6;

const INSTRUCOES_MAP =
  `Você recebe UMA PARTE de um edital de licitação. Extraia, em NOTAS curtas
(bullets), apenas os fatos presentes NESTA PARTE que interessam a um resumo
executivo: objeto, modalidade e número, critério de julgamento, modo de disputa,
data/hora da sessão, vigência, valores (estimado, garantias, parcelas), ME/EPP,
escopo dos serviços, exigências técnicas e de habilitação, obrigações da
contratada, garantia contratual, condições de pagamento, penalidades, SLA e
prazos.

REGRAS:
- Use SOMENTE o que está escrito nesta parte. NUNCA invente ou deduza.
- Não escreva um resumo em prosa; escreva notas objetivas com o dado e o valor.
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
  const usado = texto.slice(0, limite);
  const truncado = texto.length > limite;
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
          1500,
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
      truncado ? " (documento muito extenso; as notas cobrem o início)" : ""
    }\nEstas notas foram extraídas parte a parte do próprio edital. Baseie o resumo APENAS nelas e nos dados oficiais acima; não invente.\n\n${
      notas.join("\n\n")
    }`,
  );

  return await conversarComIA(
    [
      { role: "system", content: blocosReduce.join("\n\n") },
      { role: "user", content: "Gere o resumo executivo consolidando as notas." },
    ],
    4096,
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
      4096,
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
  return respostaJson({ resposta }, 200);
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
    {
      ferramentas: FERRAMENTAS,
      executarFerramenta,
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
