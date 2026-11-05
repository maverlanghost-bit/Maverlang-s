import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { USDC_MINT } from "@/config/tickers";
import {
  RATE_LIMIT_POLICIES,
  SENSITIVE_RATE_LIMIT_POLICIES,
  type RateLimitPolicyName,
} from "@/lib/security/rate-limit";

/**
 * PRE-LANZAMIENTO: el cupo se aplica ANTES de tocar dinero.
 *
 * Riesgo que cubre esta prueba: si en producción no hay un backend de cupo
 * GLOBAL (Upstash), cada lambda de Vercel tendría su propia ventana en
 * memoria. Un cupo por instancia multiplicado por el número de instancias es
 * casi no tener cupo: un bot puede farmear la demo y, peor, quemar la cuota
 * de Jupiter/xAI que se paga por request. Por eso:
 *
 *  1. En producción sin Upstash TODA política sensible responde 503
 *     `RATE_LIMIT_UNAVAILABLE` y NO consume la ventana en memoria (si la
 *     tocara, al activar el modo test la primera llamada ya saldría 429).
 *  2. En test/desarrollo sin Upstash la ventana en memoria sigue viva: la
 *     demo de desarrollo no se apaga (429 al superar el techo).
 *  3. quote, build, submit y wallet/send/build rebotan con 429/503 ANTES de
 *     pedirle nada a los servicios (Jupiter/trade/sendBuild): el servicio
 *     mockeado explota si lo llaman antes del cupo.
 *  4. Ninguna ruta de dinero puede usar una política que en producción caiga
 *     a memoria por instancia.
 *
 * Sólo se mockean dependencias externas (servicios de trade/wallet, demo
 * Supabase, precios). `withRateLimit` y las rutas son las REALES.
 */

const ROOT = path.resolve(__dirname, "..", "..");
const SITE = "https://maverlang.test";
const IP = "203.0.113.10";

/* --- Servicios externos: si los llaman antes del cupo, la prueba explota --- */

const mocks = vi.hoisted(() => {
  const explode = (name: string) =>
    vi.fn(() => {
      throw new Error(`servicio externo llamado antes del cupo: ${name}`);
    });
  return {
    trade: {
      quote: explode("trade.quote"),
      build: explode("trade.build"),
      submit: explode("trade.submit"),
    },
    portfolio: {
      sendBuild: explode("portfolio.sendBuild"),
      balances: vi.fn(async () => [] as unknown[]),
    },
    demo: {
      trade: {
        quote: explode("demo.trade.quote"),
        build: explode("demo.trade.build"),
        submit: explode("demo.trade.submit"),
      },
    },
    auth: {
      getSession: vi.fn(async () => ({ userId: "u-1", walletAddress: "w".repeat(32) })),
    },
    /** `true` simula el día en que el candado de ejecución se abra (M74/M90). */
    guards: { unlocked: false },
  };
});

vi.mock("@/lib/services", () => ({
  getServices: () => ({ trade: mocks.trade, portfolio: mocks.portfolio, auth: mocks.auth }),
}));

vi.mock("@/lib/services/demo.supabase", () => ({ demoSupabase: mocks.demo }));

vi.mock("@/lib/services/prices.live", () => ({
  livePrices: { list: vi.fn(async () => [] as unknown[]) },
}));

/**
 * Las guardias reales de dinero leen flags/DB. Se dejan REALES por defecto
 * (`guards.unlocked = false`): así el candado de ejecución sigue cerrado y la
 * ruta responde como hoy. Sólo el test que simula el candado abierto las
 * salta, para comprobar que el cupo ya está en su lugar cuando se habilite.
 */
vi.mock("@/lib/trade/real-guards", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/trade/real-guards")>();
  // `DomainError` se resuelve en el mismo registro de módulos que la ruta
  // (después de cada `resetModules`): si viniera del módulo "original" la
  // comparación `instanceof` de `handle()` fallaría y daría 500 en vez de 503.
  const { DomainError } = await import("@/lib/api/result");
  return {
    ...actual,
    assertRealExecutionLocked: () => {
      if (mocks.guards.unlocked) return;
      if (actual.REAL_EXECUTION_LOCKED) throw new DomainError("REAL_DISABLED");
    },
    assertRealWithdrawalsEnabled: async () => {
      if (mocks.guards.unlocked) return;
      if (actual.REAL_EXECUTION_LOCKED) throw new DomainError("REAL_DISABLED");
      await actual.assertRealWithdrawalsEnabled();
    },
  };
});

