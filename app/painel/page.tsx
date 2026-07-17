import Link from "next/link";
import { redirect } from "next/navigation";
import { criarClientServidor } from "@/lib/supabase/server";

interface LicitacaoResumida {
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

interface MatchDoPainel {
  id: string;
  created_at: string;
  notificado_em: string | null;
  licitacoes: LicitacaoResumida;
}

export default async function PaginaPainel() {
  const supabase = await criarClientServidor();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // RLS garante que só vêm os matches dos perfis do próprio usuário.
  const { data: perfis } = await supabase
    .from("perfis")
    .select("id, ativo")
    .limit(1);

  const { data: matches, error } = await supabase
    .from("matches")
    .select(
      `id, created_at, notificado_em,
       licitacoes ( numero_controle_pncp, objeto_compra, valor_total_estimado,
         data_encerramento_proposta, orgao_razao_social, municipio_nome, uf,
         modalidade_nome, link_sistema_origem )`,
    )
    .order("created_at", { ascending: false })
    .limit(50);

  const lista = (matches ?? []) as unknown as MatchDoPainel[];
  const temPerfil = (perfis ?? []).length > 0;

  return (
    <>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <h1>Suas oportunidades</h1>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/painel/perfil" className="botao botao-secundario">
            {temPerfil ? "Editar perfil" : "Criar perfil"}
          </Link>
          <form action="/auth/sair" method="post">
            <button type="submit" className="botao botao-secundario">
              Sair
            </button>
          </form>
        </div>
      </div>

      {error && (
        <p className="mensagem-erro">
          Não foi possível carregar seus matches: {error.message}
        </p>
      )}

      {!temPerfil && (
        <div className="cartao">
          <h3>Comece criando o seu perfil</h3>
          <p>
            Informe suas palavras-chave, estados e modalidades — assim que o
            perfil for salvo, buscamos as licitações abertas compatíveis.
          </p>
          <p style={{ marginTop: 12 }}>
            <Link href="/painel/perfil" className="botao">
              Criar perfil
            </Link>
          </p>
        </div>
      )}

      {temPerfil && lista.length === 0 && (
        <div className="cartao">
          <p>
            Nenhum match por enquanto. A busca roda automaticamente ao longo do
            dia — você recebe um email assim que algo compatível aparecer.
          </p>
        </div>
      )}

      {lista.map((match) => {
        const l = match.licitacoes;
        return (
          <div className="cartao item-match" key={match.id}>
            <h3>{l.objeto_compra}</h3>
            <p className="detalhes">
              <span className="etiqueta">{l.modalidade_nome ?? "—"}</span>
              <span className="etiqueta">
                {l.municipio_nome ?? "?"}/{l.uf ?? "?"}
              </span>
              {match.notificado_em === null && (
                <span className="etiqueta">novo</span>
              )}
            </p>
            <p className="detalhes" style={{ marginTop: 8 }}>
              <strong>Valor estimado:</strong>{" "}
              {formatarValor(l.valor_total_estimado)} ·{" "}
              <strong>Propostas até:</strong>{" "}
              {formatarData(l.data_encerramento_proposta)} ·{" "}
              <strong>Órgão:</strong> {l.orgao_razao_social ?? "não informado"}
            </p>
            {l.link_sistema_origem?.startsWith("http") && (
              <p style={{ marginTop: 8 }}>
                <a href={l.link_sistema_origem} target="_blank" rel="noreferrer">
                  Ver no sistema de origem
                </a>
              </p>
            )}
          </div>
        );
      })}
    </>
  );
}

function formatarValor(valor: number | null): string {
  if (valor === null) return "não informado";
  return valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarData(data: string | null): string {
  if (!data) return "não informada";
  const d = new Date(data);
  if (Number.isNaN(d.getTime())) return "não informada";
  return d.toLocaleDateString("pt-BR");
}
