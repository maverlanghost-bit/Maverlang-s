import { afterEach, describe, expect, it, vi } from "vitest";

import { __resetFlagsForTests, __setFlagReaderForTests } from "@/lib/flags";
import {
  USDC_DECIMALS,
  USDC_MINT_SOLANA,
  createInMemoryDepositLedger,
  indexSolanaUsdcDeposits,
  type UsdcDepositCandidate,
} from "@/lib/wallet/deposit-indexer";
import {
  extractUsdcDepositsFromTransactions,
  syncSolanaUsdcDeposits,
  type ParsedTokenBalanceLike,
  type ParsedTxLike,
} from "@/lib/wallet/deposit-sync";
import {
  reconcileWalletMovements,
  type PendingWalletMovement,
  type ReconcileDeps,
} from "@/lib/wallet/reconcile-movements";

/**
 * T34 — huecos del depósito USDC, sin red, sin base y sin `.env`:
 * decimal exacto, reorganización que no toca el libro confirmado, dos
 * entregas de la misma firma y barrido apagado por flag.
 */

const WALLET = "So11111111111111111111111111111111111111112";

// Si algo intentara barrer de verdad, esto lo delata en vez de tocar la red.
vi.mock("@/lib/solana/connection", () => ({
  getServerConnection: () => {
    throw new Error("RPC prohibido en tests (T34)");
  },
}));
vi.mock("@/lib/services/deposits.supabase", () => ({
  countDepositScanWallets: async () => {
    throw new Error("Supabase prohibido en tests (T34)");
  },
  listWalletsForDepositScan: async () => {
    throw new Error("Supabase prohibido en tests (T34)");
  },
  listDepositSignaturesForScan: async () => {
    throw new Error("Supabase prohibido en tests (T34)");
  },
  insertCryptoDeposit: async () => {
    throw new Error("Supabase prohibido en tests (T34)");
  },
  findCryptoDepositOwner: async () => {
    throw new Error("Supabase prohibido en tests (T34)");
  },
}));

function candidate(overrides: Partial<UsdcDepositCandidate> = {}): UsdcDepositCandidate {
  return {
    signature: "sig-base",
    mint: USDC_MINT_SOLANA,
    decimals: USDC_DECIMALS,
    destination: WALLET,
    amountUi: 25,
    err: null,
    ...overrides,
  };
}

/** Balance USDC con el decimal que informe el RPC (o ausente, si es `undefined`). */
function balance(accountIndex: number, uiAmount: number, decimals?: number | null): ParsedTokenBalanceLike {
  const tokenAmount: ParsedTokenBalanceLike["uiTokenAmount"] = {
    uiAmount,
    amount: String(Math.round(uiAmount * 10 ** (typeof decimals === "number" ? decimals : USDC_DECIMALS))),
  };
  if (decimals !== undefined) tokenAmount.decimals = decimals;
  return { accountIndex, mint: USDC_MINT_SOLANA, owner: WALLET, uiTokenAmount: tokenAmount };
}

function parsedTx(signature: string, pre: ParsedTokenBalanceLike[], post: ParsedTokenBalanceLike[]): ParsedTxLike {
  return {
    meta: { err: null, preTokenBalances: pre, postTokenBalances: post },
    transaction: { signatures: [signature] },
    blockTime: 1_700_000_000,
  };
}

function depositMovement(reference: string, signature: string | null): PendingWalletMovement {
  return {
    reference,
    userId: "user-t34",
    kind: "deposit",
    mint: USDC_MINT_SOLANA,
    amountUi: 25,
    signature,
    createdAt: "2026-11-05T10:00:00.000Z",
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  __resetFlagsForTests();
});

