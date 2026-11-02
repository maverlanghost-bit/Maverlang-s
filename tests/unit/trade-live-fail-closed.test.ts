import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { checkLimits, type CountedOrder, type LimitsDeps } from "@/lib/trade/limits";

const ROOT = path.resolve(__dirname, "..", "..");

/**
 * Auditoría 2026-11 — regresiones:
 * 1) Con DATA_MODE=live, quote/build/submit (y status) no pueden caer al motor
 *    live si la auth no es Supabase con cuenta real explícita, aunque
 *    REAL_TRADING_READY esté encendido.
 * 2) Si la lectura de órdenes falla, los límites fallan cerrados (nunca 0).
 */

const { engine, adminState } = vi.hoisted(() => ({
  engine: {
    quote: vi.fn(),
    build: vi.fn(),
    submit: vi.fn(),
    status: vi.fn(),
  },
  adminState: { result: { data: null as unknown, error: null as unknown } },
}));

vi.mock("@/lib/services", () => ({
  getServices: () => ({
    auth: {
      getSession: async () => ({ userId: "u-test", walletAddress: null }),
    },
    trade: engine,
  }),
}));

// Cliente admin falso y encadenable: sólo devuelve `adminState.result` al
// final del `limit()`, suficiente para los lectores de límites.
vi.mock("@/lib/supabase/admin", () => {
  type Chain = {
    select: () => Chain;
    eq: () => Chain;
    order: () => Chain;
    limit: () => Promise<typeof adminState.result>;
  };
  const build = (): Chain => {
    const chain: Chain = {
      select: () => chain,
      eq: () => chain,
      order: () => chain,
      limit: () => Promise.resolve(adminState.result),
    };
    return chain;
  };
  return { createSupabaseAdminClient: () => ({ from: () => build() }) };
});

const SITE = "https://maverlang.test";

const MANAGED_ENV = [
  "DATA_MODE",
  "AUTH_MODE",
  "NEXT_PUBLIC_AUTH_MODE",
  "NEXT_PUBLIC_DATA_MODE",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "NEXT_PUBLIC_SITE_URL",
  "REAL_TRADING_READY",
] as const;

type RouteName = "quote" | "build" | "submit" | "status";

type RouteModule = {
  POST?: (req: Request) => Promise<Response>;
  GET?: (req: Request) => Promise<Response>;
};

const ROUTES: Record<RouteName, () => Promise<RouteModule>> = {
  quote: () => import("@/app/api/trade/quote/route"),
  build: () => import("@/app/api/trade/build/route"),
  submit: () => import("@/app/api/trade/submit/route"),
  status: () => import("@/app/api/trade/status/route"),
};

/**
 * Reimporta una ruta con un env controlado. `serverEnv` se evalúa al importar
 * `@/lib/env`, así que hay que limpiar y resetear módulos (mismo patrón que
 * `health.test.ts`).
 */
