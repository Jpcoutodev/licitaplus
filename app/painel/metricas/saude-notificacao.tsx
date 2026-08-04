export interface DadosSaude {
  fila_pendente: number;
  fila_mais_antiga_horas: number | null;
  fila_perfis_afetados: number;
  ultima_rodada: string | null;
  notificados_ultima_rodada: number;
  emails_hoje: number;
  emails_7d: number;
  matches_dia: number;
  licitacoes_dia: number;
  perfis_ativos: number;
  push_assinaturas: number;
  usuarios: number;
  resumos_cache: number;
  licitacoes_total: number;
  banco_mb: number;
}

/** Vagas de notificação por dia: constantes espelhadas da edge function. */
const PERFIS_POR_RODADA = 40;
const RODADAS_POR_DIA = 7;
const VAGAS_DIA = PERFIS_POR_RODADA * RODADAS_POR_DIA;

/**
 * Diagnóstico da fila. Número solto não avisa nada — o que interessa é se a
 * fila zera depois de cada rodada. Quando para de zerar, é o teto de perfis
 * por execução apertando, e dá para agir antes de virar reclamação.
 */
function diagnosticar(d: DadosSaude): { nivel: string; texto: string } {
  const horas = d.fila_mais_antiga_horas ?? 0;

  if (d.fila_pendente === 0) {
    return {
      nivel: "ok",
      texto: "Fila zerada na última rodada. O sistema está acompanhando o volume.",
    };
  }
  if (horas > 24) {
    return {
      nivel: "erro",
      texto:
        `Há ${d.fila_pendente} pendentes, a mais antiga de ${Math.round(horas)}h, em ${d.fila_perfis_afetados} perfis. Fila que não zera em 24h significa que o teto de ${PERFIS_POR_RODADA} perfis por rodada apertou — ou que os resumos estão falhando. Confira os logs da função notificar.`,
    };
  }
  if (horas > 3) {
    return {
      nivel: "aviso",
      texto:
        `${d.fila_pendente} pendentes, a mais antiga de ${Math.round(horas)}h. Normal se a coleta rodou agora; se persistir na próxima janela, vale investigar.`,
    };
  }
  return {
    nivel: "ok",
    texto:
      `${d.fila_pendente} pendentes recentes, aguardando a próxima janela (a cada 2h).`,
  };
}

function quando(iso: string | null): string {
  if (!iso) return "nunca";
  const d = new Date(iso);
  const horas = (Date.now() - d.getTime()) / 3600000;
  const rotulo = d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  return horas < 1
    ? `${rotulo} (há ${Math.max(1, Math.round(horas * 60))} min)`
    : `${rotulo} (há ${Math.round(horas)}h)`;
}

export function SaudeNotificacao({ dados }: { dados: DadosSaude | null }) {
  if (!dados) return null;

  const diag = diagnosticar(dados);
  const ocupacao = VAGAS_DIA > 0
    ? Math.round((dados.perfis_ativos * 3 / VAGAS_DIA) * 100)
    : 0;
  const pctCache = dados.licitacoes_total > 0
    ? Math.round((dados.resumos_cache / dados.licitacoes_total) * 100)
    : 0;

  return (
    <>
      <div className="cabecalho-pagina" style={{ marginTop: 30 }}>
        <div>
          <h2>Saúde da notificação</h2>
          <p className="texto-suave sem-margem">
            Última rodada: {quando(dados.ultima_rodada)} ·{" "}
            {dados.notificados_ultima_rodada} licitações fechadas.
          </p>
        </div>
      </div>

      <div className={`saude-diagnostico saude-diagnostico--${diag.nivel}`}>
        <strong>
          {diag.nivel === "ok" ? "✅" : diag.nivel === "aviso" ? "⚠️" : "🔴"}{" "}
          Fila
        </strong>
        <p className="sem-margem">{diag.texto}</p>
      </div>

      <div className="metricas-cards">
        <div className="metrica-card">
          <span className="metrica-num">{dados.fila_pendente}</span>
          <span className="metrica-rot texto-suave">Na fila agora</span>
        </div>
        <div className="metrica-card">
          <span className="metrica-num">{dados.emails_hoje}</span>
          <span className="metrica-rot texto-suave">Emails hoje</span>
        </div>
        <div className="metrica-card">
          <span className="metrica-num">{ocupacao}%</span>
          <span className="metrica-rot texto-suave">Capacidade em uso</span>
        </div>
        <div className="metrica-card">
          <span className="metrica-num">{dados.licitacoes_dia}</span>
          <span className="metrica-rot texto-suave">Licitações/dia</span>
        </div>
      </div>

      <div className="dash-grade">
        <div className="cartao">
          <h3>Capacidade</h3>
          <ul className="dash-lista">
            <li>
              <strong>{dados.perfis_ativos}</strong>
              <span>perfis ativos ({dados.usuarios} usuários)</span>
            </li>
            <li>
              <strong>{VAGAS_DIA}</strong>
              <span>
                vagas de notificação por dia ({PERFIS_POR_RODADA} perfis ×{" "}
                {RODADAS_POR_DIA} janelas)
              </span>
            </li>
            <li>
              <strong>{dados.matches_dia}</strong>
              <span>oportunidades encontradas nas últimas 24h</span>
            </li>
            <li>
              <strong>{dados.push_assinaturas}</strong>
              <span>aparelhos com push ativado</span>
            </li>
          </ul>
          {ocupacao >= 80 && (
            <p className="ajuda">
              Acima de 80% da capacidade. Cada usuário aceita até 3 emails/dia;
              perto do teto, alguns passam a receber menos. Hora de subir
              MAX_PERFIS_POR_EXECUCAO na função notificar.
            </p>
          )}
        </div>

        <div className="cartao">
          <h3>Custo</h3>
          <ul className="dash-lista">
            <li>
              <strong>{dados.licitacoes_dia}</strong>
              <span>chamadas de IA por dia, no máximo</span>
            </li>
            <li>
              <strong>{pctCache}%</strong>
              <span>
                do acervo com resumo em cache ({dados.resumos_cache} de{" "}
                {dados.licitacoes_total})
              </span>
            </li>
            <li>
              <strong>{dados.emails_7d}</strong>
              <span>emails nos últimos 7 dias</span>
            </li>
            <li>
              <strong>{dados.banco_mb} MB</strong>
              <span>tamanho do banco</span>
            </li>
          </ul>
          <p className="ajuda">
            O resumo é gerado por licitação, não por usuário — então o custo de
            IA acompanha quantas licitações entram por dia, e não quantos
            clientes você tem.
          </p>
        </div>
      </div>
    </>
  );
}
