import { Keypair } from "@solana/web3.js";
import { describe, expect, it } from "vitest";

import { buildFeeTransferIx, computeFee } from "@/lib/solana/fee";

const from = Keypair.generate().publicKey;
const feeWallet = Keypair.generate().publicKey;
const oneUsdc = BigInt(1_000_000);

/** Keypairs deterministas para comparar direcciones y bytes contra spl-token 0.4.15. */
function keypair(seedNumber: number): Keypair {
  const seed = Uint8Array.from(
    { length: 32 },
    (_, index) => (seedNumber * 31 + index * 7) & 0xff,
  );
  return Keypair.fromSeed(seed);
}

function instructionsFor(amount: bigint, bps: number) {
  const fee = computeFee(amount, bps);
  if (fee === null || fee <= BigInt(0)) return [];
  return buildFeeTransferIx({ from, feeWallet, amount: fee });
}

describe("fee", () => {
  it("con 0 bps no arma instrucción", () => {
    expect(computeFee(oneUsdc, 0)).toBeNull();
    expect(instructionsFor(oneUsdc, 0)).toEqual([]);
  });

  it("con bps positivos arma la cuenta y la transferencia", () => {
    expect(computeFee(oneUsdc, 100)).toBe(BigInt(10_000));
    expect(instructionsFor(oneUsdc, 100)).toHaveLength(2);
  });

  it("un monto chico puede truncar a cero y tampoco transfiere", () => {
    expect(computeFee(BigInt(1), 1)).toBe(BigInt(0));
    expect(instructionsFor(BigInt(1), 1)).toEqual([]);
  });

  it("arma la ATA del cobrador y la transferencia con bytes y cuentas de referencia", () => {
    const deterministicFrom = keypair(2).publicKey;
    const deterministicFeeWallet = keypair(3).publicKey;
    const [createAccount, transfer] = buildFeeTransferIx({
      from: deterministicFrom,
      feeWallet: deterministicFeeWallet,
      amount: BigInt(10_000),
    });

    expect(createAccount?.programId.toBase58()).toBe(
      "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
    );
    expect(createAccount && Buffer.from(createAccount.data).toString("hex")).toBe("01");
    expect(createAccount?.keys.map((key) => key.pubkey.toBase58())).toEqual([
      "7UnjK7Fm3vESHWx2E3vYb3UertASJ7fppyq6tYcBjw3n",
      "65wzVi6UNC3nhhCKVSbpAMBPdicN9y5BWsCs4QZPcMH2",
      "APMU8V3wYp4qvipSrwEgBDG1kmrGYxVvPhnLLVi9tC2f",
      "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      "11111111111111111111111111111111",
      "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    ]);

    expect(transfer?.programId.toBase58()).toBe(
      "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
    );
    expect(transfer && Buffer.from(transfer.data).toString("hex")).toBe(
      "031027000000000000",
    );
    expect(transfer?.keys.map((key) => key.pubkey.toBase58())).toEqual([
      "4iCAuoM9yge5SqRP5mYEr9nfKbSsDdaYNuUVfBLxzQDy",
      "65wzVi6UNC3nhhCKVSbpAMBPdicN9y5BWsCs4QZPcMH2",
      "7UnjK7Fm3vESHWx2E3vYb3UertASJ7fppyq6tYcBjw3n",
    ]);
  });
});
