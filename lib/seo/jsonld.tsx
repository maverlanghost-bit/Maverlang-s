import { site, siteOrigin } from "@/config/site";
import type { FaqEntry } from "@/lib/content/faq";
import { faqAnswerText } from "@/lib/seo/copy";
import { canonicalUrl } from "@/lib/seo/metadata";

/** JSON-LD. Escapa `<` para que el HTML no cierre el script. */
export function JsonLd({ data }: { data: unknown }) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}

/**
 * Organization + WebSite en un solo `@graph` para la portada.
 * `sameAs` se omite: no hay perfiles oficiales en el repo y no se inventan.
 * Sin `SearchAction`: `/acciones` todavía no acepta `?q=`.
 */
export function organizationJsonLd() {
  const origin = siteOrigin();
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": `${origin}/#organization`,
        name: site.name,
        url: `${origin}/`,
        logo: `${origin}/brand/maverlang-logo.png`,
        description: site.description,
        areaServed: "CL",
      },
      {
        "@type": "WebSite",
        "@id": `${origin}/#website`,
        name: site.name,
        url: `${origin}/`,
        inLanguage: "es-CL",
        publisher: { "@id": `${origin}/#organization` },
      },
    ],
  };
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: canonicalUrl(item.path),
    })),
  };
}

export function faqPageJsonLd(entries: readonly FaqEntry[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    inLanguage: "es-CL",
    mainEntity: entries.map((entry) => ({
      "@type": "Question",
      name: entry.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faqAnswerText(entry),
      },
    })),
  };
}

/** Sin Offer ni AggregateRating: el precio se mueve y no es una oferta. */
export function financialProductJsonLd(asset: {
  name: string;
  ticker: string;
  slug: string;
  description: string;
  etf: boolean;
}) {
  const origin = siteOrigin();
  return {
    "@context": "https://schema.org",
    "@type": "FinancialProduct",
    name: `${asset.name} (${asset.ticker})`,
    identifier: asset.ticker,
    description: asset.description,
    category: asset.etf ? "ETF tokenizado" : "Acción tokenizada",
    url: canonicalUrl(`/acciones/${asset.slug}`),
    inLanguage: "es-CL",
    /** Emisor del token, tal como se muestra en la ficha. */
    brand: {
      "@type": "Brand",
      name: "Backed Finance (xStocks)",
    },
    /** Costos publicados en /costos; sin cifras inventadas en el JSON-LD. */
    feesAndCommissionsSpecification: canonicalUrl("/costos"),
    provider: {
      "@type": "Organization",
      name: site.name,
      url: `${origin}/`,
    },
  };
}
