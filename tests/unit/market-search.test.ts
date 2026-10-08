import { beforeEach, describe, expect, it } from "vitest";

import {
  __clearAssetsCacheForTests,
  assetFromRow,
  isLowLiquidity,
  resolveEffectiveScope,
  searchAssets,
  searchCatalog,
  type CatalogAsset,
} from "@/lib/catalog/assets";
import { marketSearchQuerySchema, pricesQuerySchema } from "@/lib/api/contracts";

function asset(patch: Partial<CatalogAsset> & { symbol: string }): CatalogAsset {
  return {
    name: patch.symbol,
    underlying: patch.symbol.replace(/x$/i, ""),
    category: "tech",
    mint: `mint-${patch.symbol}`,
    logoLocal: null,
    enabled: true,
    halted: false,
    liquidityUsd: null,
    curated: true,
    issuer: "xstocks",
    companyTicker: patch.symbol.replace(/x$/i, ""),
    buy100CostBps: null,
    mode: null,
    period: null,
    openNow: null,
    nextChangeAt: null,
    minOrderUsd: null,
    maxOrderUsd: null,
    safetyStatus: "listed",
    safetyReasons: [],
    safetyTier: null,
    safetyCheckedAt: null,
    tradable: true,
    underReview: false,
    transitionKept: false,
    ...patch,
  };
}

const ROWS: CatalogAsset[] = [
  asset({ symbol: "AAPLx", name: "Apple", underlying: "AAPL", category: "tech", liquidityUsd: 500_000 }),
  asset({ symbol: "NVDAx", name: "NVIDIA", underlying: "NVDA", category: "tech", liquidityUsd: 900_000 }),
  asset({ symbol: "SPYx", name: "SP500", underlying: "SPY", category: "etf", liquidityUsd: 5_000 }),
  asset({ symbol: "KOx", name: "Coca-Cola", underlying: "KO", category: "consumer", liquidityUsd: null }),
  asset({ symbol: "FAKEx", name: "Fuera de curada", underlying: "FAKE", liquidityUsd: 100, curated: false }),
];

function supabaseFetch(rows: unknown[]) {
  return async () =>
    new Response(JSON.stringify(rows), { status: 200, headers: { "content-type": "application/json" } });
}

beforeEach(() => {
  __clearAssetsCacheForTests();
});

