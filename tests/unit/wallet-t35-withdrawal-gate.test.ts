import { readFileSync } from "node:fs";
import path from "node:path";

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/wallet/send/build/route";
import { USDC_MINT } from "@/config/tickers";
import type { SignatureStatusLike } from "@/lib/solana/signature-status";
import { reconcileWalletMovements, type PendingWalletMovement } from "@/lib/wallet/reconcile-movements";
import { validateAndPrepareWithdrawal } from "@/lib/wallet/withdrawals";

/**
 * T35: la salida de dinero pasa por `validateAndPrepareWithdrawal` antes de
 * armar nada, y un resultado on-chain desconocido de un retiro NO se marca
 * como pagado.
 *
 * Un solo grafo de módulos: el entorno se fija en `vi.hoisted` (antes de
 * cualquier import) y los guardias de dinero real se abren SÓLO por mock para
 * ejercitar la validación que vive detrás de ellos. El candado real sigue en
 * `true` — este archivo lo comprueba con `vi.importActual` — y su 503 con la
 * ruta sin mocks lo cubren `money-d01-d05-d06` y `real-disabled`.
 */

const ROOT = path.resolve(__dirname, "..", "..");
const SITE = "https://maverlang.test";
/** Billetera verificada de la sesión (base58 válida de 32 bytes). */
const ORIGIN = "11111111111111111111111111111111";
const DESTINATION = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

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

const { portfolio } = vi.hoisted(() => ({
  portfolio: { sendBuild: vi.fn(), balances: vi.fn() },
}));

/** Servicios con sesión verificada: no hay Supabase ni RPC reales. */
vi.mock("@/lib/services", () => ({
  getServices: () => ({
    auth: {
      getSession: async () => ({
        userId: "u-t35",
        walletAddress: "11111111111111111111111111111111",
      }),
    },
    portfolio,
  }),
}));

/** Guardias de dinero real abiertos sólo para ejercitar la validación. */
vi.mock("@/lib/trade/real-guards", () => ({
  REAL_EXECUTION_LOCKED: false,
  assertRealExecutionLocked: () => undefined,
  assertRealWithdrawalsEnabled: async () => undefined,
}));

