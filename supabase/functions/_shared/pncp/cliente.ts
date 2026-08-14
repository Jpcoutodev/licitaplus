/**
 * Cliente da API de consulta do PNCP — ÚNICO ponto de acesso à API em todo o
 * sistema. Nenhum outro módulo faz fetch direto ao PNCP.
 *
 * Endpoint usado no MVP: /v1/contratacoes/proposta (propostas em aberto).
 * O endpoint não documentado de busca textual NÃO é usado.
 */

import { lerEnv } from "../env.ts";
import { fetchWithRetry } from "../http.ts";
import type {
  ContratacaoPNCP,
  LicitacaoColetada,
  PaginaPNCP,
} from "./tipos.ts";

// O endpoint /contratacoes/proposta limita o tamanho de página a 50 (valores
// acima disso retornam HTTP 400 "Tamanho de página inválido").
const TAMANHO_PAGINA_MAXIMO = 50;
// O PNCP pode levar dezenas de segundos por página em consultas com horizonte
// longo; timeout folgado e menos tentativas para não estourar a invocação.
const RETRY_PNCP = { timeoutMs: 60_000, tentativas: 2 };

function urlBasePncp(): string {
  return lerEnv("PNCP_API_BASE_URL") ?? "https://pncp.gov.br/api/consulta";
}

export interface FiltroContratacoes {
  /** Propostas abertas até esta data, formato yyyyMMdd. */
  dataFinal: string;
  uf?: string;
  codigoModalidade?: number;
}

export interface PaginaContratacoes {
  itens: LicitacaoColetada[];
  totalPaginas: number;
  paginasRestantes: number;
}
/** Formata uma data no formato yyyyMMdd exigido pelo PNCP. */
export function formatarDataPncp(data: Date): string {
  return data.toISOString().slice(0, 10).replaceAll("-", "");
}

/** Busca uma página de contratações com propostas em aberto. */
export async function buscarPaginaPropostasAbertas(
  filtro: FiltroContratacoes,
  pagina: number,
): Promise<PaginaContratacoes> {
  const url = new URL(`${urlBasePncp()}/v1/contratacoes/proposta`);
  url.searchParams.set("dataFinal", filtro.dataFinal);
  url.searchParams.set("pagina", String(pagina));
  url.searchParams.set("tamanhoPagina", String(TAMANHO_PAGINA_MAXIMO));
  if (filtro.uf) url.searchParams.set("uf", filtro.uf);
  if (filtro.codigoModalidade !== undefined) {
    url.searchParams.set(
      "codigoModalidadeContratacao",
      String(filtro.codigoModalidade),
    );
  }

  const resposta = await fetchWithRetry(url, {}, RETRY_PNCP);

  // O PNCP responde 204 quando a consulta não tem resultados.
  if (resposta.status === 204) {
    return { itens: [], totalPaginas: 0, paginasRestantes: 0 };
  }
  if (!resposta.ok) {
    throw new Error(
      `PNCP respondeu HTTP ${resposta.status} para ${url.pathname} (uf=${filtro.uf ?? "-"}, modalidade=${filtro.codigoModalidade ?? "-"}, pagina=${pagina})`,
    );
  }

  const corpo = (await resposta.json()) as PaginaPNCP<ContratacaoPNCP>;
  const itens = (corpo.data ?? [])
    .filter((item) => Boolean(item.numeroControlePNCP))
    .map(mapearContratacao);

  return {
    itens,
    totalPaginas: corpo.totalPaginas ?? 0,
    paginasRestantes: corpo.paginasRestantes ?? 0,
  };
}

interface ItemBuscaTextualPNCP {
  numero_controle_pncp: string | null;
  description: string | null;
  orgao_cnpj: string | null;
  orgao_nome: string | null;
  unidade_nome: string | null;
  municipio_nome: string | null;
  uf: string | null;
  modalidade_licitacao_id: string | null;
  modalidade_licitacao_nome: string | null;
  situacao_nome: string | null;
  valor_global: number | null;
  data_publicacao_pncp: string | null;
  /** Documento do tipo edital: janela de recebimento de propostas. */
  data_inicio_vigencia: string | null;
  data_fim_vigencia: string | null;
  item_url: string | null;
  [campo: string]: unknown;
}

