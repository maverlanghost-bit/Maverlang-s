import "server-only";

import { createHash } from "node:crypto";

import { DomainError } from "@/lib/api/result";
import { serverEnv } from "@/lib/env";
import { isValidSolanaAddress } from "@/lib/solana/address";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * M66: billeteras Solana verificadas por usuario (`public.wallets`).
 * Vive en `lib/services/*.supabase.ts` para no sacar el cliente admin de la
 * lista blanca (M57). La dirección SIEMPRE nace de una verificación en el
 * servidor contra Privy (o del mock determinista del modo demo): ningún
 * endpoint acepta una dirección que venga del cliente.
 */

export const PRIVY_USERS_ME_URL = "https://auth.privy.io/api/v1/users/me";

export type WalletClientType = "privy" | "external";

export interface VerifiedSolanaWallet {
  address: string;
  chain: "solana";
  walletClientType: WalletClientType;
  privyWalletId: string | null;
  /** `privy` = verificada contra la API; `mock` = demo determinista. */
  source: "privy" | "mock";
}

export interface StoredWallet {
  userId: string;
  chain: "solana";
  address: string;
  walletClientType: WalletClientType;
  privyWalletId: string | null;
  isPrimary: boolean;
  verifiedAt: string;
  createdAt: string;
}

export interface PrivyWalletVerifyParams {
  userId: string;
  /** Access token de Privy del usuario (`Authorization: Bearer …`). */
  accessToken?: string | null;
  /** Inyectable para tests; por defecto usa el `fetch` global. */
  fetchImpl?: typeof fetch;
  /** Overrides sólo para tests; por defecto lee `serverEnv`. */
  appId?: string;
  appSecret?: string;
  dataMode?: string;
}

export type PrivyWalletSyncParams = PrivyWalletVerifyParams;

const B58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** Base58 (Bitcoin/Solana). Espejo de `decodeBase58` de `lib/solana/address`. */
function encodeBase58(bytes: Uint8Array): string {
  const digits: number[] = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let j = 0; j < digits.length; j += 1) {
      carry += (digits[j] ?? 0) * 256;
      digits[j] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  let encoded = "";
  for (let i = digits.length - 1; i >= 0; i -= 1) encoded += B58_ALPHABET.charAt(digits[i] ?? 0);
  for (const byte of bytes) {
    if (byte !== 0) break;
    encoded = `1${encoded}`;
  }
  return encoded;
}

/**
 * Wallet mock determinista del modo demo: sha256(userId) → 32 bytes → base58.
 * Siempre es una dirección Solana válida en formato y estable por usuario.
 */
function mockSolanaWallet(userId: string): VerifiedSolanaWallet {
  const digest = createHash("sha256").update(`maverlang-m66-mock-wallet:${userId}`).digest();
  const address = encodeBase58(new Uint8Array(digest));
  if (!isValidSolanaAddress(address)) {
    // Inalcanzable con el encoder probado; si algún día cambia, falla ruidoso.
    throw new DomainError("INTERNAL");
  }
  return { address, chain: "solana", walletClientType: "privy", privyWalletId: null, source: "mock" };
}

function resolvePrivyConfig(params: PrivyWalletVerifyParams): { appId: string; appSecret: string } | null {
  const appId = params.appId?.trim() || serverEnv.NEXT_PUBLIC_PRIVY_APP_ID?.trim() || "";
  const appSecret = params.appSecret?.trim() || serverEnv.PRIVY_APP_SECRET?.trim() || "";
  if (appId === "" || appSecret === "") return null;
  return { appId, appSecret };
}

interface PrivyLinkedWallet {
  address: string;
  walletClientType: string | null;
  privyWalletId: string | null;
}

/** Tolerante al shape de Privy: `linked_accounts` (o `wallets`) con wallets. */
function extractSolanaWallet(payload: unknown): PrivyLinkedWallet | null {
  if (typeof payload !== "object" || payload === null) return null;
  const record = payload as Record<string, unknown>;
  const candidates = [
    ...(Array.isArray(record.linked_accounts) ? record.linked_accounts : []),
    ...(Array.isArray(record.wallets) ? record.wallets : []),
  ];
  for (const raw of candidates) {
    if (typeof raw !== "object" || raw === null) continue;
    const account = raw as Record<string, unknown>;
    const type = typeof account.type === "string" ? account.type : null;
    if (type !== null && type !== "wallet") continue;
    const chain =
      typeof account.chain_type === "string"
        ? account.chain_type
        : typeof account.chain === "string"
          ? account.chain
          : null;
    if (chain !== "solana") continue;
    const address = typeof account.address === "string" ? account.address.trim() : "";
    if (address === "") continue;
    const walletClientType =
      typeof account.wallet_client_type === "string" ? account.wallet_client_type : null;
    const privyWalletId =
      typeof account.id === "string" ? account.id : typeof account.wallet_id === "string" ? account.wallet_id : null;
    return { address, walletClientType, privyWalletId };
  }
  return null;
}

/**
 * Verifica la wallet Solana del usuario contra Privy (`GET /users/me` con el
 * access token). Sin credenciales de Privy, sin token o en `DATA_MODE=mock`
 * devuelve la wallet mock determinista del usuario: la demo nunca toca la red.
 */
