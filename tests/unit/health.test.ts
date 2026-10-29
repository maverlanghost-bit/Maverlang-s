import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { restoreModes } from "./restore-modes";

/**
 * M62: health checks. Toda la red va mockeada: los probes HTTP usan un
 * `fetchImpl` falso inyectado, el de Supabase un probe inyectado, y el de
 * Koywe un probe inyectado. Ningún test sale a internet.
 *
 * `serverEnv` se evalúa al importar `@/lib/env`, así que los tests con
 * gate por modo reimportan `@/lib/health/checks` tras fijar el env (mismo
 * patrón que `env-validation.test.ts`).
 */

// La shell de desarrollo puede traer precios live. El deep de esta suite parte en mock.
const savedModes = vi.hoisted(() => {
  const saved = { DATA_MODE: process.env.DATA_MODE, PRICES_MODE: process.env.PRICES_MODE };
  process.env.DATA_MODE = "mock";
  process.env.PRICES_MODE = "mock";
  return saved;
});

const SECRET = "test-cron-secret-m62";

/** Claves que los tests fijan y restauran alrededor de cada reimport. */
const MANAGED_KEYS = [
  "CRON_SECRET",
  "PRICES_MODE",
  "MARKET_STATUS_MODE",
  "DATA_MODE",
  "AUTH_MODE",
  "VERCEL_GIT_COMMIT_SHA",
] as const;

/** fetch falso con respuestas por host (las URLs que toca el deep). */
function fakeFetch(responses: {
  jupiter?: { status?: number; body?: unknown };
  xstocks?: { status?: number; body?: unknown };
  fx?: { status?: number; body?: unknown };
}): typeof fetch {
  return (async (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    const status = (config: { status?: number } | undefined, fallback: number) =>
      config?.status ?? (config ? 200 : fallback);
    const body = (config: { body?: unknown } | undefined) =>
      config?.body === undefined ? "" : JSON.stringify(config.body);
    if (url.includes("api.jup.ag")) {
      return new Response(body(responses.jupiter), { status: status(responses.jupiter, 500) });
    }
    if (url.includes("api.xstocks.fi")) {
      return new Response(body(responses.xstocks), { status: status(responses.xstocks, 500) });
    }
    // FX_SOURCE_URL default (mindicador) y el respaldo er-api comparten chequeo.
    if (url.includes("mindicador") || url.includes("er-api")) {
      return new Response(body(responses.fx), { status: status(responses.fx, 500) });
    }
    return new Response("", { status: 404 });
  }) as unknown as typeof fetch;
}

const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const AAPLX_MINT = "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp";
const JUPITER_OK = { [USDC_MINT]: { usdPrice: 1 }, [AAPLX_MINT]: { usdPrice: 200 } };
const XSTOCKS_OK = { id: "aaplx", symbol: "AAPLx" };
const FX_OK = { serie: [{ valor: 950, fecha: "2026-10-16T03:00:00.000Z" }] };

function request(pathname: string, token?: string): Request {
  const headers: Record<string, string> = {};
  if (token !== undefined) headers.authorization = `Bearer ${token}`;
  return new Request(`https://maverlang.test${pathname}`, { headers });
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterAll(() => {
  restoreModes(savedModes);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});

/**
 * Reimporta `@/lib/health/checks` con un env controlado: `serverEnv` se
 * evalúa al importar `@/lib/env`, así que el gate por modo lee estos
 * valores (mismo patrón que `env-validation.test.ts`).
 */
async function importHealthWithEnv(
  env: Record<string, string | undefined>,
): Promise<typeof import("@/lib/health/checks")> {
  const saved = new Map<string, string | undefined>();
  for (const key of MANAGED_KEYS) {
    saved.set(key, process.env[key]);
    delete process.env[key];
  }
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.resetModules();
  try {
    return await import("@/lib/health/checks");
  } finally {
    for (const key of MANAGED_KEYS) {
      const value = saved.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    vi.resetModules();
  }
}

const LIVE_ENV = {
  PRICES_MODE: "live",
  MARKET_STATUS_MODE: "live",
  DATA_MODE: "live",
  AUTH_MODE: "supabase",
} as const;

const MOCK_ENV = {
  PRICES_MODE: "mock",
  MARKET_STATUS_MODE: "mock",
  DATA_MODE: "mock",
  AUTH_MODE: "mock",
} as const;

/* --- 1. GET /api/health (superficial) --- */

describe("M62: GET /api/health (superficial)", () => {
  it("responde 200 { ok } sin versión, entorno ni red externa", async () => {
    vi.stubEnv("VERCEL_GIT_COMMIT_SHA", "abcdef1234567890");
    const { GET } = await import("@/app/api/health/route");
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      throw new Error("el superficial no llama a la red");
    });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const payload = (await response.json()) as Record<string, unknown>;
    expect(payload).toEqual({ ok: true });
    expect(payload).not.toHaveProperty("version");
    expect(payload).not.toHaveProperty("env");
    expect(spy).not.toHaveBeenCalled();
  });
});

