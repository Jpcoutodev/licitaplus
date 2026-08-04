import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { criarClientServidor } from "@/lib/supabase/server";
import { MARCA } from "@/lib/marca";

/**
 * Confirmação por token_hash — o fluxo que funciona em qualquer aparelho.
 *
 * Diferente do /auth/callback (PKCE), aqui não é preciso que o link seja
 * aberto no mesmo navegador que fez o cadastro: o token vem no próprio
 * endereço e é verificado no servidor. É o formato recomendado quando o
 * template de email usa {{ .TokenHash }}.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const tipo = url.searchParams.get("type") as EmailOtpType | null;
  const proximo = url.searchParams.get("next") ?? "/painel";

  const destino = (caminho: string) => new URL(caminho, MARCA.siteUrl);

  if (!tokenHash || !tipo) {
    return NextResponse.redirect(destino("/login?erro=link_invalido"));
  }

  const supabase = await criarClientServidor();
  const { error } = await supabase.auth.verifyOtp({
    type: tipo,
    token_hash: tokenHash,
  });

  if (error) {
    return NextResponse.redirect(destino("/login?erro=link_expirado"));
  }

  // Recuperação de senha vai para a troca; o resto entra no painel.
  return NextResponse.redirect(
    destino(tipo === "recovery" ? "/painel/configuracoes" : proximo),
  );
}