/* --- Env --- */

const MANAGED_ENV = [
  "NODE_ENV",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "RATE_LIMIT_BACKEND",
  "RATE_LIMIT_TEST_SEARCH",
  "REAL_TRADING_READY",
  "NEXT_PUBLIC_SITE_URL",
] as const;

/** Producción real, sin Upstash, con el camino de dinero habilitado. */
const PROD_NO_UPSTASH: Record<string, string | undefined> = {
  NODE_ENV: "production",
  RATE_LIMIT_BACKEND: "auto",
  RATE_LIMIT_TEST_SEARCH: undefined,
  REAL_TRADING_READY: "true",
  NEXT_PUBLIC_SITE_URL: SITE,
  UPSTASH_REDIS_REST_URL: undefined,
  UPSTASH_REDIS_REST_TOKEN: undefined,
};

/** Desarrollo/test sin Upstash: la ventana en memoria sigue siendo el backend. */
const TEST_NO_UPSTASH: Record<string, string | undefined> = {
  ...PROD_NO_UPSTASH,
  NODE_ENV: "test",
  RATE_LIMIT_TEST_SEARCH: "5",
};

async function withEnv<T>(
  env: Record<string, string | undefined>,
  run: () => Promise<T>,
): Promise<T> {
  const saved = new Map<string, string | undefined>();
  const mutableEnv = process.env as Record<string, string | undefined>;
  for (const key of MANAGED_ENV) {
    saved.set(key, process.env[key]);
    delete process.env[key];
  }
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else mutableEnv[key] = value;
  }
  vi.resetModules();
  try {
    return await run();
  } finally {
    for (const key of MANAGED_ENV) {
      const value = saved.get(key);
      if (value === undefined) delete process.env[key];
      else mutableEnv[key] = value;
    }
    vi.resetModules();
  }
}

function request(ip: string): Request {
  return new Request(`${SITE}/api/x`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: SITE, "x-real-ip": ip },
    body: "{}",
  });
}

/** Agota la ventana en memoria de una política para la IP dada. */
async function exhaustIpWindow(
  rl: typeof import("@/lib/security/rate-limit"),
  ip: string,
  policy: RateLimitPolicyName,
): Promise<void> {
  for (let index = 0; index < RATE_LIMIT_POLICIES[policy].limit; index += 1) {
    expect(await rl.withRateLimit(request(ip), policy), `${policy} intento ${index + 1}`).toBeNull();
  }
}

type MoneyRoute = { label: string; POST: (req: Request) => Promise<Response>; make: (ip: string) => Request };

function quoteRequest(ip: string): Request {
  return new Request(`${SITE}/api/trade/quote`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: SITE, "x-real-ip": ip },
    body: JSON.stringify({ side: "buy", symbol: "AAPLx", amount: 10, amountCurrency: "USDC" }),
  });
}

function buildRequest(ip: string): Request {
  return new Request(`${SITE}/api/trade/build`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: SITE, "x-real-ip": ip },
    body: JSON.stringify({ quoteId: "q-1" }),
  });
}

function submitRequest(ip: string): Request {
  return new Request(`${SITE}/api/trade/submit`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: SITE, "x-real-ip": ip },
    body: JSON.stringify({ requestId: "req-1", signedTransactionBase64: "AAA" }),
  });
}

function sendRequest(ip: string): Request {
  return new Request(`${SITE}/api/wallet/send/build`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: SITE, "x-real-ip": ip },
    body: JSON.stringify({
      to: "d".repeat(32),
      mint: USDC_MINT,
      amountUi: 1,
      userPublicKey: "w".repeat(32),
    }),
  });
}

/** Importa las cuatro rutas de dinero después del `resetModules` de `withEnv`. */
async function moneyRoutes(): Promise<MoneyRoute[]> {
  const [quote, build, submit, send] = await Promise.all([
    import("@/app/api/trade/quote/route"),
    import("@/app/api/trade/build/route"),
    import("@/app/api/trade/submit/route"),
    import("@/app/api/wallet/send/build/route"),
  ]);
  return [
    { label: "POST /api/trade/quote", POST: quote.POST, make: quoteRequest },
    { label: "POST /api/trade/build", POST: build.POST, make: buildRequest },
    { label: "POST /api/trade/submit", POST: submit.POST, make: submitRequest },
    { label: "POST /api/wallet/send/build", POST: send.POST, make: sendRequest },
  ];
}

