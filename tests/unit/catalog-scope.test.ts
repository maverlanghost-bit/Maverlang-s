import { beforeEach, describe, expect, it } from "vitest";

import { USDC_MINT } from "@/config/tickers";
import { GENERATED_TICKERS } from "@/config/tickers.generated";
import { DomainError } from "@/lib/api/result";
import {
  __clearAssetsCacheForTests,
  __setAssetsCacheForTests,
  annotateSafety,
  assetFromRow,
  findAssetBySymbol,
  isVisibleInScope,
  searchAssets,
  type CatalogAsset,
  type SafetyStatus,
} from "@/lib/catalog/assets";
import { isTradableMint, tradableBySymbol } from "@/lib/catalog/tradable";
import { createDemoUserService, type DemoDeps } from "@/lib/services/demo.supabase";

/** Mint base58 válido con forma xStocks (`Xs` + 41 caracteres). */
function mintFor(index: number): string {
  const digits = String(index + 11).replaceAll("0", "2");
  return `Xs${digits.padStart(41, "1")}`;
}

function asset(patch: Partial<CatalogAsset> & { symbol: string; mint: string }): CatalogAsset {
  return {
    name: patch.symbol,
    underlying: patch.symbol.replace(/x$/i, ""),
    category: "tech",
    logoLocal: null,
    enabled: true,
    halted: false,
    liquidityUsd: 50_000,
    curated: false,
    mode: "TwentyFourFive",
    period: "market",
    openNow: true,
    nextChangeAt: null,
    minOrderUsd: null,
    maxOrderUsd: null,
    safetyStatus: "unknown",
    safetyReasons: [],
    safetyTier: null,
    safetyCheckedAt: null,
    tradable: false,
    underReview: false,
    transitionKept: false,
    ...patch,
  };
}

/**
 * Fixture de 300 filas SIN ningún `listed` (transición activa):
 * - 50 curadas: AAPLx + 24 en `watch`, 25 en `unknown`.
 * - 250 no curadas: 100 en `watch`, 50 en `hidden`, 100 en `unknown`.
 */
function transitionFixture(): CatalogAsset[] {
  const rows: CatalogAsset[] = [];
  const curatedWatch = ["AAPLx", ...Array.from({ length: 24 }, (_, i) => `C${String(i).padStart(3, "0")}x`)];
  curatedWatch.forEach((symbol, i) => {
    rows.push(
      asset({
        symbol,
        name: symbol === "AAPLx" ? "Apple" : `Curada ${symbol}`,
        underlying: symbol.replace(/x$/i, ""),
        mint: mintFor(i),
        curated: true,
        safetyStatus: "watch",
        safetyReasons: ["costo_compra_100_120bps"],
      }),
    );
  });
  for (let i = 0; i < 25; i += 1) {
    const symbol = `D${String(i).padStart(3, "0")}x`;
    rows.push(asset({ symbol, mint: mintFor(100 + i), curated: true, safetyStatus: "unknown" }));
  }
  for (let i = 0; i < 100; i += 1) {
    const symbol = `W${String(i).padStart(3, "0")}x`;
    rows.push(
      asset({
        symbol,
        mint: mintFor(200 + i),
        safetyStatus: "watch",
        safetyReasons: ["sin_ruta_compra_100"],
      }),
    );
  }
  for (let i = 0; i < 50; i += 1) {
    const symbol = `H${String(i).padStart(3, "0")}x`;
    rows.push(
      asset({
        symbol,
        mint: mintFor(300 + i),
        safetyStatus: "hidden",
        safetyReasons: ["producto_apalancado_inverso_o_volatilidad"],
      }),
    );
  }
  for (let i = 0; i < 100; i += 1) {
    const symbol = `U${String(i).padStart(3, "0")}x`;
    rows.push(asset({ symbol, mint: mintFor(400 + i), safetyStatus: "unknown" }));
  }
  // NVDAx curada en `unknown` para la búsqueda por nombre.
  rows.push(
    asset({
      symbol: "NVDAx",
      name: "NVIDIA",
      underlying: "NVDA",
      mint: mintFor(999),
      curated: true,
      safetyStatus: "unknown",
    }),
  );
  return rows;
}

