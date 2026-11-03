import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { errorMessage, httpStatusFor } from "@/lib/api/result";
import {
  __resetRateLimitsForTests,
  ipOfRequest,
  limit,
  RATE_LIMIT_POLICIES,
  SENSITIVE_RATE_LIMIT_POLICIES,
  withRateLimit,
} from "@/lib/security/rate-limit";

/**
 * A-02 / A1-03: el sujeto del límite no puede venir del cliente y, en
 * producción sin backend global, las políticas sensibles fallan cerradas.
 */

const SAVED_ENV = { ...process.env };

function request(headers: Record<string, string> = {}): Request {
  return new Request("https://maverlang.test/api/x", { headers });
}

function useTestBackend(): void {
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.RATE_LIMIT_TEST_SEARCH;
  vi.stubEnv("NODE_ENV", "test");
  process.env.RATE_LIMIT_BACKEND = "memory";
}

beforeEach(() => {
  useTestBackend();
  __resetRateLimitsForTests();
});

afterEach(() => {
  process.env = { ...SAVED_ENV };
  __resetRateLimitsForTests();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("A-02: la IP del sujeto no la elige el cliente", () => {
  it("rotar el X-Forwarded-For de la izquierda no cambia el sujeto", async () => {
    process.env.RATE_LIMIT_BACKEND = "memory";
    process.env.RATE_LIMIT_TEST_SEARCH = "5";
    // Seis valores públicos distintos a la izquierda: el sujeto debe seguir
    // siendo el mismo (198.51.100.7, el público más a la derecha).
    for (let index = 0; index < 5; index += 1) {
      const response = await withRateLimit(
        request({ "x-forwarded-for": `203.0.113.${index + 1}, 198.51.100.7` }),
        "search",
      );
      expect(response).toBeNull();
    }
    const limited = await withRateLimit(
      request({ "x-forwarded-for": "203.0.113.200, 198.51.100.7" }),
      "search",
    );
    expect(limited).not.toBeNull();
    expect(limited!.status).toBe(429);
  });

  it("x-real-ip gana a X-Forwarded-For y a x-vercel-forwarded-for", () => {
    expect(
      ipOfRequest(
        request({
          "x-real-ip": "192.0.2.7",
          "x-vercel-forwarded-for": "198.51.100.9",
          "x-forwarded-for": "203.0.113.5, 198.51.100.6",
        }),
      ),
    ).toBe("192.0.2.7");
  });

  it("una x-real-ip inválida o privada no gana: se sigue con la cadena", () => {
    expect(ipOfRequest(request({ "x-real-ip": "no-es-ip" }))).toBeNull();
    expect(
      ipOfRequest(request({ "x-real-ip": "10.0.0.5", "x-forwarded-for": "198.51.100.6" })),
    ).toBe("198.51.100.6");
    expect(ipOfRequest(request({ "x-real-ip": "127.0.0.1" }))).toBeNull();
  });

  it("canonicaliza IPv6 e IPv4 mapeada, y descarta loopback/ULA", () => {
    expect(ipOfRequest(request({ "x-real-ip": "2001:0DB8:0000:0000:0000:0000:0000:00A1" }))).toBe(
      "2001:db8::a1",
    );
    expect(ipOfRequest(request({ "x-real-ip": "2001:db8:0:0:0:0:0:a1" }))).toBe("2001:db8::a1");
    expect(ipOfRequest(request({ "x-real-ip": "::FFFF:8.8.8.8" }))).toBe("8.8.8.8");
    expect(ipOfRequest(request({ "x-real-ip": "::ffff:808:808" }))).toBe("8.8.8.8");
    expect(ipOfRequest(request({ "x-real-ip": "::1" }))).toBeNull();
    expect(ipOfRequest(request({ "x-real-ip": "fd12:3456::1" }))).toBeNull();
    expect(ipOfRequest(request({ "x-real-ip": "fe80::1" }))).toBeNull();
  });

  it("sin cabecera no hay IP inventada; el sujeto es uno solo y compartido", async () => {
    expect(ipOfRequest(request())).toBeNull();
    expect(ipOfRequest(request({ "x-forwarded-for": "10.1.2.3, 127.0.0.1" }))).toBeNull();

    process.env.RATE_LIMIT_TEST_SEARCH = "5";
    for (let index = 0; index < 5; index += 1) {
      expect(await withRateLimit(request(), "search")).toBeNull();
    }
    // La sexta cae en el mismo bucket: no se abre una ventana nueva por request.
    expect((await withRateLimit(request(), "search"))!.status).toBe(429);
  });
});

describe("A-02: producción sin Upstash falla cerrada en políticas sensibles", () => {
  beforeEach(() => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.RATE_LIMIT_BACKEND = "auto";
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    __resetRateLimitsForTests();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("las ocho políticas sensibles responden 503 RATE_LIMIT_UNAVAILABLE", async () => {
    expect(httpStatusFor("RATE_LIMIT_UNAVAILABLE")).toBe(503);
    expect(errorMessage("RATE_LIMIT_UNAVAILABLE")).toContain("no está disponible");

    for (const policy of SENSITIVE_RATE_LIMIT_POLICIES) {
      const response = await withRateLimit(request({ "x-real-ip": "8.8.8.8" }), policy);
      expect(response, policy).not.toBeNull();
      expect(response!.status, policy).toBe(503);
      expect(response!.headers.get("Retry-After")).toBe("30");
      expect(response!.headers.get("Cache-Control")).toBe("no-store");
      const body = (await response!.json()) as {
        ok: boolean;
        error: { code: string; message: string };
      };
      expect(body.ok, policy).toBe(false);
      expect(body.error.code, policy).toBe("RATE_LIMIT_UNAVAILABLE");
      expect(body.error.message, policy).toContain("no está disponible");
    }
  });

  it("la forma `plain` (waitlist) también devuelve 503 con el código", async () => {
    const response = await withRateLimit(
      request({ "x-real-ip": "8.8.8.8" }),
      "waitlist",
      [],
      "plain",
    );
    expect(response!.status).toBe(503);
    const body = (await response!.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("RATE_LIMIT_UNAVAILABLE");
  });

  it("las políticas no sensibles mantienen la memoria por instancia", async () => {
    expect(await withRateLimit(request({ "x-real-ip": "8.8.8.8" }), "me", ["u-1"])).toBeNull();
    expect(await withRateLimit(request({ "x-real-ip": "8.8.8.8" }), "publicGet")).toBeNull();
    expect(await withRateLimit(request({ "x-real-ip": "8.8.8.8" }), "demoReset", ["u-1"])).toBeNull();
  });

  it("RATE_LIMIT_BACKEND=memory explícito sí permite memoria en producción", async () => {
    process.env.RATE_LIMIT_BACKEND = "memory";
    expect(await withRateLimit(request({ "x-real-ip": "8.8.8.8" }), "search")).toBeNull();
    expect(await withRateLimit(request({ "x-real-ip": "8.8.8.8" }), "tradeIp")).toBeNull();
  });

  it("con Upstash caído tampoco se cae a memoria en una política sensible", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "token-de-prueba";
    __resetRateLimitsForTests();
    vi.stubGlobal("fetch", async () => {
      throw new Error("sin red");
    });
    expect((await withRateLimit(request({ "x-real-ip": "8.8.8.8" }), "prices"))!.status).toBe(503);
    // Una no sensible sí tiene respaldo en memoria.
    expect(await withRateLimit(request({ "x-real-ip": "8.8.8.8" }), "publicGet")).toBeNull();
  });

  it("RATE_LIMIT_BACKEND=upstash sin credenciales también falla cerrado", async () => {
    process.env.RATE_LIMIT_BACKEND = "upstash";
    expect((await withRateLimit(request({ "x-real-ip": "8.8.8.8" }), "me", ["u-1"]))!.status).toBe(503);
  });

  it("la primitiva sin nombre de política se asume sensible (cuotas de IA)", async () => {
    const result = await limit("maverlang:rl:ai:203.0.113.7", RATE_LIMIT_POLICIES.ai);
    expect(result.ok).toBe(false);
    expect(result.unavailable).toBe(true);
  });

  it("el techo de las políticas sigue siendo el documentado", () => {
    expect(RATE_LIMIT_POLICIES.search.limit).toBe(60);
    expect(RATE_LIMIT_POLICIES.prices.limit).toBe(120);
    expect(RATE_LIMIT_POLICIES.tradeIp.limit).toBe(60);
    expect(RATE_LIMIT_POLICIES.ai.limit).toBe(20);
  });
});
