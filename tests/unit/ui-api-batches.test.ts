import { afterEach, describe, expect, it, vi } from "vitest";
import { getHistories, getPrices } from "@/lib/api/client";

const symbols = Array.from({ length: 121 }, (_, index) => `SYM${index}`);
const input = [...symbols, " sym0 ", "sym50", "SYM120", " "];

afterEach(() => vi.unstubAllGlobals());

describe.each(["prices", "histories"] as const)("%s batch reads", (kind) => {
  const read = () => kind === "prices" ? getPrices(input) : getHistories(input, "1W");

  function mockFetch(failSecond = false) {
    const requests: string[][] = [];
    let active = 0;
    let peak = 0;
    vi.stubGlobal("fetch", async (request: RequestInfo | URL) => {
      const url = new URL(String(request), "http://localhost");
      const batch = (url.searchParams.get("symbols") ?? "").split(",");
      requests.push(batch);
      const number = requests.length;
      active += 1;
      peak = Math.max(peak, active);
      // Yield so concurrent requests overlap without real HTTP or timers.
      await Promise.resolve();
      active -= 1;
      if (failSecond && number === 2) return Response.json({ ok: false, error: { code: "UPSTREAM", message: "Batch failed" } }, { status: 502 });
      const data = kind === "prices"
        ? batch.map((symbol) => ({ symbol, priceUsd: 10, change24hPct: 0, multiplier: 1, updatedAt: "2026-01-01T00:00:00.000Z", source: "jupiter" }))
        : { series: batch.map((symbol) => ({ symbol, points: [{ t: 1_000, p: 10 }, { t: 2_000, p: 11 }], source: "ticks", real: true })) };
      return Response.json({ ok: true, data });
    });
    return { requests, peak: () => peak };
  }

  it("deduplicates case-insensitively, splits at 50 and limits concurrency to two", async () => {
    const mock = mockFetch();
    const result = await read();
    expect(mock.requests.map((batch) => batch.length)).toEqual([50, 50, 21]);
    expect(mock.requests.flat()).toEqual(symbols);
    expect(mock.peak()).toBe(2);
    expect(result.map((item) => item.symbol)).toEqual(symbols);
  });

  it("rejects the complete read when one batch fails", async () => {
    mockFetch(true);
    await expect(read()).rejects.toMatchObject({ code: "UPSTREAM", status: 502 });
  });
});
