import { describe, expect, it } from "vitest";

import { fetchUnderlyingChanges, parseYahooDailyChange, yahooSymbol } from "@/lib/market/underlying-move";

describe("variación del subyacente", () => {
  it("pasa el porcentaje de Yahoo a ratio", () => {
    expect(yahooSymbol("brk.b")).toBe("BRK-B");
    expect(parseYahooDailyChange({ chart: { result: [{ meta: { regularMarketChangePercent: -0.389 } }] } })).toBeCloseTo(
      -0.00389,
      6,
    );
    expect(parseYahooDailyChange({ chart: { result: [{ meta: {} }] } })).toBeNull();
    expect(parseYahooDailyChange(null)).toBeNull();
  });

  it("consulta cada subyacente una vez y no inventa si falla", async () => {
    const fetchImpl = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/AAL?")) {
        return new Response(
          JSON.stringify({ chart: { result: [{ meta: { regularMarketChangePercent: -0.389 } }] } }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response("no", { status: 404 });
    }) as typeof fetch;
    const cache = new Map();
    const first = await fetchUnderlyingChanges(["AAL", "AAL", "ZZZZ"], {
      fetchImpl,
      cache,
      now: () => 1_000,
      timeoutMs: 50,
    });
    expect(first.get("AAL")).toBeCloseTo(-0.00389, 6);
    expect(first.has("ZZZZ")).toBe(false);
    const second = await fetchUnderlyingChanges(["AAL", "ZZZZ"], {
      fetchImpl: (async () => {
        throw new Error("no debería llamarse: está en caché");
      }) as typeof fetch,
      cache,
      now: () => 1_500,
      timeoutMs: 50,
    });
    expect(second.get("AAL")).toBeCloseTo(-0.00389, 6);
    expect(second.has("ZZZZ")).toBe(false);
  });
});
