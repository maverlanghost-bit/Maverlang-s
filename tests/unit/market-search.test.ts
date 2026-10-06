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
    mode: null,
    period: null,
    openNow: null,
    nextChangeAt: null,
    minOrderUsd: null,
    maxOrderUsd: null,
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
    expect(resolveEffectiveScope(undefined, "all")).toBe("curated");
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
    expect(first.total).toBe(4);
    expect(first.hasMore).toBe(true);
    const second = searchAssets(ROWS, { page: 2, pageSize: 2 });
    expect(second.items).toHaveLength(2);
    expect(second.hasMore).toBe(false);
    const third = searchAssets(ROWS, { page: 3, pageSize: 2 });
    expect(third.items).toHaveLength(0);
    expect(third.hasMore).toBe(false);
  });

  it("ordena por liquidez desc por defecto y por nombre si se pide", () => {
    const byLiquidity = searchAssets(ROWS, {}).items.map((item) => item.symbol);
    expect(byLiquidity).toEqual(["NVDAx", "AAPLx", "SPYx", "KOx"]);
    const byName = searchAssets(ROWS, { sort: "name" }).items.map((item) => item.symbol);
    expect(byName).toEqual(["AAPLx", "KOx", "NVDAx", "SPYx"]);
  });

  it("con el máximo por defecto ignora pedidos de all", () => {
    const result = searchAssets(ROWS, { scope: "all" });
    expect(result.items.some((item) => item.symbol === "FAKEx")).toBe(false);
    expect(result.total).toBe(4);
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
    });
    expect(found).toMatchObject({ symbol: "AAPLx", logoLocal: "/logos/aapl.png", liquidityUsd: 12 });
    expect(assetFromRow({ symbol: "X", logo_path: null })).toMatchObject({ logoLocal: null });
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
      expect(parsed.data).toMatchObject({ q: "", page: 1, pageSize: 20, sort: "liquidity", scope: "curated" });
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
    expect(pricesQuerySchema.safeParse({}).success).toBe(true);
  });
});
