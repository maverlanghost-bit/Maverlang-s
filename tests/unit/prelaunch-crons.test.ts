import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET as alertsGet } from "@/app/api/cron/price-alerts/route";
import { GET as backfillGet } from "@/app/api/cron/price-backfill/route";
import { GET as catalogHealthGet } from "@/app/api/cron/catalog-health/route";
import { GET as ticksGet } from "@/app/api/cron/price-ticks/route";
import { GET as ordersGet, POST as ordersPost } from "@/app/api/cron/reconcile-orders/route";
import { GET as walletGet, POST as walletPost } from "@/app/api/cron/reconcile-wallet/route";
import { GET as deepGet } from "@/app/api/health/deep/route";

/**
 * Prelaunch: ningún cron ni `/api/health/deep` trabaja sin autorización.
 *
 * Fugas que cubre este archivo:
 * - Un cron abierto quema cuota de RPC/Jupiter/CoinGecko y escribe dinero
 *   (depósitos, órdenes, precios) sin que nadie lo haya pedido.
 * - Un cron que lee la cadena o la base ANTES de mirar el token deja que un
 *   anónimo provoque lecturas (coste y superficie) con sólo un GET.
 * - `/api/health/deep` abierto publica el mapa de dependencias del despliegue
 *   y, si algún error se cuela crudo, URLs de RPC con api-key y JWT de Supabase.
 *
 * Los handlers son los REALES. Sólo se mockean a nivel de módulo las
 * dependencias externas (cadena, base, precios, catálogo), y esos mocks
 * funcionan como detectores: si alguno se llama en un caso no autorizado, el
 * test falla. Nada de red, nada de Supabase, nada de mainnet.
 */

/** Env determinista en mock: aunque la shell traiga precios live, el deep no sale a la red. */
const savedModes = vi.hoisted(() => {
  const saved = {
    DATA_MODE: process.env.DATA_MODE,
    PRICES_MODE: process.env.PRICES_MODE,
    MARKET_STATUS_MODE: process.env.MARKET_STATUS_MODE,
    AUTH_MODE: process.env.AUTH_MODE,
  };
  process.env.DATA_MODE = "mock";
  process.env.PRICES_MODE = "mock";
  process.env.MARKET_STATUS_MODE = "mock";
  process.env.AUTH_MODE = "mock";
  return saved;
});

/** Detectores de trabajo real: cadena, base, precios, órdenes, catálogo y caché. */
const mocks = vi.hoisted(() => ({
  // billetera (cadena + base)
  syncSolanaUsdcDeposits: vi.fn(),
  reconcileWalletMovements: vi.fn(),
  // órdenes (base + estado de firma)
  reconcilePendingOrders: vi.fn(),
  // precios / historia (base + proveedores)
  assertPriceTicksWritable: vi.fn(),
  listVisiblePriceAssets: vi.fn(),
  symbolsWithHistory: vi.fn(),
  writePriceTicks: vi.fn(),
  runJupiterTickJob: vi.fn(),
  runCoinGeckoBackfillJob: vi.fn(),
  // avisos de precio
  runDailyPriceAlerts: vi.fn(),
  // catálogo
  runSafetyBatch: vi.fn(),
  // caché (después de escribir)
  revalidateTag: vi.fn(),
  // RPC de Solana (cadena)
  getServerConnection: vi.fn(),
}));

vi.mock("@/lib/wallet/deposit-sync", () => ({
  syncSolanaUsdcDeposits: mocks.syncSolanaUsdcDeposits,
}));

vi.mock("@/lib/wallet/reconcile-movements", () => ({
  reconcileWalletMovements: mocks.reconcileWalletMovements,
}));

vi.mock("@/lib/orders/reconcile", () => ({
  reconcilePendingOrders: mocks.reconcilePendingOrders,
}));

vi.mock("@/lib/services/price-ticks.supabase", () => ({
  assertPriceTicksWritable: mocks.assertPriceTicksWritable,
  listVisiblePriceAssets: mocks.listVisiblePriceAssets,
  symbolsWithHistory: mocks.symbolsWithHistory,
  writePriceTicks: mocks.writePriceTicks,
}));

