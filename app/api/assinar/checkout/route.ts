import { NextResponse } from "next/server";
import { criarClientServidor } from "@/lib/supabase/server";
import { MARCA } from "@/lib/marca";

/**
 * Assinatura via Stripe. Dois caminhos:
 *
 *  - Sem assinatura vigente -> cria uma sessão de checkout e redireciona.
 *  - Já assinante (troca de plano) -> atualiza a assinatura existente pela API.
 *    Abrir um segundo checkout deixaria o cliente com duas assinaturas ativas
 *    e duas cobranças por mês.
 *
 * Env (Vercel, server-side): STRIPE_SECRET_KEY, STRIPE_PRICE_ESSENCIAL,
 * STRIPE_PRICE_PROFISSIONAL. O webhook (edge function stripe-webhook) ativa o
 * plano quando o pagamento confirma.
 */

const API = "https://api.stripe.com/v1";

async function stripe(
  chave: string,
  caminho: string,
  corpo?: URLSearchParams,
): Promise<Response> {
  return fetch(`${API}${caminho}`, {
    method: corpo ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${chave}`,
      ...(corpo
        ? { "Content-Type": "application/x-www-form-urlencoded" }
        : {}),
    },
    body: corpo?.toString(),
  });
}

interface SubscriptionStripe {
  id: string;
  status: string;
  items?: { data?: Array<{ id: string; price?: { id?: string } }> };
}

/**
 * Valida o formato do env antes de usar. Não é preciosismo: um valor colado
 * com quebra de linha (o bloco inteiro num campo só, por exemplo) explodia
 * dentro do fetch com um 500 opaco em vez de avisar que a config está errada.
 */
function envValido(
  valor: string | undefined,
  prefixo: string,
): valor is string {
  return !!valor && !/\s/.test(valor) && valor.startsWith(prefixo);
}

export async function POST(request: Request) {
  const url = (caminho: string) => new URL(caminho, MARCA.siteUrl);

  try {
    return await criarAssinatura(request, url);
  } catch (erro) {
    console.error("checkout", erro instanceof Error ? erro.message : erro);
    return NextResponse.redirect(url("/assinar?erro=stripe"), 303);
  }
}

async function criarAssinatura(
  request: Request,
  url: (caminho: string) => URL,
) {
  const chave = process.env.STRIPE_SECRET_KEY;
  const precos: Record<string, string | undefined> = {
    essencial: process.env.STRIPE_PRICE_ESSENCIAL,
    profissional: process.env.STRIPE_PRICE_PROFISSIONAL,
  };

  const form = await request.formData();
  const plano = String(form.get("plano") ?? "");
  const preco = precos[plano];
  if (!envValido(chave, "sk_") || !envValido(preco, "price_")) {
    console.error("checkout: env da Stripe ausente ou malformado", {
      chave: chave ? "presente" : "ausente",
      chaveOk: envValido(chave, "sk_"),
      plano,
      precoOk: envValido(preco, "price_"),
    });
    return NextResponse.redirect(url("/assinar?erro=config"), 303);
  }

  const supabase = await criarClientServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(url("/login"), 303);

  const { data: conta } = await supabase
    .from("contas")
    .select("stripe_customer_id, stripe_subscription_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const clienteId = conta?.stripe_customer_id as string | undefined;
  const assinaturaId = conta?.stripe_subscription_id as string | undefined;

  // ---- Troca de plano de quem já assina -------------------------------
  if (assinaturaId) {
    const r = await stripe(chave, `/subscriptions/${assinaturaId}`);
    if (r.ok) {
      const sub = (await r.json()) as SubscriptionStripe;
      const item = sub.items?.data?.[0];
      const vigente = sub.status === "active" || sub.status === "trialing";

      if (vigente && item) {
        // Já está no plano pedido: nada a cobrar.
        if (item.price?.id === preco) {
          return NextResponse.redirect(url("/painel/assinatura"), 303);
        }
        const troca = new URLSearchParams({
          "items[0][id]": item.id,
          "items[0][price]": preco,
          // Cobra/credita a diferença proporcional ao tempo restante.
          proration_behavior: "create_prorations",
        });
        const t = await stripe(chave, `/subscriptions/${sub.id}`, troca);
        if (!t.ok) {
          console.error("stripe troca de plano", t.status, await t.text());
          return NextResponse.redirect(url("/assinar?erro=stripe"), 303);
        }
        // O webhook (customer.subscription.updated) grava o plano novo.
        return NextResponse.redirect(
          url("/painel/assinatura?ok=plano"),
          303,
        );
      }
    }
    // Assinatura sumiu ou está cancelada: segue para um checkout novo.
  }

  // ---- Primeira assinatura --------------------------------------------
  const corpo = new URLSearchParams({
    mode: "subscription",
    "line_items[0][price]": preco,
    "line_items[0][quantity]": "1",
    client_reference_id: user.id,
    "subscription_data[metadata][user_id]": user.id,
    success_url: url("/assinar?ok=1").toString(),
    cancel_url: url("/assinar").toString(),
    locale: "pt-BR",
  });
  // Reaproveita o cliente já existente; sem isso cada assinatura cria um
  // Customer novo e o histórico de cobrança se perde.
  if (clienteId) corpo.set("customer", clienteId);
  else if (user.email) corpo.set("customer_email", user.email);

  const resposta = await stripe(chave, "/checkout/sessions", corpo);

  if (!resposta.ok) {
    console.error("stripe checkout", resposta.status, await resposta.text());
    return NextResponse.redirect(url("/assinar?erro=stripe"), 303);
  }

  const sessao = (await resposta.json()) as { url?: string };
  if (!sessao.url) {
    return NextResponse.redirect(url("/assinar?erro=stripe"), 303);
  }
  return NextResponse.redirect(sessao.url, 303);
}
