import { NextResponse } from "next/server";
import { criarClientServidor } from "@/lib/supabase/server";
import { MARCA } from "@/lib/marca";

/**
 * Retorno da confirmação de email (e de qualquer link mágico do Supabase).
 *
 * O template padrão do Supabase manda o usuário para /auth/v1/verify, que
 * confirma e devolve para o `redirect_to` com `?code=`. Como o app usa
 * @supabase/ssr, o fluxo é PKCE: esse code precisa ser trocado por sessão
 * aqui no servidor. Sem esta rota o link caía em 404 — que era o "página
 * inválida" que o usuário via.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const proximo = url.searchParams.get("next") ?? "/painel";

  // O Supabase devolve o erro na própria query quando o link já foi usado ou
  // expirou; repassamos para a tela de login em vez de mostrar página branca.
  const erroSupabase = url.searchParams.get("error_description") ??
    url.searchParams.get("error");

  const destino = (caminho: string) => new URL(caminho, MARCA.siteUrl);

  if (erroSupabase) {
    return NextResponse.redirect(
      destino(`/login?erro=${encodeURIComponent(erroSupabase.slice(0, 200))}`),
    );
  }

  if (!code) {
    return NextResponse.redirect(destino("/login?erro=link_invalido"));
  }

  const supabase = await criarClientServidor();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // Caso clássico: o link foi aberto em outro aparelho/navegador. No PKCE o
    // verificador fica no navegador que iniciou o cadastro, então a troca
    // falha — e a orientação certa é entrar com email e senha.
    return NextResponse.redirect(destino("/login?erro=confirmado_outro_local"));
  }

  return NextResponse.redirect(destino(proximo));
}
