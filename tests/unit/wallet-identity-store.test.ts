import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Lectura real de `public.wallets` sin red ni Supabase: se mockea el cliente
 * admin. `DATA_MODE=live` se fija antes de importar `lib/env`.
 */
const state = vi.hoisted(() => {
  const savedMode = process.env.DATA_MODE;
  process.env.DATA_MODE = "live";
  return {
    savedMode,
    rows: [] as unknown[],
    error: null as { code?: string; message?: string } | null,
  };
});

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: () => {
      const builder = {
        select: () => builder,
        eq: () => builder,
        order: async () => ({ data: state.rows, error: state.error }),
      };
      return builder;
    },
  }),
}));

vi.mock("@/lib/auth/mode", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/mode")>();
  return { ...actual, isSupabaseAuth: () => true };
});

import { getUserWallets } from "@/lib/services/wallet.supabase";

const USER = "11111111-1111-1111-1111-111111111111";

function row(address: string, privyUserId: string | null) {
  return {
    user_id: USER,
    chain: "solana",
    address,
    privy_wallet_id: null,
    wallet_client_type: "privy",
    is_primary: true,
    verified_at: "2026-11-02T00:00:00.000Z",
    created_at: "2026-11-02T00:00:00.000Z",
    privy_user_id: privyUserId,
  };
}

beforeEach(() => {
  state.rows = [];
  state.error = null;
});

afterAll(() => {
  if (state.savedMode === undefined) delete process.env.DATA_MODE;
  else process.env.DATA_MODE = state.savedMode;
});

describe("getUserWallets: sólo billeteras con identidad demostrable", () => {
  it("descarta filas sin DID o con DID de otro formato", async () => {
    state.rows = [
      row("So11111111111111111111111111111111111111112", "did:privy:ok"),
      row("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", null),
      row("11111111111111111111111111111111", "formato-viejo"),
    ];
    const wallets = await getUserWallets(USER);
    expect(wallets).toHaveLength(1);
    expect(wallets[0]?.address).toBe("So11111111111111111111111111111111111111112");
  });

  it("falla cerrado si la columna no existe (0040 sin aplicar)", async () => {
    state.error = { code: "42703", message: "column privy_user_id does not exist" };
    expect(await getUserWallets(USER)).toEqual([]);
  });

  it("falla cerrado ante un error de lectura", async () => {
    state.error = { code: "XX000", message: "db down" };
    expect(await getUserWallets(USER)).toEqual([]);
  });
});
