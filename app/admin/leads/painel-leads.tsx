"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { criarClientNavegador } from "@/lib/supabase/client";
import { EsperaIA } from "../../painel/espera-ia";
import { Dashboard, type DadosDashboard } from "./dashboard";
import { LinhaLead, type Lead, STATUS } from "./linha-lead";

/**
 * Prospecção: empresas que já venceram contratos públicos, para a equipe
 * abordar e oferecer o teste grátis.
 *
 * Todo acesso passa por RPC com checagem de admin no banco — a página nunca
 * lê as tabelas direto, então esconder a rota não é a única defesa.
 */

const UFS = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS",
  "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC",
  "SE", "SP", "TO",
];

const PORTES = [
  { id: "MICRO EMPRESA", rotulo: "Microempresa" },
  { id: "EMPRESA DE PEQUENO PORTE", rotulo: "Pequeno porte" },
  { id: "DEMAIS", rotulo: "Demais" },
];

const FRASES_COLETA = [
  "Consultando os contratos publicados no PNCP…",
  "Separando só as empresas (pessoa jurídica)…",
  "Filtrando pelos seus nichos de interesse…",
  "Agrupando os contratos por fornecedor…",
  "Somando valores e contando órgãos…",
  "Atualizando a lista de leads…",
];

type Aba = "leads" | "dashboard" | "favoritos";

/** AAAAMMDD, formato que a rota de contratos do PNCP exige. */
function paraPncp(iso: string): string {
  return iso.replaceAll("-", "");
}

function hojeMenos(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d.toISOString().slice(0, 10);
}

