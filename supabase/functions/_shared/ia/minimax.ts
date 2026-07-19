/**
 * Conversa com a IA — provedor MiniMax (endpoint compatível com o formato
 * OpenAI de chat completions). Único ponto do sistema que fala com a API de
 * IA; trocar de provedor = trocar este arquivo.
 *
 * Suporta chamada de ferramentas (function calling): quando `opcoes.ferramentas`
 * é passado, o modelo pode pedir a execução de uma ferramenta; executamos via
 * `opcoes.executarFerramenta`, devolvemos o resultado e deixamos o modelo
 * responder. O laço tem teto de ciclos para nunca rodar indefinidamente.
 *
 * Segredos/config (Supabase secrets):
 *   MINIMAX_API_KEY       (obrigatório)
 *   MINIMAX_MODEL         (padrão: MiniMax-M2)
 *   MINIMAX_API_BASE_URL  (padrão: https://api.minimax.io/v1)
 */

import { lerEnv } from "../env.ts";
import { fetchWithRetry } from "../http.ts";

export interface MensagemChat {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Definição de uma ferramenta no formato OpenAI (function calling). */
export interface DefinicaoFerramenta {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/** Executa a ferramenta pedida pelo modelo e devolve o resultado como texto. */
export type ExecutorFerramenta = (
  nome: string,
  argumentos: Record<string, unknown>,
) => Promise<string>;

export interface OpcoesIA {
  ferramentas?: DefinicaoFerramenta[];
  executarFerramenta?: ExecutorFerramenta;
  /** Máximo de rodadas de ferramenta antes de exigir a resposta final. */
  maxCiclosFerramenta?: number;
}

interface ChamadaFerramenta {
  id?: string;
  type?: string;
  function?: { name?: string; arguments?: string };
}

interface MensagemResposta {
  content?: string;
  tool_calls?: ChamadaFerramenta[];
}

interface RespostaChatCompletions {
  choices?: Array<{ message?: MensagemResposta }>;
  base_resp?: { status_code?: number; status_msg?: string };
}

/** Uma chamada ao endpoint de chat; devolve a mensagem crua do modelo. */
async function chamarChat(
  mensagens: Array<Record<string, unknown>>,
  maxTokens: number,
  ferramentas?: DefinicaoFerramenta[],
): Promise<MensagemResposta> {
  const chave = lerEnv("MINIMAX_API_KEY");
  if (!chave) throw new Error("MINIMAX_API_KEY não configurada");

  const baseUrl = lerEnv("MINIMAX_API_BASE_URL") ?? "https://api.minimax.io/v1";
  const modelo = lerEnv("MINIMAX_MODEL") ?? "MiniMax-M2";

  const corpoReq: Record<string, unknown> = {
    model: modelo,
    max_tokens: maxTokens,
    messages: mensagens,
  };
  if (ferramentas && ferramentas.length > 0) {
    corpoReq.tools = ferramentas;
    corpoReq.tool_choice = "auto";
  }

  const resposta = await fetchWithRetry(
    `${baseUrl}/chat/completions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${chave}`,
      },
      body: JSON.stringify(corpoReq),
    },
    { timeoutMs: 120_000 },
  );

  const corpoTexto = await resposta.text();
  if (!resposta.ok) {
    throw new Error(
      `MiniMax respondeu HTTP ${resposta.status}: ${corpoTexto.slice(0, 300)}`,
    );
  }

  const corpo = JSON.parse(corpoTexto) as RespostaChatCompletions;
  // A MiniMax pode sinalizar erro em base_resp mesmo com HTTP 200.
  if (corpo.base_resp?.status_code && corpo.base_resp.status_code !== 0) {
    throw new Error(
      `MiniMax retornou erro ${corpo.base_resp.status_code}: ${corpo.base_resp.status_msg ?? ""}`,
    );
  }

  const message = corpo.choices?.[0]?.message;
  if (!message) {
    throw new Error(
      `MiniMax retornou resposta sem mensagem: ${corpoTexto.slice(0, 300)}`,
    );
  }
  return message;
}

export async function conversarComIA(
  mensagens: MensagemChat[],
  maxTokens = 2048,
  opcoes: OpcoesIA = {},
): Promise<string> {
  const maxCiclos = opcoes.maxCiclosFerramenta ?? 3;
  const msgs: Array<Record<string, unknown>> = mensagens.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  for (let ciclo = 0; ; ciclo++) {
    // No último ciclo não oferecemos mais ferramentas: forçamos a resposta.
    const podeUsarFerramenta = Boolean(
      opcoes.ferramentas?.length &&
        opcoes.executarFerramenta &&
        ciclo < maxCiclos,
    );

    const message = await chamarChat(
      msgs,
      maxTokens,
      podeUsarFerramenta ? opcoes.ferramentas : undefined,
    );

    const chamadas = message.tool_calls ?? [];
    if (podeUsarFerramenta && chamadas.length > 0) {
      // Ecoa a mensagem do assistente com as chamadas e anexa cada resultado.
      msgs.push({
        role: "assistant",
        content: message.content ?? "",
        tool_calls: chamadas,
      });
      for (const chamada of chamadas) {
        const nome = chamada.function?.name ?? "";
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(chamada.function?.arguments || "{}");
        } catch { /* argumentos inválidos: segue com {} */ }

        let resultado: string;
        try {
          resultado = await opcoes.executarFerramenta!(nome, args);
        } catch (erro) {
          resultado = `erro ao executar ${nome}: ${
            erro instanceof Error ? erro.message : String(erro)
          }`;
        }
        msgs.push({
          role: "tool",
          tool_call_id: chamada.id ?? "",
          content: resultado.slice(0, 12_000),
        });
      }
      continue;
    }

    const conteudo = limparRaciocinio(message.content ?? "");
    if (!conteudo) throw new Error("MiniMax retornou resposta sem conteúdo");
    return conteudo;
  }
}

/**
 * Modelos de raciocínio (como o MiniMax-M2) podem incluir blocos <think> no
 * conteúdo; a resposta ao usuário deve conter apenas o texto final.
 */
function limparRaciocinio(texto: string): string {
  return texto.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}
