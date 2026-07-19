import type { MetadataRoute } from "next";

const urlSite = process.env.NEXT_PUBLIC_SITE_URL ?? "https://licitaplus.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const agora = new Date();
  return [
    { url: urlSite, lastModified: agora, changeFrequency: "weekly", priority: 1 },
    {
      url: `${urlSite}/login`,
      lastModified: agora,
      changeFrequency: "monthly",
      priority: 0.5,
    },
  ];
}
