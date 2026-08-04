/**
 * Extração de texto de PDF (editais, termos de referência) para servir de
 * contexto à análise com IA. Usa unpdf (build serverless do pdf.js).
 */

import { extractText, getDocumentProxy } from "npm:unpdf@1.6.2";

/**
 * Teto da extração (não do que vai à IA): documentos maiores que isso têm o
 * final descartado. O quanto vai à IA por pergunta é decidido pela função de
 * análise (documento inteiro ou trechos recuperados).
 */
export const MAX_CARACTERES_DOCUMENTO = 1_500_000;

export interface TextoExtraido {
  texto: string;
  caracteres_totais: number;
  paginas: number;
  truncado: boolean;
}

export async function extrairTextoPdf(base64: string): Promise<TextoExtraido> {
  return await extrairTextoPdfBytes(
    Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)),
  );
}

export async function extrairTextoPdfBytes(
  binario: Uint8Array,
): Promise<TextoExtraido> {
  const pdf = await getDocumentProxy(binario);
  const { text, totalPages } = await extractText(pdf, { mergePages: true });

  const texto = text.replace(/[ \t]+/g, " ").trim();
  return {
    texto: texto.slice(0, MAX_CARACTERES_DOCUMENTO),
    caracteres_totais: texto.length,
    paginas: totalPages,
    truncado: texto.length > MAX_CARACTERES_DOCUMENTO,
  };
}

/**
 * Orçamento de processamento por chamada, em ms.
 *
 * As Edge Functions do Supabase cortam a requisição em 2s de CPU — limite
 * igual em todos os planos. Extrair texto é CPU pura (um edital de 228
 * páginas custa ~11s), então um PDF grande mata o worker antes de qualquer
 * resposta ou log. Aqui paramos por conta própria bem antes disso e
 * devolvemos onde paramos, para o cliente continuar na chamada seguinte.
 *
 * 900ms é conservador de propósito: o teto só é conferido DEPOIS de cada
 * página, então a conta real é 170ms (abrir) + orçamento + o custo da última
 * página, que numa página densa passa de 300ms. Com 900 sobra folga; com
 * 1.200 uma medição real chegou a 1.578ms, perto demais do corte.
 */
export const ORCAMENTO_EXTRACAO_MS = 900;

export interface FaixaExtraida {
  texto: string;
  /** Primeira página ainda não lida; null quando o documento acabou. */
  proximaPagina: number | null;
  paginasLidas: number;
  totalPaginas: number;
}

/**
 * Extrai o texto a partir de `paginaInicial` até o orçamento acabar.
 *
 * Mede tempo de parede, não CPU: como o laço não espera rede nem disco, os
 * dois praticamente coincidem aqui. Sempre lê ao menos uma página, senão um
 * PDF com página patológica travaria o avanço para sempre.
 */
export async function extrairTextoPdfFaixa(
  binario: Uint8Array,
  paginaInicial: number,
  orcamentoMs: number = ORCAMENTO_EXTRACAO_MS,
): Promise<FaixaExtraida> {
  const pdf = await getDocumentProxy(binario);
  const totalPaginas = pdf.numPages;
  const inicio = Math.max(1, paginaInicial);

  if (inicio > totalPaginas) {
    return { texto: "", proximaPagina: null, paginasLidas: 0, totalPaginas };
  }

  const comeco = Date.now();
  const partes: string[] = [];
  let pagina = inicio;
  let piorPagina = 0;

  while (pagina <= totalPaginas) {
    const antes = Date.now();
    const p = await pdf.getPage(pagina);
    const conteudo = await p.getTextContent();
    const texto = (conteudo.items as Array<{ str?: string }>)
      .map((item) => item.str ?? "")
      .join(" ");
    partes.push(texto);
    pagina++;

    piorPagina = Math.max(piorPagina, Date.now() - antes);
    const decorrido = Date.now() - comeco;
    if (decorrido >= orcamentoMs) break;
    // Não começa uma página que, pelo custo já observado, provavelmente
    // estouraria o orçamento. Sem isso, uma página densa iniciada faltando
    // pouco para o teto empurra a requisição para perto do corte de 2s.
    if (decorrido + piorPagina > orcamentoMs) break;
  }

  return {
    texto: partes.join("\n").replace(/[ \t]+/g, " "),
    proximaPagina: pagina > totalPaginas ? null : pagina,
    paginasLidas: pagina - inicio,
    totalPaginas,
  };
}