describe("T34: el decimal de USDC tiene que ser exactamente 6", () => {
  it("un balance con 9 decimales no produce depósito (no se asume 6)", () => {
    const deposits = extractUsdcDepositsFromTransactions({
      walletAddress: WALLET,
      signatures: ["sig-dec-9"],
      transactions: [parsedTx("sig-dec-9", [balance(1, 10, 9)], [balance(1, 35, 9)])],
      statuses: [{ confirmationStatus: "confirmed", err: null }],
    });
    expect(deposits).toEqual([]);
  });

  it("un balance sin decimal informado tampoco produce depósito", () => {
    const deposits = extractUsdcDepositsFromTransactions({
      walletAddress: WALLET,
      signatures: ["sig-sin-decimal"],
      transactions: [parsedTx("sig-sin-decimal", [balance(1, 10, undefined)], [balance(1, 35, undefined)])],
      statuses: [{ confirmationStatus: "confirmed", err: null }],
    });
    expect(deposits).toEqual([]);
  });

  it("control: el mismo movimiento con 6 decimales sí se detecta", () => {
    const deposits = extractUsdcDepositsFromTransactions({
      walletAddress: WALLET,
      signatures: ["sig-dec-6"],
      transactions: [parsedTx("sig-dec-6", [balance(1, 10, 6)], [balance(1, 35, 6)])],
      statuses: [{ confirmationStatus: "confirmed", err: null }],
    });
    expect(deposits).toHaveLength(1);
    expect(deposits[0]).toMatchObject({ signature: "sig-dec-6", decimals: 6, amountUi: 25 });
  });

  it("un solo balance con decimal distinto descarta el lote de esa transacción", () => {
    // La cuenta 2 trae 6 y la 1 trae 9: el monto no es confiable, no se inventa.
    const deposits = extractUsdcDepositsFromTransactions({
      walletAddress: WALLET,
      signatures: ["sig-mixto"],
      transactions: [parsedTx("sig-mixto", [balance(1, 10, 9), balance(2, 0, 6)], [balance(1, 20, 9), balance(2, 5, 6)])],
      statuses: [{ confirmationStatus: "confirmed", err: null }],
    });
    expect(deposits).toEqual([]);
  });

  it("el indexador rechaza la candidata con decimal 9 y no la acredita", async () => {
    const result = await indexSolanaUsdcDeposits({
      userId: "user-t34",
      walletAddress: WALLET,
      candidates: [candidate({ signature: "sig-9", decimals: 9 }), candidate({ signature: "sig-ok", decimals: 6 })],
      deps: {
        listKnownSignatures: async () => [],
        insertDeposit: async () => true,
      },
    });
    expect(result.rejected).toEqual([{ signature: "sig-9", reason: "decimals_not_usdc" }]);
    expect(result.indexed.map((deposit) => deposit.signature)).toEqual(["sig-ok"]);
  });

  it("el indexador rechaza la candidata sin decimal (undefined)", async () => {
    const result = await indexSolanaUsdcDeposits({
      userId: "user-t34",
      walletAddress: WALLET,
      candidates: [candidate({ signature: "sig-nulo", decimals: undefined as unknown as number })],
      deps: {
        listKnownSignatures: async () => [],
        insertDeposit: async () => true,
      },
    });
    expect(result.indexed).toEqual([]);
    expect(result.rejected).toEqual([{ signature: "sig-nulo", reason: "decimals_not_usdc" }]);
  });
});

describe("T34: dos entregas de la misma firma dejan un solo crédito", () => {
  it("dos corridas simultáneas que no ven la firma registrada no duplican", async () => {
    const ledger = createInMemoryDepositLedger();
    const candidates = [candidate({ signature: "sig-doble", amountUi: 25 })];

    const [first, second] = await Promise.all([
      indexSolanaUsdcDeposits({ userId: "user-t34", walletAddress: WALLET, candidates, deps: ledger.deps }),
      indexSolanaUsdcDeposits({ userId: "user-t34", walletAddress: WALLET, candidates, deps: ledger.deps }),
    ]);

    expect(ledger.rows()).toHaveLength(1);
    expect(ledger.rows()[0]).toMatchObject({ signature: "sig-doble", amountUi: 25 });
    expect(first.indexed.length + second.indexed.length).toBe(1);
    expect(first.duplicates.length + second.duplicates.length).toBe(1);
  });

  it("una reentrega posterior (misma firma) no vuelve a acreditar", async () => {
    const ledger = createInMemoryDepositLedger();
    const candidates = [candidate({ signature: "sig-reentrega", amountUi: 40 })];

    const first = await indexSolanaUsdcDeposits({ userId: "user-t34", walletAddress: WALLET, candidates, deps: ledger.deps });
    const second = await indexSolanaUsdcDeposits({ userId: "user-t34", walletAddress: WALLET, candidates, deps: ledger.deps });

    expect(first.indexed).toHaveLength(1);
    expect(second.indexed).toHaveLength(0);
    expect(second.duplicates).toEqual(["sig-reentrega"]);
    expect(ledger.rows()).toHaveLength(1);
    expect(ledger.rows()[0]?.amountUi).toBe(40);
  });
});

