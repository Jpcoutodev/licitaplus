/**
 * Envio de Web Push nativo (VAPID), sem serviços de terceiros. Best-effort:
 * falhas não interrompem o lote; assinaturas mortas (404/410) são removidas.
 */

import webpush from "npm:web-push@3.6.7";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { lerEnv } from "../env.ts";

let configurado = false;

function configurar(): boolean {
  if (configurado) return true;
  const publica = lerEnv("VAPID_PUBLIC_KEY");
  const privada = lerEnv("VAPID_PRIVATE_KEY");
  const assunto = lerEnv("VAPID_SUBJECT") ?? "mailto:contato@licitaplus.com";
  if (!publica || !privada) return false;
  webpush.setVapidDetails(assunto, publica, privada);
  configurado = true;
  return true;
}

/**
 * Envia um push para todas as assinaturas do usuário. Retorna quantos
 * aparelhos receberam. Remove do banco as assinaturas expiradas.
 */
export async function enviarPushUsuario(
  supabase: SupabaseClient,
  userId: string,
  titulo: string,
  corpo: string,
  url = "/painel",
): Promise<number> {
  if (!configurar()) return 0;

  const { data: assinaturas } = await supabase
    .from("push_assinaturas")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);
  if (!assinaturas || assinaturas.length === 0) return 0;

  const payload = JSON.stringify({ titulo, corpo, url });
  let enviados = 0;

  for (const a of assinaturas) {
    try {
      await webpush.sendNotification(
        {
          endpoint: a.endpoint as string,
          keys: { p256dh: a.p256dh as string, auth: a.auth as string },
        },
        payload,
      );
      enviados++;
    } catch (erro) {
      const status = (erro as { statusCode?: number })?.statusCode;
      // Assinatura expirada/cancelada: remove para não tentar de novo.
      if (status === 404 || status === 410) {
        await supabase.from("push_assinaturas").delete().eq("id", a.id);
      }
    }
  }
  return enviados;
}
