import { Keypair, PublicKey, SystemProgram, VersionedTransaction } from "@solana/web3.js";
import { describe, expect, it } from "vitest";

import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@/lib/solana/token-instructions";
import {
  buildSendInstructions,
  buildSendTransaction,
  expectedTokenProgram,
  resolveTokenProgram,
  type SendRpc,
} from "@/lib/solana/send-build";

/**
 * Keypairs deterministas y fixtures de referencia (spl-token 0.4.15 +
 * @solana-program/token / token-2022). No se usa RPC real: el subconjunto
 * `SendRpc` se reemplaza por un doble de prueba.
 */

const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const AAPL_MINT = "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp";
const BLOCKHASH = "EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N";

function keypair(seedNumber: number): Keypair {
  const seed = Uint8Array.from(
    { length: 32 },
    (_, index) => (seedNumber * 31 + index * 7) & 0xff,
  );
  return Keypair.fromSeed(seed);
}

const owner = keypair(2).publicKey;
const to = keypair(3).publicKey;

const usdcSource = "4iCAuoM9yge5SqRP5mYEr9nfKbSsDdaYNuUVfBLxzQDy";
const usdcDestination = "65wzVi6UNC3nhhCKVSbpAMBPdicN9y5BWsCs4QZPcMH2";
const aaplSource = "5EKPtJ3T3jtNsFEEMFwBUG9op3G6A66DcsN7BNh3pznN";
const aaplDestination = "HaMKiVvPTSmBieHzMmhTvq9JbugFxr6kr2NLrG8mF6rq";

interface RpcConfig {
  owners: Record<string, PublicKey | null>;
  balances?: Record<string, string>;
  throwOnAccount?: ReadonlySet<string>;
  throwOnBalance?: ReadonlySet<string>;
}

function fakeRpc(config: RpcConfig): SendRpc {
  return {
    getAccountInfo: async (address: PublicKey) => {
      const key = address.toBase58();
      if (config.throwOnAccount?.has(key)) throw new Error("rpc caído");
      const ownerProgram = config.owners[key];
      return ownerProgram ? ({ owner: ownerProgram } as never) : null;
    },
    getTokenAccountBalance: async (address: PublicKey) => {
      const key = address.toBase58();
      if (config.throwOnBalance?.has(key)) throw new Error("rpc caído");
      const amount = config.balances?.[key];
      if (amount === undefined) throw new Error("cuenta sin saldo");
      return { value: { amount } } as never;
    },
  } as unknown as SendRpc;
}

function compiledPrograms(transactionBase64: string): string[] {
  const transaction = VersionedTransaction.deserialize(
    Buffer.from(transactionBase64, "base64"),
  );
  const keys = transaction.message.staticAccountKeys.map((key) => key.toBase58());
  return transaction.message.compiledInstructions.map(
    (instruction) => keys[instruction.programIdIndex] ?? "",
  );
}

describe("send-build: programa esperado por catálogo", () => {
  it("USDC usa el programa clásico y las acciones Token-2022", () => {
    expect(expectedTokenProgram("usdc").equals(TOKEN_PROGRAM_ID)).toBe(true);
    expect(expectedTokenProgram("stock").equals(TOKEN_2022_PROGRAM_ID)).toBe(true);
  });
});

describe("send-build: resolución del programa dueño real", () => {
  it("acepta el mint clásico de USDC", async () => {
    const rpc = fakeRpc({
      owners: { [USDC_MINT]: TOKEN_PROGRAM_ID },
    });
    const program = await resolveTokenProgram(rpc, new PublicKey(USDC_MINT), "usdc");
    expect(program.toBase58()).toBe(TOKEN_PROGRAM_ID.toBase58());
  });

  it("acepta un mint Token-2022 para acciones", async () => {
    const rpc = fakeRpc({
      owners: { [AAPL_MINT]: TOKEN_2022_PROGRAM_ID },
    });
    const program = await resolveTokenProgram(rpc, new PublicKey(AAPL_MINT), "stock");
    expect(program.toBase58()).toBe(TOKEN_2022_PROGRAM_ID.toBase58());
  });

  it.each([
    ["USDC con dueño Token-2022", USDC_MINT, TOKEN_2022_PROGRAM_ID, "usdc" as const],
    ["acción con dueño clásico", AAPL_MINT, TOKEN_PROGRAM_ID, "stock" as const],
    ["mint con programa desconocido", AAPL_MINT, SystemProgram.programId, "stock" as const],
  ])("falla cerrado: %s", async (_label, mint, ownerProgram, kind) => {
    const rpc = fakeRpc({ owners: { [mint]: ownerProgram } });
    await expect(resolveTokenProgram(rpc, new PublicKey(mint), kind)).rejects.toMatchObject({
      name: "DomainError",
      code: "MINT_NOT_ALLOWED",
    });
  });

  it("falla cerrado si el mint no existe", async () => {
    const rpc = fakeRpc({ owners: { [USDC_MINT]: null } });
    await expect(resolveTokenProgram(rpc, new PublicKey(USDC_MINT), "usdc")).rejects.toMatchObject({
      code: "MINT_NOT_ALLOWED",
    });
  });

  it("falla cerrado si el RPC no responde", async () => {
    const rpc = fakeRpc({
      owners: { [USDC_MINT]: TOKEN_PROGRAM_ID },
      throwOnAccount: new Set([USDC_MINT]),
    });
    await expect(resolveTokenProgram(rpc, new PublicKey(USDC_MINT), "usdc")).rejects.toMatchObject({
      code: "UPSTREAM",
    });
  });
});

