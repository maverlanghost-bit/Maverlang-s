import { Keypair } from "@solana/web3.js";
import { describe, expect, it } from "vitest";

import { buildFeeTransferIx, computeFee } from "@/lib/solana/fee";

const from = Keypair.generate().publicKey;
const feeWallet = Keypair.generate().publicKey;
const oneUsdc = BigInt(1_000_000);

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
});
