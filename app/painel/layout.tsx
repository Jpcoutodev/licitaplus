import Link from "next/link";
import { NavPainel } from "./nav";

export default function LayoutPainel({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <header className="topo">
        <div className="container">
          <div className="topo-linha">
            <Link href="/painel" className="logo">
              Licita<span>plus</span>
            </Link>
            <form action="/auth/sair" method="post">
              <button type="submit" className="botao-fantasma">
                Sair
              </button>
            </form>
          </div>
          <NavPainel />
        </div>
      </header>
      <main className="container">{children}</main>
    </>
  );
}
