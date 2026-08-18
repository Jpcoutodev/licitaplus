import { redirect } from "next/navigation";
import { criarClientServidor } from "@/lib/supabase/server";
import { LeadToggle } from "./lead-toggle";
import { SaudeNotificacao, type DadosSaude } from "./saude-notificacao";

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

interface LinhaFunil {
  evento: string;
  total: number;
  usuarios: number;
}

interface EventoAssinatura {
  id: string;
  evento: string;
  email: string | null;
  empresa: string | null;
  plano: string | null;
  detalhe: string | null;
  created_at: string;
}

/** Ordem do funil, do topo (clicou) ao fundo (assinou) e às saídas. */
const FUNIL_ORDEM = [
  "checkout_iniciado",
  "assinatura_ativada",
  "checkout_expirado",
  "checkout_erro",
  "plano_trocado",
  "pagamento_falhou",
  "assinatura_cancelada",
];

const ROTULO_FUNIL: Record<string, string> = {
  checkout_iniciado: "Clicaram em assinar",
  assinatura_ativada: "Assinaram",
  checkout_expirado: "Desistiram",
  checkout_erro: "Deu erro",
  plano_trocado: "Trocaram de plano",
  pagamento_falhou: "Pagamento falhou",
  assinatura_cancelada: "Cancelaram",
};

const ROTULO_ACAO: Record<string, string> = {
  anexar_pncp: "Anexo (PNCP)",
  anexar_upload: "Anexo (upload)",
  resumo_executivo: "Resumo executivo",
  planilha_materiais: "Planilha de materiais",
  modelo_proposta: "Modelo de proposta",
  modelo_declaracoes: "Modelo de declarações",
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
  // Saúde da notificação: o sinal que avisa antes de virar reclamação.
  const { data: saudeData } = await supabase.rpc("saude_notificacao");
  const saude = (saudeData ?? null) as DadosSaude | null;

  // Funil de assinatura: agregado dos últimos 30 dias + eventos recentes.
  const { data: funilData } = await supabase.rpc("funil_assinatura", {
    dias: 30,
  });
  const funil = new Map(
    ((funilData ?? []) as LinhaFunil[]).map((l) => [l.evento, l]),
  );

  const { data: assinaturaData } = await supabase.rpc(
    "eventos_assinatura_recentes",
    { limite: 40 },
  );
  const eventosAssinatura = (assinaturaData ?? []) as EventoAssinatura[];

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

  // Leads de consultoria (RLS: só admin).
  const { data: leadsData } = await supabase
    .from("consultoria_leads")
    .select("id, nome, empresa, telefone, email, mensagem, atendido, created_at")
    .order("created_at", { ascending: false })
    .limit(50);
  const leads = (leadsData ?? []) as Array<{
    id: string;
    nome: string;
    empresa: string | null;
    telefone: string;
    email: string | null;
    mensagem: string | null;
    atendido: boolean;
    created_at: string;
  }>;
  const leadsPendentes = leads.filter((l) => !l.atendido).length;

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

      <SaudeNotificacao dados={saude} />

      {/* Funil de assinatura */}
      <div className="cabecalho-pagina" style={{ marginTop: 30 }}>
        <div>
          <h2>Funil de assinatura</h2>
          <p className="texto-suave sem-margem">
            Últimos 30 dias. &quot;Desistiram&quot; são checkouts abertos que
            venceram sem pagamento — o Stripe leva até 24h para confirmar.
          </p>
        </div>
      </div>

      <div className="cartao" style={{ overflowX: "auto" }}>
        <table className="tabela-metricas">
          <thead>
            <tr>
              <th>Etapa</th>
              <th>Eventos</th>
              <th>Pessoas</th>
            </tr>
          </thead>
          <tbody>
            {FUNIL_ORDEM.map((chave) => {
              const linha = funil.get(chave);
              return (
                <tr key={chave}>
                  <td>{ROTULO_FUNIL[chave]}</td>
                  <td>{(linha?.total ?? 0).toLocaleString("pt-BR")}</td>
                  <td>{(linha?.usuarios ?? 0).toLocaleString("pt-BR")}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {eventosAssinatura.length === 0 ? (
        <div className="cartao">
          <p className="texto-suave sem-margem">
            Nenhum evento de assinatura ainda.
          </p>
        </div>
      ) : (
        <div className="cartao" style={{ overflowX: "auto" }}>
          <table className="tabela-metricas">
            <thead>
              <tr>
                <th>Quando</th>
                <th>Quem</th>
                <th>Etapa</th>
                <th>Plano</th>
                <th>Detalhe</th>
              </tr>
            </thead>
            <tbody>
              {eventosAssinatura.map((e) => (
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
                    {e.email ?? "—"}
                    {e.empresa && (
                      <span className="texto-suave"> · {e.empresa}</span>
                    )}
                  </td>
                  <td>{ROTULO_FUNIL[e.evento] ?? e.evento}</td>
                  <td>{e.plano ?? "—"}</td>
                  <td className="texto-suave">{e.detalhe ?? "—"}</td>
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

      <div className="cabecalho-pagina" style={{ marginTop: 30 }}>
        <div>
          <h2>Pedidos de consultoria</h2>
          <p className="texto-suave sem-margem">
            {leadsPendentes > 0
              ? `${leadsPendentes} pendente(s) de contato.`
              : "Leads recebidos pelo formulário de consultoria."}
          </p>
        </div>
      </div>

      {leads.length === 0 ? (
        <div className="cartao">
          <p className="texto-suave sem-margem">Nenhum pedido de consultoria ainda.</p>
        </div>
      ) : (
        <div className="cartao" style={{ overflowX: "auto" }}>
          <table className="tabela-metricas">
            <thead>
              <tr>
                <th>Quando</th>
                <th>Nome</th>
                <th>Empresa</th>
                <th>Telefone</th>
                <th>Mensagem</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.id}>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {new Date(l.created_at).toLocaleString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td>{l.nome}</td>
                  <td>{l.empresa ?? "—"}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{l.telefone}</td>
                  <td
                    style={{
                      maxWidth: 320,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={`${l.mensagem ?? ""}${l.email ? ` · ${l.email}` : ""}`}
                  >
                    {l.mensagem ?? (l.email ? l.email : "—")}
                  </td>
                  <td>
                    <LeadToggle id={l.id} inicial={l.atendido} />
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
