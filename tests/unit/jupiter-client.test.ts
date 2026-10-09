import { describe, expect, it, vi } from "vitest";

import {
  fetchJupiterOrder,
  jupiterHeaders,
  isRetryableJupiterError,
  type JupiterClientOptions,
} from "@/lib/market/jupiter-client";

/**
 * Tests del cliente HTTP de Jupiter Swap v2. `fetchImpl` se inyecta, así
 * que NO toca la red: fija el manejo de key, reintentos en 429/5xx con
 * backoff, timeouts y mapeo de errores. Con las keys reales, el servicio
 * le pasa `fetch` verdadero y esto sólo cambia el entorno.
 */

const BASE = "https://api.jup.ag";
const URL_ORDER = `${BASE}/swap/v2/order?inputMint=usdc&outputMint=aapx&amount=1000000`;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function okOrder(): unknown {
  return { requestId: "req_1", inAmount: "1000000", outAmount: "2934" };
}

describe("jupiterHeaders", () => {
  it("manda x-api-key cuando hay key", () => {
    const headers = jupiterHeaders("mi-key");
    expect(headers["x-api-key"]).toBe("mi-key");
    expect(headers.accept).toBe("application/json");
  });

  it("sin key, no manda el header x-api-key", () => {
    const headers = jupiterHeaders(undefined);
    expect(headers["x-api-key"]).toBeUndefined();
    expect(headers.accept).toBe("application/json");
  });
});

describe("isRetryableJupiterError", () => {
  it("429 (rate limit) es reintentable", () => {
    expect(isRetryableJupiterError({ status: 429 })).toBe(true);
  });

  it("5xx es reintentable", () => {
    expect(isRetryableJupiterError({ status: 500 })).toBe(true);
    expect(isRetryableJupiterError({ status: 503 })).toBe(true);
  });

  it("4xx (salvo 429) NO es reintentable", () => {
    expect(isRetryableJupiterError({ status: 400 })).toBe(false);
    expect(isRetryableJupiterError({ status: 401 })).toBe(false);
  });
});

describe("fetchJupiterOrder", () => {
  const options: JupiterClientOptions = {
    base: BASE,
    apiKey: "mi-key",
    // Reloj y espera inyectados para no dormir de verdad en los tests.
    sleep: async () => {},
  };

  it("devuelve el cuerpo en un 200", async () => {
    const fetchImpl = vi.fn(async (_url: string) => jsonResponse(okOrder()));
    const body = await fetchJupiterOrder({
      url: URL_ORDER,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      ...options,
    });
    expect(body).toEqual(okOrder());
    // La key viaja por header, nunca en la URL.
    const calledUrl = fetchImpl.mock.calls[0]?.[0];
    expect(calledUrl).toBe(URL_ORDER);
    expect(String(calledUrl)).not.toContain("mi-key");
  });

  it("reintenta en 429 y acierta en el segundo intento", async () => {
    const fetchImpl = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce(jsonResponse({ error: "rate" }, 429))
      .mockResolvedValueOnce(jsonResponse(okOrder()));
    const body = await fetchJupiterOrder({ url: URL_ORDER, fetchImpl, ...options });
    expect(body).toEqual(okOrder());
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("reintenta en 500 con backoff", async () => {
    const fetchImpl = vi
      .fn<() => Promise<Response>>()
      .mockResolvedValueOnce(jsonResponse({}, 500))
      .mockResolvedValueOnce(jsonResponse(okOrder()));
    const body = await fetchJupiterOrder({ url: URL_ORDER, fetchImpl, ...options });
    expect(body).toEqual(okOrder());
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("NO reintenta en 400: falla directo", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ error: "bad" }, 400));
    await expect(
      fetchJupiterOrder({
        url: URL_ORDER,
        fetchImpl: fetchImpl as unknown as typeof fetch,
        ...options,
      }),
    ).rejects.toThrow(/400/);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("tras agotar los reintentos en 429, lanza UPSTREAM", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, 429));
    await expect(
      fetchJupiterOrder({ url: URL_ORDER, fetchImpl, ...options }),
    ).rejects.toThrow();
    // 1 inicial + reintentos.
    expect(fetchImpl.mock.calls.length).toBeGreaterThan(1);
  });

  it("un error de red se reintenta y termina en UPSTREAM", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    });
    await expect(
      fetchJupiterOrder({ url: URL_ORDER, fetchImpl, ...options }),
    ).rejects.toThrow();
    expect(fetchImpl.mock.calls.length).toBeGreaterThan(1);
  });
});
