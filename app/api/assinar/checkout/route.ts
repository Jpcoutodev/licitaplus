import { NextResponse } from "next/server";
import { criarClientServidor } from "@/lib/supabase/server";
import { MARCA } from "@/lib/marca";

/**
 * Cria uma sessão de checkout do Stripe (assinatura) e redireciona.
 * Env (Vercel, server-side): STRIPE_SECRET_KEY, STRIPE_PRICE_ESSENCIAL,
 * STRIPE_PRICE_PROFISSIONAL. O webhook (edge function stripe-webhook) ativa o
 * plano quando o pagamento confirma.
 */
export async function POST(request: Request) {
  const url = (caminho: string) => new URL(caminho, MARCA.siteUrl);

  const chave = process.env.STRIPE_SECRET_KEY;
  const precos: Record<string, string | undefined> = {
    essencial: process.env.STRIPE_PRICE_ESSENCIAL,
    profissional: process.env.STRIPE_PRICE_PROFISSIONAL,
  };

  const form = await request.formData();
  const plano = String(form.get("plano") ?? "");
  const preco = precos[plano];
  if (!chave || !preco) {
    return NextResponse.redirect(url("/assinar?erro=config"), 303);
  }

  const supabase = await criarClientServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(url("/login"), 303);

  const corpo = new URLSearchParams({
    mode: "subscription",
    "line_items[0][price]": preco,
    "line_items[0][quantity]": "1",
    client_reference_id: user.id,
    customer_email: user.email ?? "",
    "subscription_data[metadata][user_id]": user.id,
    success_url: url("/assinar?ok=1").toString(),
    cancel_url: url("/assinar").toString(),
    locale: "pt-BR",
  });

  const resposta = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${chave}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: corpo.toString(),
  });

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
