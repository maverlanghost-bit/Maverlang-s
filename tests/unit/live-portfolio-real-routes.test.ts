import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET as portfolioGet } from "@/app/api/portfolio/route";
import { GET as activityGet } from "@/app/api/wallet/activity/route";
import { GET as balancesGet } from "@/app/api/wallet/balances/route";

/**
 * T43 — cartera real en vivo: las tres rutas de lectura de la cuenta real.
 *
 * Fuga que cubre este archivo: con `mv_account=real` y `DATA_MODE=live`, la
 * cartera, los saldos y el feed se quedaban en el estado vacío fijo de la
 * migración M36 aunque la billetera estuviera vinculada, así que el usuario
 * real veía una cuenta sin plata ni movimientos.
 *
 * La contraprueba importa igual: con `DATA_MODE=mock` la cuenta real NO puede
 * llamar a `services.portfolio` (la demo tiene su propia rama y una cuenta
 * real nunca hereda datos demo). Por eso los dos bloques usan la MISMA sesión
 * con billetera: lo único que cambia entre "vacío" y "payload del servicio" es
 * el modo de datos.
 *
 * Handlers reales: sólo se mockean `getServices`, `serverEnv` (mutable por
 * test), el rate limit y la cartera demo. Nada de red, Supabase ni cadena.
 */

const mocks = vi.hoisted(() => {
  const wallet = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
  const userId = "u-real-t43";
  const walletAddress: string | null = wallet;
  return {
    wallet,
    userId,
    /** `serverEnv` se lee en cada request: mutarlo cambia la rama de la ruta. */
    serverEnv: {
      DATA_MODE: "mock" as "mock" | "live",
      REAL_TRADING_READY: false,
      CATALOG_SCOPE: "curated",
      US_PERSON_DECLARATION_VERSION: "2026-10",
      CRON_SECRET: undefined as string | undefined,
    },
    session: { userId, walletAddress },
    portfolio: { get: vi.fn(), balances: vi.fn(), activity: vi.fn() },
    demo: { getPortfolio: vi.fn(), getBalances: vi.fn(), getActivity: vi.fn() },
    withRateLimit: vi.fn(),
  };
});

vi.mock("@/lib/services", () => ({
  getServices: () => ({
    auth: { getSession: async () => mocks.session },
    portfolio: mocks.portfolio,
  }),
}));

vi.mock("@/lib/env", () => ({ serverEnv: mocks.serverEnv }));

/** Sin cupo compartido entre tests: el límite no es lo que se prueba acá. */
vi.mock("@/lib/security/rate-limit", () => ({ withRateLimit: mocks.withRateLimit }));

/** La rama demo no debe ejecutarse nunca con `mv_account=real`. */
vi.mock("@/lib/services/demo.supabase", () => ({ demoSupabase: mocks.demo }));

const SITE = "https://maverlang.test";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const UPDATED_AT = "2026-11-06T12:00:00.000Z";

/** Payload que devuelve `services.portfolio.get` en vivo (con PnL calculado). */
const PORTFOLIO_PAYLOAD = {
  address: mocks.wallet,
  totalUsd: 1234.56,
  cashUsdc: 100,
  positions: [
    {
      symbol: "AAPLx",
      shares: 2,
      multiplier: 1,
      avgCostUsd: 210.5,
      priceUsd: 250.25,
      valueUsd: 500.5,
      pnlUsd: 79.5,
      pnlPct: 37.77,
      allocationPct: 40.54,
    },
  ],
  pnlUsd: 79.5,
  pnlPct: 37.77,
  updatedAt: UPDATED_AT,
};

const BALANCES_PAYLOAD = [
  { mint: USDC_MINT, symbol: "USDC", rawAmount: "100000000", uiAmount: 100, valueUsd: 100 },
  {
    mint: "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp",
    symbol: "AAPLx",
    rawAmount: "2000000",
    uiAmount: 2,
    valueUsd: 500.5,
  },
];

const ACTIVITY_PAYLOAD = [
  {
    id: "dep-1",
    kind: "deposit",
    symbol: "USDC",
    amountUi: 50,
    valueUsd: 50,
    status: "confirmed",
    signature: "5sigDeposit",
    at: UPDATED_AT,
  },
  {
    id: "ord-1",
    kind: "buy",
    symbol: "AAPLx",
    amountUi: 2,
    valueUsd: 500.5,
    status: "confirmed",
    signature: "5sigBuy",
    at: "2026-11-06T11:00:00.000Z",
  },
];

type Handler = (req: Request) => Promise<Response>;

interface ApiPayload<T> {
  ok: boolean;
  data?: T;
  error?: { code?: string; message?: string };
}

/** Petición de la cuenta real: la cookie `mv_account=real` es la que manda. */
function realRequest(pathname: string): Request {
  return new Request(`${SITE}${pathname}`, {
    method: "GET",
    headers: { cookie: "mv_account=real" },
  });
}

async function callRoute<T>(
  handler: Handler,
  pathname: string,
): Promise<{ status: number; response: Response; payload: ApiPayload<T> }> {
  const response = await handler(realRequest(pathname));
  const payload = (await response.json()) as ApiPayload<T>;
  return { status: response.status, response, payload };
}

