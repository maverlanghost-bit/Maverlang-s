import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { DomainError } from "@/lib/api/result";
import { requireWallet, type Session } from "@/lib/api/handler";
import {
  planPrivyWalletBinding,
  requireSessionWalletMatch,
  type WalletBindingRow,
} from "@/lib/wallet/identity";

const ROOT = path.resolve(__dirname, "..", "..");
const USER_A = "11111111-1111-1111-1111-111111111111";
const USER_B = "22222222-2222-2222-2222-222222222222";
const DID_A = "did:privy:identity-a";
const DID_B = "did:privy:identity-b";
const ADDRESS_A = "So11111111111111111111111111111111111111112";
const ADDRESS_B = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

function row(userId: string, address: string, privyUserId: string | null): WalletBindingRow {
  return { userId, address, privyUserId };
}

function codeOf(action: () => unknown): string {
  try {
    action();
    return "no-error";
  } catch (error) {
    return error instanceof DomainError ? error.code : "otro";
  }
}

describe("identidad de sesión y billetera", () => {
  it("acepta sólo la billetera exacta de la sesión", () => {
    expect(requireSessionWalletMatch(ADDRESS_A, ADDRESS_A)).toBe(ADDRESS_A);
    // base58 distingue mayúsculas: un cambio de caja es OTRA dirección.
    const caseVariant = `${ADDRESS_A.slice(0, -1)}3`;
    expect(caseVariant).not.toBe(ADDRESS_A);
    expect(codeOf(() => requireSessionWalletMatch(ADDRESS_A, caseVariant))).toBe("VALIDATION");
  });

  it("sin billetera verificada falla cerrado y no usa la demo", () => {
    expect(codeOf(() => requireSessionWalletMatch(null, ADDRESS_A))).toBe("VALIDATION");
    expect(codeOf(() => requireSessionWalletMatch("", ADDRESS_A))).toBe("VALIDATION");
    const session: Session = { userId: USER_A, walletAddress: null };
    expect(codeOf(() => requireWallet(session))).toBe("VALIDATION");
  });

  it("las rutas de billetera usan el guardián de sesión", () => {
    const onramp = readFileSync(path.join(ROOT, "app", "api", "onramp", "session", "route.ts"), "utf8");
    const send = readFileSync(
      path.join(ROOT, "app", "api", "wallet", "send", "build", "route.ts"),
      "utf8",
    );
    expect(onramp).toContain("requireSessionWalletMatch(");
    expect(send).toContain("requireSessionWalletMatch(");
    // La dirección no se normaliza a minúsculas en ninguna decisión de sesión.
    expect(onramp).not.toMatch(/walletAddress[^\n]*toLowerCase/);
    expect(send).not.toMatch(/userPublicKey[^\n]*toLowerCase/);
  });

  it("0040 y el cron exigen una billetera con DID persistido", () => {
    const migration = readFileSync(
      path.join(ROOT, "supabase", "migrations", "0040_wallets_privy_binding.sql"),
      "utf8",
    );
    expect(migration).toMatch(/add column if not exists privy_user_id/i);
    expect(migration).toMatch(/create unique index if not exists wallets_privy_user_id_key/i);
    const deposits = readFileSync(
      path.join(ROOT, "lib", "services", "deposits.supabase.ts"),
      "utf8",
    );
    expect(deposits.match(/\.like\("privy_user_id", "did:privy:%"\)/g) ?? []).toHaveLength(2);
  });
});

describe("planPrivyWalletBinding: DID persistente y sin reasignaciones", () => {
  it("primera vinculación: inserta con el DID verificado", () => {
    expect(
      planPrivyWalletBinding({
        userId: USER_A,
        privyUserId: DID_A,
        address: ADDRESS_A,
        byPrivyUser: null,
        byAddress: null,
        userRows: [],
      }),
    ).toBe("insert");
  });

  it("mismo DID y misma dirección: actualiza la fila existente", () => {
    expect(
      planPrivyWalletBinding({
        userId: USER_A,
        privyUserId: DID_A,
        address: ADDRESS_A,
        byPrivyUser: row(USER_A, ADDRESS_A, DID_A),
        byAddress: row(USER_A, ADDRESS_A, DID_A),
        userRows: [row(USER_A, ADDRESS_A, DID_A)],
      }),
    ).toBe("update");
  });

  it("un DID ya ligado a otra cuenta no se reasigna", () => {
    expect(
      codeOf(() =>
        planPrivyWalletBinding({
          userId: USER_B,
          privyUserId: DID_A,
          address: ADDRESS_B,
          byPrivyUser: row(USER_A, ADDRESS_A, DID_A),
          byAddress: null,
          userRows: [],
        }),
      ),
    ).toBe("VALIDATION");
  });

  it("una cuenta no puede alternar a otra identidad de Privy", () => {
    expect(
      codeOf(() =>
        planPrivyWalletBinding({
          userId: USER_A,
          privyUserId: DID_B,
          address: ADDRESS_B,
          byPrivyUser: null,
          byAddress: null,
          userRows: [row(USER_A, ADDRESS_A, DID_A)],
        }),
      ),
    ).toBe("VALIDATION");
  });

  it("una dirección de otra cuenta no se reclama", () => {
    expect(
      codeOf(() =>
        planPrivyWalletBinding({
          userId: USER_B,
          privyUserId: DID_B,
          address: ADDRESS_A,
          byPrivyUser: null,
          byAddress: row(USER_A, ADDRESS_A, null),
          userRows: [],
        }),
      ),
    ).toBe("VALIDATION");
  });

  it("una fila antigua sin DID del mismo dueño se adopta", () => {
    expect(
      planPrivyWalletBinding({
        userId: USER_A,
        privyUserId: DID_A,
        address: ADDRESS_A,
        byPrivyUser: null,
        byAddress: row(USER_A, ADDRESS_A, null),
        userRows: [row(USER_A, ADDRESS_A, null)],
      }),
    ).toBe("update");
  });

  it("el mismo DID con otra dirección mueve la fila en vez de duplicarla", () => {
    expect(
      planPrivyWalletBinding({
        userId: USER_A,
        privyUserId: DID_A,
        address: ADDRESS_B,
        byPrivyUser: row(USER_A, ADDRESS_A, DID_A),
        byAddress: null,
        userRows: [row(USER_A, ADDRESS_A, DID_A)],
      }),
    ).toBe("move");
  });

  it("rechaza DIDs o direcciones mal formadas", () => {
    expect(
      codeOf(() =>
        planPrivyWalletBinding({
          userId: USER_A,
          privyUserId: "otro-formato",
          address: ADDRESS_A,
          byPrivyUser: null,
          byAddress: null,
          userRows: [],
        }),
      ),
    ).toBe("UNAUTHORIZED");
    expect(
      codeOf(() =>
        planPrivyWalletBinding({
          userId: USER_A,
          privyUserId: DID_A,
          address: "no-es-solana",
          byPrivyUser: null,
          byAddress: null,
          userRows: [],
        }),
      ),
    ).toBe("VALIDATION");
  });
});
