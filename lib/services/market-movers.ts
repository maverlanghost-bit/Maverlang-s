import "server-only";

import { searchCatalog } from "@/lib/catalog/assets";
import { loadTodayBoard, type MoverHistory, type OfferedName, type TodayBoard } from "@/lib/market/movers";
import { yahooSymbol } from "@/lib/market/underlying-move";
import { priceHistory } from "@/lib/mocks/prices";
import { readHistoryWithMetadata } from "@/lib/services/price-ticks.supabase";
import { readUnderlyingHistory } from "@/lib/services/underlying-prices.supabase";

const PAGE_SIZE = 40;
const MAX_PAGES = 1;

function missingStore(error: unknown): boolean {
  return error instanceof Error && error.message.includes("Falta la configuración");
}

/** El proveedor conserva el mismo sondeo inicial y los mismos límites que la ruta original. */
export function createMarketMoversService() {
  let storeDown: Promise<boolean> | null = null;
  function ticksAreDown(): Promise<boolean> {
    storeDown ??= readHistoryWithMetadata("SPYx", "1D").then(
      () => false,
      (error: unknown) => missingStore(error),
    );
    return storeDown;
  }

  async function listOffered(): Promise<OfferedName[]> {
    const out: OfferedName[] = [];
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const result = await searchCatalog({ q: "", page, pageSize: PAGE_SIZE, sort: "liquidity" });
      for (const asset of result.items) {
        out.push({ symbol: asset.symbol, name: asset.name, logoUrl: asset.logoLocal,
          underlying: asset.underlying, liquidityUsd: asset.liquidityUsd });
      }
      if (!result.hasMore) break;
    }
    return out;
  }

  async function readTicks(symbol: string): Promise<MoverHistory> {
    const mock = (): MoverHistory => ({ points: priceHistory(symbol, "1D"), source: "mock" });
    if (await ticksAreDown()) return mock();
    try {
      return { ...await readHistoryWithMetadata(symbol, "1D"), source: "ticks" };
    } catch (error) {
      return missingStore(error) ? mock() : { points: [], source: "ticks" };
    }
  }

  async function readCloses(underlying: string): Promise<MoverHistory> {
    const empty = (): MoverHistory => ({ points: [], source: "closes" });
    if (await ticksAreDown()) return empty();
    const key = yahooSymbol(underlying);
    if (!key) return empty();
    try {
      return { ...await readUnderlyingHistory(key, "1M"), source: "closes" };
    } catch {
      return empty();
    }
  }

  return {
    today(now = Date.now()): Promise<TodayBoard> {
      return loadTodayBoard({ listOffered, readTicks, readCloses, now, concurrency: 32 });
    },
  };
}

export const marketMovers = createMarketMoversService();
