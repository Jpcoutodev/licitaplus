/**
 * Gera um .docx (WordprocessingML) a partir do markdown do resumo executivo.
 * Sem dependência nova: monta o XML e zipa com fflate (já usada no projeto).
 * Cobre o subconjunto de markdown que o resumo produz: títulos (#, ##),
 * tabelas GFM, listas (- / *), linhas ✅ e negrito (**...**).
 */

import { strToU8, zipSync } from "fflate";

type Bloco =
  | { tipo: "h1" | "h2" | "p" | "li"; texto: string }
  | { tipo: "tabela"; linhas: string[][] };

function escXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Quebra texto inline em pedaços marcando o que é negrito (**...**). */
function parseInline(s: string): Array<{ text: string; bold: boolean }> {
  const partes: Array<{ text: string; bold: boolean }> = [];
  const re = /\*\*(.+?)\*\*/g;
  let ultimo = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > ultimo) {
      partes.push({ text: s.slice(ultimo, m.index), bold: false });
    }
    partes.push({ text: m[1], bold: true });
    ultimo = re.lastIndex;
  }
  if (ultimo < s.length) partes.push({ text: s.slice(ultimo), bold: false });
  return partes
    .map((p) => ({ text: p.text.replace(/`/g, ""), bold: p.bold }))
    .filter((p) => p.text.length > 0);
}

function runsXml(
  texto: string,
  opts: { bold?: boolean; sz?: number; color?: string } = {},
): string {
  return parseInline(texto)
    .map((p) => {
      const b = opts.bold || p.bold ? "<w:b/>" : "";
      const sz = opts.sz ? `<w:sz w:val="${opts.sz}"/>` : "";
      const color = opts.color ? `<w:color w:val="${opts.color}"/>` : "";
      const rpr = b || sz || color ? `<w:rPr>${b}${sz}${color}</w:rPr>` : "";
      return `<w:r>${rpr}<w:t xml:space="preserve">${escXml(p.text)}</w:t></w:r>`;
    })
    .join("");
}

function paraXml(
  runs: string,
  opts: { antes?: number; depois?: number; indent?: number } = {},
): string {
  const spacing =
    `<w:spacing w:before="${opts.antes ?? 0}" w:after="${opts.depois ?? 120}"/>`;
  const ind = opts.indent ? `<w:ind w:left="${opts.indent}"/>` : "";
  return `<w:p><w:pPr>${spacing}${ind}</w:pPr>${runs}</w:p>`;
}

function celulas(linha: string): string[] {
  return linha
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());
}

function tabelaXml(linhas: string[][]): string {
  const cor = "D9D9D9";
  const lado = (n: string) =>
    `<w:${n} w:val="single" w:sz="4" w:space="0" w:color="${cor}"/>`;
  const bordas = `<w:tblBorders>${lado("top")}${lado("left")}${lado("bottom")}${
    lado("right")
  }${lado("insideH")}${lado("insideV")}</w:tblBorders>`;
  const tblPr = `<w:tblPr><w:tblW w:w="0" w:type="auto"/>${bordas}</w:tblPr>`;

  const linhasXml = linhas
    .map((cels, idx) => {
      const cab = idx === 0;
      const tcs = cels
        .map((cel) => {
          const shd = cab
            ? `<w:shd w:val="clear" w:color="auto" w:fill="EFF6FF"/>`
            : "";
          const runs = runsXml(cel, {
            bold: cab,
            sz: 22,
            color: cab ? "1D4ED8" : undefined,
          });
          return `<w:tc><w:tcPr>${shd}</w:tcPr><w:p><w:pPr><w:spacing w:before="20" w:after="20"/></w:pPr>${runs}</w:p></w:tc>`;
        })
        .join("");
      return `<w:tr>${tcs}</w:tr>`;
    })
    .join("");
  return `<w:tbl>${tblPr}${linhasXml}</w:tbl>`;
}

function parseMarkdown(md: string): Bloco[] {
  const linhas = md.replace(/\r/g, "").split("\n");
  const blocos: Bloco[] = [];

  for (let i = 0; i < linhas.length; i++) {
    const t = linhas[i].trim();
    if (!t) continue;

    // Tabela GFM: linha com | seguida de uma linha separadora (|---|).
    const proxima = (linhas[i + 1] ?? "").trim();
    const ehSeparadora = /^\|?[\s:|-]+\|?$/.test(proxima) &&
      proxima.includes("-");
    if (t.startsWith("|") && ehSeparadora) {
      const tab: string[][] = [celulas(t)];
      i++; // pula a separadora
      while ((linhas[i + 1] ?? "").trim().startsWith("|")) {
        i++;
        tab.push(celulas(linhas[i].trim()));
      }
      blocos.push({ tipo: "tabela", linhas: tab });
      continue;
    }

    if (t.startsWith("### ")) {
      blocos.push({ tipo: "h2", texto: t.slice(4).trim() });
    } else if (t.startsWith("## ")) {
      blocos.push({ tipo: "h2", texto: t.slice(3).trim() });
    } else if (t.startsWith("# ")) {
      blocos.push({ tipo: "h1", texto: t.slice(2).trim() });
    } else if (/^[-*]\s+/.test(t)) {
      blocos.push({ tipo: "li", texto: t.replace(/^[-*]\s+/, "") });
    } else if (/^✅/.test(t)) {
      blocos.push({ tipo: "li", texto: t });
    } else {
      blocos.push({ tipo: "p", texto: t });
    }
  }
  return blocos;
}

function documentoXml(blocos: Bloco[]): string {
  const corpo = blocos
    .map((b) => {
      switch (b.tipo) {
        case "h1":
          return paraXml(runsXml(b.texto, { bold: true, sz: 32, color: "1D4ED8" }), {
            antes: 200,
            depois: 120,
          });
        case "h2":
          return paraXml(runsXml(b.texto, { bold: true, sz: 26, color: "1D4ED8" }), {
            antes: 200,
            depois: 80,
          });
        case "li": {
          // Linha de "ponto de atenção" (✅): troca o emoji colorido — que o
          // LibreOffice/Word antigo renderizam em preto — por um ✔ de texto
          // colorido de verde via formatação (verde em qualquer editor).
          if (b.texto.startsWith("✅")) {
            const resto = b.texto.replace(/^✅️?\s*/, "");
            const check =
              `<w:r><w:rPr><w:b/><w:color w:val="16A34A"/><w:sz w:val="22"/></w:rPr>` +
              `<w:t xml:space="preserve">✔︎ </w:t></w:r>`;
            return paraXml(check + runsXml(resto, { sz: 22 }), {
              indent: 360,
              depois: 60,
            });
          }
          return paraXml(runsXml("• " + b.texto, { sz: 22 }), {
            indent: 360,
            depois: 60,
          });
        }
        case "p":
          return paraXml(runsXml(b.texto, { sz: 22 }), { depois: 120 });
        case "tabela":
          return tabelaXml(b.linhas);
      }
    })
    .join("");

  const sect =
    `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${corpo}${sect}</w:body></w:document>`;
}

const CONTENT_TYPES =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;

const RELS =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;

/** Converte o markdown do resumo executivo num arquivo .docx (bytes). */
export function gerarDocxDoMarkdown(md: string): Uint8Array {
  const blocos = parseMarkdown(md);
  return zipSync(
    {
      "[Content_Types].xml": strToU8(CONTENT_TYPES),
      "_rels/.rels": strToU8(RELS),
      "word/document.xml": strToU8(documentoXml(blocos)),
    },
    { level: 6 },
  );
}
