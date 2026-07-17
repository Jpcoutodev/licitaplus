import { NextResponse } from "next/server";
import { criarClientServidor } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await criarClientServidor();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/", request.url), { status: 302 });
}
