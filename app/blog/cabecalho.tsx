import Link from "next/link";

/** Topo e rodapé compartilhados pelas páginas públicas do blog. */
export function CabecalhoBlog() {
  return (
    <header className="lp-topo">
      <div className="container lp-topo-linha">
        <Link href="/" className="logo">
          Licita<span>plus</span>
        </Link>
        <nav className="lp-nav">
          <Link href="/blog">Blog</Link>
          <Link href="/login">Entrar</Link>
          <Link href="/login" className="botao">
            Teste grátis
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function RodapeBlog() {
  return (
    <footer className="lp-rodape">
      <div className="container lp-rodape-linha">
        <div>
          <Link href="/" className="logo">
            Licita<span>plus</span>
          </Link>
          <p className="texto-suave" style={{ marginTop: 6 }}>
            Licitações públicas sob medida para a sua empresa.
          </p>
        </div>
        <nav className="lp-rodape-nav">
          <Link href="/blog">Blog</Link>
          <Link href="/login">Entrar</Link>
          <Link href="/login">Criar conta</Link>
        </nav>
      </div>
      <div className="container lp-rodape-copy texto-suave">
        © {new Date().getFullYear()} Licitaplus
      </div>
    </footer>
  );
}
