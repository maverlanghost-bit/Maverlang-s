import "server-only";

import { GEO_BLOCKED_MESSAGE, isOperationBlocked } from "@/config/compliance";

/**
 * Decisión de una cotización real según la IP.
 * M70 la conecta a `/api/trade/quote`. Hoy esas rutas responden 503 por M46
 * (`REAL_TRADING_READY` en false) y esta función no las toca.
 *
 * Una VPN puede mostrar un país permitido: no se detecta del todo.
 */
export function realQuoteGeoDecision(
  ipCountry: string | null,
  extra: readonly string[] = [],
): { ok: true } | { ok: false; code: "GEO_BLOCKED"; message: string } {
  if (isOperationBlocked(ipCountry, extra)) {
    return { ok: false, code: "GEO_BLOCKED", message: GEO_BLOCKED_MESSAGE };
  }
  return { ok: true };
}
