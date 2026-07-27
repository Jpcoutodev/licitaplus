/**
 * Webhook do Stripe — ativa/renova/encerra assinaturas.
 *
 * Verifica a assinatura do evento (HMAC-SHA256 do payload com o segredo do
 * endpoint) antes de confiar em qualquer dado. Eventos tratados:
 *   checkout.session.completed      -> ativa o plano do usuário
 *   checkout.session.expired        -> desistência (só registra no funil)
 *   customer.subscription.created   -> ativa (upgrade/downgrade fora do checkout)
 *   customer.subscription.updated   -> renova/ajusta validade e plano
 *   customer.subscription.deleted   -> encerra (expira imediatamente)
 *
 * Cada etapa também vira uma linha em public.assinatura_eventos, que alimenta
 * o funil na aba Métricas.
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

/**
 * Registra a etapa do funil de assinatura. Falha aqui nunca derruba o
 * processamento do evento — perder telemetria é melhor que devolver 500 ao
 * Stripe e fazer ele reenviar tudo.
 */
async function registrar(
  evento: string,
  dados: {
    userId?: string | null;
    plano?: string | null;
    detalhe?: string | null;
    sessao?: string | null;
    subscription?: string | null;
  } = {},
): Promise<void> {
  try {
    await clientServico().from("assinatura_eventos").insert({
      user_id: dados.userId ?? null,
      evento,
      plano: dados.plano ?? null,
      detalhe: dados.detalhe?.slice(0, 300) ?? null,
      stripe_session_id: dados.sessao ?? null,
      stripe_subscription_id: dados.subscription ?? null,
    });
  } catch (erro) {
    console.error(JSON.stringify({
      funcao: "stripe-webhook",
      aviso: "falha ao registrar evento",
      erro: erro instanceof Error ? erro.message : String(erro),
    }));
  }
}

/** Descobre de quem é a assinatura, para o evento não ficar órfão. */
async function donoDaSubscription(subId: string): Promise<string | null> {
  const { data } = await clientServico()
    .from("contas")
    .select("user_id")
    .eq("stripe_subscription_id", subId)
    .maybeSingle();
  return (data?.user_id as string) ?? null;
}

/** Encerra o acesso da assinatura (expira agora). */
async function encerrarSubscription(
  subId: string,
  motivo: string,
): Promise<void> {
  const userId = await donoDaSubscription(subId);
  await clientServico()
    .from("contas")
    .update({ plano_ativo_ate: new Date().toISOString() })
    .eq("stripe_subscription_id", subId);
  await registrar("assinatura_cancelada", {
    userId,
    detalhe: motivo,
    subscription: subId,
  });
}

/**
 * `origem` distingue as duas portas de entrada: "checkout" é sempre uma
 * assinatura nova; "subscription" pode ser renovação (nada muda) ou troca de
 * plano — decidimos comparando com o plano gravado na conta.
 */
async function aplicarSubscription(
  sub: AssinaturaStripe,
  origem: "checkout" | "subscription",
  userId?: string,
): Promise<void> {
  const service = clientServico();

  if (STATUS_MORTOS.has(sub.status)) {
    await encerrarSubscription(sub.id, `status ${sub.status}`);
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
    await registrar("pagamento_falhou", {
      userId: userId ?? sub.metadata?.user_id ??
        await donoDaSubscription(sub.id),
      detalhe: `status ${sub.status} — acesso mantido, Stripe ainda retenta`,
      subscription: sub.id,
    });
    return;
  }

  const plano = planoDoPrice(sub.items?.data?.[0]?.price?.id);
  const fim = fimDoPeriodo(sub);
  if (!plano || !fim) {
    const motivo = !plano ? "price desconhecido" : "sem fim de periodo";
    console.error(JSON.stringify({
      funcao: "stripe-webhook",
      erro: motivo,
      sub: sub.id,
      price: sub.items?.data?.[0]?.price?.id ?? null,
    }));
    await registrar("checkout_erro", {
      userId: userId ?? sub.metadata?.user_id ?? null,
      detalhe: `${motivo} (price ${sub.items?.data?.[0]?.price?.id ?? "?"})`,
      subscription: sub.id,
    });
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
  const dono = alvo ?? await donoDaSubscription(sub.id);

  // Plano anterior, para saber se este evento é troca ou apenas renovação.
  let planoAnterior: string | null = null;
  if (dono) {
    const { data } = await service
      .from("contas")
      .select("plano")
      .eq("user_id", dono)
      .maybeSingle();
    planoAnterior = (data?.plano as string) ?? null;
  }

  if (alvo) {
    await service.from("contas").update(dados).eq("user_id", alvo);
  } else {
    await service.from("contas").update(dados).eq(
      "stripe_subscription_id",
      sub.id,
    );
  }

  if (origem === "checkout") {
    await registrar("assinatura_ativada", {
      userId: dono,
      plano,
      subscription: sub.id,
    });
  } else if (planoAnterior && planoAnterior !== plano) {
    await registrar("plano_trocado", {
      userId: dono,
      plano,
      detalhe: `de ${planoAnterior} para ${plano}`,
      subscription: sub.id,
    });
  }
  // Renovação (mesmo plano, vindo do Stripe) não vira evento: encheria o
  // funil de ruído mensal sem responder nada que o painel já não mostre.
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
        if (sub) await aplicarSubscription(sub, "checkout", userId);
      } else if (userId) {
        await registrar("checkout_erro", {
          userId,
          detalhe: `sessão concluída sem pagamento (${objeto.payment_status})`,
          sessao: objeto.id as string | undefined,
        });
      }
    } else if (evento.type === "checkout.session.expired") {
      // Desistência: o cliente abriu o checkout e não concluiu até vencer.
      await registrar("checkout_expirado", {
        userId: objeto.client_reference_id as string | undefined,
        detalhe: "sessão de checkout expirou sem pagamento",
        sessao: objeto.id as string | undefined,
      });
    } else if (
      evento.type === "customer.subscription.created" ||
      evento.type === "customer.subscription.updated"
    ) {
      const sub = objeto as unknown as AssinaturaStripe;
      if (sub.id) await aplicarSubscription(sub, "subscription");
    } else if (evento.type === "customer.subscription.deleted") {
      const subId = objeto.id as string | undefined;
      if (subId) await encerrarSubscription(subId, "assinatura cancelada");
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
