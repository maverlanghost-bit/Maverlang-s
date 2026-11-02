import { generateKeyPairSync, sign as signJwt } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

import { USDC_MINT } from "@/config/tickers";
import { DomainError } from "@/lib/api/result";
import {
  fetchPrivySolanaWallet,
  verifyPrivyAccessToken,
} from "@/lib/services/auth.privy";
import { syncVerifiedPrivyWallet } from "@/lib/services/wallet.supabase";
import {
  USDC_MINT_SOLANA,
  indexSolanaUsdcDeposits,
  type UsdcDepositCandidate,
} from "@/lib/wallet/deposit-indexer";
import {
  extractUsdcDepositsFromTransactions,
  isDepositLedgerEligible,
  type ParsedTxLike,
} from "@/lib/wallet/deposit-sync";
import {
  assertWalletLinkingOpen,
  WALLET_LINKING_LOCKED_MESSAGE,
  walletLinkingLocked,
} from "@/lib/wallet/linking-policy";
import { netTokenDeltasByMint } from "@/lib/wallet/token-deltas";
import { validateAndPrepareWithdrawal } from "@/lib/wallet/withdrawals";

/**
 * Auditoría 2026-11: depósitos, retiros, vinculación y autenticación
 * Supabase/Privy. Todo es mock: sin red, sin base y sin `.env`.
 */

const WALLET = "So11111111111111111111111111111111111111112";
const OTHER_WALLET = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const DID_A = "did:privy:security-a";
const DID_B = "did:privy:security-b";

function balance(
  accountIndex: number,
  owner: string,
  uiAmount: number,
  mint = USDC_MINT_SOLANA,
): {
  accountIndex: number;
  mint: string;
  owner: string;
  uiTokenAmount: { uiAmount: number; amount: string; decimals: number };
} {
  return {
    accountIndex,
    mint,
    owner,
    uiTokenAmount: {
      uiAmount,
      amount: String(Math.round(uiAmount * 1_000_000)),
      decimals: 6,
    },
  };
}

type Balance = ReturnType<typeof balance>;

function parsedTx(
  signature: string,
  pre: Balance[],
  post: Balance[],
  err: unknown = null,
): ParsedTxLike {
  return {
    meta: { err, preTokenBalances: pre, postTokenBalances: post },
    transaction: { signatures: [signature] },
    blockTime: 1_700_000_000,
  };
}

