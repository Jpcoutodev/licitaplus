/**
 * Envio de email via Resend. Segredos (Supabase secrets):
 *   RESEND_API_KEY     (obrigatório)
 *   RESEND_FROM_EMAIL  (padrão: onboarding@resend.dev — só para testes)
 */

import { lerEnv } from "../env.ts";
import { fetchWithRetry } from "../http.ts";

export async function enviarEmail(
  destinatario: string,
  assunto: string,
  html: string,
): Promise<void> {
  const chave = lerEnv("RESEND_API_KEY");
  if (!chave) throw new Error("RESEND_API_KEY não configurada");

  const remetente = lerEnv("RESEND_FROM_EMAIL") ??
    "SentinelaGov <onboarding@resend.dev>";

  const resposta = await fetchWithRetry("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${chave}`,
    },
    body: JSON.stringify({
      from: remetente,
      to: [destinatario],
      subject: assunto,
      html,
    }),
  });

  if (!resposta.ok) {
    const corpo = await resposta.text();
    throw new Error(
      `Resend respondeu HTTP ${resposta.status}: ${corpo.slice(0, 300)}`,
    );
  }
}
