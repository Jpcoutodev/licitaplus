/**
 * Tipos da API de consulta do PNCP e do formato interno de licitação.
 * Somente os campos que o sistema usa são tipados explicitamente; o restante
 * é preservado em raw_json para reprocessamento futuro.
 */

export interface OrgaoEntidadePNCP {
  cnpj: string | null;
  razaoSocial: string | null;
}

export interface UnidadeOrgaoPNCP {
  ufSigla: string | null;
  municipioNome: string | null;
  nomeUnidade: string | null;
}

export interface ContratacaoPNCP {
  numeroControlePNCP: string;
  objetoCompra: string | null;
  informacaoComplementar: string | null;
  valorTotalEstimado: number | null;
  dataAberturaProposta: string | null;
  dataEncerramentoProposta: string | null;
  modalidadeId: number | null;
  modalidadeNome: string | null;
  situacaoCompraNome: string | null;
  linkSistemaOrigem: string | null;
  orgaoEntidade: OrgaoEntidadePNCP | null;
  unidadeOrgao: UnidadeOrgaoPNCP | null;
  /** Demais campos do PNCP, preservados sem tipagem em raw_json. */
  [campo: string]: unknown;
}

export interface PaginaPNCP<T> {
  data: T[] | null;
  totalRegistros: number;
  totalPaginas: number;
  numeroPagina: number;
  paginasRestantes: number;
  empty: boolean;
}

/** Formato interno: espelha as colunas da tabela public.licitacoes. */
export interface LicitacaoColetada {
  numero_controle_pncp: string;
  objeto_compra: string;
  informacao_complementar: string | null;
  valor_total_estimado: number | null;
  data_abertura_proposta: string | null;
  data_encerramento_proposta: string | null;
  orgao_cnpj: string | null;
  orgao_razao_social: string | null;
  unidade_nome: string | null;
  uf: string | null;
  municipio_nome: string | null;
  modalidade_id: number | null;
  modalidade_nome: string | null;
  situacao_nome: string | null;
  link_sistema_origem: string | null;
  raw_json: ContratacaoPNCP;
}
