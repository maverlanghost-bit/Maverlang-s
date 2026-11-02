import { Keypair, SystemProgram, Transaction } from "@solana/web3.js";
import { describe, expect, it } from "vitest";

import {
  assertBuiltAmountsMatch,
  assertQuoteIntegrity,
  assertSignedTransactionMatchesBuilt,
  computeNotionalUsd,
  deviationBps,
  orderIntegrityIssue,
  orderNotionalFromRow,
  reservationExceedsTolerance,
} from "@/lib/trade/integrity";

const NOW = new Date("2026-11-02T15:00:00.000Z");

function quote(overrides: Partial<Parameters<typeof assertQuoteIntegrity>[0]> = {}) {
  return {
    inAmountUi: 100,
    outAmountUi: 0.4,
    pricePerShareUsd: 250,
    expiresAt: new Date(NOW.getTime() + 60_000).toISOString(),
    platformFeeUsd: 0,
    ...overrides,
  };
}

describe("Integridad de la cotización", () => {
  it("acepta una cotización finita, positiva y vigente", () => {
    expect(() => assertQuoteIntegrity(quote(), NOW)).not.toThrow();
  });

  it("rechaza montos cero, negativos o no finitos", () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => assertQuoteIntegrity(quote({ inAmountUi: bad }), NOW)).toThrowError(/montos válidos/i);
      expect(() => assertQuoteIntegrity(quote({ outAmountUi: bad }), NOW)).toThrowError(/montos válidos/i);
    }
  });

  it("rechaza precio inválido, comisión negativa y vencimiento pasado", () => {
    expect(() => assertQuoteIntegrity(quote({ pricePerShareUsd: 0 }), NOW)).toThrowError(/precio/i);
    expect(() => assertQuoteIntegrity(quote({ platformFeeUsd: -0.01 }), NOW)).toThrowError(/comisión/i);
    expect(() =>
      assertQuoteIntegrity(quote({ expiresAt: new Date(NOW.getTime() - 1).toISOString() }), NOW),
    ).toThrowError(/venció/i);
    expect(() => assertQuoteIntegrity(quote({ expiresAt: "no-es-fecha" }), NOW)).toThrowError(/venció/i);
  });
});

