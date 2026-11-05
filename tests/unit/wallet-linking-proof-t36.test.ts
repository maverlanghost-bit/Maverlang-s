import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * T36: la prueba que falta para vincular Supabase con Privy queda por escrito
 * como tipo, sin abrir la vinculación.
 *
 * Lo que se fija aquí:
 * - `hasWalletLinkingProof` devuelve siempre `false`: una prueba declarada por
 *   el cliente no es una prueba verificada.
 * - `assertWalletLinkingOpen` sigue lanzando `REAL_DISABLED` con identidad
 *   Supabase, aunque el cuerpo traiga nonce, dirección y firma, y aunque la
 *   petición traiga un access token de Privy.
 * - La guardia corre antes de leer el cuerpo, así que el POST real sigue en
 *   503 y no llega a interpretar un nonce.
 * - La demo en memoria (`AUTH_MODE=mock`) sigue vinculando.
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
import { DomainError } from "@/lib/api/result";
import {
  assertWalletLinkingOpen,
  walletLinkingLocked,
  WALLET_LINKING_LOCKED_MESSAGE,
} from "@/lib/wallet/linking-policy";
import {
  hasWalletLinkingProof,
  isWellFormedWalletLinkingProof,
  WALLET_LINKING_PROOF_KIND,
  walletLinkingProofMessage,
  type WalletLinkingProof,
} from "@/lib/wallet/linking-proof";

const SITE = "http://localhost:3000";
const USER = "u-wallet-t36";

/** Prueba completa y bien formada: lo máximo que un cliente podría mandar. */
const FULL_PROOF: WalletLinkingProof = {
  kind: WALLET_LINKING_PROOF_KIND,
  nonce: "nonce-t36-0001",
  address: "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin",
  signature: "5VERsignatureNotCheckedByDesign111111111111111111111",
};

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

function sourceOf(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), "utf8");
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

