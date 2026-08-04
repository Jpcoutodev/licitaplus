"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { criarClientNavegador } from "@/lib/supabase/client";
import { EsperaIA } from "../../painel/espera-ia";

/**
 * Prospecção: empresas que já venceram contratos públicos, para a equipe
 * abordar e oferecer o teste grátis.
 *
 * Todo acesso passa por RPC com checagem de admin no banco — a página nunca
 * lê as tabelas direto, então esconder a rota não é a única defesa.
 */

interface Lead {
  ni_fornecedor: string;
  nome_fornecedor: string;
  qtd_contratos: number;
  valor_total_acumulado: number;
  ticket_medio: number;
  data_ultimo_contrato: string | null;
  ufs: string[];
  qtd_orgaos: number;
  objeto_ultimo_contrato: string | null;
  status_prospeccao: string;
  notas: string | null;
  contato_email: string | null;
  contato_telefone: string | null;
  contato_responsavel: string | null;
  ultimo_contato_em: string | null;
  proximo_contato_em: string | null;
}

const STATUS = [
  { id: "novo", rotulo: "Novo" },
  { id: "contatado", rotulo: "Contatado" },
  { id: "respondeu", rotulo: "Respondeu" },
  { id: "testando", rotulo: "Testando" },
  { id: "cliente", rotulo: "Cliente" },
  { id: "descartado", rotulo: "Descartado" },
];

const UFS = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS",
  "MT", "PA", "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC",
  "SE", "SP", "TO",
];

const FRASES_COLETA = [
  "Consultando os contratos publicados no PNCP…",
  "Separando só as empresas (pessoa jurídica)…",
  "Filtrando pelos seus nichos de interesse…",
  "Agrupando os contratos por fornecedor…",
  "Somando valores e contando órgãos…",
  "Atualizando a lista de leads…",
];