vi.mock("@/lib/services/underlying-prices.supabase", () => ({
  PRICES_TAG: "prices",
}));

vi.mock("@/lib/market/price-cron-job", () => ({
  runJupiterTickJob: mocks.runJupiterTickJob,
  runCoinGeckoBackfillJob: mocks.runCoinGeckoBackfillJob,
}));

vi.mock("@/lib/services/alerts", () => ({
  runDailyPriceAlerts: mocks.runDailyPriceAlerts,
}));

vi.mock("@/lib/catalog/monitor", () => ({
  runSafetyBatch: mocks.runSafetyBatch,
}));

vi.mock("next/cache", () => ({
  revalidateTag: mocks.revalidateTag,
}));

/**
 * Módulo de RPC: sólo `getServerConnection` es detector. Se mockea entero
 * (sin `importOriginal`) para no cargar `@solana/web3.js` en cada grafo que
 * arma `vi.resetModules()`; el resto son stubs con la misma firma.
 */
vi.mock("@/lib/solana/connection", () => ({
  getServerConnection: mocks.getServerConnection,
  getClientConnection: () => {
    throw new Error("los crons no abren conexiones de cliente");
  },
  publicCluster: () => "mainnet-beta",
  publicRpcUrl: () => "https://public.invalid",
  serverRpcUrl: () => "https://server.invalid",
}));

const SECRET = "test-cron-secret-prelaunch-0123456789";
/** Valor señuelo: si aparece en una respuesta, hubo fuga. */
const WRONG_TOKEN = "no-secreto";

const DEPOSIT_SUMMARY = {
  ok: true,
  mode: "mock" as const,
  enabled: false,
  walletsTotal: 0,
  walletsScanned: 0,
  failedWallets: 0,
  signaturesChecked: 0,
  detected: 0,
  confirmed: 0,
  finalized: 0,
  duplicates: 0,
  rejected: 0,
  skipped: 0,
  notAllowlisted: 0,
  errors: [] as string[],
  truncated: false,
  durationMs: 0,
};

const MOVEMENTS_SUMMARY = {
  reviewed: 0,
  confirmed: 0,
  failed: 0,
  disappeared: 0,
  pending: 0,
  skipped: 0,
  durationMs: 0,
  truncated: false,
};

const ORDERS_SUMMARY = {
  ok: true,
  mode: "mock" as const,
  scanned: 0,
  confirmed: 0,
  failed: 0,
  expired: 0,
  unchanged: 0,
  durationMs: 0,
};

const TICKS_RESULT = { recorded: 0, candidates: 0, quoted: 0, dbError: null, rateLimited: false };

const BACKFILL_RESULT = {
  backfilled: 0,
  pending: 0,
  points: 0,
  noId: 0,
  rateLimited: false,
  dbError: null,
  remaining: 0,
  idMap: 0,
};

const ALERTS_SUMMARY = {
  ok: true,
  mode: "mock" as const,
  checked: 0,
  triggered: 0,
  emailed: 0,
  skipped: 0,
  truncated: false,
};

const SAFETY_SUMMARY = { checked: 0, changed: 0, remaining: 0 };

type Handler = (req: Request) => Promise<Response>;
type Method = "GET" | "POST";

interface CronCase {
  name: string;
  /** Ruta real (para la URL del Request). */
  url: string;
  handlers: Partial<Record<Method, Handler>>;
  methods: Method[];
  /** Código REAL de esa ruta cuando falta `CRON_SECRET` (leído del fuente). */
  missingSecretStatus: 401 | 503;
  /** Dependencias que SÍ deben correr con el token correcto. */
  deps: () => ReturnType<typeof vi.fn>[];
}

