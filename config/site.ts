const brandName =
  process.env.NEXT_PUBLIC_BRAND_NAME?.trim() || "Maverlang Stocks";
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000";
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
    return "http://localhost:3000";
  }
}

/** Correo de soporte sólo si parece una dirección. Vacío en el env de ejemplo. */
export function supportMailto(): string | null {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(site.supportEmail)) return null;
  return `mailto:${site.supportEmail}`;
}