describe("send-build: instrucciones y bytes", () => {
  it("arma ATA, create-idempotente y transferencia clásicas", () => {
    const built = buildSendInstructions({
      mint: new PublicKey(USDC_MINT),
      owner,
      to,
      rawAmount: BigInt(1_000_000),
      programId: TOKEN_PROGRAM_ID,
    });

    expect(built.source.toBase58()).toBe(usdcSource);
    expect(built.destination.toBase58()).toBe(usdcDestination);
    expect(built.instructions[0]?.programId.equals(ASSOCIATED_TOKEN_PROGRAM_ID)).toBe(true);
    expect(Buffer.from(built.instructions[0]?.data ?? []).toString("hex")).toBe("01");
    expect(built.instructions[0]?.keys.at(-1)?.pubkey.equals(TOKEN_PROGRAM_ID)).toBe(true);
    expect(built.instructions[1]?.programId.equals(TOKEN_PROGRAM_ID)).toBe(true);
    expect(Buffer.from(built.instructions[1]?.data ?? []).toString("hex")).toBe(
      "0340420f0000000000",
    );
  });

  it("arma ATA, create-idempotente y transferencia Token-2022", () => {
    const built = buildSendInstructions({
      mint: new PublicKey(AAPL_MINT),
      owner,
      to,
      rawAmount: BigInt(100_000_000),
      programId: TOKEN_2022_PROGRAM_ID,
    });

    expect(built.source.toBase58()).toBe(aaplSource);
    expect(built.destination.toBase58()).toBe(aaplDestination);
    expect(built.instructions[0]?.keys.at(-1)?.pubkey.equals(TOKEN_2022_PROGRAM_ID)).toBe(true);
    expect(built.instructions[1]?.programId.equals(TOKEN_2022_PROGRAM_ID)).toBe(true);
    expect(Buffer.from(built.instructions[1]?.data ?? []).toString("hex")).toBe(
      "0300e1f50500000000",
    );
  });

  it("rechaza un programa que no sea clásico ni Token-2022", () => {
    expect(() =>
      buildSendInstructions({
        mint: new PublicKey(USDC_MINT),
        owner,
        to,
        rawAmount: BigInt(1),
        programId: SystemProgram.programId,
      }),
    ).toThrow(/Programa de token no permitido/);
  });

  it("rechaza monto cero antes de codificar", () => {
    expect(() =>
      buildSendInstructions({
        mint: new PublicKey(USDC_MINT),
        owner,
        to,
        rawAmount: BigInt(0),
        programId: TOKEN_PROGRAM_ID,
      }),
    ).toThrow(/mayor que cero/);
  });
});

