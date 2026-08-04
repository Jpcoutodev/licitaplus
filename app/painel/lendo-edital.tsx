"use client";

import { useEffect, useState } from "react";

/**
 * Acompanhamento da leitura do edital.
 *
 * Editais de centenas de páginas levam dezenas de segundos e chegam em várias
 * etapas. Sem nada na tela a espera parece travamento, então mostramos o
 * progresso real (páginas lidas) e vamos trocando a frase para deixar claro
 * que o sistema está trabalhando — nunca uma frase que invente etapa que não
 * está acontecendo.
 */

const FRASES_BAIXANDO = [
  "Buscando o edital no portal do governo…",
  "Baixando o documento oficial…",
];

const FRASES_LENDO = [
  "Virando as páginas do edital…",
  "Lendo as exigências de habilitação…",
  "Procurando prazos e datas importantes…",
  "Garimpando os valores e as condições…",
  "Separando o que interessa ao seu negócio…",
  "Anotando as obrigações da contratada…",
  "Conferindo os anexos técnicos…",
];

const FRASES_FINALIZANDO = [
  "Organizando tudo o que foi lido…",
  "Montando o índice para a IA consultar…",
  "Quase lá — preparando a conversa…",
];

export interface ProgressoLeitura {
  /** null enquanto o PDF ainda não foi aberto (fase de download). */
  totalPaginas: number | null;
  paginasLidas: number;
  finalizando: boolean;
}

export function LendoEdital({ progresso }: { progresso: ProgressoLeitura }) {
  const { totalPaginas, paginasLidas, finalizando } = progresso;

  const lista = finalizando
    ? FRASES_FINALIZANDO
    : totalPaginas === null
      ? FRASES_BAIXANDO
      : FRASES_LENDO;

  const [indice, setIndice] = useState(0);

  // Troca a frase a cada 2,8s. A lista entra na dependência para reiniciar
  // a contagem quando a fase muda.
  useEffect(() => {
    setIndice(0);
    const id = setInterval(
      () => setIndice((i) => (i + 1) % lista.length),
      2800,
    );
    return () => clearInterval(id);
  }, [lista]);

  const pct = finalizando
    ? 100
    : totalPaginas && totalPaginas > 0
      ? Math.min(99, Math.round((paginasLidas / totalPaginas) * 100))
      : null;

  return (
    <div className="lendo-edital" role="status" aria-live="polite">
      <div className="lendo-edital-topo">
        <span className="lendo-edital-icone" aria-hidden>
          <span className="lendo-folha" />
          <span className="lendo-folha" />
          <span className="lendo-folha" />
        </span>
        <div className="lendo-edital-texto">
          <strong key={`${lista.length}-${indice}`} className="lendo-frase">
            {lista[indice]}
          </strong>
          <span className="texto-suave">
            {totalPaginas
              ? `${Math.min(paginasLidas, totalPaginas)} de ${totalPaginas} páginas`
              : "Isso pode levar alguns segundos"}
          </span>
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
