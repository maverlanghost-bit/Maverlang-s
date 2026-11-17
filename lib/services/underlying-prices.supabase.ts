import "server-only";
import { unstable_cache } from "next/cache";
import { shouldCacheUnderlyingPoints } from "@/lib/api/contracts";
import { fetchYahooChartHistory, type UnderlyingChartHistory } from "@/lib/market/underlying-move";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { PricePoint, Range } from "@/lib/types";

export const PRICES_TAG = "underlying-prices";
/** 1D sólo si los ticks no alcanzan. ALL pide ~10 años; PostgREST corta en 1000 filas. */
const DAYS: Record<Range, number> = { "1D": 5, "1W": 8, "1M": 32, "3M": 93, "1Y": 366, ALL: 3650 };
const PAGE = 1000;
/** ALL son varias páginas. Si la base no responde, no se sostiene la ficha. */
const CLOSE_BUDGET_MS = 2_500;
/** `unstable_cache` no persiste un throw. Un vacío o un fallo no quedan una hora. */
const MISS = "underlying-closes-miss";

interface StoredCloseRow { date: unknown; close: unknown; source?: unknown }

function toPoints(rows: readonly StoredCloseRow[]): PricePoint[] {
  // Cierre a las 16:00 de NY ≈ 20:00/21:00 UTC; se usa 20:00Z como marca del día.
  return rows
    .map((row) => ({ t: Date.parse(`${String(row.date)}T20:00:00Z`), p: Number(row.close) }))
    .filter((point) => Number.isFinite(point.t) && Number.isFinite(point.p) && point.p > 0);
}

function storedHistory(underlying: string, rows: readonly StoredCloseRow[]): UnderlyingChartHistory {
  return {
    points: toPoints(rows),
    metadata: {
      instrument: "underlying",
      provider: rows.length > 0 && rows.every((row) => row.source === "yahoo") ? "yahoo" : "unknown",
      providerSymbol: underlying,
      resolution: "1d",
      priceUnit: "usd_per_share",
      reference: true,
      // El cron guarda adjclose ?? close sin persistir cuál de los dos llegó.
      // No se combinan estos cierres ajustados con OHLC quote de otra lectura.
      priceAdjustment: "stored",
      capabilities: { ohlc: false, volume: false },
    },
  };
}

function missError(cause?: unknown): Error {
  const miss = new Error(MISS);
  miss.name = "UnderlyingClosesMiss";
  if (cause !== undefined) miss.cause = cause;
  return miss;
}

async function queryUnderlyingHistory(underlying: string, range: Range): Promise<UnderlyingChartHistory> {
  const admin = createSupabaseAdminClient();
  const from = new Date(Date.now() - DAYS[range] * 864e5).toISOString().slice(0, 10);
  const rows: StoredCloseRow[] = [];
  const started = Date.now();
  for (let offset = 0; offset < DAYS.ALL + PAGE; offset += PAGE) {
    const remaining = CLOSE_BUDGET_MS - (Date.now() - started);
    if (remaining <= 0) throw missError();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), remaining);
    try {
      const { data, error } = await admin
        .from("underlying_prices")
        .select("date,close,source")
        .eq("underlying", underlying)
        .gte("date", from)
        .order("date", { ascending: true })
        .range(offset, offset + PAGE - 1)
        .abortSignal(controller.signal);
      if (error) throw error;
      if (!data || data.length === 0) break;
      rows.push(...data as StoredCloseRow[]);
      if (data.length < PAGE) break;
    } catch (error) {
      if (isMiss(error)) throw error;
      throw missError(error);
    } finally {
      clearTimeout(timer);
    }
  }
  // La tabla la llena un cron y puede quedar días atrás: sin filas en la
  // ventana, el histórico sale del gráfico de Yahoo; si tampoco hay, de lo
  // último guardado (aunque sea viejo), para no devolver un vacío.
  const stored = storedHistory(underlying, rows);
  if (stored.points.length < 2) {
    const yahoo = await fetchYahooChartHistory(underlying, range, { timeoutMs: 2_000 });
    if (yahoo.points.length >= 2) return yahoo;
    const fallbackLimit = range === "1D" ? 5 : range === "1W" ? 7 : 30;
    const { data, error } = await admin
      .from("underlying_prices")
      .select("date,close,source")
      .eq("underlying", underlying)
      .order("date", { ascending: false })
      .limit(fallbackLimit);
    if (error) throw error;
    // Vienen de la más nueva a la más vieja; el gráfico las quiere al revés.
    return storedHistory(underlying, [...(data ?? []) as StoredCloseRow[]].reverse());
  }
  return stored;
}

function isMiss(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.message === MISS || error.name === "UnderlyingClosesMiss") return true;
  return isMiss(error.cause);
}

const cachedUnderlyingHistory = unstable_cache(
  async (underlying: string, range: Range): Promise<UnderlyingChartHistory> => {
    const history = await queryUnderlyingHistory(underlying, range);
    if (!shouldCacheUnderlyingPoints(history.points.length)) {
      const miss = new Error(MISS);
      miss.name = "UnderlyingClosesMiss";
      throw miss;
    }
    return history;
  },
  // v4 conserva también metadatos; una entrada vieja {t,p} no declara capacidades.
  ["underlying-closes-v4"],
  { revalidate: 3600, tags: [PRICES_TAG] },
);

export async function readUnderlyingCloses(underlying: string, range: Range): Promise<PricePoint[]> {
  return (await readUnderlyingHistory(underlying, range)).points;
}

/** Lectura histórica con la procedencia de la rama que realmente entregó los puntos. */
export async function readUnderlyingHistory(underlying: string, range: Range): Promise<UnderlyingChartHistory> {
  try {
    return await cachedUnderlyingHistory(underlying, range);
  } catch (error) {
    if (isMiss(error)) return storedHistory(underlying, []);
    throw error;
  }
}