beforeEach(() => {
  mocks.portfolio.get.mockReset();
  mocks.portfolio.balances.mockReset();
  mocks.portfolio.activity.mockReset();
  mocks.demo.getPortfolio.mockReset();
  mocks.demo.getBalances.mockReset();
  mocks.demo.getActivity.mockReset();
  mocks.withRateLimit.mockReset();
  mocks.withRateLimit.mockResolvedValue(null);

  mocks.portfolio.get.mockResolvedValue(PORTFOLIO_PAYLOAD);
  mocks.portfolio.balances.mockResolvedValue(BALANCES_PAYLOAD);
  mocks.portfolio.activity.mockResolvedValue(ACTIVITY_PAYLOAD);

  // Por defecto, estado seguro: mock. Cada caso en vivo lo sube a "live".
  mocks.serverEnv.DATA_MODE = "mock";
  mocks.session.userId = mocks.userId;
  mocks.session.walletAddress = mocks.wallet;

  // `isSupabaseAuth()` lee `process.env` en cada request.
  vi.stubEnv("AUTH_MODE", "supabase");
  vi.stubEnv("NEXT_PUBLIC_AUTH_MODE", "supabase");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-test");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("T43: cuenta real con DATA_MODE=mock sigue en vacío y no toca la cartera", () => {
  it("GET /api/portfolio devuelve el vacío con la identidad del usuario", async () => {
    const { status, payload } = await callRoute<{
      address: string;
      totalUsd: number;
      cashUsdc: number;
      positions: unknown[];
      pnlUsd: number | null;
      pnlPct: number | null;
      updatedAt: string;
    }>(portfolioGet, "/api/portfolio");

    expect(status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data?.address).toBe(mocks.userId);
    expect(payload.data?.totalUsd).toBe(0);
    expect(payload.data?.cashUsdc).toBe(0);
    expect(payload.data?.positions).toEqual([]);
    expect(payload.data?.pnlUsd).toBeNull();
    expect(payload.data?.pnlPct).toBeNull();
    expect(typeof payload.data?.updatedAt).toBe("string");

    // Con billetera vinculada, igual no se consulta el servicio: manda el modo.
    expect(mocks.portfolio.get).not.toHaveBeenCalled();
    expect(mocks.demo.getPortfolio).not.toHaveBeenCalled();
  });

  it("GET /api/wallet/balances devuelve lista vacía sin consultar saldos", async () => {
    const { status, payload } = await callRoute<unknown[]>(balancesGet, "/api/wallet/balances");

    expect(status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data).toEqual([]);

    expect(mocks.portfolio.balances).not.toHaveBeenCalled();
    expect(mocks.demo.getBalances).not.toHaveBeenCalled();
  });

  it("GET /api/wallet/activity devuelve feed vacío sin consultar movimientos", async () => {
    const { status, payload } = await callRoute<unknown[]>(activityGet, "/api/wallet/activity");

    expect(status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data).toEqual([]);

    expect(mocks.portfolio.activity).not.toHaveBeenCalled();
    expect(mocks.demo.getActivity).not.toHaveBeenCalled();
  });
});

describe("T43: cuenta real con DATA_MODE=live devuelve el payload del servicio", () => {
  beforeEach(() => {
    mocks.serverEnv.DATA_MODE = "live";
  });

  it("GET /api/portfolio pide la cartera de la billetera y la devuelve validada", async () => {
    const { status, response, payload } = await callRoute<typeof PORTFOLIO_PAYLOAD>(
      portfolioGet,
      "/api/portfolio",
    );

    expect(status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data).toEqual(PORTFOLIO_PAYLOAD);
    expect(response.headers.get("cache-control")).toBe("private, no-store");

    // La dirección sale de la sesión, nunca del cliente; el `userId` habilita el PnL.
    expect(mocks.portfolio.get).toHaveBeenCalledTimes(1);
    expect(mocks.portfolio.get).toHaveBeenCalledWith(mocks.wallet, mocks.userId);
    expect(mocks.demo.getPortfolio).not.toHaveBeenCalled();
  });

  it("GET /api/wallet/balances devuelve los saldos reales de la billetera", async () => {
    const { status, response, payload } = await callRoute<unknown[]>(
      balancesGet,
      "/api/wallet/balances",
    );

    expect(status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data).toEqual(BALANCES_PAYLOAD);
    expect(response.headers.get("cache-control")).toBe("private, no-store");

    expect(mocks.portfolio.balances).toHaveBeenCalledTimes(1);
    expect(mocks.portfolio.balances).toHaveBeenCalledWith(mocks.wallet);
    expect(mocks.demo.getBalances).not.toHaveBeenCalled();
  });

  it("GET /api/wallet/activity devuelve el feed unificado de la cuenta", async () => {
    const { status, response, payload } = await callRoute<unknown[]>(
      activityGet,
      "/api/wallet/activity",
    );

    expect(status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.data).toEqual(ACTIVITY_PAYLOAD);
    expect(response.headers.get("cache-control")).toBe("private, no-store");

    expect(mocks.portfolio.activity).toHaveBeenCalledTimes(1);
    expect(mocks.portfolio.activity).toHaveBeenCalledWith({
      address: mocks.wallet,
      userId: mocks.userId,
    });
    expect(mocks.demo.getActivity).not.toHaveBeenCalled();
  });
});
