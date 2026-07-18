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
 *  - os itens não trazem as datas de proposta nem sempre trazem valor —
 *    a varredura oficial enriquece o registro depois (upsert com merge).
 */
export async function buscarPorTermoTextual(
  termo: string,
  uf: string,
): Promise<LicitacaoColetada[]> {
  const url = new URL(`${urlBasePncp().replace(/\/api\/consulta$/, "")}/api/search/`);
  url.searchParams.set("q", termo);
  url.searchParams.set("tipos_documento", "edital");
  url.searchParams.set("status", "recebendo_proposta");
  url.searchParams.set("ufs", uf);
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
    objeto_compra: item.description ?? "",
    informacao_complementar: null,
    valor_total_estimado: item.valor_global ?? null,
    data_abertura_proposta: null,
    data_encerramento_proposta: null,
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
    raw_json: item as unknown as ContratacaoPNCP,
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

/**
 * Busca os itens de uma contratação na API principal do PNCP, a partir do
 * numero_controle_pncp (formato "CNPJ-1-SEQUENCIAL/ANO"). Retorna null se o
 * número não puder ser interpretado ou o PNCP não responder — o chamador
 * decide seguir sem os itens.
 */
export async function buscarItensContratacao(
  numeroControlePncp: string,
): Promise<ItemContratacaoPNCP[] | null> {
  const partes = numeroControlePncp.match(/^(\d{14})-\d-(\d+)\/(\d{4})$/);
  if (!partes) return null;
  const [, cnpj, sequencial, ano] = partes;

  const base = lerEnv("PNCP_ITENS_BASE_URL") ?? "https://pncp.gov.br/api/pncp";
  const url =
    `${base}/v1/orgaos/${cnpj}/compras/${ano}/${Number(sequencial)}/itens`;

  try {
    const resposta = await fetchWithRetry(url, {}, RETRY_PNCP);
    if (!resposta.ok) return null;
    return (await resposta.json()) as ItemContratacaoPNCP[];
  } catch {
    return null;
  }
}

/** Mapeia o item bruto do PNCP para o formato interno (colunas de licitacoes). */
export function mapearContratacao(item: ContratacaoPNCP): LicitacaoColetada {
  return {
    numero_controle_pncp: item.numeroControlePNCP,
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
    raw_json: item,
  };
}
