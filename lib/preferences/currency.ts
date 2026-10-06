import type { Currency } from "@/lib/types";

/** Moneda única de visualización (M40). Visitante → localStorage + cookie; sesión → DB. */
export const DISPLAY_CURRENCY_KEY = "mv_currency";
export const DISPLAY_CURRENCY_COOKIE = "mv_currency";
export const DISPLAY_CURRENCY_MAX_AGE = 31536000; // 1 año

export function isDisplayCurrency(value: unknown): value is Currency {
  return value === "CLP" || value === "USD";
}

/**
 * Regla de resolución (pura, testeable):
 * sesión (prefs de la DB) > local (visitante) > CLP por defecto.
 */
export function resolveDisplayCurrency(input: {
  prefs?: Currency | null;
  stored?: Currency | null | string;
}): Currency {
  if (input.prefs === "CLP" || input.prefs === "USD") return input.prefs;
  if (input.stored === "CLP" || input.stored === "USD") return input.stored;
  return "CLP";
}

export function serializeCurrencyCookie(currency: Currency): string {
  return `${DISPLAY_CURRENCY_COOKIE}=${currency}; path=/; max-age=${DISPLAY_CURRENCY_MAX_AGE}; SameSite=Lax`;
}

/** Lee localStorage sin romper en SSR. Null si no hay nada válido. */
export function readStoredCurrency(): Currency | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    const raw = window.localStorage.getItem(DISPLAY_CURRENCY_KEY)?.trim() ?? "";
    return isDisplayCurrency(raw) ? raw : null;
  } catch {
    return null;
  }
}

/** Guarda en localStorage y en la cookie `mv_currency` para el servidor futuro (M42). */
export function writeStoredCurrency(currency: Currency): void {
  try {
    window.localStorage.setItem(DISPLAY_CURRENCY_KEY, currency);
  } catch {
    // Sin almacenamiento: la UI igual cambia en memoria.
  }
  try {
    document.cookie = serializeCurrencyCookie(currency);
  } catch {
    // Sin cookies: no bloquea el cambio.
  }
}