/**
 * Busca textual — endpoint NÃO documentado usado pelo próprio portal do PNCP
 * (pncp.gov.br/api/search). Por isso fica isolado nesta função e todo
 * chamador deve tratá-lo como best-effort: em caso de falha, a varredura
 * pela rota oficial (/contratacoes/proposta) é o fallback.
 *
 * Observações medidas na prática:
 *  - o filtro de modalidade não aceita múltiplos valores (repetir o
 *    parâmetro faz valer só o último; vírgula retorna zero) — por isso NÃO
 *    filtramos modalidade aqui; o matching filtra por perfil no banco;
 *  - nem sempre trazem valor — a varredura oficial enriquece depois (upsert
 *    com merge);
 *  - as datas de proposta VÊM, com outro nome: para documento do tipo edital,
 *    data_inicio_vigencia/data_fim_vigencia são a abertura/encerramento do
 *    recebimento de propostas. Conferido contra registros que a varredura
 *    oficial já tinha gravado: batem ao minuto (inclusive horários quebrados
 *    como 08:50). Antes eram descartadas como nulas, e a licitação achada por
 *    palavra-chave ficava sem prazo até a varredura oficial passar por ela —
 *    o que pode nunca acontecer.
 */
export async function buscarPorTermoTextual(
  termo: string,
  uf?: string,
): Promise<LicitacaoColetada[]> {
  const url = new URL(`${urlBasePncp().replace(/\/api\/consulta$/, "")}/api/search/`);
  url.searchParams.set("q", termo);
  url.searchParams.set("tipos_documento", "edital");
  url.searchParams.set("status", "recebendo_proposta");
  // Sem uf = busca nacional (Brasil inteiro).
  if (uf) url.searchParams.set("ufs", uf);
  url.searchParams.set("ordenacao", "-data");
  url.searchParams.set("pagina", "1");
  url.searchParams.set("tam_pagina", String(TAMANHO_PAGINA_MAXIMO));

  const resposta = await fetchWithRetry(url, {}, RETRY_PNCP);
  if (!resposta.ok) {
    throw new Error(`Busca textual do PNCP respondeu HTTP ${resposta.status}`);
  }

  const corpo = (await resposta.json()) as { items?: ItemBuscaTextualPNCP[] };
  return (corpo.items ?? [])
    .filter((item) => Boolean(item.numero_controle_pncp && item.description))
    .map(mapearItemBuscaTextual);
}

function mapearItemBuscaTextual(item: ItemBuscaTextualPNCP): LicitacaoColetada {
  // item_url "/compras/{cnpj}/{ano}/{seq}" -> página pública do edital no PNCP
  const linkPncp = item.item_url
    ? `https://pncp.gov.br/app/editais${item.item_url.replace(/^\/compras/, "")}`
    : null;

  return {
    numero_controle_pncp: item.numero_controle_pncp!,
    data_publicacao_pncp: item.data_publicacao_pncp ?? null,
    objeto_compra: item.description ?? "",
    informacao_complementar: null,
    valor_total_estimado: item.valor_global ?? null,
    // Hora de Brasília sem fuso, como o PNCP publica — mesma forma que a
    // varredura oficial grava (ver comentário acima).
    data_abertura_proposta: item.data_inicio_vigencia ?? null,
    data_encerramento_proposta: item.data_fim_vigencia ?? null,
    orgao_cnpj: item.orgao_cnpj ?? null,
    orgao_razao_social: item.orgao_nome ?? null,
    unidade_nome: item.unidade_nome ?? null,
    uf: item.uf ?? null,
    municipio_nome: item.municipio_nome ?? null,
    modalidade_id: item.modalidade_licitacao_id
      ? Number(item.modalidade_licitacao_id)
      : null,
    modalidade_nome: item.modalidade_licitacao_nome ?? null,
    situacao_nome: item.situacao_nome ?? null,
    link_sistema_origem: linkPncp,
  };
}

/**
 * Contrato assinado, com o fornecedor vencedor. Base da prospecção interna
 * (quem já vende para o governo é quem mais tende a querer monitorar).
 */
export interface ContratoPNCP {
  numeroControlePNCP: string;
  niFornecedor: string | null;
  nomeRazaoSocialFornecedor: string | null;
  tipoPessoa: string | null;
  objetoContrato: string | null;
  valorGlobal: number | null;
  dataPublicacaoPncp: string | null;
  orgaoEntidade?: { cnpj?: string | null; razaoSocial?: string | null };
  unidadeOrgao?: { ufSigla?: string | null; municipioNome?: string | null };
  [campo: string]: unknown;
}

export interface PaginaContratos {
  itens: ContratoPNCP[];
  totalPaginas: number;
  totalRegistros: number;
}

/**
 * Busca uma página de contratos assinados num período.
 *
 * A rota não aceita filtro de UF nem de texto — quem quiser recortar precisa
 * fazê-lo depois, sobre o retorno. E `tamanhoPagina` tem mínimo: valores
 * pequenos (3, por exemplo) devolvem 400 "Tamanho de página inválido".
 *
 * Datas no formato AAAAMMDD (use formatarDataPncp).
 */
