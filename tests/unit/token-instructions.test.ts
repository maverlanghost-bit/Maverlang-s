import { Keypair, PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";

import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferInstruction,
  getAssociatedTokenAddressSync,
} from "@/lib/solana/token-instructions";

/**
 * Fixtures de referencia generadas con `@solana/spl-token@0.4.15` (la versión
 * que se reemplazó) y contrastadas con los paquetes oficiales
 * `@solana-program/token@0.9.0` y `@solana-program/token-2022@0.6.1`:
 * mismas direcciones, mismas cuentas y mismos bytes de instrucción.
 */

const USDC_MINT = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
const AAPL_MINT = new PublicKey("XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp");

/** Keypairs deterministas: mismo seed en cada corrida. */
function keypair(seedNumber: number): Keypair {
  const seed = Uint8Array.from(
    { length: 32 },
    (_, index) => (seedNumber * 31 + index * 7) & 0xff,
  );
  return Keypair.fromSeed(seed);
}

const payer = keypair(1).publicKey;
const owner = keypair(2).publicKey;
const extraSigner = keypair(4).publicKey;

function keysOf(instruction: {
  keys: Array<{ pubkey: PublicKey; isSigner: boolean; isWritable: boolean }>;
}): Array<[string, boolean, boolean]> {
  return instruction.keys.map((key) => [
    key.pubkey.toBase58(),
    key.isSigner,
    key.isWritable,
  ]);
}

describe("token-instructions: direcciones ATA", () => {
  it("deriva la ATA clásica con seeds [owner, tokenProgram, mint]", () => {
    expect(getAssociatedTokenAddressSync(USDC_MINT, owner).toBase58()).toBe(
      "4iCAuoM9yge5SqRP5mYEr9nfKbSsDdaYNuUVfBLxzQDy",
    );
  });

  it("deriva la ATA Token-2022 usando el programa 2022", () => {
    expect(
      getAssociatedTokenAddressSync(AAPL_MINT, owner, false, TOKEN_2022_PROGRAM_ID).toBase58(),
    ).toBe("5EKPtJ3T3jtNsFEEMFwBUG9op3G6A66DcsN7BNh3pznN");
  });

  it("permite un owner PDA sólo con allowOwnerOffCurve", () => {
    const [pda] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault")],
      TOKEN_PROGRAM_ID,
    );
    expect(getAssociatedTokenAddressSync(USDC_MINT, pda, true).toBase58()).toBe(
      "6fQcUCMPgjKE6STVFXsyRXH98B3At9cg8468wozEUjtF",
    );
    expect(() => getAssociatedTokenAddressSync(USDC_MINT, pda, false)).toThrow(
      /PDA/,
    );
  });
});

describe("token-instructions: CreateAssociatedTokenAccountIdempotent", () => {
  it("arma la instrucción clásica con data [1] y las seis cuentas", () => {
    const ata = new PublicKey("4iCAuoM9yge5SqRP5mYEr9nfKbSsDdaYNuUVfBLxzQDy");
    const instruction = createAssociatedTokenAccountIdempotentInstruction(
      payer,
      ata,
      owner,
      USDC_MINT,
    );

    expect(instruction.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID)).toBe(true);
    expect(Buffer.from(instruction.data).toString("hex")).toBe("01");
    expect(keysOf(instruction)).toEqual([
      ["oATmqnVYH1aG2tSMUm5PM73SGFYUmtbuTRRXZS6hsMG", true, true],
      ["4iCAuoM9yge5SqRP5mYEr9nfKbSsDdaYNuUVfBLxzQDy", false, true],
      ["7UnjK7Fm3vESHWx2E3vYb3UertASJ7fppyq6tYcBjw3n", false, false],
      ["EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", false, false],
      ["11111111111111111111111111111111", false, false],
      ["TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", false, false],
    ]);
  });

  it("usa el programa Token-2022 como última cuenta cuando el mint es 2022", () => {
    const ata = new PublicKey("5EKPtJ3T3jtNsFEEMFwBUG9op3G6A66DcsN7BNh3pznN");
    const instruction = createAssociatedTokenAccountIdempotentInstruction(
      payer,
      ata,
      owner,
      AAPL_MINT,
      TOKEN_2022_PROGRAM_ID,
    );

    expect(keysOf(instruction).at(-1)).toEqual([
      "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
      false,
      false,
    ]);
  });
});

describe("token-instructions: Transfer", () => {
  const source = new PublicKey("4iCAuoM9yge5SqRP5mYEr9nfKbSsDdaYNuUVfBLxzQDy");
  const destination = new PublicKey("65wzVi6UNC3nhhCKVSbpAMBPdicN9y5BWsCs4QZPcMH2");

  it.each([
    ["0", "030000000000000000"],
    ["1", "030100000000000000"],
    ["1000000", "0340420f0000000000"],
    ["18446744073709551615", "03ffffffffffffffff"],
  ])("codifica el monto %s como u64 little-endian", (amount, expectedHex) => {
    const instruction = createTransferInstruction(
      source,
      destination,
      owner,
      BigInt(amount),
    );
    expect(Buffer.from(instruction.data).toString("hex")).toBe(expectedHex);
  });

  it("marca source y destination como escribibles y authority como firmante", () => {
    const instruction = createTransferInstruction(source, destination, owner, BigInt(1_000_000));

    expect(instruction.programId.equals(TOKEN_PROGRAM_ID)).toBe(true);
    expect(keysOf(instruction)).toEqual([
      ["4iCAuoM9yge5SqRP5mYEr9nfKbSsDdaYNuUVfBLxzQDy", false, true],
      ["65wzVi6UNC3nhhCKVSbpAMBPdicN9y5BWsCs4QZPcMH2", false, true],
      ["7UnjK7Fm3vESHWx2E3vYb3UertASJ7fppyq6tYcBjw3n", true, false],
    ]);
  });

  it("usa Token-2022 cuando se pide ese programa", () => {
    const instruction = createTransferInstruction(
      source,
      destination,
      owner,
      BigInt(1_000_000),
      [],
      TOKEN_2022_PROGRAM_ID,
    );
    expect(instruction.programId.equals(TOKEN_2022_PROGRAM_ID)).toBe(true);
  });

  it("agrega la authority sin firma y los firmantes de una multisig", () => {
    const instruction = createTransferInstruction(
      source,
      destination,
      owner,
      BigInt(42),
      [extraSigner],
    );
    expect(keysOf(instruction)).toEqual([
      ["4iCAuoM9yge5SqRP5mYEr9nfKbSsDdaYNuUVfBLxzQDy", false, true],
      ["65wzVi6UNC3nhhCKVSbpAMBPdicN9y5BWsCs4QZPcMH2", false, true],
      ["7UnjK7Fm3vESHWx2E3vYb3UertASJ7fppyq6tYcBjw3n", false, false],
      ["7MpjNdjsB4ZXpFmCnuqUk5XtKrbUS8JFxLsr1eAB3kwn", true, false],
    ]);
    expect(Buffer.from(instruction.data).toString("hex")).toBe("032a00000000000000");
  });

  it("rechaza montos fuera del rango u64 en vez de truncarlos", () => {
    const tooBig = BigInt("18446744073709551616");
    expect(() => createTransferInstruction(source, destination, owner, tooBig)).toThrow(
      /u64/,
    );
    expect(() =>
      createTransferInstruction(source, destination, owner, BigInt(-1)),
    ).toThrow(/u64/);
    expect(() =>
      createTransferInstruction(source, destination, owner, 1 as unknown as bigint),
    ).toThrow(/bigint/);
  });
});
