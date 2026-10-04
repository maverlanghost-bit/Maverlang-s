const brandName =
  process.env.NEXT_PUBLIC_BRAND_NAME?.trim() || "Maverlang Stocks";
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000";
const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "";

export const site = {
  name: brandName,
  url: siteUrl,
  supportEmail,
} as const;