function moeda(valor: number): string {
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

function dataBr(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("pt-BR") : "—";
}

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
  const [leads, setLeads] = useState<Lead[]>([]);
  const [resumo, setResumo] = useState<Record<string, number>>({});
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  // Filtros da listagem
  const [busca, setBusca] = useState("");
  const [uf, setUf] = useState("");
  const [status, setStatus] = useState("");
  const [dias, setDias] = useState("");
  const [valorMinimo, setValorMinimo] = useState("");
  const [soFollowup, setSoFollowup] = useState(false);

  // Coleta
  const [mostrarColeta, setMostrarColeta] = useState(false);
  const [de, setDe] = useState(hojeMenos(7));
  const [ate, setAte] = useState(hojeMenos(0));
  const [palavras, setPalavras] = useState("");
  const [ufsColeta, setUfsColeta] = useState<string[]>([]);
  const [coletando, setColetando] = useState(false);
  const [progresso, setProgresso] = useState<{ atual: number; total: number } | null>(null);

  const [expandido, setExpandido] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const supabase = criarClientNavegador();
      const [{ data: lista, error: e1 }, { data: contagem }] = await Promise.all([
        supabase.rpc("leads_listar", {
          p_busca: busca || null,
          p_uf: uf || null,
          p_status: status || null,
          p_dias: dias ? Number(dias) : null,
          p_valor_minimo: valorMinimo ? Number(valorMinimo) : null,
          p_so_followup: soFollowup,
          p_limite: 500,
        }),
        supabase.rpc("leads_resumo"),
      ]);
      if (e1) throw new Error(e1.message);
      setLeads((lista ?? []) as Lead[]);
      setResumo(
        Object.fromEntries(
          ((contagem ?? []) as Array<{ status: string; total: number }>).map(
            (l) => [l.status, l.total],
          ),
        ),
      );
    } catch (excecao) {
      setErro(
        excecao instanceof Error ? excecao.message : "não foi possível carregar",
      );
    } finally {
      setCarregando(false);
    }
  }, [busca, uf, status, dias, valorMinimo, soFollowup]);

  useEffect(() => {
    const id = setTimeout(carregar, 250); // deixa digitar antes de consultar
    return () => clearTimeout(id);
  }, [carregar]);

  /** Salva a edição comercial de um lead e reflete na lista sem recarregar. */
  async function salvar(ni: string, campos: Record<string, unknown>) {
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
    });
    if (error) {
      setErro(`Não deu para salvar: ${error.message}`);
      return;
    }
    setLeads((atual) =>
      atual.map((l) =>
        l.ni_fornecedor === ni
          ? {
            ...l,
            status_prospeccao: (campos.status as string) ?? l.status_prospeccao,
            notas: (campos.notas as string) ?? l.notas,
            contato_email: (campos.email as string) ?? l.contato_email,
            contato_telefone: (campos.telefone as string) ?? l.contato_telefone,
            contato_responsavel:
              (campos.responsavel as string) ?? l.contato_responsavel,
            proximo_contato_em:
              (campos.proximo_contato as string) ?? l.proximo_contato_em,
            ultimo_contato_em: campos.marcar_contato_hoje
              ? new Date().toISOString().slice(0, 10)
              : l.ultimo_contato_em,
          }
          : l
      )
    );
  }

  /**
   * Roda a coleta em rodadas até o PNCP acabar. O servidor devolve a próxima
   * página quando para no meio — o período de 12 meses do escopo original
   * tem ~2,2 milhões de contratos e jamais caberia numa chamada só.
   */
  async function coletar() {
    if (coletando) return;
    setColetando(true);
    setErro(null);
    setAviso(null);
    setProgresso(null);

    try {
      const supabase = criarClientNavegador();
      const termos = palavras.split(",").map((p) => p.trim()).filter(Boolean);
      let pagina = 1;
      let lidos = 0;
      let gravados = 0;

      for (let volta = 0; volta < 200; volta++) {
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
          terminou: boolean;
          proxima_pagina: number | null;
          total_paginas: number;
          contratos_lidos: number;
          contratos_gravados: number;
        };
        if (r?.erro) throw new Error(r.erro);

        lidos += r.contratos_lidos ?? 0;
        gravados += r.contratos_gravados ?? 0;
        setProgresso({
          atual: Math.min(pagina, r.total_paginas || pagina),
          total: r.total_paginas || pagina,
        });

        if (r.terminou || !r.proxima_pagina) break;
        pagina = r.proxima_pagina;
      }

      setAviso(
        `Coleta concluída: ${lidos.toLocaleString("pt-BR")} contratos lidos, ${gravados.toLocaleString("pt-BR")} dentro do filtro.`,
      );
      await carregar();
    } catch (excecao) {
      setErro(
        excecao instanceof Error
          ? `Coleta interrompida: ${excecao.message}`
          : "Coleta interrompida.",
      );
    } finally {
      setColetando(false);
      setProgresso(null);
    }
  }

  /** CSV do que está na tela — o filtro aplicado é o recorte exportado. */
  function exportarCsv() {
    const cabecalho = [
      "CNPJ", "Empresa", "Contratos", "Valor total", "Ticket médio",
      "Último contrato", "UFs", "Órgãos", "Status", "Responsável",
      "Email", "Telefone", "Último contato", "Próximo contato", "Notas",
    ];
    const escapar = (v: unknown) =>
      `"${String(v ?? "").replaceAll('"', '""')}"`;
    const linhas = leads.map((l) => [
      l.ni_fornecedor, l.nome_fornecedor, l.qtd_contratos,
      l.valor_total_acumulado, l.ticket_medio, dataBr(l.data_ultimo_contrato),
      l.ufs.join(" "), l.qtd_orgaos, l.status_prospeccao,
      l.contato_responsavel, l.contato_email, l.contato_telefone,
      l.ultimo_contato_em, l.proximo_contato_em, l.notas,
    ].map(escapar).join(","));

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

  const totalGeral = useMemo(
    () => Object.values(resumo).reduce((s, n) => s + n, 0),
    [resumo],
  );

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
            disabled={leads.length === 0}
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
          {coletando ? (
            <div style={{ marginTop: 14 }}>
              <EsperaIA
                frases={FRASES_COLETA}
                progresso={progresso}
                intervaloMs={3200}
              />
              <p className="ajuda" style={{ marginTop: 10 }}>
                O PNCP publica cerca de 6 mil contratos por dia no país inteiro
                e a rota não filtra por UF nem por texto — o recorte é feito
                aqui, depois de baixar. Por isso a busca vem em rodadas.
              </p>
            </div>
          ) : (
            <>
              <div className="leads-form">
                <label className="campo">
                  <span>De</span>
                  <input type="date" value={de} onChange={(e) => setDe(e.target.value)} />
                </label>
                <label className="campo">
                  <span>Até</span>
                  <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
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
                  {ufsColeta.length > 0 && `(${ufsColeta.length} selecionados)`}
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
              <p style={{ marginTop: 14 }}>
                <button type="button" className="botao" onClick={coletar}>
                  Buscar no PNCP
                </button>
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

      {/* Contadores por status */}
      <div className="leads-resumo">
        <button
          type="button"
          className={`leads-chip${status === "" ? " leads-chip--ativo" : ""}`}
          onClick={() => setStatus("")}
        >
          Todos <strong>{totalGeral}</strong>
        </button>
        {STATUS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`leads-chip${status === s.id ? " leads-chip--ativo" : ""}`}
            onClick={() => setStatus(status === s.id ? "" : s.id)}
          >
            {s.rotulo} <strong>{resumo[s.id] ?? 0}</strong>
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div className="cartao leads-filtros">
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por empresa, CNPJ ou objeto…"
          aria-label="Buscar"
        />
        <select value={uf} onChange={(e) => setUf(e.target.value)} aria-label="Estado">
          <option value="">Todos os estados</option>
          {UFS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={dias} onChange={(e) => setDias(e.target.value)} aria-label="Período">
          <option value="">Qualquer data</option>
          <option value="30">Contrato nos últimos 30 dias</option>
          <option value="90">Últimos 90 dias</option>
          <option value="365">Último ano</option>
        </select>
        <select
          value={valorMinimo}
          onChange={(e) => setValorMinimo(e.target.value)}
          aria-label="Valor mínimo"
        >
          <option value="">Qualquer valor</option>
          <option value="50000">Acima de R$ 50 mil</option>
          <option value="200000">Acima de R$ 200 mil</option>
          <option value="1000000">Acima de R$ 1 mi</option>
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

      {carregando ? (
        <div className="cartao">
          <p className="texto-suave sem-margem">Carregando…</p>
        </div>
      ) : leads.length === 0 ? (
        <div className="cartao">
          <p className="texto-suave sem-margem">
            Nenhum lead com esses filtros. Use &quot;Buscar leads&quot; para
            trazer contratos do PNCP.
          </p>
        </div>
      ) : (
        <div className="cartao" style={{ overflowX: "auto" }}>
          <table className="tabela-metricas leads-tabela">
            <thead>
              <tr>
                <th>Empresa</th>
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
                      expandido === l.ni_fornecedor ? null : l.ni_fornecedor,
                    )}
                  aoSalvar={salvar}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function LinhaLead({
  lead,
  aberto,
  aoAbrir,
  aoSalvar,
}: {
  lead: Lead;
  aberto: boolean;
  aoAbrir: () => void;
  aoSalvar: (ni: string, campos: Record<string, unknown>) => Promise<void>;
}) {
  const [notas, setNotas] = useState(lead.notas ?? "");
  const [email, setEmail] = useState(lead.contato_email ?? "");
  const [telefone, setTelefone] = useState(lead.contato_telefone ?? "");
  const [responsavel, setResponsavel] = useState(lead.contato_responsavel ?? "");
  const [proximo, setProximo] = useState(lead.proximo_contato_em ?? "");
  const [salvando, setSalvando] = useState(false);

  const atrasado = lead.proximo_contato_em !== null &&
    lead.proximo_contato_em <= new Date().toISOString().slice(0, 10);

  async function salvarFicha(marcarContato = false) {
    setSalvando(true);
    await aoSalvar(lead.ni_fornecedor, {
      notas,
      email,
      telefone,
      responsavel,
      proximo_contato: proximo || null,
      marcar_contato_hoje: marcarContato,
    });
    setSalvando(false);
  }

  return (
    <>
      <tr className={atrasado ? "leads-linha--atrasada" : undefined}>
        <td>
          <strong>{lead.nome_fornecedor}</strong>
          <br />
          <span className="texto-suave" style={{ fontSize: 12 }}>
            {lead.ni_fornecedor}
            {lead.qtd_orgaos > 1 && ` · ${lead.qtd_orgaos} órgãos`}
          </span>
        </td>
        <td>{lead.ufs.join(", ") || "—"}</td>
        <td>{lead.qtd_contratos}</td>
        <td style={{ whiteSpace: "nowrap" }}>
          {moeda(lead.valor_total_acumulado)}
          <br />
          <span className="texto-suave" style={{ fontSize: 12 }}>
            média {moeda(lead.ticket_medio)}
          </span>
        </td>
        <td style={{ whiteSpace: "nowrap" }}>
          {dataBr(lead.data_ultimo_contrato)}
        </td>
        <td>
          <select
            value={lead.status_prospeccao}
            onChange={(e) =>
              aoSalvar(lead.ni_fornecedor, { status: e.target.value })}
            className={`leads-status leads-status--${lead.status_prospeccao}`}
            aria-label={`Status de ${lead.nome_fornecedor}`}
          >
            {STATUS.map((s) => (
              <option key={s.id} value={s.id}>{s.rotulo}</option>
            ))}
          </select>
        </td>
        <td>
          <button type="button" className="botao-mini" onClick={aoAbrir}>
            {aberto ? "Fechar" : "Abrir"}
          </button>
        </td>
      </tr>

      {aberto && (
        <tr>
          <td colSpan={7} className="leads-ficha">
            {lead.objeto_ultimo_contrato && (
              <p className="texto-suave" style={{ marginBottom: 12 }}>
                <strong>Último objeto:</strong> {lead.objeto_ultimo_contrato}
              </p>
            )}
            <div className="leads-form">
              <label className="campo">
                <span>Responsável</span>
                <input
                  value={responsavel}
                  onChange={(e) => setResponsavel(e.target.value)}
                  placeholder="Quem atende"
                />
              </label>
              <label className="campo">
                <span>Email</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <label className="campo">
                <span>Telefone</span>
                <input
                  value={telefone}
                  onChange={(e) => setTelefone(e.target.value)}
                />
              </label>
              <label className="campo">
                <span>Próximo contato</span>
                <input
                  type="date"
                  value={proximo}
                  onChange={(e) => setProximo(e.target.value)}
                />
              </label>
            </div>
            <label className="campo">
              <span>Notas</span>
              <textarea
                rows={3}
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="O que foi conversado, objeções, próximo passo…"
              />
            </label>
            <p style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                className="botao"
                disabled={salvando}
                onClick={() => salvarFicha(false)}
              >
                {salvando ? "Salvando…" : "Salvar"}
              </button>
              <button
                type="button"
                className="botao botao-secundario"
                disabled={salvando}
                onClick={() => salvarFicha(true)}
              >
                Salvar e marcar contato de hoje
              </button>
              <a
                className="botao botao-secundario"
                href={`https://cnpj.biz/${lead.ni_fornecedor}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Consultar CNPJ ↗
              </a>
            </p>
            <p className="ajuda">
              Último contato: {dataBr(lead.ultimo_contato_em)}
            </p>
          </td>
        </tr>
      )}
    </>
  );
}
