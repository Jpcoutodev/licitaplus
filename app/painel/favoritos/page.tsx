import Link from "next/link";
import { redirect } from "next/navigation";
import { criarClientServidor } from "@/lib/supabase/server";
import {
  LicitacaoCartao,
  type LicitacaoCartaoDados,
} from "../licitacao-cartao";

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

  const { data, error } = await supabase
    .from("favoritos")
    .select(
      `id,
       licitacoes ( id, numero_controle_pncp, objeto_compra,
         valor_total_estimado, data_encerramento_proposta,
         orgao_razao_social, municipio_nome, uf, modalidade_nome,
         link_sistema_origem )`,
    )
    .order("created_at", { ascending: false });

  const lista = (data ?? []) as unknown as FavoritoComLicitacao[];

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

      {lista.map((favorito) => (
        <LicitacaoCartao
          key={favorito.id}
          licitacao={favorito.licitacoes}
          favoritoId={favorito.id}
          mostrarAnalise
        />
      ))}
    </>
  );
}
