import type { MetadataRoute } from "next";
import { siteOrigin } from "@/config/site";
import { listPublicAssets } from "@/lib/seo/public-catalog";

/**
 * Marketing indexable. Los legales en borrador quedan fuera hasta el visto bueno.
 * Sin `lastModified`: `listPublicAssets()` rellena con la fecha del snapshot
 * (2026-10-07) cuando el activo no trae una propia, así que no se publica una
 * fecha repetida que parezca real.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = siteOrigin();
  const assets = await listPublicAssets();

  const fichas: MetadataRoute.Sitemap = assets.map((asset) => ({
    url: `${origin}/acciones/${asset.slug}`,
    changeFrequency: "weekly",
    priority: 0.5,
  }));

  return [
    { url: `${origin}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${origin}/acciones`, changeFrequency: "daily", priority: 0.8 },
    { url: `${origin}/ayuda`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${origin}/como-funciona`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${origin}/costos`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${origin}/seguridad`, changeFrequency: "monthly", priority: 0.6 },
    ...fichas,
  ];
}
