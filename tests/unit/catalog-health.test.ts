import { beforeEach, describe, expect, it, vi } from "vitest";

import { GENERATED_TICKERS } from "@/config/tickers.generated";
import { USDC_MINT } from "@/config/tickers";
import { en } from "@/content/i18n/en";
import { esCL } from "@/content/i18n/es-CL";
import type { SafetyMonitorDeps } from "@/lib/catalog/monitor";
import { runSafetyBatch } from "@/lib/catalog/monitor";
import {
  __clearAssetsCacheForTests,
  __setAssetsCacheForTests,
  annotateSafety,
  type CatalogAsset,
} from "@/lib/catalog/assets";
import { applyBuy, resetDemoState } from "@/lib/mocks/demo-state";

type AdminClient = NonNullable<SafetyMonitorDeps["admin"]>;

const MINT_AUTH = "7pt9tkctJPK7PPNQJ77GKg8ZffSF6QxoMiCFYHxrtaCj";
const FREEZE_AUTH = "JDq14BWvqCRFNu1krb12bcRpbGtJZ1FLEakMw6FdxJNs";
const TOKEN_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

const PASS_MINT = `Xs${"1".repeat(41)}`;
const COST_MINT = `Xs${"2".repeat(41)}`;
const HALT_MINT = `Xs${"3".repeat(41)}`;

function prevRow(patch: Record<string, unknown>) {
  return {
    symbol: "",
    mint_solana: null,
    issuer: "xstocks",
    company_ticker: null,
    category: "tech",
    enabled: true,
    is_trading_halted: false,
    current_period: "market",
    safety_status: "listed",
    consecutive_passes: 0,
    consecutive_fails: 0,
    manual_override: null,
    safety_session: "market",
    listed_at: null,
    hidden_at: null,
    ...patch,
  };
}

const PREV_ROWS = [
  prevRow({ symbol: "PASSx", mint_solana: PASS_MINT, company_ticker: "PASS" }),
  prevRow({ symbol: "COSTx", mint_solana: COST_MINT, company_ticker: "COST" }),
  prevRow({ symbol: "HALTx", mint_solana: HALT_MINT, company_ticker: "HALT" }),
];

function xstocksNode(symbol: string, mint: string, halted: boolean) {
  return {
    symbol,
    name: `${symbol} Inc`,
    mint,
    exchangeMic: "XNAS",
    underlyingCurrency: "USD",
    isTradingHalted: halted,
    trading: { isTradingHalted: halted },
    refPrice: 100,
  };
}

function jupToken(symbol: string, mint: string) {
  return {
    id: mint,
    symbol,
    isVerified: true,
    tags: ["xstocks"],
    mintAuthority: MINT_AUTH,
    freezeAuthority: FREEZE_AUTH,
    tokenProgram: TOKEN_PROGRAM,
    decimals: 8,
    liquidity: 50_000,
  };
}

function jupPrice() {
  return { usdPrice: 100, stockData: { price: 100 }, scaledUiConfig: null };
}

function orderBody(inAmount: string, outAmount: string) {
  return { inAmount, outAmount, routePlan: [{ swapInfo: { label: "Raydium" } }] };
}

/**
 * buy100 con costo ~50 bps (pasa), buy1000 igual, venta según el mint:
 * PASSx a 100 bps (pasa), COSTx a 210 bps (falla en market → watch).
 */
function quoteFor(inputMint: string, outputMint: string, amount: string): unknown {
  const isBuy = inputMint === USDC_MINT;
  const mint = isBuy ? outputMint : inputMint;
  if (mint !== PASS_MINT && mint !== COST_MINT) return null;
  if (isBuy && amount === String(100 * 1e6)) return orderBody(amount, "99502488");
  if (isBuy && amount === String(1000 * 1e6)) return orderBody(amount, "995024875");
  if (!isBuy) {
    return mint === PASS_MINT ? orderBody(amount, "99000000") : orderBody(amount, "97900000");
  }
  return null;
}

