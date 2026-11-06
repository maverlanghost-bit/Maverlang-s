import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * La API no puede aceptar una sesión `aal1` con TOTP verificado.
 * Se mockean el cliente de Supabase y las billeteras: no hay red ni base.
 */
const state = vi.hoisted(() => ({
  session: null as { access_token: string } | null,
  user: null as { id: string; factors?: { factor_type: string; status: string }[] } | null,
  error: null as { message?: string } | null,
  throwGetUser: false,
  wallets: [] as { address: string; isPrimary: boolean }[],
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      getSession: async () => ({ data: { session: state.session }, error: null }),
      getUser: async () => {
        if (state.throwGetUser) throw new Error("boom");
        return { data: { user: state.user }, error: state.error };
      },
    },
  }),
}));

vi.mock("@/lib/services/wallet.supabase", () => ({
  getUserWallets: async () => state.wallets,
}));

import { supabaseSessionAuth } from "@/lib/services/auth.supabase";

function token(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.firma`;
}

const VERIFIED = [{ factor_type: "totp", status: "verified" }];

beforeEach(() => {
  state.session = { access_token: token({ sub: "user-1", aal: "aal1" }) };
  state.user = { id: "user-1", factors: [] };
  state.error = null;
  state.throwGetUser = false;
  state.wallets = [];
});

describe("supabaseSessionAuth y MFA", () => {
  it("rechaza una sesión aal1 con TOTP verificado", async () => {
    state.user = { id: "user-1", factors: VERIFIED };
    await expect(supabaseSessionAuth.getSession()).resolves.toBeNull();
  });

  it("acepta aal2 con TOTP verificado", async () => {
    state.session = { access_token: token({ sub: "user-1", aal: "aal2" }) };
    state.user = { id: "user-1", factors: VERIFIED };
    state.wallets = [{ address: "wallet-1", isPrimary: true }];
    await expect(supabaseSessionAuth.getSession()).resolves.toEqual({
      userId: "user-1",
      walletAddress: "wallet-1",
      email: null,
      emailVerified: false,
    });
  });

  it("acepta aal1 sin factor verificado", async () => {
    state.user = { id: "user-1", factors: [{ factor_type: "totp", status: "unverified" }] };
    await expect(supabaseSessionAuth.getSession()).resolves.toEqual({
      userId: "user-1",
      walletAddress: null,
      email: null,
      emailVerified: false,
    });
  });

  it("falla cerrado si el token no trae aal y hay factor verificado", async () => {
    state.session = { access_token: token({ sub: "user-1" }) };
    state.user = { id: "user-1", factors: VERIFIED };
    await expect(supabaseSessionAuth.getSession()).resolves.toBeNull();
  });

  it("falla cerrado sin sesión, sin usuario o con error de Auth", async () => {
    state.session = null;
    await expect(supabaseSessionAuth.getSession()).resolves.toBeNull();

    state.session = { access_token: token({ sub: "user-1", aal: "aal1" }) };
    state.error = { message: "invalid" };
    await expect(supabaseSessionAuth.getSession()).resolves.toBeNull();

    state.error = null;
    state.throwGetUser = true;
    await expect(supabaseSessionAuth.getSession()).resolves.toBeNull();
  });
});
