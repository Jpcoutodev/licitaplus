/**
 * Núcleo da coleta e do matching, compartilhado pelas functions `coletar`
 * (cron) e `busca-retroativa` (disparo pontual por perfil). Toda escrita usa
 * o client service role; toda leitura do PNCP passa pelo cliente isolado.
 *
 * Robustez contra a lentidão do PNCP e o timeout curto de Edge Functions:
 *  - cursor de paginação persistente por fatia (coleta_progresso): cada
 *    janela do cron continua de onde a anterior parou;
 *  - orçamento de tempo por invocação: paramos de iniciar trabalho novo
 *    antes de a function ser encerrada à força;
 *  - matching roda antes e depois de cada fatia: progresso parcial já
 *    vira match para o usuário.
 */

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  buscarPaginaPropostasAbertas,
  buscarPorTermoTextual,
  formatarDataPncp,
} from "./pncp/cliente.ts";
import type { LicitacaoColetada } from "./pncp/tipos.ts";
import { sleep } from "./http.ts";
import {
  derivarFatias,
  expandirComSinonimos,
  type Fatia,
  type PerfilColeta,
} from "./fatias.ts";

/** Horizonte de dataFinal: propostas que encerram em até 90 dias. */
const HORIZONTE_DIAS = 90;
/** Orçamento de páginas por fatia por invocação. */
const MAX_PAGINAS_POR_FATIA = 5;
/** Orçamento de tempo da invocação: não iniciar trabalho novo além disso. */
const ORCAMENTO_MS = 100_000;
const PAUSA_ENTRE_PAGINAS_MS = 300;
/** Tamanho do lote de upsert no banco. */
const LOTE_UPSERT = 200;

export interface ResultadoFatia {
  fatia: Fatia;
  coletadas: number;
  paginasLidas: number;
  pagina_cursor: number;
  erro?: string;
}

export interface ResultadoMatching {
  perfil_id: string;
  matches_novos: number;
  erro?: string;
}

function dataFinalHorizonte(): string {
  return formatarDataPncp(
    new Date(Date.now() + HORIZONTE_DIAS * 24 * 60 * 60 * 1000),
  );
}

/** Lê os perfis ativos (via service role). */
export async function lerPerfisAtivos(
  supabase: SupabaseClient,
): Promise<PerfilColeta[]> {
  const { data, error } = await supabase
    .from("perfis")
    .select("id, palavras_chave, ufs, modalidades")
    .eq("ativo", true);
  if (error) throw new Error(`Falha ao ler perfis ativos: ${error.message}`);
  return data ?? [];
}

/**
 * Grava licitações. Com sobrescrever=true (varredura oficial, dados
 * completos) registros existentes são atualizados — isso enriquece os
 * parciais vindos da busca textual. Com sobrescrever=false (busca textual,
 * dados parciais) duplicadas são ignoradas para nunca rebaixar um registro
 * completo.
 */
async function gravarLicitacoes(
  supabase: SupabaseClient,
  itens: LicitacaoColetada[],
  sobrescrever: boolean,
): Promise<void> {
  for (let inicio = 0; inicio < itens.length; inicio += LOTE_UPSERT) {
    const lote = itens.slice(inicio, inicio + LOTE_UPSERT);
    const { error } = await supabase
      .from("licitacoes")
      .upsert(lote, {
        onConflict: "numero_controle_pncp",
        ignoreDuplicates: !sobrescrever,
      });
    if (error) throw new Error(`Falha ao gravar licitações: ${error.message}`);
  }
}

/** Na tabela de progresso, fatia "todas as modalidades" é modalidade 0. */
function chaveProgresso(fatia: Fatia): { uf: string; modalidade: number } {
  return { uf: fatia.uf, modalidade: fatia.codigoModalidade ?? 0 };
}

async function lerPaginaInicial(
  supabase: SupabaseClient,
  fatia: Fatia,
): Promise<number> {
  const chave = chaveProgresso(fatia);
  const { data } = await supabase
    .from("coleta_progresso")
    .select("proxima_pagina")
    .eq("uf", chave.uf)
    .eq("modalidade", chave.modalidade)
    .maybeSingle();
  return data?.proxima_pagina ?? 1;
}

async function gravarProgresso(
  supabase: SupabaseClient,
  fatia: Fatia,
  proximaPagina: number,
): Promise<void> {
  const chave = chaveProgresso(fatia);
  await supabase.from("coleta_progresso").upsert({
    ...chave,
    proxima_pagina: proximaPagina,
    atualizado_em: new Date().toISOString(),
  });
}

/**
 * Coleta uma fatia a partir do cursor persistido, até o orçamento de páginas
 * ou de tempo. Ao esgotar a varredura, o cursor volta à página 1 (a próxima
 * janela recomeça e capta o que for novo). Idempotente.
 */
export async function coletarFatia(
  supabase: SupabaseClient,
  fatia: Fatia,
  prazoMs: number,
): Promise<ResultadoFatia> {
  const paginaInicial = await lerPaginaInicial(supabase, fatia);
  const resultado: ResultadoFatia = {
    fatia,
    coletadas: 0,
    paginasLidas: 0,
    pagina_cursor: paginaInicial,
  };

  const filtro = {
    dataFinal: dataFinalHorizonte(),
    uf: fatia.uf,
    codigoModalidade: fatia.codigoModalidade,
  };

  let pagina = paginaInicial;
  try {
    while (
      resultado.paginasLidas < MAX_PAGINAS_POR_FATIA &&
      Date.now() < prazoMs
    ) {
      const { itens, totalPaginas, paginasRestantes } =
        await buscarPaginaPropostasAbertas(filtro, pagina);
      await gravarLicitacoes(supabase, itens, true);

      resultado.coletadas += itens.length;
      resultado.paginasLidas++;

      // Varredura concluída (ou cursor além do fim): recomeça do início.
      if (paginasRestantes <= 0 || pagina >= totalPaginas) {
        pagina = 1;
        break;
      }
      pagina++;
      await sleep(PAUSA_ENTRE_PAGINAS_MS);
    }
  } catch (erro) {
    // Falha em uma fatia não derruba o lote; o cursor preserva o avanço feito.
    resultado.erro = erro instanceof Error ? erro.message : String(erro);
  }

  resultado.pagina_cursor = pagina;
  await gravarProgresso(supabase, fatia, pagina);
  return resultado;
}

