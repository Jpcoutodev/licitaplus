import Link from "next/link";
import { redirect } from "next/navigation";
import { criarClientServidor } from "@/lib/supabase/server";
import {
  LicitacaoCartao,
  type LicitacaoCartaoDados,
} from "./licitacao-cartao";

interface LinhaPainel {
  id: string;
  created_at: string;
  notificado_em: string | null;
  licitacao_id: string;
  numero_controle_pncp: string;
  objeto_compra: string;
  valor_total_estimado: number | null;
  data_encerramento_proposta: string | null;
  orgao_razao_social: string | null;
  municipio_nome: string | null;
  uf: string | null;
  modalidade_nome: string | null;
  link_sistema_origem: string | null;
}

const PAGINA_TAMANHO = 50;
const MAX_PAGINAS = 7;

const COLUNAS = `id, created_at, notificado_em, licitacao_id,
  numero_controle_pncp, objeto_compra, valor_total_estimado,
  data_encerramento_proposta, orgao_razao_social, municipio_nome, uf,
  modalidade_nome, link_sistema_origem`;

/** Converte uma linha achatada da view no formato que o cartão espera. */
function paraCartao(l: LinhaPainel): LicitacaoCartaoDados {
  return {
    id: l.licitacao_id,
    numero_controle_pncp: l.numero_controle_pncp,
    objeto_compra: l.objeto_compra,
    valor_total_estimado: l.valor_total_estimado,
    data_encerramento_proposta: l.data_encerramento_proposta,
    orgao_razao_social: l.orgao_razao_social,
    municipio_nome: l.municipio_nome,
    uf: l.uf,
    modalidade_nome: l.modalidade_nome,
    link_sistema_origem: l.link_sistema_origem,
  };
}

