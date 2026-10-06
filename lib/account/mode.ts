import { readCookieValue } from "@/lib/auth/cookies";

/** Cookie del selector de cuenta. `demo` por defecto, para no parpadear. */
export const ACCOUNT_COOKIE = "mv_account";

export const ACCOUNT_MAX_AGE = 31536000; // 1 año

export type AccountMode = "demo" | "real";

/** Ausente o inválido -> demo (como hoy). */
export function parseAccountMode(value: unknown): AccountMode {
  return value === "real" ? "real" : "demo";
}

export function serializeAccountCookie(mode: AccountMode): string {
  return `${ACCOUNT_COOKIE}=${mode}; path=/; max-age=${ACCOUNT_MAX_AGE}; SameSite=Lax`;
}

/** Lee `mv_account` de una cabecera `cookie` (route handlers). Sin cabecera -> demo. */
export function accountModeFromHeader(header: string | null | undefined): AccountMode {
  return parseAccountMode(readCookieValue(header, ACCOUNT_COOKIE));
}

/** Lee `mv_account` de `document.cookie` (cliente). Sin cookie -> demo. */
export function accountModeFromDocumentCookie(header: string | null | undefined): AccountMode {
  return accountModeFromHeader(header);
}
