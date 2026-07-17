/**
 * Leitura de variável de ambiente que funciona tanto em Deno (Edge Functions)
 * quanto em Node (testes locais com tsx).
 */
export function lerEnv(nome: string): string | undefined {
  const deno = (globalThis as {
    Deno?: { env: { get(nome: string): string | undefined } };
  }).Deno;
  if (deno) return deno.env.get(nome);

  const node = (globalThis as {
    process?: { env: Record<string, string | undefined> };
  }).process;
  return node?.env[nome];
}
