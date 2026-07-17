import Link from "next/link";
import { FavoritoBotao } from "./favorito-botao";

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

/** Cartão de licitação usado no painel e nos favoritos. */
export function LicitacaoCartao({
  licitacao,
  favoritoId,
  nova = false,
  mostrarAnalise = false,
}: {
  licitacao: LicitacaoCartaoDados;
  favoritoId: string | null;
  nova?: boolean;
  mostrarAnalise?: boolean;
}) {
  const l = licitacao;
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
        {l.link_sistema_origem?.startsWith("http") && (
          <a href={l.link_sistema_origem} target="_blank" rel="noreferrer">
            Ver no sistema de origem ↗
          </a>
        )}
      </p>
    </div>
  );
}
