import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ARTIGOS, obterArtigo, POSTS } from "@/lib/blog/posts";
import { CabecalhoBlog, RodapeBlog } from "../cabecalho";
import { Rastreio } from "../rastreio";

const urlSite = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sentinelagov.com.br";

export function generateStaticParams() {
  return ARTIGOS.map((a) => ({ slug: a.meta.slug }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  const artigo = obterArtigo(slug);
  if (!artigo) return {};
  const { meta } = artigo;
  const url = `${urlSite}/blog/${meta.slug}`;
  return {
    title: meta.titulo,
    description: meta.descricao,
    keywords: meta.palavrasChave,
    alternates: { canonical: `/blog/${meta.slug}` },
    openGraph: {
      type: "article",
      url,
      title: meta.titulo,
      description: meta.descricao,
      publishedTime: meta.publicadoEm,
      modifiedTime: meta.atualizadoEm,
    },
  };
}

function formatarData(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export default async function PaginaArtigo(
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const artigo = obterArtigo(slug);
  if (!artigo) notFound();

  const { meta, faq, Corpo } = artigo;
  const url = `${urlSite}/blog/${meta.slug}`;
  const outros = POSTS.filter((p) => p.slug !== meta.slug).slice(0, 2);

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Início", item: urlSite },
          { "@type": "ListItem", position: 2, name: "Blog", item: `${urlSite}/blog` },
          { "@type": "ListItem", position: 3, name: meta.titulo, item: url },
        ],
      },
      {
        "@type": "Article",
        headline: meta.titulo,
        description: meta.descricao,
        datePublished: meta.publicadoEm,
        dateModified: meta.atualizadoEm,
        author: { "@type": "Organization", name: "SentinelaGov" },
        publisher: { "@type": "Organization", name: "SentinelaGov" },
        mainEntityOfPage: url,
        inLanguage: "pt-BR",
      },
      {
        "@type": "FAQPage",
        mainEntity: faq.map((item) => ({
          "@type": "Question",
          name: item.p,
          acceptedAnswer: { "@type": "Answer", text: item.r },
        })),
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Rastreio caminho={`/blog/${meta.slug}`} />
      <CabecalhoBlog />

      <main className="container">
        <article className="artigo">
          <nav className="artigo-trilha texto-suave" aria-label="Trilha">
            <Link href="/blog">Blog</Link> <span>›</span> {meta.categoria}
          </nav>
          <h1 className="artigo-titulo">{meta.titulo}</h1>
          <p className="artigo-meta texto-suave">
            Atualizado em {formatarData(meta.atualizadoEm)} · {meta.leituraMin}{" "}
            min de leitura
          </p>

          <div className="artigo-corpo">
            <Corpo />
          </div>
        </article>

        {outros.length > 0 && (
          <section className="artigo-relacionados">
            <h2>Continue lendo</h2>
            <div className="blog-lista">
              {outros.map((post) => (
                <article className="blog-card" key={post.slug}>
                  <Link href={`/blog/${post.slug}`} className="blog-card-link">
                    <span className="blog-card-cat">{post.categoria}</span>
                    <h3>{post.titulo}</h3>
                    <p className="texto-suave">{post.resumo}</p>
                  </Link>
                </article>
              ))}
            </div>
          </section>
        )}
      </main>
      <RodapeBlog />
    </>
  );
}
