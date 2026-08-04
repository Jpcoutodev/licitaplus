/**
 * Edge Function `notificar` — envia os alertas de licitação por email.
 * Disparada pelo pg_cron (com service role key).
 *
 * Modelo em lotes:
 *   uma consulta monta todos os lotes da rodada (lotes_para_notificar)
 *   → resumos gerados só para o que ainda não tem, em paralelo
 *   → o resumo fica gravado na LICITAÇÃO, para os outros perfis reusarem
 *   → um email por perfil, detalhando os de prazo mais apertado
 *   → o lote fecha marcando TODOS os pendentes daquele perfil.
 *
 * Três decisões que fazem isso escalar:
 *
 * 1. Resumo por licitação, não por match. A mesma licitação casa com dezenas
 *    de perfis; antes cada um pagava uma chamada de IA.
 * 2. O lote zera a fila do perfil. O email detalha os mais urgentes e informa
 *    "+N no painel"; nada fica pendente para sempre. No modelo anterior, com
 *    4 perfis, entravam 98 matches/dia e saíam 40 — a fila crescia sem fim e,
 *    sendo FIFO, chegaria a avisar sobre prazo já vencido.
 * 3. Ordem por prazo, descartando encerradas. Alerta atrasado sobre licitação
 *    vencida é pior que nenhum alerta.
 */

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  type ItemEmail,
  type LicitacaoParaNotificar,
  montarEmailMatches,
} from "../_shared/notificacao/conteudo.ts";
import { gerarResumo } from "../_shared/notificacao/resumo.ts";
import { enviarEmail } from "../_shared/notificacao/email.ts";
import { enviarPushUsuario } from "../_shared/notificacao/push.ts";
import { lerAssinatura } from "../_shared/assinatura.ts";

/** Perfis atendidos por rodada. Com 7 janelas por dia e teto de 3 emails por
 *  usuário, 40 por rodada cobre bem mais de 100 usuários ativos. */
const MAX_PERFIS_POR_EXECUCAO = 40;
/** Licitações detalhadas em cada email; o excedente vira "+N no painel". */
const DETALHADOS_POR_EMAIL = 8;
/** Resumos gerados ao mesmo tempo. Sequencial, 30 resumos encostavam no
 *  limite de tempo da função; em paralelo a rodada cabe com folga. */
const RESUMOS_SIMULTANEOS = 5;

interface ItemLote {
  match_id: string;
  licitacao_id: string;
  resumo_ia: string | null;
  numero_controle_pncp: string;
  objeto_compra: string;
  informacao_complementar: string | null;
  valor_total_estimado: number | null;
  data_abertura_proposta: string | null;
  data_encerramento_proposta: string | null;
  orgao_razao_social: string | null;
  unidade_nome: string | null;
  uf: string | null;
  municipio_nome: string | null;
  modalidade_nome: string | null;
  link_sistema_origem: string | null;
}

interface Lote {
  perfil_id: string;
  user_id: string;
  email: string;
  itens: ItemLote[];
  /** Pendentes com prazo em aberto (inclui os não detalhados). */
  validos: number;
  /** Todos os pendentes, inclusive já encerrados. */
  pendentes: number;
}

function licitacaoDoItem(i: ItemLote): LicitacaoParaNotificar {
  return {
    numero_controle_pncp: i.numero_controle_pncp,
    objeto_compra: i.objeto_compra,
    informacao_complementar: i.informacao_complementar,
    valor_total_estimado: i.valor_total_estimado,
    data_abertura_proposta: i.data_abertura_proposta,
    data_encerramento_proposta: i.data_encerramento_proposta,
    orgao_razao_social: i.orgao_razao_social,
    unidade_nome: i.unidade_nome,
    uf: i.uf,
    municipio_nome: i.municipio_nome,
    modalidade_nome: i.modalidade_nome,
    link_sistema_origem: i.link_sistema_origem,
  } as LicitacaoParaNotificar;
}

/**
 * Garante o resumo de cada item: reaproveita o que já está na licitação e
 * gera o que falta, em paralelo. O que falhar sai do email desta rodada em
 * vez de derrubar o lote inteiro.
 */
