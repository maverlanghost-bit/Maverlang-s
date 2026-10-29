import { searchCatalog } from "@/lib/catalog/assets";
import { handle, readOutput } from "@/lib/api/handler";
import { yahooSymbol } from "@/lib/market/underlying-move";
import {
  loadTodayBoard,
  todayBoardSchema,
  type OfferedName,
  type TodayBoard,
} from "@/lib/market/movers";
import { priceHistory } from "@/lib/mocks/prices";
import { readHistory } from "@/lib/services/price-ticks.supabase";
import { readUnderlyingCloses } from "@/lib/services/underlying-prices.supabase";
import { withRateLimit } from "@/lib/security/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Listas del día entre las fichas que el mercado ofrece.
 * La variación sale de `price_ticks` y, si no alcanzan, de `underlying_prices`.
 * CDN 60 s (`handle("short")`). En memoria, el mismo minuto no vuelve a barrer.
 * Sin la secret de Supabase (demo, CI) se usa la serie de referencia del mock.
 */

const FRESH_MS = 60_000;
const STALE_MS = 15 * 60_000;
const PAGE_SIZE = 50;
const MAX_PAGES = 20;

let memo: { at: number; board: TodayBoard } | null = null;
let pending: Promise<TodayBoard> | null = null;
let storeDown: Promise<boolean> | null = null;

function missingStore(error: unknown): boolean {
  return error instanceof Error && error.message.includes("Falta la configuración");
}

function ticksAreDown(): Promise<boolean> {
  storeDown ??= readHistory("SPYx", "1D").then(
    () => false,
    (error: unknown) => missingStore(error),
  );
  return storeDown;
}

async function listOffered(): Promise<OfferedName[]> {
  const out: OfferedName[] = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const result = await searchCatalog({ q: "", page, pageSize: PAGE_SIZE, sort: "name" });
    for (const asset of result.items) {
      out.push({
        symbol: asset.symbol,
        name: asset.name,
        logoUrl: asset.logoLocal,
        underlying: asset.underlying,
        liquidityUsd: asset.liquidityUsd,
      });
    }
    if (!result.hasMore) break;
  }
  return out;
}

async function readTicks(symbol: string): Promise<{ t: number; p: number }[]> {
  if (await ticksAreDown()) return priceHistory(symbol, "1D");
  try {
    return await readHistory(symbol, "1D");
  } catch (error) {
    if (missingStore(error)) return priceHistory(symbol, "1D");
    return [];
  }
}

async function readCloses(underlying: string): Promise<{ t: number; p: number }[]> {
  if (await ticksAreDown()) return [];
  const key = yahooSymbol(underlying);
  if (!key) return [];
  try {
    return await readUnderlyingCloses(key, "1W");
  } catch {
    return [];
  }
}

async function boardNow(): Promise<TodayBoard> {
  const now = Date.now();
  if (memo && now - memo.at < FRESH_MS) return memo.board;
  // Barrer las 446 fichas tarda segundos: si hay un tablero reciente se entrega al tiro y se refresca detras.
  if (memo && now - memo.at < STALE_MS) {
    if (!pending) void refresh(now).catch(() => undefined);
    return memo.board;
  }
  return refresh(now);
}

function refresh(now: number): Promise<TodayBoard> {
  if (pending) return pending;
  pending = loadTodayBoard({
    listOffered,
    readTicks,
    readCloses,
    now,
    concurrency: 24,
  })
    .then((board) => {
      const hasRows = board.gainers.length + board.losers.length + board.viewed.length > 0 || board.spy !== null;
      if (hasRows) memo = { at: Date.now(), board };
      return board;
    })
    .finally(() => {
      pending = null;
    });
  return pending;
}

export function GET(req: Request) {
  return handle("short", async () => {
    const ipLimited = await withRateLimit(req, "prices");
    if (ipLimited) return ipLimited;
    return readOutput(todayBoardSchema, await boardNow());
  });
}
