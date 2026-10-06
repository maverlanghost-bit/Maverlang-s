import { describe, expect, it, vi } from "vitest";

import { DEMO_WALLET_ADDRESS, buildDemoPortfolio, resetDemoState } from "@/lib/mocks/demo-state";
import { MOCK_USDCLP } from "@/lib/mocks/fx";
import { priceHistory } from "@/lib/mocks/prices";
import { demoSpotPrice } from "@/lib/market/demo-price";
import {
  createLiveFxCache,
  liveFxRate,
  parseMindicadorDolar,
  readUsdClp,
} from "@/lib/market/live-fx";
import { anchorSeriesToSpot, rangeBounds, rangeMove } from "@/lib/market/series";

const NOW = 1_700_000_000_000;
const FX_URL = "https://mindicador.cl/api/dolar";
const SPOT = 332.78;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("serie anclada al spot", () => {
  it("el último punto es el spot y el rango lo contiene", () => {
    const series = priceHistory("AAPLx", "1M", NOW);
    const before = rangeMove(series);
    expect(series[series.length - 1]?.p).toBe(228.4);

    const scaled = anchorSeriesToSpot(series, SPOT);
    const bounds = rangeBounds(scaled);

    expect(scaled[scaled.length - 1]?.p).toBe(SPOT);
    expect(bounds).not.toBeNull();
    expect(bounds!.high).toBeGreaterThanOrEqual(SPOT);
    expect(bounds!.low).toBeLessThanOrEqual(SPOT);
    expect(rangeMove(scaled)).toBeCloseTo(before ?? 0, 4);
  });

  it("un máximo previo queda sobre el spot y un mínimo bajo él", () => {
    const scaled = anchorSeriesToSpot(
      [
        { t: 1, p: 100 },
        { t: 2, p: 40 },
        { t: 3, p: 80 },
      ],
      SPOT,
    );
    const bounds = rangeBounds(scaled);
    expect(scaled[2]?.p).toBe(SPOT);
    expect(bounds!.high).toBeGreaterThan(SPOT);
    expect(bounds!.low).toBeLessThan(SPOT);
  });
});

describe("dólar live", () => {
  it("lee valor y fecha, y marca la fuente live", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      jsonResponse({
        serie: [{ valor: 984.82, fecha: "2026-10-05T03:00:00.000Z" }],
      }),
    );
    const cache = createLiveFxCache();
    const parsed = await readUsdClp({
      url: FX_URL,
      fetchImpl,
      cache,
      now: () => NOW,
      cacheMs: 45 * 60 * 1000,
    });

    expect(parsed).toEqual({ rate: 984.82, updatedAt: "2026-10-05T03:00:00.000Z" });
    expect(liveFxRate(parsed!).source).toBe("live");
    expect(liveFxRate(parsed!).updatedAt).toBe("2026-10-05T03:00:00.000Z");

    await readUsdClp({ url: FX_URL, fetchImpl, cache, now: () => NOW + 1_000 });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("si falla o el valor no sirve, no inventa 950", async () => {
    const down = vi.fn<typeof fetch>(async () => jsonResponse({ error: "no" }, 503));
    const missed = await readUsdClp({ url: FX_URL, fetchImpl: down, now: () => NOW });
    expect(missed).toBeNull();
    expect(missed).not.toEqual(expect.objectContaining({ rate: MOCK_USDCLP }));

    expect(parseMindicadorDolar({ serie: [{ valor: 0, fecha: "2026-10-05T03:00:00.000Z" }] })).toBeNull();
    expect(parseMindicadorDolar({ serie: [{ valor: "no", fecha: "2026-10-05T03:00:00.000Z" }] })).toBeNull();
    expect(parseMindicadorDolar({ serie: [] })).toBeNull();
    expect(parseMindicadorDolar(null)).toBeNull();
  });
});

describe("cotización demo", () => {
  it("la posición y el precio de la orden usan el spot, no la ancla", () => {
    resetDemoState();
    const spots = new Map([["AAPLx", { priceUsd: SPOT }]]);
    expect(demoSpotPrice("AAPLx", spots)).toBe(SPOT);
    expect(demoSpotPrice("AAPLx")).toBe(228.4);

    const portfolio = buildDemoPortfolio(DEMO_WALLET_ADDRESS, spots);
    const apple = portfolio.positions.find((position) => position.symbol === "AAPLx");
    expect(apple?.priceUsd).toBe(SPOT);
    expect(apple?.valueUsd).toBeCloseTo(SPOT, 2);
    const nvidia = portfolio.positions.find((position) => position.symbol === "NVDAx");
    expect(nvidia?.priceUsd).toBe(131.15);
  });
});
