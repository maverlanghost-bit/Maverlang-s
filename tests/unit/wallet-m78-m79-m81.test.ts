import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET, POST } from "@/app/api/cron/reconcile-wallet/route";
import { TICKERS, USDC_MINT } from "@/config/tickers";
import {
  USDC_MINT_SOLANA,
  indexSolanaUsdcDeposits,
  resetDepositIndexerMockStoreForTests,
  usdcRawToUi,
} from "@/lib/wallet/deposit-indexer";
import {
  mergeUnifiedWalletActivity,
  reconcileWalletMovements,
  type PendingWalletMovement,
} from "@/lib/wallet/reconcile-movements";
import {
  SELF_TRANSFER_NOT_ALLOWED,
  isWithdrawableMint,
  validateAndPrepareWithdrawal,
} from "@/lib/wallet/withdrawals";

const VALID_WALLET_A = "11111111111111111111111111111111";
const VALID_WALLET_B = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

describe("M78: indexSolanaUsdcDeposits", () => {
  beforeEach(() => {
    resetDepositIndexerMockStoreForTests();
  });

  it("convierte monto crudo de USDC (6 decimales) a UI correctamente", () => {
    expect(usdcRawToUi(25_500_000)).toBe(25.5);
  });

  it("indexa depósito USDC válido y rechaza mints distintos a USDC", async () => {
    const nvdaMint = TICKERS.find((t) => t.symbol === "NVDAx")?.mint ?? "other-mint";
    const result = await indexSolanaUsdcDeposits({
      userId: "user-1",
      walletAddress: VALID_WALLET_A,
      candidates: [
        {
          signature: "sig-usdc-1",
          mint: USDC_MINT_SOLANA,
          destination: VALID_WALLET_A,
          amountUi: 150,
          err: null,
          from: VALID_WALLET_B,
        },
        {
          signature: "sig-not-usdc",
          mint: nvdaMint,
          destination: VALID_WALLET_A,
          amountUi: 10,
          err: null,
        },
      ],
    });

    expect(result.indexed).toHaveLength(1);
    expect(result.indexed[0]).toMatchObject({
      userId: "user-1",
      mint: USDC_MINT_SOLANA,
      amountUi: 150,
      signature: "sig-usdc-1",
      fromAddress: VALID_WALLET_B,
    });
    expect(result.rejected).toEqual([{ signature: "sig-not-usdc", reason: "mint_not_usdc" }]);
  });

  it("garantiza idempotencia por tx_signature duplicada en el mismo lote o corridas sucesivas", async () => {
    const candidate = {
      signature: "sig-dup-1",
      mint: USDC_MINT_SOLANA,
      destination: VALID_WALLET_A,
      amountUi: 50,
      err: null,
    };
    const first = await indexSolanaUsdcDeposits({
      userId: "user-1",
      walletAddress: VALID_WALLET_A,
      candidates: [candidate, candidate],
    });
    expect(first.indexed).toHaveLength(1);
    expect(first.duplicates).toEqual(["sig-dup-1"]);

    const second = await indexSolanaUsdcDeposits({
      userId: "user-1",
      walletAddress: VALID_WALLET_A,
      candidates: [candidate],
    });
    expect(second.indexed).toHaveLength(0);
    expect(second.duplicates).toEqual(["sig-dup-1"]);
  });

  it("rechaza transacciones con error on-chain, destino ajeno o monto no positivo", async () => {
    const result = await indexSolanaUsdcDeposits({
      userId: "user-1",
      walletAddress: VALID_WALLET_A,
      candidates: [
        {
          signature: "sig-err",
          mint: USDC_MINT_SOLANA,
          destination: VALID_WALLET_A,
          amountUi: 25,
          err: { InstructionError: [0, "Custom"] },
        },
        {
          signature: "sig-wrong-dest",
          mint: USDC_MINT_SOLANA,
          destination: VALID_WALLET_B,
          amountUi: 25,
          err: null,
        },
        {
          signature: "sig-zero",
          mint: USDC_MINT_SOLANA,
          destination: VALID_WALLET_A,
          amountUi: 0,
          err: null,
        },
      ],
    });
    expect(result.indexed).toHaveLength(0);
    expect(result.rejected).toEqual([
      { signature: "sig-err", reason: "tx_error_onchain" },
      { signature: "sig-wrong-dest", reason: "destination_mismatch" },
      { signature: "sig-zero", reason: "amount_not_positive" },
    ]);
  });
});