export function PainelLeads() {
  const [aba, setAba] = useState<Aba>("leads");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [dash, setDash] = useState<DadosDashboard | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  // Filtros
  const [busca, setBusca] = useState("");
  const [uf, setUf] = useState("");
  const [status, setStatus] = useState("");
  const [dias, setDias] = useState("");
  const [valorMinimo, setValorMinimo] = useState("");
  const [valorMaximo, setValorMaximo] = useState("");
  const [porte, setPorte] = useState("");
  const [soFollowup, setSoFollowup] = useState(false);

  // Coleta
  const [mostrarColeta, setMostrarColeta] = useState(false);
  const [de, setDe] = useState(hojeMenos(7));
  const [ate, setAte] = useState(hojeMenos(0));
  const [palavras, setPalavras] = useState("");
  const [ufsColeta, setUfsColeta] = useState<string[]>([]);
  const [coletando, setColetando] = useState(false);
  const [progresso, setProgresso] = useState<
    { atual: number; total: number } | null
  >(null);
  /** Sinal de parada: lido dentro do laço, que termina a rodada em andamento
   *  antes de sair — abortar no meio deixaria contratos pela metade. */
  const pararRef = useRef(false);
  /** Página onde a última rodada parou, quando o PNCP falhou no meio. */
  const [retomarDe, setRetomarDe] = useState<number | null>(null);

  const [expandido, setExpandido] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const supabase = criarClientNavegador();
      if (aba === "dashboard") {
        const { data, error } = await supabase.rpc("leads_dashboard");
        if (error) throw new Error(error.message);
        setDash(data as DadosDashboard);
        return;
      }
      const { data, error } = await supabase.rpc("leads_listar", {
        p_busca: busca || null,
        p_uf: uf || null,
        p_status: status || null,
        p_dias: dias ? Number(dias) : null,
        p_valor_minimo: valorMinimo ? Number(valorMinimo) : null,
        p_valor_maximo: valorMaximo ? Number(valorMaximo) : null,
        p_porte: porte || null,
        p_so_followup: soFollowup,
        p_so_favoritos: aba === "favoritos",
        p_limite: 500,
      });
      if (error) throw new Error(error.message);
      setLeads((data ?? []) as Lead[]);
    } catch (excecao) {
      setErro(
        excecao instanceof Error ? excecao.message : "não foi possível carregar",
      );
    } finally {
      setCarregando(false);
    }
  }, [
    aba, busca, uf, status, dias, valorMinimo, valorMaximo, porte, soFollowup,
  ]);

  useEffect(() => {
    const id = setTimeout(carregar, 250); // deixa digitar antes de consultar
    return () => clearTimeout(id);
  }, [carregar]);

  /** Salva a edição comercial e reflete na lista sem recarregar tudo. */
  const salvar = useCallback(
    async (ni: string, campos: Record<string, unknown>) => {
      const supabase = criarClientNavegador();
      const { error } = await supabase.rpc("leads_atualizar", {
        p_ni: ni,
        p_status: campos.status ?? null,
        p_notas: campos.notas ?? null,
        p_email: campos.email ?? null,
        p_telefone: campos.telefone ?? null,
        p_responsavel: campos.responsavel ?? null,
        p_proximo_contato: campos.proximo_contato ?? null,
        p_marcar_contato_hoje: campos.marcar_contato_hoje ?? false,
        p_favorito: campos.favorito ?? null,
      });
      if (error) {
        setErro(`Não deu para salvar: ${error.message}`);
        return;
      }
      // Desfavoritar dentro da aba Favoritos tira a linha da lista.
      if (aba === "favoritos" && campos.favorito === false) {
        setLeads((atual) => atual.filter((l) => l.ni_fornecedor !== ni));
        return;
      }
      setLeads((atual) =>
        atual.map((l) =>
          l.ni_fornecedor === ni
            ? {
              ...l,
              status_prospeccao: (campos.status as string) ??
                l.status_prospeccao,
              notas: (campos.notas as string) ?? l.notas,
              contato_email: (campos.email as string) ?? l.contato_email,
              contato_telefone: (campos.telefone as string) ??
                l.contato_telefone,
              contato_responsavel: (campos.responsavel as string) ??
                l.contato_responsavel,
              proximo_contato_em: (campos.proximo_contato as string) ??
                l.proximo_contato_em,
              favorito: typeof campos.favorito === "boolean"
                ? campos.favorito
                : l.favorito,
              ultimo_contato_em: campos.marcar_contato_hoje
                ? new Date().toISOString().slice(0, 10)
                : l.ultimo_contato_em,
            }
            : l
        )
      );
    },
    [aba],
  );

  /**
   * Busca os dados da empresa no cadastro público de CNPJ da Receita Federal
   * (via BrasilAPI) e preenche o que estiver faltando.
   *
   * Não é varredura da internet: é o registro que a própria empresa declarou
   * à Receita — telefone, email, porte, CNAE e data de abertura. Mais
   * confiável que raspar site, e sem a zona cinzenta de coletar contato de
   * terceiros por aí. O que a equipe já tiver anotado nunca é sobrescrito.
   */
  const buscarContato = useCallback(async (ni: string) => {
    const resposta = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${ni}`);
    if (!resposta.ok) {
      throw new Error(
        resposta.status === 404
          ? "CNPJ não encontrado no cadastro da Receita"
          : `cadastro da Receita indisponível (HTTP ${resposta.status})`,
      );
    }
    const d = await resposta.json() as {
      email?: string | null;
      ddd_telefone_1?: string | null;
      porte?: string | null;
      descricao_situacao_cadastral?: string | null;
      data_inicio_atividade?: string | null;
      capital_social?: number | null;
      cnae_fiscal_descricao?: string | null;
      municipio?: string | null;
    };

    const supabase = criarClientNavegador();
    const { error } = await supabase.rpc("leads_enriquecer", {
      p_ni: ni,
      p_email: d.email || null,
      p_telefone: d.ddd_telefone_1 || null,
      p_porte: d.porte || null,
      p_situacao: d.descricao_situacao_cadastral || null,
      p_abertura: d.data_inicio_atividade || null,
      p_capital: d.capital_social ?? null,
      p_cnae: d.cnae_fiscal_descricao || null,
      p_municipio: d.municipio || null,
    });
    if (error) throw new Error(error.message);

    setLeads((atual) =>
      atual.map((l) =>
        l.ni_fornecedor === ni
          ? {
            ...l,
            contato_email: l.contato_email || d.email || null,
            contato_telefone: l.contato_telefone || d.ddd_telefone_1 || null,
            porte: d.porte ?? l.porte,
            situacao_cadastral: d.descricao_situacao_cadastral ??
              l.situacao_cadastral,
            data_abertura: d.data_inicio_atividade ?? l.data_abertura,
            cnae: d.cnae_fiscal_descricao ?? l.cnae,
            municipio: d.municipio ?? l.municipio,
            enriquecido_em: new Date().toISOString(),
          }
          : l
      )
    );
  }, []);

  /**
   * Roda a coleta em rodadas até o PNCP acabar, você mandar parar, ou a API
   * do PNCP cair — o que acontece com alguma frequência. Nos três casos o que
   * já foi lido fica salvo e dá para continuar da página onde parou.
   */
  async function coletar(daPagina = 1) {
    if (coletando) return;
    pararRef.current = false;
    setRetomarDe(null);
    setColetando(true);
    setErro(null);
    setAviso(null);
    setProgresso(null);

    let lidos = 0;
    let gravados = 0;
    let parou = false;

    try {
      const supabase = criarClientNavegador();
      const termos = palavras.split(",").map((p) => p.trim()).filter(Boolean);
      let pagina = daPagina;

      for (let volta = 0; volta < 400; volta++) {
        const { data, error } = await supabase.functions.invoke(
          "coletar-leads",
          {
            body: {
              data_inicial: paraPncp(de),
              data_final: paraPncp(ate),
              palavras_chave: termos,
              ufs: ufsColeta,
              pagina,
            },
          },
        );
        if (error) throw new Error(error.message);
        const r = data as {
          erro?: string;
          aviso?: string | null;
          pncp_indisponivel?: boolean;
          terminou: boolean;
          proxima_pagina: number | null;
          total_paginas: number;
          contratos_lidos: number;
          contratos_gravados: number;
        };
        if (r?.erro) throw new Error(r.erro);

        // PNCP fora do ar: guarda o ponto de retomada em vez de perder tudo.
        if (r.pncp_indisponivel) {
          lidos += r.contratos_lidos ?? 0;
          gravados += r.contratos_gravados ?? 0;
          setRetomarDe(r.proxima_pagina ?? pagina);
          setErro(r.aviso ?? "O PNCP não respondeu.");
          parou = true;
          break;
        }

        lidos += r.contratos_lidos ?? 0;
        gravados += r.contratos_gravados ?? 0;
        setProgresso({
          atual: Math.min(pagina, r.total_paginas || pagina),
          total: r.total_paginas || pagina,
        });

        if (r.terminou || !r.proxima_pagina) break;
        // Só sai entre rodadas: o que já foi baixado está gravado.
        if (pararRef.current) {
          parou = true;
          break;
        }
        pagina = r.proxima_pagina;
      }

      setAviso(
        `${parou ? "Busca interrompida" : "Busca concluída"}: ${lidos.toLocaleString("pt-BR")} contratos lidos, ${gravados.toLocaleString("pt-BR")} dentro do filtro.${parou ? " O que já foi lido está salvo." : ""}`,
      );
      await carregar();
    } catch (excecao) {
      setErro(
        excecao instanceof Error
          ? `Busca interrompida: ${excecao.message}`
          : "Busca interrompida.",
      );
    } finally {
      setColetando(false);
      setProgresso(null);
      pararRef.current = false;
    }
  }

  /** CSV do que está na tela — o filtro aplicado é o recorte exportado. */
  function exportarCsv() {
    const cabecalho = [
      "CNPJ", "Empresa", "Porte", "Abertura", "Contratos", "Valor total",
      "Ticket médio", "Último contrato", "UFs", "Órgãos", "Status",
      "Responsável", "Email", "Telefone", "Último contato",
      "Próximo contato", "Notas",
    ];
    const escapar = (v: unknown) =>
      `"${String(v ?? "").replaceAll('"', '""')}"`;
    const linhas = leads.map((l) =>
      [
        l.ni_fornecedor, l.nome_fornecedor, l.porte, l.data_abertura,
        l.qtd_contratos, l.valor_total_acumulado, l.ticket_medio,
        l.data_ultimo_contrato, l.ufs.join(" "), l.qtd_orgaos,
        l.status_prospeccao, l.contato_responsavel, l.contato_email,
        l.contato_telefone, l.ultimo_contato_em, l.proximo_contato_em, l.notas,
      ].map(escapar).join(",")
    );

    // BOM para o Excel abrir acentuação corretamente.
    const csv = "﻿" + [cabecalho.join(","), ...linhas].join("\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="cabecalho-pagina">
        <div>
          <h1>Leads</h1>
          <p className="texto-suave sem-margem">
            Empresas que já venceram contratos públicos — candidatas ao teste
            grátis. Ferramenta interna; nada aqui aparece para o cliente.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            className="botao botao-secundario"
            onClick={exportarCsv}
            disabled={leads.length === 0 || aba === "dashboard"}
          >
            Exportar CSV
          </button>
          <button
            type="button"
            className="botao"
            onClick={() => setMostrarColeta((v) => !v)}
          >
            {mostrarColeta ? "Fechar busca" : "Buscar leads"}
          </button>
        </div>
      </div>

      {erro && <p className="mensagem-erro">{erro}</p>}
      {aviso && <p className="mensagem-sucesso">{aviso}</p>}

      {/* Coleta no PNCP */}
      {mostrarColeta && (
        <div className="cartao">
          <h3>Buscar contratos no PNCP</h3>
          {coletando
            ? (
              <div style={{ marginTop: 14 }}>
                <EsperaIA
                  frases={FRASES_COLETA}
                  progresso={progresso}
                  intervaloMs={3200}
                />
                <p style={{ marginTop: 12 }}>
                  <button
                    type="button"
                    className="botao botao-perigo"
                    onClick={() => {
                      pararRef.current = true;
                      setAviso("Parando ao fim da rodada atual…");
                    }}
                  >
                    Parar busca
                  </button>
                </p>
                <p className="ajuda">
                  A parada acontece ao fim da rodada em andamento — assim
                  nenhum lote fica gravado pela metade. Tudo o que já foi lido
                  permanece salvo.
                </p>
              </div>
            )
            : (
              <>
                <div className="leads-form">
                  <label className="campo">
                    <span>De</span>
                    <input
                      type="date"
                      value={de}
                      onChange={(e) => setDe(e.target.value)}
                    />
                  </label>
                  <label className="campo">
                    <span>Até</span>
                    <input
                      type="date"
                      value={ate}
                      onChange={(e) => setAte(e.target.value)}
                    />
                  </label>
                  <label className="campo leads-form-largo">
                    <span>Palavras-chave (separadas por vírgula)</span>
                    <input
                      type="text"
                      value={palavras}
                      onChange={(e) => setPalavras(e.target.value)}
                      placeholder="software, sistema, licenciamento, TI"
                    />
                  </label>
                </div>
                <details className="leads-ufs">
                  <summary>
                    Limitar a estados{" "}
                    {ufsColeta.length > 0 &&
                      `(${ufsColeta.length} selecionados)`}
                  </summary>
                  <div className="leads-ufs-grade">
                    {UFS.map((sigla) => (
                      <label key={sigla}>
                        <input
                          type="checkbox"
                          checked={ufsColeta.includes(sigla)}
                          onChange={(e) =>
                            setUfsColeta((atual) =>
                              e.target.checked
                                ? [...atual, sigla]
                                : atual.filter((u) => u !== sigla)
                            )}
                        />
                        {sigla}
                      </label>
                    ))}
                  </div>
                </details>
                <p style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    className="botao"
                    onClick={() => coletar(1)}
                  >
                    Buscar no PNCP
                  </button>
                  {retomarDe !== null && (
                    <button
                      type="button"
                      className="botao botao-secundario"
                      onClick={() => coletar(retomarDe)}
                    >
                      Continuar da página {retomarDe}
                    </button>
                  )}
                </p>
                <p className="ajuda">
                  Sem palavra-chave, traz todos os contratos do período — muita
                  coisa. Comece com uma janela curta e os termos do seu nicho.
                  Rodar de novo o mesmo período não duplica nada.
                </p>
              </>
            )}
        </div>
      )}

      {/* Abas */}
      <div className="leads-abas">
        {([
          ["leads", "Leads"],
          ["favoritos", "★ Favoritos"],
          ["dashboard", "Dashboard"],
        ] as Array<[Aba, string]>).map(([id, rotulo]) => (
          <button
            key={id}
            type="button"
            className={`leads-aba${aba === id ? " leads-aba--ativa" : ""}`}
            onClick={() => setAba(id)}
          >
            {rotulo}
          </button>
        ))}
      </div>

      {aba === "dashboard"
        ? (
          carregando
            ? <div className="cartao"><p className="texto-suave sem-margem">Carregando…</p></div>
            : <Dashboard dados={dash} />
        )
        : (
          <>
            <div className="cartao leads-filtros">
              <input
                type="search"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por empresa, CNPJ ou objeto…"
                aria-label="Buscar"
              />
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                aria-label="Status"
              >
                <option value="">Todos os status</option>
                {STATUS.map((s) => (
                  <option key={s.id} value={s.id}>{s.rotulo}</option>
                ))}
              </select>
              <select
                value={uf}
                onChange={(e) => setUf(e.target.value)}
                aria-label="Estado"
              >
                <option value="">Todos os estados</option>
                {UFS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <select
                value={porte}
                onChange={(e) => setPorte(e.target.value)}
                aria-label="Porte"
              >
                <option value="">Qualquer porte</option>
                {PORTES.map((p) => (
                  <option key={p.id} value={p.id}>{p.rotulo}</option>
                ))}
              </select>
              <select
                value={dias}
                onChange={(e) => setDias(e.target.value)}
                aria-label="Período"
              >
                <option value="">Qualquer data</option>
                <option value="30">Últimos 30 dias</option>
                <option value="90">Últimos 90 dias</option>
                <option value="365">Último ano</option>
              </select>
              <select
                value={valorMinimo}
                onChange={(e) => setValorMinimo(e.target.value)}
                aria-label="Valor mínimo"
              >
                <option value="">Sem mínimo</option>
                <option value="50000">A partir de R$ 50 mil</option>
                <option value="200000">A partir de R$ 200 mil</option>
                <option value="1000000">A partir de R$ 1 mi</option>
              </select>
              <select
                value={valorMaximo}
                onChange={(e) => setValorMaximo(e.target.value)}
                aria-label="Valor máximo"
              >
                <option value="">Sem máximo</option>
                <option value="50000">Até R$ 50 mil</option>
                <option value="150000">Até R$ 150 mil</option>
                <option value="500000">Até R$ 500 mil</option>
              </select>
              <label className="leads-check">
                <input
                  type="checkbox"
                  checked={soFollowup}
                  onChange={(e) => setSoFollowup(e.target.checked)}
                />
                Retorno vencido
              </label>
            </div>

            {carregando
              ? (
                <div className="cartao">
                  <p className="texto-suave sem-margem">Carregando…</p>
                </div>
              )
              : leads.length === 0
              ? (
                <div className="cartao">
                  <p className="texto-suave sem-margem">
                    {aba === "favoritos"
                      ? "Nenhum favorito ainda. Use a estrela na lista para marcar quem vale trabalhar agora."
                      : "Nenhum lead com esses filtros. Use \"Buscar leads\" para trazer contratos do PNCP."}
                  </p>
                </div>
              )
              : (
                <div className="cartao" style={{ overflowX: "auto" }}>
                  <p className="texto-suave" style={{ marginBottom: 10, fontSize: 13 }}>
                    {leads.length} empresa{leads.length === 1 ? "" : "s"}
                    {leads.length === 500 && " (limite da consulta — refine os filtros)"}
                  </p>
                  <table className="tabela-metricas leads-tabela">
                    <thead>
                      <tr>
                        <th></th>
                        <th>Empresa</th>
                        <th>Porte</th>
                        <th>UFs</th>
                        <th>Contratos</th>
                        <th>Valor total</th>
                        <th>Último</th>
                        <th>Status</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {leads.map((l) => (
                        <LinhaLead
                          key={l.ni_fornecedor}
                          lead={l}
                          aberto={expandido === l.ni_fornecedor}
                          aoAbrir={() =>
                            setExpandido(
                              expandido === l.ni_fornecedor
                                ? null
                                : l.ni_fornecedor,
                            )}
                          aoSalvar={salvar}
                          aoBuscarContato={buscarContato}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
          </>
        )}
    </>
  );
}
