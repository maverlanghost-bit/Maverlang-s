import type { MetadataRoute } from "next";
import { siteOrigin } from "@/config/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/app", "/api", "/dev", "/bloqueado", "/admin"],
    },
    sitemap: `${siteOrigin()}/sitemap.xml`,
  };
}
