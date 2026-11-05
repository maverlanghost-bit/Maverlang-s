import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/wallet/send/build/route";
import { TICKERS } from "@/config/tickers";
import { WITHDRAWAL_MAX_USD_PER_OPERATION } from "@/lib/wallet/withdrawals";

/**
 * T40 (auditoría de dinero) — hueco de evidencia en el retiro.
 *
 * El tope por operación ya estaba probado como función pura, pero ninguna
 * prueba ejecutaba la RUTA para comprobar que un monto sobre el tope (o sin
 * precio para valorarlo) no llega a `services.portfolio.sendBuild`. Es el
 * criterio "no se arma un envío si falla el tope por operación" en el código
 * que realmente se ejecuta.
 *
 * El candado real sigue en `true`; acá se abre SÓLO por mock para ejercitar
 * lo que vive detrás, igual que `wallet-t35-withdrawal-gate`.
 */

const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SITE = "https://maverlang.test";
const ORIGIN = "11111111111111111111111111111111";
const DESTINATION = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const STOCK = TICKERS.find((ticker) => ticker.enabled) ?? TICKERS[0];

const envState = vi.hoisted(() => {
  const keys = [
    "DATA_MODE",
    "AUTH_MODE",
    "NEXT_PUBLIC_AUTH_MODE",
    "NEXT_PUBLIC_DATA_MODE",
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "NEXT_PUBLIC_SITE_URL",
    "REAL_TRADING_READY",
  ];
  const values: Record<string, string> = {
    DATA_MODE: "live",
    AUTH_MODE: "supabase",
    NEXT_PUBLIC_AUTH_MODE: "supabase",
    NEXT_PUBLIC_DATA_MODE: "live",
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-test",
    NEXT_PUBLIC_SITE_URL: "https://maverlang.test",
    REAL_TRADING_READY: "true",
  };
  const saved = new Map<string, string | undefined>();
  for (const key of keys) {
    saved.set(key, process.env[key]);
    process.env[key] = values[key] as string;
  }
  return { saved };
});

const { portfolio, livePrices } = vi.hoisted(() => ({
  portfolio: { sendBuild: vi.fn(), balances: vi.fn() },
  livePrices: { list: vi.fn() },
}));

vi.mock("@/lib/services", () => ({
  getServices: () => ({
    auth: {
      getSession: async () => ({
        userId: "u-t40",
        walletAddress: "11111111111111111111111111111111",
      }),
    },
    portfolio,
  }),
}));

/** Sólo se abre el candado para poder ejercitar la validación de la ruta. */
vi.mock("@/lib/trade/real-guards", () => ({
  REAL_EXECUTION_LOCKED: false,
  assertRealExecutionLocked: () => undefined,
  assertRealWithdrawalsEnabled: async () => undefined,
}));

/** Sin red: el precio vivo de una acción se controla desde la prueba. */
vi.mock("@/lib/services/prices.live", () => ({ livePrices }));

afterAll(() => {
  for (const [key, value] of envState.saved) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

type SendOverrides = { mint?: string; amountUi?: number };

async function postSend(overrides: SendOverrides = {}) {
  const response = await POST(
    new Request(`${SITE}/api/wallet/send/build`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: SITE },
      body: JSON.stringify({
        to: DESTINATION,
        mint: USDC_MINT,
        amountUi: 10,
        userPublicKey: ORIGIN,
        ...overrides,
      }),
    }),
  );
  const payload = (await response.json()) as {
    ok?: boolean;
    error?: { code?: string; message?: string };
  };
  return { status: response.status, payload };
}

beforeEach(() => {
  portfolio.sendBuild.mockReset();
  portfolio.balances.mockReset();
  livePrices.list.mockReset();
  portfolio.sendBuild.mockResolvedValue({
    requestId: "send-t40",
    transactionBase64: "AAAA",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
  portfolio.balances.mockImplementation(async () => [
    { mint: USDC_MINT, symbol: "USDC", rawAmount: "1000000000", uiAmount: 1000, valueUsd: 1000 },
    { mint: STOCK.mint, symbol: STOCK.symbol, rawAmount: "1000000000", uiAmount: 10, valueUsd: 2500 },
  ]);
  livePrices.list.mockResolvedValue([{ priceUsd: 250 }]);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("T40: el tope por operación corta la salida antes de armar", () => {
  it("USDC sobre el tope por operación responde 422 y no llama a sendBuild", async () => {
    const overCap = WITHDRAWAL_MAX_USD_PER_OPERATION + 0.01;
    const result = await postSend({ amountUi: overCap });

    expect(result.status).toBe(422);
    expect(result.payload.error?.code).toBe("LIMIT_ORDER");
    expect(result.payload.error?.message).toMatch(/tope por salida/i);
    expect(portfolio.sendBuild).not.toHaveBeenCalled();
  });

  it("justo en el tope sí se arma (el control no bloquea lo legítimo)", async () => {
    const result = await postSend({ amountUi: WITHDRAWAL_MAX_USD_PER_OPERATION });

    expect(result.status).toBe(200);
    expect(portfolio.sendBuild).toHaveBeenCalledTimes(1);
  });

  it("una acción sin precio valorable falla cerrada y no arma la transacción", async () => {
    livePrices.list.mockRejectedValue(new Error("precio caído"));

    const result = await postSend({ mint: STOCK.mint, amountUi: 1 });

    expect(result.status).toBe(502);
    expect(result.payload.error?.code).toBe("UPSTREAM");
    expect(result.payload.error?.message).toMatch(/no pudimos valorar/i);
    expect(portfolio.sendBuild).not.toHaveBeenCalled();
  });

  it("una acción cuyo precio supera el tope tampoco se arma", async () => {
    // 3 acciones a US$250 = US$750 > tope de 500.
    livePrices.list.mockResolvedValue([{ priceUsd: 250 }]);
    const result = await postSend({ mint: STOCK.mint, amountUi: 3 });

    expect(result.status).toBe(422);
    expect(result.payload.error?.code).toBe("LIMIT_ORDER");
    expect(portfolio.sendBuild).not.toHaveBeenCalled();
  });
});

describe("T40: el tope vigente es el que aplica la ruta", () => {
  it("el tope es finito y positivo (no depende del entorno de la prueba)", () => {
    expect(Number.isFinite(WITHDRAWAL_MAX_USD_PER_OPERATION)).toBe(true);
    expect(WITHDRAWAL_MAX_USD_PER_OPERATION).toBeGreaterThan(0);
  });
});
