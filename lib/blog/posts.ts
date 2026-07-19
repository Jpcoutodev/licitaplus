import type { Artigo, MetaPost } from "./tipos";
import ondeEncontrar from "./conteudo/onde-encontrar-licitacoes-abertas";

/** Registro de todos os artigos do blog. Novos posts entram aqui. */
export const ARTIGOS: Artigo[] = [ondeEncontrar];

/** Metadados ordenados do mais recente para o mais antigo (índice do blog). */
export const POSTS: MetaPost[] = ARTIGOS
  .map((a) => a.meta)
  .sort((a, b) => b.publicadoEm.localeCompare(a.publicadoEm));

export function obterArtigo(slug: string): Artigo | undefined {
  return ARTIGOS.find((a) => a.meta.slug === slug);
}