function fakeFetch(input: string | URL | Request): Promise<Response> {
  const url = String(input instanceof Request ? input.url : input);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  if (url.startsWith("https://api.xstocks.fi/api/v2/public/assets/")) {
    const symbol = decodeURIComponent(url.split("/").pop() ?? "");
    if (symbol === "PASSx") return Promise.resolve(json(xstocksNode("PASSx", PASS_MINT, false)));
    if (symbol === "COSTx") return Promise.resolve(json(xstocksNode("COSTx", COST_MINT, false)));
    if (symbol === "HALTx") return Promise.resolve(json(xstocksNode("HALTx", HALT_MINT, true)));
    return Promise.resolve(json({ error: "no existe" }, 404));
  }
  if (url.includes("tokens/v2/search")) {
    return Promise.resolve(
      json([jupToken("PASSx", PASS_MINT), jupToken("COSTx", COST_MINT), jupToken("HALTx", HALT_MINT)]),
    );
  }
  if (url.includes("price/v3")) {
    return Promise.resolve(
      json({ data: { [PASS_MINT]: jupPrice(), [COST_MINT]: jupPrice(), [HALT_MINT]: jupPrice() } }),
    );
  }
  if (url.includes("swap/v2/order")) {
    const parsed = new URL(url);
    const body = quoteFor(
      parsed.searchParams.get("inputMint") ?? "",
      parsed.searchParams.get("outputMint") ?? "",
      parsed.searchParams.get("amount") ?? "",
    );
    if (!body) return Promise.resolve(json({ error: "sin ruta" }, 400));
    return Promise.resolve(json(body));
  }
  return Promise.resolve(json({ error: "inesperado" }, 500));
}

function createFakeAdmin(rows: Array<Record<string, unknown>>) {
  const upserted: unknown[][] = [];
  const inserted: unknown[][] = [];
  const fake = {
    from(table: string) {
      if (table === "assets") {
        const query = {
          statuses: ["listed", "watch"],
          from: 0,
          to: 24,
          in(column: string, values: string[]) {
            void column;
            query.statuses = values;
            return query;
          },
          order(column: string, options?: unknown) {
            void column;
            void options;
            return query;
          },
          range(from: number, to: number) {
            query.from = from;
            query.to = to;
            return query;
          },
          async upsert(batch: unknown[]) {
            upserted.push(batch);
            return { error: null };
          },
          then(resolve: (value: unknown) => void) {
            const filtered = rows.filter((row) => query.statuses.includes(String(row.safety_status)));
            resolve({
              data: filtered.slice(query.from, query.to + 1),
              error: null,
              count: filtered.length,
            });
          },
        };
        return {
          select: () => query,
          upsert: query.upsert,
        };
      }
      return {
        insert: async (batch: unknown[]) => {
          inserted.push(batch);
          return { error: null };
        },
      };
    },
  };
  return { admin: fake as unknown as AdminClient, upserted, inserted };
}

const noSleep = async () => {};

beforeEach(() => {
  __clearAssetsCacheForTests();
  resetDemoState();
  vi.restoreAllMocks();
});

describe("M55: lote de vigilancia del catálogo", () => {
  it("3 activos: uno pasa, uno falla por costo en market → watch, uno suspendido → hidden", async () => {
    const { admin, upserted, inserted } = createFakeAdmin(PREV_ROWS.map((row) => ({ ...row })));
    const warned: string[] = [];
    vi.spyOn(console, "warn").mockImplementation((message: string) => {
      warned.push(String(message));
    });
    const summary = await runSafetyBatch(
      { offset: 0, limit: 25 },
      { fetchImpl: fakeFetch as unknown as typeof fetch, admin, paceMs: 0, sleep: noSleep },
    );
    expect(summary).toEqual({ checked: 3, changed: 2, remaining: 0 });
    expect(upserted).toHaveLength(1);
    const batch = upserted[0] as Array<Record<string, unknown>>;
    expect(batch.map((row) => [row.symbol, row.safety_status])).toEqual([
      ["PASSx", "listed"],
      ["COSTx", "watch"],
      ["HALTx", "hidden"],
    ]);
    expect(inserted).toHaveLength(1);
    const events = inserted[0] as Array<Record<string, unknown>>;
    expect(events.map((event) => [event.symbol, event.status_before, event.status_after])).toEqual([
      ["COSTx", "listed", "watch"],
      ["HALTx", "listed", "hidden"],
    ]);
    expect(warned.join("\n")).toContain("[catalog-health] COSTx listed→watch: costo_venta_100_210bps");
    expect(warned.join("\n")).toContain("[catalog-health] HALTx listed→hidden: suspendido");
  });

  it("respeta el presupuesto de tiempo con un reloj falso", async () => {
    const { admin, upserted } = createFakeAdmin(PREV_ROWS.map((row) => ({ ...row })));
    let tick = 0;
    const now = () => tick;
    const slowFetch = async (input: string | URL | Request) => {
      tick += 15_000;
      return fakeFetch(input);
    };
    const summary = await runSafetyBatch(
      { offset: 0, limit: 25 },
      {
        fetchImpl: slowFetch as unknown as typeof fetch,
        admin,
        now,
        sleep: noSleep,
        paceMs: 0,
        timeBudgetMs: 50_000,
      },
    );
    expect(summary.checked).toBeLessThan(3);
    expect(summary.remaining).toBeGreaterThan(0);
    expect(summary.checked + summary.remaining).toBe(3);
    const total = upserted.flat().length;
    expect(total).toBe(summary.checked);
  });
});

