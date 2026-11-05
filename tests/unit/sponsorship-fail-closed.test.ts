import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";

import {
  DEFAULT_SPONSOR_PROGRAMS,
  KMS_REQUIRED_SPONSOR,
  SponsorError,
  authorizeAndSponsor,
  loadSponsorshipConfigFromEnv,
  readSponsorTransactionBinding,
  validateSponsorTransaction,
  verifySponsorSignature,
  type SponsorAbuseLimits,
  type SponsorDescriptor,
  type SponsorKms,
  type SponsorReservation,
  type SponsorUsageStore,
  type SponsorshipConfig,
  type SponsorshipRequest,
} from "@/lib/solana/sponsor";

/**
 * T37: fail-closed del patrocinio con un firmante FALSO en memoria.
 *
 * - Nunca se usa una clave real, ni `.env`, ni un RPC, ni mainnet: las claves
 *   son `Keypair.generate()` del clúster de prueba en el propio proceso.
 * - Se comprueba que sin flag, sin KMS o sin cupo NINGUNA transacción sale
 *   firmada por el sponsor.
 * - `verifySponsorSignature` debe seguir rechazando un mensaje distinto al
 *   firmado: el fee-payer sólo puede firmar el hash que recibió.
 */

const ROOT = path.resolve(__dirname, "..", "..");

const LIMITS: SponsorAbuseLimits = {
  maxPerUserPerHour: 1,
  maxPerUserPerDay: 5,
  maxPerSponsorPerDay: 50,
  maxLamportsPerUserPerDay: 1_000_000,
  maxLamportsPerSponsorPerDay: 5_000_000,
  cooldownMs: 0,
};

function buildTransaction(
  sponsor: Keypair,
  user: Keypair,
  recipient: PublicKey,
): VersionedTransaction {
  const message = new TransactionMessage({
    payerKey: sponsor.publicKey,
    // Blockhash de prueba: cualquier dirección base58 válida sirve para
    // validar la forma; no se consulta la red.
    recentBlockhash: Keypair.generate().publicKey.toBase58(),
    instructions: [
      SystemProgram.transfer({ fromPubkey: user.publicKey, toPubkey: recipient, lamports: 1 }),
    ],
  }).compileToV0Message();
  const transaction = new VersionedTransaction(message);
  // El usuario firma; la ranura 0 (sponsor) queda en ceros a propósito.
  transaction.sign([user]);
  return transaction;
}

function base64(tx: VersionedTransaction): string {
  return Buffer.from(tx.serialize()).toString("base64");
}

function descriptorFor(sponsor: Keypair, limits: SponsorAbuseLimits = LIMITS): SponsorDescriptor {
  return {
    id: "acme",
    displayName: "Acme",
    feePayer: sponsor.publicKey.toBase58(),
    enabled: true,
    clusters: ["devnet"],
    maxFeeLamports: 100_000,
    consentVersion: "v1",
    limits,
  };
}

function configFor(sponsor: SponsorDescriptor, enabled = true): SponsorshipConfig {
  return {
    enabled,
    // Cluster de prueba. Nunca mainnet-beta.
    cluster: "devnet",
    sponsors: enabled ? [sponsor] : [],
    maxFeeLamports: 10_000_000,
    maxTransactionBytes: 1_232,
    maxSignatures: 2,
    maxInstructions: 32,
    maxAccounts: 64,
    maxComputeUnits: 1_400_000,
    allowedPrograms: DEFAULT_SPONSOR_PROGRAMS,
  };
}

function requestFor(
  tx: VersionedTransaction,
  input: { sponsorId: string; wallet: string },
  overrides: Partial<SponsorshipRequest> = {},
): SponsorshipRequest {
  const binding = readSponsorTransactionBinding(base64(tx));
  return {
    requestId: "req-1",
    sponsorId: input.sponsorId,
    userId: "user-1",
    walletAddress: input.wallet,
    consent: {
      accepted: true,
      sponsorId: input.sponsorId,
      version: "v1",
      acceptedAt: new Date(Date.now() - 60_000).toISOString(),
    },
    transactionBase64: base64(tx),
    expectedRecentBlockhash: binding.recentBlockhash,
    expectedMessageSha256: binding.messageSha256,
    ...overrides,
  };
}

/** Firmante falso: valida el hash que recibe y firma SÓLO el sponsor. */
function fakeSigner(sponsor: Keypair): SponsorKms & { calls: number } {
  const signer = {
    calls: 0,
    feePayer: sponsor.publicKey.toBase58(),
    async signFeePayer(input: { transactionBase64: string; messageSha256: string }) {
      signer.calls += 1;
      const tx = VersionedTransaction.deserialize(Buffer.from(input.transactionBase64, "base64"));
      const hash = createHash("sha256").update(tx.message.serialize()).digest("hex");
      if (hash !== input.messageSha256) {
        throw new SponsorError("SPONSOR_TRANSACTION_INVALID");
      }
      tx.sign([sponsor]);
      return { signedTransactionBase64: base64(tx) };
    },
  };
  return signer;
}

