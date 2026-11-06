import { afterEach, describe, expect, it, vi } from "vitest";

import {
  depositPilotAllows,
  depositPilotConfigured,
  depositPilotDecision,
  normalizeDepositEmail,
  parseDepositAllowlist,
} from "@/lib/deposits/pilot";
import { USDC_DECIMALS, USDC_MINT_SOLANA } from "@/lib/wallet/deposit-indexer";
import {
  syncSolanaUsdcDeposits,
  type DepositSyncDeps,
  type ParsedTxLike,
} from "@/lib/wallet/deposit-sync";

/**
 * Piloto interno de depósitos USDC (paso 1).
 *
 * Lo que se prueba:
 * - La lista vive en `DEPOSIT_ALLOWLIST_EMAILS` y se compara normalizada.
 * - Falta de lista, correo ausente o correo sin verificar → denegado.
 * - El barrido NO pide firmas al RPC ni acredita nada para una billetera que
 *   no está en el piloto (no avanza ningún cursor).
 * - Quitar a un usuario de la lista corta el crédito; volver a agregarlo lo
 *   recupera con la misma firma (no se perdió el depósito).
 *
 * Sin red, sin Supabase real y sin `.env`: las dependencias del barrido se
 * inyectan y el correo verificado lo entrega el doble de pruebas.
 */

const WALLET = "11111111111111111111111111111111";
const USER = "user-piloto-1";
const PILOT_EMAIL = "Piloto@Maverlang.Test";

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
  transaction: { signatures: ["sig-piloto-1"] },
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
    listSignatures: async () => {
      probe.signatures += 1;
      return ["sig-piloto-1"];
    },
    readTransactions: async () => ({
      transactions: [TX],
      statuses: [{ confirmationStatus: "confirmed", slot: 7, confirmations: 1, err: null }],
    }),
    listKnownSignatures: async () => [],
    verifiedEmailOf: async () => ({ email: PILOT_EMAIL, emailVerified: true }),
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

describe("lista del piloto: normalización y fail-closed", () => {
  it("normaliza espacios y mayúsculas, y descarta entradas basura", () => {
    expect(normalizeDepositEmail("  Piloto@Maverlang.Test ")).toBe("piloto@maverlang.test");
    expect(normalizeDepositEmail("sin-arroba")).toBeNull();
    expect(normalizeDepositEmail("a@b")).toBeNull();
    expect(normalizeDepositEmail("a@b.c,d@e.f")).toBeNull();
    expect(normalizeDepositEmail("")).toBeNull();
    expect(normalizeDepositEmail(null)).toBeNull();

    const list = parseDepositAllowlist(" Uno@X.CL , basura, Dos@Y.CL,,uno@x.cl ");
    expect([...list].sort()).toEqual(["dos@y.cl", "uno@x.cl"]);
  });

  it("sin variable o con lista vacía no hay nadie habilitado", () => {
    expect(depositPilotConfigured("")).toBe(false);
    expect(depositPilotConfigured(" , , ")).toBe(false);
    expect(
      depositPilotDecision({ email: "piloto@maverlang.test", emailVerified: true }, ""),
    ).toEqual({ allowed: false, reason: "not_configured" });
  });

  it("exige correo presente, verificado y exacto en la lista", () => {
    const raw = "piloto@maverlang.test";
    expect(depositPilotDecision({ email: null, emailVerified: true }, raw).reason).toBe(
      "missing_email",
    );
    expect(
      depositPilotDecision({ email: "piloto@maverlang.test", emailVerified: false }, raw).reason,
    ).toBe("email_not_verified");
    expect(
      depositPilotDecision({ email: "otro@maverlang.test", emailVerified: true }, raw).reason,
    ).toBe("not_allowlisted");
    expect(
      depositPilotDecision({ email: "PILOTO@maverlang.test", emailVerified: true }, raw),
    ).toEqual({ allowed: true, reason: "allowlisted" });
    expect(depositPilotAllows({ email: "piloto@maverlang.test" }, raw)).toBe(false);
  });
});

describe("barrido: fuera del piloto no se escanea ni se acredita", () => {
  it("un correo sin verificar se queda fuera aunque esté en la lista", async () => {
    vi.stubEnv("DEPOSIT_ALLOWLIST_EMAILS", PILOT_EMAIL);
    const probe: Probe = { signatures: 0, recorded: [] };

    const summary = await syncSolanaUsdcDeposits(
      deps(probe, {
        verifiedEmailOf: async () => ({ email: PILOT_EMAIL, emailVerified: false }),
      }),
    );

    expect(summary.notAllowlisted).toBe(1);
    expect(summary.confirmed).toBe(0);
    expect(probe.signatures).toBe(0);
    expect(probe.recorded).toEqual([]);
  });

  it("una cuenta que no está en la lista no gasta RPC ni recibe crédito", async () => {
    vi.stubEnv("DEPOSIT_ALLOWLIST_EMAILS", "otra@maverlang.test");
    const probe: Probe = { signatures: 0, recorded: [] };

    const summary = await syncSolanaUsdcDeposits(deps(probe));

    expect(summary.notAllowlisted).toBe(1);
    expect(summary.walletsScanned).toBe(0);
    expect(probe.signatures).toBe(0);
    expect(probe.recorded).toEqual([]);
  });

  it("sin la variable configurada nadie entra (fail-closed)", async () => {
    vi.stubEnv("DEPOSIT_ALLOWLIST_EMAILS", "");
    const probe: Probe = { signatures: 0, recorded: [] };

    const summary = await syncSolanaUsdcDeposits(deps(probe));

    expect(summary.notAllowlisted).toBe(1);
    expect(probe.signatures).toBe(0);
    expect(probe.recorded).toEqual([]);
  });

  it("si no se puede leer el correo verificado, se deniega", async () => {
    vi.stubEnv("DEPOSIT_ALLOWLIST_EMAILS", PILOT_EMAIL);
    const probe: Probe = { signatures: 0, recorded: [] };

    const summary = await syncSolanaUsdcDeposits(
      deps(probe, {
        verifiedEmailOf: async () => {
          throw new Error("Auth no responde");
        },
      }),
    );

    expect(summary.notAllowlisted).toBe(1);
    expect(probe.signatures).toBe(0);
    expect(probe.recorded).toEqual([]);
  });

  it("en la lista se acredita una sola vez y con la firma como llave", async () => {
    vi.stubEnv("DEPOSIT_ALLOWLIST_EMAILS", PILOT_EMAIL);
    const probe: Probe = { signatures: 0, recorded: [] };

    const summary = await syncSolanaUsdcDeposits(deps(probe));

    expect(summary.notAllowlisted).toBe(0);
    expect(summary.confirmed).toBe(1);
    expect(probe.recorded).toEqual(["sig-piloto-1"]);
  });

  it("quitar y volver a poner al usuario no pierde el depósito (no hay cursor)", async () => {
    vi.stubEnv("DEPOSIT_ALLOWLIST_EMAILS", "");
    const probe: Probe = { signatures: 0, recorded: [] };
    const first = await syncSolanaUsdcDeposits(deps(probe));
    expect(first.notAllowlisted).toBe(1);
    expect(probe.recorded).toEqual([]);

    // Vuelve a la lista: la MISMA firma sigue disponible y se acredita.
    vi.stubEnv("DEPOSIT_ALLOWLIST_EMAILS", PILOT_EMAIL);
    const second = await syncSolanaUsdcDeposits(deps(probe));
    expect(second.confirmed).toBe(1);
    expect(probe.recorded).toEqual(["sig-piloto-1"]);
  });
});
