import Link from "next/link";
import { redirect } from "next/navigation";
import { criarClientServidor } from "@/lib/supabase/server";
import {
  LicitacaoCartao,
  type LicitacaoCartaoDados,
} from "./licitacao-cartao";

interface MatchDoPainel {
  id: string;
  created_at: string;
  notificado_em: string | null;
  licitacoes: LicitacaoCartaoDados;
}

export default async function PaginaPainel({
  searchParams,
}: {
  searchParams: Promise<{ ocultas?: string }>;
}) {
  const supabase = await criarClientServidor();
  const verOcultas = (await searchParams)?.ocultas === "1";

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // RLS garante que só vêm dados do próprio usuário.
  const [
    { data: perfis },
    { data: matches, error },
    { data: favoritos },
    { count: qtdOcultas },
  ] = await Promise.all([
    supabase.from("perfis").select("id, ativo").limit(1),
    supabase
      .from("matches")
      .select(
        `id, created_at, notificado_em,
           licitacoes ( id, numero_controle_pncp, objeto_compra,
             valor_total_estimado, data_encerramento_proposta,
             orgao_razao_social, municipio_nome, uf, modalidade_nome,
             link_sistema_origem )`,
      )
      .eq("oculto", verOcultas)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("favoritos").select("id, licitacao_id"),
    supabase
      .from("matches")
      .select("id", { count: "exact", head: true })
      .eq("oculto", true),
  ]);

  const lista = (matches ?? []) as unknown as MatchDoPainel[];
  const temPerfil = (perfis ?? []).length > 0;
  const totalOcultas = qtdOcultas ?? 0;
  const favoritoPorLicitacao = new Map(
    (favoritos ?? []).map((f) => [f.licitacao_id as string, f.id as string]),
  );

  return (
    <>
      <div className="cabecalho-pagina">
        <div>
          <h1>{verOcultas ? "Licitações ocultas" : "Suas oportunidades"}</h1>
          <p className="texto-suave sem-margem">
            {verOcultas
              ? "Licitações que você ocultou. Reexiba para voltar ao painel."
              : "Licitações do PNCP compatíveis com o seu perfil de busca."}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {verOcultas ? (
            <Link href="/painel" className="botao botao-secundario">
              ← Voltar ao painel
            </Link>
          ) : (
            <>
              {totalOcultas > 0 && (
                <Link
                  href="/painel?ocultas=1"
                  className="botao botao-secundario"
                >
                  Ver ocultas ({totalOcultas})
                </Link>
              )}
              <Link href="/painel/perfil" className="botao botao-secundario">
                {temPerfil ? "Editar perfil" : "Criar perfil"}
              </Link>
            </>
          )}
        </div>
      </div>

      {error && (
        <p className="mensagem-erro">
          Não foi possível carregar seus matches: {error.message}
        </p>
      )}

      {verOcultas && lista.length === 0 && (
        <div className="cartao">
          <p className="texto-suave sem-margem">
            Nenhuma licitação oculta.
          </p>
        </div>
      )}

      {!verOcultas && !temPerfil && (
        <div className="cartao">
          <h3>Comece criando o seu perfil de busca</h3>
          <p className="texto-suave">
            Informe suas palavras-chave, estados e modalidades — assim que o
            perfil for salvo, buscamos as licitações abertas compatíveis.
          </p>
          <p style={{ marginTop: 14 }}>
            <Link href="/painel/perfil" className="botao">
              Criar perfil
            </Link>
          </p>
        </div>
      )}

      {!verOcultas && temPerfil && lista.length === 0 && (
        <div className="cartao">
          <p className="texto-suave">
            Nenhum match por enquanto. A busca roda automaticamente ao longo do
            dia — você recebe um email assim que algo compatível aparecer.
          </p>
        </div>
      )}

      {lista.map((match) => (
        <LicitacaoCartao
          key={match.id}
          licitacao={match.licitacoes}
          favoritoId={favoritoPorLicitacao.get(match.licitacoes.id) ?? null}
          nova={match.notificado_em === null}
          mostrarAnalise
          matchId={match.id}
          reexibir={verOcultas}
        />
      ))}
    </>
  );
}
