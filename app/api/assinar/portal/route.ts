import { NextResponse } from "next/server";
import { criarClientServidor } from "@/lib/supabase/server";
import { MARCA } from "@/lib/marca";

/**
 * Abre o Billing Portal do Stripe (trocar cartão, recibos, cancelar).
 * Requer STRIPE_SECRET_KEY (Vercel) e a conta ter stripe_customer_id.
 */
export async function POST() {
  const url = (caminho: string) => new URL(caminho, MARCA.siteUrl);
  try {
    return await abrirPortal(url);
  } catch (erro) {
    console.error("portal", erro instanceof Error ? erro.message : erro);
    return NextResponse.redirect(url("/painel/assinatura?erro=portal"), 303);
  }
}

/** Chave da Stripe utilizável: sem espaços/quebras de linha e com o prefixo. */
function chaveValida(valor: string | undefined): valor is string {
  return !!valor && !/\s/.test(valor) && valor.startsWith("sk_");
}

async function abrirPortal(url: (caminho: string) => URL) {
  const chave = process.env.STRIPE_SECRET_KEY;

  const supabase = await criarClientServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(url("/login"), 303);

  const { data: conta } = await supabase
    .from("contas")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!chaveValida(chave) || !conta?.stripe_customer_id) {
    return NextResponse.redirect(url("/painel/assinatura?erro=portal"), 303);
  }

  const corpo = new URLSearchParams({
    customer: conta.stripe_customer_id as string,
    return_url: url("/painel/assinatura").toString(),
  });
  const resposta = await fetch(
    "https://api.stripe.com/v1/billing_portal/sessions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${chave}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: corpo.toString(),
    },
  );

  if (!resposta.ok) {
    console.error("stripe portal", resposta.status, await resposta.text());
    return NextResponse.redirect(url("/painel/assinatura?erro=portal"), 303);
  }
  const sessao = (await resposta.json()) as { url?: string };
  return NextResponse.redirect(
    sessao.url ?? url("/painel/assinatura?erro=portal").toString(),
    303,
  );
}
