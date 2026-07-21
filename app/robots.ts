import type { MetadataRoute } from "next";

const urlSite = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sentinelagov.com.br";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Áreas autenticadas não devem ser indexadas.
      disallow: ["/painel", "/onboarding", "/auth"],
    },
    sitemap: `${urlSite}/sitemap.xml`,
  };
}
