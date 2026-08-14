/**
 * Backfill dos prazos de proposta (job de 5 em 5 minutos).
 *
 * Complementa `completar-licitacao`, que atende uma licitação sob demanda:
 * aqui varremos a fila do acervo — as licitações que entraram pela busca
 * textual antes da correção e ficaram sem data de proposta nem valor.
 *
 * `licitacoes` é dado compartilhado, então completar uma ficha serve a todos os
 * usuários que a virem. Por isso o trabalho é de um job e não de cada
 * navegador.
 *
 * Requisição: POST {} ou { limite }  — só service role (cron) ou admin.
 * Resposta:   { processadas, completadas, sem_dados, restantes }
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { buscarContratacao } from "../_shared/pncp/cliente.ts";
import { CABECALHOS_CORS, respostaPreflight } from "../_shared/cors.ts";

/** Quantas licitações por invocação. */
const LOTE_PADRAO = 120;
/** Requisições simultâneas ao PNCP. */
const SIMULTANEAS = 5;
/**
 * Orçamento de tempo da invocação. O job é reagendado a cada 5 minutos, então
 * é melhor devolver um lote parcial do que ser cortado no meio.
 */
const ORCAMENTO_MS = 100_000;
/** Retry curto: num lote grande, esperar 60s por uma ficha não vale a pena. */
const RETRY_LOTE = { timeoutMs: 15_000, tentativas: 2 };
/**
 * Carência aplicada quando o PNCP não respondeu. A fila só devolve a licitação
 * depois de 7 dias desde a tentativa, então marcar a tentativa recuada em
 * "7 dias menos 1 hora" a traz de volta em ~1 hora — sem abrir mão do limite
 * de uma nova tentativa por hora, caso o PNCP fique fora do ar.
 */
const CARENCIA_FALHA_MS = 7 * 24 * 60 * 60 * 1000 - 60 * 60 * 1000;

/** Colunas que a busca textual costumava deixar em branco. */
const COMPLETAVEIS = [
  "data_abertura_proposta",
  "data_encerramento_proposta",
  "valor_total_estimado",
  "informacao_complementar",
  "orgao_cnpj",
  "orgao_razao_social",
  "unidade_nome",
  "uf",
  "municipio_nome",
  "modalidade_id",
  "modalidade_nome",
  "situacao_nome",
] as const;

function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CABECALHOS_CORS, "Content-Type": "application/json" },
  });
}

function ehServiceRole(jwt: string): boolean {
  try {
    const [, payload] = jwt.split(".");
    const dados = JSON.parse(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/")),
    );
    return dados?.role === "service_role";
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  const preflight = respostaPreflight(req);
  if (preflight) return preflight;

  const inicio = Date.now();

  try {
    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Cron (service role) ou admin, para poder disparar à mão.
    const jwt = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!jwt) return json({ erro: "não autenticado" }, 401);
    if (!ehServiceRole(jwt)) {
      const { data: { user } } = await service.auth.getUser(jwt);
      if (!user?.email) return json({ erro: "não autenticado" }, 401);
      const { data: admin } = await service
        .from("admins")
        .select("email")
        .eq("email", user.email)
        .maybeSingle();
      if (!admin) return json({ erro: "acesso restrito" }, 403);
    }

    const corpo = await req.json().catch(() => ({})) as { limite?: number };
    const limite = Math.min(
      Math.max(Number(corpo.limite) || LOTE_PADRAO, 1),
      500,
    );

    const { data: fila, error: erroFila } = await service.rpc(
      "licitacoes_para_completar",
      { p_limite: limite },
    );
    if (erroFila) return json({ erro: erroFila.message }, 500);

    const pendentes = (fila ?? []) as Array<{
      id: string;
      numero_controle_pncp: string;
    }>;

    let processadas = 0;
    let completadas = 0;
    let semDados = 0;
    let indisponiveis = 0;

    /** Uma licitação: busca a ficha, preenche só o que está nulo. */
    async function completar(item: {
      id: string;
      numero_controle_pncp: string;
    }) {
      processadas += 1;

      const { data: atual } = await service
        .from("licitacoes")
        .select(COMPLETAVEIS.join(", "))
        .eq("id", item.id)
        .maybeSingle();
      const registro = (atual ?? {}) as unknown as Record<string, unknown>;

      const resultado = await buscarContratacao(
        item.numero_controle_pncp,
        RETRY_LOTE,
      );

      // A marca de tentativa é o que impede insistir para sempre. Mas
      // indisponibilidade do PNCP não é "não tem dado": nesse caso a marca
      // entra recuada, então a licitação volta à fila em cerca de uma hora em
      // vez dos sete dias de quem o PNCP respondeu sem prazo.
      const carencia = resultado.ok || resultado.motivo !== "indisponivel"
        ? 0
        : CARENCIA_FALHA_MS;
      const patch: Record<string, unknown> = {
        completar_tentado_em: new Date(Date.now() - carencia).toISOString(),
      };

      if (resultado.ok) {
        for (const coluna of COMPLETAVEIS) {
          const vindo =
            (resultado.ficha as unknown as Record<string, unknown>)[coluna];
          if (
            registro[coluna] === null && vindo !== null && vindo !== undefined
          ) {
            patch[coluna] = vindo;
          }
        }
      } else if (resultado.motivo === "indisponivel") {
        indisponiveis += 1;
      }

      const preencheu = Object.keys(patch).length > 1;
      if (preencheu) completadas += 1;
      else semDados += 1;

      await service.from("licitacoes").update(patch).eq("id", item.id);
    }

    // Fatias de SIMULTANEAS, respeitando o orçamento de tempo.
    for (let i = 0; i < pendentes.length; i += SIMULTANEAS) {
      if (Date.now() - inicio > ORCAMENTO_MS) break;
      await Promise.all(
        pendentes.slice(i, i + SIMULTANEAS).map((item) =>
          completar(item).catch(() => {
            semDados += 1;
          })
        ),
      );
    }

    const { count: restantes } = await service
      .from("licitacoes")
      .select("id", { count: "exact", head: true })
      .is("data_encerramento_proposta", null);

    return json({
      processadas,
      completadas,
      sem_dados: semDados,
      // Parte de sem_dados: PNCP fora do ar, volta à fila em ~1 hora.
      indisponiveis,
      restantes: restantes ?? null,
      duracao_ms: Date.now() - inicio,
    });
  } catch (erro) {
    return json(
      { erro: erro instanceof Error ? erro.message : String(erro) },
      500,
    );
  }
});
