import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { ONDO_TICKERS } from "@/config/ondo.generated";
import { annotateSafety, applyListing, assetFromRow } from "@/lib/catalog/assets";
import {
  effectiveCronScope,
  selectVisiblePriceAssets,
  type CronAssetInput,
} from "@/lib/market/cron-visible";
import { safeJobError } from "@/lib/market/cron-safe";
import { fetchJupiterSpots, spotFromJupiterRow } from "@/lib/market/jupiter-spot";
import { runCoinGeckoBackfillJob, runJupiterTickJob } from "@/lib/market/price-cron-job";

const ROOT = path.resolve(__dirname, "..", "..");

function read(relative: string): string {
  return readFileSync(path.join(ROOT, relative), "utf8");
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function winners(): Map<string, "xstocks" | "ondo"> {
  const map = new Map<string, "xstocks" | "ondo">();
  for (const entry of ONDO_TICKERS) {
    if (entry.volumeWinner === "xstocks" || entry.volumeWinner === "ondo") {
      map.set(entry.ticker, entry.volumeWinner);
    }
  }
  return map;
}

function sameSymbols(
  rows: readonly CronAssetInput[],
  scope: string | undefined,
  production: boolean,
  fromSupabase: boolean,
): { picked: string[]; canonical: string[] } {
  const picked = selectVisiblePriceAssets(rows, {
    scope,
    production,
    fromSupabase,
    volumeWinners: winners(),
  }).map((asset) => asset.symbol);
  const mapped = rows
    .map((row) =>
      assetFromRow({
        symbol: row.symbol,
        underlying: row.underlying,
        mint_solana: row.mint_solana,
        issuer: row.issuer,
        company_ticker: row.company_ticker,
        curated: row.curated,
        enabled: row.enabled,
        is_trading_halted: row.is_trading_halted,
        safety_status: row.safety_status,
        safety_metrics: row.safety_metrics,
      }),
    )
    .filter((asset): asset is NonNullable<typeof asset> => asset !== null);
  const canonical = applyListing(annotateSafety(mapped, fromSupabase), effectiveCronScope(scope, production)).map(
    (asset) => asset.symbol,
  );
  return { picked, canonical };
}

const curatedUnknown: CronAssetInput = {
  symbol: "AAPLx",
  underlying: "AAPL",
  company_ticker: "AAPL",
  mint_solana: "mint-x",
  issuer: "xstocks",
  curated: true,
  enabled: true,
  safety_status: "unknown",
};
const ondoWatch: CronAssetInput = {
  symbol: "MSFTon",
  underlying: "MSFT",
  company_ticker: "MSFT",
  mint_solana: "mint-o",
  issuer: "ondo",
  curated: false,
  enabled: true,
  safety_status: "watch",
};
const plainWatch: CronAssetInput = {
  symbol: "NVDAx",
  underlying: "NVDA",
  company_ticker: "NVDA",
  mint_solana: "mint-n",
  issuer: "xstocks",
  curated: false,
  enabled: true,
  safety_status: "watch",
};
const hidden: CronAssetInput = {
  symbol: "HIDx",
  underlying: "HID",
  company_ticker: "HID",
  mint_solana: "mint-h",
  issuer: "xstocks",
  curated: true,
  enabled: true,
  safety_status: "hidden",
};
const plainUnknown: CronAssetInput = {
  symbol: "ORCLx",
  underlying: "ORCL",
  company_ticker: "ORCL",
  mint_solana: "mint-r",
  issuer: "xstocks",
  curated: false,
  enabled: true,
  safety_status: "unknown",
};

describe("selectVisiblePriceAssets", () => {
  const rows = [curatedUnknown, ondoWatch, plainWatch, hidden, plainUnknown];

  it("sigue al catálogo en la transición y en cada alcance", () => {
    const curated = sameSymbols(rows, "curated", false, true);
    expect(curated.picked).toEqual(curated.canonical);
    expect(curated.picked).toEqual(["AAPLx", "MSFTon"]);

    const listed = sameSymbols(rows, "listed", false, true);
    expect(listed.picked).toEqual(listed.canonical);
    expect(listed.picked).toEqual(["AAPLx", "MSFTon", "NVDAx"]);

    const asListed = sameSymbols(rows, "all", true, true);
    expect(asListed.picked).toEqual(asListed.canonical);
    expect(asListed.picked).toEqual(listed.picked);

    const all = sameSymbols(rows, "all", false, true);
    expect(all.picked).toEqual(all.canonical);
    expect(all.picked).toContain("ORCLx");
    expect(all.picked).not.toContain("HIDx");
  });

  it("elige la curada entre el par xStock/Ondo y, si ambas están listed, el ganador por volumen", () => {
    const twin = sameSymbols(
      [
        curatedUnknown,
        {
          symbol: "AAPLon",
          underlying: "AAPL",
          company_ticker: "AAPL",
          mint_solana: "mint-on",
          issuer: "ondo",
          curated: false,
          enabled: true,
          safety_status: "watch",
        },
      ],
      "listed",
      false,
      true,
    );
    expect(twin.picked).toEqual(twin.canonical);
    expect(twin.picked).toEqual(["AAPLx"]);

    const bothListed = sameSymbols(
      [
        {
          symbol: "AAPLx",
          underlying: "AAPL",
          company_ticker: "AAPL",
          mint_solana: "mx",
          issuer: "xstocks",
          curated: false,
          enabled: true,
          safety_status: "listed",
        },
        {
          symbol: "AAPLon",
          underlying: "AAPL",
          company_ticker: "AAPL",
          mint_solana: "mo",
          issuer: "ondo",
          curated: false,
          enabled: true,
          safety_status: "listed",
        },
      ],
      "listed",
      false,
      true,
    );
    expect(bothListed.picked).toEqual(bothListed.canonical);
    const winner = winners().get("AAPL");
    expect(bothListed.picked).toEqual([winner === "ondo" ? "AAPLon" : "AAPLx"]);
  });

  it("sin filas de Supabase no mantiene la curada unknown en listed", () => {
    const offline = sameSymbols([curatedUnknown], "listed", false, false);
    expect(offline.picked).toEqual(offline.canonical);
    expect(offline.picked).toEqual([]);
  });
});

describe("fetchJupiterSpots", () => {
  it("usa usdPrice y, si no hay variación, el precio del subyacente", () => {
    expect(spotFromJupiterRow({ usdPrice: 10, priceChange24h: 1 })).toBe(10);
    expect(spotFromJupiterRow({ usdPrice: "12.5", priceChange24h: 0, stockData: { price: 99 } })).toBe(12.5);
    expect(spotFromJupiterRow({ usdPrice: 1, stockData: { price: 2 } })).toBe(2);
    expect(spotFromJupiterRow({ usdPrice: 0, stockData: { price: 2 } })).toBeNull();
    expect(spotFromJupiterRow({})).toBeNull();
  });

  it("omite mint vacío, precio no positivo y un cuerpo sin ese mint", async () => {
    const fetchImpl = async () => json({ MintA: { usdPrice: 10, priceChange24h: 1 }, MintB: { usdPrice: -1 } });
    const spots = await fetchJupiterSpots(
      [
        { symbol: "AAPLx", mint: "MintA" },
        { symbol: "NVDAx", mint: "" },
        { symbol: "TSLAx", mint: "MintB" },
        { symbol: "ZZZx", mint: "MintZ" },
      ],
      { priceUrl: "https://api.jup.ag/price/v3", fetchImpl: fetchImpl as typeof fetch },
    );
    expect(spots).toEqual([{ symbol: "AAPLx", priceUsd: 10 }]);
  });

  it("ante 401 sigue con el endpoint lite y no inventa precio si tampoco responde", async () => {
    const calls: string[] = [];
    const fetchImpl = async (input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);
      if (url.startsWith("https://api.jup.ag")) return json({}, 401);
      if (url.startsWith("https://lite-api.jup.ag")) {
        return json({ MintA: { usdPrice: 4, priceChange24h: 0.5 } });
      }
      return json({}, 404);
    };
    const spots = await fetchJupiterSpots([{ symbol: "AAPLx", mint: "MintA" }], {
      priceUrl: "https://api.jup.ag",
      fetchImpl: fetchImpl as typeof fetch,
    });
    expect(spots).toEqual([{ symbol: "AAPLx", priceUsd: 4 }]);
    expect(calls[1]).toContain("lite-api.jup.ag/price/v3");

    const empty = await fetchJupiterSpots([{ symbol: "AAPLx", mint: "MintA" }], {
      priceUrl: "https://api.jup.ag/price/v3",
      fetchImpl: (async () => json({})) as typeof fetch,
    });
    expect(empty).toEqual([]);
  });
});

