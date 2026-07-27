/**
 * Webhook do Stripe — ativa/renova/encerra assinaturas.
 *
 * Verifica a assinatura do evento (HMAC-SHA256 do payload com o segredo do
 * endpoint) antes de confiar em qualquer dado. Eventos tratados:
 *   checkout.session.completed      -> ativa o plano do usuário
 *   customer.subscription.created   -> ativa (upgrade/downgrade fora do checkout)
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
  return v1s.some((v1) => igualdadeConstante(v1, esperado));
}

/** Comparação sem vazar em quanto tempo as strings divergem. */
function igualdadeConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diferenca = 0;
  for (let i = 0; i < a.length; i++) {
    diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diferenca === 0;
}

interface ItemStripe {
  id: string;
  price?: { id?: string };
  current_period_end?: number;
}

interface AssinaturaStripe {
  id: string;
  status: string;
  /** Só existe em contas com API anterior a 2025-03-31.basil; ver fimDoPeriodo(). */
  current_period_end?: number;
  customer: string;
  metadata?: Record<string, string>;
  items?: { data?: ItemStripe[] };
}

/**
 * Fim do período pago, em epoch de segundos.
 *
 * A partir da API 2025-03-31.basil o Stripe removeu current_period_end do
 * objeto Subscription e passou a expor um período por item. Lemos do item e
 * caímos no campo antigo para contas que ainda usam versão anterior.
 */
function fimDoPeriodo(sub: AssinaturaStripe): number | null {
  return sub.items?.data?.[0]?.current_period_end ?? sub.current_period_end ??
    null;
}

/** Status em que o acesso vale. past_due fica de fora: o Stripe ainda retenta,
 * então mantemos o acesso até a assinatura ser cancelada de fato. */
const STATUS_ATIVOS = new Set(["active", "trialing"]);
/** Status que encerram o acesso na hora. */
const STATUS_MORTOS = new Set(["canceled", "unpaid", "incomplete_expired"]);

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

/**
 * Plano correspondente ao price. Retorna null se o price não for nenhum dos
 * configurados — melhor falhar alto do que classificar errado e cobrar R$197
 * entregando o plano de R$97.
 */
function planoDoPrice(priceId: string | undefined): string | null {
  if (!priceId) return null;
  if (priceId === lerEnv("STRIPE_PRICE_PROFISSIONAL")) return "profissional";
  if (priceId === lerEnv("STRIPE_PRICE_ESSENCIAL")) return "essencial";
  return null;
}

/** Encerra o acesso da assinatura (expira agora). */
async function encerrarSubscription(subId: string): Promise<void> {
  await clientServico()
    .from("contas")
    .update({ plano_ativo_ate: new Date().toISOString() })
    .eq("stripe_subscription_id", subId);
}

async function aplicarSubscription(
  sub: AssinaturaStripe,
  userId?: string,
): Promise<void> {
  const service = clientServico();

  if (STATUS_MORTOS.has(sub.status)) {
    await encerrarSubscription(sub.id);
    return;
  }
  if (!STATUS_ATIVOS.has(sub.status)) {
    // past_due e incomplete: não mexe — o Stripe ainda pode resolver sozinho.
    console.log(JSON.stringify({
      funcao: "stripe-webhook",
      aviso: "status sem acao",
      status: sub.status,
      sub: sub.id,
    }));
    return;
  }

  const plano = planoDoPrice(sub.items?.data?.[0]?.price?.id);
  const fim = fimDoPeriodo(sub);
  if (!plano || !fim) {
    console.error(JSON.stringify({
      funcao: "stripe-webhook",
      erro: !plano ? "price desconhecido" : "sem fim de periodo",
      sub: sub.id,
      price: sub.items?.data?.[0]?.price?.id ?? null,
    }));
    return;
  }

  const dados = {
    plano,
    plano_ativo_ate: new Date(fim * 1000).toISOString(),
    stripe_customer_id: sub.customer,
    stripe_subscription_id: sub.id,
  };

  // O user_id vem do checkout ou do metadata da subscription; sem ele,
  // localizamos a conta pela própria subscription já vinculada.
  const alvo = userId ?? sub.metadata?.user_id;
  if (alvo) {
    await service.from("contas").update(dados).eq("user_id", alvo);
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
      const pago = objeto.payment_status === "paid" ||
        objeto.payment_status === "no_payment_required";
      if (userId && subId && pago) {
        const sub = await buscarSubscription(subId);
        if (sub) await aplicarSubscription(sub, userId);
      }
    } else if (
      evento.type === "customer.subscription.created" ||
      evento.type === "customer.subscription.updated"
    ) {
      const sub = objeto as unknown as AssinaturaStripe;
      if (sub.id) await aplicarSubscription(sub);
    } else if (evento.type === "customer.subscription.deleted") {
      const subId = objeto.id as string | undefined;
      if (subId) await encerrarSubscription(subId);
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
