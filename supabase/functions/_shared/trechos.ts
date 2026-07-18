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
