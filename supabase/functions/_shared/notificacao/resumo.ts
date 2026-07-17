/**
 * Geração do resumo de licitação para o email de alerta.
 * A conversa com o provedor de IA fica em _shared/ia/minimax.ts.
 */

import { conversarComIA } from "../ia/minimax.ts";
import {
  INSTRUCAO_RESUMO,
  type LicitacaoParaNotificar,
  montarPromptResumo,
} from "./conteudo.ts";

export async function gerarResumo(
  licitacao: LicitacaoParaNotificar,
): Promise<string> {
  return await conversarComIA([
    { role: "system", content: INSTRUCAO_RESUMO },
    { role: "user", content: montarPromptResumo(licitacao) },
  ]);
}