describe("M79: validateAndPrepareWithdrawal", () => {
  it("bloquea con 503 REAL_DISABLED cuando realTradingEnabled es false", () => {
    const res = validateAndPrepareWithdrawal({
      destinationAddress: VALID_WALLET_B,
      sourceAddress: VALID_WALLET_A,
      mint: USDC_MINT,
      amountUi: 10,
      availableBalanceUi: 100,
      realTradingEnabled: false,
    });
    expect(res).toMatchObject({ ok: false, code: "REAL_DISABLED", status: 503 });
  });

  it("rechaza dirección de destino inválida en Solana", () => {
    const res = validateAndPrepareWithdrawal({
      destinationAddress: "not-a-solana-address",
      sourceAddress: VALID_WALLET_A,
      mint: USDC_MINT,
      amountUi: 10,
      availableBalanceUi: 100,
      realTradingEnabled: true,
    });
    expect(res).toMatchObject({ ok: false, code: "VALIDATION", status: 400 });
  });

  it("rechaza auto-envío (misma dirección de origen y destino) con SELF_TRANSFER_NOT_ALLOWED", () => {
    const res = validateAndPrepareWithdrawal({
      destinationAddress: VALID_WALLET_A,
      sourceAddress: VALID_WALLET_A,
      mint: USDC_MINT,
      amountUi: 10,
      availableBalanceUi: 100,
      realTradingEnabled: true,
    });
    expect(res).toMatchObject({ ok: false, code: SELF_TRANSFER_NOT_ALLOWED, status: 400 });
  });

  it("rechaza activo fuera del catálogo permitido con ASSET_NOT_ALLOWED", () => {
    expect(isWithdrawableMint("So11111111111111111111111111111111111111112")).toBe(false);
    const res = validateAndPrepareWithdrawal({
      destinationAddress: VALID_WALLET_B,
      sourceAddress: VALID_WALLET_A,
      mint: "So11111111111111111111111111111111111111112",
      amountUi: 10,
      availableBalanceUi: 100,
      realTradingEnabled: true,
    });
    expect(res).toMatchObject({ ok: false, code: "ASSET_NOT_ALLOWED", status: 400 });
  });

  it("rechaza retiro cuando el monto supera el saldo disponible con INSUFFICIENT_FUNDS", () => {
    const res = validateAndPrepareWithdrawal({
      destinationAddress: VALID_WALLET_B,
      sourceAddress: VALID_WALLET_A,
      mint: USDC_MINT,
      amountUi: 150,
      availableBalanceUi: 100,
      realTradingEnabled: true,
    });
    expect(res).toMatchObject({ ok: false, code: "INSUFFICIENT_FUNDS", status: 400 });
  });

  it("prepara retiro válido de USDC o activo xStocks cuando realTradingEnabled es true", () => {
    const res = validateAndPrepareWithdrawal({
      destinationAddress: VALID_WALLET_B,
      sourceAddress: VALID_WALLET_A,
      mint: USDC_MINT,
      amountUi: 45,
      availableBalanceUi: 100,
      realTradingEnabled: true,
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.preparation.destinationAddress).toBe(VALID_WALLET_B);
      expect(res.preparation.amountUi).toBe(45);
      expect(res.preparation.networkFeeSol).toBeGreaterThan(0);
    }
  });
});

describe("M81: reconcileWalletMovements, mergeUnifiedWalletActivity y cron /api/cron/reconcile-wallet", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("deduplica movimientos por reference/signature y ordena por fecha descendente", () => {
    const unified = mergeUnifiedWalletActivity([
      {
        kind: "deposit",
        mint: USDC_MINT,
        amountUi: 100,
        reference: "sig-1",
        status: "pending",
        signature: "sig-1",
        createdAt: "2026-10-17T10:00:00.000Z",
      },
      {
        kind: "deposit",
        mint: USDC_MINT,
        amountUi: 100,
        reference: "sig-1",
        status: "confirmed",
        signature: "sig-1",
        createdAt: "2026-10-17T10:01:00.000Z",
      },
      {
        kind: "withdraw",
        mint: USDC_MINT,
        amountUi: 25,
        reference: "sig-2",
        status: "confirmed",
        signature: "sig-2",
        createdAt: "2026-10-17T12:00:00.000Z",
      },
    ]);

    expect(unified).toHaveLength(2);
    expect(unified[0]?.reference).toBe("sig-2");
    expect(unified[1]?.reference).toBe("sig-1");
    expect(unified[1]?.status).toBe("confirmed");
  });

  it("concilia movimientos pendientes (confirmed, failed y onramp sin firma)", async () => {
    const pendingItems: PendingWalletMovement[] = [
      {
        reference: "dep-ok",
        userId: "u-1",
        kind: "deposit",
        mint: USDC_MINT,
        amountUi: 80,
        signature: "sig-dep-ok",
        createdAt: "2026-10-17T11:00:00.000Z",
      },
      {
        reference: "wit-fail",
        userId: "u-1",
        kind: "withdraw",
        mint: USDC_MINT,
        amountUi: 20,
        signature: "sig-wit-fail",
        createdAt: "2026-10-17T11:05:00.000Z",
      },
      {
        reference: "onramp-wait",
        userId: "u-1",
        kind: "onramp",
        mint: USDC_MINT,
        amountUi: 50,
        signature: null,
        createdAt: "2026-10-17T11:10:00.000Z",
      },
    ];

    const summary = await reconcileWalletMovements({
      listPendingMovements: async () => pendingItems,
      updateMovementStatus: async () => true,
      getSignatureStatuses: async (sigs) =>
        sigs.map((s) => {
          if (s === "sig-dep-ok") return { confirmationStatus: "confirmed", err: null };
          if (s === "sig-wit-fail") return { confirmationStatus: "confirmed", err: { InstructionError: [0, "Custom"] } };
          return null;
        }),
    });

    expect(summary.reviewed).toBe(3);
    expect(summary.confirmed).toBe(1);
    expect(summary.failed).toBe(1);
    expect(summary.skipped).toBe(1);
  });

  it("endpoint /api/cron/reconcile-wallet exige CRON_SECRET (503/401/200)", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const res503 = await GET(new Request("http://localhost:3100/api/cron/reconcile-wallet"));
    expect(res503.status).toBe(503);

    vi.stubEnv("CRON_SECRET", "wallet-cron-secret");
    const res401 = await GET(
      new Request("http://localhost:3100/api/cron/reconcile-wallet", {
        headers: { authorization: "Bearer bad" },
      }),
    );
    expect(res401.status).toBe(401);

    const res200 = await POST(
      new Request("http://localhost:3100/api/cron/reconcile-wallet", {
        headers: { authorization: "Bearer wallet-cron-secret" },
      }),
    );
    expect(res200.status).toBe(200);
    expect(res200.headers.get("cache-control")).toContain("no-store");
  });
});
