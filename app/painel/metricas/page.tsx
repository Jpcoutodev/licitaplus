import { redirect } from "next/navigation";
import { criarClientServidor } from "@/lib/supabase/server";

interface LinhaResumo {
  caminho: string;
  visualizacoes: number;
  conversoes: number;
  taxa_conversao: number | null;
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
    </>
  );
}