describe("send-build: transacción compilada", () => {
  it("usa el programa clásico en una transferencia USDC", async () => {
    const rpc = fakeRpc({
      owners: {
        [USDC_MINT]: TOKEN_PROGRAM_ID,
        [usdcSource]: TOKEN_PROGRAM_ID,
        [usdcDestination]: TOKEN_PROGRAM_ID,
      },
      balances: { [usdcSource]: "1000000" },
    });
    const built = await buildSendTransaction({
      connection: rpc,
      mint: new PublicKey(USDC_MINT),
      kind: "usdc",
      owner,
      to,
      rawAmount: BigInt(1_000_000),
      recentBlockhash: BLOCKHASH,
    });

    expect(built.programId.equals(TOKEN_PROGRAM_ID)).toBe(true);
    expect(compiledPrograms(built.transactionBase64)).toEqual([
      ASSOCIATED_TOKEN_PROGRAM_ID.toBase58(),
      TOKEN_PROGRAM_ID.toBase58(),
    ]);
  });

  it("usa Token-2022 en una transferencia de acciones", async () => {
    const rpc = fakeRpc({
      owners: {
        [AAPL_MINT]: TOKEN_2022_PROGRAM_ID,
        [aaplSource]: TOKEN_2022_PROGRAM_ID,
        [aaplDestination]: TOKEN_2022_PROGRAM_ID,
      },
      balances: { [aaplSource]: "100000000" },
    });
    const built = await buildSendTransaction({
      connection: rpc,
      mint: new PublicKey(AAPL_MINT),
      kind: "stock",
      owner,
      to,
      rawAmount: BigInt(100_000_000),
      recentBlockhash: BLOCKHASH,
    });

    expect(built.programId.equals(TOKEN_2022_PROGRAM_ID)).toBe(true);
    expect(compiledPrograms(built.transactionBase64)).toEqual([
      ASSOCIATED_TOKEN_PROGRAM_ID.toBase58(),
      TOKEN_2022_PROGRAM_ID.toBase58(),
    ]);
  });

  it("permite crear la ATA de destino si todavía no existe", async () => {
    const rpc = fakeRpc({
      owners: {
        [USDC_MINT]: TOKEN_PROGRAM_ID,
        [usdcSource]: TOKEN_PROGRAM_ID,
      },
      balances: { [usdcSource]: "1000000" },
    });
    const built = await buildSendTransaction({
      connection: rpc,
      mint: new PublicKey(USDC_MINT),
      kind: "usdc",
      owner,
      to,
      rawAmount: BigInt(1_000_000),
      recentBlockhash: BLOCKHASH,
    });
    expect(built.destination.toBase58()).toBe(usdcDestination);
  });

  it("falla si el mint no coincide con el programa del catálogo", async () => {
    const rpc = fakeRpc({
      owners: {
        [AAPL_MINT]: TOKEN_PROGRAM_ID,
        [aaplSource]: TOKEN_PROGRAM_ID,
      },
      balances: { [aaplSource]: "100000000" },
    });
    await expect(
      buildSendTransaction({
        connection: rpc,
        mint: new PublicKey(AAPL_MINT),
        kind: "stock",
        owner,
        to,
        rawAmount: BigInt(100_000_000),
        recentBlockhash: BLOCKHASH,
      }),
    ).rejects.toMatchObject({ code: "MINT_NOT_ALLOWED" });
  });

  it("falla si la cuenta de origen pertenece a otro programa", async () => {
    const rpc = fakeRpc({
      owners: {
        [AAPL_MINT]: TOKEN_2022_PROGRAM_ID,
        [aaplSource]: TOKEN_PROGRAM_ID,
      },
      balances: { [aaplSource]: "100000000" },
    });
    await expect(
      buildSendTransaction({
        connection: rpc,
        mint: new PublicKey(AAPL_MINT),
        kind: "stock",
        owner,
        to,
        rawAmount: BigInt(100_000_000),
        recentBlockhash: BLOCKHASH,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("falla si la cuenta de destino pertenece a otro programa", async () => {
    const rpc = fakeRpc({
      owners: {
        [AAPL_MINT]: TOKEN_2022_PROGRAM_ID,
        [aaplSource]: TOKEN_2022_PROGRAM_ID,
        [aaplDestination]: TOKEN_PROGRAM_ID,
      },
      balances: { [aaplSource]: "100000000" },
    });
    await expect(
      buildSendTransaction({
        connection: rpc,
        mint: new PublicKey(AAPL_MINT),
        kind: "stock",
        owner,
        to,
        rawAmount: BigInt(100_000_000),
        recentBlockhash: BLOCKHASH,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("falla si no existe la cuenta de origen o el saldo es insuficiente", async () => {
    const missing = fakeRpc({
      owners: { [USDC_MINT]: TOKEN_PROGRAM_ID },
    });
    await expect(
      buildSendTransaction({
        connection: missing,
        mint: new PublicKey(USDC_MINT),
        kind: "usdc",
        owner,
        to,
        rawAmount: BigInt(1),
        recentBlockhash: BLOCKHASH,
      }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_FUNDS" });

    const low = fakeRpc({
      owners: {
        [USDC_MINT]: TOKEN_PROGRAM_ID,
        [usdcSource]: TOKEN_PROGRAM_ID,
      },
      balances: { [usdcSource]: "1" },
    });
    await expect(
      buildSendTransaction({
        connection: low,
        mint: new PublicKey(USDC_MINT),
        kind: "usdc",
        owner,
        to,
        rawAmount: BigInt(2),
        recentBlockhash: BLOCKHASH,
      }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_FUNDS" });
  });

  it("falla cerrado si el RPC no entrega el saldo", async () => {
    const rpc = fakeRpc({
      owners: {
        [USDC_MINT]: TOKEN_PROGRAM_ID,
        [usdcSource]: TOKEN_PROGRAM_ID,
      },
      throwOnBalance: new Set([usdcSource]),
    });
    await expect(
      buildSendTransaction({
        connection: rpc,
        mint: new PublicKey(USDC_MINT),
        kind: "usdc",
        owner,
        to,
        rawAmount: BigInt(1),
        recentBlockhash: BLOCKHASH,
      }),
    ).rejects.toMatchObject({ code: "UPSTREAM" });
  });
});