export async function verifyPrivySolanaWallet(
  params: PrivyWalletVerifyParams,
): Promise<VerifiedSolanaWallet> {
  const config = resolvePrivyConfig(params);
  const accessToken = params.accessToken?.trim() ?? "";
  const dataMode = params.dataMode?.trim() || serverEnv.DATA_MODE;
  if (dataMode !== "live" || accessToken === "" || config === null) {
    return mockSolanaWallet(params.userId);
  }
  const fetchImpl = params.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(PRIVY_USERS_ME_URL, {
      headers: {
        authorization: `Bearer ${accessToken}`,
        "privy-app-id": config.appId,
        "privy-ca-secret": config.appSecret,
      },
    });
  } catch {
    throw new DomainError("INTERNAL");
  }
  // 4xx/5xx del IdP: genérico y sin eco del cuerpo (el detalle queda en logs).
  if (!response.ok) throw new DomainError("INTERNAL");
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new DomainError("INTERNAL");
  }
  const linked = extractSolanaWallet(payload);
  if (linked === null) {
    throw new DomainError("VALIDATION", "Tu cuenta no tiene una billetera Solana verificada.");
  }
  if (!isValidSolanaAddress(linked.address)) {
    throw new DomainError("VALIDATION", "La billetera Solana devuelta no es válida.");
  }
  // Privy etiqueta `privy` a las embedded; el resto (Phantom, wallet_connect…)
  // es externa. Sin el campo, el flujo estándar de Maverlang es embedded.
  return {
    address: linked.address,
    chain: "solana",
    walletClientType:
      linked.walletClientType === null || linked.walletClientType === "privy" ? "privy" : "external",
    privyWalletId: linked.privyWalletId,
    source: "privy",
  };
}

function walletRowOf(row: Record<string, unknown>): StoredWallet {
  const fallbackDate = new Date().toISOString();
  return {
    userId: typeof row.user_id === "string" ? row.user_id : "",
    chain: "solana",
    address: typeof row.address === "string" ? row.address : "",
    walletClientType: row.wallet_client_type === "external" ? "external" : "privy",
    privyWalletId: typeof row.privy_wallet_id === "string" ? row.privy_wallet_id : null,
    isPrimary: row.is_primary === true,
    verifiedAt: typeof row.verified_at === "string" ? row.verified_at : fallbackDate,
    createdAt: typeof row.created_at === "string" ? row.created_at : fallbackDate,
  };
}

/** Store en memoria del modo demo/mock (y de los tests unitarios). */
const mockWalletStore = new Map<string, StoredWallet[]>();

/** Sólo tests: vacía el store en memoria del modo demo. */
export function resetMockWalletsForTests(): void {
  mockWalletStore.clear();
}

async function persistVerifiedWallet(userId: string, wallet: VerifiedSolanaWallet): Promise<StoredWallet> {
  const now = new Date().toISOString();
  if (serverEnv.DATA_MODE !== "live") {
    const list = mockWalletStore.get(userId) ?? [];
    const existing = list.find((row) => row.address === wallet.address && row.chain === wallet.chain);
    const others = list
      .filter((row) => row !== existing)
      .map((row) => (row.chain === wallet.chain ? { ...row, isPrimary: false } : row));
    const row: StoredWallet = {
      userId,
      chain: "solana",
      address: wallet.address,
      walletClientType: wallet.walletClientType,
      privyWalletId: wallet.privyWalletId,
      isPrimary: true,
      verifiedAt: now,
      createdAt: existing?.createdAt ?? now,
    };
    mockWalletStore.set(userId, [row, ...others]);
    return row;
  }
  const admin = createSupabaseAdminClient();
  // Sólo una primaria por usuario y cadena: se desmarcan las demás primero.
  await admin
    .from("wallets")
    .update({ is_primary: false, updated_at: now })
    .eq("user_id", userId)
    .eq("chain", wallet.chain)
    .eq("is_primary", true);
  const { data, error } = await admin
    .from("wallets")
    .upsert(
      {
        user_id: userId,
        chain: wallet.chain,
        address: wallet.address,
        privy_wallet_id: wallet.privyWalletId,
        wallet_client_type: wallet.walletClientType,
        is_primary: true,
        verified_at: now,
        updated_at: now,
      },
      // `unique (chain, address)` de 0029 hace el upsert idempotente.
      { onConflict: "chain,address" },
    )
    .select("user_id,chain,address,privy_wallet_id,wallet_client_type,is_primary,verified_at,created_at")
    .single();
  if (error || !data) throw new DomainError("INTERNAL");
  return walletRowOf(data as Record<string, unknown>);
}

/**
 * Verifica (Privy o mock determinista) y persiste en `public.wallets`.
 * La dirección guardada sale SIEMPRE de `verifyPrivySolanaWallet`.
 */
export async function syncVerifiedPrivyWallet(params: PrivyWalletSyncParams): Promise<StoredWallet> {
  const verified = await verifyPrivySolanaWallet(params);
  return persistVerifiedWallet(params.userId, verified);
}

/** Billeteras verificadas del usuario. La primaria queda primero en demo. */
export async function getUserWallets(userId: string): Promise<StoredWallet[]> {
  if (serverEnv.DATA_MODE !== "live") {
    return [...(mockWalletStore.get(userId) ?? [])].sort(
      (a, b) => Number(b.isPrimary) - Number(a.isPrimary),
    );
  }
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("wallets")
    .select("user_id,chain,address,privy_wallet_id,wallet_client_type,is_primary,verified_at,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map(walletRowOf);
}
