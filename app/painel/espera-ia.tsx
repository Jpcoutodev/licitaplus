"use client";

import { useEffect, useState } from "react";

/**
 * Espera com companhia: o que o sistema está fazendo enquanto o usuário
 * aguarda.
 *
 * Duas regras de honestidade guiam este componente:
 *
 * 1. Barra determinada só quando existe contagem real (páginas lidas de um
 *    total conhecido). Sem isso a barra é indeterminada — ela indica
 *    atividade, não uma porcentagem que ninguém mediu.
 * 2. Frases em lista ordenada avançam e PARAM na última (`ciclico: false`),
 *    porque descrevem um pipeline que não anda para trás. Só a leitura de
 *    páginas, que de fato se repete, roda em ciclo.
 */

/** Leitura das páginas do PDF — repetitiva de verdade, então cicla. */
export const FRASES_LENDO = [
  "Virando as páginas do edital…",
  "Lendo as exigências de habilitação…",
  "Procurando prazos e datas importantes…",
  "Garimpando os valores e as condições…",
  "Separando o que interessa ao seu negócio…",
  "Anotando as obrigações da contratada…",
  "Conferindo os anexos técnicos…",
];

const FRASES_BAIXANDO = [
  "Buscando o edital no portal do governo…",
  "Baixando o documento oficial…",
];

const FRASES_FINALIZANDO = [
  "Organizando tudo o que foi lido…",
  "Montando o índice para a IA consultar…",
  "Quase lá — preparando a conversa…",
];

/** Espelha a sequência real do resumo executivo no servidor. */
export const FRASES_RESUMO = [
  "Recuperando o edital do contexto…",
  "Buscando os dados oficiais no PNCP…",
  "Lendo o edital parte por parte…",
  "Cruzando com os itens da contratação…",
  "Reunindo exigências, prazos e penalidades…",
  "Escrevendo o resumo executivo…",
];

/** Espelha a sequência real de uma pergunta no chat. */
export const FRASES_PENSANDO = [
  "Lendo sua pergunta…",
  "Procurando os trechos que respondem…",
  "Conferindo o que o edital diz…",
  "Formulando a resposta…",
];

export function EsperaIA({
  frases,
  progresso = null,
  ciclico = false,
  compacto = false,
  intervaloMs = 3000,
}: {
  frases: string[];
  /** Contagem real; null deixa a barra indeterminada. */
  progresso?: { atual: number; total: number } | null;
  ciclico?: boolean;
  compacto?: boolean;
  intervaloMs?: number;
}) {
  const [indice, setIndice] = useState(0);

  useEffect(() => {
    setIndice(0);
    const id = setInterval(() => {
      setIndice((i) => {
        if (i + 1 >= frases.length) return ciclico ? 0 : i;
        return i + 1;
      });
    }, intervaloMs);
    return () => clearInterval(id);
  }, [frases, ciclico, intervaloMs]);

  const pct = progresso && progresso.total > 0
    ? Math.min(99, Math.round((progresso.atual / progresso.total) * 100))
    : null;

  return (
    <div
      className={`lendo-edital${compacto ? " lendo-edital--compacto" : ""}`}
      role="status"
      aria-live="polite"
    >
      <div className="lendo-edital-topo">
        <span className="lendo-edital-icone" aria-hidden>
          <span className="lendo-folha" />
          <span className="lendo-folha" />
          <span className="lendo-folha" />
        </span>
        <div className="lendo-edital-texto">
          <strong key={indice} className="lendo-frase">{frases[indice]}</strong>
          {progresso
            ? (
              <span className="texto-suave">
                {Math.min(progresso.atual, progresso.total)} de{" "}
                {progresso.total} páginas
              </span>
            )
            : !compacto && (
              <span className="texto-suave">
                Isso pode levar alguns segundos
              </span>
            )}
        </div>
      </div>

      <div className="lendo-barra">
        <span
          className={pct === null ? "lendo-barra-indef" : "lendo-barra-fill"}
          style={pct === null ? undefined : { width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export interface ProgressoLeitura {
  /** null enquanto o PDF ainda não foi aberto (fase de download). */
  totalPaginas: number | null;
  paginasLidas: number;
  finalizando: boolean;
}

/** Leitura do edital do PNCP, com as três fases e o progresso real. */
export function LendoEdital({ progresso }: { progresso: ProgressoLeitura }) {
  const { totalPaginas, paginasLidas, finalizando } = progresso;

  if (finalizando) {
    return <EsperaIA frases={FRASES_FINALIZANDO} intervaloMs={2800} />;
  }
  if (totalPaginas === null) {
    return <EsperaIA frases={FRASES_BAIXANDO} intervaloMs={2800} />;
  }
  return (
    <EsperaIA
      frases={FRASES_LENDO}
      progresso={{ atual: paginasLidas, total: totalPaginas }}
      ciclico
      intervaloMs={2800}
    />
  );
}
