/**
 * Conversa com a IA — provedor MiniMax (endpoint compatível com o formato
 * OpenAI de chat completions). Único ponto do sistema que fala com a API de
 * IA; trocar de provedor = trocar este arquivo.
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

interface RespostaChatCompletions {
  choices?: Array<{ message?: { content?: string } }>;
  base_resp?: { status_code?: number; status_msg?: string };
}

export async function conversarComIA(
  mensagens: MensagemChat[],
  maxTokens = 2048,
): Promise<string> {
  const chave = lerEnv("MINIMAX_API_KEY");
  if (!chave) throw new Error("MINIMAX_API_KEY não configurada");

  const baseUrl = lerEnv("MINIMAX_API_BASE_URL") ?? "https://api.minimax.io/v1";
  const modelo = lerEnv("MINIMAX_MODEL") ?? "MiniMax-M2";

  const resposta = await fetchWithRetry(
    `${baseUrl}/chat/completions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${chave}`,
      },
      body: JSON.stringify({
        model: modelo,
        max_tokens: maxTokens,
        messages: mensagens,
      }),
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

  const conteudo = corpo.choices?.[0]?.message?.content?.trim();
  if (!conteudo) {
    throw new Error(
      `MiniMax retornou resposta sem conteúdo: ${corpoTexto.slice(0, 300)}`,
    );
  }
  return limparRaciocinio(conteudo);
}

/**
 * Modelos de raciocínio (como o MiniMax-M2) podem incluir blocos <think> no
 * conteúdo; a resposta ao usuário deve conter apenas o texto final.
 */
function limparRaciocinio(texto: string): string {
  return texto.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}
