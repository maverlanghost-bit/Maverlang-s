import { Keypair, PublicKey, SystemProgram, TransactionInstruction, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import { createPrivateKey, sign as cryptoSign } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { USDC_MINT } from "@/config/tickers";
import { assertTrustedJupiterBase } from "@/lib/market/jupiter-order";
import { reconcilePendingOrders } from "@/lib/orders/reconcile";
import { createLiveTrade } from "@/lib/services/trade.live";
import type { ReconcileOrderPatch, ReconcileRow } from "@/lib/services/orders.supabase";
import { assertJupiterTransactionSafe, verifySignedTransactionSignatures } from "@/lib/trade/integrity";

/**
 * Auditoría v3 (MON-1, MON-2, MON-3, MON-5, MON-10, DB-J): pruebas con claves
 * reales (Keypair.generate), sin red ni Supabase.
 */

const BLOCKHASH = "EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N";
const USER = "11111111-1111-4111-8111-111111111111";
const STOCK_MINT = "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp";

const state = vi.hoisted(() => ({
  list: vi.fn(),
  jupiter: vi.fn(),
}));

vi.mock("@/lib/services/prices.live", () => ({
  livePrices: { list: state.list, fx: vi.fn() },
}));
vi.mock("@/lib/catalog/tradable", () => ({
  requireOperable: async (symbol: string) => ({ symbol, mint: STOCK_MINT }),
}));
vi.mock("@/lib/solana/scaled-ui", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/solana/scaled-ui")>();
  return { ...actual, fetchMintMultiplier: async () => 1 };
});
vi.mock("@/lib/market/jupiter-client", () => ({ fetchJupiterOrder: state.jupiter }));

function b64(tx: VersionedTransaction): string {
  return Buffer.from(tx.serialize()).toString("base64");
}

function transferMessage(payer: Keypair, lamports = 1) {
  return new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: BLOCKHASH,
    instructions: [
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: Keypair.generate().publicKey,
        lamports,
      }),
    ],
  }).compileToV0Message();
}