function codeOf(action: () => unknown): string {
  try {
    action();
    return "no-error";
  } catch (error) {
    return error instanceof DomainError ? error.code : "otro";
  }
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("depósitos: el delta es NETO por billetera", () => {
  it("mover USDC entre dos cuentas propias no crea un depósito", () => {
    const deposits = extractUsdcDepositsFromTransactions({
      walletAddress: WALLET,
      signatures: ["sig-self"],
      transactions: [
        parsedTx("sig-self", [balance(1, WALLET, 100), balance(2, WALLET, 0)], [
          balance(1, WALLET, 0),
          balance(2, WALLET, 100),
        ]),
      ],
      statuses: [{ confirmationStatus: "confirmed", err: null }],
    });
    expect(deposits).toEqual([]);
  });

  it("consolidar cuentas propias con salida neta tampoco crea depósito", () => {
    const deposits = extractUsdcDepositsFromTransactions({
      walletAddress: WALLET,
      signatures: ["sig-consolidate"],
      transactions: [
        parsedTx("sig-consolidate", [balance(1, WALLET, 100), balance(2, WALLET, 50)], [
          balance(1, WALLET, 120),
        ]),
      ],
      statuses: [{ confirmationStatus: "confirmed", err: null }],
    });
    expect(deposits).toEqual([]);
  });

  it("una entrada externa neta sí se registra", () => {
    const deposits = extractUsdcDepositsFromTransactions({
      walletAddress: WALLET,
      signatures: ["sig-in"],
      transactions: [
        parsedTx("sig-in", [balance(1, WALLET, 10)], [balance(1, WALLET, 35)]),
      ],
      statuses: [{ confirmationStatus: "confirmed", err: null }],
    });
    expect(deposits).toHaveLength(1);
    expect(deposits[0]).toMatchObject({
      signature: "sig-in",
      mint: USDC_MINT_SOLANA,
      amountUi: 25,
      lifecycle: "confirmed",
    });
  });

  it("una salida junto con una entrada mayor deja sólo el neto", () => {
    const deposits = extractUsdcDepositsFromTransactions({
      walletAddress: WALLET,
      signatures: ["sig-mixed"],
      transactions: [
        parsedTx("sig-mixed", [balance(1, WALLET, 100), balance(2, WALLET, 0)], [
          balance(1, WALLET, 40),
          balance(2, WALLET, 100),
        ]),
      ],
      statuses: [{ confirmationStatus: "confirmed", err: null }],
    });
    // -60 de la cuenta 1 + 100 de la cuenta 2 = +40 netos.
    expect(deposits).toHaveLength(1);
    expect(deposits[0]?.amountUi).toBe(40);
  });

  it("ignora cuentas de otro dueño y sólo usa el mint USDC", () => {
    const otherMint = "So11111111111111111111111111111111111111112";
    const deposits = extractUsdcDepositsFromTransactions({
      walletAddress: WALLET,
      signatures: ["sig-foreign"],
      transactions: [
        parsedTx("sig-foreign", [], [
          balance(1, OTHER_WALLET, 50),
          balance(2, WALLET, 50, otherMint),
        ]),
      ],
      statuses: [{ confirmationStatus: "confirmed", err: null }],
    });
    expect(deposits).toEqual([]);
  });

  it("descarta una transacción cuya firma no es la solicitada al RPC", () => {
    const deposits = extractUsdcDepositsFromTransactions({
      walletAddress: WALLET,
      signatures: ["sig-requested"],
      transactions: [
        parsedTx("sig-otra", [balance(1, WALLET, 0)], [balance(1, WALLET, 90)]),
      ],
      statuses: [{ confirmationStatus: "confirmed", err: null }],
    });
    expect(deposits).toEqual([]);
  });

  it("una transacción fallida no se indexa como depósito", async () => {
    const candidates: UsdcDepositCandidate[] = extractUsdcDepositsFromTransactions({
      walletAddress: WALLET,
      signatures: ["sig-failed"],
      transactions: [
        parsedTx("sig-failed", [balance(1, WALLET, 0)], [balance(1, WALLET, 90)], {
          InstructionError: [0, "Custom"],
        }),
      ],
      statuses: [
        { confirmationStatus: "confirmed", err: { InstructionError: [0, "Custom"] } },
      ],
    });

    expect(candidates).toHaveLength(1);
    const result = await indexSolanaUsdcDeposits({
      userId: "user-deposit",
      walletAddress: WALLET,
      candidates,
      deps: {
        listKnownSignatures: async () => [],
        insertDeposit: async () => true,
      },
    });
    expect(result.indexed).toEqual([]);
    expect(result.rejected).toEqual([{ signature: "sig-failed", reason: "tx_error_onchain" }]);
  });

  it("netTokenDeltasByMint resta una cuenta cerrada", () => {
    const deltas = netTokenDeltasByMint({
      owner: WALLET,
      pre: [balance(1, WALLET, 30)],
      post: [],
    });
    expect(deltas.get(USDC_MINT_SOLANA)).toBe(-30);
  });

  it("sólo confirmed/finalized entran al libro durable", () => {
    expect(isDepositLedgerEligible("detected")).toBe(false);
    expect(isDepositLedgerEligible("confirmed")).toBe(true);
    expect(isDepositLedgerEligible("finalized")).toBe(true);
  });
});

describe("retiros: referencia única y origen de la sesión", () => {
  const base = {
    destinationAddress: OTHER_WALLET,
    sourceAddress: WALLET,
    mint: USDC_MINT,
    amountUi: 10,
    availableBalanceUi: 100,
    realTradingEnabled: true,
  } as const;

  it("dos retiros idénticos no comparten reference", () => {
    const first = validateAndPrepareWithdrawal({ ...base });
    const second = validateAndPrepareWithdrawal({ ...base });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(first.preparation.reference).not.toBe(second.preparation.reference);
    }
  });

  it("acepta el origen exacto de la sesión y rechaza otro", () => {
    const good = validateAndPrepareWithdrawal({ ...base, sessionWalletAddress: WALLET });
    expect(good.ok).toBe(true);

    const bad = validateAndPrepareWithdrawal({ ...base, sessionWalletAddress: OTHER_WALLET });
    expect(bad).toMatchObject({ ok: false, code: "VALIDATION", status: 400 });

    const empty = validateAndPrepareWithdrawal({ ...base, sessionWalletAddress: null });
    expect(empty).toMatchObject({ ok: false, code: "VALIDATION", status: 400 });
  });

  it("sin billetera de sesión informada mantiene la validación pura", () => {
    expect(validateAndPrepareWithdrawal({ ...base }).ok).toBe(true);
  });
});

