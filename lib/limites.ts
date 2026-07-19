/**
 * Limites de recursos por plano. No MVP todos os usuários estão no plano
 * gratuito e apenas o limite de palavras-chave é aplicado (na validação do
 * perfil); a estrutura já fica pronta para planos pagos.
 */

export interface LimitesPlano {
  maxPerfis: number;
  maxPalavrasChave: number;
  maxUfs: number;
}

export const PLANOS: Record<string, LimitesPlano> = {
  // maxUfs = 27 cobre todos os estados; para o país todo, o perfil usa a
  // opção "Brasil inteiro" (consulta nacional), não a seleção de UFs.
  gratuito: { maxPerfis: 1, maxPalavrasChave: 5, maxUfs: 27 },
};

export function limitesDoUsuario(): LimitesPlano {
  // MVP: todo usuário é do plano gratuito.
  return PLANOS.gratuito;
}
