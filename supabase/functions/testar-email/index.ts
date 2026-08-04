/**
 * Teste de entrega de email (ferramenta de operação, não do produto).
 *
 * Existe porque o caminho do email só se prova de ponta a ponta enviando de
 * verdade: remetente configurado, domínio verificado, DNS propagado e o
 * provedor aceitando. Diagnosticar isso pelo fluxo normal exigiria disparar
 * as notificações pendentes de todos os usuários.
 *
 * Duas travas:
 *  - exige JWT válido (service role ou admin);
 *  - só envia para endereço que JÁ é usuário do sistema, para nunca virar
 *    relay aberto caso a primeira trava falhe.
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { enviarEmail } from "../_shared/notificacao/email.ts";
import { CABECALHOS_CORS, respostaPreflight } from "../_shared/cors.ts";

function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CABECALHOS_CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const preflight = respostaPreflight(req);
  if (preflight) return preflight;

  const service = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const corpo = await req.json().catch(() => ({})) as { para?: string };
    const para = String(corpo.para ?? "").trim().toLowerCase();
    if (!para) return json({ erro: "informe 'para'" }, 400);

    // Só endereços que já são usuários — a trava que impede relay aberto.
    const { data: usuarios, error } = await service.auth.admin.listUsers({
      perPage: 1000,
    });
    if (error) throw new Error(error.message);
    const existe = usuarios.users.some((u) => u.email?.toLowerCase() === para);
    if (!existe) {
      return json(
        { erro: `${para} não é usuário do sistema — envio recusado` },
        403,
      );
    }

    const agora = new Date().toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
    });
    await enviarEmail(
      para,
      "Teste de entrega — SentinelaGov",
      `<div style="font-family:system-ui,sans-serif;max-width:520px;line-height:1.6">
        <h2 style="color:#1d4ed8;margin:0 0 12px">Entrega funcionando ✅</h2>
        <p>Se você está lendo isto, o caminho do email está correto de ponta a
        ponta: remetente configurado, domínio verificado e provedor aceitando.</p>
        <p style="color:#6b7280;font-size:14px">Enviado em ${agora}.<br>
        Mensagem de teste do SentinelaGov — nenhuma ação necessária.</p>
      </div>`,
    );

    console.log(JSON.stringify({ funcao: "testar-email", para, ok: true }));
    return json({ enviado: true, para, em: agora });
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    console.error(JSON.stringify({ funcao: "testar-email", erro: mensagem }));
    return json({ erro: mensagem }, 500);
  }
});
