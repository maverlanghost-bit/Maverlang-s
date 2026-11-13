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

/**
 * FAQ de textos nuevos (fichas, guías) que no vienen de `content/faq`:
 * mismo `FAQPage` que `faqPageJsonLd`, sin el formato `FaqEntry`.
 */
export function simpleFaqJsonLd(items: readonly { question: string; answer: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    inLanguage: "es-CL",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}

/**
 * Artículo de una guía. `datePublished` y `dateModified` llegan de la fecha
 * real de la guía (no hay una de publicación separada en el repo).
 */
export function articleJsonLd(input: {
  title: string;
  description: string;
  path: string;
  datePublished: string;
  dateModified: string;
}) {
  const origin = siteOrigin();
  const url = canonicalUrl(input.path);
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: input.title,
    description: input.description,
    inLanguage: "es-CL",
    datePublished: input.datePublished,
    dateModified: input.dateModified,
    url,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    author: { "@type": "Organization", name: site.name, url: `${origin}/` },
    publisher: {
      "@type": "Organization",
      name: site.name,
      url: `${origin}/`,
      logo: {
        "@type": "ImageObject",
        url: `${origin}/brand/maverlang-logo.png`,
      },
    },
  };
}

/**
 * Lista de enlaces (índice de guías, categorías, comparador). El orden no se
 * declara como alfabético: las listas editoriales van curadas primero.
 */
export function itemListJsonLd(input: {
  name: string;
  path: string;
  items: readonly { name: string; path: string }[];
}) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: input.name,
    url: canonicalUrl(input.path),
    numberOfItems: input.items.length,
    itemListOrder: "https://schema.org/ItemListUnordered",
    itemListElement: input.items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: canonicalUrl(item.path),
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
