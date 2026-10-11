import { timingSafeEqual } from "node:crypto";

import { handle } from "@/lib/api/handler";
import { DomainError } from "@/lib/api/result";
import { getServices } from "@/lib/services";
import { recordTicks } from "@/lib/services/price-ticks.supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Grabador de historial real (gráficos). Vercel lo llama cada ~5 min
 * (`Authorization: Bearer *** — ver `vercel.json`). Sin token → 401.
 * Sin `CRON_SECRET` → 503 "cron deshabilitado".
 *
 * Toma el spot que la app YA consulta de Jupiter para todo el catálogo
 * operable y lo persiste en `price_ticks`. Así el historial crece solo con
 * datos reales (no random walk) y los gráficos dejan de ser ilustrativos.
 *
 * Sólo guarda cotizaciones vivas de Jupiter (`source==="jupiter"`, sin
 * `reference`): una ancla mock no es una observación real. Fallos de red o de
 * base devuelven lo que se pudo; nunca rompen.
 */
function assertCronSecret(req: Request): void {
  const expected = (process.env.CRON_SECRET ?? "").trim();
  if (!expected) throw new DomainError("REAL_DISABLED", "Cron deshabilitado.");
  const header = req.headers.get("authorization")?.trim() ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || a.length === 0 || !timingSafeEqual(a, b)) {
    throw new DomainError("UNAUTHORIZED");
  }
}

export function GET(req: Request) {
  return handle("no-store", async () => {
    assertCronSecret(req);
    const services = getServices();
    // [] = todo el catálogo operable (el batcher ya trocea en lotes de 50).
    const quotes = await services.prices.list([]).catch(() => []);
    const now = Date.now();
    // Un mismo instante para todo el lote: la clave es (symbol, t, source).
    const tickAt = Math.floor(now / 60_000) * 60_000;
    const ticks = quotes
      .filter((quote) => quote.source === "jupiter" && quote.reference !== true && quote.priceUsd > 0)
      .map((quote) => ({ symbol: quote.symbol, t: tickAt, priceUsd: quote.priceUsd, source: "jupiter" as const }));
    const recorded = await recordTicks(ticks).catch(() => 0);
    return { recorded, candidates: quotes.length };
  });
}