export interface ResultadoBuscaTextual {
  consultas: number;
  coletadas: number;
  erros: string[];
}

/** Limite de consultas textuais (termo × UF) por janela. */
const MAX_CONSULTAS_TEXTUAIS = 12;

/**
 * Coleta dirigida pelas palavras-chave dos perfis via busca textual do PNCP
 * (o mesmo mecanismo do portal). Best-effort: qualquer falha é registrada e
 * a varredura oficial segue como fallback. Registros gravados sem
 * sobrescrever — a varredura enriquece depois com os dados completos.
 */
export async function coletarPorBuscaTextual(
  supabase: SupabaseClient,
  perfis: PerfilColeta[],
  prazoMs: number,
): Promise<ResultadoBuscaTextual> {
  const resultado: ResultadoBuscaTextual = {
    consultas: 0,
    coletadas: 0,
    erros: [],
  };

  // Pares únicos (termo, uf) de todos os perfis ativos.
  const pares = new Map<string, { termo: string; uf: string }>();
  for (const perfil of perfis) {
    for (const termo of expandirComSinonimos(perfil.palavras_chave)) {
      for (const uf of perfil.ufs) {
        const sigla = uf.trim().toUpperCase();
        if (sigla) pares.set(`${termo}|${sigla}`, { termo, uf: sigla });
      }
    }
  }

  for (const { termo, uf } of pares.values()) {
    if (resultado.consultas >= MAX_CONSULTAS_TEXTUAIS) break;
    if (Date.now() >= prazoMs) break;
    resultado.consultas++;

    try {
      const itens = await buscarPorTermoTextual(termo, uf);
      await gravarLicitacoes(supabase, itens, false);
      resultado.coletadas += itens.length;
    } catch (erro) {
      resultado.erros.push(
        `"${termo}"/${uf}: ${erro instanceof Error ? erro.message : erro}`,
      );
    }
    await sleep(PAUSA_ENTRE_PAGINAS_MS);
  }

  return resultado;
}

/** Roda o matching de cada perfil (termos expandidos com sinônimos). */
export async function executarMatchingPerfis(
  supabase: SupabaseClient,
  perfis: PerfilColeta[],
): Promise<ResultadoMatching[]> {
  const resultados: ResultadoMatching[] = [];

  for (const perfil of perfis) {
    const termos = expandirComSinonimos(perfil.palavras_chave);
    const { data, error } = await supabase.rpc("executar_matching", {
      p_perfil_id: perfil.id,
      p_termos: termos,
    });

    resultados.push({
      perfil_id: perfil.id,
      matches_novos: typeof data === "number" ? data : 0,
      erro: error ? error.message : undefined,
    });
  }
  return resultados;
}

function somarMatching(
  acumulado: Map<string, ResultadoMatching>,
  rodada: ResultadoMatching[],
): void {
  for (const resultado of rodada) {
    const atual = acumulado.get(resultado.perfil_id);
    if (atual) {
      atual.matches_novos += resultado.matches_novos;
      atual.erro = resultado.erro ?? atual.erro;
    } else {
      acumulado.set(resultado.perfil_id, { ...resultado });
    }
  }
}

/**
 * Janela de coleta, em ordem de valor para o usuário:
 *  1. matching inicial (casa o que já está no banco);
 *  2. busca textual pelas palavras-chave (paridade com a busca do portal),
 *     seguida de matching;
 *  3. varredura oficial por fatias com o orçamento restante (fallback e
 *     enriquecimento), com matching após cada fatia.
 */
export async function executarJanelaDeColeta(
  supabase: SupabaseClient,
  perfis: PerfilColeta[],
  fatiasEscolhidas?: Fatia[],
): Promise<{
  fatias: ResultadoFatia[];
  matching: ResultadoMatching[];
  buscaTextual: ResultadoBuscaTextual;
}> {
  const prazoMs = Date.now() + ORCAMENTO_MS;
  const fatias = fatiasEscolhidas ?? derivarFatias(perfis);

  const acumulado = new Map<string, ResultadoMatching>();
  somarMatching(acumulado, await executarMatchingPerfis(supabase, perfis));

  const buscaTextual = await coletarPorBuscaTextual(supabase, perfis, prazoMs);
  if (buscaTextual.coletadas > 0) {
    somarMatching(acumulado, await executarMatchingPerfis(supabase, perfis));
  }

  const resultadosFatias: ResultadoFatia[] = [];
  for (const fatia of fatias) {
    if (Date.now() >= prazoMs) break;
    const resultado = await coletarFatia(supabase, fatia, prazoMs);
    resultadosFatias.push(resultado);
    if (resultado.coletadas > 0) {
      somarMatching(acumulado, await executarMatchingPerfis(supabase, perfis));
    }
  }

  return {
    fatias: resultadosFatias,
    matching: [...acumulado.values()],
    buscaTextual,
  };
}