export default async function PaginaPainel({
  searchParams,
}: {
  searchParams: Promise<{
    ocultas?: string;
    pagina?: string;
    q?: string;
    abertas?: string;
    ordem?: string;
  }>;
}) {
  const supabase = await criarClientServidor();
  const sp = await searchParams;

  const verOcultas = sp?.ocultas === "1";
  const q = (sp?.q ?? "").trim().slice(0, 80);
  const soAbertas = sp?.abertas === "1";
  const ordem = sp?.ordem === "encerra" ? "encerra" : "recentes";
  const paginaPedida = Math.max(
    1,
    Math.min(MAX_PAGINAS, Number.parseInt(sp?.pagina ?? "1", 10) || 1),
  );
  const temFiltro = Boolean(q) || soAbertas || ordem !== "recentes";

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const from = (paginaPedida - 1) * PAGINA_TAMANHO;
  const to = from + PAGINA_TAMANHO - 1;

  // Monta a consulta na view achatada, conforme a visão (ocultas x filtrado).
  function consultaMatches() {
    let c = supabase
      .from("painel_matches")
      .select(COLUNAS, { count: "exact" })
      .eq("oculto", verOcultas);

    if (verOcultas) {
      return c.order("created_at", { ascending: false }).range(
        0,
        PAGINA_TAMANHO - 1,
      );
    }
    if (q) {
      const termo = q.replace(/[%\\]/g, "");
      if (termo) c = c.ilike("objeto_compra", `%${termo}%`);
    }
    if (soAbertas) {
      c = c.or(
        `data_encerramento_proposta.gte.${new Date().toISOString()},data_encerramento_proposta.is.null`,
      );
    }
    c = ordem === "encerra"
      ? c.order("data_encerramento_proposta", {
        ascending: true,
        nullsFirst: false,
      })
      : c.order("created_at", { ascending: false });
    return c.range(from, to);
  }

  const [
    { data: perfis },
    { data: matches, error, count },
    { data: favoritos },
    { count: qtdOcultas },
  ] = await Promise.all([
    supabase.from("perfis").select("id, ativo").limit(1),
    consultaMatches(),
    supabase.from("favoritos").select("id, licitacao_id"),
    supabase
      .from("matches")
      .select("id", { count: "exact", head: true })
      .eq("oculto", true),
  ]);

  const lista = (matches ?? []) as unknown as LinhaPainel[];
  const temPerfil = (perfis ?? []).length > 0;
  const totalOcultas = qtdOcultas ?? 0;
  const total = count ?? 0;
  const totalPaginas = Math.min(
    MAX_PAGINAS,
    Math.max(1, Math.ceil(total / PAGINA_TAMANHO)),
  );
  const paginaAtual = Math.min(paginaPedida, totalPaginas);
  const excedeuTeto = total > MAX_PAGINAS * PAGINA_TAMANHO;
  const favoritoPorLicitacao = new Map(
    (favoritos ?? []).map((f) => [f.licitacao_id as string, f.id as string]),
  );

  /** Monta o link de uma página preservando busca/filtro/ordem. */
  function urlPagina(p: number): string {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (soAbertas) params.set("abertas", "1");
    if (ordem !== "recentes") params.set("ordem", ordem);
    if (p > 1) params.set("pagina", String(p));
    const s = params.toString();
    return s ? `/painel?${s}` : "/painel";
  }

  return (
    <>
      <div className="cabecalho-pagina">
        <div>
          <h1>{verOcultas ? "Licitações ocultas" : "Suas oportunidades"}</h1>
          <p className="texto-suave sem-margem">
            {verOcultas
              ? "Licitações que você ocultou. Reexiba para voltar ao painel."
              : "Licitações do PNCP compatíveis com o seu perfil de busca."}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {verOcultas ? (
            <Link href="/painel" className="botao botao-secundario">
              ← Voltar ao painel
            </Link>
          ) : (
            <>
              {totalOcultas > 0 && (
                <Link
                  href="/painel?ocultas=1"
                  className="botao botao-secundario"
                >
                  Ver ocultas ({totalOcultas})
                </Link>
              )}
              <Link href="/painel/perfil" className="botao botao-secundario">
                {temPerfil ? "Editar perfil" : "Criar perfil"}
              </Link>
            </>
          )}
        </div>
      </div>

      {error && (
        <p className="mensagem-erro">
          Não foi possível carregar seus matches: {error.message}
        </p>
      )}

      {/* Busca + filtros (só no painel normal, com perfil criado) */}
      {!verOcultas && temPerfil && (
        <form className="filtros-painel" action="/painel" method="get">
          <input
            type="text"
            name="q"
            defaultValue={q}
            placeholder="Buscar no objeto da licitação..."
            aria-label="Buscar"
          />
          <select name="ordem" defaultValue={ordem} aria-label="Ordenar">
            <option value="recentes">Últimas encontradas</option>
            <option value="encerra">Encerra primeiro</option>
          </select>
          <label className="filtro-check">
            <input
              type="checkbox"
              name="abertas"
              value="1"
              defaultChecked={soAbertas}
            />
            Só abertas
          </label>
          <button type="submit" className="botao botao-secundario">
            Filtrar
          </button>
          {temFiltro && (
            <Link href="/painel" className="link-ocultar">
              Limpar
            </Link>
          )}
        </form>
      )}

      {verOcultas && lista.length === 0 && (
        <div className="cartao">
          <p className="texto-suave sem-margem">Nenhuma licitação oculta.</p>
        </div>
      )}

      {!verOcultas && !temPerfil && (
        <div className="cartao">
          <h3>Comece criando o seu perfil de busca</h3>
          <p className="texto-suave">
            Informe suas palavras-chave, estados e modalidades — assim que o
            perfil for salvo, buscamos as licitações abertas compatíveis.
          </p>
          <p style={{ marginTop: 14 }}>
            <Link href="/painel/perfil" className="botao">
              Criar perfil
            </Link>
          </p>
        </div>
      )}

      {!verOcultas && temPerfil && total === 0 && (
        <div className="cartao">
          <p className="texto-suave sem-margem">
            {temFiltro
              ? "Nenhuma licitação encontrada para esta busca/filtro. Tente termos mais amplos ou limpe os filtros."
              : "Nenhum match por enquanto. A busca roda automaticamente ao longo do dia — você recebe um email assim que algo compatível aparecer."}
          </p>
        </div>
      )}

      {!verOcultas && total > 0 && (
        <p className="texto-suave resumo-lista">
          {total} licitação(ões){temFiltro ? " no filtro atual" : ""}
          {excedeuTeto &&
            ` — mostrando as primeiras ${MAX_PAGINAS * PAGINA_TAMANHO}; refine com a busca para ver o resto`}
          .
        </p>
      )}

      {!verOcultas && total > 0 && lista.length === 0 && (
        <div className="cartao">
          <p className="texto-suave sem-margem">
            Nada nesta página. <Link href={urlPagina(1)}>Voltar à página 1</Link>.
          </p>
        </div>
      )}

      {lista.map((match) => (
        <LicitacaoCartao
          key={match.id}
          licitacao={paraCartao(match)}
          favoritoId={favoritoPorLicitacao.get(match.licitacao_id) ?? null}
          nova={match.notificado_em === null}
          mostrarAnalise
          matchId={match.id}
          reexibir={verOcultas}
        />
      ))}

      {!verOcultas && totalPaginas > 1 && (
        <nav className="paginacao" aria-label="Paginação">
          {paginaAtual > 1 ? (
            <Link href={urlPagina(paginaAtual - 1)}>‹ Anterior</Link>
          ) : (
            <span className="pag-inativo">‹ Anterior</span>
          )}
          {Array.from({ length: totalPaginas }, (_, i) => i + 1).map((p) =>
            p === paginaAtual ? (
              <span key={p} className="pag-atual">
                {p}
              </span>
            ) : (
              <Link key={p} href={urlPagina(p)}>
                {p}
              </Link>
            )
          )}
          {paginaAtual < totalPaginas ? (
            <Link href={urlPagina(paginaAtual + 1)}>Próxima ›</Link>
          ) : (
            <span className="pag-inativo">Próxima ›</span>
          )}
        </nav>
      )}
    </>
  );
}