describe("crons de price_ticks", () => {
  it("guarda el spot en el minuto y no escribe si Jupiter no manda precio", async () => {
    const writes: { symbol: string; t: number; source: string; priceUsd: number }[][] = [];
    const now = 1_700_000_030_000;
    const result = await runJupiterTickJob({
      assets: [
        { symbol: "AAPLx", mint: "MintA" },
        { symbol: "NVDAx", mint: "" },
      ],
      priceUrl: "https://api.jup.ag",
      now,
      fetchImpl: (async () => json({ MintA: { usdPrice: 10, priceChange24h: 1 } })) as typeof fetch,
      write: async (ticks) => {
        writes.push([...ticks]);
        return { saved: ticks.length, error: null };
      },
    });
    expect(result).toMatchObject({ candidates: 2, quoted: 1, recorded: 1, dbError: null });
    expect(writes).toEqual([
      [{ symbol: "AAPLx", t: Math.floor(now / 60_000) * 60_000, priceUsd: 10, source: "jupiter" }],
    ]);

    const missed = await runJupiterTickJob({
      assets: [{ symbol: "AAPLx", mint: "MintA" }],
      priceUrl: "https://api.jup.ag/price/v3",
      fetchImpl: (async () => json({})) as typeof fetch,
      write: async () => {
        throw new Error("no debía escribir");
      },
    });
    expect(missed).toMatchObject({ quoted: 0, recorded: 0, dbError: null });
  });

  it("no encola símbolos sin id y corta el chart si no queda tiempo", async () => {
    const markets = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/coins/markets")) return json([{ id: "otro", symbol: "zzzz" }]);
      throw new Error("no hay chart");
    };
    const none = await runCoinGeckoBackfillJob({
      assets: [{ symbol: "AAPLx" }],
      fetchImpl: markets as typeof fetch,
      hasHistory: async () => {
        throw new Error("no debía consultar historia");
      },
      write: async () => {
        throw new Error("no debía escribir");
      },
    });
    expect(none).toMatchObject({ idMap: 1, backfilled: 0, pending: 0, noId: 1, dbError: null });

    const calls: string[] = [];
    const started = 1_700_000_000_000;
    const blocked = await runCoinGeckoBackfillJob({
      assets: [{ symbol: "AAPLx" }],
      clock: () => started,
      deadline: started + 1000,
      fetchImpl: (async (input: RequestInfo | URL) => {
        const url = String(input);
        calls.push(url);
        if (url.includes("/coins/markets")) return json([{ id: "apple-xstock", symbol: "aaplx" }]);
        throw new Error("no debía pedir el chart");
      }) as typeof fetch,
      hasHistory: async () => new Set<string>(),
      write: async () => ({ saved: 0, error: null }),
    });
    expect(blocked.backfilled).toBe(0);
    expect(blocked.remaining).toBeGreaterThan(0);
    expect(calls.some((url) => url.includes("market_chart"))).toBe(false);
  });

  it("si el listado de ids corta por 429, igual guarda los símbolos ya resueltos", async () => {
    const page = Array.from({ length: 250 }, (_, index) => ({ id: `id-${index}`, symbol: `s${index}x` }));
    page[0] = { id: "apple-xstock", symbol: "aaplx" };
    const calls: string[] = [];
    const saved = await runCoinGeckoBackfillJob({
      assets: [{ symbol: "AAPLx" }, { symbol: "CRCLon" }],
      idMapRetries: 2,
      sleep: async () => {},
      fetchImpl: (async (input: RequestInfo | URL) => {
        const url = String(input);
        calls.push(url);
        if (url.includes("/coins/markets") && url.includes("page=1") && url.includes("xstocks-ecosystem")) {
          return json(page);
        }
        if (url.includes("/coins/markets")) return json({}, 429);
        if (url.includes("/market_chart")) {
          return json({
            prices: [
              [1700000000000, 10],
              [1700086400000, 11],
            ],
          });
        }
        return json({}, 404);
      }) as typeof fetch,
      hasHistory: async () => new Set<string>(),
      write: async (ticks) => ({ saved: ticks.length, error: null }),
    });
    expect(saved.backfilled).toBe(1);
    expect(saved.points).toBe(2);
    expect(saved.noId).toBe(1);
    expect(saved.rateLimited).toBe(false);
    expect(calls.filter((url) => url.includes("market_chart"))).toHaveLength(1);
    expect(calls.filter((url) => url.includes("xstocks-ecosystem") && url.includes("page=1"))).toHaveLength(1);
  });

  it("escribe los puntos reales y se detiene ante 429", async () => {
    const written: string[] = [];
    const saved = await runCoinGeckoBackfillJob({
      assets: [{ symbol: "AAPLx" }, { symbol: "ZZZZx" }],
      fetchImpl: (async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/coins/markets")) return json([{ id: "apple-xstock", symbol: "aaplx" }]);
        if (url.includes("/market_chart")) {
          return json({
            prices: [
              [1700000000000, 10],
              [1700086400000, 11],
            ],
          });
        }
        return json({}, 404);
      }) as typeof fetch,
      hasHistory: async () => new Set<string>(),
      write: async (ticks) => {
        written.push(ticks[0]?.symbol ?? "");
        return { saved: ticks.length, error: null };
      },
    });
    expect(saved).toMatchObject({ backfilled: 1, points: 2, noId: 1, rateLimited: false, dbError: null });
    expect(written).toEqual(["AAPLx"]);

    let charts = 0;
    const limited = await runCoinGeckoBackfillJob({
      assets: [{ symbol: "AAPLx" }, { symbol: "NVDAx" }],
      fetchImpl: (async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/coins/markets")) {
          return json([
            { id: "apple-xstock", symbol: "aaplx" },
            { id: "nvidia-xstock", symbol: "nvdax" },
          ]);
        }
        charts += 1;
        return json({}, 429);
      }) as typeof fetch,
      hasHistory: async () => new Set<string>(),
      write: async () => {
        throw new Error("no debía escribir");
      },
    });
    expect(charts).toBe(1);
    expect(limited.rateLimited).toBe(true);
    expect(limited.backfilled).toBe(0);
  });
});

