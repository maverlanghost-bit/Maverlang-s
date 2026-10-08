import { beforeEach, describe, expect, it } from "vitest";

import { GENERATED_TICKERS } from "@/config/tickers.generated";
import { en } from "@/content/i18n/en";
import { esCL } from "@/content/i18n/es-CL";
import { DomainError } from "@/lib/api/result";
import {
  __clearAssetsCacheForTests,
  __setAssetsCacheForTests,
  annotateSafety,
  type CatalogAsset,
} from "@/lib/catalog/assets";
import { requireOperable } from "@/lib/catalog/tradable";
import { safetyNoticeForPosition } from "@/lib/market/asset-status.shared";
import { status as assetStatus } from "@/lib/market/asset-status";
import { applyBuy, resetDemoState } from "@/lib/mocks/demo-state";
import { createDemoUserService, type DemoDeps } from "@/lib/services/demo.supabase";
import { mockTrade } from "@/lib/services/trade.mock";

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
    curated: true,
    issuer: "xstocks",
    companyTicker: patch.symbol.replace(/x$/i, ""),
    buy100CostBps: null,
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

const AAPL_MINT = GENERATED_TICKERS.find((ticker) => ticker.symbol === "AAPLx")!.mint;

/**
 * 50 curadas `listed` (siguen comprando y vendiendo igual) + 1 `watch` +
 * 1 `hidden` + AAPLx en `watch` (venta mock con posición real del snapshot).
 */
function listedFixture(): CatalogAsset[] {
  const rows: CatalogAsset[] = [];
  for (let i = 0; i < 50; i += 1) {
    const symbol = `C${String(i).padStart(3, "0")}x`;
    rows.push(asset({ symbol, mint: mintFor(i), safetyStatus: "listed" }));
  }
  rows.push(asset({ symbol: "W000x", mint: mintFor(500), curated: false, safetyStatus: "watch" }));
  rows.push(asset({ symbol: "H000x", mint: mintFor(600), curated: false, safetyStatus: "hidden" }));
  rows.push(asset({ symbol: "AAPLx", name: "Apple", underlying: "AAPL", mint: AAPL_MINT, safetyStatus: "watch" }));
  return annotateSafety(rows, true);
}

function stubDeps(positions: { symbol: string; shares: number }[]): DemoDeps {
  return {
    loadAccount: async () => ({ cashUsd: 1000, initialUsd: 1000, resetCount: 0 }),
    createAccount: async () => ({ cashUsd: 1000, initialUsd: 1000, resetCount: 0 }),
    listPositions: async () =>
      positions.map((row) => ({ symbol: row.symbol, shares: row.shares, avgCostUsd: 10, avgCostClp: 9500 })),
    listOrders: async () => [],
    getOrder: async () => null,
    runTrade: async () => ({ cashUsd: 900, totalUsd: 1000, priceUsd: 10 }),
    runReset: async () => ({ cashUsd: 1000, resetCount: 1 }),
    getSpot: async () => ({ priceUsd: 10, multiplier: 1 }),
    getFx: async () => 950,
  };
}

async function quoteError(
  run: () => Promise<unknown>,
): Promise<DomainError | null> {
  try {
    await run();
    return null;
  } catch (error) {
    expect(error).toBeInstanceOf(DomainError);
    return error as DomainError;
  }
}

beforeEach(() => {
  __clearAssetsCacheForTests();
  resetDemoState();
});

