import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

type CookieParaGravar = { name: string; value: string; options: CookieOptions };

/**
 * Mantém a sessão do Supabase atualizada e protege as rotas do painel:
 * sem usuário autenticado, /painel redireciona para /login.
 */
export async function middleware(request: NextRequest) {
  let resposta = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(lista: CookieParaGravar[]) {
          for (const { name, value } of lista) {
            request.cookies.set(name, value);
          }
          resposta = NextResponse.next({ request });
          for (const { name, value, options } of lista) {
            resposta.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const rota = request.nextUrl.pathname;
  // /admin é a área interna da equipe: aqui só garantimos que há sessão; a
  // checagem de admin fica no layout da rota e, de novo, nas funções do banco.
  const rotaProtegida = rota.startsWith("/painel") ||
    rota.startsWith("/onboarding") || rota.startsWith("/assinar") ||
    rota.startsWith("/admin");
  if (!user && rotaProtegida) {
    const destino = request.nextUrl.clone();
    destino.pathname = "/login";
    return NextResponse.redirect(destino);
  }

  return resposta;
}

export const config = {
  matcher: [
    "/painel/:path*",
    "/admin/:path*",
    "/onboarding",
    "/assinar",
    "/login",
  ],
};
