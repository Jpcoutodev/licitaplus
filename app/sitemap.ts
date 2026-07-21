import type { MetadataRoute } from "next";
import { POSTS } from "@/lib/blog/posts";

const urlSite = process.env.NEXT_PUBLIC_SITE_URL ?? "https://sentinelagov.com.br";

export default function sitemap(): MetadataRoute.Sitemap {
  const agora = new Date();
  const fixas: MetadataRoute.Sitemap = [
    { url: urlSite, lastModified: agora, changeFrequency: "weekly", priority: 1 },
    {
      url: `${urlSite}/blog`,
      lastModified: agora,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${urlSite}/login`,
      lastModified: agora,
      changeFrequency: "monthly",
      priority: 0.5,
    },
  ];

  const artigos: MetadataRoute.Sitemap = POSTS.map((post) => ({
    url: `${urlSite}/blog/${post.slug}`,
    lastModified: new Date(`${post.atualizadoEm}T12:00:00`),
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  return [...fixas, ...artigos];
}
