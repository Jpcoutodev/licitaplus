/**
 * Edge Function `coletar` — janela periódica de coleta e matching.
 * Disparada pelo pg_cron (com service role key). Lê os perfis ativos, deriva
 * o conjunto mínimo de fatias UF × modalidade e executa a janela de coleta:
 * matching inicial, depois cada fatia (a partir do cursor persistido) seguida
 * de novo matching. Idempotente — repetir nunca duplica dado nem match.
 *
 * Body opcional { "uf": "SP", "codigoModalidade": 6 } processa uma única
 * fatia (reprocessamento manual).
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { executarJanelaDeColeta, lerPerfisAtivos } from "../_shared/coleta.ts";
import type { Fatia } from "../_shared/fatias.ts";

Deno.serve(async (req) => {
  const inicio = Date.now();

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const corpo = await req.json().catch(() => ({}));
    const perfis = await lerPerfisAtivos(supabase);

    const fatiaUnica: Fatia | null = typeof corpo?.uf === "string"
      ? { uf: corpo.uf, codigoModalidade: corpo.codigoModalidade }
      : null;

    const { fatias, matching } = await executarJanelaDeColeta(
      supabase,
      perfis,
      fatiaUnica ? [fatiaUnica] : undefined,
    );

    const resumo = {
      funcao: "coletar",
      perfis_ativos: perfis.length,
      fatias_processadas: fatias.length,
      licitacoes_coletadas: fatias.reduce((s, f) => s + f.coletadas, 0),
      matches_novos: matching.reduce((s, m) => s + m.matches_novos, 0),
      cursores: fatias.map((f) => ({
        fatia: f.fatia,
        paginas_lidas: f.paginasLidas,
        proxima_pagina: f.pagina_cursor,
      })),
      erros_fatias: fatias.filter((f) => f.erro).map((f) => ({
        fatia: f.fatia,
        erro: f.erro,
      })),
      erros_matching: matching.filter((m) => m.erro),
      duracao_ms: Date.now() - inicio,
    };

    // Log estruturado por execução (visível no painel do Supabase).
    console.log(JSON.stringify(resumo));

    return new Response(JSON.stringify(resumo), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    console.error(JSON.stringify({ funcao: "coletar", erro: mensagem }));
    return new Response(JSON.stringify({ erro: mensagem }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
