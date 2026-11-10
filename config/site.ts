const brandName =
  process.env.NEXT_PUBLIC_BRAND_NAME?.trim() || "Maverlang Stocks";

/** Dominio oficial del producto (sin www). Sólo se usa como respaldo. */
const PRODUCTION_SITE_URL = "https://maverlang.com";
const LOCAL_SITE_URL = "http://localhost:3000";

/**
 * Respaldo cuando `NEXT_PUBLIC_SITE_URL` falta o viene vacía: en producción
 * apunta al dominio oficial; en desarrollo y tests, a localhost.
 */
function fallbackSiteUrl(): string {
  return process.env.NODE_ENV === "production"
    ? PRODUCTION_SITE_URL
    : LOCAL_SITE_URL;
}

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || fallbackSiteUrl();
const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "";

export const site = {
  name: brandName,
  url: siteUrl,
  supportEmail,
  description:
    "Compra fracciones de acciones de EE.UU. tokenizadas, con órdenes que se ejecutan en dólares (US$).",
} as const;

/** Origen absoluto para metadata, sitemap y robots. Sin barra final. */
export function siteOrigin(): string {
  try {
    return new URL(site.url).origin;
  } catch {
    return fallbackSiteUrl();
  }
}

/** Correo de soporte sólo si parece una dirección. Vacío en el env de ejemplo. */
export function supportMailto(): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(site.supportEmail)) return null;
  return `mailto:${site.supportEmail}`;
}
