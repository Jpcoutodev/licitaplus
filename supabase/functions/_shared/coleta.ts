/**
 * Núcleo da coleta e do matching, compartilhado pelas functions `coletar`
 * (cron) e `busca-retroativa` (disparo pontual por perfil). Toda escrita usa
 * o client service role; toda leitura do PNCP passa pelo cliente isolado.
 */

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  buscarPaginaPropostasAbertas,
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
/** Orçamento de páginas por fatia por invocação (Edge Functions têm timeout curto). */
const MAX_PAGINAS_POR_FATIA = 10;
const PAUSA_ENTRE_PAGINAS_MS = 500;
/** Tamanho do lote de upsert no banco. */
const LOTE_UPSERT = 200;

export interface ResultadoFatia {
  fatia: Fatia;
  coletadas: number;
  paginasLidas: number;
  paginasRestantes: number;
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

/** Grava licitações novas; duplicadas (numero_controle_pncp) são ignoradas. */
async function gravarLicitacoes(
  supabase: SupabaseClient,
  itens: LicitacaoColetada[],
): Promise<void> {
  for (let inicio = 0; inicio < itens.length; inicio += LOTE_UPSERT) {
    const lote = itens.slice(inicio, inicio + LOTE_UPSERT);
    const { error } = await supabase
      .from("licitacoes")
      .upsert(lote, {
        onConflict: "numero_controle_pncp",
        ignoreDuplicates: true,
      });
    if (error) throw new Error(`Falha ao gravar licitações: ${error.message}`);
  }
}

/**
 * Coleta uma fatia (UF × modalidade): pagina o PNCP até o orçamento de
 * páginas e grava as licitações. Idempotente — repetir não duplica nada.
 */
export async function coletarFatia(
  supabase: SupabaseClient,
  fatia: Fatia,
): Promise<ResultadoFatia> {
  const resultado: ResultadoFatia = {
    fatia,
    coletadas: 0,
    paginasLidas: 0,
    paginasRestantes: 0,
  };

  try {
    const filtro = {
      dataFinal: dataFinalHorizonte(),
      uf: fatia.uf,
      codigoModalidade: fatia.codigoModalidade,
    };

    let pagina = 1;
    while (pagina <= MAX_PAGINAS_POR_FATIA) {
      const { itens, paginasRestantes } = await buscarPaginaPropostasAbertas(
        filtro,
        pagina,
      );
      await gravarLicitacoes(supabase, itens);

      resultado.coletadas += itens.length;
      resultado.paginasLidas = pagina;
      resultado.paginasRestantes = paginasRestantes;

      if (paginasRestantes <= 0) break;
      pagina++;
      await sleep(PAUSA_ENTRE_PAGINAS_MS);
    }
  } catch (erro) {
    // Falha em uma fatia não derruba o lote; a próxima janela recupera.
    resultado.erro = erro instanceof Error ? erro.message : String(erro);
  }

  return resultado;
}

/** Coleta todas as fatias em sequência (coletor educado: uma por vez). */
export async function coletarFatias(
  supabase: SupabaseClient,
  fatias: Fatia[],
): Promise<ResultadoFatia[]> {
  const resultados: ResultadoFatia[] = [];
  for (const fatia of fatias) {
    resultados.push(await coletarFatia(supabase, fatia));
  }
  return resultados;
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

/** Fluxo completo de uma janela de coleta: fatias -> gravação -> matching. */
export async function executarJanelaDeColeta(
  supabase: SupabaseClient,
  perfis: PerfilColeta[],
): Promise<{ fatias: ResultadoFatia[]; matching: ResultadoMatching[] }> {
  const fatias = derivarFatias(perfis);
  const resultadosFatias = await coletarFatias(supabase, fatias);
  const resultadosMatching = await executarMatchingPerfis(supabase, perfis);
  return { fatias: resultadosFatias, matching: resultadosMatching };
}
