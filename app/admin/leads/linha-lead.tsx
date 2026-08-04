"use client";

import { useEffect, useState } from "react";

export interface Lead {
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
  favorito: boolean;
  porte: string | null;
  situacao_cadastral: string | null;
  data_abertura: string | null;
  cnae: string | null;
  municipio: string | null;
  enriquecido_em: string | null;
}

export const STATUS = [
  { id: "novo", rotulo: "Novo" },
  { id: "contatado", rotulo: "Contatado" },
  { id: "respondeu", rotulo: "Respondeu" },
  { id: "testando", rotulo: "Testando" },
  { id: "cliente", rotulo: "Cliente" },
  { id: "descartado", rotulo: "Descartado" },
];

const PORTE_CURTO: Record<string, string> = {
  "MICRO EMPRESA": "ME",
  "EMPRESA DE PEQUENO PORTE": "EPP",
  "DEMAIS": "Demais",
};

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

/** Anos desde a abertura — empresa nova é quem mais precisa de ajuda. */
function idadeEmpresa(abertura: string | null): string | null {
  if (!abertura) return null;
  const anos = (Date.now() - new Date(abertura).getTime()) /
    (365.25 * 24 * 3600 * 1000);
  if (anos < 1) return "menos de 1 ano";
  return `${Math.floor(anos)} ano${Math.floor(anos) === 1 ? "" : "s"}`;
}

export function LinhaLead({
  lead,
  aberto,
  aoAbrir,
  aoSalvar,
  aoBuscarContato,
}: {
  lead: Lead;
  aberto: boolean;
  aoAbrir: () => void;
  aoSalvar: (ni: string, campos: Record<string, unknown>) => Promise<void>;
  aoBuscarContato: (ni: string) => Promise<void>;
}) {
  const [notas, setNotas] = useState(lead.notas ?? "");
  const [email, setEmail] = useState(lead.contato_email ?? "");
  const [telefone, setTelefone] = useState(lead.contato_telefone ?? "");
  const [responsavel, setResponsavel] = useState(lead.contato_responsavel ?? "");
  const [proximo, setProximo] = useState(lead.proximo_contato_em ?? "");
  const [salvando, setSalvando] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [erroBusca, setErroBusca] = useState<string | null>(null);

  // A consulta ao CNPJ preenche contato no registro; traz para o formulário
  // aberto. Depende dos valores em si, não do objeto, para não sobrescrever o
  // que está sendo digitado a cada re-render do pai.
  useEffect(() => {
    if (lead.contato_email) setEmail(lead.contato_email);
  }, [lead.contato_email]);
  useEffect(() => {
    if (lead.contato_telefone) setTelefone(lead.contato_telefone);
  }, [lead.contato_telefone]);

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

  async function buscar() {
    setBuscando(true);
    setErroBusca(null);
    try {
      await aoBuscarContato(lead.ni_fornecedor);
    } catch (excecao) {
      setErroBusca(
        excecao instanceof Error ? excecao.message : "não foi possível buscar",
      );
    } finally {
      setBuscando(false);
    }
  }

  const idade = idadeEmpresa(lead.data_abertura);

  return (
    <>
      <tr className={atrasado ? "leads-linha--atrasada" : undefined}>
        <td>
          <button
            type="button"
            className={`leads-estrela${lead.favorito ? " leads-estrela--ativa" : ""}`}
            onClick={() =>
              aoSalvar(lead.ni_fornecedor, { favorito: !lead.favorito })}
            aria-label={lead.favorito ? "Remover dos favoritos" : "Favoritar"}
            title={lead.favorito ? "Remover dos favoritos" : "Favoritar"}
          >
            {lead.favorito ? "★" : "☆"}
          </button>
        </td>
        <td>
          <strong>{lead.nome_fornecedor}</strong>
          <br />
          <span className="texto-suave" style={{ fontSize: 12 }}>
            {lead.ni_fornecedor}
            {lead.qtd_orgaos > 1 && ` · ${lead.qtd_orgaos} órgãos`}
          </span>
        </td>
        <td style={{ whiteSpace: "nowrap" }}>
          {lead.porte
            ? (
              <>
                <span className={`leads-porte leads-porte--${PORTE_CURTO[lead.porte] ?? "x"}`}>
                  {PORTE_CURTO[lead.porte] ?? lead.porte}
                </span>
                {idade && (
                  <>
                    <br />
                    <span className="texto-suave" style={{ fontSize: 12 }}>
                      {idade}
                    </span>
                  </>
                )}
              </>
            )
            : <span className="texto-suave">—</span>}
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
          <td colSpan={9} className="leads-ficha">
            {lead.objeto_ultimo_contrato && (
              <p className="texto-suave" style={{ marginBottom: 12 }}>
                <strong>Último objeto:</strong> {lead.objeto_ultimo_contrato}
              </p>
            )}

            {(lead.cnae || lead.situacao_cadastral || lead.municipio) && (
              <p className="texto-suave" style={{ marginBottom: 12, fontSize: 13 }}>
                {lead.cnae && <>{lead.cnae}</>}
                {lead.municipio && <> · {lead.municipio}</>}
                {lead.situacao_cadastral && <> · {lead.situacao_cadastral}</>}
                {lead.data_abertura && <> · aberta em {dataBr(lead.data_abertura)}</>}
              </p>
            )}

            <p style={{ marginBottom: 12 }}>
              <button
                type="button"
                className="botao botao-secundario"
                disabled={buscando}
                onClick={buscar}
              >
                {buscando
                  ? "Consultando a Receita…"
                  : lead.enriquecido_em
                  ? "Atualizar dados da Receita"
                  : "🔍 Buscar contato (CNPJ)"}
              </button>
              {lead.enriquecido_em && (
                <span className="texto-suave" style={{ marginLeft: 10, fontSize: 12 }}>
                  consultado em {dataBr(lead.enriquecido_em)}
                </span>
              )}
            </p>
            {erroBusca && <p className="mensagem-erro">{erroBusca}</p>}

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
