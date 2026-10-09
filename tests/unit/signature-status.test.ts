import { describe, expect, it } from "vitest";

import {
  signatureStatusToOrder,
  confirmationToOrderStatus,
  type SignatureStatusLike,
  type ConfirmationDecision,
} from "@/lib/solana/signature-status";

/**
 * Tests del mapa de estado de firma de Solana → estado de nuestra orden.
 * Puro: recibe lo que devuelve el RPC (`getSignatureStatuses`) y decide
 * submitted / confirmed / failed sin tocar la red. `trade.live.status()`
 * lo consume tras consultar el RPC privado de Helius.
 */

describe("confirmationToOrderStatus", () => {
  it("sin firma en el RPC todavía → submitted (sigue pendiente)", () => {
    expect(confirmationToOrderStatus(null)).toBe("submitted");
  });

  it("confirmación confirmada → confirmed", () => {
    expect(confirmationToOrderStatus("confirmed")).toBe("confirmed");
  });

  it("finalizada → confirmed", () => {
    expect(confirmationToOrderStatus("finalized")).toBe("confirmed");
  });

  it("procesada pero no final → submitted (aún puede revertirse)", () => {
    expect(confirmationToOrderStatus("processed")).toBe("submitted");
  });

  it("error on-chain → failed", () => {
    const status: SignatureStatusLike = {
      confirmationStatus: "processed",
      err: { InstructionError: [0, { Custom: 1 }] },
    };
    expect(confirmationToOrderStatus(status.confirmationStatus, status.err)).toBe("failed");
  });

  it("err aunque esté confirmed sigue siendo failed (la tx falló)", () => {
    const status: SignatureStatusLike = {
      confirmationStatus: "confirmed",
      err: { InstructionError: [0, { Custom: 1 }] },
    };
    expect(confirmationToOrderStatus(status.confirmationStatus, status.err)).toBe("failed");
  });
});

describe("signatureStatusToOrder", () => {
  it("devuelve la decisión completa con firma", () => {
    const status: SignatureStatusLike = {
      confirmationStatus: "confirmed",
      slot: 123456,
      confirmations: 31,
      err: null,
    };
    const decision: ConfirmationDecision = signatureStatusToOrder(status);
    expect(decision.status).toBe("confirmed");
    expect(decision.slot).toBe(123456);
    expect(decision.confirmations).toBe(31);
  });

  it("sin status (null) → submitted, sin slot", () => {
    const decision = signatureStatusToOrder(null);
    expect(decision.status).toBe("submitted");
    expect(decision.slot).toBeNull();
  });

  it("una firma con err queda failed aunque tenga confirmaciones", () => {
    const status: SignatureStatusLike = {
      confirmationStatus: "finalized",
      slot: 999,
      confirmations: 32,
      err: "AccountNotFound",
    };
    const decision = signatureStatusToOrder(status);
    expect(decision.status).toBe("failed");
  });
});
