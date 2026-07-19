import Link from "next/link";
import { IconeSair, NavPainel } from "./nav";
import { criarClientServidor } from "@/lib/supabase/server";

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
        <Link href="/painel" className="logo" title="Licitaplus">
          <span className="logo-completo">
            Licita<span style={{ color: "var(--primaria)" }}>plus</span>
          </span>
          <span className="logo-curto" style={{ color: "var(--primaria)" }}>
            L+
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
        <main className="container">{children}</main>
      </div>
    </div>
  );
}