async function resumirItens(
  supabase: SupabaseClient,
  itens: ItemLote[],
  erros: Array<{ perfil_id: string; erro: string }>,
  perfilId: string,
  /** Cache da própria execução. Os lotes vêm de UMA consulta, então resumo_ia
   *  chega nulo para todos os perfis da rodada; sem isso, uma licitação que
   *  casa com 10 perfis seria resumida 10 vezes antes de o cache do banco
   *  valer para alguma coisa. */
  cacheRodada: Map<string, string>,
): Promise<ItemEmail[]> {
  const prontos: ItemEmail[] = [];
  const faltando: ItemLote[] = [];

  for (const item of itens) {
    const jaTem = item.resumo_ia ?? cacheRodada.get(item.licitacao_id);
    if (jaTem) {
      prontos.push({ licitacao: licitacaoDoItem(item), resumo: jaTem });
    } else {
      faltando.push(item);
    }
  }

  for (let i = 0; i < faltando.length; i += RESUMOS_SIMULTANEOS) {
    const bloco = faltando.slice(i, i + RESUMOS_SIMULTANEOS);
    const gerados = await Promise.all(
      bloco.map(async (item) => {
        try {
          const licitacao = licitacaoDoItem(item);
          const resumo = await gerarResumo(licitacao);
          // Guarda nos dois níveis: no banco, para as próximas rodadas; na
          // memória, para os demais perfis desta mesma execução.
          cacheRodada.set(item.licitacao_id, resumo);
          await supabase.rpc("guardar_resumo_ia", {
            p_licitacao_id: item.licitacao_id,
            p_resumo: resumo,
          });
          return { licitacao, resumo } as ItemEmail;
        } catch (erro) {
          erros.push({
            perfil_id: perfilId,
            erro: `resumo (${item.numero_controle_pncp}): ${mensagemDe(erro)}`,
          });
          return null;
        }
      }),
    );
    for (const g of gerados) if (g) prontos.push(g);
  }

  // Mantém a ordem de urgência que veio do banco.
  const posicao = new Map(
    itens.map((it, idx) => [it.numero_controle_pncp, idx]),
  );
  prontos.sort((a, b) =>
    (posicao.get(a.licitacao.numero_controle_pncp) ?? 0) -
    (posicao.get(b.licitacao.numero_controle_pncp) ?? 0)
  );
  return prontos;
}

Deno.serve(async (_req) => {
  const inicio = Date.now();

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: lotesData, error: erroLotes } = await supabase.rpc(
      "lotes_para_notificar",
      {
        p_max_perfis: MAX_PERFIS_POR_EXECUCAO,
        p_detalhados: DETALHADOS_POR_EMAIL,
      },
    );
    if (erroLotes) {
      throw new Error(`Falha ao montar lotes: ${erroLotes.message}`);
    }
    const lotes = (lotesData ?? []) as Lote[];

    let emailsEnviados = 0;
    let matchesFechados = 0;
    let resumosReusados = 0;
    /** Resumos gerados nesta execução, compartilhados entre os perfis. */
    const cacheRodada = new Map<string, string>();
    const erros: Array<{ perfil_id: string; erro: string }> = [];

    for (const lote of lotes) {
      try {
        // Conta expirada não recebe alerta; os matches ficam aguardando e
        // voltam ao ciclo se a pessoa assinar.
        const assinatura = await lerAssinatura(
          supabase,
          lote.user_id,
          lote.email,
        );
        if (
          assinatura.estado === "expirado" || assinatura.estado === "sem_conta"
        ) {
          continue;
        }

        resumosReusados += lote.itens.filter((i) =>
          i.resumo_ia || cacheRodada.has(i.licitacao_id)
        ).length;
        const itens = await resumirItens(
          supabase,
          lote.itens,
          erros,
          lote.perfil_id,
          cacheRodada,
        );
        if (itens.length === 0) continue;

        const extras = Math.max(0, lote.validos - itens.length);
        const { assunto, html } = montarEmailMatches(itens, extras);
        await enviarEmail(lote.email, assunto, html);
        emailsEnviados++;

        // Fecha o lote: todos os pendentes do perfil saem da fila, inclusive
        // os não detalhados e os já encerrados.
        const em = new Date().toISOString();
        const { data: fechados, error: erroFechar } = await supabase.rpc(
          "fechar_lote_notificado",
          { p_perfil_id: lote.perfil_id, p_em: em },
        );
        if (erroFechar) throw new Error(`fechar lote: ${erroFechar.message}`);
        matchesFechados += (fechados as number) ?? 0;

        // Push complementa o email; falha aqui não derruba nada.
        try {
          await enviarPushUsuario(
            supabase,
            lote.user_id,
            itens.length === 1
              ? "Nova licitação para o seu perfil"
              : `${lote.validos} novas licitações para o seu perfil`,
            itens[0].licitacao.objeto_compra.slice(0, 120),
            "/painel",
          );
        } catch { /* push é complementar; ignora falha */ }
      } catch (erro) {
        erros.push({ perfil_id: lote.perfil_id, erro: mensagemDe(erro) });
      }
    }

    const resumoExecucao = {
      funcao: "notificar",
      lotes: lotes.length,
      emails_enviados: emailsEnviados,
      matches_fechados: matchesFechados,
      resumos_reusados: resumosReusados,
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

function mensagemDe(erro: unknown): string {
  return erro instanceof Error ? erro.message : String(erro);
}