afterAll(() => {
  for (const [key, value] of envState.saved) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

type SendOverrides = { to?: string; amountUi?: number; userPublicKey?: string };

type SendResult = {
  status: number;
  payload: { ok?: boolean; error?: { code?: string; message?: string } };
};

async function postSend(overrides: SendOverrides = {}): Promise<SendResult> {
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
  const payload = (await response.json()) as SendResult["payload"];
  return { status: response.status, payload };
}

beforeEach(() => {
  portfolio.sendBuild.mockReset();
  portfolio.balances.mockReset();
  portfolio.sendBuild.mockResolvedValue({
    requestId: "send-t35",
    transactionBase64: "AAAA",
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
  portfolio.balances.mockResolvedValue([
    { mint: USDC_MINT, symbol: "USDC", rawAmount: "100000000", uiAmount: 100, valueUsd: 100 },
  ]);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ---------------------------------------------------------------------------
// 1. El candado y el kill switch siguen cerrados por defecto
// ---------------------------------------------------------------------------

describe("T35: la salida sigue apagada por defecto", () => {
  it("el candado real sigue en true y corta con REAL_DISABLED antes de armar", async () => {
    const actual = await vi.importActual<typeof import("@/lib/trade/real-guards")>(
      "@/lib/trade/real-guards",
    );
    expect(actual.REAL_EXECUTION_LOCKED).toBe(true);

    let code: string | null = null;
    try {
      actual.assertRealExecutionLocked();
    } catch (error) {
      code = (error as { code?: string }).code ?? null;
    }
    expect(code).toBe("REAL_DISABLED");
  });

  it("withdrawals_enabled por defecto es false y apaga la salida con REAL_DISABLED", async () => {
    const { safeFlagDefault, __resetFlagsForTests } = await import("@/lib/flags");
    const { __resetKillSwitchesForTests, assertWithdrawalsEnabled } = await import("@/lib/trade/limits");
    // `realWithdrawalGuardDeps` es el lector real de flags (aquí está mockeado
    // sólo el módulo de guardias), así que se toma el original.
    const actual = await vi.importActual<typeof import("@/lib/trade/real-guards")>(
      "@/lib/trade/real-guards",
    );

    expect(safeFlagDefault("withdrawals_enabled")).toBe(false);

    __resetFlagsForTests();
    __resetKillSwitchesForTests();
    try {
      // Sin lector de flags (default seguro del panel): la salida está apagada.
      await expect(assertWithdrawalsEnabled(actual.realWithdrawalGuardDeps())).rejects.toMatchObject({
        code: "REAL_DISABLED",
      });
    } finally {
      __resetFlagsForTests();
      __resetKillSwitchesForTests();
    }
  });

  it("la ruta usa un solo nombre de kill switch y lo consulta antes de validar y de armar", () => {
    const source = readFileSync(path.join(ROOT, "app/api/wallet/send/build/route.ts"), "utf8");

    expect(source).toContain("assertRealWithdrawalsEnabled(");
    expect(source).not.toContain("offramp_enabled");
    expect(source).not.toContain("deposits_enabled");
    // Candado → kill switch → validación → tope → armar.
    expect(source.indexOf("assertRealExecutionLocked(")).toBeLessThan(
      source.indexOf("assertRealWithdrawalsEnabled("),
    );
    expect(source.indexOf("assertRealWithdrawalsEnabled(")).toBeLessThan(
      source.indexOf("validateAndPrepareWithdrawal("),
    );
    expect(source.indexOf("validateAndPrepareWithdrawal(")).toBeLessThan(
      source.indexOf("services.portfolio.sendBuild("),
    );
  });
});

// ---------------------------------------------------------------------------
// 2. La validación rechaza antes de armar y sin llamar al servicio
// ---------------------------------------------------------------------------

describe("T35: validateAndPrepareWithdrawal como compuerta de la ruta", () => {
  it("un retiro hacia la propia billetera se rechaza y no llama a sendBuild", async () => {
    const result = await postSend({ to: ORIGIN });

    expect(result.status).toBe(400);
    expect(result.payload.error?.code).toBe("VALIDATION");
    expect(result.payload.error?.message).toBe("No puedes enviarte a ti mismo.");
    expect(portfolio.sendBuild).not.toHaveBeenCalled();
  });

  it("un monto sobre el saldo disponible se rechaza y no llama a sendBuild", async () => {
    const result = await postSend({ amountUi: 150 });

    expect(result.status).toBe(422);
    expect(result.payload.error?.code).toBe("INSUFFICIENT_FUNDS");
    expect(result.payload.error?.message).toBe("No tienes saldo suficiente.");
    expect(portfolio.sendBuild).not.toHaveBeenCalled();
  });

  it("un saldo no finito (lectura caída) se rechaza en vez de asumir 'sin tope'", async () => {
    portfolio.balances.mockRejectedValueOnce(new Error("rpc caído"));

    const result = await postSend();

    expect(result.status).toBe(400);
    expect(result.payload.error?.code).toBe("VALIDATION");
    expect(result.payload.error?.message).toBe("No pudimos leer tu saldo disponible.");
    expect(portfolio.sendBuild).not.toHaveBeenCalled();
  });

  it("un saldo devuelto como NaN también se rechaza", async () => {
    portfolio.balances.mockResolvedValueOnce([
      { mint: USDC_MINT, symbol: "USDC", rawAmount: "0", uiAmount: Number.NaN, valueUsd: 0 },
    ]);

    const result = await postSend();

    expect(result.status).toBe(400);
    expect(result.payload.error?.message).toBe("No pudimos leer tu saldo disponible.");
    expect(portfolio.sendBuild).not.toHaveBeenCalled();
  });

  it("sin fila de saldo para el mint el disponible es 0 (no hay saldo)", async () => {
    portfolio.balances.mockResolvedValueOnce([]);

    const result = await postSend();

    expect(result.status).toBe(422);
    expect(result.payload.error?.code).toBe("INSUFFICIENT_FUNDS");
    expect(portfolio.sendBuild).not.toHaveBeenCalled();
  });

  it("un retiro válido sí llega a sendBuild (la validación no bloquea lo legítimo)", async () => {
    const result = await postSend();

    expect(result.status).toBe(200);
    expect(portfolio.sendBuild).toHaveBeenCalledTimes(1);
    expect(portfolio.balances).toHaveBeenCalledWith(ORIGIN);
  });

  it("la billetera de origen tiene que ser la verificada de la sesión", async () => {
    const result = await postSend({ userPublicKey: DESTINATION });

    expect(result.status).toBe(400);
    expect(result.payload.error?.code).toBe("VALIDATION");
    expect(portfolio.sendBuild).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 3. Referencia única por retiro
// ---------------------------------------------------------------------------

describe("T35: referencia única del retiro", () => {
  it("dos retiros idénticos no comparten referencia", () => {
    const params = {
      destinationAddress: DESTINATION,
      sourceAddress: ORIGIN,
      mint: USDC_MINT,
      amountUi: 12.5,
      availableBalanceUi: 100,
      realTradingEnabled: true,
    };

    const first = validateAndPrepareWithdrawal(params);
    const second = validateAndPrepareWithdrawal(params);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.preparation.reference).not.toBe(second.preparation.reference);
    expect(first.preparation.reference.startsWith(`withdraw:${USDC_MINT}:12.5:`)).toBe(true);
    expect(first.preparation.reference.length).toBeGreaterThan(`withdraw:${USDC_MINT}:12.5:`.length);
  });
});

// ---------------------------------------------------------------------------
// 4. Conciliación de un RETIRO: lo desconocido sigue pendiente
// ---------------------------------------------------------------------------

function withdrawMovement(overrides: Partial<PendingWalletMovement> = {}): PendingWalletMovement {
  return {
    reference: `withdraw:${USDC_MINT}:25:uuid-1`,
    userId: "u-t35",
    kind: "withdraw",
    mint: USDC_MINT,
    amountUi: 25,
    signature: "sig-withdraw-1",
    createdAt: "2026-11-03T14:00:00.000Z",
    ...overrides,
  };
}

function reconcileHarness(movement: PendingWalletMovement, statuses: Array<SignatureStatusLike | null>) {
  const updateMovementStatus = vi.fn(async () => true);
  const summary = reconcileWalletMovements({
    listPendingMovements: async () => [movement],
    getSignatureStatuses: async () => statuses,
    updateMovementStatus,
  });
  return { summary, updateMovementStatus };
}

describe("T35: un retiro sin resultado conocido sigue pending", () => {
  it("processed no se marca confirmado ni pagado", async () => {
    const { summary, updateMovementStatus } = reconcileHarness(withdrawMovement(), [
      { confirmationStatus: "processed", slot: 10, confirmations: 1, err: null },
    ]);

    const result = await summary;
    expect(updateMovementStatus).not.toHaveBeenCalled();
    expect(result.pending).toBe(1);
    expect(result.confirmed).toBe(0);
    expect(result.failed).toBe(0);
  });

  it("sin estado de confirmación tampoco se marca confirmado", async () => {
    const { summary, updateMovementStatus } = reconcileHarness(withdrawMovement(), [
      { confirmationStatus: null, slot: 11, confirmations: null, err: null },
    ]);

    const result = await summary;
    expect(updateMovementStatus).not.toHaveBeenCalled();
    expect(result.pending).toBe(1);
    expect(result.confirmed).toBe(0);
  });

  it("una firma con error on-chain sí pasa a failed", async () => {
    const { summary, updateMovementStatus } = reconcileHarness(withdrawMovement(), [
      { confirmationStatus: "confirmed", slot: 12, confirmations: 1, err: { InstructionError: [0, "Custom"] } },
    ]);

    const result = await summary;
    expect(updateMovementStatus).toHaveBeenCalledWith(`withdraw:${USDC_MINT}:25:uuid-1`, "failed");
    expect(result.failed).toBe(1);
    expect(result.confirmed).toBe(0);
  });

  it("confirmed sí se confirma (no se rompió el caso bueno)", async () => {
    const { summary, updateMovementStatus } = reconcileHarness(withdrawMovement(), [
      { confirmationStatus: "finalized", slot: 13, confirmations: 1, err: null },
    ]);

    const result = await summary;
    expect(updateMovementStatus).toHaveBeenCalledWith(`withdraw:${USDC_MINT}:25:uuid-1`, "confirmed");
    expect(result.confirmed).toBe(1);
  });

  it("la conciliación no borra ni revierte el libro crypto_deposits", () => {
    const source = readFileSync(path.join(ROOT, "lib/wallet/reconcile-movements.ts"), "utf8");
    // Supabase borra con `.delete()` sin argumentos; el `Map.delete(clave)` del
    // registro mock no cuenta. Tampoco toca la tabla del libro durable.
    expect(source).not.toMatch(/\.delete\(\s*\)/);
    expect(source).not.toMatch(/from\("crypto_deposits"\)/);
  });
});
