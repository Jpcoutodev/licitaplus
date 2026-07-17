/**
 * Utilitários HTTP genéricos: todo acesso externo do sistema (PNCP, IA,
 * Resend) passa por fetchWithRetry — timeout, retry com backoff exponencial
 * e jitter.
 */

export interface RetryOptions {
  /** Número total de tentativas (padrão 3). */
  tentativas?: number;
  /** Timeout por tentativa, em ms (padrão 30s). */
  timeoutMs?: number;
  /** Atraso-base do backoff exponencial, em ms (padrão 1s). */
  baseDelayMs?: number;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * fetch com timeout e retry (backoff exponencial + jitter).
 * Repete apenas erros transitórios: falha de rede, timeout, HTTP 5xx e 429.
 * Qualquer outro status é devolvido ao chamador decidir.
 */
export async function fetchWithRetry(
  url: string | URL,
  init: RequestInit = {},
  opcoes: RetryOptions = {},
): Promise<Response> {
  const { tentativas = 3, timeoutMs = 30_000, baseDelayMs = 1_000 } = opcoes;

  let ultimoErro: unknown;
  for (let tentativa = 0; tentativa < tentativas; tentativa++) {
    try {
      const resposta = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (resposta.status < 500 && resposta.status !== 429) {
        return resposta;
      }
      ultimoErro = new Error(`HTTP ${resposta.status} em ${url}`);
      await resposta.body?.cancel();
    } catch (erro) {
      ultimoErro = erro;
    }

    if (tentativa < tentativas - 1) {
      const atraso = baseDelayMs * 2 ** tentativa + Math.random() * baseDelayMs;
      await sleep(atraso);
    }
  }
  throw ultimoErro;
}
