import { afterEach, describe, expect, it, vi } from "vitest";

import { cryptoBySymbol, maxOrderUsdFor } from "@/lib/catalog/crypto";
import { lstBySymbol } from "@/lib/catalog/lst";
import type { DemoDeps } from "@/lib/services/demo.supabase";

/** Texto de precio que ya usa la demo cuando Jupiter no responde. */
const PRICE_MESSAGE = "No pudimos obtener el precio, intenta en un momento.";
const SOL_MINT = "So11111111111111111111111111111111111111112";

interface MintResolution {
  mint: string;
  decimals: number;
}

type MintForBalances = (symbol: string) => Promise<MintResolution | null>;

/**
 * `mintForBalances` es interna de `demo.supabase.ts` y G3 la exporta para que
 * la cartera muestre cripto/LST con sus decimales reales (deja de asumir 8).
 */
async function resolveMint(symbol: string): Promise<MintResolution | null> {
  vi.resetModules();
  const demoModule = (await import("@/lib/services/demo.supabase")) as unknown as {
    mintForBalances?: MintForBalances;
  };
  const resolver = demoModule.mintForBalances;
  if (typeof resolver !== "function") {
    throw new Error("lib/services/demo.supabase.ts no exporta mintForBalances");
  }
  return resolver(symbol);
}

function demoDeps(): DemoDeps {
  return {
    loadAccount: async () => ({ cashUsd: 10_000, initialUsd: 10_000, resetCount: 0 }),
    createAccount: async () => ({ cashUsd: 10_000, initialUsd: 10_000, resetCount: 0 }),
    listPositions: async () => [],
    listOrders: async () => [],
    getOrder: async () => null,
    runTrade: async () => ({ cashUsd: 10_000, totalUsd: 0, priceUsd: 0 }),
    runReset: async () => ({ cashUsd: 10_000, resetCount: 0 }),
    // Si el camino cripto usara el spot de acciones, la cotización saldría a 200.
    getSpot: async () => ({ priceUsd: 200, multiplier: 1 }),
    getFx: async () => 950,
  };
}

interface Failure {
  code?: string;
  message: string;
}

async function failureOf(run: () => Promise<unknown>): Promise<Failure | null> {
  try {
    await run();
    return null;
  } catch (error) {
    if (error instanceof Error) {
      const failure = error as Error & { code?: string };
      return { code: failure.code, message: failure.message };
    }
    return { message: String(error) };
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("demo: saldos con decimales reales (§G3)", () => {
  it("mintForBalances(\"SOL\") trae el mint nativo y 9 decimales", async () => {
    const sol = await resolveMint("SOL");
    expect(sol).not.toBeNull();
    expect(sol?.mint).toBe(SOL_MINT);
    expect(sol?.mint).toBe(cryptoBySymbol.get("SOL")?.mint);
    expect(sol?.decimals).toBe(9);
    // La primera importación de `demo.supabase` es pesada en este PC (8 GB): margen holgado.
  }, 60_000);

  it("un LST también resuelve su mint y sus 9 decimales", async () => {
    const jito = await resolveMint("JitoSOL");
    expect(jito?.mint).toBe(lstBySymbol.get("JitoSOL")?.mint);
    expect(jito?.decimals).toBe(9);
  });

  it("una acción sigue con sus 8 decimales de siempre", async () => {
    const aapl = await resolveMint("AAPLx");
    expect(aapl?.decimals).toBe(8);
  });
});

describe("demo: topes y cotización cripto (§1.6 y §G3)", () => {
  it("el tope de LINK es US$100: 101 queda fuera", () => {
    const topeLink = maxOrderUsdFor("LINK");
    expect(topeLink).toBe(100);
    expect(101).toBeGreaterThan(topeLink ?? 0);
    expect(maxOrderUsdFor("BTC")).toBe(1000);
    expect(maxOrderUsdFor("PEPE")).toBe(500);
  });

  it("si Jupiter no cotiza, la compra demo de SOL no inventa precio", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return new Response("sin precio", { status: 400 });
    });
    vi.resetModules();

    const demoModule = await import("@/lib/services/demo.supabase");
    const service = demoModule.createDemoUserService(demoDeps());
    const failure = await failureOf(() =>
      service.trade.quote("user-1", {
        side: "buy",
        symbol: "SOL",
        amount: 50,
        amountCurrency: "USDC",
      }),
    );

    expect(failure?.code).toBe("UPSTREAM");
    expect(failure?.message).toBe(PRICE_MESSAGE);
    // La orden se pidió a Jupiter por el mint exacto de SOL (USDC → SOL).
    expect(urls.some((url) => url.includes(SOL_MINT))).toBe(true);
  });

  it("una acción sigue cotizando con el spot mock, sin llamar a Jupiter", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return new Response("no", { status: 500 });
    });
    vi.resetModules();

    const demoModule = await import("@/lib/services/demo.supabase");
    const service = demoModule.createDemoUserService(demoDeps());
    const quote = await service.trade.quote("user-1", {
      side: "buy",
      symbol: "AAPLx",
      amount: 100,
      amountCurrency: "USDC",
    });

    expect(quote.symbol).toBe("AAPLx");
    expect(quote.pricePerShareUsd).toBe(200);
    expect(quote.route).toBe("mock");
    // Nunca se pide una orden de Jupiter para una acción.
    expect(urls.some((url) => url.includes("jup.ag"))).toBe(false);
  });
});