const CRONS: CronCase[] = [
  {
    name: "reconcile-wallet",
    url: "/api/cron/reconcile-wallet",
    handlers: { GET: walletGet, POST: walletPost },
    methods: ["GET", "POST"],
    missingSecretStatus: 503,
    deps: () => [mocks.syncSolanaUsdcDeposits, mocks.reconcileWalletMovements],
  },
  {
    name: "reconcile-orders",
    url: "/api/cron/reconcile-orders",
    handlers: { GET: ordersGet, POST: ordersPost },
    methods: ["GET", "POST"],
    missingSecretStatus: 503,
    deps: () => [mocks.reconcilePendingOrders],
  },
  {
    name: "price-ticks",
    url: "/api/cron/price-ticks",
    handlers: { GET: ticksGet },
    methods: ["GET"],
    missingSecretStatus: 503,
    deps: () => [mocks.assertPriceTicksWritable, mocks.listVisiblePriceAssets, mocks.runJupiterTickJob],
  },
  {
    name: "price-alerts",
    url: "/api/cron/price-alerts",
    handlers: { GET: alertsGet },
    methods: ["GET"],
    missingSecretStatus: 503,
    deps: () => [mocks.runDailyPriceAlerts],
  },
  {
    name: "price-backfill",
    url: "/api/cron/price-backfill",
    handlers: { GET: backfillGet },
    methods: ["GET"],
    missingSecretStatus: 503,
    deps: () => [mocks.assertPriceTicksWritable, mocks.listVisiblePriceAssets, mocks.runCoinGeckoBackfillJob],
  },
  {
    name: "catalog-health",
    url: "/api/cron/catalog-health",
    handlers: { GET: catalogHealthGet },
    methods: ["GET"],
    missingSecretStatus: 503,
    deps: () => [mocks.runSafetyBatch],
  },
];

/** `Request` de Web API estándar; el token va en `Authorization: Bearer`. */
function request(url: string, method: Method, authorization?: string): Request {
  const headers: Record<string, string> = {};
  if (authorization !== undefined) headers.authorization = authorization;
  return new Request(`https://maverlang.test${url}`, { method, headers });
}

async function bodyText(response: Response): Promise<string> {
  return JSON.stringify(await response.clone().json());
}

/** Ningún detector de trabajo real se disparó. */
function expectNoWork(): void {
  for (const [name, detector] of Object.entries(mocks)) {
    expect(detector, `la dependencia "${name}" corrió sin autorización`).not.toHaveBeenCalled();
  }
}

