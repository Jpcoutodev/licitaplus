import Link from "next/link";
import { redirect } from "next/navigation";
import { criarClientServidor } from "@/lib/supabase/server";
import {
  LicitacaoCartao,
  type LicitacaoCartaoDados,
} from "../licitacao-cartao";
import { CompletarPendentes } from "../completar-pendentes";

interface FavoritoComLicitacao {
  id: string;
  licitacoes: LicitacaoCartaoDados;
}

export default async function PaginaFavoritos() {
  const supabase = await criarClientServidor();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data, error }, { data: participacoes }] = await Promise.all([
    supabase
      .from("favoritos")
      .select(
        `id,
       licitacoes ( id, numero_controle_pncp, objeto_compra,
         valor_total_estimado, data_encerramento_proposta,
         orgao_razao_social, municipio_nome, uf, modalidade_nome,
         link_sistema_origem )`,
      )
      .order("created_at", { ascending: false }),
    supabase.from("participacoes").select("licitacao_id"),
  ]);

  const lista = (data ?? []) as unknown as FavoritoComLicitacao[];
  const participando = new Set(
    (participacoes ?? []).map((p) => p.licitacao_id as string),
  );
  const incompletas = lista
    .filter(
      (f) =>
        f.licitacoes.data_encerramento_proposta === null ||
        f.licitacoes.valor_total_estimado === null,
    )
    .map((f) => f.licitacoes.id);

  return (
    <>
      <div className="cabecalho-pagina">
        <div>
          <h1>Favoritos</h1>
          <p className="texto-suave sem-margem">
            As licitações que você marcou com ★ — a IA usa esta lista na
            análise.
          </p>
        </div>
      </div>

      {error && (
        <p className="mensagem-erro">
          Não foi possível carregar os favoritos: {error.message}
        </p>
      )}

      {lista.length === 0 && (
        <div className="cartao">
          <p className="texto-suave">
            Você ainda não favoritou nenhuma licitação. No{" "}
            <Link href="/painel">painel</Link>, clique na estrela ☆ de uma
            oportunidade interessante para guardá-la aqui.
          </p>
        </div>
      )}

      {incompletas.length > 0 && <CompletarPendentes ids={incompletas} />}

      {lista.map((favorito) => (
        <LicitacaoCartao
          key={favorito.id}
          licitacao={favorito.licitacoes}
          favoritoId={favorito.id}
          participando={participando.has(favorito.licitacoes.id)}
          mostrarAnalise
        />
      ))}
    </>
  );
}
