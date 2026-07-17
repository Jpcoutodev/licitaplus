import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Licitaplus — alertas de licitações do PNCP",
  description:
    "Receba por email as licitações públicas compatíveis com a sua empresa, com resumo em linguagem simples.",
};

export default function LayoutRaiz({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>
        <header className="cabecalho">
          <div className="container">
            <Link href="/" className="logo">
              Licitaplus
            </Link>
            <nav className="nav">
              <Link href="/painel">Painel</Link>
              <Link href="/login">Entrar</Link>
            </nav>
          </div>
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
