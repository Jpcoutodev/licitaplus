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
