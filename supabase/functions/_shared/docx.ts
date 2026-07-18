/**
 * Extração de texto de arquivos .docx (Word moderno = ZIP de XML). Editais
 * no PNCP às vezes vêm em .docx em vez de PDF. O .doc antigo (binário OLE)
 * não é suportado.
 */

import { unzipSync } from "npm:fflate@0.8.2";

/** Detecta a assinatura ZIP ("PK\x03\x04"), comum a .docx/.xlsx/.zip. */
export function pareceZip(bytes: Uint8Array): boolean {
  return bytes[0] === 0x50 && bytes[1] === 0x4b &&
    bytes[2] === 0x03 && bytes[3] === 0x04;
}

/**
 * Extrai o texto de um .docx. Lança se o ZIP não for um documento Word
 * (ex.: .xlsx, ou um zip de PDFs) — o chamador traduz para mensagem ao usuário.
 */
export function extrairTextoDocx(bytes: Uint8Array): string {
  const zip = unzipSync(bytes);
  const documento = zip["word/document.xml"];
  if (!documento) {
    throw new Error("nao_docx");
  }

  let xml = new TextDecoder().decode(documento);
  // Preserva a estrutura antes de remover as tags.
  xml = xml
    .replace(/<w:tab\b[^>]*\/>/g, "\t")
    .replace(/<w:br\b[^>]*\/>/g, "\n")
    .replace(/<\/w:p>/g, "\n")
    .replace(/<[^>]+>/g, "");
  // Decodifica entidades XML.
  xml = xml
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");

  return xml.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}
