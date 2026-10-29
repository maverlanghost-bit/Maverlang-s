import type { MetadataRoute } from "next";
import { siteOrigin } from "@/config/site";
import { listPublicAssets } from "@/lib/seo/public-catalog";

/** Marketing indexable. Los legales en borrador quedan fuera hasta el visto bueno. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = siteOrigin();
  const assets = await listPublicAssets();
  const latest = assets.reduce<string | undefined>((max, asset) => {
    if (!max || asset.updatedAt > max) return asset.updatedAt;
    return max;
  }, undefined);

  const fichas: MetadataRoute.Sitemap = assets.map((asset) => ({
    url: `${origin}/acciones/${asset.slug}`,
    lastModified: asset.updatedAt,
    changeFrequency: "weekly",
    priority: 0.5,
  }));

  return [
    { url: `${origin}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${origin}/acciones`, changeFrequency: "daily", priority: 0.8, lastModified: latest },
    { url: `${origin}/ayuda`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${origin}/como-funciona`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${origin}/costos`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${origin}/seguridad`, changeFrequency: "monthly", priority: 0.6 },
    ...fichas,
  ];
}
