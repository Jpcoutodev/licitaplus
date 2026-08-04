"use client";

export interface DadosDashboard {
  total: number;
  favoritos: number;
  com_contato: number;
  followup_vencido: number;
  contratos: number;
  valor_total: number;
  novos_7d: number;
  por_status: Record<string, number>;
  por_porte: Record<string, number>;
  por_uf: Record<string, number>;
}

const ROTULO_STATUS: Record<string, string> = {
  novo: "Novo",
  contatado: "Contatado",
  respondeu: "Respondeu",
  testando: "Testando",
  cliente: "Cliente",
  descartado: "Descartado",
};

/** Ordem do funil: do primeiro contato ao fechamento. */
const ORDEM_FUNIL = [
  "novo", "contatado", "respondeu", "testando", "cliente", "descartado",
];

function compacto(valor: number): string {
  if (valor >= 1_000_000_000) return `R$ ${(valor / 1_000_000_000).toFixed(1)} bi`;
  if (valor >= 1_000_000) return `R$ ${(valor / 1_000_000).toFixed(1)} mi`;
  if (valor >= 1_000) return `R$ ${Math.round(valor / 1_000)} mil`;
  return `R$ ${Math.round(valor)}`;
}

/** Barra proporcional ao maior valor da série — comparação relativa, que é o
 *  que interessa aqui; o número exato fica ao lado. */
function Barras({
  dados,
  rotulos,
  ordem,
}: {
  dados: Record<string, number>;
  rotulos?: Record<string, string>;
  ordem?: string[];
}) {
  const entradas = ordem
    ? ordem.filter((k) => dados[k] !== undefined).map((k) => [k, dados[k]] as const)
    : Object.entries(dados).sort((a, b) => b[1] - a[1]);
  const maior = Math.max(1, ...entradas.map(([, n]) => n));

  if (entradas.length === 0) {
    return <p className="texto-suave sem-margem">Sem dados ainda.</p>;
  }

  return (
    <div className="dash-barras">
      {entradas.map(([chave, n]) => (
        <div key={chave} className="dash-barra-linha">
          <span className="dash-barra-rotulo">
            {rotulos?.[chave] ?? chave}
          </span>
          <span className="dash-barra-trilho">
            <span
              className="dash-barra-fill"
              style={{ width: `${Math.round((n / maior) * 100)}%` }}
            />
          </span>
          <strong className="dash-barra-num">{n.toLocaleString("pt-BR")}</strong>
        </div>
      ))}
    </div>
  );
}

export function Dashboard({ dados }: { dados: DadosDashboard | null }) {
  if (!dados) {
    return (
      <div className="cartao">
        <p className="texto-suave sem-margem">Sem dados ainda.</p>
      </div>
    );
  }

  const trabalhados = (dados.total ?? 0) - (dados.por_status?.novo ?? 0);
  const pctTrabalhado = dados.total > 0
    ? Math.round((trabalhados / dados.total) * 100)
    : 0;

  return (
    <>
      <div className="metricas-cards">
        <div className="metrica-card">
          <span className="metrica-num">
            {dados.total.toLocaleString("pt-BR")}
          </span>
          <span className="metrica-rot texto-suave">Empresas</span>
        </div>
        <div className="metrica-card">
          <span className="metrica-num">
            {dados.contratos.toLocaleString("pt-BR")}
          </span>
          <span className="metrica-rot texto-suave">Contratos coletados</span>
        </div>
        <div className="metrica-card">
          <span className="metrica-num">{compacto(dados.valor_total)}</span>
          <span className="metrica-rot texto-suave">Movimentado por elas</span>
        </div>
        <div className="metrica-card">
          <span className="metrica-num">{pctTrabalhado}%</span>
          <span className="metrica-rot texto-suave">Já trabalhados</span>
        </div>
      </div>

      <div className="dash-grade">
        <div className="cartao">
          <h3>Funil de prospecção</h3>
          <div style={{ marginTop: 14 }}>
            <Barras
              dados={dados.por_status ?? {}}
              rotulos={ROTULO_STATUS}
              ordem={ORDEM_FUNIL}
            />
          </div>
        </div>

        <div className="cartao">
          <h3>A fazer agora</h3>
          <ul className="dash-lista">
            <li>
              <strong>{dados.followup_vencido.toLocaleString("pt-BR")}</strong>
              <span>retornos vencidos</span>
            </li>
            <li>
              <strong>{dados.favoritos.toLocaleString("pt-BR")}</strong>
              <span>favoritos marcados</span>
            </li>
            <li>
              <strong>{dados.com_contato.toLocaleString("pt-BR")}</strong>
              <span>com email ou telefone</span>
            </li>
            <li>
              <strong>{dados.novos_7d.toLocaleString("pt-BR")}</strong>
              <span>entraram nos últimos 7 dias</span>
            </li>
          </ul>
          {dados.com_contato < dados.total && (
            <p className="ajuda">
              {(dados.total - dados.com_contato).toLocaleString("pt-BR")}{" "}
              empresas ainda sem contato — use &quot;Buscar contato (CNPJ)&quot;
              na ficha de cada uma.
            </p>
          )}
        </div>

        <div className="cartao">
          <h3>Porte da empresa</h3>
          <p className="ajuda" style={{ marginTop: 0 }}>
            Só aparece depois de consultar o CNPJ na Receita.
          </p>
          <div style={{ marginTop: 10 }}>
            <Barras dados={dados.por_porte ?? {}} />
          </div>
        </div>

        <div className="cartao">
          <h3>Top estados</h3>
          <div style={{ marginTop: 14 }}>
            <Barras dados={dados.por_uf ?? {}} />
          </div>
        </div>
      </div>
    </>
  );
}
