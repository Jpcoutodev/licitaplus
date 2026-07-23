import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { IconeSair, NavPainel } from "./nav";
import { BottomNav } from "./bottom-nav";
import { InstalarApp } from "./instalar";
import { Logo, MarcaLogo } from "../logo";
import { criarClientServidor } from "@/lib/supabase/server";

// Manifesto do PWA só nas rotas do painel (o app instalável é o sistema).
export const metadata: Metadata = {
  manifest: "/manifest-app",
  robots: { index: false, follow: false },
  icons: {
    icon: "/icone-192.png",
    apple: "/icone-192.png",
  },
  appleWebApp: { capable: true, title: "SentinelaGov", statusBarStyle: "default" },
};

export default async function LayoutPainel({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Descobre se o usuário é admin (só ele vê a aba Métricas). A RLS de
  // `admins` deixa cada um ler apenas a própria linha.
  const supabase = await criarClientServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Onboarding obrigatório: sem conta (ou sem CPF/CNPJ, para contas antigas),
  // manda concluir antes de usar o painel.
  let nomeEmpresa: string | null = null;
  let trialDias: number | null = null;
  let trialAnalises: { usadas: number; limite: number } | null = null;
  if (user) {
    const { data: conta } = await supabase
      .from("contas")
      .select("nome_empresa, cpf_cnpj")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!conta || !conta.cpf_cnpj) redirect("/onboarding");
    nomeEmpresa = (conta.nome_empresa as string) ?? null;

    // Estado do plano: expirado -> tela de assinatura; trial -> banner.
    const { data: ass } = await supabase
      .rpc("minha_assinatura")
      .maybeSingle<{
        estado: string;
        plano: string;
        trial_fim: string | null;
        ativo_ate: string | null;
        analises_usadas: number;
        analises_limite: number;
      }>();
    if (ass?.estado === "expirado") redirect("/assinar");
    if (ass?.estado === "trial" && ass.trial_fim) {
      trialDias = Math.max(
        0,
        Math.ceil(
          (new Date(ass.trial_fim as string).getTime() - Date.now()) /
            (24 * 60 * 60 * 1000),
        ),
      );
      trialAnalises = {
        usadas: (ass.analises_usadas as number) ?? 0,
        limite: (ass.analises_limite as number) ?? 10,
      };
    }
  }

  let ehAdmin = false;
  if (user?.email) {
    const { data } = await supabase
      .from("admins")
      .select("email")
      .eq("email", user.email)
      .maybeSingle();
    ehAdmin = Boolean(data);
  }

  return (
    <div className="layout-app">
      <aside className="sidebar">
        <Link href="/painel" className="sidebar-logo" title="SentinelaGov">
          <span className="logo-completo">
            <Logo claro tamanho={30} />
          </span>
          <span className="logo-curto">
            <MarcaLogo tamanho={30} />
          </span>
        </Link>

        <NavPainel admin={ehAdmin} />

        <div className="sidebar-rodape">
          <div className="conta-chip" title={user?.email ?? ""}>
            <span className="conta-avatar" aria-hidden>
              {(nomeEmpresa ?? "?").trim().charAt(0).toUpperCase()}
            </span>
            <span className="conta-info">
              <strong>{nomeEmpresa ?? "Minha empresa"}</strong>
              <span>{user?.email}</span>
            </span>
          </div>
          <form action="/auth/sair" method="post">
            <button type="submit" className="item-nav" title="Sair">
              <IconeSair />
              <span className="texto-nav">Sair</span>
            </button>
          </form>
        </div>
      </aside>

      <div className="conteudo">
        {/* Topo compacto só no celular */}
        <header className="topo-mobile">
          <Link href="/painel" aria-label="SentinelaGov">
            <Logo tamanho={28} />
          </Link>
          {nomeEmpresa && <span className="topo-empresa">{nomeEmpresa}</span>}
          <form action="/auth/sair" method="post">
            <button type="submit" className="botao-fantasma">
              Sair
            </button>
          </form>
        </header>

        <main className="container">
          {trialDias !== null && (
            <div className="banner-trial">
              <span>
                <strong>Teste grátis:</strong> {trialDias}{" "}
                {trialDias === 1 ? "dia restante" : "dias restantes"}
                {trialAnalises &&
                  ` · ${trialAnalises.usadas}/${trialAnalises.limite} análises de IA usadas`}
              </span>
              <Link href="/assinar" className="botao botao-mini">
                Assinar agora
              </Link>
            </div>
          )}
          <InstalarApp />
          {children}
        </main>
      </div>

      {/* Navegação inferior só no celular */}
      <BottomNav admin={ehAdmin} />
    </div>
  );
}
