import Link from "next/link";
import { redirect } from "next/navigation";
import { criarClientServidor } from "@/lib/supabase/server";

interface Assinatura {
  estado: string;
  plano: string;
  trial_fim: string | null;
  ativo_ate: string | null;
  analises_usadas: number;
  analises_limite: number;
}

const ROTULO_PLANO: Record<string, string> = {
  trial: "Teste grátis",
  essencial: "Essencial",
  profissional: "Profissional",
  admin: "Administrador",
};

function dataBr(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("pt-BR") : "—";
}

export default async function PaginaAssinatura({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await criarClientServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: ass }, { count: qtdPerfis }, { data: limitePerfis }, { data: conta }] =
    await Promise.all([
      supabase.rpc("minha_assinatura").maybeSingle<Assinatura>(),
      supabase.from("perfis").select("id", { count: "exact", head: true }),
      supabase.rpc("limite_perfis", { p_user: user.id }),
      supabase
        .from("contas")
        .select("stripe_customer_id, created_at")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

  if (!ass) redirect("/painel");

  const ehAdmin = ass.estado === "admin";
  const ehTrial = ass.estado === "trial";
  const ehAtivo = ass.estado === "ativo";
  const rotulo = ehAdmin
    ? "Administrador"
    : ROTULO_PLANO[ass.plano] ?? ass.plano;

  const diasRestantes = ass.trial_fim
    ? Math.max(
      0,
      Math.ceil(
        (new Date(ass.trial_fim).getTime() - Date.now()) /
          (24 * 60 * 60 * 1000),
      ),
    )
    : null;

  const limite = ass.analises_limite ?? 0;
  const usadas = ass.analises_usadas ?? 0;
  const pctUso = limite > 0 ? Math.min(100, Math.round((usadas / limite) * 100)) : 0;
  const tetoPerfis = (limitePerfis as number | null) ?? 1;

  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }}>
      <div className="cabecalho-pagina">
        <div>
          <h1>Minha assinatura</h1>
          <p className="texto-suave sem-margem">
            Plano, uso e informações de cobrança.
          </p>
        </div>
      </div>

      {sp?.erro === "portal" && (
        <p className="mensagem-erro">
          Não foi possível abrir o portal de pagamento agora. Tente novamente
          ou fale com a gente em contato@sentinelagov.com.
        </p>
      )}

      {/* Plano atual */}
      <div className="cartao">
        <div className="chamado-item-topo">
          <h3>Plano atual</h3>
          <span
            className={`chamado-status ${
              ehAtivo || ehAdmin
                ? "chamado-status--respondido"
                : "chamado-status--aberto"
            }`}
          >
            {ehAdmin ? "Sem limites" : ehAtivo ? "Ativo" : "Em teste"}
          </span>
        </div>
        <p className="plano-preco" style={{ marginTop: 8 }}>
          {rotulo}
          {ehAtivo && (
            <span>
              {" "}· {ass.plano === "profissional" ? "R$ 197" : "R$ 97"}/mês
            </span>
          )}
        </p>
        <p className="texto-suave">
          {ehAdmin && "Conta administradora — sem limites de uso."}
          {ehTrial &&
            `Seu teste grátis termina em ${diasRestantes} ${diasRestantes === 1 ? "dia" : "dias"} (${dataBr(ass.trial_fim)}).`}
          {ehAtivo &&
            `Assinatura válida até ${dataBr(ass.ativo_ate)} — renova automaticamente.`}
        </p>
      </div>

      {/* Uso de análises */}
      {!ehAdmin && (
        <div className="cartao">
          <h3>Análises de IA</h3>
          <p className="texto-suave" style={{ marginTop: 6 }}>
            {usadas} de {limite} análises usadas{" "}
            {ehTrial ? "no período de teste" : "neste mês"}. Cada documento
            anexado ao contexto da conversa conta como 1 análise.
          </p>
          <div className="barra-uso" style={{ marginTop: 10 }}>
            <span style={{ width: `${pctUso}%` }} />
          </div>
          {pctUso >= 80 && (
            <p className="texto-suave" style={{ marginTop: 8, fontSize: 13 }}>
              ⚠️ Você está perto do limite.{" "}
              <Link href="/assinar">
                {ehTrial ? "Assine um plano" : "Faça upgrade"}
              </Link>{" "}
              para continuar analisando.
            </p>
          )}
        </div>
      )}

      {/* Perfis */}
      <div className="cartao">
        <h3>Perfis de busca</h3>
        <p className="texto-suave" style={{ marginTop: 6 }}>
          {qtdPerfis ?? 0} de {tetoPerfis > 90 ? "∞" : tetoPerfis} perfis em
          uso.
        </p>
        <p style={{ marginTop: 12 }}>
          <Link href="/painel/perfil" className="botao botao-secundario">
            Gerenciar perfis
          </Link>
        </p>
      </div>

      {/* Upgrade / cobrança */}
      {!ehAdmin && (
        <div className="cartao">
          <h3>
            {ehTrial
              ? "Assinar um plano"
              : ass.plano === "essencial"
                ? "Fazer upgrade"
                : "Cobrança"}
          </h3>
          <p className="texto-suave" style={{ marginTop: 6 }}>
            {ehTrial &&
              "Continue recebendo alertas e analisando editais depois do teste."}
            {ehAtivo && ass.plano === "essencial" &&
              "O Profissional tem 3 perfis de busca e 100 análises por mês."}
            {ehAtivo && ass.plano === "profissional" &&
              "Você está no nosso plano mais completo."}
          </p>
          <p style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
            {(ehTrial || ass.plano === "essencial") && (
              <Link href="/assinar" className="botao">
                {ehTrial ? "Ver planos" : "Upgrade para Profissional"}
              </Link>
            )}
            {conta?.stripe_customer_id && (
              <form action="/api/assinar/portal" method="post">
                <button type="submit" className="botao botao-secundario">
                  Gerenciar pagamento
                </button>
              </form>
            )}
          </p>
          {ehAtivo && (
            <p className="texto-suave" style={{ marginTop: 10, fontSize: 13 }}>
              No portal de pagamento você troca o cartão, baixa recibos ou
              cancela a assinatura.
            </p>
          )}
        </div>
      )}

      <p className="texto-suave" style={{ fontSize: 13 }}>
        Cliente desde {dataBr((conta?.created_at as string) ?? null)}. Dúvidas
        sobre cobrança? Abra um <Link href="/painel/chamados">chamado</Link>.
      </p>
    </div>
  );
}
