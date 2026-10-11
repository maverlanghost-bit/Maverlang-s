import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { PricePoint, Range } from "@/lib/types";

/**
 * Acceso a datos de observaciones reales de precio (`price_ticks`). Vive en
 * `lib/services/*.supabase.ts` para que el cliente admin no salga de la lista
 * blanca (M57): la lógica de negocio (`prices.live.ts`) usa estas funciones.
 * No corre desde un componente cliente.
 *
 * Alimentan esta tabla dos caminos:
 *   - `recordTicks`  : el grabador periódico (cron) con el spot de Jupiter.
 *   - `upsertTicks`  : el backfill histórico de CoinGecko.
 * `readHistory` lee lo acumulado para los gráficos (ya no hay random walk).
 */

export type TickSource = "jupiter" | "coingecko";

export interface PriceTick {
  symbol: string;
  t: number; // epoch ms (UTC)
  priceUsd: number;
  source: TickSource;
}

/**
 * Ventanas de cada rango en ms. El front pide un rango; acá se traduce al
 * desde-cuándo para no traer toda la tabla.
 */
const RANGE_MS: Record<Range, number> = {
  "1W": 7 * 24 * 60 * 60 * 1000,
  "1M": 31 * 24 * 60 * 60 * 1000,
  "3M": 92 * 24 * 60 * 60 * 1000,
  "1Y": 366 * 24 * 60 * 60 * 1000,
  ALL: 366 * 4 * 24 * 60 * 60 * 1000,
};

/** Guarda observaciones del spot. Idempotente por (symbol, t, source). */
export async function recordTicks(ticks: readonly PriceTick[]): Promise<number> {
  if (ticks.length === 0) return 0;
  const admin = createSupabaseAdminClient();
  const payload = ticks.map((tick) => ({
    symbol: tick.symbol,
    t: new Date(tick.t).toISOString(),
    price_usd: tick.priceUsd,
    source: tick.source,
  }));
  const { error } = await admin
    .from("price_ticks")
    .upsert(payload, { onConflict: "symbol,t,source", ignoreDuplicates: true });
  if (error) return 0;
  return payload.length;
}

/** Backfill histórico (p. ej. CoinGecko). Misma tabla, otra fuente. */
export async function upsertTicks(ticks: readonly PriceTick[]): Promise<number> {
  return recordTicks(ticks);
}

/**
 * Lee la historia real de un símbolo para un rango. Devuelve ordenado por
 * tiempo ascendente. Si el rango no tiene datos suficientes, devuelve lo que
 * haya (el gráfico pinta lo real disponible).
 */
export async function readHistory(
  symbol: string,
  range: Range,
  now = Date.now(),
): Promise<PricePoint[]> {
  const admin = createSupabaseAdminClient();
  const from = new Date(now - RANGE_MS[range]).toISOString();
  const { data, error } = await admin
    .from("price_ticks")
    .select("t,price_usd")
    .eq("symbol", symbol)
    .gte("t", from)
    .order("t", { ascending: true })
    .limit(5000);
  if (error || !data) return [];
  return (data as { t: string; price_usd: number }[])
    .map((row) => ({ t: Date.parse(row.t), p: Number(row.price_usd) }))
    .filter((point) => Number.isFinite(point.t) && Number.isFinite(point.p) && point.p > 0);
}

/** Símbolos con historia ya respaldada (evita re-backfillear en cada cron). */
export async function symbolsWithHistory(source: TickSource): Promise<Set<string>> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("price_ticks")
    .select("symbol")
    .eq("source", source);
  if (error || !data) return new Set();
  return new Set((data as { symbol: string }[]).map((row) => row.symbol));
}
