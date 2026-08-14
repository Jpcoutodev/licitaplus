"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { criarClientNavegador } from "@/lib/supabase/client";
import { AnalisarBotao } from "../analisar-botao";
import { formatarValor, linkPaginaPncp } from "../licitacao-cartao";
import {
  DIAS_SEMANA,
  MESES,
  dataHoraDoPrazo,
  diaDoPrazo,
  diaPorExtenso,
  gradeDoMes,
  hojeEmBrasilia,
} from "./datas";

export interface LicitacaoParticipando {
  id: string;
  numero_controle_pncp: string;
  objeto_compra: string;
  valor_total_estimado: number | null;
  data_abertura_proposta: string | null;
  data_encerramento_proposta: string | null;
  orgao_razao_social: string | null;
  municipio_nome: string | null;
  uf: string | null;
  modalidade_nome: string | null;
  link_sistema_origem: string | null;
}

export interface ItemParticipacao {
  id: string;
  status: string;
  /** O chat de IA trabalha sobre favoritas; o botão favorita antes de abrir. */
  favorita: boolean;
  licitacao: LicitacaoParticipando;
}

/** Rótulos e ordem do status — o desfecho que a empresa anota à mão. */
const STATUS: Array<{ valor: string; rotulo: string }> = [
  { valor: "acompanhando", rotulo: "Acompanhando" },
  { valor: "proposta_enviada", rotulo: "Proposta enviada" },
  { valor: "ganhei", rotulo: "Ganhei" },
  { valor: "perdi", rotulo: "Perdi" },
  { valor: "desisti", rotulo: "Desisti" },
];

const ROTULO_STATUS = new Map(STATUS.map((s) => [s.valor, s.rotulo]));

