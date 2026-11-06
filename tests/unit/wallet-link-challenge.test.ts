import { generateKeyPairSync, sign as signBytes } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { encodeBase58, isValidSolanaAddress } from "@/lib/solana/address";
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  buildWalletLinkMessage,
  createWalletLinkNonce,
  normalizeWalletLinkDomain,
  verifyWalletLinkSignature,
  walletLinkDomainOf,
  walletLinkNonceHash,
  WALLET_LINK_PURPOSE,
  WALLET_LINK_TTL_MS,
} from "@/lib/wallet/link-challenge";
import { consumeWalletLinkChallenge } from "@/lib/wallet/link-challenge-store";

/**
 * Desafío de vinculación: mensaje exacto, ataduras, firma ed25519 y consumo
 * de un solo uso. Sin red, sin Supabase real y sin `.env`.
 */

function ed25519Identity(): { address: string; sign: (message: string) => string } {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const der = publicKey.export({ type: "spki", format: "der" });
  const raw = new Uint8Array(der.subarray(der.length - 32));
  const address = encodeBase58(raw);
  return {
    address,
    sign: (message: string) =>
      encodeBase58(new Uint8Array(signBytes(null, Buffer.from(message, "utf8"), privateKey))),
  };
}

const IDENTITY = ed25519Identity();
const NONCE = createWalletLinkNonce();
const BASE = {
  domain: "maverlang.cl",
  userId: "11111111-1111-4111-8111-111111111111",
  privyUserId: "did:privy:cm-test-identity",
  address: IDENTITY.address,
  nonce: NONCE,
  issuedAt: "2026-11-06T00:00:00.000Z",
  expiresAt: "2026-11-06T00:05:00.000Z",
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("mensaje canónico: ata usuario, DID, billetera, cadena, dominio, propósito y vigencia", () => {
  it("incluye cada dato y la billetera de prueba es una dirección válida", () => {
    expect(isValidSolanaAddress(IDENTITY.address)).toBe(true);
    const message = buildWalletLinkMessage(BASE);
    for (const value of [
      BASE.domain,
      BASE.userId,
      BASE.privyUserId,
      BASE.address,
      BASE.nonce,
      BASE.issuedAt,
      BASE.expiresAt,
      WALLET_LINK_PURPOSE,
      "solana",
    ]) {
      expect(message).toContain(value);
    }
  });

  it("cambiar cualquier dato cambia el mensaje exacto", () => {
    const original = buildWalletLinkMessage(BASE);
    const variants = [
      { ...BASE, domain: "evil.example" },
      { ...BASE, userId: "22222222-2222-4222-8222-222222222222" },
      { ...BASE, privyUserId: "did:privy:otro" },
      { ...BASE, address: ed25519Identity().address },
      { ...BASE, nonce: createWalletLinkNonce() },
      { ...BASE, issuedAt: "2026-11-06T00:00:01.000Z" },
      { ...BASE, expiresAt: "2026-11-06T00:05:01.000Z" },
    ];
    for (const variant of variants) {
      expect(buildWalletLinkMessage(variant)).not.toBe(original);
    }
  });

  it("rechaza un DID con salto de línea (no se pueden inyectar líneas)", () => {
    expect(() =>
      buildWalletLinkMessage({ ...BASE, privyUserId: "did:privy:uno\nBilletera: otra" }),
    ).toThrow();
  });

  it("rechaza nonce, usuario, dirección o fechas mal formadas", () => {
    expect(() => buildWalletLinkMessage({ ...BASE, nonce: "corto" })).toThrow();
    expect(() => buildWalletLinkMessage({ ...BASE, userId: "no-es-uuid" })).toThrow();
    expect(() => buildWalletLinkMessage({ ...BASE, address: "no-es-direccion" })).toThrow();
    expect(() => buildWalletLinkMessage({ ...BASE, expiresAt: "mañana" })).toThrow();
  });
});

describe("firma ed25519", () => {
  it("acepta la firma de la billetera sobre el mensaje exacto", () => {
    const message = buildWalletLinkMessage(BASE);
    const signature = IDENTITY.sign(message);
    expect(verifyWalletLinkSignature({ message, address: IDENTITY.address, signature })).toBe(true);
  });

  it("rechaza otro mensaje, otra billetera u otra firma", () => {
    const message = buildWalletLinkMessage(BASE);
    const signature = IDENTITY.sign(message);
    const other = ed25519Identity();
    expect(
      verifyWalletLinkSignature({ message: `${message} `, address: IDENTITY.address, signature }),
    ).toBe(false);
    expect(
      verifyWalletLinkSignature({ message, address: other.address, signature }),
    ).toBe(false);
    expect(
      verifyWalletLinkSignature({
        message,
        address: IDENTITY.address,
        signature: other.sign(message),
      }),
    ).toBe(false);
  });

  it("rechaza firmas mal formadas sin lanzar", () => {
    const message = buildWalletLinkMessage(BASE);
    for (const signature of ["", "0OIl", "x".repeat(88), "1".repeat(87)]) {
      expect(verifyWalletLinkSignature({ message, address: IDENTITY.address, signature })).toBe(false);
    }
  });

  it("un mensaje de otro dominio no valida la firma del mensaje original", () => {
    const signature = IDENTITY.sign(buildWalletLinkMessage(BASE));
    const otherDomain = buildWalletLinkMessage({ ...BASE, domain: "evil.example" });
    expect(
      verifyWalletLinkSignature({ message: otherDomain, address: IDENTITY.address, signature }),
    ).toBe(false);
  });
});

describe("nonce y dominio", () => {
  it("el nonce es aleatorio, base64url de 32 bytes, y el hash es sha256 hex", () => {
    const a = createWalletLinkNonce();
    const b = createWalletLinkNonce();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
    expect(walletLinkNonceHash(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(walletLinkNonceHash(a)).toBe(walletLinkNonceHash(a));
    expect(walletLinkNonceHash(a)).not.toBe(walletLinkNonceHash(b));
  });

  it("normaliza el dominio y rechaza esquemas, rutas y espacios", () => {
    expect(normalizeWalletLinkDomain("Maverlang.CL:443")).toBe("maverlang.cl:443");
    expect(normalizeWalletLinkDomain("https://maverlang.cl")).toBeNull();
    expect(normalizeWalletLinkDomain("maverlang.cl/app")).toBeNull();
    expect(normalizeWalletLinkDomain(" mave rlang.cl ")).toBeNull();
    expect(normalizeWalletLinkDomain("")).toBeNull();
  });

  it("usa NEXT_PUBLIC_SITE_URL antes que el host de la petición", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://app.maverlang.cl");
    const request = new Request("http://evil.example/api/me/wallet/challenge", {
      headers: { host: "evil.example" },
    });
    expect(walletLinkDomainOf(request)).toBe("app.maverlang.cl");
  });

  it("vence a los 5 minutos por diseño", () => {
    expect(WALLET_LINK_TTL_MS).toBe(5 * 60_000);
  });
});

/* --- Consumo atómico: tabla falsa que imita el UPDATE condicional --- */

interface ChallengeRow {
  nonce_hash: string;
  user_id: string;
  privy_user_id: string;
  address: string;
  chain: string;
  domain: string;
  purpose: string;
  message: string;
  issued_at: string;
  expires_at: string;
  consumed_at: string | null;
}

type Filter = (row: ChallengeRow) => boolean;

function fakeChallengeTable(rows: ChallengeRow[]) {
  const admin = {
    from(table: string) {
      expect(table).toBe("wallet_link_challenges");
      return {
        update(values: Partial<ChallengeRow>) {
          const filters: Filter[] = [];
          const builder = {
            eq(column: keyof ChallengeRow, value: unknown) {
              filters.push((row) => row[column] === value);
              return builder;
            },
            is(column: keyof ChallengeRow, value: unknown) {
              filters.push((row) => row[column] === value);
              return builder;
            },
            gt(column: keyof ChallengeRow, value: unknown) {
              filters.push((row) => (row[column] as string) > (value as string));
              return builder;
            },
            select() {
              return builder;
            },
            maybeSingle() {
              // Check-and-set síncrono: el segundo UPDATE ya ve consumed_at.
              const row = rows.find((candidate) => filters.every((filter) => filter(candidate)));
              if (!row) return Promise.resolve({ data: null, error: null });
              Object.assign(row, values);
              return Promise.resolve({
                data: { message: row.message, issued_at: row.issued_at, expires_at: row.expires_at },
                error: null,
              });
            },
          };
          return builder;
        },
      };
    },
  };
  return admin as unknown as ReturnType<typeof createSupabaseAdminClient>;
}

function challengeRow(overrides: Partial<ChallengeRow> = {}): ChallengeRow {
  return {
    nonce_hash: walletLinkNonceHash(NONCE),
    user_id: BASE.userId,
    privy_user_id: BASE.privyUserId,
    address: BASE.address,
    chain: "solana",
    domain: BASE.domain,
    purpose: WALLET_LINK_PURPOSE,
    message: buildWalletLinkMessage(BASE),
    issued_at: BASE.issuedAt,
    expires_at: BASE.expiresAt,
    consumed_at: null,
    ...overrides,
  };
}

const CONSUME = {
  nonce: NONCE,
  userId: BASE.userId,
  privyUserId: BASE.privyUserId,
  address: BASE.address,
  domain: BASE.domain,
  now: new Date("2026-11-06T00:01:00.000Z"),
};

describe("consumo del desafío: un solo uso y ataduras exactas", () => {
  it("el primer consumo devuelve el mensaje y marca consumed_at", async () => {
    const row = challengeRow();
    const result = await consumeWalletLinkChallenge(fakeChallengeTable([row]), CONSUME);
    expect(result?.message).toBe(buildWalletLinkMessage(BASE));
    expect(row.consumed_at).not.toBeNull();
  });

  it("el segundo intento con el mismo nonce falla (replay)", async () => {
    const row = challengeRow();
    const admin = fakeChallengeTable([row]);
    expect(await consumeWalletLinkChallenge(admin, CONSUME)).not.toBeNull();
    expect(await consumeWalletLinkChallenge(admin, CONSUME)).toBeNull();
  });

  it("dos consumos concurrentes: sólo uno gana", async () => {
    const row = challengeRow();
    const admin = fakeChallengeTable([row]);
    const results = await Promise.all([
      consumeWalletLinkChallenge(admin, CONSUME),
      consumeWalletLinkChallenge(admin, CONSUME),
    ]);
    expect(results.filter((result) => result !== null)).toHaveLength(1);
  });

  it("un desafío vencido no se consume", async () => {
    const row = challengeRow();
    const result = await consumeWalletLinkChallenge(fakeChallengeTable([row]), {
      ...CONSUME,
      now: new Date("2026-11-06T00:06:00.000Z"),
    });
    expect(result).toBeNull();
    expect(row.consumed_at).toBeNull();
  });

  it("no se consume con otro usuario, DID, dirección, dominio ni propósito", async () => {
    const cases = [
      { userId: "22222222-2222-4222-8222-222222222222" },
      { privyUserId: "did:privy:otro" },
      { address: ed25519Identity().address },
      { domain: "evil.example" },
    ];
    for (const mismatch of cases) {
      const row = challengeRow();
      expect(await consumeWalletLinkChallenge(fakeChallengeTable([row]), { ...CONSUME, ...mismatch })).toBeNull();
      expect(row.consumed_at).toBeNull();
    }
    // El propósito no es un parámetro: la fila con otro propósito no coincide.
    const row = challengeRow({ purpose: "otro_flujo" });
    expect(await consumeWalletLinkChallenge(fakeChallengeTable([row]), CONSUME)).toBeNull();
  });
});
