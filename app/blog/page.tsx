import type { Metadata } from "next";
import Link from "next/link";
import { POSTS } from "@/lib/blog/posts";
import { CabecalhoBlog, RodapeBlog } from "./cabecalho";
import { Rastreio } from "./rastreio";

const urlSite = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sentinelagov.com.br";

export const metadata: Metadata = {
  title: "Blog — guias sobre licitações para empresas",
  description:
    "Guias práticos sobre como vender para o governo, participar de licitações e encontrar oportunidades. Conteúdo direto para pequenas e médias empresas.",
  alternates: { canonical: "/blog" },
  openGraph: {
    type: "website",
    url: `${urlSite}/blog`,
    title: "Blog do SentinelaGov — guias sobre licitações para empresas",
    description:
      "Como vender para o governo, participar de licitações e encontrar oportunidades. Conteúdo direto para PMEs.",
  },
};

function formatarData(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export default function IndiceBlog() {
  return (
    <>
      <Rastreio caminho="/blog" />
      <CabecalhoBlog />
      <main className="container blog-indice">
        <header className="blog-indice-topo">
          <h1>Blog do SentinelaGov</h1>
          <p className="texto-suave">
            Guias diretos para vender mais ao governo — sem juridiquês.
          </p>
        </header>

        <div className="blog-lista">
          {POSTS.map((post) => (
            <article className="blog-card" key={post.slug}>
              <Link href={`/blog/${post.slug}`} className="blog-card-link">
                <span className="blog-card-cat">{post.categoria}</span>
                <h2>{post.titulo}</h2>
                <p className="texto-suave">{post.resumo}</p>
                <span className="blog-card-meta texto-suave">
                  {formatarData(post.publicadoEm)} · {post.leituraMin} min de
                  leitura
                </span>
              </Link>
            </article>
          ))}
        </div>
      </main>
      <RodapeBlog />
    </>
  );
}
