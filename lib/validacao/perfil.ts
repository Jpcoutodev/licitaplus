import { z } from "zod";
import { UFS, MODALIDADES } from "@/lib/constantes";
import { limitesDoUsuario } from "@/lib/limites";

const CODIGOS_MODALIDADE = MODALIDADES.map((m) => m.codigo);

/**
 * Validação de toda entrada do usuário ANTES de qualquer persistência.
 * As mesmas regras protegem a coleta: só UFs e modalidades válidas viram
 * consultas ao PNCP.
 */
export function esquemaPerfil() {
  const limites = limitesDoUsuario();

  return z
    .object({
      palavras_chave: z
        .array(
          z
            .string()
            .trim()
            .min(3, "cada palavra-chave precisa de ao menos 3 letras")
            .max(60, "palavra-chave longa demais")
            .regex(
              /^[\p{L}\p{N} \-]+$/u,
              "use apenas letras, números, espaços e hífens",
            ),
        )
        .min(1, "informe ao menos uma palavra-chave")
        .max(
          limites.maxPalavrasChave,
          `seu plano permite até ${limites.maxPalavrasChave} palavras-chave`,
        ),
      brasil_inteiro: z.boolean(),
      ufs: z
        .array(z.enum(UFS))
        .max(limites.maxUfs, `seu plano permite até ${limites.maxUfs} UFs`),
      modalidades: z
        .array(z.number().int())
        .refine(
          (lista) => lista.every((c) => CODIGOS_MODALIDADE.includes(c)),
          "modalidade inválida",
        ),
      ativo: z.boolean(),
    })
    .refine(
      (dados) => dados.brasil_inteiro || dados.ufs.length >= 1,
      {
        message: "selecione ao menos uma UF ou marque Brasil inteiro",
        path: ["ufs"],
      },
    );
}

export type DadosPerfil = z.infer<ReturnType<typeof esquemaPerfil>>;
