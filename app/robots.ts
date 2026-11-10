import type { MetadataRoute } from "next";
import { siteOrigin } from "@/config/site";

/**
 * `/app` no se bloquea: `app/(platform)/app/layout.tsx` fija
 * `robots: { index: false, follow: false }` y las páginas que lo necesitan lo
 * repiten; Google tiene que poder entrar para ver ese `noindex`.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api", "/dev", "/bloqueado", "/admin"],
    },
    sitemap: `${siteOrigin()}/sitemap.xml`,
  };
}
