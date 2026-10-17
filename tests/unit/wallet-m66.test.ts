import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  storedWalletSchema,
  walletSyncRequestSchema,
  walletsResponseSchema,
} from "@/lib/api/contracts";
import { DomainError } from "@/lib/api/result";
import type { Services } from "@/lib/services";
import {
  getUserWallets,
  PRIVY_USERS_ME_URL,
  resetMockWalletsForTests,
  syncVerifiedPrivyWallet,
  verifyPrivySolanaWallet,
} from "@/lib/services/wallet.supabase";
import { isValidSolanaAddress } from "@/lib/solana/address";
import { __resetRateLimitsForTests } from "@/lib/security/rate-limit";
import { GET as walletGET, POST as walletPOST } from "@/app/api/me/wallet/route";

const ROOT = path.resolve(__dirname, "..", "..");

/** Dirección Solana bien formada (programa del SOL envuelto). */
const VALID_SOL = "So11111111111111111111111111111111111111112";
const USER = "u-m66-wallet";

const { getSessionMock } = vi.hoisted(() => ({ getSessionMock: vi.fn() }));

vi.mock("@/lib/services", () => ({
  getServices: () => ({ auth: { getSession: getSessionMock } }) as unknown as Services,
}));

function readMigration(): string {
  return readFileSync(path.join(ROOT, "supabase", "migrations", "0029_wallets.sql"), "utf8");
}

function jsonResponse(payload: unknown, ok = true, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function privyParams(fetchImpl: typeof fetch): Parameters<typeof verifyPrivySolanaWallet>[0] {
  return { userId: USER, accessToken: "tok", appId: "app", appSecret: "sec", dataMode: "live", fetchImpl };
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return "no-error";
  } catch (error) {
    return error instanceof DomainError ? error.code : "otro";
  }
}

function walletRequest(method: "GET" | "POST", body?: string, withOrigin = true): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (withOrigin) headers.origin = "http://localhost:3000";
  return new Request("http://localhost:3000/api/me/wallet", {
    method,
    headers,
    body: method === "POST" ? (body ?? "{}") : undefined,
  });
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  resetMockWalletsForTests();
  __resetRateLimitsForTests();
  getSessionMock.mockReset();
});

