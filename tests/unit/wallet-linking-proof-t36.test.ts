import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { DomainError } from "@/lib/api/result";
import { assertPrivyEmailConsistency } from "@/lib/services/wallet.supabase";
import { planPrivyWalletBinding } from "@/lib/wallet/identity";
import {
  assertWalletLinkingOpen,
  WALLET_LINKING_LOCKED_MESSAGE,
  walletLinkingLocked,
} from "@/lib/wallet/linking-policy";
import {
  hasWalletLinkingProof,
  isWellFormedWalletLinkingProof,
  type WalletLinkingProof,
} from "@/lib/wallet/linking-proof";

/**
 * Paso 2: la prueba de posesión ya no es un tipo vacío.
 *
 * - La forma se valida sin criptografía (nonce de 43 y firma base58 de 64 B).
 * - Con identidad Supabase, sin prueba declarada no se abre la vinculación;
 *   con la forma correcta se permite INTENTAR la verificación real, que hace
 *   el servicio (consumo atómico + ed25519). Una prueba bien formada no
 *   autoriza por sí sola.
 * - El correo de Privy, si existe, tiene que coincidir con el de Supabase.
 * - Una billetera o un DID ya vinculados a otra cuenta no se reasignan.
 */

const FULL_PROOF: WalletLinkingProof = {
  nonce: "a".repeat(43),
  signature: "1".repeat(87),
};

function useSupabaseAuth(): void {
  vi.stubEnv("AUTH_MODE", "supabase");
  vi.stubEnv("NEXT_PUBLIC_AUTH_MODE", "supabase");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-test");
}

function useMockAuth(): void {
  vi.stubEnv("AUTH_MODE", "mock");
  vi.stubEnv("NEXT_PUBLIC_AUTH_MODE", "mock");
}

function sourceOf(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

function codeOf(call: () => void): string {
  try {
    call();
    return "no-error";
  } catch (error) {
    return error instanceof DomainError ? error.code : "otro";
  }
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("forma de la prueba", () => {
  it("acepta un nonce de 32 bytes en base64url y una firma base58 de 64 bytes", () => {
    expect(isWellFormedWalletLinkingProof(FULL_PROOF)).toBe(true);
    expect(hasWalletLinkingProof(FULL_PROOF)).toBe(true);
  });

  it("rechaza nonce corto, firma no base58 o firma de otro tamaño", () => {
    expect(isWellFormedWalletLinkingProof({ ...FULL_PROOF, nonce: "corto" })).toBe(false);
    expect(isWellFormedWalletLinkingProof({ ...FULL_PROOF, signature: "0OIl" })).toBe(false);
    expect(isWellFormedWalletLinkingProof({ ...FULL_PROOF, signature: "1".repeat(40) })).toBe(false);
    expect(isWellFormedWalletLinkingProof(null)).toBe(false);
    expect(isWellFormedWalletLinkingProof("firma-suelta")).toBe(false);
  });
});

describe("política de vinculación", () => {
  it("Supabase sin prueba queda cerrado", () => {
    useSupabaseAuth();
    expect(walletLinkingLocked()).toBe(true);
    expect(codeOf(() => assertWalletLinkingOpen())).toBe("REAL_DISABLED");
    try {
      assertWalletLinkingOpen();
    } catch (error) {
      expect((error as DomainError).message).toBe(WALLET_LINKING_LOCKED_MESSAGE);
    }
  });

  it("Supabase con prueba bien formada permite intentar la verificación (no autoriza sola)", () => {
    useSupabaseAuth();
    expect(walletLinkingLocked(FULL_PROOF)).toBe(false);
    expect(() => assertWalletLinkingOpen(FULL_PROOF)).not.toThrow();
  });

  it("la demo no queda bloqueada", () => {
    useMockAuth();
    expect(walletLinkingLocked()).toBe(false);
    expect(() => assertWalletLinkingOpen()).not.toThrow();
  });
});

describe("estructura: la firma no se puede saltar", () => {
  it("la ruta exige la prueba antes de llamar al servicio y le pasa nonce/firma/dominio", () => {
    const source = sourceOf("app/api/me/wallet/route.ts");
    expect(source).toMatch(/assertWalletLinkingOpen\(proof\)/);
    expect(source).toMatch(/proof,/);
    expect(source).toMatch(/domain,/);
    expect(source).toMatch(/walletLinkDomainOf\(req\)/);
  });

  it("el servicio delega en la vinculación con desafío, no en el mock", () => {
    const source = sourceOf("lib/services/wallet.supabase.ts");
    expect(source).toMatch(/linkVerifiedPrivyWallet/);
    expect(source).toMatch(/consumeWalletLinkChallenge/);
    expect(source).toMatch(/verifyWalletLinkSignature/);
    expect(source).toMatch(/fetchPrivyLinkedIdentity/);
  });
});

describe("correo de Privy vs Supabase", () => {
  it("coincide normalizado", () => {
    expect(() =>
      assertPrivyEmailConsistency(["Equipo@Maverlang.cl"], "equipo@maverlang.cl"),
    ).not.toThrow();
  });

  it("un correo distinto se rechaza", () => {
    expect(() =>
      assertPrivyEmailConsistency(["otra@persona.cl"], "equipo@maverlang.cl"),
    ).toThrow(/no coincide/i);
  });

  it("sin correo en Privy no hay nada que comparar", () => {
    expect(() => assertPrivyEmailConsistency([], "equipo@maverlang.cl")).not.toThrow();
  });
});

describe("billetera o DID ya vinculados a otra cuenta", () => {
  const base = {
    userId: "11111111-1111-4111-8111-111111111111",
    privyUserId: "did:privy:abc",
    address: "So11111111111111111111111111111111111111112",
    byPrivyUser: null,
    byAddress: null,
    userRows: [],
  } as const;

  it("una dirección de otra cuenta se rechaza", () => {
    expect(
      codeOf(() =>
        planPrivyWalletBinding({
          ...base,
          byAddress: { userId: "otra-cuenta", address: base.address, privyUserId: null },
        }),
      ),
    ).toBe("VALIDATION");
  });

  it("un DID de otra cuenta se rechaza", () => {
    expect(
      codeOf(() =>
        planPrivyWalletBinding({
          ...base,
          byPrivyUser: {
            userId: "otra-cuenta",
            address: "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin",
            privyUserId: base.privyUserId,
          },
        }),
      ),
    ).toBe("VALIDATION");
  });
});
