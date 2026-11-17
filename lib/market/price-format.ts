import { pricePrecision } from "@/lib/charts/data";
import type { Currency } from "@/lib/types";

/** Unit prices retain significant digits even when a token is very cheap. */
export function formatUnitPrice(value: number, currency: Currency, locale = "es-CL"): string {
  const decimals = pricePrecision(value, currency);
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: currency === "CLP" && Math.abs(value) >= 10 ? 0 : 2,
    maximumFractionDigits: decimals,
    notation: value !== 0 && Math.abs(value) < 1e-12 ? "scientific" : "standard",
  }).format(value);
}
