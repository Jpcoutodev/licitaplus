/**
 * Edge Function `notificar` — envia por email os matches ainda não
 * notificados. Disparada pelo pg_cron (com service role key).
 *
 * Fluxo: matches com notificado_em nulo → agrupa por perfil → gera resumo
 * com IA (campos estruturados apenas) → envia um email por perfil via Resend
 * → grava notificado_em SÓ no sucesso do envio (idempotência: match
 * notificado nunca é reenviado). Falha em um item/perfil não derruba o lote.
 */

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  type ItemEmail,
  type LicitacaoParaNotificar,
  montarEmailMatches,
} from "../_shared/notificacao/conteudo.ts";
import { gerarResumo } from "../_shared/notificacao/resumo.ts";
import { enviarEmail } from "../_shared/notificacao/email.ts";

/** Limites por execução: cabem no timeout da function; o resto fica para a próxima janela. */
const MAX_MATCHES_POR_EXECUCAO = 30;
const MAX_MATCHES_POR_EMAIL = 10;
/** Teto de licitações notificadas por perfil por dia (protege caixa e custo de IA). */
const MAX_LICITACOES_POR_DIA = 10;

/** Início do dia de hoje em Brasília (UTC-3), como ISO em UTC. */
function inicioDoDiaBrasilia(): string {
  const agora = new Date();
  const brasilia = new Date(agora.getTime() - 3 * 60 * 60 * 1000);
  // 00:00 em Brasília = 03:00 UTC do mesmo dia.
  return new Date(Date.UTC(
    brasilia.getUTCFullYear(),
    brasilia.getUTCMonth(),
    brasilia.getUTCDate(),
    3,
    0,
    0,
  )).toISOString();
}

interface MatchPendente {
  id: string;
  perfil_id: string;
  licitacoes: LicitacaoParaNotificar;
  perfis: { user_id: string };
}

Deno.serve(async (_req) => {
  const inicio = Date.now();

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const pendentes = await lerMatchesPendentes(supabase);
    const porPerfil = agruparPorPerfil(pendentes);
    const inicioHoje = inicioDoDiaBrasilia();

    let emailsEnviados = 0;
    let matchesNotificados = 0;
    const erros: Array<{ perfil_id: string; erro: string }> = [];

    for (const [perfilId, matches] of porPerfil) {
      try {
        // Teto diário por perfil: não ultrapassa MAX_LICITACOES_POR_DIA
        // notificações no dia (o excedente fica no painel e sai amanhã).
        const { count: jaHoje } = await supabase
          .from("matches")
          .select("id", { count: "exact", head: true })
          .eq("perfil_id", perfilId)
          .gte("notificado_em", inicioHoje);
        const restanteHoje = MAX_LICITACOES_POR_DIA - (jaHoje ?? 0);
        if (restanteHoje <= 0) continue;

        const email = await buscarEmailDoUsuario(
          supabase,
          matches[0].perfis.user_id,
        );

        // Gera os resumos item a item; um resumo que falhar fica para a
        // próxima janela sem impedir os demais.
        const limite = Math.min(MAX_MATCHES_POR_EMAIL, restanteHoje);
        const itens: ItemEmail[] = [];
        const idsIncluidos: string[] = [];
        for (const match of matches.slice(0, limite)) {
          try {
            const resumo = await gerarResumo(match.licitacoes);
            itens.push({ licitacao: match.licitacoes, resumo });
            idsIncluidos.push(match.id);
          } catch (erro) {
            erros.push({
              perfil_id: perfilId,
              erro: `resumo (match ${match.id}): ${mensagemDe(erro)}`,
            });
          }
        }
        if (itens.length === 0) continue;

        const { assunto, html } = montarEmailMatches(itens);
        await enviarEmail(email, assunto, html);
        emailsEnviados++;

        const { error } = await supabase
          .from("matches")
          .update({ notificado_em: new Date().toISOString() })
          .in("id", idsIncluidos);
        if (error) throw new Error(`gravar notificado_em: ${error.message}`);
        matchesNotificados += idsIncluidos.length;
      } catch (erro) {
        erros.push({ perfil_id: perfilId, erro: mensagemDe(erro) });
      }
    }

    const resumoExecucao = {
      funcao: "notificar",
      matches_pendentes: pendentes.length,
      emails_enviados: emailsEnviados,
      matches_notificados: matchesNotificados,
      erros,
      duracao_ms: Date.now() - inicio,
    };
    console.log(JSON.stringify(resumoExecucao));

    return new Response(JSON.stringify(resumoExecucao), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (erro) {
    const mensagem = mensagemDe(erro);
    console.error(JSON.stringify({ funcao: "notificar", erro: mensagem }));
    return new Response(JSON.stringify({ erro: mensagem }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

async function lerMatchesPendentes(
  supabase: SupabaseClient,
): Promise<MatchPendente[]> {
  const { data, error } = await supabase
    .from("matches")
    .select(
      `id, perfil_id,
       licitacoes ( numero_controle_pncp, objeto_compra, informacao_complementar,
         valor_total_estimado, data_abertura_proposta, data_encerramento_proposta,
         orgao_razao_social, unidade_nome, uf, municipio_nome, modalidade_nome,
         link_sistema_origem ),
       perfis ( user_id )`,
    )
    .is("notificado_em", null)
    .order("created_at", { ascending: true })
    .limit(MAX_MATCHES_POR_EXECUCAO);

  if (error) {
    throw new Error(`Falha ao ler matches pendentes: ${error.message}`);
  }
  return (data ?? []) as unknown as MatchPendente[];
}

function agruparPorPerfil(
  pendentes: MatchPendente[],
): Map<string, MatchPendente[]> {
  const porPerfil = new Map<string, MatchPendente[]>();
  for (const match of pendentes) {
    const lista = porPerfil.get(match.perfil_id) ?? [];
    lista.push(match);
    porPerfil.set(match.perfil_id, lista);
  }
  return porPerfil;
}

async function buscarEmailDoUsuario(
  supabase: SupabaseClient,
  userId: string,
): Promise<string> {
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  const email = data?.user?.email;
  if (error || !email) {
    throw new Error(`usuário ${userId} sem email (${error?.message ?? "vazio"})`);
  }
  return email;
}

function mensagemDe(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}
