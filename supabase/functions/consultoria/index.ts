/**
 * Edge Function `consultoria` — recebe um pedido de contato para a consultoria
 * (formulário público da landing) e grava como lead. Escrita com service role
 * (a tabela não aceita insert por anon/authenticated). Honeypot simples contra
 * bots. Deploy com verify_jwt desligado (formulário público, sem login).
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { CABECALHOS_CORS, respostaPreflight } from "../_shared/cors.ts";

function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CABECALHOS_CORS, "Content-Type": "application/json" },
  });
}

function texto(valor: unknown, max: number): string {
  return typeof valor === "string" ? valor.trim().slice(0, max) : "";
}

Deno.serve(async (req) => {
  const preflight = respostaPreflight(req);
  if (preflight) return preflight;

  try {
    const corpo = await req.json().catch(() => ({}));

    // Honeypot: campo invisível que só um bot preencheria.
    if (texto(corpo?.website, 100) !== "") return json({ ok: true });

    const nome = texto(corpo?.nome, 120);
    const empresa = texto(corpo?.empresa, 160);
    const telefone = texto(corpo?.telefone, 40);
    const email = texto(corpo?.email, 160);
    const mensagem = texto(corpo?.mensagem, 2000);

    if (nome.length < 2 || telefone.replace(/\D/g, "").length < 8) {
      return json({ erro: "Informe seu nome e um telefone válido com DDD." }, 400);
    }

    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { error } = await service.from("consultoria_leads").insert({
      nome,
      empresa: empresa || null,
      telefone,
      email: email || null,
      mensagem: mensagem || null,
    });
    if (error) return json({ erro: error.message }, 500);

    return json({ ok: true });
  } catch (erro) {
    return json(
      { erro: erro instanceof Error ? erro.message : "erro" },
      500,
    );
  }
});
