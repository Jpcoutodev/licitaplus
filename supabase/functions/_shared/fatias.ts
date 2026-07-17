/**
 * Lógica pura da coleta dirigida pelos perfis: derivação do conjunto mínimo
 * de consultas (fatias UF × modalidade) e expansão de palavras-chave com
 * sinônimos. Sem dependências de runtime — testável em Node ou Deno.
 */

export interface PerfilColeta {
  id: string;
  palavras_chave: string[];
  ufs: string[];
  modalidades: number[];
}

export interface Fatia {
  uf: string;
  /** undefined = todas as modalidades da UF. */
  codigoModalidade?: number;
}

/**
 * Deriva o conjunto mínimo de fatias UF × modalidade a partir dos perfis
 * ativos. Se alguma UF tem perfil sem modalidade específica (lista vazia),
 * a fatia da UF é única e sem filtro de modalidade — cobre todos os casos
 * com uma só consulta.
 */
export function derivarFatias(perfis: PerfilColeta[]): Fatia[] {
  const modalidadesPorUf = new Map<string, Set<number> | "todas">();

  for (const perfil of perfis) {
    for (const uf of perfil.ufs) {
      const sigla = uf.trim().toUpperCase();
      if (!sigla) continue;

      const atual = modalidadesPorUf.get(sigla);
      if (atual === "todas") continue;

      if (perfil.modalidades.length === 0) {
        modalidadesPorUf.set(sigla, "todas");
      } else {
        const conjunto = atual ?? new Set<number>();
        for (const modalidade of perfil.modalidades) conjunto.add(modalidade);
        modalidadesPorUf.set(sigla, conjunto);
      }
    }
  }

  const fatias: Fatia[] = [];
  for (const [uf, modalidades] of modalidadesPorUf) {
    if (modalidades === "todas") {
      fatias.push({ uf });
    } else {
      for (const codigoModalidade of modalidades) {
        fatias.push({ uf, codigoModalidade });
      }
    }
  }
  return fatias;
}

/**
 * Dicionário simples de sinônimos para o matching textual. Cada grupo é
 * expandido nos dois sentidos: se a palavra-chave do perfil aparece em um
 * grupo, todos os termos do grupo entram na consulta.
 */
const GRUPOS_SINONIMOS: string[][] = [
  ["merenda", "alimentação escolar", "gêneros alimentícios"],
  ["computador", "notebook", "microcomputador", "desktop"],
  ["veículo", "automóvel", "carro"],
  ["medicamento", "remédio", "fármaco"],
  ["obra", "construção", "reforma"],
  ["limpeza", "higienização"],
  ["uniforme", "vestuário", "fardamento"],
  ["papelaria", "material de escritório", "material de expediente"],
  ["combustível", "gasolina", "diesel", "etanol"],
  ["informática", "tecnologia da informação"],
];

/**
 * Expande a lista de palavras-chave do perfil com os sinônimos conhecidos,
 * sem duplicatas e preservando os termos originais.
 */
export function expandirComSinonimos(palavrasChave: string[]): string[] {
  const termos = new Set<string>();

  for (const palavra of palavrasChave) {
    const normalizada = palavra.trim().toLowerCase();
    if (!normalizada) continue;
    termos.add(normalizada);

    for (const grupo of GRUPOS_SINONIMOS) {
      if (grupo.includes(normalizada)) {
        for (const sinonimo of grupo) termos.add(sinonimo);
      }
    }
  }
  return [...termos];
}
