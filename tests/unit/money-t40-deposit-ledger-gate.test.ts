import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { __resetFlagsForTests, __setFlagReaderForTests } from "@/lib/flags";
import { USDC_DECIMALS, USDC_MINT_SOLANA } from "@/lib/wallet/deposit-indexer";
import {
  depositLifecycleFromStatus,
  isDepositLedgerEligible,
  syncSolanaUsdcDeposits,
  walletMovementStatusForLifecycle,
  type ParsedTxLike,
} from "@/lib/wallet/deposit-sync";

/**
 * T40 (auditoría de dinero) — hueco de evidencia en el depósito USDC.
 *
 * `isDepositLedgerEligible` ya estaba probada, pero NADIE probaba quién la
 * alimenta: `depositLifecycleFromStatus` (processed/sin estado → `detected`)
 * ni el barrido real (`syncSolanaUsdcDeposits` con sus dependencias de
 * producción), que es donde se decide qué entra a `crypto_deposits`. Un
 * cambio que mapeara `processed` a `confirmed` habría acreditado depósitos
 * revertibles sin que ninguna prueba fallara.
 *
 * Aquí se llama a las funciones de PRODUCCIÓN (sin deps inyectadas): el
 * barrido recorre sus propias dependencias y el RPC/Supabase están mockeados
 * a nivel de módulo. Sin red, sin base y sin `.env`.
 */

const state = vi.hoisted(() => ({
  wallet: "So11111111111111111111111111111111111111112",
  signatures: [] as string[],
  txs: [] as unknown[],
  statuses: [] as unknown[],
  cryptoDeposits: [] as Array<{
    userId: string;
    mint: string;
    amountUi: number;
    signature: string;
    fromAddress: string | null;
  }>,
  movements: [] as Array<{ reference: string; status: string; amountUi: number }>,
}));

vi.mock("@/lib/solana/connection", () => ({
  getServerConnection: () => ({
    getSignaturesForAddress: async () =>
      state.signatures.map((signature) => ({ signature })),
    getParsedTransactions: async () => state.txs,
    getSignatureStatuses: async () => ({ value: state.statuses }),
  }),
}));

vi.mock("@/lib/services/deposits.supabase", () => ({
  countDepositScanWallets: async () => 1,
  listWalletsForDepositScan: async () => [
    { userId: "user-t40", address: state.wallet },
  ],
  // Misma regla que la tabla: la firma es única por usuario.
  listDepositSignaturesForScan: async (userId: string) =>
    state.cryptoDeposits
      .filter((row) => row.userId === userId)
      .map((row) => row.signature),
  readVerifiedUserEmail: async () => ({ email: "pilot@maverlang.test", emailVerified: true }),
  insertCryptoDeposit: async (input: {
    userId: string;
    mint: string;
    amountUi: number;
    signature: string;
    fromAddress: string | null;
  }) => {
    if (state.cryptoDeposits.some((row) => row.signature === input.signature)) return false;
    state.cryptoDeposits.push(input);
    return true;
  },
  findCryptoDepositOwner: async (signature: string) => {
    const row = state.cryptoDeposits.find((item) => item.signature === signature);
    return { ok: true, userId: row?.userId ?? null };
  },
}));

vi.mock("@/lib/services/wallet-movements.supabase", () => ({
  upsertWalletMovement: async (input: {
    reference: string;
    status: string;
    amountUi: number;
  }) => {
    const exists = state.movements.some((row) => row.reference === input.reference);
    if (exists) return false;
    state.movements.push({
      reference: input.reference,
      status: input.status,
      amountUi: input.amountUi,
    });
    return true;
  },
}));

type Decimals = number | null;

function usdcBalance(accountIndex: number, uiAmount: number, decimals: Decimals = USDC_DECIMALS) {
  const places = typeof decimals === "number" ? decimals : USDC_DECIMALS;
  const tokenAmount: Record<string, unknown> = {
    uiAmount,
    amount: String(Math.round(uiAmount * 10 ** places)),
  };
  // `null` = el RPC no informó decimales (caso real de un balance incompleto).
  if (typeof decimals === "number") tokenAmount.decimals = decimals;
  return {
    accountIndex,
    mint: USDC_MINT_SOLANA,
    owner: state.wallet,
    uiTokenAmount: tokenAmount,
  };
}

function txWithDelta(
  signature: string,
  beforeUi: number,
  afterUi: number,
  decimals: Decimals = USDC_DECIMALS,
): ParsedTxLike {
  return {
    meta: {
      err: null,
      preTokenBalances: [usdcBalance(1, beforeUi, decimals)],
      postTokenBalances: [usdcBalance(1, afterUi, decimals)],
    },
    transaction: { signatures: [signature] },
    blockTime: 1_700_000_000,
  };
}

function status(confirmationStatus: "processed" | "confirmed" | "finalized" | null, err: unknown = null) {
  return { confirmationStatus, slot: 7, confirmations: 1, err };
}

/** Una sola transacción con estado on-chain controlado por la prueba. */
function queueScan(signature: string, confirmationStatus: "processed" | "confirmed" | "finalized" | null, afterUi = 35) {
  state.signatures = [signature];
  state.txs = [txWithDelta(signature, 10, afterUi)];
  state.statuses = [status(confirmationStatus)];
}

beforeEach(() => {
  vi.stubEnv("DATA_MODE", "live");
  vi.stubEnv("WALLET_DEPOSIT_SYNC", "on");
  vi.stubEnv("DEPOSIT_ALLOWLIST_EMAILS", "pilot@maverlang.test");
  __setFlagReaderForTests(async (key) => key === "deposits_enabled");
  state.signatures = [];
  state.txs = [];
  state.statuses = [];
  state.cryptoDeposits = [];
  state.movements = [];
});