describe("M66: migración 0029_wallets.sql", () => {
  it("crea public.wallets con FK a profiles y checks de dominio", () => {
    const sql = readMigration();
    expect(sql).toMatch(/create table if not exists public\.wallets/i);
    expect(sql).toMatch(/references public\.profiles\s*\(id\)\s*on delete cascade/i);
    expect(sql).toMatch(/chain text not null default 'solana' check \(chain in \('solana'\)\)/i);
    expect(sql).toMatch(/wallet_client_type in \('privy', 'external'\)/i);
    expect(sql).toMatch(/unique \(chain, address\)/i);
  });

  it("activa RLS y deja sólo SELECT propio para authenticated", () => {
    const sql = readMigration();
    expect(sql).toMatch(/alter table public\.wallets enable row level security/i);
    expect(sql).toMatch(/revoke all on public\.wallets from anon, authenticated/i);
    expect(sql).toMatch(/grant select on public\.wallets to authenticated/i);
    expect(sql).toMatch(
      /create policy wallets_select_own[\s\S]*for select to authenticated[\s\S]*using \(auth\.uid\(\) = user_id\)/i,
    );
    expect(sql).not.toMatch(/grant\s+(insert|update|delete)/i);
  });

  it("tiene el índice parcial de primaria y el índice por usuario", () => {
    const sql = readMigration();
    expect(sql).toMatch(/wallets_one_primary_per_user\s+on public\.wallets \(user_id, chain\) where is_primary = true/i);
    expect(sql).toMatch(/wallets_user_id_idx\s+on public\.wallets \(user_id\)/i);
  });

  it("agrega profiles.wallet_address y es idempotente", () => {
    const sql = readMigration();
    expect(sql).toMatch(/alter table public\.profiles add column if not exists wallet_address text/i);
    expect(sql.match(/if not exists/gi)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(sql).toMatch(/drop policy if exists wallets_select_own/i);
  });
});

describe("M66: verifyPrivySolanaWallet (fetchImpl mockeado)", () => {
  it("devuelve una wallet mock determinista y válida por usuario", async () => {
    const a = await verifyPrivySolanaWallet({ userId: USER });
    const b = await verifyPrivySolanaWallet({ userId: USER });
    const other = await verifyPrivySolanaWallet({ userId: "u-otro" });
    expect(a.source).toBe("mock");
    expect(a.address).toBe(b.address);
    expect(a.address).not.toBe(other.address);
    expect(isValidSolanaAddress(a.address)).toBe(true);
    expect(a.chain).toBe("solana");
    expect(a.walletClientType).toBe("privy");
  });

  it("éxito: mapea la wallet Solana de Privy sin tocar la red real", async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(
        jsonResponse({
          id: "did:privy:user",
          linked_accounts: [
            { type: "wallet", chain_type: "evm", address: "0xabc" },
            {
              type: "wallet",
              chain_type: "solana",
              address: VALID_SOL,
              wallet_client_type: "privy",
              id: "w_123",
            },
          ],
        }),
      ),
    );
    const wallet = await verifyPrivySolanaWallet(privyParams(fetchImpl as unknown as typeof fetch));
    expect(wallet.address).toBe(VALID_SOL);
    expect(wallet.source).toBe("privy");
    expect(wallet.privyWalletId).toBe("w_123");
    expect(wallet.walletClientType).toBe("privy");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(PRIVY_USERS_ME_URL);
    const headers = init.headers as Record<string, string>;
    expect(headers["privy-app-id"]).toBe("app");
    expect(headers.authorization).toBe("Bearer tok");
  });

  it("dirección inválida devuelta por Privy → VALIDATION", async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(
        jsonResponse({
          linked_accounts: [{ type: "wallet", chain_type: "solana", address: "0x-no-es-base58!!" }],
        }),
      ),
    );
    expect(await codeOf(verifyPrivySolanaWallet(privyParams(fetchImpl as unknown as typeof fetch)))).toBe(
      "VALIDATION",
    );
  });

  it("sin wallet Solana → VALIDATION con mensaje claro", async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve(
        jsonResponse({ linked_accounts: [{ type: "wallet", chain_type: "evm", address: "0xabc" }] }),
      ),
    );
    try {
      await verifyPrivySolanaWallet(privyParams(fetchImpl as unknown as typeof fetch));
      expect.unreachable("debío fallar sin wallet Solana");
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).message).toContain("Solana");
    }
  });

  it("error HTTP y falla de red → INTERNAL (sin eco del cuerpo)", async () => {
    const httpFail = vi.fn(() => Promise.resolve(jsonResponse({ detail: "token inválido" }, false, 401)));
    expect(await codeOf(verifyPrivySolanaWallet(privyParams(httpFail as unknown as typeof fetch)))).toBe(
      "INTERNAL",
    );
    const networkFail = vi.fn(() => Promise.reject(new Error("ECONNREFUSED 127.0.0.1")));
    expect(await codeOf(verifyPrivySolanaWallet(privyParams(networkFail as unknown as typeof fetch)))).toBe(
      "INTERNAL",
    );
  });

  it("sin token ni credenciales Privy → mock, sin llamadas de red", async () => {
    const fetchImpl = vi.fn(() => Promise.resolve(jsonResponse({})));
    const wallet = await verifyPrivySolanaWallet({ userId: USER, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(wallet.source).toBe("mock");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("M66: /api/me/wallet", () => {
  it("POST ignora la address del cliente: 400 VALIDATION y nada persistido", async () => {
    getSessionMock.mockResolvedValue({ userId: USER, walletAddress: null });
    const res = await walletPOST(walletRequest("POST", JSON.stringify({ address: VALID_SOL })));
    expect(res.status).toBe(400);
    const payload = (await res.json()) as { ok: boolean; error: { code: string } };
    expect(payload.ok).toBe(false);
    expect(payload.error.code).toBe("VALIDATION");
    // Ni siquiera una dirección válida llega a la base: el esquema es estricto.
    expect(await getUserWallets(USER)).toEqual([]);
    expect(walletSyncRequestSchema.safeParse({ address: VALID_SOL }).success).toBe(false);
  });

  it("POST válido sincroniza la wallet verificada en el servidor", async () => {
    getSessionMock.mockResolvedValue({ userId: USER, walletAddress: null });
    const res = await walletPOST(walletRequest("POST", "{}"));
    expect(res.status).toBe(200);
    const payload = (await res.json()) as {
      ok: boolean;
      data: { wallets: unknown[]; primaryAddress: string | null };
    };
    expect(payload.ok).toBe(true);
    const expected = await verifyPrivySolanaWallet({ userId: USER });
    expect(payload.data.primaryAddress).toBe(expected.address);
    expect(payload.data.wallets).toHaveLength(1);
    const parsed = storedWalletSchema.safeParse((payload.data.wallets as unknown[])[0]);
    expect(parsed.success).toBe(true);
    expect((payload.data.wallets as { isPrimary: boolean }[])[0]?.isPrimary).toBe(true);
    expect(payload.data.primaryAddress).not.toBe(VALID_SOL);
  });

  it("POST exige mismo origen (403 FORBIDDEN_ORIGIN)", async () => {
    getSessionMock.mockResolvedValue({ userId: USER, walletAddress: null });
    const res = await walletPOST(walletRequest("POST", "{}", false));
    expect(res.status).toBe(403);
    const payload = (await res.json()) as { error: { code: string } };
    expect(payload.error.code).toBe("FORBIDDEN_ORIGIN");
  });

  it("GET sin sesión → 401 UNAUTHORIZED con private, no-store", async () => {
    getSessionMock.mockResolvedValue(null);
    const res = await walletGET(walletRequest("GET"));
    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const payload = (await res.json()) as { ok: boolean; error: { code: string } };
    expect(payload.error.code).toBe("UNAUTHORIZED");
  });

  it("GET con sesión → 200 { wallets, primaryAddress } y private, no-store", async () => {
    getSessionMock.mockResolvedValue({ userId: USER, walletAddress: null });
    await syncVerifiedPrivyWallet({ userId: USER });
    const res = await walletGET(walletRequest("GET"));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    const payload = (await res.json()) as {
      ok: boolean;
      data: { wallets: { address: string; isPrimary: boolean }[]; primaryAddress: string | null };
    };
    expect(payload.ok).toBe(true);
    const parsed = walletsResponseSchema.safeParse(payload.data);
    expect(parsed.success).toBe(true);
    expect(payload.data.wallets).toHaveLength(1);
    expect(payload.data.wallets[0]?.isPrimary).toBe(true);
    expect(payload.data.primaryAddress).toBe(payload.data.wallets[0]?.address);
  });
});
