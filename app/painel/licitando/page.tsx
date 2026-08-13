import { redirect } from "next/navigation";
import { criarClientServidor } from "@/lib/supabase/server";
import {
  PainelLicitando,
  type ItemParticipacao,
  type LicitacaoParticipando,
} from "./painel-licitando";

interface LinhaParticipacao {
  id: string;
  status: string;
  licitacoes: LicitacaoParticipando;
}

export default async function PaginaLicitando() {
  const supabase = await criarClientServidor();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data, error }, { data: favoritos }] = await Promise.all([
    supabase
      .from("participacoes")
      .select(
        `id, status,
         licitacoes ( id, numero_controle_pncp, objeto_compra,
           valor_total_estimado, data_abertura_proposta,
           data_encerramento_proposta, orgao_razao_social, municipio_nome,
           uf, modalidade_nome, link_sistema_origem )`,
      )
      .order("created_at", { ascending: false }),
    supabase.from("favoritos").select("licitacao_id"),
  ]);

  const favoritas = new Set(
    (favoritos ?? []).map((f) => f.licitacao_id as string),
  );

  const itens: ItemParticipacao[] = (
    (data ?? []) as unknown as LinhaParticipacao[]
  ).map((linha) => ({
    id: linha.id,
    status: linha.status,
    favorita: favoritas.has(linha.licitacoes.id),
    licitacao: linha.licitacoes,
  }));

  return (
    <>
      <div className="cabecalho-pagina">
        <div>
          <h1>Licitando</h1>
          <p className="texto-suave sem-margem">
            As licitações que sua empresa está disputando, com os prazos de
            proposta no calendário. Clique num dia marcado para ver só o que
            tem prazo nele.
          </p>
        </div>
      </div>

      {error && (
        <p className="mensagem-erro">
          Não foi possível carregar suas licitações: {error.message}
        </p>
      )}

      <PainelLicitando itens={itens} />
    </>
  );
}
