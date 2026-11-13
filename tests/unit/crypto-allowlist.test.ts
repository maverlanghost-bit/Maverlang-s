import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GENERATED_TICKERS } from "@/config/tickers.generated";
import { DomainError } from "@/lib/api/result";
import {
  __clearAssetsCacheForTests,
  __setAssetsCacheForTests,
  type CatalogAsset,
} from "@/lib/catalog/assets";
import { cryptoBySymbol } from "@/lib/catalog/crypto";
import { isTradableMint, requireOperable } from "@/lib/catalog/tradable";
import { assertCryptoDemoOnly } from "@/lib/trade/crypto-real-block";

/** Mint Wormhole de WBTC Portal: alternativa AMARILLO de BTC que NO se ofrece. */
const WBTC_PORTAL_MINT = "3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh";
const FAKE_MINT = "FakeMint111111111111111111111111111111111";

/** Texto EXACTO de §1.1: la cuenta real no compra criptos ni staking. */
const BLOQUEO_REAL =
  "La compra de criptos y el staking están solo en la demo hasta una revisión legal.";

const AAPL_MINT = GENERATED_TICKERS.find((ticker) => ticker.symbol === "AAPLx")!.mint;

/** Fila de acción del catálogo cacheado (misma forma que usa `tradable.ts`). */
function stockAsset(patch: Partial<CatalogAsset> & { symbol: string; mint: string }): CatalogAsset {
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

async function domainFailure(run: () => Promise<unknown>): Promise<DomainError | null> {
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
  // Ningún test de este archivo puede salir a la red.
  vi.stubGlobal("fetch", async () => {
    throw new Error("sin red en tests");
  });
});

afterEach(() => {
  __clearAssetsCacheForTests();
  vi.unstubAllGlobals();
});

describe("allowlist de cripto (§1.3 y §1.4)", () => {
  it("BTC se compra solo como cbBTC de Coinbase", async () => {
    const btc = await requireOperable("BTC", "buy");
    expect(btc.symbol).toBe("BTC");
    expect(btc.mint).toBe("cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij");
    expect(btc.mint).toBe(cryptoBySymbol.get("BTC")?.mint);
    expect(await isTradableMint("cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij")).toBe(true);
  });

  it("también deja vender una cripto que ya se tiene", async () => {
    const sol = await requireOperable("SOL", "sell");
    expect(sol).toMatchObject({
      symbol: "SOL",
      mint: "So11111111111111111111111111111111111111112",
    });
  });

  it("WBTC y su mint Wormhole quedan fuera: MINT_NOT_ALLOWED", async () => {
    expect(await domainFailure(() => requireOperable("WBTC", "buy"))).toMatchObject({
      code: "MINT_NOT_ALLOWED",
    });
    expect(await isTradableMint(WBTC_PORTAL_MINT)).toBe(false);
    expect(await isTradableMint(FAKE_MINT)).toBe(false);
    expect(await domainFailure(() => requireOperable("ZZZZ", "buy"))).toMatchObject({
      code: "MINT_NOT_ALLOWED",
    });
  });

  it("un LST de Ganar se opera con su mint exacto", async () => {
    const jito = await requireOperable("JitoSOL", "buy");
    expect(jito.mint).toBe("J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn");
    expect(await isTradableMint("J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn")).toBe(true);
  });

  it("las acciones de fixture siguen comprando igual", async () => {
    __setAssetsCacheForTests(
      [stockAsset({ symbol: "AAPLx", name: "Apple", mint: AAPL_MINT })],
      Date.now(),
    );
    const aapl = await requireOperable("AAPLx", "buy");
    expect(aapl.symbol).toBe("AAPLx");
    expect(aapl.mint).toBe(AAPL_MINT);
    expect(await isTradableMint(AAPL_MINT)).toBe(true);
  });
});

describe("bloqueo de cuenta real para cripto y staking (§1.1)", () => {
  it("lanza VALIDATION con el texto exacto en cripto, LST y USDY", () => {
    for (const symbol of ["BTC", "SOL", "LINK", "JitoSOL", "dSOL", "USDY"]) {
      let thrown: unknown = null;
      try {
        assertCryptoDemoOnly(symbol, true);
      } catch (error) {
        thrown = error;
      }
      expect(thrown, symbol).toBeInstanceOf(DomainError);
      expect((thrown as DomainError).code, symbol).toBe("VALIDATION");
      expect((thrown as DomainError).message, symbol).toBe(BLOQUEO_REAL);
    }
  });

  it("la demo y las acciones no se bloquean", () => {
    expect(() => assertCryptoDemoOnly("BTC", false)).not.toThrow();
    expect(() => assertCryptoDemoOnly("JitoSOL", false)).not.toThrow();
    expect(() => assertCryptoDemoOnly("AAPLx", true)).not.toThrow();
  });
});
