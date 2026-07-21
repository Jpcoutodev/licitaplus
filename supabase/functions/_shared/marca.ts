/**
 * Identidade da marca para o runtime Deno (edge functions). Espelha
 * lib/marca.ts do app Next — os dois devem mudar juntos.
 */

export const MARCA = {
  nome: "SentinelaGov",
  dominio: "sentinelagov.com.br",
  siteUrl: "https://sentinelagov.com.br",
  emailContato: "contato@sentinelagov.com.br",
} as const;
