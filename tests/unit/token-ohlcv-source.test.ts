import { describe, expect, it } from "vitest";

import {
  COINGECKO_DEMO_ONCHAIN_URL,
  COINGECKO_PRO_ONCHAIN_URL,
  GECKO_BASE_URL,
  RATE_MAX_CALLS_BY_PLAN,
  createTokenOhlcv,
  tokenOhlcvSource,
} from "@/lib/market/token-ohlcv";

/** T93: con clave de CoinGecko las velas del token usan su API on-chain y más cupo. */
describe("T93: origen de las velas del token", () => {
  it("sin clave usa GeckoTerminal público con el cupo chico", () => {
    expect(tokenOhlcvSource(undefined, "demo")).toEqual({ plan: "free", baseUrl: GECKO_BASE_URL, headers: {}, rateMaxCalls: RATE_MAX_CALLS_BY_PLAN.free });
    expect(tokenOhlcvSource("   ", "pro").plan).toBe("free");
  });

  it("clave demo: api.coingecko.com con su cabecera", () => {
    const source = tokenOhlcvSource("abc", "demo");
    expect(source.baseUrl).toBe(COINGECKO_DEMO_ONCHAIN_URL);
    expect(source.headers).toEqual({ "x-cg-demo-api-key": "abc" });
    expect(source.rateMaxCalls).toBe(RATE_MAX_CALLS_BY_PLAN.demo);
  });

  it("clave pro: pro-api.coingecko.com con su cabecera", () => {
    const source = tokenOhlcvSource("xyz", "pro");
    expect(source.baseUrl).toBe(COINGECKO_PRO_ONCHAIN_URL);
    expect(source.headers).toEqual({ "x-cg-pro-api-key": "xyz" });
    expect(source.rateMaxCalls).toBe(RATE_MAX_CALLS_BY_PLAN.pro);
  });

  it("el proveedor manda la cabecera de la clave y respeta el tope por minuto", async () => {
    const seen: { url: string; key: string | null }[] = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      seen.push({ url: String(input), key: headers.get("x-cg-pro-api-key") });
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }) as typeof fetch;
    const provider = createTokenOhlcv({ fetchImpl, baseUrl: COINGECKO_PRO_ONCHAIN_URL, headers: { "x-cg-pro-api-key": "xyz" }, rateMaxCalls: 1, now: () => 1_000 });
    await provider.resolvePool("mintA");
    await provider.resolvePool("mintB");
    expect(seen).toHaveLength(1);
    expect(seen[0]?.url.startsWith(COINGECKO_PRO_ONCHAIN_URL)).toBe(true);
    expect(seen[0]?.key).toBe("xyz");
  });
});