beforeEach(() => {
  for (const detector of Object.values(mocks)) detector.mockReset();
  mocks.syncSolanaUsdcDeposits.mockResolvedValue(DEPOSIT_SUMMARY);
  mocks.reconcileWalletMovements.mockResolvedValue(MOVEMENTS_SUMMARY);
  mocks.reconcilePendingOrders.mockResolvedValue(ORDERS_SUMMARY);
  mocks.assertPriceTicksWritable.mockResolvedValue(null);
  mocks.listVisiblePriceAssets.mockResolvedValue([]);
  mocks.symbolsWithHistory.mockResolvedValue([]);
  mocks.writePriceTicks.mockResolvedValue({ written: 0 });
  mocks.runJupiterTickJob.mockResolvedValue(TICKS_RESULT);
  mocks.runCoinGeckoBackfillJob.mockResolvedValue(BACKFILL_RESULT);
  mocks.runDailyPriceAlerts.mockResolvedValue(ALERTS_SUMMARY);
  mocks.runSafetyBatch.mockResolvedValue(SAFETY_SUMMARY);
  mocks.revalidateTag.mockReturnValue(undefined);
  mocks.getServerConnection.mockImplementation(() => {
    throw new Error("no autorizado: el cron no debe abrir la conexión a la cadena");
  });
  vi.stubEnv("CRON_SECRET", SECRET);
  // `handle` loguea el 401; no ensuciamos la salida del test.
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

afterAll(() => {
  for (const [key, value] of Object.entries(savedModes)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

/* --- 1. Token incorrecto --- */

describe("prelaunch: crons con token incorrecto → 401 y cero trabajo", () => {
  // Fuga evitada: cualquier anónimo dispararía barridos de cadena y escrituras de dinero.
  for (const cron of CRONS) {
    it(`${cron.name}: 401 en ${cron.methods.join("+")}, sin tocar cadena/base`, async () => {
      for (const method of cron.methods) {
        const handler = cron.handlers[method]!;
        const response = await handler(request(cron.url, method, `Bearer ${WRONG_TOKEN}`));
        expect(response.status, `${cron.name} ${method}`).toBe(401);
        const payload = (await response.clone().json()) as { ok: boolean; error?: { code: string } };
        expect(payload.ok).toBe(false);
        expect(payload.error?.code).toBe("UNAUTHORIZED");
        expect(response.headers.get("cache-control")).toBe("no-store");
        // La respuesta no repite el token ni el secreto esperado.
        const text = await bodyText(response);
        expect(text).not.toContain(SECRET);
        expect(text).not.toContain(WRONG_TOKEN);
      }
      expectNoWork();
    });
  }
});

/* --- 2. `CRON_SECRET` ausente (o vacío) --- */

describe("prelaunch: crons sin CRON_SECRET configurado → código real de la ruta y cero trabajo", () => {
  // Fuga evitada: un deploy sin secreto no debe convertirse en un cron público.
  for (const cron of CRONS) {
    it(`${cron.name}: ${cron.missingSecretStatus} sin secreto`, async () => {
      for (const empty of ["", "   "]) {
        vi.stubEnv("CRON_SECRET", empty);
        for (const method of cron.methods) {
          const handler = cron.handlers[method]!;
          const response = await handler(request(cron.url, method, `Bearer ${SECRET}`));
          expect(response.status, `${cron.name} ${method} con CRON_SECRET=${JSON.stringify(empty)}`).toBe(
            cron.missingSecretStatus,
          );
          const payload = (await response.clone().json()) as { ok: boolean; error?: { code: string } };
          expect(payload.ok).toBe(false);
          expect(payload.error?.code).toBe(cron.missingSecretStatus === 503 ? "REAL_DISABLED" : "UNAUTHORIZED");
        }
      }
      expectNoWork();
    });
  }
});

/* --- 3. Header ausente o malformado --- */

describe("prelaunch: crons con Authorization ausente o malformado → mismo cierre", () => {
  // Fuga evitada: un `Authorization: <secreto>` sin esquema, o `Bearer` vacío, no autoriza.
  const MALFORMED: (string | undefined)[] = [
    undefined, // header ausente
    "", // header vacío
    "Bearer", // sin token
    "Bearer   ", // sólo espacios
    SECRET, // token sin el esquema Bearer
    `Basic ${SECRET}`, // otro esquema
    `bearer ${SECRET}`, // esquema en minúsculas
  ];

  for (const cron of CRONS) {
    it(`${cron.name}: rechaza ${MALFORMED.length} variantes sin ejecutar el trabajo`, async () => {
      for (const authorization of MALFORMED) {
        for (const method of cron.methods) {
          const handler = cron.handlers[method]!;
          const response = await handler(request(cron.url, method, authorization));
          expect(response.status, `${cron.name} ${method} con ${JSON.stringify(authorization)}`).toBe(401);
        }
      }
      expectNoWork();
    });
  }
});

/* --- 4. Comparación del token: comportamiento esperado (no la implementación) --- */

describe("prelaunch: la comparación del token no acepta casi-aciertos", () => {
  // Fuga evitada: un `startsWith`/`includes` mal puesto dejaría pasar un prefijo del secreto.
  // Las rutas ya comparan con `timingSafeEqual`; acá sólo se fija el comportamiento.
  const SAME_LENGTH = `${SECRET.slice(0, -1)}${SECRET.endsWith("9") ? "8" : "9"}`;
  const CASES: { label: string; authorization: string }[] = [
    { label: "prefijo del secreto", authorization: `Bearer ${SECRET.slice(0, 12)}` },
    { label: "secreto truncado en un carácter", authorization: `Bearer ${SECRET.slice(0, -1)}` },
    { label: "mismo largo con un carácter cambiado", authorization: `Bearer ${SAME_LENGTH}` },
    { label: "secreto con un carácter extra", authorization: `Bearer ${SECRET}x` },
  ];

  for (const cron of CRONS) {
    it(`${cron.name}: 401 en ${CASES.length} casi-aciertos`, async () => {
      for (const testCase of CASES) {
        const handler = cron.handlers[cron.methods[0]!]!;
        const response = await handler(request(cron.url, cron.methods[0]!, testCase.authorization));
        expect(response.status, `${cron.name}: ${testCase.label}`).toBe(401);
      }
      expectNoWork();
    });
  }

  it("reconcile-wallet/reconcile-orders: el mismo criterio en POST", async () => {
    for (const handler of [walletPost, ordersPost]) {
      const response = await handler(request("/api/cron/x", "POST", `Bearer ${SAME_LENGTH}`));
      expect(response.status).toBe(401);
    }
    expectNoWork();
  });
});

/* --- 5. Con el token correcto el trabajo SÍ corre (los mocks son las deps reales) --- */

describe("prelaunch: con el token correcto el cron ejecuta su trabajo", () => {
  // Contraprueba: sin esto, los `not.toHaveBeenCalled()` de arriba podrían ser vacíos.
  for (const cron of CRONS) {
    it(`${cron.name}: llama a sus dependencias y responde 200`, async () => {
      for (const method of cron.methods) {
        for (const detector of Object.values(mocks)) detector.mockClear();
        const handler = cron.handlers[method]!;
        const response = await handler(request(cron.url, method, `Bearer ${SECRET}`));
        expect(response.status, `${cron.name} ${method}`).toBe(200);
        const payload = (await response.json()) as { ok: boolean };
        expect(payload.ok).toBe(true);
        for (const dep of cron.deps()) expect(dep).toHaveBeenCalled();
      }
    });
  }

  it("reconcile-wallet: no abre una conexión propia a la cadena (la hace deposit-sync)", async () => {
    await walletGet(request("/api/cron/reconcile-wallet", "GET", `Bearer ${SECRET}`));
    expect(mocks.getServerConnection).not.toHaveBeenCalled();
  });
});

/* --- 6. GET /api/health/deep: sólo con token y sin filtrar nada --- */

describe("prelaunch: GET /api/health/deep no se abre y no filtra URLs, claves ni el secreto", () => {
  // Fuga evitada: el deep enumera dependencias y, con un error crudo, publicaría
  // la URL del RPC con api-key y el JWT de Supabase.
  const SECRET_VALUES = {
    wrongToken: WRONG_TOKEN,
    cronSecret: SECRET,
    jupiterKey: "jup_test_KEY_0123456789",
    coingeckoKey: "CG_test_KEY_9876543210",
    serviceRole: "sr_test_KEY_abcdefghijkl",
    rpcUrl: "https://rpc.maverlang.test/?api-key=leak",
    databaseUrl: "postgres://user:pass@db.maverlang.test:5432/postgres",
    jwt: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.firma",
  };

  const ENV_NAMES = [
    "CRON_SECRET",
    "JUPITER_API_KEY",
    "COINGECKO_API_KEY",
    "SUPABASE_SECRET_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SOLANA_RPC_URL",
    "DATABASE_URL",
    "HELIUS",
  ];

  function expectNoLeak(text: string): void {
    expect(text).not.toMatch(/https?:\/\//i);
    expect(text).not.toMatch(/postgres(?:ql)?:\/\//i);
    expect(text).not.toMatch(/eyJ[A-Za-z0-9_-]{5,}/);
    for (const [label, value] of Object.entries(SECRET_VALUES)) {
      expect(text, `fuga de ${label}`).not.toContain(value);
    }
    for (const name of ENV_NAMES) expect(text, `fuga del nombre de env ${name}`).not.toContain(name);
  }

  it("sin token, con token incorrecto y sin CRON_SECRET → 401 sin filtrar", async () => {
    const cases: { authorization?: string; secret?: string; label: string }[] = [
      { label: "sin header" },
      { authorization: `Bearer ${WRONG_TOKEN}`, label: "token incorrecto" },
      { authorization: `Bearer ${SECRET}`, secret: "", label: "sin secreto configurado" },
      { authorization: `Bearer ${SECRET}`, secret: "   ", label: "secreto vacío" },
      { authorization: SECRET, label: "sin el esquema Bearer" },
      { authorization: `Bearer ${SECRET.slice(0, -1)}`, label: "secreto truncado" },
    ];
    for (const testCase of cases) {
      vi.stubEnv("CRON_SECRET", testCase.secret ?? SECRET);
      const response = await deepGet(request("/api/health/deep", "GET", testCase.authorization));
      expect(response.status, testCase.label).toBe(401);
      expect(response.headers.get("cache-control")).toBe("no-store");
      const payload = (await response.clone().json()) as { ok: boolean; error?: { code: string } };
      expect(payload.ok).toBe(false);
      expect(payload.error?.code).toBe("UNAUTHORIZED");
      expectNoLeak(await bodyText(response));
    }
  });

  it("con el token correcto → 200 en modo mock, sin red y sin URLs ni claves", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    // Env señuelo: si el reporte ecoara configuración, estos valores aparecerían.
    vi.stubEnv("JUPITER_API_KEY", SECRET_VALUES.jupiterKey);
    vi.stubEnv("COINGECKO_API_KEY", SECRET_VALUES.coingeckoKey);
    vi.stubEnv("SUPABASE_SECRET_KEY", SECRET_VALUES.serviceRole);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", SECRET_VALUES.serviceRole);
    vi.stubEnv("SOLANA_RPC_URL", SECRET_VALUES.rpcUrl);
    vi.stubEnv("DATABASE_URL", SECRET_VALUES.databaseUrl);
    vi.stubEnv("HELIUS_API_KEY", SECRET_VALUES.rpcUrl);
    // Si algún probe intentara salir, revienta acá en vez de pegarle a la red.
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      throw new Error("el deep en modo mock no debe salir a la red");
    });

    const response = await deepGet(request("/api/health/deep", "GET", `Bearer ${SECRET}`));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(fetchSpy).not.toHaveBeenCalled();

    const payload = (await response.json()) as {
      ok: boolean;
      dataMode: string;
      checks: Record<string, { ok: boolean; status: string; error?: string }>;
    };
    expect(payload.ok).toBe(true);
    expect(payload.dataMode).toBe("mock");
    const serialized = JSON.stringify(payload);
    expectNoLeak(serialized);
    // El reporte sólo trae estado agregado, nunca la configuración.
    expect(serialized).not.toMatch(/api[-_]?key|apikey|password|passwd|token/i);
    for (const name of Object.keys(payload.checks)) {
      expect(payload.checks[name]!.status).toBe("skipped");
    }
  });

  it("con el token correcto y los proveedores caídos → 503 sin URLs con claves", async () => {
    // Fuga evitada: el 503 es justo el caso en que viaja el `error` de cada
    // chequeo. El RPC real puede devolver el mensaje con la URL con api-key;
    // la respuesta no debe repetirla. Sin red: `fetch` falso y RPC mockeado.
    const MANAGED = [
      "DATA_MODE",
      "PRICES_MODE",
      "MARKET_STATUS_MODE",
      "AUTH_MODE",
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "SUPABASE_SECRET_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
    ] as const;
    const saved = new Map<string, string | undefined>();
    for (const key of MANAGED) saved.set(key, process.env[key]);
    process.env.DATA_MODE = "live";
    process.env.PRICES_MODE = "live";
    process.env.MARKET_STATUS_MODE = "live";
    process.env.AUTH_MODE = "supabase";
    // Sin credenciales: el probe de Supabase falla local, no sale a la red.
    for (const key of [
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "SUPABASE_SECRET_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
    ]) {
      delete process.env[key];
    }
    const rpcFailure = `getSlot falló en ${SECRET_VALUES.rpcUrl}`;
    mocks.getServerConnection.mockImplementation(() => {
      throw new Error(rpcFailure);
    });
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("upstream caído", { status: 500 }));
    vi.resetModules();
    try {
      const fresh = await import("@/app/api/health/deep/route");
      const response = await fresh.GET(request("/api/health/deep", "GET", `Bearer ${SECRET}`));
      // Jupiter (crítico) respondió 500 → 503, y el detalle sale redactado.
      expect(response.status).toBe(503);
      const payload = (await response.clone().json()) as {
        ok: boolean;
        checks: Record<string, { status: string; error?: string }>;
      };
      expect(payload.ok).toBe(false);
      expect(payload.checks.jupiter.status).toBe("failed");
      expect(payload.checks.rpc.status).toBe("failed");
      expect(payload.checks.rpc.error).toBe("El proveedor no respondió correctamente.");
      const text = await bodyText(response);
      expect(text).not.toContain(rpcFailure);
      expectNoLeak(text);
    } finally {
      for (const key of MANAGED) {
        const value = saved.get(key);
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      fetchSpy.mockRestore();
      vi.resetModules();
    }
  });
});
