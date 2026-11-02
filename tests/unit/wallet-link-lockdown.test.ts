import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Bloqueo temporal (2026-11-02): con identidad Supabase, `POST /api/me/wallet`
 * no vincula ni reasigna billeteras porque la primera asociación de un DID de
 * Privy no prueba que corresponda al usuario Supabase (TOFU). La demo en
 * memoria (`AUTH_MODE=mock`) sigue funcionando.
 *
 * Sin red, sin `.env` y sin Supabase real: se mockean la sesión y el store.
 */

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  syncVerifiedPrivyWallet: vi.fn(),
  getUserWallets: vi.fn(),
}));

vi.mock("@/lib/services", () => ({
  getServices: () => ({ auth: { getSession: mocks.getSession } }),
}));

vi.mock("@/lib/services/wallet.supabase", () => ({
  syncVerifiedPrivyWallet: mocks.syncVerifiedPrivyWallet,
  getUserWallets: mocks.getUserWallets,
}));

import { POST as walletPOST } from "@/app/api/me/wallet/route";

const SITE = "http://localhost:3000";
const USER = "u-wallet-lockdown";

function walletRequest(cookie?: string): Request {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    origin: SITE,
  };
  if (cookie) headers.cookie = cookie;
  return new Request(`${SITE}/api/me/wallet`, {
    method: "POST",
    headers,
    body: "{}",
  });
}

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

function errorPayload(response: Response): Promise<{
  ok: boolean;
  error: { code: string; message: string };
}> {
  return response.json() as Promise<{
    ok: boolean;
    error: { code: string; message: string };
  }>;
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.getSession.mockReset().mockResolvedValue({ userId: USER, walletAddress: null });
  mocks.syncVerifiedPrivyWallet.mockReset().mockResolvedValue(undefined);
  mocks.getUserWallets.mockReset().mockResolvedValue([]);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("bloqueo temporal de POST /api/me/wallet", () => {
  it("cuenta Supabase: 503 REAL_DISABLED y no llama al store", async () => {
    useSupabaseAuth();
    const response = await walletPOST(walletRequest());

    expect(response.status).toBe(503);
    const payload = await errorPayload(response);
    expect(payload.ok).toBe(false);
    expect(payload.error.code).toBe("REAL_DISABLED");
    expect(payload.error.message).toMatch(/deshabilitada temporalmente/i);
    // Ni vincular ni reasignar: el servicio de billetera no se toca.
    expect(mocks.syncVerifiedPrivyWallet).not.toHaveBeenCalled();
    expect(mocks.getUserWallets).not.toHaveBeenCalled();
  });

  it("Supabase con cookie demo también se bloquea (no hay bypass por modo)", async () => {
    useSupabaseAuth();
    const response = await walletPOST(walletRequest("mv_account=demo"));

    expect(response.status).toBe(503);
    expect((await errorPayload(response)).error.code).toBe("REAL_DISABLED");
    expect(mocks.syncVerifiedPrivyWallet).not.toHaveBeenCalled();
  });

  it("demo en memoria (AUTH_MODE=mock): el POST sigue funcionando", async () => {
    useMockAuth();
    const response = await walletPOST(walletRequest());

    expect(response.status).toBe(200);
    expect(mocks.syncVerifiedPrivyWallet).toHaveBeenCalledTimes(1);
    expect(mocks.getUserWallets).toHaveBeenCalledWith(USER);
  });
});
