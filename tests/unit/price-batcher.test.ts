import { describe, expect, it, vi } from "vitest";

import { tickerBySymbol } from "@/config/tickers";
import { DomainError } from "@/lib/api/result";
import {
  createPriceBatcherCache,
  fetchMintBatch,
  listBatchedQuotes,
  PRICE_BATCH_MAX_IDS,
  type MintBatchOptions,
} from "@/lib/market/price-batcher";

const NOW = 1_700_000_000_000;
const PRICE_URL = "https://api.jup.ag/price/v3";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function pricesFor(mints: readonly string[], price = 100): Record<string, { usdPrice: number; priceChange24h: number }> {
  return Object.fromEntries(mints.map((mint, index) => [mint, { usdPrice: price + index, priceChange24h: 1 }]));
}

function options(fetchImpl: typeof fetch, patch: Partial<MintBatchOptions> = {}): MintBatchOptions {
  return {
    priceUrl: PRICE_URL,
    fetchImpl,
    timeoutMs: 50,
    cache: createPriceBatcherCache(),
    now: () => NOW,
    sleep: async () => {},
    ...patch,
  };
}

function fakeMints(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `Mint${index}11111111111111111111111111111111`);
}

describe("mercado escalable: batcher de precios", () => {
  it(`agrupa en lotes de hasta ${PRICE_BATCH_MAX_IDS}`, async () => {
    const mints = fakeMints(55);
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      const ids = new URL(url).searchParams.get("ids")?.split(",") ?? [];
      return jsonResponse(pricesFor(ids));
    });

    const result = await fetchMintBatch(mints, options(fetchImpl));

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const sizes = fetchImpl.mock.calls.map((call) => new URL(String(call[0])).searchParams.get("ids")?.split(",").length);
    expect(sizes).toEqual([50, 5]);
    expect(result.size).toBe(55);
    expect(result.get(mints[0])).toMatchObject({ stale: false });
  });

  it("usa la cache por mint 15 s", async () => {
    const mints = fakeMints(3);
    let now = NOW;
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse(pricesFor(mints, 10)));
    const cache = createPriceBatcherCache();
    const shared = options(fetchImpl, { cache, now: () => now });

    await fetchMintBatch(mints, shared);
    now = NOW + 14_000;
    await fetchMintBatch(mints, shared);
    expect(fetchImpl).toHaveBeenCalledOnce();

    now = NOW + 15_000;
    await fetchMintBatch(mints, shared);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("ante un 429 devuelve el último valor marcado stale", async () => {
    const mints = fakeMints(2);
    let now = NOW;
    let fail = false;
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      if (fail) return jsonResponse({ error: "límite" }, 429);
      return jsonResponse(pricesFor(mints, 77));
    });
    const cache = createPriceBatcherCache();
    const shared = options(fetchImpl, { cache, now: () => now });

    const fresh = await fetchMintBatch(mints, shared);
    expect(fresh.get(mints[0])).toMatchObject({ usdPrice: 77, stale: false });

    fail = true;
    now = NOW + 16_000;
    const stale = await fetchMintBatch(mints, shared);
    // 1 inicial + 1 intento + 2 reintentos (backoff por defecto).
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(stale.get(mints[0])).toMatchObject({ usdPrice: 77, stale: true });
  });

  it("reintenta con espera y vuelve a lo fresco", async () => {
    const mints = fakeMints(1);
    const waits: number[] = [];
    let calls = 0;
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      calls += 1;
      if (calls === 1) return jsonResponse({ error: "límite" }, 429);
      return jsonResponse(pricesFor(mints, 55));
    });

    const result = await fetchMintBatch(
      mints,
      options(fetchImpl, { sleep: async (ms) => { waits.push(ms); } }),
    );

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(waits).toEqual([250, 800].slice(0, 1));
    expect(result.get(mints[0])).toMatchObject({ usdPrice: 55, stale: false });
  });

  it("junta pedidos iguales en vuelo en una sola llamada", async () => {
    const mints = fakeMints(4);
    let release!: (value: Response) => void;
    const gate = new Promise<Response>((resolve) => {
      release = resolve;
    });
    const fetchImpl = vi.fn<typeof fetch>(async () => gate);
    const shared = options(fetchImpl);

    const first = fetchMintBatch(mints, shared);
    const second = fetchMintBatch(mints, shared);
    release(jsonResponse(pricesFor(mints, 9)));
    const [a, b] = await Promise.all([first, second]);

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(a.get(mints[0])?.usdPrice).toBe(9);
    expect(b.get(mints[3])?.usdPrice).toBe(12);
  });

  it("la clave va en el header y no en la URL", async () => {
    const mints = fakeMints(1);
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse(pricesFor(mints)));

    await fetchMintBatch(mints, options(fetchImpl, { apiKey: "secret-key" }));

    const url = String(fetchImpl.mock.calls[0]?.[0]);
    expect(url).not.toContain("secret-key");
    expect(fetchImpl.mock.calls[0]?.[1]?.headers).toMatchObject({ "x-api-key": "secret-key" });
  });

  it("listBatchedQuotes pasa el precio tal cual y marca stale o referencia", async () => {
    const aapl = tickerBySymbol("AAPLx");
    const nvda = tickerBySymbol("NVDAx");
    if (!aapl || !nvda) throw new Error("faltan tickers");
    let now = NOW;
    let fail = false;
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      if (fail) return jsonResponse({ error: "límite" }, 429);
      return jsonResponse({
        [aapl.mint]: { usdPrice: 230.5, priceChange24h: 1.29 },
        [nvda.mint]: { usdPrice: 140.25, priceChange24h: -2 },
      });
    });
    const cache = createPriceBatcherCache();
    const shared = options(fetchImpl, { cache, now: () => now });

    const fresh = await listBatchedQuotes(["AAPLx", "NVDAx"], shared);
    expect(fresh[0]).toMatchObject({ symbol: "AAPLx", priceUsd: 230.5, change24hPct: 0.0129, source: "jupiter" });
    expect(fresh[0]?.stale).toBeUndefined();

    fail = true;
    now = NOW + 16_000;
    const stale = await listBatchedQuotes(["AAPLx", "NVDAx"], shared);
    expect(stale[0]).toMatchObject({ symbol: "AAPLx", priceUsd: 230.5, stale: true, source: "jupiter" });

    const unknown = await listBatchedQuotes(["AAPLx"], {
      ...shared,
      fetchImpl: (async () => jsonResponse({})) as typeof fetch,
      cache: createPriceBatcherCache(),
    });
    expect(unknown[0]).toMatchObject({ symbol: "AAPLx", source: "mock", reference: true });
  });

  it("un símbolo desconocido no llama a la red", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({}));
    await expect(listBatchedQuotes(["NOPE"], options(fetchImpl))).rejects.toBeInstanceOf(DomainError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