export async function buscarContratosPorPeriodo(
  dataInicial: string,
  dataFinal: string,
  pagina: number,
  tamanhoPagina = 500,
  retry: { timeoutMs?: number; tentativas?: number } = RETRY_PNCP,
): Promise<PaginaContratos> {
  const url = new URL(`${urlBasePncp()}/v1/contratos`);
  url.searchParams.set("dataInicial", dataInicial);
  url.searchParams.set("dataFinal", dataFinal);
  url.searchParams.set("pagina", String(pagina));
  url.searchParams.set("tamanhoPagina", String(tamanhoPagina));

  const resposta = await fetchWithRetry(url, {}, retry);

  // 204 = período sem contratos.
  if (resposta.status === 204) {
    return { itens: [], totalPaginas: 0, totalRegistros: 0 };
  }
  if (!resposta.ok) {
    throw new Error(
      `PNCP respondeu HTTP ${resposta.status} em /v1/contratos (${dataInicial}-${dataFinal}, pagina=${pagina})`,
    );
  }

  const corpo = (await resposta.json()) as {
    data?: ContratoPNCP[];
    totalPaginas?: number;
    totalRegistros?: number;
  };
  return {
    itens: (corpo.data ?? []).filter((c) => Boolean(c.numeroControlePNCP)),
    totalPaginas: corpo.totalPaginas ?? 0,
    totalRegistros: corpo.totalRegistros ?? 0,
  };
}

export interface ItemContratacaoPNCP {
  numeroItem: number;
  descricao: string | null;
  quantidade: number | null;
  unidadeMedida: string | null;
  valorUnitarioEstimado: number | null;
  valorTotal: number | null;
  situacaoCompraItemNome: string | null;
}

function urlBaseApiPncp(): string {
  return lerEnv("PNCP_ITENS_BASE_URL") ?? "https://pncp.gov.br/api/pncp";
}

/** Decompõe o numero_controle_pncp ("CNPJ-1-SEQUENCIAL/ANO") para as rotas da API. */
function partesNumeroControle(
  numeroControlePncp: string,
): { cnpj: string; sequencial: number; ano: string } | null {
  const partes = numeroControlePncp.match(/^(\d{14})-\d-(\d+)\/(\d{4})$/);
  if (!partes) return null;
  return { cnpj: partes[1], sequencial: Number(partes[2]), ano: partes[3] };
}

/**
 * Busca os itens de uma contratação na API principal do PNCP, a partir do
 * numero_controle_pncp. Retorna null se o número não puder ser interpretado
 * ou o PNCP não responder — o chamador decide seguir sem os itens.
 */
export async function buscarItensContratacao(
  numeroControlePncp: string,
): Promise<ItemContratacaoPNCP[] | null> {
  const partes = partesNumeroControle(numeroControlePncp);
  if (!partes) return null;

  const url =
    `${urlBaseApiPncp()}/v1/orgaos/${partes.cnpj}/compras/${partes.ano}/${partes.sequencial}/itens`;

  try {
    const resposta = await fetchWithRetry(url, {}, RETRY_PNCP);
    if (!resposta.ok) return null;
    return (await resposta.json()) as ItemContratacaoPNCP[];
  } catch {
    return null;
  }
}

/**
 * Ficha de UMA contratação, pelo numero_controle_pncp.
 *
 * Existe para completar o registro parcial da busca textual: sem as datas de
 * proposta a licitação não tem prazo para acompanhar na aba Licitando, e o
 * registro só era completado se a varredura oficial passasse por ele depois —
 * o que pode nunca acontecer para uma licitação achada por palavra-chave fora
 * do horizonte da varredura.
 *
 * Por que pela busca e não pela rota de detalhe: /v1/orgaos/{cnpj}/compras/
 * {ano}/{seq} responde 301 sem Location (as sub-rotas /itens e /arquivos
 * funcionam, a raiz não), e /contratacoes/proposta só consulta por período,
 * não por número. A busca aceita o próprio número como termo.
 *
 * Retorna null se o número não puder ser interpretado, o PNCP não responder ou
 * o registro não aparecer — o chamador decide seguir sem completar.
 */
