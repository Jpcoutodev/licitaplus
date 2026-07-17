/**
 * Edge Function `analise-ia` — chat de análise de licitação.
 * Chamada pelo navegador (CORS + JWT). A IA recebe como contexto:
 *   - a licitação selecionada (campos estruturados completos);
 *   - os itens do edital, buscados na API do PNCP (quantidades e valores);
 *   - a lista de favoritas do usuário (para comparações).
 *
 * Body: { licitacao_id?: string, mensagens: [{ role, content }] }
 * O histórico da conversa fica no cliente; a function é stateless.
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { conversarComIA, type MensagemChat } from "../_shared/ia/minimax.ts";
import {
  buscarItensContratacao,
  type ItemContratacaoPNCP,
} from "../_shared/pncp/cliente.ts";
import { CABECALHOS_CORS, respostaPreflight } from "../_shared/cors.ts";

const MAX_MENSAGENS = 16;
const MAX_TAMANHO_MENSAGEM = 4000;
const MAX_ITENS_NO_CONTEXTO = 40;
const MAX_FAVORITAS_NO_CONTEXTO = 15;

interface LicitacaoContexto {
  id: string;
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
  situacao_nome: string | null;
  link_sistema_origem: string | null;
}

const COLUNAS_CONTEXTO =
  `id, numero_controle_pncp, objeto_compra, informacao_complementar,
   valor_total_estimado, data_abertura_proposta, data_encerramento_proposta,
   orgao_razao_social, unidade_nome, uf, municipio_nome, modalidade_nome,
   situacao_nome, link_sistema_origem`;

Deno.serve(async (req) => {
  const preflight = respostaPreflight(req);
  if (preflight) return preflight;

  try {
    const corpo = await req.json().catch(() => ({}));
    const mensagens = validarMensagens(corpo?.mensagens);
    if (!mensagens) {
      return respostaJson({ erro: "mensagens inválidas" }, 400);
    }

    // Client com o token do usuário: RLS limita favoritos ao dono.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: {
          headers: { Authorization: req.headers.get("Authorization") ?? "" },
        },
      },
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return respostaJson({ erro: "não autenticado" }, 401);

    const [selecionada, favoritas] = await Promise.all([
      carregarLicitacao(supabase, corpo?.licitacao_id),
      carregarFavoritas(supabase),
    ]);

    const itens = selecionada
      ? await buscarItensContratacao(selecionada.numero_controle_pncp)
      : null;

    const resposta = await conversarComIA(
      [
        {
          role: "system",
          content: montarContexto(selecionada, itens, favoritas),
        },
        ...mensagens,
      ],
      4096,
    );

    console.log(
      JSON.stringify({
        funcao: "analise-ia",
        licitacao_id: selecionada?.id ?? null,
        mensagens: mensagens.length,
        itens_pncp: itens?.length ?? 0,
      }),
    );
    return respostaJson({ resposta }, 200);
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    console.error(JSON.stringify({ funcao: "analise-ia", erro: mensagem }));
    return respostaJson({ erro: mensagem }, 500);
  }
});

function validarMensagens(entrada: unknown): MensagemChat[] | null {
  if (!Array.isArray(entrada) || entrada.length === 0) return null;
  const mensagens: MensagemChat[] = [];
  for (const item of entrada.slice(-MAX_MENSAGENS)) {
    const role = (item as { role?: string })?.role;
    const content = (item as { content?: string })?.content;
    if (
      (role !== "user" && role !== "assistant") ||
      typeof content !== "string" || !content.trim()
    ) {
      return null;
    }
    mensagens.push({ role, content: content.slice(0, MAX_TAMANHO_MENSAGEM) });
  }
  return mensagens;
}

async function carregarLicitacao(
  supabase: ReturnType<typeof createClient>,
  licitacaoId: unknown,
): Promise<LicitacaoContexto | null> {
  if (typeof licitacaoId !== "string" || !licitacaoId) return null;
  const { data } = await supabase
    .from("licitacoes")
    .select(COLUNAS_CONTEXTO)
    .eq("id", licitacaoId)
    .maybeSingle<LicitacaoContexto>();
  return data ?? null;
}

async function carregarFavoritas(
  supabase: ReturnType<typeof createClient>,
): Promise<LicitacaoContexto[]> {
  const { data } = await supabase
    .from("favoritos")
    .select(`licitacoes ( ${COLUNAS_CONTEXTO} )`)
    .order("created_at", { ascending: false })
    .limit(MAX_FAVORITAS_NO_CONTEXTO);
  return ((data ?? []) as unknown as Array<{ licitacoes: LicitacaoContexto }>)
    .map((f) => f.licitacoes)
    .filter(Boolean);
}

function formatarLicitacao(l: LicitacaoContexto): string {
  return [
    `Controle PNCP: ${l.numero_controle_pncp}`,
    `Objeto: ${l.objeto_compra}`,
    l.informacao_complementar
      ? `Informação complementar: ${l.informacao_complementar.slice(0, 1500)}`
      : null,
    `Valor total estimado: ${l.valor_total_estimado ?? "não informado"}`,
    `Abertura das propostas: ${l.data_abertura_proposta ?? "não informada"}`,
    `Encerramento das propostas: ${l.data_encerramento_proposta ?? "não informado"}`,
    `Órgão: ${l.orgao_razao_social ?? "?"} (${l.unidade_nome ?? "?"})`,
    `Local: ${l.municipio_nome ?? "?"}/${l.uf ?? "?"}`,
    `Modalidade: ${l.modalidade_nome ?? "?"} | Situação: ${l.situacao_nome ?? "?"}`,
    l.link_sistema_origem ? `Link: ${l.link_sistema_origem}` : null,
  ].filter(Boolean).join("\n");
}

function formatarItens(itens: ItemContratacaoPNCP[]): string {
  return itens
    .slice(0, MAX_ITENS_NO_CONTEXTO)
    .map(
      (i) =>
        `${i.numeroItem}. ${i.descricao ?? "?"} — qtd ${i.quantidade ?? "?"} ${i.unidadeMedida ?? ""}, valor unit. estimado ${i.valorUnitarioEstimado ?? "?"}, total ${i.valorTotal ?? "?"} (${i.situacaoCompraItemNome ?? "?"})`,
    )
    .join("\n");
}

function montarContexto(
  selecionada: LicitacaoContexto | null,
  itens: ItemContratacaoPNCP[] | null,
  favoritas: LicitacaoContexto[],
): string {
  const blocos = [
    "Você é um consultor sênior em licitações públicas brasileiras (Lei 14.133/2021) " +
    "que atende donos de pequenas e médias empresas leigos no assunto. Responda em " +
    "português simples e direto, com orientação prática: o que está sendo comprado, " +
    "se vale a pena participar, prazos, documentação típica e riscos. Use SOMENTE as " +
    "informações fornecidas abaixo e conhecimento geral sobre licitações; se não " +
    "souber algo específico do edital, diga claramente que a informação não está " +
    "disponível e onde o usuário pode encontrá-la (edital no sistema de origem). " +
    "Nunca invente valores, datas ou exigências.",
  ];

  if (selecionada) {
    blocos.push(`## Licitação em análise\n${formatarLicitacao(selecionada)}`);
    if (itens && itens.length > 0) {
      blocos.push(
        `## Itens do edital (via API do PNCP)\n${formatarItens(itens)}`,
      );
    } else {
      blocos.push(
        "## Itens do edital\nNão foi possível obter os itens na API do PNCP agora.",
      );
    }
  } else {
    blocos.push(
      "## Licitação em análise\nNenhuma licitação selecionada — oriente o usuário a escolher uma favorita para análise detalhada, mas responda perguntas gerais normalmente.",
    );
  }

  if (favoritas.length > 0) {
    blocos.push(
      "## Favoritas do usuário (para comparação)\n" +
        favoritas
          .map(
            (f) =>
              `- [${f.numero_controle_pncp}] ${f.objeto_compra.slice(0, 120)} — ${f.municipio_nome ?? "?"}/${f.uf ?? "?"}, valor ${f.valor_total_estimado ?? "?"}, propostas até ${f.data_encerramento_proposta ?? "?"}`,
          )
          .join("\n"),
    );
  }

  return blocos.join("\n\n");
}

function respostaJson(corpo: unknown, status: number): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { ...CABECALHOS_CORS, "Content-Type": "application/json" },
  });
}
