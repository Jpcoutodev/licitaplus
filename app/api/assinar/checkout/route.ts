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

type ClientSupabase = Awaited<ReturnType<typeof criarClientServidor>>;

/**
 * Registra a etapa do funil. Nunca deixa a analítica derrubar o pagamento:
 * qualquer falha aqui é engolida de propósito.
 */
async function registrar(
  supabase: ClientSupabase,
  userId: string,
  evento: "checkout_iniciado" | "checkout_erro",
  dados: { plano?: string; detalhe?: string; sessao?: string } = {},
): Promise<void> {
  try {
    await supabase.from("assinatura_eventos").insert({
      user_id: userId,
      evento,
      plano: dados.plano ?? null,
      detalhe: dados.detalhe?.slice(0, 300) ?? null,
      stripe_session_id: dados.sessao ?? null,
    });
  } catch {
    // sem telemetria é melhor que sem checkout
  }
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

  // Autentica antes de validar a config: assim um erro de configuração vira um
  // evento no funil com dono, em vez de sumir só no log do servidor.
  const supabase = await criarClientServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(url("/login"), 303);

  if (!envValido(chave, "sk_") || !envValido(preco, "price_")) {
    console.error("checkout: env da Stripe ausente ou malformado", {
      chaveOk: envValido(chave, "sk_"),
      plano,
      precoOk: envValido(preco, "price_"),
    });
    await registrar(supabase, user.id, "checkout_erro", {
      plano,
      detalhe: `env da Stripe invalido (chave ${
        envValido(chave, "sk_") ? "ok" : "ruim"
      }, preco ${envValido(preco, "price_") ? "ok" : "ruim"})`,
    });
    return NextResponse.redirect(url("/assinar?erro=config"), 303);
  }

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
          const texto = await t.text();
          console.error("stripe troca de plano", t.status, texto);
          await registrar(supabase, user.id, "checkout_erro", {
            plano,
            detalhe: `troca de plano ${t.status}: ${texto}`,
          });
          return NextResponse.redirect(url("/assinar?erro=stripe"), 303);
        }
        await registrar(supabase, user.id, "checkout_iniciado", {
          plano,
          detalhe: "troca de plano na assinatura existente",
        });
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
    const texto = await resposta.text();
    console.error("stripe checkout", resposta.status, texto);
    await registrar(supabase, user.id, "checkout_erro", {
      plano,
      detalhe: `${resposta.status}: ${texto}`,
    });
    return NextResponse.redirect(url("/assinar?erro=stripe"), 303);
  }

  const sessao = (await resposta.json()) as { id?: string; url?: string };
  if (!sessao.url) {
    await registrar(supabase, user.id, "checkout_erro", {
      plano,
      detalhe: "Stripe respondeu sem URL de checkout",
    });
    return NextResponse.redirect(url("/assinar?erro=stripe"), 303);
  }

  await registrar(supabase, user.id, "checkout_iniciado", {
    plano,
    sessao: sessao.id,
  });
  return NextResponse.redirect(sessao.url, 303);
}
