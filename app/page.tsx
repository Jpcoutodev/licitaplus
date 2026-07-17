import Link from "next/link";

export default function PaginaInicial() {
  return (
    <>
      <header className="topo">
        <div className="container topo-linha">
          <Link href="/" className="logo">
            Licita<span>plus</span>
          </Link>
          <nav style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Link href="/login" className="botao botao-secundario">
              Entrar
            </Link>
            <Link href="/login" className="botao">
              Criar conta
            </Link>
          </nav>
        </div>
      </header>

      <main className="container">
        <section className="hero">
          <h1>
            Licitações públicas sob medida
            <br />
            para a sua empresa
          </h1>
          <p>
            O Licitaplus monitora o Portal Nacional de Contratações Públicas
            (PNCP) e envia por email as oportunidades que combinam com o que a
            sua empresa vende — com resumo em linguagem simples, valor e prazo.
          </p>
          <Link href="/login" className="botao">
            Começar gratuitamente
          </Link>
        </section>

        <section className="grade-3">
          <div className="cartao">
            <h3>1. Monte seu perfil</h3>
            <p className="texto-suave">
              Diga o que você vende (palavras-chave), em quais estados atua e
              as modalidades de licitação que interessam.
            </p>
          </div>
          <div className="cartao">
            <h3>2. Nós vigiamos o PNCP</h3>
            <p className="texto-suave">
              O sistema consulta o portal oficial várias vezes ao dia e cruza
              cada nova licitação com o seu perfil.
            </p>
          </div>
          <div className="cartao">
            <h3>3. Você recebe o alerta</h3>
            <p className="texto-suave">
              Chega um email com resumo claro, e a análise com IA ajuda a
              decidir se vale a pena participar.
            </p>
          </div>
        </section>
      </main>
    </>
  );
}
