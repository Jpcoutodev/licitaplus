/**
 * CORS para Edge Functions chamadas a partir do navegador
 * (supabase.functions.invoke dispara preflight OPTIONS).
 */

export const CABECALHOS_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
} as const;

/** Resposta ao preflight; retorna null se a requisição não for OPTIONS. */
export function respostaPreflight(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CABECALHOS_CORS });
  }
  return null;
}