function stubDeps(): DemoDeps {
  return {
    loadAccount: async () => ({ cashUsd: 1000, initialUsd: 1000, resetCount: 0 }),
    createAccount: async () => ({ cashUsd: 1000, initialUsd: 1000, resetCount: 0 }),
    listPositions: async () => [],
    listOrders: async () => [],
    getOrder: async () => null,
    runTrade: async () => ({ cashUsd: 900, totalUsd: 1000, priceUsd: 10 }),
    runReset: async () => ({ cashUsd: 1000, resetCount: 1 }),
    getSpot: async () => ({ priceUsd: 10, multiplier: 1 }),
    getFx: async () => 950,
  };
}

beforeEach(() => {
  __clearAssetsCacheForTests();
});

describe("M54: catálogo ampliado con estado de seguridad", () => {
  it("scope listed sin listados (transición): watch + curadas unknown, nunca hidden", () => {
    const rows = annotateSafety(transitionFixture(), true);
    expect(rows).toHaveLength(301);
    const result = searchAssets(rows, { scope: "listed", pageSize: 50 });
    // 25 curadas watch + 26 curadas unknown (transición) + 100 watch no curadas.
    expect(result.total).toBe(151);
    expect(result.items.some((item) => item.safetyStatus === "hidden")).toBe(false);
    expect(result.items.some((item) => item.symbol === "AAPLx")).toBe(true);
    const second = searchAssets(rows, { scope: "listed", page: 2, pageSize: 50 });
    expect(second.items.some((item) => item.symbol === "NVDAx")).toBe(true);
  });

  it("la paginación devuelve 50 + 50 + … sin duplicados", () => {
    const rows = annotateSafety(transitionFixture(), true);
    const seen = new Set<string>();
    let page = 1;
    let total = 0;
    for (;;) {
      const result = searchAssets(rows, { scope: "listed", page, pageSize: 50 });
      total = result.total;
      for (const item of result.items) {
        expect(seen.has(item.symbol)).toBe(false);
        seen.add(item.symbol);
      }
      if (!result.hasMore) break;
      page += 1;
      expect(page).toBeLessThan(10);
    }
    expect(total).toBe(151);
    expect(seen.size).toBe(151);
  });

  it('buscar "apple" devuelve AAPLx y "nvidia" devuelve NVDAx', () => {
    const rows = annotateSafety(transitionFixture(), true);
    expect(searchAssets(rows, { q: "apple", scope: "listed" }).items.map((i) => i.symbol)).toContain("AAPLx");
    expect(searchAssets(rows, { q: "nvidia", scope: "listed" }).items.map((i) => i.symbol)).toContain("NVDAx");
    expect(searchAssets(rows, { q: "apple", scope: "listed" }).total).toBeGreaterThan(0);
  });

  it("en transición los curados operan sin chip; el watch no curado no opera y el hidden no aparece", async () => {
    const rows = annotateSafety(transitionFixture(), true);
    __setAssetsCacheForTests(rows, Date.now());
    const aapl = rows.find((row) => row.symbol === "AAPLx")!;
    expect(aapl.tradable).toBe(true);
    expect(aapl.underReview).toBe(false);
    // isTradableMint: listed/curado-en-transición → true.
    expect(await isTradableMint(aapl.mint)).toBe(true);
    expect(await tradableBySymbol("AAPLx")).toMatchObject({ symbol: "AAPLx", mint: aapl.mint });
    // Watch no curado → visible con chip, no operable.
    const watch = rows.find((row) => row.symbol === "W000x")!;
    expect(watch.underReview).toBe(true);
    expect(await isTradableMint(watch.mint)).toBe(false);
    expect(await tradableBySymbol("W000x")).toBeNull();
    // Hidden → no operable y no visible.
    const hidden = rows.find((row) => row.symbol === "H000x")!;
    expect(await isTradableMint(hidden.mint)).toBe(false);
    expect(await findAssetBySymbol("H000x")).toBeNull();
    expect(isVisibleInScope(hidden, "all")).toBe(false);
    // Mint con otro prefijo → false aunque exista la forma.
    expect(await isTradableMint(USDC_MINT)).toBe(false);
    expect(await isTradableMint("FakeMint111111111111111111111111111111111")).toBe(false);
  });

  it("con al menos una listed la transición se apaga: un curado en watch ya no opera", async () => {
    const base = transitionFixture();
    base.push(
      asset({
        symbol: "TSLAx",
        name: "Tesla",
        underlying: "TSLA",
        mint: mintFor(777),
        curated: true,
        safetyStatus: "listed",
      }),
    );
    const rows = annotateSafety(base, true);
    __setAssetsCacheForTests(rows, Date.now());
    const aapl = rows.find((row) => row.symbol === "AAPLx")!;
    expect(aapl.tradable).toBe(false);
    expect(aapl.underReview).toBe(true);
    expect(aapl.transitionKept).toBe(false);
    expect(await isTradableMint(aapl.mint)).toBe(false);
    expect(await tradableBySymbol("AAPLx")).toBeNull();
    const tsla = rows.find((row) => row.symbol === "TSLAx")!;
    expect(tsla.tradable).toBe(true);
    expect(await isTradableMint(tsla.mint)).toBe(true);
    // La curada unknown ya no entra en listed (sólo en all).
    expect(searchAssets(rows, { scope: "listed", pageSize: 50 }).total).toBe(126);
    const unknownCurated = rows.find((row) => row.symbol === "D000x")!;
    expect(isVisibleInScope(unknownCurated, "listed")).toBe(false);
    expect(isVisibleInScope(unknownCurated, "all")).toBe(true);
    const unknownPlain = rows.find((row) => row.symbol === "U000x")!;
    expect(isVisibleInScope(unknownPlain, "listed")).toBe(false);
    expect(isVisibleInScope(unknownPlain, "all")).toBe(true);
  });

  it("con Supabase caído la allowlist usa el snapshot y nunca permite un mint desconocido", async () => {
    const failing = async () => new Response("no", { status: 500 });
    const aapl = GENERATED_TICKERS.find((ticker) => ticker.symbol === "AAPLx")!;
    expect(await isTradableMint(aapl.mint, { fetchImpl: failing as unknown as typeof fetch })).toBe(true);
    expect(
      await tradableBySymbol("AAPLx", { fetchImpl: failing as unknown as typeof fetch }),
    ).toMatchObject({ symbol: "AAPLx" });
    const unknownMint = `Xs${"2".repeat(41)}`;
    expect(unknownMint).not.toBe(aapl.mint);
    __clearAssetsCacheForTests();
    expect(await isTradableMint(unknownMint, { fetchImpl: failing as unknown as typeof fetch })).toBe(false);
  });

  it("una orden demo sobre un símbolo watch se rechaza en el servidor", async () => {
    const rows = annotateSafety(transitionFixture(), true);
    __setAssetsCacheForTests(rows, Date.now());
    const service = createDemoUserService(stubDeps());
    const failed = await service.trade
      .quote("user-1", { side: "buy", symbol: "W000x", amount: 100, amountCurrency: "USDC" })
      .then(
        () => null,
        (error: unknown) => error,
      );
    expect(failed).toBeInstanceOf(DomainError);
    expect((failed as DomainError).code).toBe("MINT_NOT_ALLOWED");
    const hidden = await service.trade
      .quote("user-1", { side: "buy", symbol: "H000x", amount: 100, amountCurrency: "USDC" })
      .then(
        () => null,
        (error: unknown) => error,
      );
    expect((hidden as DomainError).code).toBe("MINT_NOT_ALLOWED");
  });

  it("mapea categorías nuevas: etf por tipo M52 y other en el resto", () => {
    const etf = assetFromRow({ symbol: "SETFx", category: null, product_type: "etf" });
    expect(etf).toMatchObject({ category: "etf" });
    const metrics = assetFromRow({ symbol: "SOTRx", category: "desconocida", safety_metrics: { product: "stock" } });
    expect(metrics).toMatchObject({ category: "other" });
    const plain = assetFromRow({ symbol: "SPLNx", category: null });
    expect(plain).toMatchObject({ category: "other" });
    const known = assetFromRow({ symbol: "STECx", category: "tech" });
    expect(known).toMatchObject({ category: "tech" });
  });

  it("normaliza el estado de seguridad y nunca muestra hidden", () => {
    const statuses: SafetyStatus[] = ["listed", "watch", "hidden", "unknown"];
    for (const status of statuses) {
      const row = assetFromRow({ symbol: `S${status}x`, safety_status: status });
      expect(row?.safetyStatus).toBe(status);
    }
    expect(assetFromRow({ symbol: "SXx", safety_status: "raro" })?.safetyStatus).toBe("unknown");
  });
});
