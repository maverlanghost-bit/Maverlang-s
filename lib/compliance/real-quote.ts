import "server-only";

import { evaluateAccess, GEO_BLOCKED_MESSAGE, isOperationBlocked } from "@/config/compliance";

/**
 * Decisión de una cotización real según la IP.
 * Las rutas de operar llaman `apiOperateBlock` (SEC-02) antes de cualquier
 * trabajo. Esta función queda para la matriz de un solo país.
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

function extraBlockedFromEnv(): string[] {
  const raw = process.env.GEO_BLOCKED_COUNTRIES;
  if (typeof raw !== "string" || raw.trim() === "") return [];
  return raw.split(",");
}

/**
 * Geobloqueo de operar (SEC-02). `null` si la IP puede operar.
 * Si no, 403 `GEO_BLOCKED` sin tocar Jupiter ni el cuerpo.
 * Sin header (local) `evaluateAccess` deja pasar.
 */
export function apiOperateBlock(req: Request): Response | null {
  const decision = evaluateAccess({
    ipCountry: req.headers.get("x-vercel-ip-country"),
    ipRegion: req.headers.get("x-vercel-ip-country-region"),
    extraBlocked: extraBlockedFromEnv(),
  });
  if (decision.operate) return null;
  return Response.json(
    { ok: false, error: { code: "GEO_BLOCKED", message: GEO_BLOCKED_MESSAGE } },
    {
      status: 403,
      headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" },
    },
  );
}