describe("mercado escalable: búsqueda del catálogo", () => {
  it("el alcance efectivo topa en CATALOG_SCOPE", () => {
    expect(resolveEffectiveScope("all", "curated")).toBe("curated");
    expect(resolveEffectiveScope("curated", "curated")).toBe("curated");
    expect(resolveEffectiveScope(undefined, "curated")).toBe("curated");
    expect(resolveEffectiveScope("all", "all")).toBe("all");
    expect(resolveEffectiveScope("listed", "all")).toBe("listed");
    expect(resolveEffectiveScope(undefined, "all")).toBe("listed");
    expect(resolveEffectiveScope("curated", "listed")).toBe("curated");
    expect(resolveEffectiveScope("all", "listed")).toBe("listed");
    expect(resolveEffectiveScope(undefined, "listed")).toBe("listed");
  });

  it("filtra por símbolo, subyacente y nombre sin acentos", () => {
    expect(searchAssets(ROWS, { q: "aapl" }).items.map((item) => item.symbol)).toEqual(["AAPLx"]);
    expect(searchAssets(ROWS, { q: "nvda" }).items.map((item) => item.symbol)).toEqual(["NVDAx"]);
    expect(searchAssets(ROWS, { q: "coca" }).items.map((item) => item.symbol)).toEqual(["KOx"]);
    expect(searchAssets(ROWS, { q: "COCA" }).items.map((item) => item.symbol)).toEqual(["KOx"]);
  });

  it("filtra por categoría", () => {
    const result = searchAssets(ROWS, { category: "etf" });
    expect(result.items.map((item) => item.symbol)).toEqual(["SPYx"]);
    expect(result.total).toBe(1);
  });

  it("pagina con hasMore", () => {
    const first = searchAssets(ROWS, { page: 1, pageSize: 2 });
    expect(first.items).toHaveLength(2);
    expect(first.total).toBe(5);
    expect(first.hasMore).toBe(true);
    const second = searchAssets(ROWS, { page: 2, pageSize: 2 });
    expect(second.items).toHaveLength(2);
    expect(second.hasMore).toBe(true);
    const third = searchAssets(ROWS, { page: 3, pageSize: 2 });
    expect(third.items).toHaveLength(1);
    expect(third.hasMore).toBe(false);
  });

  it("ordena por liquidez desc por defecto y por nombre si se pide", () => {
    const byLiquidity = searchAssets(ROWS, {}).items.map((item) => item.symbol);
    expect(byLiquidity).toEqual(["NVDAx", "AAPLx", "SPYx", "FAKEx", "KOx"]);
    const byName = searchAssets(ROWS, { sort: "name" }).items.map((item) => item.symbol);
    expect(byName).toEqual(["AAPLx", "KOx", "FAKEx", "NVDAx", "SPYx"]);
  });

  it("la primera página de liquidez muestra nombres sin dato cuando el resto llenaría la página", () => {
    const liquid = Array.from({ length: 20 }, (_, index) =>
      asset({ symbol: `L${String(index).padStart(2, "0")}x`, liquidityUsd: 1_000 - index }),
    );
    const fresh = Array.from({ length: 20 }, (_, index) =>
      asset({
        symbol: `N${String(index).padStart(2, "0")}on`,
        liquidityUsd: null,
        safetyStatus: "watch",
        tradable: false,
        underReview: true,
      }),
    );
    const rows = [...liquid, ...fresh];
    const first = searchAssets(rows, { page: 1, pageSize: 20 });
    expect(first.items[0]?.symbol).toBe("N00on");
    expect(first.items[1]?.symbol).toBe("L00x");
    expect(first.items.filter((item) => item.liquidityUsd === null)).toHaveLength(10);
    expect(first.items.filter((item) => item.liquidityUsd !== null)).toHaveLength(10);
    const second = searchAssets(rows, { page: 2, pageSize: 20 });
    expect(second.items[0]?.symbol).toBe("N10on");
    expect(second.items.filter((item) => item.liquidityUsd === null)).toHaveLength(10);
    const seen = new Set<string>();
    let page = 1;
    for (;;) {
      const result = searchAssets(rows, { page, pageSize: 20 });
      for (const item of result.items) {
        expect(seen.has(item.symbol)).toBe(false);
        seen.add(item.symbol);
      }
      if (!result.hasMore) break;
      page += 1;
      expect(page).toBeLessThan(5);
    }
    expect(seen.size).toBe(40);
    const queried = searchAssets(rows, { q: "L00", pageSize: 20 });
    expect(queried.items.map((item) => item.symbol)).toEqual(["L00x"]);
  });

  it("con scope curated salen sólo curadas; con all pedido y máximo listed, entran listed y watch", () => {
    const curated = searchAssets(ROWS, { scope: "curated" });
    expect(curated.items.some((item) => item.symbol === "FAKEx")).toBe(false);
    expect(curated.total).toBe(4);
    const listed = searchAssets(ROWS, { scope: "all" });
    expect(listed.items.some((item) => item.symbol === "FAKEx")).toBe(true);
    expect(listed.total).toBe(5);
  });

  it("marca baja liquidez bajo US$10.000 y no sin dato", () => {
    expect(isLowLiquidity({ liquidityUsd: 9_999 })).toBe(true);
    expect(isLowLiquidity({ liquidityUsd: 10_000 })).toBe(false);
    expect(isLowLiquidity({ liquidityUsd: null })).toBe(false);
  });

  it("mapea la fila de Supabase sin hotlinking", () => {
    const found = assetFromRow({
      symbol: "AAPLx",
      name: "Apple",
      underlying: "AAPL",
      category: "tech",
      mint_solana: "mint-a",
      logo_path: "/logos/aapl.png",
      enabled: true,
      is_trading_halted: false,
      jupiter_liquidity_usd: 12,
      curated: true,
      safety_status: "listed",
      safety_reasons: [],
      safety_tier: "A",
      safety_checked_at: "2026-10-07T00:00:00.000Z",
    });
    expect(found).toMatchObject({
      symbol: "AAPLx",
      logoLocal: "/logos/aapl.png",
      liquidityUsd: 12,
      safetyStatus: "listed",
      safetyTier: "A",
      tradable: true,
      underReview: false,
    });
    expect(assetFromRow({ symbol: "X", logo_path: null })).toMatchObject({
      logoLocal: null,
      // Sin estado de seguridad: conservador (no visible en listed, no operable).
      safetyStatus: "unknown",
      tradable: false,
    });
    expect(assetFromRow({ name: "sin símbolo" })).toBeNull();
  });

  it("searchCatalog consulta Supabase y cae al fallback si falla", async () => {
    const rows = [
      {
        symbol: "AAPLx",
        name: "Apple",
        underlying: "AAPL",
        category: "tech",
        mint_solana: "mint-a",
        logo_path: "/logos/aapl.png",
        enabled: true,
        is_trading_halted: false,
        jupiter_liquidity_usd: 42,
        curated: true,
      },
    ];
    const ok = await searchCatalog(
      { q: "apple" },
      { fetchImpl: supabaseFetch(rows) as unknown as typeof fetch, now: () => 1_000 },
    );
    expect(ok.items.map((item) => item.symbol)).toEqual(["AAPLx"]);
    expect(ok.total).toBe(1);

    __clearAssetsCacheForTests();
    const failing = async () => new Response("no", { status: 500 });
    const fallback = await searchCatalog(
      { q: "AAPLx" },
      { fetchImpl: failing as unknown as typeof fetch, now: () => 2_000 },
    );
    expect(fallback.items.map((item) => item.symbol)).toContain("AAPLx");
  });
});

describe("mercado escalable: validación de la API", () => {
  it("la búsqueda acepta vacío y topa pageSize en 50", () => {
    const parsed = marketSearchQuerySchema.safeParse({});
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toMatchObject({ q: "", page: 1, pageSize: 20, sort: "liquidity", scope: "listed" });
    }
    expect(marketSearchQuerySchema.safeParse({ pageSize: 50 }).success).toBe(true);
    expect(marketSearchQuerySchema.safeParse({ pageSize: 51 }).success).toBe(false);
    expect(marketSearchQuerySchema.safeParse({ page: 0 }).success).toBe(false);
    expect(marketSearchQuerySchema.safeParse({ sort: "gain" }).success).toBe(false);
  });

  it("/api/prices acepta hasta 50 símbolos", () => {
    const fifty = Array.from({ length: 50 }, (_, index) => `S${index}x`).join(",");
    expect(pricesQuerySchema.safeParse({ symbols: fifty }).success).toBe(true);
    const fiftyOne = `${fifty},EXTRA`;
    expect(pricesQuerySchema.safeParse({ symbols: fiftyOne }).success).toBe(false);
    expect(pricesQuerySchema.safeParse({ symbols: "ABNBon" }).success).toBe(true);
    expect(pricesQuerySchema.safeParse({}).success).toBe(true);
  });
});