describe("vinculación Supabase↔Privy: el bloqueo no depende de la ruta", () => {
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

  it("en demo (mock) la vinculación sigue abierta", () => {
    useMockAuth();
    expect(walletLinkingLocked()).toBe(false);
    expect(() => assertWalletLinkingOpen()).not.toThrow();
  });

  it("con identidad Supabase falla cerrado con REAL_DISABLED", () => {
    useSupabaseAuth();
    expect(walletLinkingLocked()).toBe(true);
    expect(codeOf(() => assertWalletLinkingOpen())).toBe("REAL_DISABLED");
    try {
      assertWalletLinkingOpen();
    } catch (error) {
      expect(error).toBeInstanceOf(DomainError);
      expect((error as DomainError).message).toBe(WALLET_LINKING_LOCKED_MESSAGE);
    }
  });

  it("el servicio también rechaza antes de verificar o tocar la base", async () => {
    useSupabaseAuth();
    await expect(
      syncVerifiedPrivyWallet({ userId: "user-1", requireVerified: true }),
    ).rejects.toMatchObject({ code: "REAL_DISABLED" });
  });
});

describe("Privy: respuesta y token atados a la identidad verificada", () => {
  const keys = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const PUBLIC_PEM = keys.publicKey.export({ type: "spki", format: "pem" }).toString();

  function base64Url(value: Buffer | string): string {
    return Buffer.from(value).toString("base64url");
  }

  function token(overrides: {
    sub?: string;
    aud?: string;
    iat?: number;
    exp?: number;
  } = {}): string {
    const now = Math.floor(Date.now() / 1000);
    const header = base64Url(JSON.stringify({ alg: "ES256", typ: "JWT" }));
    const payload = base64Url(
      JSON.stringify({
        iss: "privy.io",
        aud: overrides.aud ?? "app",
        sub: overrides.sub ?? DID_A,
        iat: overrides.iat ?? now - 10,
        exp: overrides.exp ?? now + 600,
      }),
    );
    const signature = signJwt("sha256", Buffer.from(`${header}.${payload}`), {
      key: keys.privateKey,
      dsaEncoding: "ieee-p1363",
    }).toString("base64url");
    return `${header}.${payload}.${signature}`;
  }

  function walletResponse(id: string): Response {
    return new Response(
      JSON.stringify({
        id,
        linked_accounts: [
          {
            type: "wallet",
            chain_type: "solana",
            address: WALLET,
            wallet_client_type: "privy",
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }

  it("rechaza una respuesta de Privy con otro DID", async () => {
    const fetchImpl = vi.fn(async () => walletResponse(DID_B));
    await expect(
      fetchPrivySolanaWallet({
        userId: DID_A,
        appId: "app",
        appSecret: "sec",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("acepta la respuesta del mismo DID", async () => {
    const fetchImpl = vi.fn(async () => walletResponse(DID_A));
    const wallet = await fetchPrivySolanaWallet({
      userId: DID_A,
      appId: "app",
      appSecret: "sec",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(wallet?.address).toBe(WALLET);
  });

  it("un token gigante se rechaza sin procesarlo", async () => {
    await expect(
      verifyPrivyAccessToken({ accessToken: "a".repeat(20_000), appId: "app" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("una ventana exp<=iat no se considera vigente", async () => {
    const now = Math.floor(Date.now() / 1000);
    await expect(
      verifyPrivyAccessToken({
        accessToken: token({ iat: now, exp: now }),
        appId: "app",
        verificationKey: PUBLIC_PEM,
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("un token vigente del DID correcto sí verifica", async () => {
    const claims = await verifyPrivyAccessToken({
      accessToken: token(),
      appId: "app",
      verificationKey: PUBLIC_PEM,
    });
    expect(claims.userId).toBe(DID_A);
  });
});
