import { describe, expect, it, vi } from "vitest";

import { historyCacheControl, historyFields, HISTORY_CACHE_LIVE } from "@/lib/api/contracts";
import { barDurationMs, chartCapabilities, observedSeries } from "@/lib/charts/data";
import {
  createTokenOhlcv,
  MIN_POOL_RESERVE_USD,
  parseOhlcvRows,
  pickPool,
  TOKEN_RANGE_SPECS,
  tokenMetadata,
} from "@/lib/market/token-ohlcv";
import { historyMemoTtl } from "@/lib/services/history-series";

/**
 * Velas del token (GeckoTerminal). `fetchImpl` y el reloj se inyectan: no hay red.
 */

const MINT = "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const OTHER = "DEW9dSN6QpWyNthphCpMmAbZP1Q4cEKR9xQXAri98WDP";
const NOW = 1_795_388_400_000 + 600_000;
const SERIES_TTL_PASSED = 120_000;

function pool(address: string, base: string, quote: string, reserve: string, basePrice = "134.1", quotePrice = "0.99") {
  return {
    attributes: { address, reserve_in_usd: reserve, base_token_price_usd: basePrice, quote_token_price_usd: quotePrice },
    relationships: { base_token: { data: { id: `solana_${base}` } }, quote_token: { data: { id: `solana_${quote}` } } },
  };
}

const POOLS = {
  data: [
    pool("small", MINT, USDC, "5000"),
    pool("quoteSide", OTHER, MINT, "900000", "0.006", "134.3"),
    pool("main", MINT, USDC, "2164096.79", "134.14"),
    pool("dust", MINT, USDC, String(MIN_POOL_RESERVE_USD - 1)),
    pool("unrelated", OTHER, USDC, "99999999"),
  ],
};

/** Más nueva primero, como GeckoTerminal. Cierre más nuevo = 134.14. */
function ohlcv(count = 5, newest = NOW - 600_000, stepMs = 3_600_000, close = 134.14) {
  const list = Array.from({ length: count }, (_, i) => {
    const c = close - i * 0.1;
    return [Math.floor((newest - i * stepMs) / 1000), c - 0.2, c + 0.5, c - 0.6, c, 1000];
  });
  return { data: { attributes: { ohlcv_list: list } } };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function harness(onOhlcv: () => Response = () => json(ohlcv()), onPools: () => Response = () => json(POOLS)) {
  let now = NOW;
  const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    return url.includes("/ohlcv/") ? onOhlcv() : onPools();
  });
  const client = createTokenOhlcv({ fetchImpl: fetchImpl as unknown as typeof fetch, now: () => now });
  return {
    client,
    fetchImpl,
    advance: (ms: number) => {
      now += ms;
    },
    urls: () => fetchImpl.mock.calls.map((call) => String(call[0])),
  };
}

describe("pickPool", () => {
  it("elige la mayor reserva donde participa el mint y descarta polvo y ajenos", () => {
    expect(pickPool(POOLS, MINT)).toEqual({ address: "main", referenceUsd: 134.14 });
  });

  it("usa el precio del lado del xStock cuando es el token de cotización", () => {
    const only = { data: [pool("quoteSide", OTHER, MINT, "900000", "0.006", "134.3")] };
    expect(pickPool(only, MINT)).toEqual({ address: "quoteSide", referenceUsd: 134.3 });
  });

  it("sin pozo líquido o con carga inválida devuelve null", () => {
    expect(pickPool({ data: [pool("dust", MINT, USDC, "10")] }, MINT)).toBeNull();
    expect(pickPool(null, MINT)).toBeNull();
    expect(pickPool({ data: "x" }, MINT)).toBeNull();
  });
});

describe("parseOhlcvRows", () => {
  it("ordena ascendente, pasa a ms, usa el cierre como p y deja la unidad intacta (sin multiplicador)", () => {
    const rows = parseOhlcvRows(ohlcv(3), null, NOW);
    expect(rows.map((row) => row.t)).toEqual([...rows.map((row) => row.t)].sort((a, b) => a - b));
    const last = rows[rows.length - 1]!;
    expect(last.p).toBe(134.14);
    expect(last.c).toBe(134.14);
    expect(last.t % 1000).toBe(0);
  });

  it("corrige máximos/mínimos incoherentes, descarta filas inválidas y recorta por ventana", () => {
    const payload = {
      data: {
        attributes: {
          ohlcv_list: [
            [Math.floor(NOW / 1000), 10, 9, 11, 10.5, 1],
            [Math.floor(NOW / 1000) - 60, 0, 1, 1, 1, 1],
            ["x", 1, 1, 1, 1, 1],
            [Math.floor(NOW / 1000) - 10 * 86_400, 10, 11, 9, 10, 1],
          ],
        },
      },
    };
    const rows = parseOhlcvRows(payload, 86_400_000, NOW);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ o: 10, h: 10.5, l: 10, c: 10.5, p: 10.5 });
  });
});

