import { describe, expect, it, vi } from "vitest";

import {
  createLiveFxCache,
  liveFxRate,
  parseEriaClp,
  readUsdClp,
} from "@/lib/market/live-fx";

const NOW = 1_700_000_000_000;
const FX_URL = "https://mindicador.cl/api/dolar";
const FALLBACK_URL = "https://open.er-api.com/v6/latest/USD";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("M40b: dólar robusto", () => {
  it("timeout -> reintento -> ok", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce(
        jsonResponse({ serie: [{ valor: 984.82, fecha: "2026-10-05T03:00:00.000Z" }] }),
      );
    const cache = createLiveFxCache();
    const parsed = await readUsdClp({
      url: FX_URL,
      fallbackUrl: FALLBACK_URL,
      fetchImpl,
      cache,
      now: () => NOW,
    });
    expect(parsed).toEqual({ rate: 984.82, updatedAt: "2026-10-05T03:00:00.000Z" });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(liveFxRate(parsed!).source).toBe("live");
  });

  it("fallo con last good -> devuelve stale", async () => {
    const cache = createLiveFxCache();
    cache.rate = { rate: 950, updatedAt: "2026-10-04T03:00:00.000Z" };
    cache.storedAt = NOW - 60 * 60 * 1000;
    const down = vi.fn<typeof fetch>(async () => jsonResponse({ error: "no" }, 503));
    const parsed = await readUsdClp({
      url: FX_URL,
      fallbackUrl: FALLBACK_URL,
      fetchImpl: down,
      cache,
      now: () => NOW,
    });
    expect(down).toHaveBeenCalledTimes(3);
    expect(parsed).toMatchObject({ rate: 950, stale: true });
    expect(liveFxRate(parsed!)).toMatchObject({ rate: 950, source: "stale" });
  });

  it("fallo sin last good -> respaldo open.er-api", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      if (String(input).includes("er-api")) {
        return jsonResponse({
          rates: { CLP: 987.65 },
          time_last_update_utc: "2026-10-06T03:00:00.000Z",
        });
      }
      return jsonResponse({ error: "no" }, 503);
    });
    const parsed = await readUsdClp({
      url: FX_URL,
      fallbackUrl: FALLBACK_URL,
      fetchImpl,
      now: () => NOW,
    });
    expect(parsed).toEqual({ rate: 987.65, updatedAt: "2026-10-06T03:00:00.000Z" });
    expect(parseEriaClp({ rates: { CLP: 0 } })).toBeNull();
    expect(parseEriaClp({ rates: {} })).toBeNull();
    expect(parseEriaClp(null)).toBeNull();
  });

  it("todo falla -> error (null)", async () => {
    const down = vi.fn<typeof fetch>(async () => jsonResponse({}, 503));
    const missed = await readUsdClp({
      url: FX_URL,
      fallbackUrl: FALLBACK_URL,
      fetchImpl: down,
      now: () => NOW,
    });
    expect(missed).toBeNull();
  });

  it("fallo recordado 15 s (sin red y con stale)", async () => {
    const cache = createLiveFxCache();
    cache.rate = { rate: 950, updatedAt: "2026-10-04T03:00:00.000Z" };
    cache.storedAt = NOW - 60 * 60 * 1000;
    const down = vi.fn<typeof fetch>(async () => jsonResponse({}, 503));
    const first = await readUsdClp({
      url: FX_URL,
      fallbackUrl: FALLBACK_URL,
      fetchImpl: down,
      cache,
      now: () => NOW,
    });
    expect(first).toMatchObject({ rate: 950, stale: true });
    expect(down).toHaveBeenCalledTimes(3);

    const again = await readUsdClp({
      url: FX_URL,
      fallbackUrl: FALLBACK_URL,
      fetchImpl: down,
      cache,
      now: () => NOW + 5_000,
    });
    expect(again).toMatchObject({ rate: 950, stale: true });
    expect(down).toHaveBeenCalledTimes(3);

    const later = await readUsdClp({
      url: FX_URL,
      fallbackUrl: FALLBACK_URL,
      fetchImpl: down,
      cache,
      now: () => NOW + 16_000,
    });
    expect(later).toMatchObject({ rate: 950, stale: true });
    expect(down).toHaveBeenCalledTimes(6);
  });

  it("dedup en vuelo (una sola llamada a la vez)", async () => {
    let resolveFetch!: (value: Response) => void;
    const gate = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    const fetchImpl = vi.fn<typeof fetch>(() => gate);
    const cache = createLiveFxCache();
    const a = readUsdClp({
      url: FX_URL,
      fallbackUrl: FALLBACK_URL,
      fetchImpl,
      cache,
      now: () => NOW,
    });
    const b = readUsdClp({
      url: FX_URL,
      fallbackUrl: FALLBACK_URL,
      fetchImpl,
      cache,
      now: () => NOW,
    });
    resolveFetch(jsonResponse({ serie: [{ valor: 900, fecha: "2026-10-05T03:00:00.000Z" }] }));
    const [ra, rb] = await Promise.all([a, b]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(ra).toEqual(rb);
    expect(ra).toEqual({ rate: 900, updatedAt: "2026-10-05T03:00:00.000Z" });
  });
});
