import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

type CookieParaGravar = { name: string; value: string; options: CookieOptions };

/** Client Supabase para Server Components e Route Handlers (anon key + sessão em cookie). */
export async function criarClientServidor() {
  const armazemCookies = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return armazemCookies.getAll();
        },
        setAll(lista: CookieParaGravar[]) {
          try {
            for (const { name, value, options } of lista) {
              armazemCookies.set(name, value, options);
            }
          } catch {
            // Chamado a partir de um Server Component: o middleware cuida do refresh.
          }
        },
      },
    },
  );
}
