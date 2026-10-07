import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, isRateLimitedError, queryRetry } from "@/lib/api/client";
import { errorMessage, httpStatusFor } from "@/lib/api/result";
import {
  __resetRateLimitsForTests,
  ipOfRequest,
  limit,
  RATE_LIMIT_POLICIES,
  resolvePolicy,
  withRateLimit,
} from "@/lib/security/rate-limit";
import { en } from "@/content/i18n/en";
import { esCL } from "@/content/i18n/es-CL";

const ROOT = path.resolve(__dirname, "..", "..");

const SAVED_ENV = { ...process.env };

function useMemoryBackend(): void {
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.RATE_LIMIT_TEST_SEARCH;
  process.env.RATE_LIMIT_BACKEND = "memory";
}

function reqWithIp(ip: string): Request {
  return new Request("https://maverlang.test/api/x", {
    headers: { "x-forwarded-for": ip },
  });
}

beforeEach(() => {
  useMemoryBackend();
  __resetRateLimitsForTests();
  vi.unstubAllGlobals();
});

afterEach(() => {
  process.env = { ...SAVED_ENV };
  __resetRateLimitsForTests();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("M49: ventana deslizante en memoria", () => {
  it("la solicitud 21 de trade en 1 min da 429 con Retry-After", async () => {
    for (let i = 0; i < 20; i += 1) {
      expect(await withRateLimit(reqWithIp("1.2.3.4"), "trade", ["user-1"])).toBeNull();
    }
    const limited = await withRateLimit(reqWithIp("1.2.3.4"), "trade", ["user-1"]);
    expect(limited).not.toBeNull();
    expect(limited!.status).toBe(429);
    expect(limited!.headers.get("Retry-After")).toMatch(/^[1-9]\d*$/);
    expect(limited!.headers.get("X-RateLimit-Remaining")).toBe("0");
    const body = (await limited!.json()) as {
      ok: boolean;
      error: { code: string; message: string };
    };
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("RATE_LIMITED");
    expect(body.error.message).toContain("Demasiadas solicitudes");
  });

  it("claves distintas no se pisan", async () => {
    for (let i = 0; i < 20; i += 1) {
      expect(await withRateLimit(reqWithIp("1.2.3.4"), "trade", ["user-a"])).toBeNull();
    }
    expect(await withRateLimit(reqWithIp("1.2.3.4"), "trade", ["user-a"])).not.toBeNull();
    // Otro usuario no se pisa…
    expect(await withRateLimit(reqWithIp("1.2.3.4"), "trade", ["user-b"])).toBeNull();
    // …y la clave es por usuario: otra IP con el mismo usuario sigue limitada.
    expect(await withRateLimit(reqWithIp("9.9.9.9"), "trade", ["user-a"])).not.toBeNull();
    // Sin partes la clave es por IP: una IP distinta no se pisa.
    for (let i = 0; i < 20; i += 1) {
      expect(await withRateLimit(reqWithIp("5.6.7.8"), "trade")).toBeNull();
    }
    expect(await withRateLimit(reqWithIp("5.6.7.8"), "trade")).not.toBeNull();
    expect(await withRateLimit(reqWithIp("6.6.6.6"), "trade")).toBeNull();
  });

  it("la ventana se libera con un reloj falso", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-07T12:00:00Z"));
    for (let i = 0; i < 20; i += 1) {
      expect(await withRateLimit(reqWithIp("1.2.3.4"), "trade", ["user-1"])).toBeNull();
    }
    expect(await withRateLimit(reqWithIp("1.2.3.4"), "trade", ["user-1"])).not.toBeNull();
    vi.setSystemTime(new Date("2026-10-07T12:01:01Z"));
    expect(await withRateLimit(reqWithIp("1.2.3.4"), "trade", ["user-1"])).toBeNull();
  });

  it("sin variables de Upstash no se intenta conectar", async () => {
    process.env.RATE_LIMIT_BACKEND = "auto";
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    for (let i = 0; i < 21; i += 1) {
      await limit("maverlang:rl:test:solo-memoria", { limit: 20, windowMs: 60_000 });
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("RATE_LIMIT_TEST_SEARCH baja la búsqueda sólo en desarrollo", () => {
    process.env.RATE_LIMIT_TEST_SEARCH = "5";
    expect(resolvePolicy("search").limit).toBe(5);
    expect(resolvePolicy("prices").limit).toBe(RATE_LIMIT_POLICIES.prices.limit);
    vi.stubEnv("NODE_ENV", "production");
    try {
      expect(resolvePolicy("search").limit).toBe(RATE_LIMIT_POLICIES.search.limit);
    } finally {
      vi.unstubAllEnvs();
      useMemoryBackend();
    }
  });

  it("la IP sale del primer x-forwarded-for o de x-real-ip", () => {
    const both = new Request("https://maverlang.test/", {
      headers: { "x-forwarded-for": "1.1.1.1, 2.2.2.2", "x-real-ip": "3.3.3.3" },
    });
    expect(ipOfRequest(both)).toBe("1.1.1.1");
    const real = new Request("https://maverlang.test/", {
      headers: { "x-real-ip": "3.3.3.3" },
    });
    expect(ipOfRequest(real)).toBe("3.3.3.3");
    expect(ipOfRequest(new Request("https://maverlang.test/"))).toBe("unknown");
  });
});

describe("M49: código RATE_LIMITED de punta a punta", () => {
  it("es 429 con el mensaje exacto y texto en es/en", () => {
    expect(httpStatusFor("RATE_LIMITED")).toBe(429);
    expect(errorMessage("RATE_LIMITED")).toContain("Demasiadas solicitudes");
    expect(esCL.trade.errors.RATE_LIMITED).toContain("Demasiadas solicitudes");
    expect(en.trade.errors.RATE_LIMITED.length).toBeGreaterThan(0);
  });

  it("el cliente muestra el mensaje y no reintenta en bucle", () => {
    const limited = new ApiError("RATE_LIMITED", errorMessage("RATE_LIMITED"), 429);
    expect(limited.code).toBe("RATE_LIMITED");
    expect(isRateLimitedError(limited)).toBe(true);
    expect(queryRetry(0, limited)).toBe(false);
    expect(queryRetry(3, limited)).toBe(false);
    const upstream = new ApiError("UPSTREAM", "x", 502);
    expect(queryRetry(0, upstream)).toBe(true);
    expect(queryRetry(1, upstream)).toBe(false);
    expect(queryRetry(0, new Error("corte"))).toBe(true);
  });
});

describe("M49: ninguna ruta sensible quedó sin límite (estático)", () => {
  const SENSITIVE = [
    "app/api/trade/quote/route.ts",
    "app/api/trade/build/route.ts",
    "app/api/trade/submit/route.ts",
    "app/api/trade/status/route.ts",
    "app/api/demo/reset/route.ts",
    "app/api/me/route.ts",
    "app/api/me/consents/route.ts",
    "app/api/me/deletion/route.ts",
    "app/api/me/preferences/route.ts",
    "app/api/me/favorites/route.ts",
    "app/api/market/search/route.ts",
    "app/api/prices/route.ts",
    "app/api/onramp/session/route.ts",
    "app/api/onramp/webhook/route.ts",
    "app/api/wallet/balances/route.ts",
    "app/api/wallet/activity/route.ts",
    "app/api/wallet/send/build/route.ts",
    "app/api/waitlist/route.ts",
  ];

  it("todas usan withRateLimit", () => {
    const missing = SENSITIVE.filter(
      (file) => !readFileSync(path.join(ROOT, file), "utf8").includes("withRateLimit"),
    );
    expect(missing, `sin withRateLimit: ${missing.join(", ")}`).toEqual([]);
  });

  it("la política cron existe aunque hoy no haya /api/cron/*", () => {
    expect(RATE_LIMIT_POLICIES.cron.limit).toBe(10);
  });
});
