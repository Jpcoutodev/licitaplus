import type { Artigo, MetaPost } from "./tipos";
import ondeEncontrar from "./conteudo/onde-encontrar-licitacoes-abertas";
import comoVender from "./conteudo/como-vender-para-o-governo";
import participarMei from "./conteudo/como-participar-de-licitacao-mei-pequena-empresa";

/** Registro de todos os artigos do blog. Novos posts entram aqui. */
export const ARTIGOS: Artigo[] = [comoVender, participarMei, ondeEncontrar];

/** Metadados ordenados do mais recente para o mais antigo (índice do blog). */
export const POSTS: MetaPost[] = ARTIGOS
  .map((a) => a.meta)
  .sort((a, b) => b.publicadoEm.localeCompare(a.publicadoEm));

export function obterArtigo(slug: string): Artigo | undefined {
  return ARTIGOS.find((a) => a.meta.slug === slug);
}
