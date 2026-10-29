import type { Metadata } from "next";
import { site, siteOrigin } from "@/config/site";

/** Primera palabra de la marca. El title de la portada cabe en ~60 caracteres. */
export function brandShort(): string {
  const first = site.name.trim().split(/\s+/)[0];
  return first || site.name;
}

/** URL absoluta, sin query. La portada conserva la barra final. */
export function canonicalUrl(path: string): string {
  const origin = siteOrigin();
  if (path === "/" || path === "") return `${origin}/`;
  const clean = (path.startsWith("/") ? path : `/${path}`).split("?")[0] ?? "/";
  return `${origin}${clean}`;
}

/**
 * Title, description, canonical, Open Graph y Twitter de una página.
 * El layout raíz no fija `og:url`: cada página pone la suya.
 */
export function pageMetadata(input: {
  title: string;
  description: string;
  path: string;
  /** El title ya es la etiqueta completa: no usa la plantilla `%s · marca`. */
  absolute?: boolean;
  index?: boolean;
  follow?: boolean;
}): Metadata {
  const canonical = canonicalUrl(input.path);
  const socialTitle = input.absolute ? input.title : `${input.title} · ${site.name}`;
  const metadata: Metadata = {
    title: input.absolute ? { absolute: input.title } : input.title,
    description: input.description,
    alternates: { canonical },
    openGraph: {
      type: "website",
      locale: "es_CL",
      url: canonical,
      siteName: site.name,
      title: socialTitle,
      description: input.description,
    },
    twitter: {
      card: "summary_large_image",
      title: socialTitle,
      description: input.description,
    },
  };
  if (input.index === false || input.follow === false) {
    metadata.robots = {
      index: input.index !== false,
      follow: input.follow !== false,
    };
  }
  return metadata;
}
