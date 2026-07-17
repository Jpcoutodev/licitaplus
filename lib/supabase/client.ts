import { createBrowserClient } from "@supabase/ssr";

/** Client Supabase para componentes de navegador (usa apenas a anon key). */
export function criarClientNavegador() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
