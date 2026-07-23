import { redirect } from "next/navigation";
import { criarClientServidor } from "@/lib/supabase/server";

interface LinhaResumo {
  caminho: string;
  visualizacoes: number;
  conversoes: number;
  taxa_conversao: number | null;
}

interface EventoIA {
  id: string;
  user_id: string | null;
  acao: string;
  sucesso: boolean;
  erro: string | null;
  detalhes: Record<string, unknown> | null;
  duracao_ms: number | null;
  created_at: string;
}

const ROTULO_ACAO: Record<string, string> = {
  anexar_pncp: "Anexo (PNCP)",
  anexar_upload: "Anexo (upload)",
  resumo_executivo: "Resumo executivo",
  conversa: "Conversa",
  busca_ia: "Busca da IA",
  favoritar_ia: "Favoritar da IA",
};

function detalheDoEvento(e: EventoIA): string {
  if (e.erro) return e.erro;
  const d = e.detalhes ?? {};
  if (typeof d.nome === "string" && d.nome) {
    const extra = typeof d.caracteres === "number"
      ? ` · ${Math.round((d.caracteres as number) / 1000)}k chars`
      : "";
    return `${d.nome}${extra}`;
  }
  if (typeof d.termo === "string" && d.termo) {
    return `"${d.termo}"${d.uf ? ` (${d.uf})` : ""} → ${d.resultados ?? "?"} resultado(s)`;
  }
  if (typeof d.numero_controle === "string") return d.numero_controle;
  if (typeof d.caracteres_resposta === "number") {
    return `resposta de ${Math.round((d.caracteres_resposta as number) / 1000)}k chars`;
  }
  return "—";
}

export default async function PaginaMetricas() {
  const supabase = await criarClientServidor();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // resumo_paginas() é restrita a admins; erro = sem permissão.
  const { data, error } = await supabase.rpc("resumo_paginas");
  const linhas = (data ?? []) as LinhaResumo[];

  // Telemetria da IA (RLS: só admin enxerga) + nome das empresas.
  const { data: eventosData } = await supabase
    .from("ia_eventos")
    .select("id, user_id, acao, sucesso, erro, detalhes, duracao_ms, created_at")
    .order("created_at", { ascending: false })
    .limit(40);
  const eventos = (eventosData ?? []) as EventoIA[];
  const idsUsuarios = [
    ...new Set(eventos.map((e) => e.user_id).filter(Boolean)),
  ] as string[];
  const { data: contas } = idsUsuarios.length > 0
    ? await supabase
      .from("contas")
      .select("user_id, nome_empresa")
      .in("user_id", idsUsuarios)
    : { data: [] };
  const empresaPorUsuario = new Map(
    (contas ?? []).map((c) => [c.user_id as string, c.nome_empresa as string]),
  );

  if (error) {
    return (
      <>
        <div className="cabecalho-pagina">
          <h1>Métricas</h1>
        </div>
        <div className="cartao">
          <p className="texto-suave">
            Acesso restrito. Esta área é apenas para administradores.
          </p>
        </div>
      </>
    );
  }

  const totalViews = linhas.reduce((s, l) => s + l.visualizacoes, 0);
  const totalConv = linhas.reduce((s, l) => s + l.conversoes, 0);
  const taxaGeral = totalViews > 0
    ? Math.round((totalConv / totalViews) * 1000) / 10
    : 0;

  return (
    <>
      <div className="cabecalho-pagina">
        <div>
          <h1>Métricas</h1>
          <p className="texto-suave sem-margem">
            Visualizações e conversões por página (cliques no CTA de teste).
          </p>
        </div>
      </div>

      <div className="metricas-cards">
        <div className="metrica-card">
          <span className="metrica-num">{totalViews.toLocaleString("pt-BR")}</span>
          <span className="metrica-rot texto-suave">Visualizações</span>
        </div>
        <div className="metrica-card">
          <span className="metrica-num">{totalConv.toLocaleString("pt-BR")}</span>
          <span className="metrica-rot texto-suave">Conversões</span>
        </div>
        <div className="metrica-card">
          <span className="metrica-num">{taxaGeral}%</span>
          <span className="metrica-rot texto-suave">Taxa de conversão</span>
        </div>
      </div>

      {linhas.length === 0 ? (
        <div className="cartao">
          <p className="texto-suave">
            Ainda não há dados. Os eventos aparecem aqui conforme as páginas são
            visitadas.
          </p>
        </div>
      ) : (
        <div className="cartao" style={{ overflowX: "auto" }}>
          <table className="tabela-metricas">
            <thead>
              <tr>
                <th>Página</th>
                <th>Views</th>
                <th>Conversões</th>
                <th>Taxa</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.caminho}>
                  <td>{l.caminho}</td>
                  <td>{l.visualizacoes.toLocaleString("pt-BR")}</td>
                  <td>{l.conversoes.toLocaleString("pt-BR")}</td>
                  <td>{l.taxa_conversao ?? 0}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="cabecalho-pagina" style={{ marginTop: 30 }}>
        <div>
          <h2>Atividade da IA</h2>
          <p className="texto-suave sem-margem">
            Anexos de documento, resumos executivos, buscas e falhas — os 40
            eventos mais recentes.
          </p>
        </div>
      </div>

      {eventos.length === 0 ? (
        <div className="cartao">
          <p className="texto-suave sem-margem">
            Nenhum evento registrado ainda.
          </p>
        </div>
      ) : (
        <div className="cartao" style={{ overflowX: "auto" }}>
          <table className="tabela-metricas">
            <thead>
              <tr>
                <th>Quando</th>
                <th>Empresa</th>
                <th>Ação</th>
                <th>OK</th>
                <th>Detalhe</th>
                <th>Tempo</th>
              </tr>
            </thead>
            <tbody>
              {eventos.map((e) => (
                <tr key={e.id}>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {new Date(e.created_at).toLocaleString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td>
                    {(e.user_id && empresaPorUsuario.get(e.user_id)) ?? "—"}
                  </td>
                  <td>{ROTULO_ACAO[e.acao] ?? e.acao}</td>
                  <td>{e.sucesso ? "✅" : "❌"}</td>
                  <td
                    style={{
                      maxWidth: 380,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      color: e.erro ? "var(--erro)" : undefined,
                    }}
                    title={detalheDoEvento(e)}
                  >
                    {detalheDoEvento(e)}
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {e.duracao_ms != null
                      ? `${(e.duracao_ms / 1000).toFixed(1)}s`
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
