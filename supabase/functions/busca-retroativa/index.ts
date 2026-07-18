/**
 * Edge Function `busca-retroativa` — disparo pontual após criar/alterar um
 * perfil, para o cliente já ver resultados. Executa uma janela de coleta só
 * com as fatias daquele perfil e o matching dele.
 *
 * Chamada pelo navegador (CORS habilitado). Body: { "perfil_id": "<uuid>" }.
 * Exige JWT do usuário dono do perfil — a posse é verificada lendo o perfil
 * com o token do chamador (RLS).
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { executarJanelaDeColeta } from "../_shared/coleta.ts";
import type { PerfilColeta } from "../_shared/fatias.ts";
import { CABECALHOS_CORS, respostaPreflight } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const preflight = respostaPreflight(req);
  if (preflight) return preflight;

  const inicio = Date.now();

  try {
    const { perfil_id } = await req.json().catch(() => ({}));
    if (typeof perfil_id !== "string" || !perfil_id) {
      return respostaJson({ erro: "perfil_id é obrigatório" }, 400);
    }

    const url = Deno.env.get("SUPABASE_URL")!;
    const autorizacao = req.headers.get("Authorization") ?? "";

    // Client com o token do usuário: o RLS garante que só o dono lê o perfil.
    const supabaseUsuario = createClient(
      url,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: autorizacao } } },
    );
    const { data: perfil, error } = await supabaseUsuario
      .from("perfis")
      .select("id, palavras_chave, ufs, modalidades")
      .eq("id", perfil_id)
      .eq("ativo", true)
      .maybeSingle<PerfilColeta>();

    if (error || !perfil) {
      return respostaJson({ erro: "perfil não encontrado" }, 404);
    }

    // Escrita (licitacoes/matches) só via service role.
    const supabaseWorker = createClient(
      url,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Busca inicial do zero: o perfil mudou, então os matches antigos deixam
    // de valer (favoritos ficam — são tabela própria). A janela abaixo refaz
    // o painel conforme as palavras-chave atuais.
    const { error: erroLimpeza } = await supabaseWorker
      .from("matches")
      .delete()
      .eq("perfil_id", perfil_id);
    if (erroLimpeza) {
      throw new Error(`Falha ao limpar matches antigos: ${erroLimpeza.message}`);
    }

    const { fatias, matching, buscaTextual } = await executarJanelaDeColeta(
      supabaseWorker,
      [perfil],
    );

    const resumo = {
      funcao: "busca-retroativa",
      perfil_id,
      busca_textual: buscaTextual,
      fatias_processadas: fatias.length,
      licitacoes_coletadas: buscaTextual.coletadas +
        fatias.reduce((s, f) => s + f.coletadas, 0),
      matches_novos: matching.reduce((s, m) => s + m.matches_novos, 0),
      erros_fatias: fatias.filter((f) => f.erro).map((f) => ({
        fatia: f.fatia,
        erro: f.erro,
      })),
      duracao_ms: Date.now() - inicio,
    };

    console.log(JSON.stringify(resumo));
    return respostaJson(resumo, 200);
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    console.error(
      JSON.stringify({ funcao: "busca-retroativa", erro: mensagem }),
    );
    return respostaJson({ erro: mensagem }, 500);
  }
});

function respostaJson(corpo: unknown, status: number): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CABECALHOS_CORS, "Content-Type": "application/json" },
  });
}
