import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Auditoría 2026-11 — bloqueo incondicional de la ejecución real.
 *
 * Las operaciones reales todavía no tienen reservas atómicas de límites ni
 * revalidación del monto entre build y submit. Por eso, incluso con
 * `REAL_TRADING_READY=true`, quote/build/submit (y la lectura de estado real)
 * deben responder 503 REAL_DISABLED sin tocar el motor. La demo sigue igual.
 */

const { engine, demo } = vi.hoisted(() => ({
  engine: {
    quote: vi.fn(),
    build: vi.fn(),
    submit: vi.fn(),
    status: vi.fn(),
  },
  demo: {
    quote: vi.fn(),
    build: vi.fn(),
    submit: vi.fn(),
    status: vi.fn(),
  },
}));

vi.mock("@/lib/services", () => ({
  getServices: () => ({
    auth: {
      getSession: async () => ({ userId: "u-test", walletAddress: null }),
    },
    trade: engine,
  }),
}));

vi.mock("@/lib/services/demo.supabase", () => ({
  demoSupabase: { trade: demo },
}));

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
 * Ejecuta una ruta con un env controlado. `serverEnv` se evalúa al importar,
 * pero `isSupabaseAuth` lee `process.env` en cada request: el env debe seguir
 * puesto mientras corre la petición.
 */
async function withRoute<T>(
  name: RouteName,
  env: Record<string, string | undefined>,
  run: (route: RouteModule) => Promise<T>,
): Promise<T> {
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
    const route = await ROUTES[name]();
    return await run(route);
  } finally {
    for (const key of MANAGED_ENV) {
      const value = saved.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    vi.resetModules();
  }
}

/** M46 encendido y motor live: el escenario que antes abría la ejecución real. */
const REAL_READY_LIVE = {
  DATA_MODE: "live",
  AUTH_MODE: "supabase",
  NEXT_PUBLIC_AUTH_MODE: "supabase",
  NEXT_PUBLIC_DATA_MODE: "live",
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-test",
  NEXT_PUBLIC_SITE_URL: SITE,
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
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Auditoría: ejecución real bloqueada aunque REAL_TRADING_READY=true", () => {
  const cases: Array<{
    name: RouteName;
    label: string;
    call: (route: RouteModule) => Promise<Response>;
  }> = [
    {
      name: "quote",
      label: "POST /api/trade/quote",
      call: (route) => route.POST!(post("/api/trade/quote", QUOTE_BODY, "mv_account=real")),
    },
    {
      name: "build",
      label: "POST /api/trade/build",
      call: (route) => route.POST!(post("/api/trade/build", BUILD_BODY, "mv_account=real")),
    },
    {
      name: "submit",
      label: "POST /api/trade/submit",
      call: (route) => route.POST!(post("/api/trade/submit", SUBMIT_BODY, "mv_account=real")),
    },
    {
      name: "status",
      label: "GET /api/trade/status",
      call: (route) =>
        route.GET!(
          new Request(`${SITE}/api/trade/status?id=orden-1`, {
            headers: { cookie: "mv_account=real" },
          }),
        ),
    },
  ];

  for (const testCase of cases) {
    it(`${testCase.label}: 503 REAL_DISABLED y el motor live no se toca`, async () => {
      const response = await withRoute(testCase.name, REAL_READY_LIVE, (route) =>
        testCase.call(route),
      );
      expect(response.status).toBe(503);
      expect(await errorCode(response)).toBe("REAL_DISABLED");
      expect(engine.quote).not.toHaveBeenCalled();
      expect(engine.build).not.toHaveBeenCalled();
      expect(engine.submit).not.toHaveBeenCalled();
      expect(engine.status).not.toHaveBeenCalled();
    });
  }

  it("la compuerta es de código: no se abre con ninguna variable de entorno", async () => {
    const guards = await import("@/lib/trade/real-guards");
    expect(guards.REAL_EXECUTION_LOCKED).toBe(true);
    expect(() => guards.assertRealExecutionLocked()).toThrowError();
    await expect(guards.assertRealTradeAllowed("u-test", 100)).rejects.toMatchObject({
      code: "REAL_DISABLED",
    });
    await expect(guards.assertRealTradeAllowed("u-test", null)).rejects.toMatchObject({
      code: "REAL_DISABLED",
    });
  });

  it("la demo sigue operando con REAL_TRADING_READY=true", async () => {
    demo.build.mockResolvedValue({
      requestId: "r1",
      transactionBase64: "dHg=",
      expiresAt: new Date().toISOString(),
    });
    const response = await withRoute("build", REAL_READY_LIVE, (route) =>
      route.POST!(post("/api/trade/build", BUILD_BODY, "mv_account=demo")),
    );
    expect(response.status).toBe(200);
    expect(demo.build).toHaveBeenCalledTimes(1);
    expect(engine.build).not.toHaveBeenCalled();
  });
});
