import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { USDC_MINT } from "@/config/tickers";
import { __setMfaClientForTests, mfaErrorMessage, removeTotp } from "@/lib/auth/mfa";
import { validateAndPrepareWithdrawal } from "@/lib/wallet/withdrawals";

/**
 * Auditoría 2026-11: controles locales de billetera, depósitos/retiros y MFA.
 * Todo es mock/estático: no se lee `.env`, no hay Supabase ni Solana reales.
 */

const ROOT = path.resolve(__dirname, "..", "..");
const MIGRATIONS = path.join(ROOT, "supabase", "migrations");
const WALLET_TABLES = [
  "wallets",
  "crypto_deposits",
  "wallet_movements",
  "wallet_reconciliations",
] as const;

const VALID_WALLET_A = "11111111111111111111111111111111";
const VALID_WALLET_B = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

function read(relative: string): string {
  return readFileSync(path.join(ROOT, relative), "utf8");
}

type Level = { currentLevel: string | null; nextLevel: string | null };

function mfaClient(level: Level) {
  const unenroll = vi.fn(
    async (): Promise<{ data: { id: string } | null; error: { message?: string } | null }> => ({
      data: { id: "factor-1" },
      error: null,
    }),
  );
  const getAuthenticatorAssuranceLevel = vi.fn(
    async (): Promise<{ data: Level | null; error: { message?: string } | null }> => ({
      data: level,
      error: null,
    }),
  );
  return {
    auth: {
      mfa: {
        enroll: vi.fn(),
        challenge: vi.fn(),
        verify: vi.fn(),
        listFactors: vi.fn(),
        unenroll,
        getAuthenticatorAssuranceLevel,
      },
    },
  };
}

afterEach(() => {
  __setMfaClientForTests(undefined);
});

describe("migración 0041: RLS de billeteras, depósitos y retiros", () => {
  const sql = readFileSync(path.join(MIGRATIONS, "0041_wallets_deposits_rls.sql"), "utf8");

  it("está marcada como NO aplicada y es idempotente", () => {
    expect(sql).toMatch(/NO APLICADA/i);
    expect(sql).toMatch(/idempotente/i);
    expect(sql).toMatch(/drop constraint if exists/i);
    expect(sql).toMatch(/create unique index if not exists/i);
  });

  it("fuerza RLS en las cuatro tablas y quita el acceso de clientes", () => {
    for (const table of WALLET_TABLES) {
      expect(sql).toMatch(
        new RegExp(`alter table public\\.${table} force row level security`, "i"),
      );
    }
    expect(sql).toMatch(/revoke all on table public\.crypto_deposits/i);
    expect(sql).toMatch(/revoke all on table public\.wallet_movements/i);
    expect(sql).toMatch(/revoke all on table public\.wallet_reconciliations/i);
  });

  it("wallets sólo expone columnas públicas y nunca los identificadores de Privy", () => {
    const grant = sql.match(/grant select \(([\s\S]*?)\) on table public\.wallets/i);
    expect(grant).not.toBeNull();
    const columns = grant?.[1] ?? "";
    expect(columns).toMatch(/\baddress\b/);
    expect(columns).toMatch(/\buser_id\b/);
    expect(columns).not.toMatch(/privy_user_id/);
    expect(columns).not.toMatch(/privy_wallet_id/);
    expect(sql).toMatch(/revoke all \(privy_wallet_id, privy_user_id\)/i);
  });

  it("exige aal2 cuando hay TOTP verificado, con fail-closed", () => {
    expect(sql).toMatch(/create or replace function public\.mfa_step_pending\(\)/i);
    expect(sql).toMatch(/security definer/i);
    expect(sql).toMatch(/set search_path = public, pg_temp/i);
    expect(sql).toMatch(/auth\.mfa_factors/i);
    expect(sql).toMatch(/factor_type = 'totp'/i);
    expect(sql).toMatch(/status = 'verified'/i);
    expect(sql).toMatch(/not public\.mfa_step_pending\(\)/i);
    expect(sql).toMatch(/privy_user_id like 'did:privy:%'/i);
    expect(sql).toMatch(/grant execute on function public\.mfa_step_pending\(\) to authenticated/i);
  });

  it("acota los montos de depósitos y movimientos (excluye NaN/Infinity)", () => {
    expect(sql).toMatch(/crypto_deposits_amount_bounds/i);
    expect(sql).toMatch(/wallet_movements_amount_bounds/i);
    expect(sql).toMatch(/amount_ui > 0 and amount_ui < 1e15/i);
  });

  it("impide dos identidades Privy en la misma cuenta", () => {
    expect(sql).toMatch(/wallets_one_privy_identity_per_user/i);
    expect(sql).toMatch(/on public\.wallets \(user_id\)/i);
    expect(sql).toMatch(/where privy_user_id is not null/i);
  });
});