afterEach(() => {
  vi.unstubAllEnvs();
  __resetFlagsForTests();
});

describe("T40: el barrido real sólo acredita confirmed/finalized", () => {
  it("un estado `processed` no entra a crypto_deposits y la actividad queda pending", async () => {
    queueScan("sig-processed", "processed");

    const summary = await syncSolanaUsdcDeposits();

    expect(summary.detected).toBe(1);
    expect(summary.confirmed).toBe(0);
    expect(summary.finalized).toBe(0);
    expect(state.cryptoDeposits).toEqual([]);
    expect(state.movements).toEqual([
      { reference: "sig-processed", status: "pending", amountUi: 25 },
    ]);
  });

  it("una firma sin estado de confirmación tampoco se acredita", async () => {
    queueScan("sig-sin-estado", null);

    const summary = await syncSolanaUsdcDeposits();

    expect(summary.detected).toBe(1);
    expect(state.cryptoDeposits).toEqual([]);
    expect(state.movements[0]?.status).toBe("pending");
  });

  it("una firma con error on-chain no se acredita", async () => {
    state.signatures = ["sig-error"];
    state.txs = [txWithDelta("sig-error", 10, 35)];
    state.statuses = [status("confirmed", { InstructionError: [0, "Custom"] })];

    await syncSolanaUsdcDeposits();

    expect(state.cryptoDeposits).toEqual([]);
  });

  it("`confirmed` sí se acredita, una sola vez y con el monto neto", async () => {
    queueScan("sig-confirmed", "confirmed");

    const summary = await syncSolanaUsdcDeposits();

    expect(summary.confirmed).toBe(1);
    expect(state.cryptoDeposits).toEqual([
      {
        userId: "user-t40",
        mint: USDC_MINT_SOLANA,
        amountUi: 25,
        signature: "sig-confirmed",
        fromAddress: null,
      },
    ]);
    expect(state.movements).toEqual([
      { reference: "sig-confirmed", status: "confirmed", amountUi: 25 },
    ]);

    // Segunda entrega de la MISMA firma: no se vuelve a acreditar.
    const again = await syncSolanaUsdcDeposits();
    expect(again.confirmed).toBe(0);
    expect(again.duplicates).toBeGreaterThanOrEqual(1);
    expect(state.cryptoDeposits).toHaveLength(1);
  });

  it("`finalized` se acredita y se cuenta aparte del confirmado", async () => {
    queueScan("sig-finalized", "finalized");

    const summary = await syncSolanaUsdcDeposits();

    expect(summary.finalized).toBe(1);
    expect(summary.confirmed).toBe(0);
    expect(state.cryptoDeposits.map((row) => row.signature)).toEqual(["sig-finalized"]);
    // `wallet_movements` no tiene `finalized`: se guarda como confirmed.
    expect(state.movements[0]?.status).toBe("confirmed");
  });

  it("un balance sin decimal o con decimal distinto de 6 no acredita por el barrido", async () => {
    state.signatures = ["sig-dec-9", "sig-sin-decimal"];
    state.txs = [
      txWithDelta("sig-dec-9", 10, 35, 9),
      txWithDelta("sig-sin-decimal", 10, 35, null),
    ];
    state.statuses = [status("confirmed"), status("confirmed")];

    const summary = await syncSolanaUsdcDeposits();

    expect(state.cryptoDeposits).toEqual([]);
    expect(summary.confirmed).toBe(0);
    expect(summary.detected).toBe(0);
  });

  it("sin el interruptor de staging el barrido no corre (defaults de fábrica)", async () => {
    vi.stubEnv("DATA_MODE", "live");
    vi.stubEnv("WALLET_DEPOSIT_SYNC", "");
    __setFlagReaderForTests(async () => false);
    queueScan("sig-no-deberia-barrer", "confirmed");

    const summary = await syncSolanaUsdcDeposits();

    expect(summary.mode).toBe("live");
    expect(summary.enabled).toBe(false);
    expect(summary.walletsTotal).toBe(0);
    expect(state.cryptoDeposits).toEqual([]);
  });
});

describe("T40: el ciclo de vida que alimenta la compuerta", () => {
  it("processed y sin estado son `detected`; confirmed y finalized son terminales", () => {
    expect(depositLifecycleFromStatus(status("processed"))).toBe("detected");
    expect(depositLifecycleFromStatus(null)).toBe("detected");
    expect(depositLifecycleFromStatus(undefined)).toBe("detected");
    expect(depositLifecycleFromStatus(status(null))).toBe("detected");
    expect(depositLifecycleFromStatus(status("confirmed"))).toBe("confirmed");
    expect(depositLifecycleFromStatus(status("finalized"))).toBe("finalized");
    // Con error on-chain el estado no habilita el libro.
    expect(
      depositLifecycleFromStatus(status("confirmed", { InstructionError: [0, "Custom"] })),
    ).toBe("detected");
  });

  it("sólo confirmed/finalized son elegibles para el libro", () => {
    expect(isDepositLedgerEligible("detected")).toBe(false);
    expect(isDepositLedgerEligible("confirmed")).toBe(true);
    expect(isDepositLedgerEligible("finalized")).toBe(true);
  });

  it("la actividad es pending sólo para `detected`", () => {
    expect(walletMovementStatusForLifecycle("detected")).toBe("pending");
    expect(walletMovementStatusForLifecycle("confirmed")).toBe("confirmed");
    expect(walletMovementStatusForLifecycle("finalized")).toBe("confirmed");
  });
});
