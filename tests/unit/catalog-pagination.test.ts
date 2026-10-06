import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { TICKERS } from "@/config/tickers";
import {
  __clearAssetsCacheForTests,
  findAssetBySymbol,
  searchCatalog,
} from "@/lib/catalog/assets";

const SUPABASE_URL = "https://ejemplo.supabase.co";
const SUPABASE_KEY = "clave-publica-de-prueba";

const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const previousKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = SUPABASE_KEY;

afterAll(() => {
  if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
  if (previousKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = previousKey;
});

function row(symbol: string, curated: boolean): Record<string, unknown> {
  return {
    symbol,
    name: `Empresa ${symbol}`,
    underlying: symbol.replace(/x$/i, ""),
    category: "tech",
    mint_solana: `mint-${symbol}`,
    logo_path: null,
    enabled: true,
    is_trading_halted: false,
    jupiter_liquidity_usd: 50_000,
    curated,
  };
}

/** 1171 filas: 1121 no curadas y las 50 curadas al final (incluye NFLXx). */
function bigTable(): Array<Record<string, unknown>> {
  const rows: Array<Record<string, unknown>> = [];
  for (let index = 0; index < 1121; index += 1) {
    rows.push(row(`U${String(index).padStart(4, "0")}x`, false));
  }
  rows.push(row("NFLXx", true));
  for (let index = 1; index < 50; index += 1) {
    rows.push(row(`C${String(index).padStart(4, "0")}x`, true));
  }
  return rows;
}

function pagedFetch(all: unknown[], seen: string[]) {
  return (async (input: string | URL) => {
    const url = String(input);
    seen.push(url);
    const parsed = new URL(url);
    const limit = Number(parsed.searchParams.get("limit") ?? "1000");
    const offset = Number(parsed.searchParams.get("offset") ?? "0");
    const slice = all.slice(offset, offset + limit);
    return new Response(JSON.stringify(slice), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  __clearAssetsCacheForTests();
});

describe("catálogo paginado (Supabase corta en 1000 filas)", () => {
  it("trae las 1171 filas en dos páginas y el alcance curado devuelve 50", async () => {
    const seen: string[] = [];
    const result = await searchCatalog(
      { pageSize: 50 },
      { fetchImpl: pagedFetch(bigTable(), seen), now: () => 1_000 },
    );
    expect(seen).toHaveLength(2);
    expect(result.total).toBe(50);
    expect(result.items).toHaveLength(50);
    expect(result.items.every((item) => item.curated)).toBe(true);
  });

  it("pide orden estable y la segunda página usa offset 1000", async () => {
    const seen: string[] = [];
    await searchCatalog(
      { pageSize: 50 },
      { fetchImpl: pagedFetch(bigTable(), seen), now: () => 2_000 },
    );
    expect(seen).toHaveLength(2);
    const first = new URL(seen[0]);
    const second = new URL(seen[1]);
    expect(first.searchParams.get("order")).toBe("curated.desc,symbol.asc");
    expect(first.searchParams.get("limit")).toBe("1000");
    expect(first.searchParams.get("offset")).toBe("0");
    expect(second.searchParams.get("order")).toBe("curated.desc,symbol.asc");
    expect(second.searchParams.get("offset")).toBe("1000");
  });

  it("sin filas curadas usa el fallback de config/tickers.ts", async () => {
    const seen: string[] = [];
    const rows = [row("AAA1x", false), row("BBB2x", false), row("CCC3x", false)];
    const result = await searchCatalog(
      { pageSize: 50 },
      { fetchImpl: pagedFetch(rows, seen), now: () => 3_000 },
    );
    expect(seen).toHaveLength(1);
    expect(result.total).toBe(TICKERS.length);
    expect(result.items.map((item) => item.symbol)).toContain(TICKERS[0].symbol);
    expect(result.items.some((item) => item.symbol === "AAA1x")).toBe(false);
  });

  it("findAssetBySymbol encuentra un curado de la segunda página", async () => {
    const seen: string[] = [];
    const found = await findAssetBySymbol("NFLXx", {
      fetchImpl: pagedFetch(bigTable(), seen),
      now: () => 4_000,
    });
    expect(seen).toHaveLength(2);
    expect(found).not.toBeNull();
    expect(found).toMatchObject({ symbol: "NFLXx", curated: true });
  });
});
