/**
 * Webhook do Stripe — ativa/renova/encerra assinaturas.
 *
 * Verifica a assinatura do evento (HMAC-SHA256 do payload com o segredo do
 * endpoint) antes de confiar em qualquer dado. Eventos tratados:
 *   checkout.session.completed      -> ativa o plano do usuário
 *   customer.subscription.updated   -> renova/ajusta validade e plano
 *   customer.subscription.deleted   -> encerra (expira imediatamente)
 *
 * Secrets (Supabase): STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
 * STRIPE_PRICE_ESSENCIAL, STRIPE_PRICE_PROFISSIONAL.
 * Deploy com verify_jwt desligado (o Stripe não manda JWT).
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { lerEnv } from "../_shared/env.ts";

const TOLERANCIA_SEGUNDOS = 300;

function clientServico() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

/** Verifica a assinatura Stripe-Signature (t=...,v1=...). */
async function assinaturaValida(
  corpo: string,
  cabecalho: string | null,
  segredo: string,
): Promise<boolean> {
  if (!cabecalho) return false;
  const partes = new Map<string, string[]>();
  for (const pedaco of cabecalho.split(",")) {
    const [k, v] = pedaco.split("=", 2);
    if (!k || !v) continue;
    partes.set(k.trim(), [...(partes.get(k.trim()) ?? []), v.trim()]);
  }
  const t = partes.get("t")?.[0];
  const v1s = partes.get("v1") ?? [];
  if (!t || v1s.length === 0) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > TOLERANCIA_SEGUNDOS) {
    return false;
  }

  const chave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(segredo),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    chave,
    new TextEncoder().encode(`${t}.${corpo}`),
  );
  const esperado = [...new Uint8Array(mac)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return v1s.some((v1) => v1 === esperado);
}

interface AssinaturaStripe {
  id: string;
  status: string;
  current_period_end: number;
  customer: string;
  items?: { data?: Array<{ price?: { id?: string } }> };
}

/** Busca a subscription na API do Stripe. */
async function buscarSubscription(
  id: string,
): Promise<AssinaturaStripe | null> {
  const chave = lerEnv("STRIPE_SECRET_KEY");
  if (!chave) return null;
  const r = await fetch(`https://api.stripe.com/v1/subscriptions/${id}`, {
    headers: { Authorization: `Bearer ${chave}` },
  });
  if (!r.ok) return null;
  return (await r.json()) as AssinaturaStripe;
}

function planoDoPrice(priceId: string | undefined): string {
  if (priceId && priceId === lerEnv("STRIPE_PRICE_PROFISSIONAL")) {
    return "profissional";
  }
  return "essencial";
}

async function aplicarSubscription(
  sub: AssinaturaStripe,
  userId?: string,
): Promise<void> {
  const service = clientServico();
  const plano = planoDoPrice(sub.items?.data?.[0]?.price?.id);
  const ativoAte = new Date(sub.current_period_end * 1000).toISOString();
  const dados = {
    plano,
    plano_ativo_ate: ativoAte,
    stripe_customer_id: sub.customer,
    stripe_subscription_id: sub.id,
  };

  if (userId) {
    await service.from("contas").update(dados).eq("user_id", userId);
  } else {
    await service.from("contas").update(dados).eq(
      "stripe_subscription_id",
      sub.id,
    );
  }
}

Deno.serve(async (req) => {
  const segredo = lerEnv("STRIPE_WEBHOOK_SECRET");
  if (!segredo) return new Response("webhook não configurado", { status: 500 });

  const corpo = await req.text();
  const ok = await assinaturaValida(
    corpo,
    req.headers.get("Stripe-Signature"),
    segredo,
  );
  if (!ok) return new Response("assinatura inválida", { status: 400 });

  const evento = JSON.parse(corpo) as {
    type: string;
    data: { object: Record<string, unknown> };
  };
  const objeto = evento.data.object;

  try {
    if (evento.type === "checkout.session.completed") {
      const userId = objeto.client_reference_id as string | undefined;
      const subId = objeto.subscription as string | undefined;
      if (userId && subId) {
        const sub = await buscarSubscription(subId);
        if (sub) await aplicarSubscription(sub, userId);
      }
    } else if (evento.type === "customer.subscription.updated") {
      const sub = objeto as unknown as AssinaturaStripe;
      // Renova/ajusta pela subscription já vinculada à conta.
      if (sub.id && sub.current_period_end) await aplicarSubscription(sub);
    } else if (evento.type === "customer.subscription.deleted") {
      const subId = objeto.id as string | undefined;
      if (subId) {
        await clientServico()
          .from("contas")
          .update({ plano_ativo_ate: new Date().toISOString() })
          .eq("stripe_subscription_id", subId);
      }
    }

    console.log(JSON.stringify({ funcao: "stripe-webhook", tipo: evento.type }));
    return new Response(JSON.stringify({ recebido: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    console.error(JSON.stringify({ funcao: "stripe-webhook", erro: mensagem }));
    return new Response("erro interno", { status: 500 });
  }
});
