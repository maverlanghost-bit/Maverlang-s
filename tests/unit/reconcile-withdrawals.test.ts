import { afterEach, describe, expect, it, vi } from "vitest";

import {
  WHITELIST_COOLDOWN_MS,
  resolveRecipientCooldown,
} from "@/components/wallet/saved-recipients-bar";
import type { SignatureStatusLike } from "@/lib/solana/signature-status";
import {
  reconcileSubmittedWithdrawals,
  type ReconcileWithdrawalsDeps,
  type SubmittedWithdrawalRow,
} from "@/lib/wallet/reconcile-withdrawals";

const savedDataMode = process.env.DATA_MODE;

afterEach(() => {
  if (savedDataMode === undefined) delete process.env.DATA_MODE;
  else process.env.DATA_MODE = savedDataMode;
  vi.restoreAllMocks();
});

describe("reconcileSubmittedWithdrawals", () => {
  it("retorna ceros en DATA_MODE=mock sin tocar red ni base", async () => {
    process.env.DATA_MODE = "mock";
    const summary = await reconcileSubmittedWithdrawals();
    expect(summary).toEqual({
      reviewed: 0,
      confirmed: 0,
      failed: 0,
      pending: 0,
      skipped: 0,
      durationMs: 0,
    });
  });

  it("concilia retiros confirmed, failed, pending y skipped con deps inyectadas", async () => {
    const rows: SubmittedWithdrawalRow[] = [
      { id: "w1", userId: "u1", requestId: "r1", reference: "ref1", signature: "sig-confirmed" },
      { id: "w2", userId: "u2", requestId: "r2", reference: "ref2", signature: "sig-failed" },
      { id: "w3", userId: "u3", requestId: "r3", reference: "ref3", signature: "sig-processed" },
      { id: "w4", userId: "u4", requestId: "r4", reference: "ref4", signature: "sig-missing" },
      { id: "w5", userId: "u5", requestId: "r5", reference: "ref5", signature: null },
    ];

    const statusesBySig: Record<string, SignatureStatusLike | null> = {
      "sig-confirmed": { confirmationStatus: "finalized", err: null },
      "sig-failed": { confirmationStatus: "confirmed", err: { InstructionError: [0, "Custom"] } },
      "sig-processed": { confirmationStatus: "processed", err: null },
      "sig-missing": null,
    };

    const finalizeWithdrawal = vi.fn(async () => true);
    const updateMovementStatus = vi.fn(async () => true);

    const deps: ReconcileWithdrawalsDeps = {
      listSubmittedWithdrawals: async () => rows,
      getSignatureStatuses: async (sigs) => sigs.map((s) => statusesBySig[s] ?? null),
      finalizeWithdrawal,
      updateMovementStatus,
    };

    const summary = await reconcileSubmittedWithdrawals(deps);

    expect(summary.reviewed).toBe(5);
    expect(summary.confirmed).toBe(1);
    expect(summary.failed).toBe(1);
    expect(summary.pending).toBe(2);
    expect(summary.skipped).toBe(1);
    expect(summary.durationMs).toBeGreaterThanOrEqual(0);

    expect(finalizeWithdrawal).toHaveBeenCalledTimes(2);
    expect(finalizeWithdrawal).toHaveBeenNthCalledWith(1, "u1", "r1", "confirmed", "sig-confirmed", null);
    expect(finalizeWithdrawal).toHaveBeenNthCalledWith(
      2,
      "u2",
      "r2",
      "failed",
      "sig-failed",
      expect.any(String),
    );

    expect(updateMovementStatus).toHaveBeenCalledTimes(2);
    expect(updateMovementStatus).toHaveBeenNthCalledWith(1, "ref1", "confirmed");
    expect(updateMovementStatus).toHaveBeenNthCalledWith(2, "ref2", "failed");
  });

  it("es idempotente cuando finalizeWithdrawal devuelve false y tolera errores puntuales", async () => {
    const rows: SubmittedWithdrawalRow[] = [
      { id: "w1", userId: "u1", requestId: "r1", reference: "ref1", signature: "sig-1" },
      { id: "w2", userId: "u2", requestId: "r2", reference: "ref2", signature: "sig-2" },
    ];

    const finalizeWithdrawal = vi
      .fn<ReconcileWithdrawalsDeps["finalizeWithdrawal"]>()
      .mockResolvedValueOnce(false)
      .mockRejectedValueOnce(new Error("rpc error"));
    const updateMovementStatus = vi.fn(async () => true);

    const summary = await reconcileSubmittedWithdrawals({
      listSubmittedWithdrawals: async () => rows,
      getSignatureStatuses: async () => [
        { confirmationStatus: "confirmed", err: null },
        { confirmationStatus: "confirmed", err: null },
      ],
      finalizeWithdrawal,
      updateMovementStatus,
    });

    expect(summary.reviewed).toBe(2);
    expect(summary.confirmed).toBe(0);
    expect(summary.failed).toBe(0);
    expect(summary.pending).toBe(0);
    expect(summary.skipped).toBe(0);
    expect(updateMovementStatus).not.toHaveBeenCalled();
  });

  it("expira retiros `submitted` viejos sin rastro en RPC para destrabar el tope diario", async () => {
    const oldIso = new Date(Date.now() - 45 * 60 * 1000).toISOString();
    const finalizeWithdrawal = vi.fn(async () => true);
    const updateMovementStatus = vi.fn(async () => true);

    const summary = await reconcileSubmittedWithdrawals({
      listSubmittedWithdrawals: async () => [
        { id: "w-old", userId: "u1", requestId: "r-old", reference: "ref-old", signature: "sig-old", createdAt: oldIso },
      ],
      getSignatureStatuses: async () => [null],
      finalizeWithdrawal,
      updateMovementStatus,
      submittedExpireMs: 30 * 60 * 1000,
    });

    expect(summary.failed).toBe(1);
    expect(summary.pending).toBe(0);
    expect(finalizeWithdrawal).toHaveBeenCalledWith(
      "u1",
      "r-old",
      "failed",
      "sig-old",
      "La transacción expiró sin confirmarse en la red.",
    );
    expect(updateMovementStatus).toHaveBeenCalledWith("ref-old", "failed");
  });
});

describe("24h recipient whitelist cooldown", () => {
  it("marca 'cooldown' antes de 24 h y 'whitelisted' desde las 24 h", () => {
    const baseMs = Date.UTC(2026, 10, 15, 12, 0, 0);
    const addedAt = new Date(baseMs).toISOString();

    expect(resolveRecipientCooldown(addedAt, baseMs)).toBe("cooldown");
    expect(resolveRecipientCooldown(addedAt, baseMs + WHITELIST_COOLDOWN_MS - 1)).toBe("cooldown");
    expect(resolveRecipientCooldown(addedAt, baseMs + WHITELIST_COOLDOWN_MS)).toBe("whitelisted");
    expect(resolveRecipientCooldown(undefined, baseMs + WHITELIST_COOLDOWN_MS)).toBe("cooldown");
    expect(resolveRecipientCooldown("not-a-date", baseMs + WHITELIST_COOLDOWN_MS)).toBe("cooldown");
  });
});