/* --- 2. GET /api/health/deep: token --- */

describe("M62: GET /api/health/deep: token", () => {
  it("sin token → 401", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    const { GET } = await import("@/app/api/health/deep/route");
    const response = await GET(request("/api/health/deep"));
    expect(response.status).toBe(401);
    const payload = (await response.json()) as { ok: boolean; error?: { code: string } };
    expect(payload.ok).toBe(false);
    expect(payload.error?.code).toBe("UNAUTHORIZED");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("con token incorrecto → 401", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    const { GET } = await import("@/app/api/health/deep/route");
    const response = await GET(request("/api/health/deep", "otro-token"));
    expect(response.status).toBe(401);
  });

  it("sin CRON_SECRET configurado → 401 (nunca abierto)", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const { GET } = await import("@/app/api/health/deep/route");
    const response = await GET(request("/api/health/deep", "cualquiera"));
    expect(response.status).toBe(401);
  });

  it("con el token correcto y env mock → 200 con todo skipped", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    const { GET } = await import("@/app/api/health/deep/route");
    const response = await GET(request("/api/health/deep", SECRET));
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      ok: boolean;
      env: string;
      dataMode: string;
      uptimeSeconds: number;
      checks: Record<string, { ok: boolean; ms: number; status: string }>;
    };
    expect(payload.ok).toBe(true);
    expect(payload.dataMode).toBe("mock");
    expect(typeof payload.uptimeSeconds).toBe("number");
    for (const name of ["supabase", "jupiter", "xstocks", "fx", "rpc", "koywe"]) {
      expect(payload.checks[name]).toBeDefined();
      expect(typeof payload.checks[name]!.ms).toBe("number");
      expect(payload.checks[name]!.status).toBe("skipped");
    }
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("con un crítico caído → 503", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    // Sin credenciales Supabase en el proceso de test, pero AUTH_MODE=supabase
    // activa el probe real: createSupabaseAdminClient falla → crítico caído.
    const savedAuth = process.env.AUTH_MODE;
    process.env.AUTH_MODE = "supabase";
    vi.resetModules();
    try {
      const { GET } = await import("@/app/api/health/deep/route");
      const response = await GET(request("/api/health/deep", SECRET));
      expect(response.status).toBe(503);
      const payload = (await response.json()) as {
        ok: boolean;
        checks: { supabase: { ok: boolean; status: string } };
      };
      expect(payload.ok).toBe(false);
      expect(payload.checks.supabase.ok).toBe(false);
      expect(payload.checks.supabase.status).toBe("failed");
    } finally {
      if (savedAuth === undefined) delete process.env.AUTH_MODE;
      else process.env.AUTH_MODE = savedAuth;
      vi.resetModules();
    }
  });
});

/* --- 3. Lógica pura: runCheck, deepOk --- */

