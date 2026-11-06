import { generateKeyPairSync } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  assertDepositIdentityAllowed,
  depositEligibilityDecision,
  depositIdentityAllows,
  normalizeDepositEmail,
} from "@/lib/deposits/pilot";
import { issueWalletLinkChallenge, syncVerifiedPrivyWallet } from "@/lib/services/wallet.supabase";
import { USDC_DECIMALS, USDC_MINT_SOLANA } from "@/lib/wallet/deposit-indexer";
import {
  syncSolanaUsdcDeposits,
  type DepositSyncDeps,
  type ParsedTxLike,
} from "@/lib/wallet/deposit-sync";

/**
 * Depósitos USDC: identidad general (ya NO hay lista de correos).
 *
 * El nombre del archivo es histórico: antes probaba el piloto interno con
 * `DEPOSIT_ALLOWLIST_EMAILS`. Hoy fija la regla vigente:
 * - Cualquier cuenta registrada con el correo VERIFICADO en Supabase Auth
 *   (`email_confirmed_at`) es elegible. La variable eliminada no cambia nada.
 * - Correo ausente, mal formado, sin verificar o error de lectura → denegado
 *   (fail closed), sin gastar RPC ni acreditar.
 * - La vinculación de billetera conserva la prueba firmada: el correo
 *   verificado no reemplaza el desafío ni la firma ed25519.
 *
 * Sin red, sin Supabase real y sin `.env`: las dependencias del barrido se
 * inyectan y el correo verificado lo entrega el doble de pruebas.
 */

const WALLET = "11111111111111111111111111111111";
const USER = "user-deposito-1";
const VERIFIED_EMAIL = "Cuenta@Maverlang.Test";

function usdcBalance(accountIndex: number, owner: string, uiAmount: number) {
  return {
    accountIndex,
    mint: USDC_MINT_SOLANA,
    owner,
    uiTokenAmount: {
      uiAmount,
      amount: String(Math.round(uiAmount * 10 ** USDC_DECIMALS)),
      decimals: USDC_DECIMALS,
    },
  };
}

const TX: ParsedTxLike = {
  meta: {
    err: null,
    preTokenBalances: [usdcBalance(0, WALLET, 10)],
    postTokenBalances: [usdcBalance(0, WALLET, 35)],
  },
  transaction: { signatures: ["sig-deposito-1"] },
  blockTime: 1_700_000_000,
};

interface Probe {
  signatures: number;
  recorded: string[];
}

