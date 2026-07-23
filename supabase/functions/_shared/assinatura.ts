/**
 * Estado da assinatura no lado do servidor (edge functions). Espelha a RPC
 * public.minha_assinatura() — os limites devem mudar juntos.
 *
 * Regras: admin sem limites; plano pago vigente (essencial 30/mês,
 * profissional 100/mês); senão trial de 14 dias desde a criação da conta com
 * 10 análises no TOTAL; senão expirado.
 */

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

export type EstadoAssinatura =
  | "admin"
  | "ativo"
  | "trial"
  | "expirado"
  | "sem_conta";

export interface Assinatura {
  estado: EstadoAssinatura;
  plano: string;
  usadas: number;
  limite: number;
}

const LIMITES: Record<string, number> = {
  trial: 10,
  essencial: 30,
  profissional: 100,
};

/** Client service role (ignora RLS) para leituras/débitos de assinatura. */
export function clientServico(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

function mesAtual(): string {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
}

export async function lerAssinatura(
  service: SupabaseClient,
  userId: string,
  email: string | null,
): Promise<Assinatura> {
  if (email) {
    const { data: admin } = await service
      .from("admins")
      .select("email")
      .eq("email", email)
      .maybeSingle();
    if (admin) {
      return { estado: "admin", plano: "admin", usadas: 0, limite: 999999 };
    }
  }

  const { data: conta } = await service
    .from("contas")
    .select("plano, plano_ativo_ate, created_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (!conta) {
    return { estado: "sem_conta", plano: "trial", usadas: 0, limite: 0 };
  }

  const plano = conta.plano as string;
  const ativoAte = conta.plano_ativo_ate
    ? new Date(conta.plano_ativo_ate as string)
    : null;

  if (
    (plano === "essencial" || plano === "profissional") &&
    ativoAte && ativoAte.getTime() > Date.now()
  ) {
    const { data: uso } = await service
      .from("analises_uso")
      .select("usadas")
      .eq("user_id", userId)
      .eq("mes", mesAtual())
      .maybeSingle();
    return {
      estado: "ativo",
      plano,
      usadas: (uso?.usadas as number) ?? 0,
      limite: LIMITES[plano],
    };
  }

  const trialFim = new Date(conta.created_at as string).getTime() +
    14 * 24 * 60 * 60 * 1000;
  if (trialFim > Date.now()) {
    const { data: usos } = await service
      .from("analises_uso")
      .select("usadas")
      .eq("user_id", userId);
    const total = (usos ?? []).reduce(
      (soma, u) => soma + ((u.usadas as number) ?? 0),
      0,
    );
    return { estado: "trial", plano: "trial", usadas: total, limite: 10 };
  }

  return { estado: "expirado", plano, usadas: 0, limite: 0 };
}

/** Debita 1 análise do mês corrente (chamar só após a operação dar certo). */
export async function debitarAnalise(
  service: SupabaseClient,
  userId: string,
): Promise<void> {
  const mes = mesAtual();
  const { data } = await service
    .from("analises_uso")
    .select("usadas")
    .eq("user_id", userId)
    .eq("mes", mes)
    .maybeSingle();
  await service.from("analises_uso").upsert({
    user_id: userId,
    mes,
    usadas: ((data?.usadas as number) ?? 0) + 1,
  });
}
