import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

const urlSite = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sentinelagov.com";

export const metadata: Metadata = {
  metadataBase: new URL(urlSite),
  title: {
    default: "SentinelaGov — as licitações certas para a sua empresa, por email",
    template: "%s · SentinelaGov",
  },
  description:
    "O SentinelaGov encontra as licitações públicas compatíveis com o que a sua empresa vende, resume em linguagem simples e ajuda a decidir com IA. Teste grátis por 14 dias, sem cartão.",
  applicationName: "SentinelaGov",
  keywords: [
    "monitoramento de licitações",
    "alertas de licitações por email",
    "encontrar licitações para empresa",
    "software de licitações",
    "licitações para MEI e PME",
    "como vender para o governo",
    "oportunidades de licitação",
  ],
  authors: [{ name: "SentinelaGov" }],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    url: urlSite,
    siteName: "SentinelaGov",
    title: "SentinelaGov — as licitações certas para a sua empresa, por email",
    description:
      "Encontre oportunidades de vender para o governo sem esforço: alertas por email, resumo em linguagem simples e análise com IA. 14 dias grátis.",
  },
  twitter: {
    card: "summary_large_image",
    title: "SentinelaGov — licitações sob medida para a sua empresa",
    description:
      "Alertas de licitações por email, resumo simples e análise com IA. Teste grátis por 14 dias.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
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
