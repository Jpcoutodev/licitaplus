import type { ComponentType } from "react";

export interface MetaPost {
  slug: string;
  titulo: string;
  /** Meta description (SEO) — até ~160 caracteres. */
  descricao: string;
  /** Chamada curta usada no card do índice. */
  resumo: string;
  palavrasChave: string[];
  publicadoEm: string; // ISO (yyyy-mm-dd)
  atualizadoEm: string; // ISO
  categoria: string;
  leituraMin: number;
}

export interface ItemFaq {
  p: string;
  r: string;
}

export interface Artigo {
  meta: MetaPost;
  faq: ItemFaq[];
  Corpo: ComponentType;
}