export async function buscarContratacao(
  numeroControlePncp: string,
): Promise<LicitacaoColetada | null> {
  if (!partesNumeroControle(numeroControlePncp)) return null;

  const url = new URL(`${urlBasePncp().replace(/\/api\/consulta$/, "")}/api/search/`);
  url.searchParams.set("q", numeroControlePncp);
  url.searchParams.set("tipos_documento", "edital");
  url.searchParams.set("pagina", "1");
  url.searchParams.set("tam_pagina", "10");

  try {
    const resposta = await fetchWithRetry(url, {}, RETRY_PNCP);
    if (!resposta.ok) return null;
    const corpo = (await resposta.json()) as {
      items?: ItemBuscaTextualPNCP[];
    };
    // O termo é o número, mas a busca é textual: casa o exato, não o primeiro.
    const item = (corpo.items ?? []).find(
      (i) => i.numero_controle_pncp === numeroControlePncp,
    );
    if (!item) return null;
    return mapearItemBuscaTextual(item);
  } catch {
    return null;
  }
}

export interface ArquivoContratacaoPNCP {
  sequencialDocumento: number;
  titulo: string | null;
  tipoDocumentoNome: string | null;
  url: string;
}

/**
 * Lista os arquivos publicados de uma contratação (edital, anexos, termo de
 * referência). Retorna null em falha — o chamador decide seguir sem eles.
 */
export async function listarArquivosContratacao(
  numeroControlePncp: string,
): Promise<ArquivoContratacaoPNCP[] | null> {
  const partes = partesNumeroControle(numeroControlePncp);
  if (!partes) return null;

  const url =
    `${urlBaseApiPncp()}/v1/orgaos/${partes.cnpj}/compras/${partes.ano}/${partes.sequencial}/arquivos`;

  try {
    const resposta = await fetchWithRetry(url, {}, RETRY_PNCP);
    if (!resposta.ok) return null;
    const lista = (await resposta.json()) as Array<{
      sequencialDocumento?: number;
      titulo?: string | null;
      tipoDocumentoNome?: string | null;
      url?: string | null;
      uri?: string | null;
      statusAtivo?: boolean;
    }>;
    return lista
      .filter((a) => a.statusAtivo !== false && (a.url || a.uri))
      .map((a) => ({
        sequencialDocumento: a.sequencialDocumento ?? 0,
        titulo: a.titulo ?? null,
        tipoDocumentoNome: a.tipoDocumentoNome ?? null,
        url: (a.url ?? a.uri)!,
      }));
  } catch {
    return null;
  }
}

export type DownloadArquivo =
  | { ok: true; bytes: Uint8Array }
  | { ok: false; motivo: "grande"; bytesTotais: number }
  | { ok: false; motivo: "indisponivel" };

/**
 * Baixa um arquivo de contratação (a URL deve vir da listagem acima — nunca
 * do cliente). O resultado distingue "grande demais" de "PNCP indisponível"
 * para o chamador dar uma mensagem precisa ao usuário.
 */
export async function baixarArquivoContratacao(
  urlArquivo: string,
  maxBytes: number,
): Promise<DownloadArquivo> {
  try {
    const resposta = await fetchWithRetry(urlArquivo, {}, RETRY_PNCP);
    if (!resposta.ok) return { ok: false, motivo: "indisponivel" };
    const bytes = new Uint8Array(await resposta.arrayBuffer());
    if (bytes.length === 0) return { ok: false, motivo: "indisponivel" };
    if (bytes.length > maxBytes) {
      return { ok: false, motivo: "grande", bytesTotais: bytes.length };
    }
    return { ok: true, bytes };
  } catch {
    return { ok: false, motivo: "indisponivel" };
  }
}

/** Mapeia o item bruto do PNCP para o formato interno (colunas de licitacoes). */
export function mapearContratacao(item: ContratacaoPNCP): LicitacaoColetada {
  return {
    numero_controle_pncp: item.numeroControlePNCP,
    data_publicacao_pncp: item.dataPublicacaoPncp ?? null,
    objeto_compra: item.objetoCompra ?? "",
    informacao_complementar: item.informacaoComplementar ?? null,
    valor_total_estimado: item.valorTotalEstimado ?? null,
    data_abertura_proposta: item.dataAberturaProposta ?? null,
    data_encerramento_proposta: item.dataEncerramentoProposta ?? null,
    orgao_cnpj: item.orgaoEntidade?.cnpj ?? null,
    orgao_razao_social: item.orgaoEntidade?.razaoSocial ?? null,
    unidade_nome: item.unidadeOrgao?.nomeUnidade ?? null,
    uf: item.unidadeOrgao?.ufSigla ?? null,
    municipio_nome: item.unidadeOrgao?.municipioNome ?? null,
    modalidade_id: item.modalidadeId ?? null,
    modalidade_nome: item.modalidadeNome ?? null,
    situacao_nome: item.situacaoCompraNome ?? null,
    link_sistema_origem: item.linkSistemaOrigem ?? null,
  };
}
