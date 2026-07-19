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
  brasil_inteiro: boolean;
}

export interface Fatia {
  /** undefined = consulta nacional (Brasil inteiro). */
  uf?: string;
  /** undefined = todas as modalidades. */
  codigoModalidade?: number;
}

/** Chave "BR" representa a região nacional (perfil Brasil inteiro). */
const NACIONAL = "BR";

/**
 * Deriva o conjunto mínimo de fatias a partir dos perfis ativos. Perfis
 * "Brasil inteiro" viram fatias nacionais (sem UF); os demais, fatias por
 * UF × modalidade. Se qualquer perfil de uma região não filtra modalidade,
 * a região vira uma única fatia sem filtro de modalidade.
 */
export function derivarFatias(perfis: PerfilColeta[]): Fatia[] {
  // Chave da região: "BR" para nacional, ou a sigla da UF.
  const modalidadesPorRegiao = new Map<string, Set<number> | "todas">();

  const registrar = (regiao: string, modalidades: number[]) => {
    const atual = modalidadesPorRegiao.get(regiao);
    if (atual === "todas") return;
    if (modalidades.length === 0) {
      modalidadesPorRegiao.set(regiao, "todas");
    } else {
      const conjunto = atual ?? new Set<number>();
      for (const m of modalidades) conjunto.add(m);
      modalidadesPorRegiao.set(regiao, conjunto);
    }
  };

  for (const perfil of perfis) {
    if (perfil.brasil_inteiro) {
      registrar(NACIONAL, perfil.modalidades);
    } else {
      for (const uf of perfil.ufs) {
        const sigla = uf.trim().toUpperCase();
        if (sigla) registrar(sigla, perfil.modalidades);
      }
    }
  }

  const fatias: Fatia[] = [];
  for (const [regiao, modalidades] of modalidadesPorRegiao) {
    const uf = regiao === NACIONAL ? undefined : regiao;
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
  [
    "inteligência artificial",
    "aprendizado de máquina",
    "aprendizado profundo",
    "machine learning",
    "redes neurais",
  ],
];

/**
 * Expande a lista de palavras-chave do perfil com os sinônimos conhecidos,
 * sem duplicatas e preservando os termos originais. Um grupo é aplicado
 * quando a palavra-chave é igual a um termo do grupo OU o contém como
 * palavra inteira (ex.: "produtos de limpeza" ativa o grupo de "limpeza") —
 * palavras compostas exigem todas as palavras no matching, então a expansão
 * amplia o alcance sem o usuário precisar adivinhar o jargão dos editais.
 */
export function expandirComSinonimos(palavrasChave: string[]): string[] {
  const termos = new Set<string>();

  for (const palavra of palavrasChave) {
    const normalizada = palavra.trim().toLowerCase();
    if (!normalizada) continue;
    termos.add(normalizada);

    const palavrasDoTermo = normalizada.split(/\s+/);
    for (const grupo of GRUPOS_SINONIMOS) {
      const ativa = grupo.some(
        (sinonimo) =>
          sinonimo === normalizada || palavrasDoTermo.includes(sinonimo),
      );
      if (ativa) {
        for (const sinonimo of grupo) termos.add(sinonimo);
      }
    }
  }
  return [...termos];
}
