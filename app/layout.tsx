import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

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
      <body className={inter.className}>{children}</body>
    </html>
  );
}
