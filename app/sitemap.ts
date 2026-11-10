import type { MetadataRoute } from "next";
import { siteOrigin } from "@/config/site";
import { visibleGuides } from "@/lib/content/guias";
import {
  assetsInCategory,
  CATEGORIES,
  comparePath,
  COMPARE_PAIRS,
  MIN_CATEGORY_SIZE,
} from "@/lib/seo/categories";
import { companyProfile, COMPANY_SNAPSHOT_DATE } from "@/lib/seo/company-profile";
import { listPublicAssets, type PublicAsset } from "@/lib/seo/public-catalog";

/**
 * Marketing indexable. Los legales en borrador quedan fuera hasta el visto bueno.
 * Cada URL lleva `lastModified` real: fecha del contenido (git), fecha del
 * snapshot SEC o fecha de chequeo del activo. Si una ficha no tiene ninguna de
 * las dos, se omite: no se publica una fecha repetida que parezca real.
 */

/** Último cambio real de las páginas de marketing (git, 2026-11-10). */
const MARKETING_UPDATED = "2026-11-10";

/** Clave comparable de ticker: mayúsculas y sólo letras/números (BRK.B = BRK-B). */
function tickerKey(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = siteOrigin();
  const assets = await listPublicAssets();

  /** Fichas: fecha SEC si hay perfil; si no, la fecha real del activo; si no, sin lastModified (la URL sigue). */
  const fichas: MetadataRoute.Sitemap = [];
  for (const asset of assets) {
    const lastModified = companyProfile(asset.ticker) ? COMPANY_SNAPSHOT_DATE : asset.updatedAt;
    fichas.push({
      url: `${origin}/acciones/${asset.slug}`,
      ...(lastModified ? { lastModified } : {}),
      changeFrequency: "weekly",
      priority: 0.5,
    });
  }

  /** Guías publicadas: las de `legalReview` no entran ni con el flag de borradores. */
  const guides = visibleGuides().filter((guide) => !guide.legalReview);
  const guidesUpdated = guides.reduce<string | null>(
    (latest, guide) => (latest === null || guide.updatedAt > latest ? guide.updatedAt : latest),
    null,
  );

  /** Categorías con suficientes activos: las finas dan 404 y no se anuncian. */
  const categories = CATEGORIES.filter(
    (category) => assetsInCategory(category.slug, assets).length >= MIN_CATEGORY_SIZE,
  );

  /** Pares del comparador con ambos tickers en el catálogo visible. */
  const byTicker = new Map<string, PublicAsset>();
  for (const asset of assets) byTicker.set(tickerKey(asset.ticker), asset);
  const pairs: { a: PublicAsset; b: PublicAsset }[] = [];
  for (const [left, right] of COMPARE_PAIRS) {
    const a = byTicker.get(tickerKey(left));
    const b = byTicker.get(tickerKey(right));
    if (a && b) pairs.push({ a, b });
  }

  const entries: MetadataRoute.Sitemap = [
    { url: `${origin}/`, lastModified: MARKETING_UPDATED, changeFrequency: "weekly", priority: 1 },
    { url: `${origin}/acciones`, lastModified: MARKETING_UPDATED, changeFrequency: "daily", priority: 0.8 },
    { url: `${origin}/ayuda`, lastModified: MARKETING_UPDATED, changeFrequency: "monthly", priority: 0.6 },
    { url: `${origin}/como-funciona`, lastModified: MARKETING_UPDATED, changeFrequency: "monthly", priority: 0.6 },
    { url: `${origin}/costos`, lastModified: MARKETING_UPDATED, changeFrequency: "monthly", priority: 0.6 },
    { url: `${origin}/seguridad`, lastModified: MARKETING_UPDATED, changeFrequency: "monthly", priority: 0.6 },
  ];

  if (guidesUpdated) {
    entries.push({
      url: `${origin}/guias`,
      lastModified: guidesUpdated,
      changeFrequency: "monthly",
      priority: 0.6,
    });
  }
  for (const guide of guides) {
    entries.push({
      url: `${origin}/guias/${guide.slug}`,
      lastModified: guide.updatedAt,
      changeFrequency: "monthly",
      priority: 0.6,
    });
  }

  if (categories.length > 0) {
    entries.push({
      url: `${origin}/categorias`,
      lastModified: COMPANY_SNAPSHOT_DATE,
      changeFrequency: "weekly",
      priority: 0.6,
    });
  }
  for (const category of categories) {
    entries.push({
      url: `${origin}/categorias/${category.slug}`,
      lastModified: COMPANY_SNAPSHOT_DATE,
      changeFrequency: "weekly",
      priority: 0.6,
    });
  }

  if (pairs.length > 0) {
    entries.push({
      url: `${origin}/comparar`,
      lastModified: COMPANY_SNAPSHOT_DATE,
      changeFrequency: "monthly",
      priority: 0.5,
    });
  }
  for (const { a, b } of pairs) {
    entries.push({
      url: `${origin}${comparePath(a, b)}`,
      lastModified: COMPANY_SNAPSHOT_DATE,
      changeFrequency: "monthly",
      priority: 0.5,
    });
  }

  entries.push(...fichas);
  return entries;
}