describe("createTokenOhlcv", () => {
  it("resuelve el pozo, pide el rango con el mint como token y devuelve metadatos honestos", async () => {
    const { client, urls } = harness();
    const result = await client.history(MINT, "1W");
    expect(result?.points.length).toBe(5);
    expect(result?.metadata).toMatchObject({
      instrument: "token",
      provider: "geckoterminal",
      resolution: "1h",
      priceUnit: "usd_per_share",
      reference: false,
    });
    const [poolsUrl, ohlcvUrl] = urls();
    expect(poolsUrl).toContain(`/tokens/${MINT}/pools`);
    expect(ohlcvUrl).toContain("/pools/main/ohlcv/hour?aggregate=1&limit=168&currency=usd");
    expect(ohlcvUrl).toContain(`token=${MINT}`);
  });

  it("la última vela queda en la unidad del titular (±1 %)", async () => {
    const { client } = harness();
    const result = await client.history(MINT, "1D");
    expect(Math.abs(result!.points.at(-1)!.p / 134.14 - 1)).toBeLessThan(0.01);
  });

  it("cachea pozo y serie, y comparte las llamadas simultáneas", async () => {
    const { client, fetchImpl, advance } = harness();
    await Promise.all([client.history(MINT, "1W"), client.history(MINT, "1W")]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    await client.history(MINT, "1W");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    advance(SERIES_TTL_PASSED);
    await client.history(MINT, "1W");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    await client.history(MINT, "1D");
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("sin pozo líquido devuelve null sin pedir velas", async () => {
    const { client, urls } = harness(undefined, () => json({ data: [pool("dust", MINT, USDC, "10")] }));
    expect(await client.history(MINT, "1W")).toBeNull();
    expect(urls().some((url) => url.includes("/ohlcv/"))).toBe(false);
  });

  it("devuelve null con menos de dos velas, con precio alejado del pozo o con 5xx", async () => {
    expect(await harness(() => json(ohlcv(1))).client.history(MINT, "1W")).toBeNull();
    expect(await harness(() => json(ohlcv(5, NOW - 600_000, 3_600_000, 300))).client.history(MINT, "1W")).toBeNull();
    expect(await harness(() => json({}, 500)).client.history(MINT, "1W")).toBeNull();
  });

  it("tras un 429 se enfría: no vuelve a llamar hasta pasado el minuto", async () => {
    const { client, fetchImpl, advance } = harness(() => json({}, 429));
    expect(await client.history(MINT, "1W")).toBeNull();
    const calls = fetchImpl.mock.calls.length;
    expect(await client.history(MINT, "1D")).toBeNull();
    expect(fetchImpl.mock.calls.length).toBe(calls);
    advance(61_000);
    await client.history(MINT, "1D");
    expect(fetchImpl.mock.calls.length).toBeGreaterThan(calls);
  });

  it("sirve la serie vencida si la actualización falla (hasta 15 min)", async () => {
    let fail = false;
    const { client, advance } = harness(() => (fail ? json({}, 500) : json(ohlcv())));
    const first = await client.history(MINT, "1W");
    fail = true;
    advance(SERIES_TTL_PASSED);
    expect(await client.history(MINT, "1W")).toEqual(first);
    advance(16 * 60_000);
    expect(await client.history(MINT, "1W")).toBeNull();
  });

  it("respeta el tope de llamadas por minuto", async () => {
    const { client, fetchImpl } = harness();
    for (const range of ["1D", "1W", "1M", "3M", "1Y", "ALL"] as const) await client.history(MINT, range);
    const mints = ["A1", "A2", "A3", "A4"].map((id) => id.padEnd(32, "1"));
    for (const mint of mints) await client.history(mint, "1D");
    expect(fetchImpl.mock.calls.length).toBeLessThanOrEqual(8);
  });

  it("define resolución por rango compatible con las barras del gráfico", () => {
    expect(TOKEN_RANGE_SPECS["1D"].resolution).toBe("15m");
    expect(TOKEN_RANGE_SPECS.ALL.resolution).toBe("1d");
  });
});

describe("contrato y gráfico", () => {
  const rows = parseOhlcvRows(ohlcv(4), null, NOW);
  const metadata = tokenMetadata(TOKEN_RANGE_SPECS["1W"], MINT);

  it("historyFields conserva las velas del token y no declara volumen", () => {
    const fields = historyFields(rows, "ticks", metadata);
    expect(fields.real).toBe(true);
    expect(fields.points.every((point) => point.o !== undefined && point.h !== undefined)).toBe(true);
    expect(fields.metadata?.capabilities).toEqual({ ohlc: true, volume: false });
    expect(chartCapabilities(fields.points, fields.metadata).ohlc).toBe(true);
    expect(historyCacheControl(fields)).toBe(HISTORY_CACHE_LIVE);
    expect(historyMemoTtl({ points: rows, source: "ticks", metadata })).toBe(30_000);
  });

  it("ticks sin proveedor de velas siguen sin OHLC", () => {
    const fields = historyFields(rows, "ticks", { ...metadata, provider: "jupiter" });
    expect(fields.points.some((point) => point.o !== undefined)).toBe(false);
  });

  it("el precio en vivo mueve la última barra y abre otra cuando empieza la siguiente", () => {
    const barMs = barDurationMs("1h")!;
    const last = rows.at(-1)!;
    const inside = observedSeries(rows, { t: last.t + 60_000, p: last.p + 2 }, barMs);
    expect(inside).toHaveLength(rows.length);
    expect(inside.at(-1)).toMatchObject({ t: last.t, c: last.p + 2, p: last.p + 2 });
    expect(inside.at(-1)!.h).toBeGreaterThanOrEqual(last.p + 2);
    expect(inside.slice(0, -1)).toEqual(rows.slice(0, -1));
    const next = observedSeries(rows, { t: last.t + barMs + 5_000, p: last.p - 1 }, barMs);
    expect(next).toHaveLength(rows.length + 1);
    expect(next.at(-1)).toMatchObject({ t: last.t + barMs, o: last.c, c: last.p - 1 });
    expect(chartCapabilities(next, metadata).ohlc).toBe(true);
    expect(observedSeries(rows, { t: last.t + 1, p: 1 })).toEqual(rows);
  });
});