class MemoryQuota implements SponsorUsageStore {
  calls = 0;
  releaseCalls = 0;
  private used = 0;

  async reserve(input: SponsorReservation) {
    if (this.used + 1 > input.limits.maxPerUserPerHour) {
      return { allowed: false as const, code: "SPONSOR_LIMIT_EXCEEDED" as const };
    }
    this.used += 1;
    this.calls += 1;
    return { allowed: true as const, remaining: input.limits.maxPerUserPerDay - this.used };
  }

  async release() {
    this.releaseCalls += 1;
    this.used = Math.max(0, this.used - 1);
  }
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof SponsorError) return error.code;
    throw error;
  }
  throw new Error("esperaba un SponsorError y no hubo error");
}

function hasSignature(signature: Uint8Array | undefined): boolean {
  return Boolean(signature) && signature !== undefined && signature.some((byte) => byte !== 0);
}

describe("T37: patrocinio fail-closed con firmante falso", () => {
  const sponsor = Keypair.generate();
  const user = Keypair.generate();
  const recipient = Keypair.generate().publicKey;
  const otherRecipient = Keypair.generate().publicKey;
  const sponsorDescriptor = descriptorFor(sponsor);

  it("flag apagado: no se firma nada", async () => {
    const signer = fakeSigner(sponsor);
    const quota = new MemoryQuota();
    const code = await codeOf(
      authorizeAndSponsor(requestFor(buildTransaction(sponsor, user, recipient), {
        sponsorId: "acme",
        wallet: user.publicKey.toBase58(),
      }), {
        config: configFor(sponsorDescriptor, false),
        usage: quota,
        signer,
      }),
    );
    expect(code).toBe("SPONSOR_DISABLED");
    expect(signer.calls).toBe(0);
    expect(quota.calls).toBe(0);
  });

  it("sin sponsor registrado tampoco se firma", async () => {
    const signer = fakeSigner(sponsor);
    const enabledWithoutSponsors: SponsorshipConfig = {
      ...configFor(sponsorDescriptor, true),
      sponsors: [],
    };
    const code = await codeOf(
      authorizeAndSponsor(requestFor(buildTransaction(sponsor, user, recipient), {
        sponsorId: "acme",
        wallet: user.publicKey.toBase58(),
      }), { config: enabledWithoutSponsors, usage: new MemoryQuota(), signer }),
    );
    expect(code).toBe("SPONSOR_NOT_CONFIGURED");
    expect(signer.calls).toBe(0);
  });

  it("sin KMS: ni el stub ni un firmante nulo producen una firma del sponsor", async () => {
    const request = requestFor(buildTransaction(sponsor, user, recipient), {
      sponsorId: "acme",
      wallet: user.publicKey.toBase58(),
    });

    expect(
      await codeOf(
        authorizeAndSponsor(request, {
          config: configFor(sponsorDescriptor),
          usage: new MemoryQuota(),
          signer: null,
        }),
      ),
    ).toBe("SPONSOR_SIGNER_UNAVAILABLE");

    // El stub tiene feePayer vacío: se rechaza antes de intentar firmar.
    expect(
      await codeOf(
        authorizeAndSponsor(request, {
          config: configFor(sponsorDescriptor),
          usage: new MemoryQuota(),
          signer: KMS_REQUIRED_SPONSOR,
        }),
      ),
    ).toBe("SPONSOR_KEY_MISMATCH");
  });

  it("el stub de kms.ts sigue fallando y no contiene material de clave", async () => {
    await expect(
      KMS_REQUIRED_SPONSOR.signFeePayer({
        transactionBase64: "AA==",
        sponsorFeePayer: "",
        messageSha256: "0".repeat(64),
      }),
    ).rejects.toMatchObject({ code: "SPONSOR_KMS_REQUIRED" });
    expect(KMS_REQUIRED_SPONSOR.feePayer).toBe("");

    const kmsSource = readFileSync(path.join(ROOT, "lib/solana/sponsorship/kms.ts"), "utf8");
    expect(kmsSource).not.toMatch(/privateKey|secretKey|mnemonic|BEGIN PRIVATE KEY/i);
    const storeSource = readFileSync(
      path.join(ROOT, "lib/solana/sponsorship/usage-store.ts"),
      "utf8",
    );
    expect(storeSource).not.toMatch(/privateKey|secretKey|mnemonic|BEGIN PRIVATE KEY/i);
    // No hay ningún sponsor registrado por defecto (ni de mainnet).
    expect(loadSponsorshipConfigFromEnv().sponsors).toEqual([]);
  });

  it("una transacción con cupo agotado se rechaza y no lleva firma del sponsor", async () => {
    const quota = new MemoryQuota();
    const signer = fakeSigner(sponsor);
    const config = configFor(sponsorDescriptor);

    const first = buildTransaction(sponsor, user, recipient);
    const firstResult = await authorizeAndSponsor(
      requestFor(first, { sponsorId: "acme", wallet: user.publicKey.toBase58() }, { requestId: "req-1" }),
      { config, usage: quota, signer },
    );
    expect(signer.calls).toBe(1);
    const signed = VersionedTransaction.deserialize(
      Buffer.from(firstResult.signedTransactionBase64, "base64"),
    );
    expect(hasSignature(signed.signatures[0])).toBe(true);
    // La firma del usuario no cambió.
    expect(Buffer.from(signed.signatures[1] ?? [])).toEqual(Buffer.from(first.signatures[1] ?? []));

    // Nueva transacción (mensaje distinto) con el mismo usuario: cupo 1/hora.
    const second = buildTransaction(sponsor, user, otherRecipient);
    const code = await codeOf(
      authorizeAndSponsor(
        requestFor(second, { sponsorId: "acme", wallet: user.publicKey.toBase58() }, { requestId: "req-2" }),
        { config, usage: quota, signer },
      ),
    );
    expect(code).toBe("SPONSOR_LIMIT_EXCEEDED");
    // El firmante se llamó UNA sola vez en todo el escenario.
    expect(signer.calls).toBe(1);
  });

  it("un KMS tramposo que firma otro mensaje no logra colar la transacción", async () => {
    const quota = new MemoryQuota();
    const other = buildTransaction(sponsor, user, otherRecipient);
    const cheatingSigner: SponsorKms = {
      feePayer: sponsor.publicKey.toBase58(),
      async signFeePayer() {
        other.sign([sponsor]);
        return { signedTransactionBase64: base64(other) };
      },
    };

    const code = await codeOf(
      authorizeAndSponsor(
        requestFor(buildTransaction(sponsor, user, recipient), {
          sponsorId: "acme",
          wallet: user.publicKey.toBase58(),
        }),
        { config: configFor(sponsorDescriptor), usage: quota, signer: cheatingSigner },
      ),
    );
    expect(code).toBe("SPONSOR_SIGNATURE_INVALID");
    // La reserva se libera cuando la firma no sirve.
    expect(quota.releaseCalls).toBe(1);
  });

  it("verifySponsorSignature acepta la firma correcta y rechaza un mensaje distinto", () => {
    const original = buildTransaction(sponsor, user, recipient);
    const validated = validateSponsorTransaction(base64(original), {
      sponsorFeePayer: sponsor.publicKey.toBase58(),
      userWallet: user.publicKey.toBase58(),
      expectedRecentBlockhash: readSponsorTransactionBinding(base64(original)).recentBlockhash,
      maxFeeLamports: 100_000,
      maxTransactionBytes: 1_232,
      maxSignatures: 2,
      maxInstructions: 32,
      maxAccounts: 64,
      maxComputeUnits: 1_400_000,
      allowedPrograms: DEFAULT_SPONSOR_PROGRAMS,
    });

    const legitimatelySigned = VersionedTransaction.deserialize(original.serialize());
    legitimatelySigned.sign([sponsor]);
    expect(() => verifySponsorSignature(base64(legitimatelySigned), validated)).not.toThrow();

    // Mismo fee-payer, mismos tamaños, OTRO mensaje firmado por el sponsor.
    const different = buildTransaction(sponsor, user, otherRecipient);
    different.sign([sponsor]);
    expect(() => verifySponsorSignature(base64(different), validated)).toThrowError(
      expect.objectContaining({ code: "SPONSOR_SIGNATURE_INVALID" }),
    );

    // Firma del sponsor basura: no valida.
    const randomSignature = VersionedTransaction.deserialize(original.serialize());
    randomSignature.signatures[0] = new Uint8Array(64).fill(7);
    expect(() => verifySponsorSignature(base64(randomSignature), validated)).toThrowError(
      expect.objectContaining({ code: "SPONSOR_SIGNATURE_INVALID" }),
    );

    // Cambiar la firma del usuario también se rechaza.
    const tamperedUser = VersionedTransaction.deserialize(legitimatelySigned.serialize());
    tamperedUser.signatures[1] = new Uint8Array(64).fill(9);
    expect(() => verifySponsorSignature(base64(tamperedUser), validated)).toThrowError(
      expect.objectContaining({ code: "SPONSOR_SIGNATURE_INVALID" }),
    );
  });
});
