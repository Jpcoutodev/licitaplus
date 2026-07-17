import Link from "next/link";
import { IconeSair, NavPainel } from "./nav";

export default function LayoutPainel({
  children,
}: Readonly<{ children: React.ReactNode }>) {
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

        <NavPainel />

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