async function importRoute(
  name: RouteName,
  env: Record<string, string | undefined>,
): Promise<RouteModule> {
  const saved = new Map<string, string | undefined>();
  for (const key of MANAGED_ENV) {
    saved.set(key, process.env[key]);
    delete process.env[key];
  }
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.resetModules();
  try {
    return await ROUTES[name]();
  } finally {
    for (const key of MANAGED_ENV) {
      const value = saved.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    vi.resetModules();
  }
}

const LIVE_WITHOUT_SUPABASE = {
  DATA_MODE: "live",
  AUTH_MODE: "mock",
  NEXT_PUBLIC_AUTH_MODE: "mock",
  NEXT_PUBLIC_SITE_URL: SITE,
  // Aun con el flag encendido, sin sesión Supabase + cuenta real no se opera.
  REAL_TRADING_READY: "true",
} as const;

function post(pathname: string, body: unknown, cookie?: string): Request {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    origin: SITE,
  };
  if (cookie) headers.cookie = cookie;
  return new Request(`${SITE}${pathname}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

const QUOTE_BODY = { side: "buy", symbol: "AAPLx", amount: 10, amountCurrency: "USDC" };
const BUILD_BODY = { quoteId: "q1", userPublicKey: "x".repeat(32) };
const SUBMIT_BODY = { requestId: "r1", signedTransactionBase64: "dHg=" };

async function errorCode(response: Response): Promise<string | undefined> {
  const payload = (await response.json()) as { error?: { code?: string } };
  return payload.error?.code;
}

beforeEach(() => {
  vi.clearAllMocks();
  adminState.result = { data: null, error: null };
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Auditoría: motor live exige sesión Supabase y cuenta real", () => {
  const cases: Array<{
    name: RouteName;
    label: string;
    call: (route: RouteModule) => Promise<Response>;
  }> = [
    {
      name: "quote",
      label: "POST /api/trade/quote",
      call: (route) => route.POST!(post("/api/trade/quote", QUOTE_BODY)),
    },
    {
      name: "build",
      label: "POST /api/trade/build",
      call: (route) => route.POST!(post("/api/trade/build", BUILD_BODY)),
    },
    {
      name: "submit",
      label: "POST /api/trade/submit",
      call: (route) => route.POST!(post("/api/trade/submit", SUBMIT_BODY)),
    },
    {
      name: "status",
      label: "GET /api/trade/status",
      call: (route) =>
        route.GET!(new Request(`${SITE}/api/trade/status?id=orden-1`)),
    },
  ];

  for (const testCase of cases) {
    it(`${testCase.label}: DATA_MODE=live + AUTH_MODE=mock → 503 REAL_DISABLED sin tocar el motor`, async () => {
      const route = await importRoute(testCase.name, LIVE_WITHOUT_SUPABASE);
      const response = await testCase.call(route);
      expect(response.status).toBe(503);
      expect(await errorCode(response)).toBe("REAL_DISABLED");
      expect(engine.quote).not.toHaveBeenCalled();
      expect(engine.build).not.toHaveBeenCalled();
      expect(engine.submit).not.toHaveBeenCalled();
      expect(engine.status).not.toHaveBeenCalled();
    });
  }

  it("DATA_MODE=live + cookie demo sin Supabase tampoco alcanza el motor live", async () => {
    const route = await importRoute("build", LIVE_WITHOUT_SUPABASE);
    const response = await route.POST!(post("/api/trade/build", BUILD_BODY, "mv_account=demo"));
    expect(response.status).toBe(503);
    expect(await errorCode(response)).toBe("REAL_DISABLED");
    expect(engine.build).not.toHaveBeenCalled();
  });

  it("DATA_MODE=mock sigue usando el motor mock (demo/e2e intactos)", async () => {
    engine.build.mockResolvedValue({
      requestId: "r1",
      transactionBase64: "dHg=",
      expiresAt: new Date().toISOString(),
    });
    const route = await importRoute("build", {
      DATA_MODE: "mock",
      AUTH_MODE: "mock",
      NEXT_PUBLIC_AUTH_MODE: "mock",
      NEXT_PUBLIC_SITE_URL: SITE,
    });
    const response = await route.POST!(post("/api/trade/build", BUILD_BODY));
    expect(response.status).toBe(200);
    expect(engine.build).toHaveBeenCalledTimes(1);
  });
});

// -----------------------------------------------------------------------------
// Límites: fallo cerrado ante una lectura de órdenes caída
// -----------------------------------------------------------------------------

function makeDeps(orders: CountedOrder[] = []): LimitsDeps {
  const now = new Date("2026-10-15T15:00:00Z");
  return {
    getFlagBool: async (key) => (key === "beta_only" ? false : true),
    getFlagValue: async (key) => (key === "global_daily_usd" ? 10_000 : undefined),
    readUserLimits: async () => null,
    isBetaUser: async () => false,
    listOrders: async () => orders,
    listOrdersAllUsers: async () => orders,
    now: () => now,
  };
}

describe("Auditoría: límites fallan cerrados si no se pueden leer las órdenes", () => {
  it("listOrders del usuario caído → UPSTREAM, no un veredicto ok", async () => {
    const deps = makeDeps();
    deps.listOrders = async () => {
      throw new Error("db down");
    };
    await expect(checkLimits("u1", 50, deps)).rejects.toMatchObject({ code: "UPSTREAM" });
  });

  it("listOrdersAllUsers (tope global) caído → UPSTREAM, no un veredicto ok", async () => {
    const deps = makeDeps();
    deps.listOrdersAllUsers = async () => {
      throw new Error("db down");
    };
    await expect(checkLimits("u1", 50, deps)).rejects.toMatchObject({ code: "UPSTREAM" });
  });

  it("lectura vacía legítima sigue aprobando", async () => {
    const verdict = await checkLimits("u1", 50, makeDeps([]));
    expect(verdict.ok).toBe(true);
  });

  it("los lectores de órdenes para límites no devuelven [] cuando la base falla", async () => {
    adminState.result = { data: null, error: { message: "db down", code: "08006" } };
    const mod = await import("@/lib/services/orders.supabase");
    await expect(mod.listOrdersForLimits("u1")).rejects.toThrow("orders_unavailable");
    await expect(mod.listAllOrdersForLimits()).rejects.toThrow("orders_unavailable");
  });

  it("no quedan catch que abran los topes con [] en limits.ts", () => {
    const source = readFileSync(path.join(ROOT, "lib", "trade", "limits.ts"), "utf8");
    expect(source).not.toMatch(/listOrders\(userId\)\.catch/);
    expect(source).not.toMatch(/listOrdersAllUsers\(\)\.catch/);
    expect(source).toMatch(/No pudimos verificar tus límites/);
  });
});
