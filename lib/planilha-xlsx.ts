/**
 * Gera a planilha de materiais (.xlsx) para cotação, no formato que a
 * consultoria usa: bloco de cabeçalho com os dados do certame e, abaixo, uma
 * linha por item do edital.
 *
 * Sem dependência nova: monta o SpreadsheetML e zipa com fflate, do mesmo jeito
 * que resumo-docx.ts faz para o Word.
 *
 * As duas últimas colunas são de trabalho: quem cota digita o preço final e o
 * total sai por fórmula do próprio Excel (quantidade × preço final), então a
 * planilha continua calculando depois de baixada.
 */

import { strToU8, zipSync } from "fflate";

export interface ItemPlanilha {
  numero: number | null;
  descricao: string | null;
  quantidade: number | null;
  unidade: string | null;
  valor_unitario: number | null;
  valor_total: number | null;
}

export interface CabecalhoPlanilha {
  data_certame: string | null;
  data_limite: string | null;
  orgao: string | null;
  local_entrega: string | null;
  prazo_entrega: string | null;
  forma_entrega: string | null;
  registro_preco: string | null;
  forma_pagamento: string | null;
  amostra_catalogo: string | null;
}

export interface DadosPlanilha {
  empresa: string | null;
  email: string | null;
  objeto: string | null;
  numeroControlePncp: string | null;
  municipio: string | null;
  uf: string | null;
  modalidade: string | null;
  cabecalho: CabecalhoPlanilha;
  itens: ItemPlanilha[];
}

function escXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Coluna 1 -> "A", 27 -> "AA". */
function letraColuna(n: number): string {
  let s = "";
  let x = n;
  while (x > 0) {
    const resto = (x - 1) % 26;
    s = String.fromCharCode(65 + resto) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}

/** Índices dos estilos declarados em cellXfs, na ordem de ESTILOS. */
const ESTILO = {
  normal: 0,
  titulo: 1,
  /** Rótulo do cabeçalho, em azul (dado que vem do PNCP). */
  rotuloPncp: 2,
  /** Rótulo do cabeçalho, em vermelho (dado que vem do edital). */
  rotuloEdital: 3,
  valorCabecalho: 4,
  cabecalhoTabela: 5,
  celula: 6,
  moeda: 7,
  inteiro: 8,
  marca: 9,
  moedaTotal: 10,
  celulaTotal: 11,
} as const;

type Valor =
  | { tipo: "texto"; v: string; estilo?: number }
  | { tipo: "numero"; v: number; estilo?: number }
  | { tipo: "formula"; f: string; estilo?: number }
  | { tipo: "vazio"; estilo?: number };

function celulaXml(ref: string, valor: Valor): string {
  const s = valor.estilo ? ` s="${valor.estilo}"` : "";
  switch (valor.tipo) {
    case "texto":
      return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${
        escXml(valor.v)
      }</t></is></c>`;
    case "numero":
      return `<c r="${ref}"${s}><v>${valor.v}</v></c>`;
    case "formula":
      return `<c r="${ref}"${s}><f>${escXml(valor.f)}</f></c>`;
    case "vazio":
      return `<c r="${ref}"${s}/>`;
  }
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

const WORKBOOK = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Planilha de materiais" sheetId="1" r:id="rId1"/></sheets></workbook>`;

const WORKBOOK_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`;

/**
 * Estilos. numFmtId 164 = moeda em reais; a ordem dos <xf> em cellXfs é o que
 * o índice de ESTILO referencia.
 */
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;R$&quot;\\ #,##0.00"/></numFmts>
<fonts count="7">
<font><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="14"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FF1D4ED8"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FFB91C1C"/><name val="Calibri"/></font>
<font><b/><sz val="10"/><name val="Calibri"/></font>
<font><sz val="10"/><name val="Calibri"/></font>
<font><i/><sz val="10"/><color rgb="FF6B7280"/><name val="Calibri"/></font>
</fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEFF6FF"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FFBFBFBF"/></left><right style="thin"><color rgb="FFBFBFBF"/></right><top style="thin"><color rgb="FFBFBFBF"/></top><bottom style="thin"><color rgb="FFBFBFBF"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="12">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="4" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="5" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="164" fontId="5" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>
<xf numFmtId="0" fontId="5" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="top"/></xf>
<xf numFmtId="0" fontId="6" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="164" fontId="4" fillId="2" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="4" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
</cellXfs>
</styleSheet>`;

/** Rótulos do bloco de cabeçalho, na ordem e na cor do modelo da consultoria. */
const ROTULOS: Array<{
  campo: keyof CabecalhoPlanilha;
  rotulo: string;
  origem: "pncp" | "edital";
}> = [
  { campo: "data_certame", rotulo: "DATA CERTAME", origem: "edital" },
  { campo: "data_limite", rotulo: "DATA LIMITE", origem: "pncp" },
  { campo: "orgao", rotulo: "ORGÃO", origem: "pncp" },
  { campo: "local_entrega", rotulo: "LOCAL DE ENTREGA", origem: "edital" },
  { campo: "prazo_entrega", rotulo: "PRAZO DE ENTREGA", origem: "edital" },
  { campo: "forma_entrega", rotulo: "FORMA DE ENTREGA", origem: "edital" },
  { campo: "registro_preco", rotulo: "REGISTRO DE PREÇO", origem: "edital" },
  { campo: "forma_pagamento", rotulo: "FORMA DE PAGAMENTO", origem: "edital" },
  { campo: "amostra_catalogo", rotulo: "AMOSTRA/CATÁLOGO", origem: "edital" },
];

const COLUNAS_TABELA = [
  { titulo: "Lote", largura: 8 },
  { titulo: "ITEM", largura: 10 },
  { titulo: "DESCRIÇÃO DO ITEM", largura: 62 },
  { titulo: "QTD", largura: 8 },
  { titulo: "UNIDADE FORN.", largura: 15 },
  { titulo: "VALOR UNIT referência", largura: 18 },
  { titulo: "VALOR TOTAL", largura: 16 },
  { titulo: "Preço final", largura: 14 },
  { titulo: "final total", largura: 16 },
];

/** "2026-08-25T08:00:00+00:00" -> "25/08/2026 08:00" (hora de Brasília). */
function dataHora(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p: Record<string, string> = {};
  for (
    const parte of new Intl.DateTimeFormat("pt-BR", {
      // Mesma convenção da aba Licitando: o instante guardado carrega o
      // relógio de Brasília, então formatar em UTC devolve a hora do edital.
      timeZone: "UTC",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).formatToParts(d)
  ) p[parte.type] = parte.value;
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

export function gerarPlanilhaMateriais(dados: DadosPlanilha): Uint8Array {
  const linhas: string[] = [];
  let r = 0;
  const merges: string[] = [];

  function linha(celulas: Array<Valor | null>, altura?: number) {
    r += 1;
    const conteudo = celulas
      .map((valor, i) =>
        valor === null
          ? ""
          : celulaXml(`${letraColuna(i + 1)}${r}`, valor)
      )
      .join("");
    const ht = altura ? ` ht="${altura}" customHeight="1"` : "";
    linhas.push(`<row r="${r}"${ht}>${conteudo}</row>`);
  }

  // --- topo: título e identificação de quem cota
  linha([
    { tipo: "texto", v: "PLANILHA DE MATERIAIS", estilo: ESTILO.titulo },
    null,
    null,
    null,
    null,
    dados.empresa
      ? { tipo: "texto", v: dados.empresa, estilo: ESTILO.rotuloPncp }
      : null,
  ], 20);
  linha([
    dados.objeto
      ? { tipo: "texto", v: dados.objeto.slice(0, 300), estilo: ESTILO.marca }
      : null,
    null,
    null,
    null,
    null,
    dados.email ? { tipo: "texto", v: dados.email, estilo: ESTILO.marca } : null,
  ]);
  merges.push(`A${r}:E${r}`);
  linha([
    {
      tipo: "texto",
      v: [
        dados.modalidade,
        dados.municipio && dados.uf ? `${dados.municipio}/${dados.uf}` : null,
        dados.numeroControlePncp ? `PNCP ${dados.numeroControlePncp}` : null,
      ].filter(Boolean).join(" · "),
      estilo: ESTILO.marca,
    },
  ]);
  merges.push(`A${r}:E${r}`);
  linha([]);

  // --- bloco de cabeçalho (rótulo | valor)
  for (const { campo, rotulo, origem } of ROTULOS) {
    const bruto = dados.cabecalho[campo];
    const valor = campo === "data_limite" || campo === "data_certame"
      ? (dataHora(bruto) ?? bruto)
      : bruto;
    linha([
      {
        tipo: "texto",
        v: rotulo,
        estilo: origem === "pncp" ? ESTILO.rotuloPncp : ESTILO.rotuloEdital,
      },
      valor
        ? { tipo: "texto", v: valor, estilo: ESTILO.valorCabecalho }
        : { tipo: "vazio", estilo: ESTILO.valorCabecalho },
    ]);
    // Valor ocupa da coluna B até a G: cabe uma frase sem invadir a tabela.
    merges.push(`B${r}:G${r}`);
  }

  linha([]);

  // --- tabela de itens
  linha(
    COLUNAS_TABELA.map((c) => ({
      tipo: "texto" as const,
      v: c.titulo,
      estilo: ESTILO.cabecalhoTabela,
    })),
    30,
  );

  const primeiraItem = r + 1;
  for (const item of dados.itens) {
    const proxima = r + 1;
    linha([
      { tipo: "vazio", estilo: ESTILO.inteiro }, // Lote: o PNCP não informa
      item.numero === null
        ? { tipo: "vazio", estilo: ESTILO.inteiro }
        : { tipo: "numero", v: item.numero, estilo: ESTILO.inteiro },
      {
        tipo: "texto",
        v: item.descricao ?? "",
        estilo: ESTILO.celula,
      },
      item.quantidade === null
        ? { tipo: "vazio", estilo: ESTILO.inteiro }
        : { tipo: "numero", v: item.quantidade, estilo: ESTILO.inteiro },
      { tipo: "texto", v: item.unidade ?? "", estilo: ESTILO.celula },
      item.valor_unitario === null
        ? { tipo: "vazio", estilo: ESTILO.moeda }
        : { tipo: "numero", v: item.valor_unitario, estilo: ESTILO.moeda },
      item.valor_total === null
        ? { tipo: "vazio", estilo: ESTILO.moeda }
        : { tipo: "numero", v: item.valor_total, estilo: ESTILO.moeda },
      { tipo: "vazio", estilo: ESTILO.moeda }, // Preço final: quem cota preenche
      // Total final calculado pelo Excel: quantidade × preço final.
      { tipo: "formula", f: `IF(H${proxima}="","",D${proxima}*H${proxima})`, estilo: ESTILO.moeda },
    ]);
  }
  const ultimaItem = r;

  // --- totais
  if (dados.itens.length > 0) {
    linha([
      { tipo: "texto", v: "TOTAL", estilo: ESTILO.celulaTotal },
      { tipo: "vazio", estilo: ESTILO.celulaTotal },
      { tipo: "vazio", estilo: ESTILO.celulaTotal },
      { tipo: "vazio", estilo: ESTILO.celulaTotal },
      { tipo: "vazio", estilo: ESTILO.celulaTotal },
      { tipo: "vazio", estilo: ESTILO.celulaTotal },
      {
        tipo: "formula",
        f: `SUM(G${primeiraItem}:G${ultimaItem})`,
        estilo: ESTILO.moedaTotal,
      },
      { tipo: "vazio", estilo: ESTILO.celulaTotal },
      {
        tipo: "formula",
        f: `SUM(I${primeiraItem}:I${ultimaItem})`,
        estilo: ESTILO.moedaTotal,
      },
    ]);
  }

  linha([]);
  linha([{
    tipo: "texto",
    v:
      "Quantidades, unidades e valores de referência vêm da API de itens do PNCP. Preencha a coluna \"Preço final\": o total é calculado por fórmula.",
    estilo: ESTILO.marca,
  }]);
  merges.push(`A${r}:I${r}`);

  const cols = COLUNAS_TABELA
    .map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.largura}" customWidth="1"/>`)
    .join("");

  const mergesXml = merges.length > 0
    ? `<mergeCells count="${merges.length}">${
      merges.map((m) => `<mergeCell ref="${m}"/>`).join("")
    }</mergeCells>`
    : "";

  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>${cols}</cols><sheetData>${
    linhas.join("")
  }</sheetData>${mergesXml}</worksheet>`;

  return zipSync(
    {
      "[Content_Types].xml": strToU8(CONTENT_TYPES),
      "_rels/.rels": strToU8(RELS),
      "xl/workbook.xml": strToU8(WORKBOOK),
      "xl/_rels/workbook.xml.rels": strToU8(WORKBOOK_RELS),
      "xl/styles.xml": strToU8(STYLES),
      "xl/worksheets/sheet1.xml": strToU8(sheet),
    },
    { level: 6 },
  );
}