function deps(
  probe: Probe,
  overrides: Partial<DepositSyncDeps> = {},
): DepositSyncDeps {
  return {
    dataMode: () => "live",
    now: () => new Date("2026-11-06T12:00:00.000Z"),
    countWallets: async () => 1,
    listWallets: async () => [{ userId: USER, address: WALLET }],
    listOwnedTokenAccounts: async () => [],
    listSignatures: async () => {
      probe.signatures += 1;
      return ["sig-deposito-1"];
    },
    readTransactions: async () => ({
      transactions: [TX],
      statuses: [{ confirmationStatus: "confirmed", slot: 7, confirmations: 1, err: null }],
    }),
    listKnownSignatures: async () => [],
    verifiedEmailOf: async () => ({ email: VERIFIED_EMAIL, emailVerified: true }),
    recordDeposit: async (input) => {
      probe.recorded.push(input.signature);
      return "recorded";
    },
    log: () => {},
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("identidad de depósito: correo verificado, sin lista", () => {
  it("normaliza espacios y mayúsculas, y descarta entradas basura", () => {
    expect(normalizeDepositEmail("  Cualquiera@Dominio.CL ")).toBe("cualquiera@dominio.cl");
    expect(normalizeDepositEmail("sin-arroba")).toBeNull();
    expect(normalizeDepositEmail("a@b")).toBeNull();
    expect(normalizeDepositEmail("a@b.c,d@e.f")).toBeNull();
    expect(normalizeDepositEmail("")).toBeNull();
    expect(normalizeDepositEmail(null)).toBeNull();
  });

  it("cualquier correo verificado entra aunque la variable eliminada apunte a otro", () => {
    // La variable del piloto ya no existe en el código. Si alguien la dejara
    // puesta en el entorno, no debe cambiar la decisión.
    vi.stubEnv("DEPOSIT_ALLOWLIST_EMAILS", "otra@maverlang.test");
    expect(
      depositEligibilityDecision({ email: "Cualquiera@Dominio.CL", emailVerified: true }),
    ).toEqual({ allowed: true, reason: "verified" });

    vi.stubEnv("DEPOSIT_ALLOWLIST_EMAILS", "");
    expect(depositIdentityAllows({ email: "cualquiera@dominio.cl", emailVerified: true })).toBe(
      true,
    );
  });

  it("sin correo, correo inválido o sin verificar → denegado", () => {
    expect(depositEligibilityDecision({ email: null, emailVerified: true })).toEqual({
      allowed: false,
      reason: "missing_email",
    });
    expect(depositEligibilityDecision({ email: "sin-arroba", emailVerified: true }).reason).toBe(
      "missing_email",
    );
    expect(depositEligibilityDecision(null).reason).toBe("missing_email");
    expect(depositEligibilityDecision(undefined).reason).toBe("missing_email");
    expect(depositEligibilityDecision({ email: "x@y.cl", emailVerified: false }).reason).toBe(
      "email_not_verified",
    );
    expect(depositEligibilityDecision({ email: "x@y.cl" }).reason).toBe("email_not_verified");
    // Sólo `true` booleano cuenta: un string u otro truthy no habilita.
    expect(
      depositIdentityAllows({ email: "x@y.cl", emailVerified: "true" as unknown as boolean }),
    ).toBe(false);
  });

  it("la guardia lanza REAL_DISABLED y deja pasar al verificado", () => {
    expect(() =>
      assertDepositIdentityAllowed({ email: "x@y.cl", emailVerified: true }),
    ).not.toThrow();
    for (const identity of [null, {}, { email: "x@y.cl", emailVerified: false }]) {
      try {
        assertDepositIdentityAllowed(identity as never);
        throw new Error("debió lanzar");
      } catch (error) {
        expect((error as { code?: string }).code).toBe("REAL_DISABLED");
      }
    }
  });
});

describe("barrido: la identidad decide, sin lista de correos", () => {
  it("un correo verificado se acredita aunque la variable eliminada apunte a otra persona", async () => {
    vi.stubEnv("DEPOSIT_ALLOWLIST_EMAILS", "otra@maverlang.test");
    const probe: Probe = { signatures: 0, recorded: [] };

    const summary = await syncSolanaUsdcDeposits(deps(probe));

    expect(summary.ineligible).toBe(0);
    expect(summary.confirmed).toBe(1);
    expect(probe.recorded).toEqual(["sig-deposito-1"]);
  });

  it("un correo sin verificar no gasta RPC ni recibe crédito", async () => {
    const probe: Probe = { signatures: 0, recorded: [] };

    const summary = await syncSolanaUsdcDeposits(
      deps(probe, {
        verifiedEmailOf: async () => ({ email: VERIFIED_EMAIL, emailVerified: false }),
      }),
    );

    expect(summary.ineligible).toBe(1);
    expect(summary.confirmed).toBe(0);
    expect(summary.walletsScanned).toBe(0);
    expect(probe.signatures).toBe(0);
    expect(probe.recorded).toEqual([]);
  });

  it("sin correo legible (null) se deniega antes de pedir firmas", async () => {
    const probe: Probe = { signatures: 0, recorded: [] };

    const summary = await syncSolanaUsdcDeposits(
      deps(probe, { verifiedEmailOf: async () => null }),
    );

    expect(summary.ineligible).toBe(1);
    expect(probe.signatures).toBe(0);
    expect(probe.recorded).toEqual([]);
  });

  it("si no se puede leer el correo verificado, se deniega", async () => {
    const probe: Probe = { signatures: 0, recorded: [] };

    const summary = await syncSolanaUsdcDeposits(
      deps(probe, {
        verifiedEmailOf: async () => {
          throw new Error("Auth no responde");
        },
      }),
    );

    expect(summary.ineligible).toBe(1);
    expect(probe.signatures).toBe(0);
    expect(probe.recorded).toEqual([]);
  });

  it("verificar el correo después recupera la misma firma (no hay cursor)", async () => {
    const probe: Probe = { signatures: 0, recorded: [] };
    const first = await syncSolanaUsdcDeposits(
      deps(probe, {
        verifiedEmailOf: async () => ({ email: VERIFIED_EMAIL, emailVerified: false }),
      }),
    );
    expect(first.ineligible).toBe(1);
    expect(probe.recorded).toEqual([]);

    // Al verificar el correo, la MISMA firma sigue disponible y se acredita.
    const second = await syncSolanaUsdcDeposits(deps(probe));
    expect(second.confirmed).toBe(1);
    expect(probe.recorded).toEqual(["sig-deposito-1"]);
  });
});

describe("vinculación: el correo verificado no reemplaza la prueba firmada", () => {
  const keys = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const PUBLIC_PEM = keys.publicKey.export({ type: "spki", format: "pem" }).toString();

  function useSupabaseAuth(): void {
    vi.stubEnv("AUTH_MODE", "supabase");
    vi.stubEnv("NEXT_PUBLIC_AUTH_MODE", "supabase");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-test");
  }

  it("sin prueba firmada, syncVerifiedPrivyWallet sigue cerrado", async () => {
    useSupabaseAuth();
    await expect(
      syncVerifiedPrivyWallet({
        userId: "user-deposito-1",
        identity: { email: VERIFIED_EMAIL, emailVerified: true },
      }),
    ).rejects.toMatchObject({ code: "REAL_DISABLED" });
  });

  it("un correo sin verificar no llega ni a pedir el desafío", async () => {
    useSupabaseAuth();
    await expect(
      issueWalletLinkChallenge({
        userId: "user-deposito-1",
        accessToken: "token-de-prueba",
        identity: { email: VERIFIED_EMAIL, emailVerified: false },
        domain: "maverlang.cl",
        appId: "app-test",
        appSecret: "secret-test",
        verificationKey: PUBLIC_PEM,
      }),
    ).rejects.toMatchObject({ code: "REAL_DISABLED" });
  });

  it("un correo verificado pasa la identidad y cae en la verificación ES256 (sin lista)", async () => {
    useSupabaseAuth();
    // Token basura: si la identidad no bloqueara, la verificación del token
    // de Privy falla con UNAUTHORIZED. No hay red ni se emite desafío.
    await expect(
      issueWalletLinkChallenge({
        userId: "user-deposito-1",
        accessToken: "no-es-un-jwt",
        identity: { email: VERIFIED_EMAIL, emailVerified: true },
        domain: "maverlang.cl",
        appId: "app-test",
        appSecret: "secret-test",
        verificationKey: PUBLIC_PEM,
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});
