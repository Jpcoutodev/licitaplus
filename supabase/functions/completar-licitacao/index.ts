/**
 * Completa uma licitação com a ficha oficial do PNCP.
 *
 * Por que existe: a coleta tem dois caminhos. A varredura oficial
 * (/contratacoes/proposta) traz a ficha completa; a busca textual, que é o que
 * acha licitação por palavra-chave fora do horizonte da varredura, devolve o
 * edital SEM as datas de proposta e às vezes sem o valor. O registro parcial só
 * era completado se a varredura passasse por ele depois — o que pode nunca
 * acontecer. Numa lista de oportunidades isso é um detalhe; na aba Licitando é
 * o dado principal: sem as datas não há prazo para acompanhar nem marca no
 * calendário.
 *
 * A escrita é aqui (service role) porque `licitacoes` é dado compartilhado:
 * autenticado só lê.
 *
 * Requisição: POST { licitacao_id }
 * Resposta:   { atualizado: boolean, motivo?: string, licitacao?: {...} }
 *
 * Nunca rebaixa dado bom: só preenche coluna que está nula no banco e veio
 * preenchida do PNCP.
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { buscarContratacao } from "../_shared/pncp/cliente.ts";
import { CABECALHOS_CORS, respostaPreflight } from "../_shared/cors.ts";

function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CABECALHOS_CORS, "Content-Type": "application/json" },
  });
}

/** Colunas que a busca textual costuma deixar em branco. */
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

Deno.serve(async (req) => {
  const preflight = respostaPreflight(req);
  if (preflight) return preflight;

  try {
    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Basta estar logado: o dado é público (vem do PNCP) e a tabela é
    // compartilhada entre todos os usuários — completar uma ficha beneficia
    // qualquer um que veja aquela licitação.
    const jwt = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!jwt) return json({ erro: "não autenticado" }, 401);
    const { data: { user } } = await service.auth.getUser(jwt);
    if (!user) return json({ erro: "não autenticado" }, 401);

    const corpo = await req.json().catch(() => ({})) as {
      licitacao_id?: string;
    };
    const licitacaoId = String(corpo.licitacao_id ?? "").trim();
    if (!licitacaoId) return json({ erro: "licitacao_id é obrigatório" }, 400);

    const { data: atual, error: erroLeitura } = await service
      .from("licitacoes")
      .select(
        `id, numero_controle_pncp, ${COMPLETAVEIS.join(", ")}`,
      )
      .eq("id", licitacaoId)
      .maybeSingle();

    if (erroLeitura) return json({ erro: erroLeitura.message }, 500);
    if (!atual) return json({ erro: "licitação não encontrada" }, 404);

    const registro = atual as unknown as Record<string, unknown> & {
      numero_controle_pncp: string;
    };

    // Já completa: não bate no PNCP à toa (a aba chama isto ao abrir).
    if (
      registro.data_abertura_proposta !== null &&
      registro.data_encerramento_proposta !== null
    ) {
      return json({ atualizado: false, motivo: "já estava completa" });
    }

    const doPncp = await buscarContratacao(registro.numero_controle_pncp);
    if (!doPncp) {
      return json({
        atualizado: false,
        motivo: "o PNCP não devolveu a ficha desta licitação",
      });
    }

    // Só o que está nulo aqui e veio preenchido de lá.
    const patch: Record<string, unknown> = {};
    for (const coluna of COMPLETAVEIS) {
      const vindo = (doPncp as unknown as Record<string, unknown>)[coluna];
      if (registro[coluna] === null && vindo !== null && vindo !== undefined) {
        patch[coluna] = vindo;
      }
    }

    if (Object.keys(patch).length === 0) {
      return json({
        atualizado: false,
        motivo: "o PNCP também não informa as datas desta licitação",
      });
    }

    const { data: atualizada, error: erroUpdate } = await service
      .from("licitacoes")
      .update(patch)
      .eq("id", licitacaoId)
      .select(
        `id, data_abertura_proposta, data_encerramento_proposta,
         valor_total_estimado`,
      )
      .single();

    if (erroUpdate) return json({ erro: erroUpdate.message }, 500);

    return json({
      atualizado: true,
      campos: Object.keys(patch),
      licitacao: atualizada,
    });
  } catch (erro) {
    return json({ erro: erro instanceof Error ? erro.message : String(erro) }, 500);
  }
});
