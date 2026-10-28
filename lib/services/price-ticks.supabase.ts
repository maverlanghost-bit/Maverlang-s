import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { searchCatalog } from "@/lib/catalog/assets";
import { safeJobError } from "@/lib/market/cron-safe";
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

export interface PriceTickWriteResult {
  saved: number;
  error: string | null;
}

/**
 * Ventanas de cada rango en ms. El front pide un rango; acá se traduce al
 * desde-cuándo para no traer toda la tabla.
 */
const RANGE_MS: Record<Range, number> = {
  "1D": 2 * 24 * 60 * 60 * 1000,
  "1W": 7 * 24 * 60 * 60 * 1000,
  "1M": 31 * 24 * 60 * 60 * 1000,
  "3M": 92 * 24 * 60 * 60 * 1000,
  "1Y": 366 * 24 * 60 * 60 * 1000,
  ALL: 366 * 4 * 24 * 60 * 60 * 1000,
};

const WRITE_CHUNK = 400;
const HISTORY_WORKERS = 8;
const CATALOG_PAGE = 50;
const CATALOG_MAX_PAGES = 40;

function toRow(tick: PriceTick): { symbol: string; t: string; price_usd: number; source: TickSource } {
  return {
    symbol: tick.symbol,
    t: new Date(tick.t).toISOString(),
    price_usd: tick.priceUsd,
    source: tick.source,
  };
}

/**
 * Crea el cliente admin. Si falta la secret, devuelve el código
 * `missing_supabase_secret` sin intentar escribir.
 */
export async function assertPriceTicksWritable(): Promise<string | null> {
  try {
    createSupabaseAdminClient();
    return null;
  } catch (error) {
    return safeJobError(error);
  }
}

/** Upsert idempotente. `saved` cuenta filas enviadas: el conteo de PostgREST a veces vuelve null. */
export async function writePriceTicks(ticks: readonly PriceTick[]): Promise<PriceTickWriteResult> {
  if (ticks.length === 0) return { saved: 0, error: null };
  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch (error) {
    return { saved: 0, error: safeJobError(error) };
  }
  let saved = 0;
  for (let index = 0; index < ticks.length; index += WRITE_CHUNK) {
    const payload = ticks.slice(index, index + WRITE_CHUNK).map(toRow);
    const { error } = await admin
      .from("price_ticks")
      .upsert(payload, { onConflict: "symbol,t,source", ignoreDuplicates: true });
    if (error) return { saved, error: safeJobError(error) };
    saved += payload.length;
  }
  return { saved, error: null };
}

/** Guarda observaciones del spot. Idempotente por (symbol, t, source). */
export async function recordTicks(ticks: readonly PriceTick[]): Promise<number> {
  const written = await writePriceTicks(ticks);
  return written.error ? 0 : written.saved;
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

/**
 * De los símbolos pedidos, cuáles ya tienen al menos una fila de esa fuente.
 * Una consulta por símbolo (la tabla no se puede barrer: PostgREST corta en
 * 1000 filas y un backfill de un año no cabe).
 */
export async function symbolsWithHistory(
  source: TickSource,
  symbols: readonly string[] = [],
): Promise<Set<string>> {
  if (symbols.length === 0) return new Set();
  const admin = createSupabaseAdminClient();
  const found = new Set<string>();
  let next = 0;
  const workers = Math.min(HISTORY_WORKERS, symbols.length);
  async function worker(): Promise<void> {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= symbols.length) return;
      const symbol = symbols[index] ?? "";
      if (!symbol) continue;
      const { data, error } = await admin
        .from("price_ticks")
        .select("symbol")
        .eq("symbol", symbol)
        .eq("source", source)
        .limit(1);
      if (error) throw new Error(safeJobError(error));
      if (Array.isArray(data) && data.length > 0) found.add(symbol);
    }
  }
  await Promise.all(Array.from({ length: workers }, () => worker()));
  return found;
}

/**
 * Activos que el mercado muestra hoy (alcance de `CATALOG_SCOPE`, una ficha
 * por empresa). El mint puede venir vacío: CoinGecko igual historializa por
 * símbolo. Orden estable por símbolo.
 */
export async function listVisiblePriceAssets(): Promise<{ symbol: string; mint: string }[]> {
  const seen = new Set<string>();
  const out: { symbol: string; mint: string }[] = [];
  for (let page = 1; page <= CATALOG_MAX_PAGES; page += 1) {
    const result = await searchCatalog({ page, pageSize: CATALOG_PAGE, sort: "name" });
    for (const asset of result.items) {
      if (seen.has(asset.symbol)) continue;
      seen.add(asset.symbol);
      out.push({ symbol: asset.symbol, mint: asset.mint });
    }
    if (!result.hasMore) break;
  }
  out.sort((a, b) => (a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0));
  return out;
}