describe("errores y fuentes de los crons", () => {
  it("sanea secretos y marca la secret ausente", () => {
    expect(safeJobError(new Error("Falta la configuración de Supabase en el servidor."))).toBe(
      "missing_supabase_secret",
    );
    const text = safeJobError({
      message: "falló https://abcd.supabase.co/rest?apikey=sb_secret_abc eyJaaaaaaaa.bbbbbbbb.cccccccc",
    });
    expect(text).not.toContain("https://");
    expect(text).not.toContain("sb_secret_");
    expect(text).not.toContain("eyJ");
    expect(text).toContain("[url]");
  });

  it("los crons no piden prices.list([]) y el backfill revalida el tag", () => {
    const ticks = read("app/api/cron/price-ticks/route.ts");
    const backfill = read("app/api/cron/price-backfill/route.ts");
    expect(ticks).toContain("export const maxDuration = 60");
    expect(backfill).toContain("export const maxDuration = 60");
    expect(ticks).not.toContain("prices.list");
    expect(ticks).not.toContain("getServices");
    expect(backfill).not.toContain("prices.list");
    expect(backfill).not.toContain("getServices");
    expect(backfill).toContain('revalidateTag(PRICES_TAG, "max")');
  });

  it("el script declara dry-run, sólo price_ticks, y no imprime la secret", () => {
    const script = read("scripts/price-backfill.mjs");
    expect(script).toContain("--dry-run");
    expect(script).toContain("NEXT_PUBLIC_SUPABASE_URL");
    expect(script).toContain("SUPABASE_SECRET_KEY");
    expect(script).toContain('.from("price_ticks")');
    expect(script).not.toMatch(/console\.log\([^)]*SUPABASE_SECRET_KEY/);
    expect(script).not.toMatch(/console\.log\([^)]*NEXT_PUBLIC_SUPABASE_URL/);
    const tables = script.match(/\.from\("[a-z_]+"\)/g) ?? [];
    expect(new Set(tables)).toEqual(new Set(['.from("assets")', '.from("price_ticks")']));
  });
});
