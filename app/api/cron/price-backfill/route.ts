import { timingSafeEqual } from "node:crypto";

import { handle } from "@/lib/api/handler";
import { DomainError } from "@/lib/api/result";
import { serverEnv } from "@/lib/env";
import { fetchCoinGeckoHistory, resolveCoinGeckoIdMap } from "@/lib/market/coingecko-history";
import { getServices } from "@/lib/services";
import { symbolsWithHistory, upsertTicks } from "@/lib/services/price-ticks.supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Backfill de historia REAL (gráficos). Vercel lo llama a diario
 * (`Authorization: Bearer *** — ver `vercel.json`). Sin token → 401.
 * Sin `CRON_SECRET` → 503 "cron deshabilitado".
 *
 * Trae 365 días de precios reales de CoinGecko para los símbolos operables que
 * todavía no tienen historia, y los guarda en `price_ticks` (source
 * `coingecko`). El grabador de ticks (cada 5 min) cubre el presente; este
 * cubre el pasado para que el gráfico no arranque vacío.
 *
 * Respetuoso con el rate limit de CoinGecko: por corrida sólo toma símbolos
 * pendientes (hasta un lote) y nunca reintenta uno ya backfilleado.
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

const BATCH = 25;
const DAYS = 365;

export function GET(req: Request) {
  return handle("no-store", async () => {
    assertCronSecret(req);
    const services = getServices();
    // Símbolos operables: los que el mercado ya cotiza.
    const quotes = await services.prices.list([]).catch(() => []);
    const candidates = quotes.map((quote) => quote.symbol);
    const done = await symbolsWithHistory("coingecko").catch(() => new Set<string>());
    const pending = candidates.filter((symbol) => !done.has(symbol)).slice(0, BATCH);
    // El mapa símbolo→id se resuelve una vez y se reutiliza (no gastar rate limit).
    const idMap = await resolveCoinGeckoIdMap({ apiKey: serverEnv.COINGECKO_API_KEY }).catch(
      () => new Map<string, string>(),
    );

    let backfilled = 0;
    for (const symbol of pending) {
      const result = await fetchCoinGeckoHistory(symbol, {
        days: DAYS,
        idMap,
        apiKey: serverEnv.COINGECKO_API_KEY,
      }).catch(() => null);
      if (!result || result.points.length < 2) continue;
      const ticks = result.points.map((point) => ({
        symbol,
        t: point.t,
        priceUsd: point.p,
        source: "coingecko" as const,
      }));
      const saved = await upsertTicks(ticks).catch(() => 0);
      if (saved > 0) backfilled += 1;
    }
    return { backfilled, pending: pending.length, remaining: Math.max(0, candidates.length - done.size - backfilled) };
  });
}
