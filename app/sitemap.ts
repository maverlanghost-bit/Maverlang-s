import type { MetadataRoute } from "next";
import { siteOrigin } from "@/config/site";
import { getLegalDocument, LEGAL_SLUGS } from "@/lib/content/legal";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = siteOrigin();
  const legal = await Promise.all(LEGAL_SLUGS.map((slug) => getLegalDocument(slug)));

  return [
    { url: `${origin}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${origin}/ayuda`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${origin}/como-funciona`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${origin}/costos`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${origin}/seguridad`, changeFrequency: "monthly", priority: 0.6 },
    ...legal.flatMap((doc) =>
      doc
        ? [
            {
              url: `${origin}/legal/${doc.slug}`,
              lastModified: doc.updated,
              changeFrequency: "yearly" as const,
              priority: 0.4,
            },
          ]
        : [],
    ),
  ];
}
