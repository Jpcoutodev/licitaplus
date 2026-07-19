import type { Metadata } from "next";
import Link from "next/link";
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
  appleWebApp: { capable: true, title: "Licitaplus", statusBarStyle: "default" },
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
        <Link href="/painel" className="sidebar-logo" title="Licitaplus">
          <span className="logo-completo">
            <Logo claro tamanho={30} />
          </span>
          <span className="logo-curto">
            <MarcaLogo tamanho={30} />
          </span>
        </Link>

        <NavPainel admin={ehAdmin} />

        <div className="sidebar-rodape">
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
          <Link href="/painel" aria-label="Licitaplus">
            <Logo tamanho={28} />
          </Link>
          <form action="/auth/sair" method="post">
            <button type="submit" className="botao-fantasma">
              Sair
            </button>
          </form>
        </header>

        <main className="container">
          <InstalarApp />
          {children}
        </main>
      </div>

      {/* Navegação inferior só no celular */}
      <BottomNav admin={ehAdmin} />
    </div>
  );
}