/** Mint base58 con forma xStocks (`Xs` + 41 caracteres). */
function mintFor(index: number): string {
  const digits = String(index + 11).replaceAll("0", "2");
  return `Xs${digits.padStart(41, "1")}`;
}

function catalogAsset(patch: Partial<CatalogAsset> & { symbol: string; mint: string }): CatalogAsset {
  return {
    name: patch.symbol,
    underlying: patch.symbol.replace(/x$/i, ""),
    category: "tech",
    logoLocal: null,
    enabled: true,
    halted: false,
    liquidityUsd: 50_000,
    curated: false,
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

function quoteFixture(): CatalogAsset[] {
  return annotateSafety(
    [
      catalogAsset({ symbol: "LSTDx", mint: mintFor(1), safetyStatus: "listed" }),
      catalogAsset({ symbol: "AAPLx", name: "Apple", underlying: "AAPL", mint: AAPL_MINT, curated: true, safetyStatus: "watch" }),
    ],
    true,
  );
}

const SITE = "http://localhost:3000";

function postQuote(body: unknown): Request {
  return new Request(`${SITE}/api/trade/quote`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: SITE },
    body: JSON.stringify(body),
  });
}

describe("M55: guardia en vivo al cotizar (sólo compra)", () => {
  // La primera importación de la ruta es pesada (cadena de servicios):
  // se le da margen sin tocar el resto del suite.
  it(
    "la compra demo de un activo en revisión responde ASSET_UNAVAILABLE con el texto humano",
    async () => {
    __setAssetsCacheForTests(quoteFixture(), Date.now());
    const { POST } = await import("@/app/api/trade/quote/route");
    const response = await POST(
      postQuote({ side: "buy", symbol: "AAPLx", amount: 100, amountCurrency: "USDC" }),
    );
    expect(response.status).toBe(409);
    const payload = (await response.json()) as { ok: boolean; error?: { code: string; message: string } };
    expect(payload.error?.code).toBe("ASSET_UNAVAILABLE");
    expect(payload.error?.message).toBe("Este activo está en revisión y no se puede operar ahora.");
    },
    30_000,
  );

  it(
    "la venta de una posición en revisión sigue permitida (M54c)",
    async () => {
    __setAssetsCacheForTests(quoteFixture(), Date.now());
    applyBuy("AAPLx", 5, 10, 50);
    const { POST } = await import("@/app/api/trade/quote/route");
    const response = await POST(
      postQuote({ side: "sell", symbol: "AAPLx", amount: 1, amountCurrency: "SHARES" }),
    );
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { ok: boolean; data?: { symbol: string } };
    expect(payload.data?.symbol).toBe("AAPLx");
    },
    30_000,
  );

  it("la compra desconocida sigue MINT_NOT_ALLOWED", async () => {
    __setAssetsCacheForTests(quoteFixture(), Date.now());
    const { POST } = await import("@/app/api/trade/quote/route");
    const response = await POST(
      postQuote({ side: "buy", symbol: "ZZZ9x", amount: 100, amountCurrency: "USDC" }),
    );
    expect(response.status).toBe(400);
    const payload = (await response.json()) as { ok: boolean; error?: { code: string } };
    expect(payload.error?.code).toBe("MINT_NOT_ALLOWED");
  });

  it("el texto humano existe en ambos idiomas", () => {
    expect(esCL.trade.errors.ASSET_UNAVAILABLE).toBe(
      "Este activo está en revisión y no se puede operar ahora.",
    );
    expect(en.trade.errors.ASSET_UNAVAILABLE).toBe(
      "This asset is under review and can't be traded right now.",
    );
  });
});
