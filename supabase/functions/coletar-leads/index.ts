/**
 * Coleta de leads — ferramenta interna de prospecção (só admin).
 *
 * Varre contratos assinados no PNCP, filtra por palavra-chave/UF e agrega por
 * fornecedor: quem já vende para o governo é quem mais tende a querer
 * monitorar licitações.
 *
 * Por que é retomável: em 10 dias o PNCP publica ~61 mil contratos no país
 * inteiro (~2,2 milhões em 12 meses), e a rota não aceita filtro de UF nem de
 * texto — o recorte é sempre nosso, depois de baixar. Uma varredura de uma
 * tacada só estouraria os limites da Edge Function, então cada chamada
 * processa o que couber no orçamento e devolve onde parou; o painel chama de
 * novo até terminar.
 *
 * Idempotência: upsert por numero_controle_pncp nos contratos e recontagem
 * completa por fornecedor a partir do que está gravado — rodar duas vezes o
 * mesmo período não duplica nem infla número nenhum.
 */

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import {
  buscarContratosPorPeriodo,
  type ContratoPNCP,
} from "../_shared/pncp/cliente.ts";
import { CABECALHOS_CORS, respostaPreflight } from "../_shared/cors.ts";

/** Registros por página no PNCP (a rota recusa páginas muito pequenas). */
const TAMANHO_PAGINA = 500;
/** Orçamento de trabalho por chamada. O corte real da plataforma é bem maior;
 *  paramos antes para a resposta sempre chegar e o painel poder continuar. */
const ORCAMENTO_MS = 20_000;
/** Teto de páginas por chamada, além do tempo. */
const MAX_PAGINAS_POR_CHAMADA = 12;

function clientServico(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

function respostaJson(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CABECALHOS_CORS, "Content-Type": "application/json" },
  });
}

/** Normaliza para comparar sem acento nem caixa. */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function combinaPalavrasChave(objeto: string, termos: string[]): boolean {
  if (termos.length === 0) return true;
  const alvo = normalizar(objeto);
  return termos.some((termo) => alvo.includes(normalizar(termo)));
}

interface LinhaContrato {
  numero_controle_pncp: string;
  ni_fornecedor: string;
  nome_fornecedor: string;
  tipo_pessoa: string | null;
  cnpj_orgao: string | null;
  orgao_nome: string | null;
  uf: string | null;
  municipio: string | null;
  objeto_contrato: string | null;
  valor_global: number | null;
  data_publicacao: string | null;
  raw_json: ContratoPNCP;
}

function mapear(c: ContratoPNCP): LinhaContrato | null {
  const ni = (c.niFornecedor ?? "").replace(/\D/g, "");
  const nome = c.nomeRazaoSocialFornecedor?.trim();
  if (!ni || !nome) return null;
  return {
    numero_controle_pncp: c.numeroControlePNCP,
    ni_fornecedor: ni,
    nome_fornecedor: nome,
    tipo_pessoa: c.tipoPessoa ?? null,
    cnpj_orgao: c.orgaoEntidade?.cnpj ?? null,
    orgao_nome: c.orgaoEntidade?.razaoSocial ?? null,
    uf: c.unidadeOrgao?.ufSigla ?? null,
    municipio: c.unidadeOrgao?.municipioNome ?? null,
    objeto_contrato: c.objetoContrato ?? null,
    valor_global: typeof c.valorGlobal === "number" ? c.valorGlobal : null,
    data_publicacao: c.dataPublicacaoPncp ?? null,
    raw_json: c,
  };
}

/**
 * Recalcula o agregado dos fornecedores tocados nesta rodada, lendo tudo o
 * que já está em leads_contratos. Recontar em vez de somar o delta é o que
 * mantém o número certo quando a mesma janela é coletada de novo.
 *
 * Só as colunas de coleta são tocadas — status, notas e contatos são da
 * equipe e o upsert não pode encostar neles.
 */
async function reagregar(
  service: SupabaseClient,
  nis: string[],
): Promise<number> {
  let atualizados = 0;

  for (const ni of nis) {
    const { data: contratos } = await service
      .from("leads_contratos")
      .select("nome_fornecedor, valor_global, data_publicacao, uf, cnpj_orgao, objeto_contrato")
      .eq("ni_fornecedor", ni)
      .order("data_publicacao", { ascending: false });

    if (!contratos || contratos.length === 0) continue;

    const ufs = [
      ...new Set(
        contratos.map((c) => c.uf as string | null).filter(Boolean) as string[],
      ),
    ];
    const orgaos = new Set(
      contratos.map((c) => c.cnpj_orgao as string | null).filter(Boolean),
    );
    const total = contratos.reduce(
      (soma, c) => soma + Number(c.valor_global ?? 0),
      0,
    );

    const { error } = await service
      .from("leads_empresas")
      .upsert({
        ni_fornecedor: ni,
        nome_fornecedor: contratos[0].nome_fornecedor as string,
        qtd_contratos: contratos.length,
        valor_total_acumulado: total,
        data_ultimo_contrato: contratos[0].data_publicacao as string | null,
        ufs,
        qtd_orgaos: orgaos.size,
        objeto_ultimo_contrato: (contratos[0].objeto_contrato as string | null)
          ?.slice(0, 500) ?? null,
      }, { onConflict: "ni_fornecedor" });

    if (!error) atualizados++;
  }

  return atualizados;
}

