import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

/**
 * Registra visualização/conversão de página (blog e marketing). Recebe o
 * beacon do navegador e grava com a anon key (a RLS valida o insert). Não há
 * dependência do Supabase no bundle do cliente — só um fetch/sendBeacon.
 */
export async function POST(req: Request) {
  try {
    const corpo = await req.json().catch(() => null);
    const tipo = corpo?.tipo;
    const caminho = corpo?.caminho;

    if (
      (tipo !== "visualizacao" && tipo !== "conversao") ||
      typeof caminho !== "string" ||
      !caminho.startsWith("/") ||
      caminho.length > 300
    ) {
      return NextResponse.json({ erro: "evento inválido" }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );

    await supabase.from("pagina_eventos").insert({
      tipo,
      caminho,
      sessao: typeof corpo?.sessao === "string"
        ? corpo.sessao.slice(0, 64)
        : null,
      referer: typeof corpo?.referer === "string"
        ? corpo.referer.slice(0, 500)
        : null,
    });

    // 204: resposta mínima; o beacon não lê o corpo.
    return new NextResponse(null, { status: 204 });
  } catch {
    return new NextResponse(null, { status: 204 });
  }
}