describe("auditoría RLS de billetera", () => {
  const script = read("scripts/audit-rls.mjs");

  it("incluye wallets, depósitos, movimientos y conciliaciones en la matriz", () => {
    for (const table of WALLET_TABLES) {
      expect(script).toContain(`"${table}"`);
    }
    expect(script).toMatch(/A SELECT wallets de B/);
    expect(script).toMatch(/A SELECT wallets\.privy_user_id/);
    expect(script).toMatch(/A INSERT crypto_deposits/);
    expect(script).toMatch(/A INSERT wallet_movements/);
    expect(script).toMatch(/A INSERT wallet_reconciliations/);
  });

  it("deja la limpieza de las sondas en el finally", () => {
    expect(script).toMatch(/admin\.from\("wallets"\)\.delete\(\)/);
    expect(script).toMatch(/admin\.from\("crypto_deposits"\)\.delete\(\)/);
    expect(script).toMatch(/admin\.from\("wallet_movements"\)\.delete\(\)/);
  });
});

describe("bloqueos de dinero real y vinculación", () => {
  it("POST /api/me/wallet sigue cerrado con identidad Supabase", () => {
    const route = read("app/api/me/wallet/route.ts");
    expect(route).toMatch(/assertWalletLinkingOpen/);
    expect(route).toMatch(/REAL_DISABLED/);
  });

  it("un retiro sigue fallando cerrado con el dinero real apagado", () => {
    const result = validateAndPrepareWithdrawal({
      destinationAddress: VALID_WALLET_B,
      sourceAddress: VALID_WALLET_A,
      mint: USDC_MINT,
      amountUi: 10,
      availableBalanceUi: 100,
      realTradingEnabled: false,
    });
    expect(result).toMatchObject({ ok: false, code: "REAL_DISABLED", status: 503 });
  });
});

describe("retiros: saldo ilegible no se interpreta como sin tope", () => {
  const base = {
    destinationAddress: VALID_WALLET_B,
    sourceAddress: VALID_WALLET_A,
    mint: USDC_MINT,
    amountUi: 10,
    realTradingEnabled: true,
  } as const;

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1])(
    "rechaza availableBalanceUi=%s con VALIDATION",
    (availableBalanceUi: number) => {
      expect(validateAndPrepareWithdrawal({ ...base, availableBalanceUi })).toMatchObject({
        ok: false,
        code: "VALIDATION",
        status: 400,
      });
    },
  );

  it("sigue aceptando un saldo finito suficiente", () => {
    expect(validateAndPrepareWithdrawal({ ...base, availableBalanceUi: 10 })).toMatchObject({
      ok: true,
    });
  });
});

describe("MFA: quitar un TOTP exige el segundo paso", () => {
  it("no llama a unenroll desde una sesión aal1 con TOTP verificado", async () => {
    const client = mfaClient({ currentLevel: "aal1", nextLevel: "aal2" });
    __setMfaClientForTests(client);

    await expect(removeTotp("factor-1")).resolves.toEqual({
      ok: false,
      code: "aal",
      message: mfaErrorMessage("aal"),
    });
    expect(client.auth.mfa.unenroll).not.toHaveBeenCalled();
  });

  it("permite quitar el TOTP ya en aal2", async () => {
    const client = mfaClient({ currentLevel: "aal2", nextLevel: "aal2" });
    __setMfaClientForTests(client);

    await expect(removeTotp("factor-1")).resolves.toEqual({ ok: true });
    expect(client.auth.mfa.unenroll).toHaveBeenCalledWith({ factorId: "factor-1" });
  });

  it("falla cerrado si el nivel no se puede leer", async () => {
    const client = mfaClient({ currentLevel: "aal1", nextLevel: "aal2" });
    client.auth.mfa.getAuthenticatorAssuranceLevel = vi.fn(async () => ({
      data: null,
      error: { message: "network" },
    }));
    __setMfaClientForTests(client);

    await expect(removeTotp("factor-1")).resolves.toMatchObject({ ok: false, code: "aal" });
    expect(client.auth.mfa.unenroll).not.toHaveBeenCalled();
  });
});