Deno.serve(async (req) => {
  const preflight = respostaPreflight(req);
  if (preflight) return preflight;

  const inicioReq = Date.now();

  try {
    // Só admin dispara a coleta. Lemos o usuário com o JWT da requisição e
    // conferimos na tabela de admins com service role.
    const service = clientServico();
    const jwt = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!jwt) return respostaJson({ erro: "não autenticado" }, 401);

    const { data: { user } } = await service.auth.getUser(jwt);
    if (!user?.email) return respostaJson({ erro: "não autenticado" }, 401);

    const { data: admin } = await service
      .from("admins")
      .select("email")
      .eq("email", user.email)
      .maybeSingle();
    if (!admin) return respostaJson({ erro: "acesso restrito" }, 403);

    const corpo = await req.json().catch(() => ({})) as Record<string, unknown>;
    const dataInicial = String(corpo.data_inicial ?? "");
    const dataFinal = String(corpo.data_final ?? "");
    if (!/^\d{8}$/.test(dataInicial) || !/^\d{8}$/.test(dataFinal)) {
      return respostaJson(
        { erro: "informe data_inicial e data_final no formato AAAAMMDD" },
        400,
      );
    }

    const termos = Array.isArray(corpo.palavras_chave)
      ? (corpo.palavras_chave as unknown[])
        .map((t) => String(t).trim())
        .filter(Boolean)
      : [];
    const ufs = Array.isArray(corpo.ufs)
      ? (corpo.ufs as unknown[]).map((u) => String(u).toUpperCase())
      : [];
    const soPj = corpo.so_pj !== false; // padrão: só pessoa jurídica
    let pagina = Number(corpo.pagina) || 1;

    let lidos = 0;
    let gravados = 0;
    let paginas = 0;
    let totalPaginas = 0;
    let totalRegistros = 0;
    const nisTocados = new Set<string>();

    while (paginas < MAX_PAGINAS_POR_CHAMADA) {
      const pag = await buscarContratosPorPeriodo(
        dataInicial,
        dataFinal,
        pagina,
        TAMANHO_PAGINA,
      );
      totalPaginas = pag.totalPaginas;
      totalRegistros = pag.totalRegistros;
      lidos += pag.itens.length;
      paginas++;

      const linhas = pag.itens
        .map(mapear)
        .filter((l): l is LinhaContrato => l !== null)
        .filter((l) => !soPj || l.tipo_pessoa === "PJ")
        .filter((l) => ufs.length === 0 || (l.uf && ufs.includes(l.uf)))
        .filter((l) => combinaPalavrasChave(l.objeto_contrato ?? "", termos));

      if (linhas.length > 0) {
        const { error } = await service
          .from("leads_contratos")
          .upsert(linhas, { onConflict: "numero_controle_pncp" });
        if (error) throw new Error(`gravar contratos: ${error.message}`);
        gravados += linhas.length;
        for (const l of linhas) nisTocados.add(l.ni_fornecedor);
      }

      pagina++;
      if (pagina > totalPaginas) break;
      if (Date.now() - inicioReq > ORCAMENTO_MS) break;
    }

    const empresas = await reagregar(service, [...nisTocados]);
    const terminou = pagina > totalPaginas;

    console.log(JSON.stringify({
      funcao: "coletar-leads",
      periodo: `${dataInicial}-${dataFinal}`,
      paginas,
      lidos,
      gravados,
      empresas,
      proxima_pagina: terminou ? null : pagina,
      duracao_ms: Date.now() - inicioReq,
    }));

    return respostaJson({
      terminou,
      proxima_pagina: terminou ? null : pagina,
      total_paginas: totalPaginas,
      total_registros: totalRegistros,
      contratos_lidos: lidos,
      contratos_gravados: gravados,
      empresas_atualizadas: empresas,
    });
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    console.error(JSON.stringify({ funcao: "coletar-leads", erro: mensagem }));
    return respostaJson({ erro: mensagem }, 500);
  }
});
