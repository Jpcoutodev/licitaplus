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