describe("M54c-fix: vender siempre lo que se tiene", () => {
  it("la compra exige tradable: watch/hidden/desconocido → MINT_NOT_ALLOWED", async () => {
    __setAssetsCacheForTests(listedFixture(), Date.now());
    expect(await requireOperable("C001x", "buy")).toMatchObject({ symbol: "C001x" });
    expect(await quoteError(() => requireOperable("W000x", "buy"))).toMatchObject({
      code: "MINT_NOT_ALLOWED",
    });
    expect(await quoteError(() => requireOperable("H000x", "buy"))).toMatchObject({
      code: "MINT_NOT_ALLOWED",
    });
    expect(await quoteError(() => requireOperable("ZZZ9x", "buy"))).toMatchObject({
      code: "MINT_NOT_ALLOWED",
    });
  });

  it("la venta basta con existir con mint válido: listed/watch/hidden ok, desconocido no", async () => {
    __setAssetsCacheForTests(listedFixture(), Date.now());
    expect(await requireOperable("C001x", "sell")).toMatchObject({ symbol: "C001x" });
    expect(await requireOperable("W000x", "sell")).toMatchObject({ symbol: "W000x" });
    expect(await requireOperable("H000x", "sell")).toMatchObject({ symbol: "H000x" });
    expect(await quoteError(() => requireOperable("ZZZ9x", "sell"))).toMatchObject({
      code: "MINT_NOT_ALLOWED",
    });
  });

  it("demo supabase: compra watch/hidden bloqueada, venta con posición ok", async () => {
    __setAssetsCacheForTests(listedFixture(), Date.now());
    const service = createDemoUserService(stubDeps([{ symbol: "W000x", shares: 5 }]));
    expect(
      await quoteError(() =>
        service.trade.quote("user-1", { side: "buy", symbol: "W000x", amount: 100, amountCurrency: "USDC" }),
      ),
    ).toMatchObject({ code: "MINT_NOT_ALLOWED" });
    expect(
      await quoteError(() =>
        service.trade.quote("user-1", { side: "buy", symbol: "H000x", amount: 100, amountCurrency: "USDC" }),
      ),
    ).toMatchObject({ code: "MINT_NOT_ALLOWED" });
    const sellWatch = await service.trade.quote("user-1", {
      side: "sell",
      symbol: "W000x",
      amount: 1,
      amountCurrency: "SHARES",
    });
    expect(sellWatch.symbol).toBe("W000x");
  });

  it("demo supabase: venta de hidden con posición ok, desconocida no, sin saldo el error de siempre", async () => {
    __setAssetsCacheForTests(listedFixture(), Date.now());
    const service = createDemoUserService(stubDeps([{ symbol: "H000x", shares: 5 }]));
    const sellHidden = await service.trade.quote("user-1", {
      side: "sell",
      symbol: "H000x",
      amount: 1,
      amountCurrency: "SHARES",
    });
    expect(sellHidden.symbol).toBe("H000x");
    expect(
      await quoteError(() =>
        service.trade.quote("user-1", { side: "sell", symbol: "ZZZ9x", amount: 1, amountCurrency: "SHARES" }),
      ),
    ).toMatchObject({ code: "MINT_NOT_ALLOWED" });
    // Vender más de lo que se tiene se rechaza como hoy.
    expect(
      await quoteError(() =>
        service.trade.quote("user-1", { side: "sell", symbol: "H000x", amount: 500, amountCurrency: "SHARES" }),
      ),
    ).toMatchObject({ code: "INSUFFICIENT_FUNDS" });
  });

  it("los 50 curados siguen comprando y vendiendo igual", async () => {
    __setAssetsCacheForTests(listedFixture(), Date.now());
    const symbols = Array.from({ length: 50 }, (_, i) => `C${String(i).padStart(3, "0")}x`);
    const service = createDemoUserService(
      stubDeps(symbols.map((symbol) => ({ symbol, shares: 10 }))),
    );
    for (const symbol of symbols) {
      const buy = await service.trade.quote("user-1", {
        side: "buy",
        symbol,
        amount: 100,
        amountCurrency: "USDC",
      });
      expect(buy.symbol).toBe(symbol);
      const sell = await service.trade.quote("user-1", {
        side: "sell",
        symbol,
        amount: 1,
        amountCurrency: "SHARES",
      });
      expect(sell.symbol).toBe(symbol);
    }
  });

  it("mock: compra watch bloqueada, venta watch sin posición con el error de siempre, venta con posición ok", async () => {
    __setAssetsCacheForTests(listedFixture(), Date.now());
    expect(
      await quoteError(() => mockTrade.quote({ side: "buy", symbol: "W000x", amount: 100, amountCurrency: "USDC" })),
    ).toMatchObject({ code: "MINT_NOT_ALLOWED" });
    // La puerta deja pasar la venta; el saldo la rechaza como siempre.
    expect(
      await quoteError(() =>
        mockTrade.quote({ side: "sell", symbol: "W000x", amount: 1, amountCurrency: "SHARES" }),
      ),
    ).toMatchObject({ code: "INSUFFICIENT_FUNDS" });
    applyBuy("AAPLx", 5, 10, 50);
    const sell = await mockTrade.quote({ side: "sell", symbol: "AAPLx", amount: 1, amountCurrency: "SHARES" });
    expect(sell.symbol).toBe("AAPLx");
  });

  it("el estado por acción expone la seguridad: hidden avisa, watch va en revisión", async () => {
    __setAssetsCacheForTests(listedFixture(), Date.now());
    const hidden = await assetStatus("H000x");
    expect(hidden.safetyStatus).toBe("hidden");
    expect(safetyNoticeForPosition(hidden.safetyStatus)).toBe("hidden");
    const watch = await assetStatus("W000x");
    expect(watch.safetyStatus).toBe("watch");
    expect(watch.underReview).toBe(true);
    expect(safetyNoticeForPosition(watch.safetyStatus)).toBe("review");
    const listed = await assetStatus("C001x");
    expect(safetyNoticeForPosition(listed.safetyStatus)).toBeNull();
    expect(safetyNoticeForPosition("unknown")).toBeNull();
    expect(safetyNoticeForPosition(null)).toBeNull();
  });

  it("la cartera marca hidden con el aviso en ambos idiomas", () => {
    expect(esCL.portfolio.hiddenNotice).toBe("Ya no está disponible para comprar. Puedes vender tu posición.");
    expect(en.portfolio.hiddenNotice).toBe("No longer available to buy. You can sell your position.");
  });
});