describe("T34: una firma desaparecida revierte el movimiento, no el libro", () => {
  it("pending con firma que el RPC ya no conoce pasa a failed", async () => {
    const updates: Array<{ reference: string; status: string }> = [];
    const deps: ReconcileDeps = {
      listPendingMovements: async () => [depositMovement("mv-vanish", "sig-vanish")],
      getSignatureStatuses: async (signatures) => signatures.map(() => null),
      updateMovementStatus: async (reference, status) => {
        updates.push({ reference, status });
        return true;
      },
    };

    const summary = await reconcileWalletMovements(deps);

    expect(summary).toMatchObject({ reviewed: 1, failed: 1, disappeared: 1, confirmed: 0, pending: 0 });
    expect(updates).toEqual([{ reference: "mv-vanish", status: "failed" }]);
  });

  it("la reorganización no borra ni revierte una fila ya confirmada de crypto_deposits", async () => {
    const ledger = createInMemoryDepositLedger();
    await indexSolanaUsdcDeposits({
      userId: "user-t34",
      walletAddress: WALLET,
      candidates: [candidate({ signature: "sig-confirmada", amountUi: 25 })],
      deps: ledger.deps,
    });
    expect(ledger.rows()).toHaveLength(1);

    const updates: string[] = [];
    const deps: ReconcileDeps = {
      listPendingMovements: async () => [
        depositMovement("sig-confirmada", "sig-confirmada"),
        depositMovement("mv-otra", "sig-vanish"),
      ],
      getSignatureStatuses: async (signatures) => signatures.map(() => null),
      updateMovementStatus: async (reference, status) => {
        updates.push(`${reference}:${status}`);
        return true;
      },
    };

    const summary = await reconcileWalletMovements(deps);

    expect(summary).toMatchObject({ reviewed: 2, failed: 2, disappeared: 2, pending: 0 });
    // Sólo se escribió `wallet_movements`, y sólo hacia `failed`.
    expect(updates).toEqual(["sig-confirmada:failed", "mv-otra:failed"]);
    // El libro durable sigue intacto: el depósito confirmado no se toca.
    expect(ledger.rows()).toHaveLength(1);
    expect(ledger.rows()[0]).toMatchObject({ signature: "sig-confirmada", amountUi: 25, userId: "user-t34" });
  });

  it("un `processed` sigue pendiente: no se confunde con firma desaparecida", async () => {
    const updates: string[] = [];
    const deps: ReconcileDeps = {
      listPendingMovements: async () => [depositMovement("mv-processed", "sig-processed")],
      getSignatureStatuses: async () => [{ confirmationStatus: "processed", err: null }],
      updateMovementStatus: async (reference, status) => {
        updates.push(`${reference}:${status}`);
        return true;
      },
    };

    const summary = await reconcileWalletMovements(deps);

    expect(summary).toMatchObject({ reviewed: 1, failed: 0, disappeared: 0, confirmed: 0, pending: 1 });
    expect(updates).toEqual([]);
  });

  it("un movimiento sin firma (on-ramp) no se marca failed", async () => {
    const updates: string[] = [];
    const deps: ReconcileDeps = {
      listPendingMovements: async () => [depositMovement("mv-onramp", null)],
      getSignatureStatuses: async () => [],
      updateMovementStatus: async (reference, status) => {
        updates.push(`${reference}:${status}`);
        return true;
      },
    };

    const summary = await reconcileWalletMovements(deps);

    expect(summary).toMatchObject({ reviewed: 1, failed: 0, disappeared: 0, skipped: 1 });
    expect(updates).toEqual([]);
  });
});

describe("T34: el barrido de depósitos sigue apagado", () => {
  it("sin variables, el barrido está apagado", async () => {
    vi.stubEnv("DATA_MODE", "mock");
    const summary = await syncSolanaUsdcDeposits();
    expect(summary).toMatchObject({ mode: "mock", enabled: false, walletsTotal: 0, signaturesChecked: 0 });
  });

  it("en live con WALLET_DEPOSIT_SYNC pero sin el flag deposits_enabled no barre", async () => {
    vi.stubEnv("DATA_MODE", "live");
    vi.stubEnv("WALLET_DEPOSIT_SYNC", "on");
    __setFlagReaderForTests(async () => false);

    const summary = await syncSolanaUsdcDeposits();

    expect(summary).toMatchObject({ mode: "live", enabled: false, ok: true, walletsTotal: 0, signaturesChecked: 0 });
  });

  it("si el flag explota, no barre (fail closed)", async () => {
    vi.stubEnv("DATA_MODE", "live");
    vi.stubEnv("WALLET_DEPOSIT_SYNC", "on");
    __setFlagReaderForTests(async () => {
      throw new Error("flags no disponibles");
    });

    const summary = await syncSolanaUsdcDeposits();

    expect(summary).toMatchObject({ mode: "live", enabled: false, walletsTotal: 0 });
  });

  it("con el flag encendido pero sin WALLET_DEPOSIT_SYNC tampoco barre", async () => {
    vi.stubEnv("DATA_MODE", "live");
    vi.stubEnv("WALLET_DEPOSIT_SYNC", "");
    __setFlagReaderForTests(async () => true);

    const summary = await syncSolanaUsdcDeposits();

    expect(summary).toMatchObject({ mode: "live", enabled: false, walletsTotal: 0, signaturesChecked: 0 });
  });
});