describe("tipo de prueba: la firma del nonce dentro de la sesión", () => {
  it("una prueba bien formada NO cuenta como presente", () => {
    expect(isWellFormedWalletLinkingProof(FULL_PROOF)).toBe(true);
    expect(hasWalletLinkingProof(FULL_PROOF)).toBe(false);
  });

  it("sin prueba, nula o basura: tampoco está presente", () => {
    expect(hasWalletLinkingProof()).toBe(false);
    expect(hasWalletLinkingProof(null)).toBe(false);
    expect(hasWalletLinkingProof("firma-suelta")).toBe(false);
    expect(hasWalletLinkingProof({ kind: WALLET_LINKING_PROOF_KIND })).toBe(false);
    expect(isWellFormedWalletLinkingProof({ kind: WALLET_LINKING_PROOF_KIND })).toBe(false);
  });

  it("el mensaje a firmar nombra el nonce y no lleva material secreto", () => {
    const message = walletLinkingProofMessage("nonce-t36-0001");
    expect(message).toContain("nonce-t36-0001");
    expect(message).toContain("Maverlang");
    expect(message).not.toContain(FULL_PROOF.signature);
  });

  it("no toca la red: ninguna firma se verifica contra Privy ni Solana", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect(hasWalletLinkingProof(FULL_PROOF)).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("el módulo de la prueba no importa nada ni usa fetch", () => {
    const source = sourceOf("lib/wallet/linking-proof.ts");
    expect(source).not.toMatch(/^\s*import\s/m);
    expect(source).not.toContain("fetch(");
  });
});

describe("política: Supabase sigue cerrado con o sin prueba", () => {
  it("con identidad Supabase el candado está puesto", () => {
    useSupabaseAuth();
    expect(walletLinkingLocked()).toBe(true);
    expect(walletLinkingLocked(FULL_PROOF)).toBe(true);
  });

  it("assertWalletLinkingOpen lanza REAL_DISABLED aunque llegue la prueba completa", () => {
    useSupabaseAuth();
    const expectLocked = (call: () => void): void => {
      try {
        call();
      } catch (error) {
        expect(error).toBeInstanceOf(DomainError);
        expect((error as DomainError).code).toBe("REAL_DISABLED");
        expect((error as DomainError).message).toBe(WALLET_LINKING_LOCKED_MESSAGE);
        return;
      }
      throw new Error("assertWalletLinkingOpen no lanzó con identidad Supabase");
    };
    expectLocked(() => assertWalletLinkingOpen());
    expectLocked(() => assertWalletLinkingOpen(FULL_PROOF));
  });

  it("la demo en memoria no queda bloqueada", () => {
    useMockAuth();
    expect(walletLinkingLocked()).toBe(false);
    expect(walletLinkingLocked(FULL_PROOF)).toBe(false);
    expect(() => assertWalletLinkingOpen()).not.toThrow();
    expect(() => assertWalletLinkingOpen(FULL_PROOF)).not.toThrow();
  });
});

describe("POST /api/me/wallet: el 503 real no se abre", () => {
  it("Supabase con nonce y firma en el cuerpo: 503 REAL_DISABLED y store intacto", async () => {
    useSupabaseAuth();
    const response = await walletPOST(
      walletRequest({ body: JSON.stringify(FULL_PROOF) }),
    );

    expect(response.status).toBe(503);
    const payload = await errorPayload(response);
    expect(payload.ok).toBe(false);
    expect(payload.error.code).toBe("REAL_DISABLED");
    expect(payload.error.message).toBe(WALLET_LINKING_LOCKED_MESSAGE);
    expect(mocks.syncVerifiedPrivyWallet).not.toHaveBeenCalled();
    expect(mocks.getUserWallets).not.toHaveBeenCalled();
  });

  it("Supabase con token de Privy y prueba: tampoco vincula", async () => {
    useSupabaseAuth();
    const response = await walletPOST(
      walletRequest({
        body: JSON.stringify(FULL_PROOF),
        auth: "Bearer privy-access-token",
        cookie: "privy-token=privy-access-token",
      }),
    );

    expect(response.status).toBe(503);
    expect((await errorPayload(response)).error.code).toBe("REAL_DISABLED");
    expect(mocks.syncVerifiedPrivyWallet).not.toHaveBeenCalled();
  });

  it("la guardia corre antes de leer el cuerpo: JSON roto también da 503, no 400", async () => {
    useSupabaseAuth();
    const response = await walletPOST(walletRequest({ body: "{ no-json" }));

    expect(response.status).toBe(503);
    expect((await errorPayload(response)).error.code).toBe("REAL_DISABLED");
  });

  it("demo en memoria (AUTH_MODE=mock): sigue vinculando", async () => {
    useMockAuth();
    const response = await walletPOST(walletRequest());

    expect(response.status).toBe(200);
    expect(mocks.syncVerifiedPrivyWallet).toHaveBeenCalledTimes(1);
    expect(mocks.getUserWallets).toHaveBeenCalledWith(USER);
  });
});

describe("estructura: la guardia no se puede mover ni perder", () => {
  /** Primera línea de código (no comentada) que contiene el fragmento. */
  function firstCodeLine(source: string, fragment: string): number {
    const lines = source.split(/\r?\n/);
    return lines.findIndex((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*")) return false;
      return trimmed.includes(fragment);
    });
  }

  it("la ruta llama a assertWalletLinkingOpen antes de parseJson", () => {
    const source = sourceOf("app/api/me/wallet/route.ts");
    const guard = firstCodeLine(source, "assertWalletLinkingOpen()");
    const parse = firstCodeLine(source, "parseJson(req");
    expect(guard).toBeGreaterThan(-1);
    expect(parse).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(parse);
  });

  it("el servicio que persiste también falla cerrado", () => {
    const source = sourceOf("lib/services/wallet.supabase.ts");
    const sync = source.indexOf("export async function syncVerifiedPrivyWallet");
    expect(sync).toBeGreaterThan(-1);
    const body = source.slice(sync);
    const guard = firstCodeLine(body, "assertWalletLinkingOpen()");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(firstCodeLine(body, "verifyPrivySolanaWallet("));
  });
});