function expectNoServiceCalls(): void {
  for (const fn of [
    mocks.trade.quote,
    mocks.trade.build,
    mocks.trade.submit,
    mocks.portfolio.sendBuild,
    mocks.demo.trade.quote,
    mocks.demo.trade.build,
    mocks.demo.trade.submit,
  ]) {
    expect(fn).not.toHaveBeenCalled();
  }
}

beforeEach(() => {
  mocks.guards.unlocked = false;
  mocks.trade.quote.mockClear();
  mocks.trade.build.mockClear();
  mocks.trade.submit.mockClear();
  mocks.portfolio.sendBuild.mockClear();
  mocks.demo.trade.quote.mockClear();
  mocks.demo.trade.build.mockClear();
  mocks.demo.trade.submit.mockClear();
  mocks.auth.getSession.mockClear();
  // El módulo avisa por consola al fallar cerrado; no ensuciar la salida.
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  mocks.guards.unlocked = false;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

/* ------------------------------------------------------------------------- */
/* 1. Producción sin Upstash: toda política sensible falla cerrada            */
/* ------------------------------------------------------------------------- */

describe("producción sin Upstash: las políticas sensibles fallan cerradas", () => {
  it("cada política de SENSITIVE_RATE_LIMIT_POLICIES responde 503 RATE_LIMIT_UNAVAILABLE", async () => {
    await withEnv(PROD_NO_UPSTASH, async () => {
      const rl = await import("@/lib/security/rate-limit");
      const { errorMessage, httpStatusFor } = await import("@/lib/api/result");

      expect(SENSITIVE_RATE_LIMIT_POLICIES.length).toBe(8);
      expect(httpStatusFor("RATE_LIMIT_UNAVAILABLE")).toBe(503);

      for (const policy of SENSITIVE_RATE_LIMIT_POLICIES) {
        const response = await rl.withRateLimit(request(IP), policy);
        expect(response, policy).not.toBeNull();
        expect(response!.status, policy).toBe(503);
        expect(response!.headers.get("Retry-After"), policy).toBe("30");
        expect(response!.headers.get("Cache-Control"), policy).toBe("no-store");

        const body = (await response!.json()) as {
          ok: boolean;
          error: { code: string; message: string };
        };
        expect(body.ok, policy).toBe(false);
        // Código real del dominio, no un texto inventado por la prueba.
        expect(body.error.code, policy).toBe("RATE_LIMIT_UNAVAILABLE");
        expect(body.error.message, policy).toBe(errorMessage("RATE_LIMIT_UNAVAILABLE"));
      }
    });
  });

  it("no intenta red y no consume la ventana en memoria (N > límite sin 429)", async () => {
    await withEnv(PROD_NO_UPSTASH, async () => {
      const rl = await import("@/lib/security/rate-limit");
      const fetchSpy = vi.spyOn(globalThis, "fetch");
      const limit = RATE_LIMIT_POLICIES.trade.limit;

      // 25 llamadas > 20 del techo: todas 503, ninguna 429 (la memoria no cuenta).
      for (let index = 0; index < limit + 5; index += 1) {
        const response = await rl.withRateLimit(request(IP), "trade", ["u-1"]);
        expect(response!.status, `intento ${index + 1}`).toBe(503);
      }
      expect(fetchSpy).not.toHaveBeenCalled();

      // Si esas 25 llamadas hubieran tocado el contador, la primera de abajo
      // saldría 429: el modo test comparte el mismo módulo y la misma clave.
      (process.env as Record<string, string | undefined>).NODE_ENV = "test";
      for (let index = 0; index < limit; index += 1) {
        expect(
          await rl.withRateLimit(request(IP), "trade", ["u-1"]),
          `la ventana quedó intacta (llamada ${index + 1})`,
        ).toBeNull();
      }
      expect((await rl.withRateLimit(request(IP), "trade", ["u-1"]))!.status).toBe(429);
    });
  });
});

/* ------------------------------------------------------------------------- */
/* 2. Test/desarrollo: la ventana en memoria sigue viva                      */
/* ------------------------------------------------------------------------- */

describe("test/desarrollo sin Upstash: la demo no se apaga", () => {
  it("la solicitud límite+1 responde 429 RATE_LIMITED con Retry-After", async () => {
    await withEnv(TEST_NO_UPSTASH, async () => {
      const rl = await import("@/lib/security/rate-limit");
      const { errorMessage } = await import("@/lib/api/result");
      const limit = rl.resolvePolicy("search").limit;

      for (let index = 0; index < limit; index += 1) {
        expect(await rl.withRateLimit(request(IP), "search")).toBeNull();
      }

      const limited = await rl.withRateLimit(request(IP), "search");
      expect(limited).not.toBeNull();
      expect(limited!.status).toBe(429);
      expect(limited!.headers.get("Retry-After")).toMatch(/^[1-9]\d*$/);
      expect(limited!.headers.get("X-RateLimit-Remaining")).toBe("0");

      const body = (await limited!.json()) as { ok: boolean; error: { code: string; message: string } };
      expect(body.ok).toBe(false);
      expect(body.error.code).toBe("RATE_LIMITED");
      expect(body.error.message).toBe(errorMessage("RATE_LIMITED"));
    });
  });
});

/* ------------------------------------------------------------------------- */
/* 3. Rutas de dinero: cupo antes de armar nada                              */
/* ------------------------------------------------------------------------- */

describe("rutas de dinero: el cupo corre antes de armar nada", () => {
  it("en producción sin Upstash las cuatro responden 503 y no llaman servicios", async () => {
    await withEnv(PROD_NO_UPSTASH, async () => {
      // Candado de ejecución abierto (simulado): es el escenario en que la
      // salida de dinero está viva y el cupo tiene que decidir.
      mocks.guards.unlocked = true;
      const routes = await moneyRoutes();
      expect(routes).toHaveLength(4);

      for (const [index, route] of routes.entries()) {
        const response = await route.POST(route.make(`203.0.113.${40 + index}`));
        expect(response.status, route.label).toBe(503);
        const body = (await response.json()) as { error?: { code?: string } };
        expect(body.error?.code, route.label).toBe("RATE_LIMIT_UNAVAILABLE");
      }

      expectNoServiceCalls();
    });
  });

  it("con el cupo por IP agotado las cuatro responden 429 y no llaman servicios", async () => {
    await withEnv(TEST_NO_UPSTASH, async () => {
      mocks.guards.unlocked = true;
      const rl = await import("@/lib/security/rate-limit");
      const routes = await moneyRoutes();

      for (const [index, route] of routes.entries()) {
        // Cada ruta con su propia IP: el bucket `tradeIp` no se comparte.
        const ip = `198.51.100.${10 + index}`;
        await exhaustIpWindow(rl, ip, "tradeIp");

        const response = await route.POST(route.make(ip));
        expect(response.status, route.label).toBe(429);
        const body = (await response.json()) as { error?: { code?: string } };
        expect(body.error?.code, route.label).toBe("RATE_LIMITED");
      }

      expectNoServiceCalls();
    });
  });

  it("submit respeta además el cupo por usuario (política trade) antes de firmar", async () => {
    await withEnv(TEST_NO_UPSTASH, async () => {
      const rl = await import("@/lib/security/rate-limit");
      const { POST } = await import("@/app/api/trade/submit/route");

      // La sesión mockeada es siempre `u-1`; se agota su ventana de `trade`.
      for (let index = 0; index < RATE_LIMIT_POLICIES.trade.limit; index += 1) {
        expect(await rl.withRateLimit(request(IP), "trade", ["u-1"])).toBeNull();
      }

      const response = await POST(submitRequest(IP));
      expect(response.status).toBe(429);
      const body = (await response.json()) as { error?: { code?: string } };
      expect(body.error?.code).toBe("RATE_LIMITED");
      expect(mocks.trade.submit).not.toHaveBeenCalled();
      expect(mocks.demo.trade.submit).not.toHaveBeenCalled();
    });
  });

  it("send/build hoy responde antes por el candado cerrado: el cupo queda detrás", async () => {
    // Hallazgo (no un fallo abierto): con `REAL_EXECUTION_LOCKED = true` la
    // salida de dinero responde 503 REAL_DISABLED en la línea 85 del route,
    // ANTES de `withRateLimit` (línea 86). Falla cerrado y no toca el envío,
    // pero mientras el candado siga puesto el cupo de esa ruta no se evalúa.
    const actual = await vi.importActual<typeof import("@/lib/trade/real-guards")>(
      "@/lib/trade/real-guards",
    );
    expect(actual.REAL_EXECUTION_LOCKED).toBe(true);
    let code: string | undefined;
    try {
      actual.assertRealExecutionLocked();
    } catch (error) {
      code = (error as { code?: string }).code;
    }
    expect(code).toBe("REAL_DISABLED");

    const source = readFileSync(path.join(ROOT, "app/api/wallet/send/build/route.ts"), "utf8");
    expect(source.indexOf("assertRealExecutionLocked(")).toBeLessThan(
      source.indexOf("withRateLimit("),
    );
    expect(source.indexOf("withRateLimit(")).toBeLessThan(
      source.indexOf("services.portfolio.sendBuild("),
    );
  });

  it("send/build, con el candado abierto, responde 429 por cupo antes de armar la tx", async () => {
    await withEnv(TEST_NO_UPSTASH, async () => {
      const rl = await import("@/lib/security/rate-limit");
      mocks.guards.unlocked = true;
      const { POST } = await import("@/app/api/wallet/send/build/route");
      const ip = "192.0.2.56";
      await exhaustIpWindow(rl, ip, "tradeIp");

      const response = await POST(sendRequest(ip));
      expect(response.status).toBe(429);
      const body = (await response.json()) as { error?: { code?: string } };
      expect(body.error?.code).toBe("RATE_LIMITED");
      expect(mocks.portfolio.sendBuild).not.toHaveBeenCalled();
    });
  });
});

/* ------------------------------------------------------------------------- */
/* 4. Guardia estática: ninguna ruta de dinero usa una política no sensible  */
/* ------------------------------------------------------------------------- */

describe("rutas de dinero: política y orden del cupo (estático)", () => {
  const MONEY_ROUTES = [
    "app/api/trade/quote/route.ts",
    "app/api/trade/build/route.ts",
    "app/api/trade/submit/route.ts",
    "app/api/wallet/send/build/route.ts",
  ] as const;

  function policiesOf(file: string): string[] {
    const source = readFileSync(path.join(ROOT, file), "utf8");
    return [...source.matchAll(/withRateLimit\(\s*req\s*,\s*"([A-Za-z]+)"/g)].map(
      (match) => match[1] as string,
    );
  }

  it("sólo usa políticas sensibles (o `demoTrade`, que nunca mueve dinero real)", () => {
    for (const file of MONEY_ROUTES) {
      const policies = policiesOf(file);
      expect(policies.length, `${file} sin withRateLimit`).toBeGreaterThan(0);
      // `demoTrade` protege la demo (sin dinero real) y puede seguir en
      // memoria por instancia; cualquier otra política no sensible en una ruta
      // de dinero significaría que en producción el cupo se multiplica por
      // lambda: dinero farmeable y cuota de Jupiter pagada de más.
      const risky = policies.filter(
        (policy) =>
          policy !== "demoTrade" &&
          !(SENSITIVE_RATE_LIMIT_POLICIES as readonly string[]).includes(policy),
      );
      expect(risky, `${file} usa políticas que caen a memoria`).toEqual([]);
    }
  });

  it("withRateLimit aparece antes de la llamada al servicio externo", () => {
    const serviceCall: Record<string, string> = {
      "app/api/trade/quote/route.ts": "quote({ ...body, symbol }",
      "app/api/trade/build/route.ts": "build(body, userId ?? undefined)",
      "app/api/trade/submit/route.ts": "services.trade.submit(",
      "app/api/wallet/send/build/route.ts": "services.portfolio.sendBuild(",
    };
    for (const file of MONEY_ROUTES) {
      const source = readFileSync(path.join(ROOT, file), "utf8");
      const limitAt = source.indexOf("withRateLimit(");
      const callAt = source.indexOf(serviceCall[file] as string);
      expect(limitAt, `${file}: falta withRateLimit`).toBeGreaterThan(-1);
      expect(callAt, `${file}: no se encontró la llamada al servicio`).toBeGreaterThan(-1);
      expect(limitAt, `${file}: el cupo va después del servicio`).toBeLessThan(callAt);
    }
  });
});
