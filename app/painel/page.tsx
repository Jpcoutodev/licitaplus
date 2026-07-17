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

export default async function PaginaPainel() {
  const supabase = await criarClientServidor();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // RLS garante que só vêm dados do próprio usuário.
  const [{ data: perfis }, { data: matches, error }, { data: favoritos }] =
    await Promise.all([
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
        .order("created_at", { ascending: false })
        .limit(50),
      supabase.from("favoritos").select("id, licitacao_id"),
    ]);

  const lista = (matches ?? []) as unknown as MatchDoPainel[];
  const temPerfil = (perfis ?? []).length > 0;
  const favoritoPorLicitacao = new Map(
    (favoritos ?? []).map((f) => [f.licitacao_id as string, f.id as string]),
  );

  return (
    <>
      <div className="cabecalho-pagina">
        <div>
          <h1>Suas oportunidades</h1>
          <p className="texto-suave sem-margem">
            Licitações do PNCP compatíveis com o seu perfil de busca.
          </p>
        </div>
        <Link href="/painel/perfil" className="botao botao-secundario">
          {temPerfil ? "Editar perfil" : "Criar perfil"}
        </Link>
      </div>

      {error && (
        <p className="mensagem-erro">
          Não foi possível carregar seus matches: {error.message}
        </p>
      )}

      {!temPerfil && (
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

      {temPerfil && lista.length === 0 && (
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
        />
      ))}
    </>
  );
}
