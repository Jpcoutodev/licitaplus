/**
 * Fonte única da identidade da marca no app. Trocar o nome do produto no
 * futuro é editar este arquivo (e o equivalente em
 * supabase/functions/_shared/marca.ts, que o runtime Deno usa).
 */

export const MARCA = {
  nome: "SentinelaGov",
  /** Domínio canônico, sem protocolo. */
  dominio: "sentinelagov.com.br",
  /** URL canônica; a env sobrepõe em preview/produção. */
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "https://sentinelagov.com.br",
  emailContato: "contato@sentinelagov.com.br",
  tagline: "As licitações certas para a sua empresa, sem esforço.",
} as const;