describe("M62: runCheck y deepOk (puros)", () => {
  it("probe null → skipped (ok)", async () => {
    const { runCheck } = await importHealthWithEnv(MOCK_ENV);
    const outcome = await runCheck(async () => null);
    expect(outcome.ok).toBe(true);
    expect(outcome.status).toBe("skipped");
    expect(typeof outcome.ms).toBe("number");
  });

  it("probe true → ok; probe false → failed con error genérico", async () => {
    const { runCheck } = await importHealthWithEnv(MOCK_ENV);
    const good = await runCheck(async () => true);
    expect(good.ok).toBe(true);
    expect(good.status).toBe("ok");
    const bad = await runCheck(async () => false);
    expect(bad.ok).toBe(false);
    expect(bad.status).toBe("failed");
    expect(bad.error).toBe("El proveedor no respondió correctamente.");
  });

  it("probe que rechaza con URL en el mensaje → error redactado sin la URL", async () => {
    const { runCheck } = await importHealthWithEnv(MOCK_ENV);
    const outcome = await runCheck(async () => {
      throw new Error("fallo https://api.jup.ag/price/v3?ids=secreto&apikey=CLAVE123");
    });
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toBe("El proveedor no respondió correctamente.");
  });

  it("probe que no termina → failed con mensaje de tiempo agotado", async () => {
    const { runCheck } = await importHealthWithEnv(MOCK_ENV);
    const start = Date.now();
    const outcome = await runCheck(
      () => new Promise<boolean | null>(() => {}),
      50,
    );
    const took = Date.now() - start;
    expect(outcome.ok).toBe(false);
    expect(outcome.status).toBe("failed");
    expect(outcome.error).toBe("Tiempo de espera agotado.");
    expect(took).toBeGreaterThanOrEqual(45);
    expect(took).toBeLessThan(5_000);
  });

  it("deepOk: sólo los críticos (Supabase, Jupiter) tiran la salud", async () => {
    const { deepOk } = await importHealthWithEnv(MOCK_ENV);
    const base = (over: Record<string, { ok: boolean; ms: number; status: string; error?: string }>) => ({
      supabase: { ok: true, ms: 1, status: "ok" },
      jupiter: { ok: true, ms: 1, status: "ok" },
      xstocks: { ok: true, ms: 1, status: "ok" },
      fx: { ok: true, ms: 1, status: "ok" },
      rpc: { ok: true, ms: 1, status: "ok" },
      koywe: { ok: true, ms: 1, status: "ok" },
      ...over,
    });
    expect(deepOk(base({}) as never)).toBe(true);
    expect(deepOk(base({ supabase: { ok: false, ms: 1, status: "failed" } }) as never)).toBe(false);
    expect(deepOk(base({ jupiter: { ok: false, ms: 1, status: "failed" } }) as never)).toBe(false);
    // Un informativo caído no tira la salud.
    expect(deepOk(base({ xstocks: { ok: false, ms: 1, status: "failed" } }) as never)).toBe(true);
    expect(deepOk(base({ fx: { ok: false, ms: 1, status: "failed" } }) as never)).toBe(true);
    expect(deepOk(base({ rpc: { ok: false, ms: 1, status: "failed" } }) as never)).toBe(true);
    expect(deepOk(base({ koywe: { ok: false, ms: 1, status: "failed" } }) as never)).toBe(true);
  });
});

/* --- 4. Probes con fetch falso (modo live) --- */

