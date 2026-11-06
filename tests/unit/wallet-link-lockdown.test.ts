import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Paso 2 del piloto: `POST /api/me/wallet` ya no responde 503 a ciegas.
 *
 * Lo que se fija aquí:
 * - Con identidad Supabase, sin nonce/firma el POST sigue cerrado
 *   (`REAL_DISABLED`) y no llama al servicio de billetera.
 * - Con nonce y firma pero sin token de Privy → 401 y no vincula.
 * - Con nonce, firma y token, la ruta delega en el servicio (que verifica
 *   token ES256, billetera de Privy, consumo atómico y ed25519).
 * - La demo en memoria (`AUTH_MODE=mock`) sigue vinculando con cuerpo vacío.
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
const USER = "u-wallet-link";
const NONCE = "a".repeat(43);
const SIGNATURE = "1".repeat(87);

function walletRequest(options: { cookie?: string; body?: string; auth?: string } = {}): Request {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    origin: SITE,
  };
  if (options.cookie) headers.cookie = options.cookie;
  if (options.auth) headers.authorization = options.auth;
  return new Request(`${SITE}/api/me/wallet`, {
    method: "POST",
    headers,
    body: options.body ?? "{}",
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

describe("POST /api/me/wallet con identidad Supabase", () => {
  it("sin nonce ni firma: 503 REAL_DISABLED y no toca el store", async () => {
    useSupabaseAuth();
    const response = await walletPOST(walletRequest());

    expect(response.status).toBe(503);
    expect((await errorPayload(response)).error.code).toBe("REAL_DISABLED");
    expect(mocks.syncVerifiedPrivyWallet).not.toHaveBeenCalled();
    expect(mocks.getUserWallets).not.toHaveBeenCalled();
  });

  it("con nonce y firma pero sin token de Privy: 401 y no vincula", async () => {
    useSupabaseAuth();
    const response = await walletPOST(
      walletRequest({ body: JSON.stringify({ nonce: NONCE, signature: SIGNATURE }) }),
    );

    expect(response.status).toBe(401);
    expect((await errorPayload(response)).error.code).toBe("UNAUTHORIZED");
    expect(mocks.syncVerifiedPrivyWallet).not.toHaveBeenCalled();
  });

  it("con nonce, firma y token: delega en el servicio con dominio y prueba", async () => {
    useSupabaseAuth();
    const response = await walletPOST(
      walletRequest({
        body: JSON.stringify({ nonce: NONCE, signature: SIGNATURE }),
        auth: "Bearer privy-access-token",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.syncVerifiedPrivyWallet).toHaveBeenCalledTimes(1);
    const params = mocks.syncVerifiedPrivyWallet.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(params).toMatchObject({
      userId: USER,
      requireVerified: true,
      proof: { nonce: NONCE, signature: SIGNATURE },
      domain: "localhost:3000",
    });
    expect(mocks.getUserWallets).toHaveBeenCalledWith(USER);
  });

  it("una dirección enviada por el cliente se rechaza con 400", async () => {
    useSupabaseAuth();
    const response = await walletPOST(
      walletRequest({
        body: JSON.stringify({
          nonce: NONCE,
          signature: SIGNATURE,
          address: "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin",
        }),
        auth: "Bearer privy-access-token",
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.syncVerifiedPrivyWallet).not.toHaveBeenCalled();
  });
});

describe("demo en memoria", () => {
  it("AUTH_MODE=mock sigue vinculando con cuerpo vacío", async () => {
    useMockAuth();
    const response = await walletPOST(walletRequest());

    expect(response.status).toBe(200);
    expect(mocks.syncVerifiedPrivyWallet).toHaveBeenCalledTimes(1);
    expect(mocks.getUserWallets).toHaveBeenCalledWith(USER);
  });
});
