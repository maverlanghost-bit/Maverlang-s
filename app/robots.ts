import type { MetadataRoute } from "next";
import { siteOrigin } from "@/config/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/app", "/api", "/dev", "/bloqueado"],
    },
    sitemap: `${siteOrigin()}/sitemap.xml`,
  };
}