describe("Revalidación quote → build", () => {
  const quoted = { inAmountUi: 100, outAmountUi: 0.4, pricePerShareUsd: 250 };

  it("acepta una salida dentro del slippage y devuelve los montos efectivos", () => {
    const built = assertBuiltAmountsMatch(
      quoted,
      { inAmountUi: 100, outAmountUi: 0.398, pricePerShareUsd: 251.2 },
      300,
    );
    expect(built.inAmountUi).toBe(100);
    expect(built.outAmountUi).toBe(0.398);
  });

  it("rechaza que cambie el monto de entrada", () => {
    expect(() =>
      assertBuiltAmountsMatch(quoted, { inAmountUi: 101, outAmountUi: 0.4, pricePerShareUsd: 250 }, 300),
    ).toThrowError(/monto de entrada cambió/i);
  });

  it("rechaza una salida fuera del slippage", () => {
    expect(() =>
      assertBuiltAmountsMatch(quoted, { inAmountUi: 100, outAmountUi: 0.3, pricePerShareUsd: 250 }, 300),
    ).toThrowError(/precio se movió/i);
  });

  it("rechaza montos/precios inválidos del build", () => {
    expect(() =>
      assertBuiltAmountsMatch(quoted, { inAmountUi: 100, outAmountUi: 0, pricePerShareUsd: 250 }, 300),
    ).toThrowError(/montos inválidos/i);
    expect(() =>
      assertBuiltAmountsMatch(quoted, { inAmountUi: 100, outAmountUi: 0.4, pricePerShareUsd: Number.NaN }, 300),
    ).toThrowError(/precio inválido/i);
  });

  it("deviationBps es relativa y protege divisiones por cero", () => {
    expect(deviationBps(100, 101)).toBeCloseTo(100, 6);
    expect(deviationBps(100, 100)).toBe(0);
    expect(deviationBps(0, 100)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("Integridad de la transacción firmada", () => {
  const payer = Keypair.generate();
  const recipient = Keypair.generate();
  const blockhash = Keypair.generate().publicKey.toBase58();

  function serialize(lamports: number, signed: boolean): string {
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: recipient.publicKey,
        lamports,
      }),
    );
    tx.feePayer = payer.publicKey;
    tx.recentBlockhash = blockhash;
    if (signed) tx.sign(payer);
    return tx
      .serialize({ requireAllSignatures: signed, verifySignatures: false })
      .toString("base64");
  }

  it("acepta la misma transacción con la firma del cliente", async () => {
    const built = serialize(1_000, false);
    const signed = serialize(1_000, true);
    await expect(assertSignedTransactionMatchesBuilt(built, signed)).resolves.toBeUndefined();
  });

  it("rechaza otra transacción con el mismo requestId", async () => {
    const built = serialize(1_000, false);
    const signed = serialize(2_000, true);
    await expect(assertSignedTransactionMatchesBuilt(built, signed)).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  it("rechaza base64 vacío o ilegible", async () => {
    await expect(assertSignedTransactionMatchesBuilt("", "dHg=")).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await expect(assertSignedTransactionMatchesBuilt("dHg=", "dHg=")).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  it("también compara transacciones versionadas", async () => {
    const { VersionedTransaction, TransactionMessage, TransactionInstruction } = await import(
      "@solana/web3.js"
    );
    const message = new TransactionMessage({
      payerKey: payer.publicKey,
      recentBlockhash: blockhash,
      instructions: [
        new TransactionInstruction({
          programId: recipient.publicKey,
          keys: [],
          data: Buffer.from([1, 2, 3]),
        }),
      ],
    }).compileToV0Message();
    const unsigned = new VersionedTransaction(message);
    const signed = new VersionedTransaction(message);
    signed.sign([payer]);
    const built = Buffer.from(unsigned.serialize()).toString("base64");
    const signedB64 = Buffer.from(signed.serialize()).toString("base64");
    await expect(assertSignedTransactionMatchesBuilt(built, signedB64)).resolves.toBeUndefined();

    const otherMessage = new TransactionMessage({
      payerKey: payer.publicKey,
      recentBlockhash: blockhash,
      instructions: [
        new TransactionInstruction({
          programId: recipient.publicKey,
          keys: [],
          data: Buffer.from([1, 2, 4]),
        }),
      ],
    }).compileToV0Message();
    const otherSigned = new VersionedTransaction(otherMessage);
    otherSigned.sign([payer]);
    const otherB64 = Buffer.from(otherSigned.serialize()).toString("base64");
    await expect(assertSignedTransactionMatchesBuilt(built, otherB64)).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });
});

describe("Integridad de órdenes y reservas", () => {
  it("computeNotionalUsd: compra por entrada, venta por salida", () => {
    expect(computeNotionalUsd({ side: "buy", inAmountUi: 100, outAmountUi: 0.4, pricePerShareUsd: 250 })).toBe(100);
    expect(computeNotionalUsd({ side: "sell", inAmountUi: 0.4, outAmountUi: 98, pricePerShareUsd: 250 })).toBe(98);
    expect(computeNotionalUsd({ side: "sell", inAmountUi: 0.4, outAmountUi: 0, pricePerShareUsd: 250 })).toBe(100);
    expect(computeNotionalUsd({ side: "sell", inAmountUi: 0.4, outAmountUi: 0, pricePerShareUsd: 0 })).toBe(0);
  });

  it("orderIntegrityIssue detecta montos corruptos y precios negativos", () => {
    expect(orderIntegrityIssue({ side: "buy", in_amount_ui: 100, out_amount_ui: 0.4 })).toBeNull();
    expect(orderIntegrityIssue({ side: "sell", in_amount_ui: 0.4, out_amount_ui: 98 })).toBeNull();
    expect(orderIntegrityIssue({ side: "buy", in_amount_ui: 0, out_amount_ui: 0.4 })).toBe(
      "INVALID_AMOUNT",
    );
    expect(orderIntegrityIssue({ side: "buy", in_amount_ui: -1, out_amount_ui: 0.4 })).toBe(
      "INVALID_AMOUNT",
    );
    expect(
      orderIntegrityIssue({ side: "buy", in_amount_ui: 100, out_amount_ui: 0.4, price_per_share_usd: -1 }),
    ).toBe("INVALID_PRICE");
  });

  it("orderNotionalFromRow devuelve null para filas corruptas", () => {
    expect(orderNotionalFromRow({ side: "buy", in_amount_ui: 100, out_amount_ui: 0.4 })).toBe(100);
    expect(orderNotionalFromRow({ side: "sell", in_amount_ui: 0.4, out_amount_ui: 98 })).toBe(98);
    expect(orderNotionalFromRow({ side: "buy", in_amount_ui: 0, out_amount_ui: 0.4 })).toBeNull();
  });

  it("reservationExceedsTolerance tolera diferencias de slippage/redondeo", () => {
    expect(reservationExceedsTolerance(100, 100.5)).toBe(false);
    expect(reservationExceedsTolerance(100, 101.5)).toBe(false);
    expect(reservationExceedsTolerance(100, 106)).toBe(true);
    expect(reservationExceedsTolerance(100, 90)).toBe(true);
    expect(reservationExceedsTolerance(0, 100)).toBe(true);
  });
});