describe("M62: probes con fetch falso (modo live)", () => {
  it("todo OK → ok:true, chequeos activos en ok, koywe skipped", async () => {
    const { runDeepHealth } = await importHealthWithEnv(LIVE_ENV);
    const report = await runDeepHealth({
      fetchImpl: fakeFetch({ jupiter: { body: JUPITER_OK }, xstocks: { body: XSTOCKS_OK }, fx: { body: FX_OK } }),
      supabaseSelect: async () => true,
      rpcGetSlot: async () => true,
    });
    expect(report.ok).toBe(true);
    expect(report.checks.supabase.status).toBe("ok");
    expect(report.checks.jupiter.status).toBe("ok");
    expect(report.checks.xstocks.status).toBe("ok");
    expect(report.checks.fx.status).toBe("ok");
    expect(report.checks.rpc.status).toBe("ok");
    expect(report.checks.koywe.status).toBe("skipped");
    expect(report.dataMode).toBe("live");
    expect(report.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(report.memory.usedMb).toBeGreaterThanOrEqual(0);
  });

  it("Supabase caído (crítico) → ok:false aunque el resto pase", async () => {
    const { runDeepHealth } = await importHealthWithEnv(LIVE_ENV);
    const report = await runDeepHealth({
      fetchImpl: fakeFetch({ jupiter: { body: JUPITER_OK }, xstocks: { body: XSTOCKS_OK }, fx: { body: FX_OK } }),
      supabaseSelect: async () => {
        throw new Error("supabase 503");
      },
      rpcGetSlot: async () => true,
    });
    expect(report.ok).toBe(false);
    expect(report.checks.supabase.ok).toBe(false);
    expect(report.checks.supabase.error).toContain("supabase");
  });

  it("Jupiter caído (crítico) → ok:false con error redactado", async () => {
    const { runDeepHealth } = await importHealthWithEnv(LIVE_ENV);
    const report = await runDeepHealth({
      fetchImpl: fakeFetch({ jupiter: { status: 500 }, xstocks: { body: XSTOCKS_OK }, fx: { body: FX_OK } }),
      supabaseSelect: async () => true,
      rpcGetSlot: async () => true,
    });
    expect(report.ok).toBe(false);
    expect(report.checks.jupiter.ok).toBe(false);
  });

  it("xStocks o FX caídos (informativos) → ok:true", async () => {
    const { runDeepHealth } = await importHealthWithEnv(LIVE_ENV);
    const report = await runDeepHealth({
      fetchImpl: fakeFetch({ jupiter: { body: JUPITER_OK }, xstocks: { status: 500 }, fx: { body: { serie: [] } } }),
      supabaseSelect: async () => true,
      rpcGetSlot: async () => true,
    });
    expect(report.ok).toBe(true);
    expect(report.checks.xstocks.ok).toBe(false);
    expect(report.checks.fx.ok).toBe(false);
  });

  it("Jupiter sin filas → failed (JSON vacío no es salud)", async () => {
    const { runDeepHealth } = await importHealthWithEnv(LIVE_ENV);
    const report = await runDeepHealth({
      fetchImpl: fakeFetch({ jupiter: { body: {} }, xstocks: { body: XSTOCKS_OK }, fx: { body: FX_OK } }),
      supabaseSelect: async () => true,
      rpcGetSlot: async () => true,
    });
    expect(report.ok).toBe(false);
    expect(report.checks.jupiter.ok).toBe(false);
  });

  it("un fetch colgado → failed por timeout (3 s), no cuelga la respuesta", async () => {
    const { runDeepHealth, HEALTH_CHECK_TIMEOUT_MS } = await importHealthWithEnv(LIVE_ENV);
    expect(HEALTH_CHECK_TIMEOUT_MS).toBe(3_000);
    const hanging = (async () => {
      await new Promise(() => {});
      return true;
    }) as () => Promise<boolean | null>;
    const report = await runDeepHealth({
      fetchImpl: hanging as unknown as typeof fetch,
      supabaseSelect: async () => true,
      rpcGetSlot: async () => true,
    });
    expect(report.ok).toBe(false);
    expect(report.checks.jupiter.ok).toBe(false);
    expect(report.checks.jupiter.status).toBe("failed");
    expect(report.checks.jupiter.error).toBe("Tiempo de espera agotado.");
  }, 10_000);
});

/* --- 5. Determinismo en mock puro (default del repo/CI) --- */

describe("M62: DATA_MODE=mock sin credenciales → determinista y saludable", () => {
  it("runDeepHealth con env mock no llama a la red y todo queda skipped", async () => {
    const { runDeepHealth } = await importHealthWithEnv(MOCK_ENV);
    const spy = vi.fn();
    const report = await runDeepHealth({ fetchImpl: spy });
    expect(spy).not.toHaveBeenCalled();
    expect(report.ok).toBe(true);
    for (const name of Object.keys(report.checks)) {
      expect(report.checks[name as keyof typeof report.checks].status).toBe("skipped");
    }
    expect(report.dataMode).toBe("mock");
  });

  it("la ruta deep con todo skipped responde 200 (monitores y CI)", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    const { GET } = await import("@/app/api/health/deep/route");
    const response = await GET(request("/api/health/deep", SECRET));
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { ok: boolean };
    expect(payload.ok).toBe(true);
  });
});

/* --- 6. Exclusiones: rate limit y geobloqueo --- */

describe("M62: /api/health* exento de rate limit y geobloqueo", () => {
  it("las rutas de health no usan withRateLimit", async () => {
    const { readFile } = await import("node:fs/promises");
    for (const path of ["app/api/health/route.ts", "app/api/health/deep/route.ts"]) {
      const source = await readFile(path, "utf8");
      expect(source).not.toContain("withRateLimit");
      expect(source).not.toContain("rate-limit");
    }
  });

  it("el matcher del middleware excluye /api (los monitores no pasan por el gate ni el rate limit)", async () => {
    const { readFile } = await import("node:fs/promises");
    const source = await readFile("middleware.ts", "utf8");
    // El matcher literal del fuente lleva `.*\\..*` (backslash escapado).
    expect(source).toContain('matcher: ["/((?!api|_next|.*\\\\..*).*)"]');
  });
});

/* --- 7. Sin secretos en las respuestas --- */

describe("M62: sin secretos en las respuestas", () => {
  it("los errores del deep no traen URLs con claves ni tokens", async () => {
    const { runDeepHealth } = await importHealthWithEnv(LIVE_ENV);
    const report = await runDeepHealth({
      fetchImpl: fakeFetch({ jupiter: { status: 401 }, xstocks: { status: 401 }, fx: { status: 401 } }),
      supabaseSelect: async () => true,
      rpcGetSlot: async () => {
        throw new Error("https://mainnet.helius-rpc.com/?api-key=" + "sk_" + "live_SECRETVALUE");
      },
    });
    const text = JSON.stringify(report);
    expect(text).not.toMatch(/api-key|sk_live|SECRETVALUE|token=/i);
    expect(report.checks.rpc.error).toBe("El proveedor no respondió correctamente.");
  });
});
