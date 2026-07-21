/**
 * Identidade da marca para o runtime Deno (edge functions). Espelha
 * lib/marca.ts do app Next — os dois devem mudar juntos.
 */

export const MARCA = {
  nome: "SentinelaGov",
  dominio: "sentinelagov.com",
  siteUrl: "https://sentinelagov.com",
  emailContato: "contato@sentinelagov.com",
} as const;
