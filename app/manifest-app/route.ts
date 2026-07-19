/**
 * Manifesto do PWA servido como rota própria e referenciado APENAS no layout
 * do /painel — assim o app instalável é o "sistema", e o blog/landing não
 * oferecem instalação.
 */
export function GET() {
  const manifest = {
    name: "Licitaplus",
    short_name: "Licitaplus",
    description:
      "As licitações certas para a sua empresa, com alertas e análise por IA.",
    start_url: "/painel",
    scope: "/painel",
    display: "standalone",
    background_color: "#0a1120",
    theme_color: "#0d1626",
    lang: "pt-BR",
    icons: [
      { src: "/icone-192", sizes: "192x192", type: "image/png" },
      { src: "/icone-512", sizes: "512x512", type: "image/png" },
      {
        src: "/icone-512",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };

  return new Response(JSON.stringify(manifest), {
    headers: { "Content-Type": "application/manifest+json" },
  });
}