describe("MON-2: verificación Ed25519 de las firmas del cliente", () => {
  it("acepta una tx firmada de verdad y devuelve su firma", async () => {
    const payer = Keypair.generate();
    const tx = new VersionedTransaction(transferMessage(payer));
    tx.sign([payer]);
    const signature = await verifySignedTransactionSignatures(b64(tx));
    expect(signature).toMatch(/^[1-9A-HJ-NP-Za-km-z]{80,90}$/);
  });

  it("rechaza una firma falsificada (bytes arbitrarios no nulos)", async () => {
    const payer = Keypair.generate();
    const tx = new VersionedTransaction(transferMessage(payer));
    tx.signatures[0] = new Uint8Array(64).fill(7);
    await expect(verifySignedTransactionSignatures(b64(tx))).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("rechaza la firma válida de OTRA transacción pegada en esta", async () => {
    const payer = Keypair.generate();
    const other = new VersionedTransaction(transferMessage(payer, 999));
    other.sign([payer]);
    const forged = new VersionedTransaction(transferMessage(payer, 1));
    forged.signatures[0] = other.signatures[0] as Uint8Array;
    await expect(verifySignedTransactionSignatures(b64(forged))).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("rechaza una firma de otra clave sobre este mensaje", async () => {
    const payer = Keypair.generate();
    const intruder = Keypair.generate();
    const tx = new VersionedTransaction(transferMessage(payer));
    // Firma válida del intruso sobre el mensaje, puesta en la ranura del pagador.
    const key = createPrivateKey({
      key: Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), Buffer.from(intruder.secretKey.slice(0, 32))]),
      format: "der",
      type: "pkcs8",
    });
    tx.signatures[0] = new Uint8Array(cryptoSign(null, Buffer.from(tx.message.serialize()), key));
    await expect(verifySignedTransactionSignatures(b64(tx))).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("rechaza una tx sin firmar del pagador", async () => {
    const payer = Keypair.generate();
    const tx = new VersionedTransaction(transferMessage(payer));
    await expect(verifySignedTransactionSignatures(b64(tx))).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("tolera un cofirmante todavía en ceros pero no uno inválido", async () => {
    const payer = Keypair.generate();
    const maker = Keypair.generate();
    const message = new TransactionMessage({
      payerKey: payer.publicKey,
      recentBlockhash: BLOCKHASH,
      instructions: [
        new TransactionInstruction({
          programId: SystemProgram.programId,
          keys: [
            { pubkey: payer.publicKey, isSigner: true, isWritable: true },
            { pubkey: maker.publicKey, isSigner: true, isWritable: false },
          ],
          data: Buffer.alloc(0),
        }),
      ],
    }).compileToV0Message();
    const ok = new VersionedTransaction(message);
    ok.sign([payer]);
    await expect(verifySignedTransactionSignatures(b64(ok))).resolves.toBeTruthy();

    const bad = new VersionedTransaction(message);
    bad.sign([payer]);
    bad.signatures[1] = new Uint8Array(64).fill(3);
    await expect(verifySignedTransactionSignatures(b64(bad))).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("MON-10: la tx de Jupiter se decodifica y se afirma", () => {
  const stockMint = new PublicKey(STOCK_MINT);
  const usdc = new PublicKey(USDC_MINT);

  function swapTx(payer: PublicKey, accounts: PublicKey[]) {
    return new VersionedTransaction(
      new TransactionMessage({
        payerKey: payer,
        recentBlockhash: BLOCKHASH,
        instructions: [
          new TransactionInstruction({
            programId: Keypair.generate().publicKey,
            keys: accounts.map((pubkey) => ({ pubkey, isSigner: false, isWritable: true })),
            data: Buffer.alloc(0),
          }),
        ],
      }).compileToV0Message(),
    );
  }

  it("acepta pagador = taker con ambos mints presentes", async () => {
    const taker = Keypair.generate().publicKey;
    const tx = swapTx(taker, [usdc, stockMint]);
    await expect(
      assertJupiterTransactionSafe(b64(tx), { taker: taker.toBase58(), inputMint: USDC_MINT, outputMint: STOCK_MINT }),
    ).resolves.toBeUndefined();
  });

  it("rechaza si el pagador no es el taker", async () => {
    const taker = Keypair.generate().publicKey;
    const tx = swapTx(Keypair.generate().publicKey, [usdc, stockMint, taker]);
    await expect(
      assertJupiterTransactionSafe(b64(tx), { taker: taker.toBase58(), inputMint: USDC_MINT, outputMint: STOCK_MINT }),
    ).rejects.toMatchObject({ code: "UPSTREAM" });
  });

  it("rechaza si falta el mint de salida", async () => {
    const taker = Keypair.generate().publicKey;
    const tx = swapTx(taker, [usdc, Keypair.generate().publicKey]);
    await expect(
      assertJupiterTransactionSafe(b64(tx), { taker: taker.toBase58(), inputMint: USDC_MINT, outputMint: STOCK_MINT }),
    ).rejects.toMatchObject({ code: "UPSTREAM" });
  });

  it("fija el host de Jupiter en producción", () => {
    expect(() => assertTrustedJupiterBase("https://api.jup.ag", "production")).not.toThrow();
    expect(() => assertTrustedJupiterBase("https://lite-api.jup.ag/x", "production")).not.toThrow();
    expect(() => assertTrustedJupiterBase("https://evil.example", "production")).toThrow();
    expect(() => assertTrustedJupiterBase("http://api.jup.ag", "production")).toThrow();
    expect(() => assertTrustedJupiterBase("http://localhost:9", "test")).not.toThrow();
  });
});

describe("MON-1 y DB-J: submit no maneja retiros y status exige dueño", () => {
  const trade = createLiveTrade({} as never);

  it("liveTrade.submit rechaza requestIds send:", async () => {
    await expect(
      trade.submit({ requestId: "send:abc", signedTransactionBase64: "AAAA" }, USER),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("status sin usuario falla en vez de leer con el cliente admin", async () => {
    await expect(trade.status("order-1")).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("MON-3: precio de referencia en ambos lados", () => {
  beforeEach(() => {
    state.list.mockReset();
    state.jupiter.mockReset();
  });

  function order(inAmount: string, outAmount: string, side: "buy" | "sell") {
    return {
      requestId: "req-1",
      inputMint: side === "buy" ? USDC_MINT : STOCK_MINT,
      outputMint: side === "buy" ? STOCK_MINT : USDC_MINT,
      inAmount,
      outAmount,
      priceImpactPct: "0.01",
      slippageBps: 50,
      routePlan: [{ swapInfo: { label: "Raydium" } }],
    };
  }

  const trade = createLiveTrade({} as never);

  it("compra en USDC sin precio de referencia falla cerrado", async () => {
    state.list.mockResolvedValue([{ priceUsd: 0 }]);
    state.jupiter.mockResolvedValue(order("100000000", "40000000", "buy"));
    await expect(
      trade.quote({ side: "buy", symbol: "AAPLx", amount: 100, amountCurrency: "USDC" }, USER, { persist: false }),
    ).rejects.toMatchObject({ code: "UPSTREAM" });
  });

  it("compra en USDC con precio de Jupiter 10 % sobre la referencia se rechaza", async () => {
    state.list.mockResolvedValue([{ priceUsd: 250 }]);
    // 100 USDC por 0,3636 acciones = US$275 (10 % arriba).
    state.jupiter.mockResolvedValue(order("100000000", "36360000", "buy"));
    await expect(
      trade.quote({ side: "buy", symbol: "AAPLx", amount: 100, amountCurrency: "USDC" }, USER, { persist: false }),
    ).rejects.toMatchObject({ code: "PRICE_DEVIATION" });
  });

  it("venta a precio 10 % bajo la referencia se rechaza", async () => {
    state.list.mockResolvedValue([{ priceUsd: 250 }]);
    // 1 acción -> 225 USDC.
    state.jupiter.mockResolvedValue(order("100000000", "225000000", "sell"));
    await expect(
      trade.quote({ side: "sell", symbol: "AAPLx", amount: 1, amountCurrency: "SHARES" }, USER, { persist: false }),
    ).rejects.toMatchObject({ code: "PRICE_DEVIATION" });
  });

  it("venta dentro de la banda se acepta", async () => {
    state.list.mockResolvedValue([{ priceUsd: 250 }]);
    state.jupiter.mockResolvedValue(order("100000000", "250000000", "sell"));
    const q = await trade.quote(
      { side: "sell", symbol: "AAPLx", amount: 1, amountCurrency: "SHARES" },
      USER,
      { persist: false },
    );
    expect(q.priceDeviationBps).toBeLessThan(1);
  });
});

describe("MON-2 / MON-5: conciliación decide on-chain primero y verifica la tx", () => {
  const NOW = new Date("2026-11-21T15:00:00.000Z");
  const row = (over: Partial<ReconcileRow> = {}): ReconcileRow => ({
    id: "o1",
    status: "submitted",
    tx_signature: "sig-1",
    quote_expires_at: null,
    created_at: new Date(NOW.getTime() - 5 * 60_000).toISOString(),
    user_id: "u1",
    request_id: "r1",
    side: "buy",
    in_amount_ui: 100,
    out_amount_ui: 0.4,
    price_per_share_usd: 250,
    ...over,
  });

  async function run(opts: {
    rows: ReconcileRow[];
    onchain: { status: string | null; err: unknown } | null;
    check?: "match" | "mismatch" | "unknown";
    reservation?: { amountUsd: number; status: string; expiresAt: string } | null;
  }) {
    const applied = new Map<string, ReconcileOrderPatch>();
    const released: string[] = [];
    const summary = await reconcilePendingOrders({
      now: () => NOW,
      dataMode: () => "live",
      listOpen: async () => opts.rows,
      update: async (id, patch) => {
        applied.set(id, patch);
        return true;
      },
      getSignatureStatuses: async (sigs) => sigs.map(() => opts.onchain),
      readReservation: async () => opts.reservation ?? null,
      releaseReservation: async (_u, r) => {
        released.push(r);
        return true;
      },
      verifyOnchainTransaction: async () => opts.check ?? "match",
      log: () => undefined,
    });
    return { summary, applied, released };
  }

  it("confirma cuando la tx on-chain coincide con la armada", async () => {
    const { summary, applied } = await run({ rows: [row()], onchain: { status: "finalized", err: null } });
    expect(summary.confirmed).toBe(1);
    expect(applied.get("o1")?.status).toBe("confirmed");
  });

  it("firma de otra tx (mismatch): ni confirma ni libera; va a revisión", async () => {
    const { summary, applied, released } = await run({
      rows: [row()],
      onchain: { status: "finalized", err: null },
      check: "mismatch",
    });
    expect(summary.confirmed).toBe(0);
    expect(summary.needsReview).toBe(1);
    expect(applied.size).toBe(0);
    expect(released).toHaveLength(0);
  });

  it("firma pegada de una tx fallida (mismatch) no libera cupo", async () => {
    const { summary, applied, released } = await run({
      rows: [row()],
      onchain: { status: "finalized", err: { InstructionError: [0, "Custom"] } },
      check: "unknown",
    });
    expect(summary.failed).toBe(0);
    expect(summary.needsReview).toBe(1);
    expect(applied.size).toBe(0);
    expect(released).toHaveLength(0);
  });

  it("reserva liberada + tx confirmada on-chain: needsReview, nunca failed", async () => {
    const { summary, applied, released } = await run({
      rows: [row()],
      onchain: { status: "confirmed", err: null },
      reservation: { amountUsd: 100, status: "released", expiresAt: NOW.toISOString() },
    });
    expect(summary.failed).toBe(0);
    expect(summary.needsReview).toBe(1);
    expect(applied.size).toBe(0);
    expect(released).toHaveLength(0);
  });

  it("monto distinto a la reserva + tx confirmada: needsReview, no libera cupo", async () => {
    const { summary, applied } = await run({
      rows: [row()],
      onchain: { status: "finalized", err: null },
      reservation: { amountUsd: 10, status: "reserved", expiresAt: NOW.toISOString() },
    });
    expect(summary.needsReview).toBe(1);
    expect(applied.size).toBe(0);
  });

  it("un fallo on-chain verificado sigue cerrando como failed aunque haya discrepancia", async () => {
    const { summary, applied } = await run({
      rows: [row()],
      onchain: { status: "finalized", err: { InstructionError: [0, "Custom"] } },
      reservation: { amountUsd: 10, status: "reserved", expiresAt: NOW.toISOString() },
    });
    expect(summary.failed).toBe(1);
    expect(applied.get("o1")?.status).toBe("failed");
  });
});