export function PainelLicitando({ itens }: { itens: ItemParticipacao[] }) {
  const roteador = useRouter();
  const hoje = hojeEmBrasilia();
  const [ano, mes] = hoje.split("-").map(Number);

  const [visivel, setVisivel] = useState({ ano, mes: mes - 1 });
  const [diaSelecionado, setDiaSelecionado] = useState<string | null>(null);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [completando, setCompletando] = useState(false);
  /** Licitações já tentadas nesta sessão — não insiste no que o PNCP não tem. */
  const tentadas = useRef<Set<string>>(new Set());

  /**
   * Licitação achada pela busca textual vem sem as datas de proposta (e às
   * vezes sem valor). Numa lista de oportunidades é detalhe; aqui é o dado
   * principal, então ao abrir a aba buscamos a ficha oficial no PNCP.
   *
   * Em lotes de oito e uma vez por licitação por sessão: se o PNCP também não
   * informa os prazos, não adianta bater de novo a cada visita.
   */
  useEffect(() => {
    const faltando = itens
      .filter(
        (i) =>
          !i.licitacao.data_abertura_proposta ||
          !i.licitacao.data_encerramento_proposta,
      )
      .filter((i) => !tentadas.current.has(i.licitacao.id))
      .slice(0, 8);
    if (faltando.length === 0) return;

    let ativo = true;
    async function completar() {
      setCompletando(true);
      const supabase = criarClientNavegador();
      for (const i of faltando) tentadas.current.add(i.licitacao.id);

      const resultados = await Promise.all(
        faltando.map(async (i) => {
          try {
            const { data } = await supabase.functions.invoke(
              "completar-licitacao",
              { body: { licitacao_id: i.licitacao.id } },
            );
            return Boolean((data as { atualizado?: boolean })?.atualizado);
          } catch {
            return false;
          }
        }),
      );

      if (!ativo) return;
      setCompletando(false);
      // Só recarrega se algo mudou de fato (evita laço de refresh).
      if (resultados.some(Boolean)) roteador.refresh();
    }
    void completar();

    return () => {
      ativo = false;
    };
  }, [itens, roteador]);

  /** Índice dia -> participações que abrem / encerram naquele dia. */
  const porDia = useMemo(() => {
    const aberturas = new Map<string, ItemParticipacao[]>();
    const encerramentos = new Map<string, ItemParticipacao[]>();
    for (const item of itens) {
      const abre = diaDoPrazo(item.licitacao.data_abertura_proposta);
      const encerra = diaDoPrazo(item.licitacao.data_encerramento_proposta);
      if (abre) aberturas.set(abre, [...(aberturas.get(abre) ?? []), item]);
      if (encerra) {
        encerramentos.set(encerra, [...(encerramentos.get(encerra) ?? []), item]);
      }
    }
    return { aberturas, encerramentos };
  }, [itens]);

  const semanas = useMemo(
    () => gradeDoMes(visivel.ano, visivel.mes),
    [visivel],
  );

  /** Lista de baixo: o dia escolhido, ou tudo ordenado pelo prazo mais curto. */
  const lista = useMemo(() => {
    if (diaSelecionado) {
      const doDia = [
        ...(porDia.aberturas.get(diaSelecionado) ?? []),
        ...(porDia.encerramentos.get(diaSelecionado) ?? []),
      ];
      // Uma licitação que abre e encerra no mesmo dia apareceria duas vezes.
      return [...new Map(doDia.map((i) => [i.id, i])).values()];
    }
    return [...itens].sort((a, b) => {
      const fa = a.licitacao.data_encerramento_proposta;
      const fb = b.licitacao.data_encerramento_proposta;
      if (!fa && !fb) return 0;
      if (!fa) return 1;
      if (!fb) return -1;
      return fa.localeCompare(fb);
    });
  }, [diaSelecionado, itens, porDia]);

  function mudarMes(passo: number) {
    setVisivel((atual) => {
      const d = new Date(atual.ano, atual.mes + passo, 1);
      return { ano: d.getFullYear(), mes: d.getMonth() };
    });
  }

  async function mudarStatus(participacaoId: string, status: string) {
    setSalvando(participacaoId);
    setErro(null);
    const supabase = criarClientNavegador();
    const { error } = await supabase
      .from("participacoes")
      .update({ status })
      .eq("id", participacaoId);
    setSalvando(null);
    if (error) {
      setErro("Não foi possível salvar o status. Tente de novo.");
      return;
    }
    roteador.refresh();
  }

  async function remover(participacaoId: string) {
    setSalvando(participacaoId);
    setErro(null);
    const supabase = criarClientNavegador();
    const { error } = await supabase
      .from("participacoes")
      .delete()
      .eq("id", participacaoId);
    setSalvando(null);
    if (error) {
      setErro("Não foi possível remover. Tente de novo.");
      return;
    }
    roteador.refresh();
  }

  return (
    <>
      {/* ---------- calendário ---------- */}
      <div className="cartao calendario">
        <div className="calendario-topo">
          <button
            type="button"
            className="botao-mes"
            onClick={() => mudarMes(-1)}
            aria-label="Mês anterior"
          >
            ‹
          </button>
          <strong>
            {MESES[visivel.mes]} {visivel.ano}
          </strong>
          <button
            type="button"
            className="botao-mes"
            onClick={() => mudarMes(1)}
            aria-label="Mês seguinte"
          >
            ›
          </button>
        </div>

        <div className="calendario-grade">
          {DIAS_SEMANA.map((dia, i) => (
            <span key={`${dia}-${i}`} className="calendario-cabecalho">
              {dia}
            </span>
          ))}

          {semanas.flat().map((celula) => {
            const abre = porDia.aberturas.has(celula.chave);
            const encerra = porDia.encerramentos.has(celula.chave);
            const marcado = abre || encerra;
            const classes = [
              "calendario-dia",
              celula.doMes ? "" : "calendario-fora",
              celula.chave === hoje ? "calendario-hoje" : "",
              celula.chave === diaSelecionado ? "calendario-escolhido" : "",
              marcado ? "calendario-marcado" : "",
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <button
                key={celula.chave}
                type="button"
                className={classes}
                disabled={!marcado}
                onClick={() =>
                  setDiaSelecionado(
                    diaSelecionado === celula.chave ? null : celula.chave,
                  )}
                title={
                  marcado
                    ? [
                      abre ? "Abre recebimento de propostas" : null,
                      encerra ? "Encerra recebimento de propostas" : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")
                    : undefined
                }
              >
                <span>{celula.dia}</span>
                <span className="calendario-pontos">
                  {abre && <i className="ponto ponto-abertura" />}
                  {encerra && <i className="ponto ponto-encerramento" />}
                </span>
              </button>
            );
          })}
        </div>

        <div className="calendario-legenda">
          <span>
            <i className="ponto ponto-abertura" /> Início do recebimento de
            propostas
          </span>
          <span>
            <i className="ponto ponto-encerramento" /> Fim do recebimento de
            propostas
          </span>
        </div>
      </div>

      {/* ---------- lista ---------- */}
      {erro && <p className="mensagem-erro">{erro}</p>}

      <div className="cabecalho-lista-licitando">
        <h2>
          {diaSelecionado
            ? `${lista.length} ${lista.length === 1 ? "licitação" : "licitações"} em ${diaPorExtenso(diaSelecionado)}`
            : `${itens.length} ${itens.length === 1 ? "licitação" : "licitações"} em andamento`}
        </h2>
        {diaSelecionado && (
          <button
            type="button"
            className="botao botao-secundario botao-mini"
            onClick={() => setDiaSelecionado(null)}
          >
            Ver todas
          </button>
        )}
      </div>

      {itens.length === 0 && (
        <div className="cartao">
          <p className="texto-suave">
            Você ainda não marcou nenhuma licitação. No{" "}
            <Link href="/painel">painel</Link> (ou nos{" "}
            <Link href="/painel/favoritos">favoritos</Link>), clique em{" "}
            <strong>Participar</strong> na licitação que sua empresa vai
            disputar — ela aparece aqui com os prazos no calendário.
          </p>
        </div>
      )}

      {lista.map((item) => {
        const l = item.licitacao;
        const linkPncp = linkPaginaPncp(l.numero_controle_pncp);
        const linkOrigem = l.link_sistema_origem?.startsWith("http") &&
            !l.link_sistema_origem.includes("pncp.gov.br")
          ? l.link_sistema_origem
          : null;

        return (
          <div key={item.id} className="cartao item-licitacao">
            <h3>{l.objeto_compra}</h3>

            <p className="detalhes">
              <span className={`etiqueta status-${item.status}`}>
                {ROTULO_STATUS.get(item.status) ?? item.status}
              </span>
              <span className="etiqueta">{l.modalidade_nome ?? "—"}</span>
              <span className="etiqueta">
                {l.municipio_nome ?? "?"}/{l.uf ?? "?"}
              </span>
            </p>

            <div className="prazos">
              <p className="prazo prazo-abertura">
                <i className="ponto ponto-abertura" />
                <span>
                  <strong>Início do recebimento de propostas:</strong>{" "}
                  {l.data_abertura_proposta
                    ? `${dataHoraDoPrazo(l.data_abertura_proposta)} (horário de Brasília)`
                    : completando
                    ? "buscando no PNCP..."
                    : "não informada"}
                </span>
              </p>
              <p className="prazo prazo-encerramento">
                <i className="ponto ponto-encerramento" />
                <span>
                  <strong>Fim do recebimento de propostas:</strong>{" "}
                  {l.data_encerramento_proposta
                    ? `${dataHoraDoPrazo(l.data_encerramento_proposta)} (horário de Brasília)`
                    : completando
                    ? "buscando no PNCP..."
                    : "não informada"}
                </span>
              </p>
              {!completando &&
                !l.data_abertura_proposta &&
                !l.data_encerramento_proposta && (
                <p className="ajuda">
                  O PNCP não publicou os prazos desta licitação — confira no
                  edital, pelo link abaixo.
                </p>
              )}
            </div>

            <p className="detalhes" style={{ marginTop: 10 }}>
              <strong>Valor estimado:</strong>{" "}
              {formatarValor(l.valor_total_estimado)} · <strong>Órgão:</strong>{" "}
              {l.orgao_razao_social ?? "não informado"}
            </p>

            <div className="acoes-licitando">
              <label className="campo-status">
                <span className="texto-suave">Status</span>
                <select
                  value={item.status}
                  disabled={salvando === item.id}
                  onChange={(e) => void mudarStatus(item.id, e.target.value)}
                >
                  {STATUS.map((s) => (
                    <option key={s.valor} value={s.valor}>
                      {s.rotulo}
                    </option>
                  ))}
                </select>
              </label>

              {linkPncp && (
                <a href={linkPncp} target="_blank" rel="noreferrer">
                  Ver no PNCP ↗
                </a>
              )}
              {linkOrigem && (
                <a href={linkOrigem} target="_blank" rel="noreferrer">
                  Ver no sistema de origem ↗
                </a>
              )}
              <AnalisarBotao licitacaoId={l.id} jaFavorita={item.favorita} />
              <button
                type="button"
                className="botao-remover-participacao"
                disabled={salvando === item.id}
                onClick={() => void remover(item.id)}
                title="Tirar da lista de Licitando"
              >
                Remover
              </button>
            </div>
          </div>
        );
      })}

      {itens.length > 0 && lista.length === 0 && (
        <div className="cartao">
          <p className="texto-suave">
            Nenhuma licitação sua tem prazo neste dia.
          </p>
        </div>
      )}
    </>
  );
}
