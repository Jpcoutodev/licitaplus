/**
 * Fatiamento de documento em trechos para a recuperação por pergunta (RAG).
 * Lógica pura — testável em Node ou Deno.
 */

const TAMANHO_TRECHO = 2_000;
const SOBREPOSICAO = 200;

/**
 * Divide o texto em trechos de ~2.000 caracteres com sobreposição de 200,
 * preferindo quebrar em fim de parágrafo ou de frase para não cortar
 * cláusulas ao meio.
 */
export function dividirEmTrechos(texto: string): string[] {
  const trechos: string[] = [];
  let inicio = 0;

  while (inicio < texto.length) {
    let fim = Math.min(inicio + TAMANHO_TRECHO, texto.length);

    if (fim < texto.length) {
      // Procura um ponto de quebra natural na metade final do trecho.
      const janela = texto.slice(inicio + TAMANHO_TRECHO / 2, fim);
      const quebraParagrafo = janela.lastIndexOf("\n");
      const quebraFrase = janela.lastIndexOf(". ");
      const quebra = Math.max(quebraParagrafo, quebraFrase);
      if (quebra > 0) {
        fim = inicio + TAMANHO_TRECHO / 2 + quebra + 1;
      }
    }

    const trecho = texto.slice(inicio, fim).trim();
    if (trecho) trechos.push(trecho);

    if (fim >= texto.length) break;
    inicio = fim - SOBREPOSICAO;
  }

  return trechos;
}

const MAX_TITULOS = 150;
const MAX_SUMARIO_CHARS = 6_000;

// Marcadores distintivos de estrutura de edital. Varridos no texto inteiro
// (não por linha) porque a extração de PDF costuma juntar tudo sem quebras.
// Numerais (romanos ou arábicos) exigem fronteira de palavra ao final, para
// "SEÇÃO casualmente" não casar ("c" sozinho não é um numeral seguido de \b).
const MARCADORES_ESTRUTURA =
  /(ANEXO\s+(?:[IVXLCDM]+|\d+)\b|TERMO DE REFER[ÊE]NCIA|MINUTA(?:\s+D[OE]\s+[A-ZÀ-Ú]+)?|MAPA DE RISCOS?|CL[ÁA]USULA\s+[A-ZÀ-Ú]+|CAP[ÍI]TULO\s+(?:[IVXLCDM]+|\d+)\b|SE[ÇC][ÃA]O\s+(?:[IVXLCDM]+|\d+)\b)/gi;

// Cabeçalho numerado seguido de palavra capitalizada (quando há quebras de
// linha), ex.: "5.5.11 Requisitos técnicos".
const NUMERADO_LINHA = /^\s*\d+(\.\d+)*[.)]?\s+\p{Lu}[\p{L} ]{3,}/u;

/**
 * Extrai um sumário (títulos/seções) para dar à IA visão da ESTRUTURA do
 * documento, mesmo no modo trechos. Combina uma varredura global por
 * marcadores distintivos (robusta a PDFs sem quebras de linha) com uma
 * varredura por linha para cabeçalhos numerados.
 */
export function extrairSumario(texto: string): string {
  const candidatos: Array<{ pos: number; texto: string }> = [];

  // 1) Varredura global por marcadores (funciona sem quebras de linha).
  for (const m of texto.matchAll(MARCADORES_ESTRUTURA)) {
    const pos = m.index ?? 0;
    // Captura o marcador + o restante do "título" até uma quebra forte.
    const janela = texto.slice(pos, pos + 90).replace(/\s+/g, " ").trim();
    const corte = janela.search(/(?<=\w)\.\s|;| - [a-z]/);
    const titulo = (corte > 20 ? janela.slice(0, corte) : janela).trim();
    if (titulo.length >= 4) candidatos.push({ pos, texto: titulo });
  }

  // 2) Cabeçalhos numerados por linha (quando o PDF preservou quebras).
  let offset = 0;
  for (const linha of texto.split(/\r?\n/)) {
    const l = linha.trim().replace(/\s+/g, " ");
    if (l.length >= 6 && l.length <= 110 && NUMERADO_LINHA.test(l)) {
      candidatos.push({ pos: offset, texto: l });
    }
    offset += linha.length + 1;
  }

  // Ordena por posição e descarta marcadores que caem dentro do título já
  // capturado logo antes (ex.: "TERMO DE REFERÊNCIA" dentro de "ANEXO I -
  // TERMO DE REFERÊNCIA").
  candidatos.sort((a, b) => a.pos - b.pos);
  const titulos: string[] = [];
  let cobertoAte = -1;
  for (const { pos, texto: t } of candidatos) {
    if (pos < cobertoAte || titulos.includes(t)) continue;
    titulos.push(t);
    cobertoAte = pos + t.length;
    if (titulos.length >= MAX_TITULOS) break;
  }

  return titulos.join("\n").slice(0, MAX_SUMARIO_CHARS);
}
