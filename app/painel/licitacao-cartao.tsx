import Link from "next/link";
import { FavoritoBotao } from "./favorito-botao";
import { OcultarBotao } from "./ocultar-botao";

export interface LicitacaoCartaoDados {
  id: string;
  numero_controle_pncp: string;
  objeto_compra: string;
  valor_total_estimado: number | null;
  data_encerramento_proposta: string | null;
  orgao_razao_social: string | null;
  municipio_nome: string | null;
  uf: string | null;
  modalidade_nome: string | null;
  link_sistema_origem: string | null;
}

export function formatarValor(valor: number | null): string {
  if (valor === null) return "não informado";
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function formatarData(data: string | null): string {
  if (!data) return "não informada";
  const d = new Date(data);
  if (Number.isNaN(d.getTime())) return "não informada";
  return d.toLocaleDateString("pt-BR");
}

/**
 * Monta o link da página oficial da licitação no PNCP a partir do número de
 * controle ("CNPJ-1-SEQUENCIAL/ANO"). Toda licitação tem esse número, então
 * o link do PNCP está sempre disponível — ao contrário do link do sistema de
 * origem, que o órgão pode não informar.
 */
export function linkPaginaPncp(numeroControle: string): string | null {
  const partes = numeroControle.match(/^(\d{14})-\d-(\d+)\/(\d{4})$/);
  if (!partes) return null;
  const [, cnpj, sequencial, ano] = partes;
  return `https://pncp.gov.br/app/editais/${cnpj}/${ano}/${Number(sequencial)}`;
}

/** Cartão de licitação usado no painel e nos favoritos. */
export function LicitacaoCartao({
  licitacao,
  favoritoId,
  nova = false,
  mostrarAnalise = false,
  matchId = null,
}: {
  licitacao: LicitacaoCartaoDados;
  favoritoId: string | null;
  nova?: boolean;
  mostrarAnalise?: boolean;
  /** Quando presente, mostra a ação "Ocultar" (usa matches.oculto). */
  matchId?: string | null;
}) {
  const l = licitacao;
  const linkPncp = linkPaginaPncp(l.numero_controle_pncp);
  // Só mostra "sistema de origem" se for um link externo de fato (não o PNCP).
  const linkOrigem = l.link_sistema_origem?.startsWith("http") &&
      !l.link_sistema_origem.includes("pncp.gov.br")
    ? l.link_sistema_origem
    : null;
  return (
    <div className="cartao item-licitacao">
      <div className="estrela-canto">
        <FavoritoBotao licitacaoId={l.id} favoritoIdInicial={favoritoId} />
      </div>

      <h3>{l.objeto_compra}</h3>
      <p className="detalhes">
        <span className="etiqueta">{l.modalidade_nome ?? "—"}</span>
        <span className="etiqueta">
          {l.municipio_nome ?? "?"}/{l.uf ?? "?"}
        </span>
        {nova && <span className="etiqueta etiqueta-nova">novo</span>}
      </p>
      <p className="detalhes" style={{ marginTop: 8 }}>
        <strong>Valor estimado:</strong> {formatarValor(l.valor_total_estimado)}{" "}
        · <strong>Propostas até:</strong>{" "}
        {formatarData(l.data_encerramento_proposta)} · <strong>Órgão:</strong>{" "}
        {l.orgao_razao_social ?? "não informado"}
      </p>
      <p style={{ marginTop: 10, display: "flex", gap: 14, flexWrap: "wrap" }}>
        {mostrarAnalise && (
          <Link href={`/painel/analise?licitacao=${l.id}`}>
            Analisar com IA →
          </Link>
        )}
        {linkPncp && (
          <a href={linkPncp} target="_blank" rel="noreferrer">
            Ver no PNCP ↗
          </a>
        )}
        {linkOrigem && (
          <a href={linkOrigem} target="_blank" rel="noreferrer">
            Ver no sistema de origem ↗
          </a>
        )}
        {matchId && <OcultarBotao matchId={matchId} />}
      </p>
    </div>
  );
}
