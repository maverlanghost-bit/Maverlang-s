import { describe, expect, it, vi } from "vitest";

import { tickerBySymbol } from "@/config/tickers";
import { quoteSchema } from "@/lib/api/contracts";
import { DomainError } from "@/lib/api/result";
import { createLivePriceCache, listLiveQuotes, type LiveQuoteOptions } from "@/lib/market/live-quotes";
import { quoteFor } from "@/lib/mocks/prices";

const NOW = 1_700_000_000_000;
const PRICE_URL = "https://api.jup.ag/price/v3";

function ticker(symbol: string) {
  const found = tickerBySymbol(symbol);
  if (!found) throw new Error(`falta ${symbol}`);
  return found;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function options(fetchImpl: typeof fetch, patch: Partial<LiveQuoteOptions> = {}): LiveQuoteOptions {
  return {
    priceUrl: PRICE_URL,
    fetchImpl,
    timeoutMs: 50,
    cacheMs: 10_000,
    now: () => NOW,
    cache: createLivePriceCache(),
    ...patch,
  };
}

describe("precios live", () => {
  it("devuelve el precio de Jupiter y el cambio como ratio", async () => {
    const aapl = ticker("AAPLx");
    const nvda = ticker("NVDAx");
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        [aapl.mint]: { usdPrice: 230.5, priceChange24h: 1.29, decimals: 8 },
        [nvda.mint]: { usdPrice: "140.25", priceChange24h: "-2" },
      }),
    );

    const quotes = await listLiveQuotes(["aaplx", "NVDAx"], options(fetchImpl));

    expect(fetchImpl).toHaveBeenCalledOnce();
    const url = String(fetchImpl.mock.calls[0]?.[0]);
    expect(url.startsWith(`${PRICE_URL}?`)).toBe(true);
    expect(new URL(url).searchParams.get("ids")?.split(",")).toEqual([aapl.mint, nvda.mint]);
    expect(fetchImpl.mock.calls[0]?.[1]?.headers).toMatchObject({ accept: "application/json" });
    expect(quotes[0]).toMatchObject({
      symbol: "AAPLx",
      priceUsd: 230.5,
      change24hPct: 0.0129,
      multiplier: 1,
      source: "jupiter",
      updatedAt: new Date(NOW).toISOString(),
    });
    expect(quotes[0]?.reference).toBeUndefined();
    expect(quotes[1]).toMatchObject({
      symbol: "NVDAx",
      priceUsd: 140.25,
      change24hPct: -0.02,
      source: "jupiter",
    });
  });

  it("si el precio no sirve o falta el mint, ese ticker usa la ancla", async () => {
    const aapl = ticker("AAPLx");
    const nvda = ticker("NVDAx");
    const tsla = ticker("TSLAx");
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        [aapl.mint]: { usdPrice: 0, priceChange24h: 4 },
        [nvda.mint]: { usdPrice: "no", priceChange24h: 1 },
        [tsla.mint]: { usdPrice: -3, priceChange24h: 1 },
      }),
    );
    const cache = createLivePriceCache();
    const shared = options(fetchImpl, { cache });

    const quotes = await listLiveQuotes(["AAPLx", "NVDAx", "TSLAx"], shared);

    expect(quotes.map((quote) => quote.symbol)).toEqual(["AAPLx", "NVDAx", "TSLAx"]);
    for (const symbol of ["AAPLx", "NVDAx", "TSLAx"]) {
      const quote = quotes.find((item) => item.symbol === symbol);
      expect(quote).toMatchObject({
        priceUsd: quoteFor(symbol, NOW).priceUsd,
        source: "mock",
        reference: true,
      });
    }

    await listLiveQuotes(["AAPLx"], shared);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("si Jupiter no trae un ticker, los demás siguen en vivo", async () => {
    const aapl = ticker("AAPLx");
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        [aapl.mint]: { usdPrice: 230.5, priceChange24h: 0 },
      }),
    );

    const quotes = await listLiveQuotes(["AAPLx", "NVDAx"], options(fetchImpl));

    expect(quotes[0]).toMatchObject({ symbol: "AAPLx", priceUsd: 230.5, source: "jupiter" });
    expect(quotes[1]).toMatchObject({
      symbol: "NVDAx",
      priceUsd: quoteFor("NVDAx", NOW).priceUsd,
      source: "mock",
      reference: true,
    });
  });

  it("si la red falla, todos usan la ancla y no reintenta dentro de la cache", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({ error: "no" }, 503));
    let now = NOW;
    const cache = createLivePriceCache();
    const shared = options(fetchImpl, { cache, now: () => now });

    const quotes = await listLiveQuotes(["AAPLx", "NVDAx"], shared);

    expect(quotes.every((quote) => quote.source === "mock" && quote.reference === true)).toBe(true);
    expect(quotes[0]?.priceUsd).toBe(quoteFor("AAPLx", now).priceUsd);

    now = NOW + 1_000;
    await listLiveQuotes(["AAPLx"], shared);
    expect(fetchImpl).toHaveBeenCalledOnce();

    now = NOW + 10_000;
    await listLiveQuotes(["AAPLx"], shared);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("si el tiempo se agota, usa la ancla", async () => {
    const fetchImpl = vi.fn<typeof fetch>(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          const signal = init?.signal;
          if (!signal) {
            reject(new Error("sin señal"));
            return;
          }
          signal.addEventListener("abort", () => {
            reject(new Error("aborted"));
          });
        }),
    );

    const quotes = await listLiveQuotes(["AAPLx"], options(fetchImpl, { timeoutMs: 30 }));

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(quotes[0]).toMatchObject({
      symbol: "AAPLx",
      priceUsd: quoteFor("AAPLx", NOW).priceUsd,
      source: "mock",
      reference: true,
    });
  });

  it("un símbolo desconocido no llama a la red", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => jsonResponse({}));
    const prepareMultipliers = vi.fn(async () => new Map<string, number>());

    await expect(
      listLiveQuotes(["NOPE"], options(fetchImpl, { prepareMultipliers })),
    ).rejects.toBeInstanceOf(DomainError);
    await expect(listLiveQuotes(["NOPE"], options(fetchImpl, { prepareMultipliers }))).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(prepareMultipliers).not.toHaveBeenCalled();
  });

  it("la clave va en el header y no en la URL", async () => {
    const aapl = ticker("AAPLx");
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({ [aapl.mint]: { usdPrice: 10, priceChange24h: 0 } }),
    );

    await listLiveQuotes(["AAPLx"], options(fetchImpl, { apiKey: "secret-key" }));

    const url = String(fetchImpl.mock.calls[0]?.[0]);
    expect(url).not.toContain("secret-key");
    expect(fetchImpl.mock.calls[0]?.[1]?.headers).toMatchObject({ "x-api-key": "secret-key" });
  });

  it("usa el usdPrice de Jupiter tal cual aunque llegue el multiplicador", async () => {
    const aapl = ticker("AAPLx");
    const usdPrice = 332.78;
    const multiplier = 1.00327;
    const body = {
      [aapl.mint]: { usdPrice, usdPricePrescaled: 333.87, priceChange24h: 1.2 },
    };
    const late = await listLiveQuotes(
      ["AAPLx"],
      options(
        vi.fn<typeof fetch>(async () => jsonResponse(body)),
        { prepareMultipliers: async () => new Map() },
      ),
    );
    const ready = await listLiveQuotes(
      ["AAPLx"],
      options(
        vi.fn<typeof fetch>(async () => jsonResponse(body)),
        { prepareMultipliers: async () => new Map([["AAPLx", multiplier]]) },
      ),
    );

    expect(late[0]).toMatchObject({ priceUsd: usdPrice, multiplier: 1, source: "jupiter" });
    expect(ready[0]).toMatchObject({ priceUsd: usdPrice, multiplier, change24hPct: 0.012, source: "jupiter" });
    expect(ready[0]?.priceUsd).not.toBeCloseTo(usdPrice / multiplier, 2);
    expect(333.87 / multiplier).toBeCloseTo(usdPrice, 1);
  });

  it("si el multiplicador falla, muestra el precio de Jupiter con multiplicador 1", async () => {
    const aapl = ticker("AAPLx");
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({ [aapl.mint]: { usdPrice: 200, priceChange24h: 0 } }),
    );

    const quotes = await listLiveQuotes(
      ["AAPLx"],
      options(fetchImpl, {
        prepareMultipliers: async () => {
          throw new Error("rpc");
        },
      }),
    );

    expect(quotes[0]).toMatchObject({ priceUsd: 200, multiplier: 1, source: "jupiter" });
  });

  it("repite la consulta cuando vence la cache", async () => {
    const aapl = ticker("AAPLx");
    let now = NOW;
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({ [aapl.mint]: { usdPrice: 230.5, priceChange24h: 0 } }),
    );
    const shared = options(fetchImpl, { cache: createLivePriceCache(), now: () => now });

    await listLiveQuotes(["AAPLx"], shared);
    now = NOW + 9_000;
    await listLiveQuotes(["AAPLx"], shared);
    expect(fetchImpl).toHaveBeenCalledOnce();

    now = NOW + 10_000;
    await listLiveQuotes(["AAPLx"], shared);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("el contrato deja pasar la fuente y el aviso de referencia", () => {
    const live = quoteSchema.parse({
      symbol: "AAPLx",
      priceUsd: 230.5,
      change24hPct: 0.0129,
      multiplier: 1,
      updatedAt: new Date(NOW).toISOString(),
      source: "jupiter",
    });
    expect(live.reference).toBeUndefined();
    expect(live.source).toBe("jupiter");

    const fallback = quoteSchema.parse({ ...live, source: "mock", reference: true });
    expect(fallback.source).toBe("mock");
    expect(fallback.reference).toBe(true);
  });
});
