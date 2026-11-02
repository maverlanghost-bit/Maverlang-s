import "server-only";

import { createHash } from "node:crypto";

import { DomainError } from "@/lib/api/result";
import { isSupabaseAuth } from "@/lib/auth/mode";
import { serverEnv } from "@/lib/env";
import { isValidSolanaAddress } from "@/lib/solana/address";
import { fetchPrivySolanaWallet, verifyPrivyAccessToken } from "@/lib/services/auth.privy";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * M66: billeteras Solana verificadas por usuario (`public.wallets`).
 * Vive en `lib/services/*.supabase.ts` para no sacar el cliente admin de la
 * lista blanca (M57).
 *
 * Regla de identidad: la dirección SIEMPRE nace de una verificación en el
 * servidor. Con una identidad real (Supabase) se exige un access token de
 * Privy firmado y vigente (`verifyPrivyAccessToken`), y la billetera se lee de
 * la API de Privy usando el `sub` verificado. El mock determinista queda
 * reservado a la demo (`AUTH_MODE=mock`) y nunca se usa para una cuenta real.
 *
 * La vinculación la inicia la sesión autenticada de Supabase presentando su
 * propio token de Privy. No se deduce ni se cruza por correo, nombre ni ningún
 * otro dato: si no hay token verificable o falta configuración, se falla
 * cerrado. Una dirección ya vinculada a otra cuenta no se reasigna.
 */

/** URL histórica; el endpoint real por usuario se construye en `auth.privy.ts`. */
export { PRIVY_USERS_ME_URL } from "@/lib/services/auth.privy";

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
  /** Usuario de Supabase al que se vincula la billetera. */
  userId: string;
  /** Access token de Privy del usuario (`Authorization: Bearer …` o cookie `privy-token`). */
  accessToken?: string | null;
  /**
   * `true` para identidades reales (Supabase): prohíbe el mock y exige token
   * verificado. La demo explícita (`AUTH_MODE=mock`) lo deja en `false`.
   */
  requireVerified?: boolean;
  /** Inyectable para tests; por defecto usa el `fetch` global. */
  fetchImpl?: typeof fetch;
  /** Overrides sólo para tests; por defecto lee `serverEnv`/`process.env`. */
  appId?: string;
  appSecret?: string;
  verificationKey?: string;
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
 * NO representa una billetera con fondos ni una identidad de Privy.
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

/**
 * Con una identidad real se persiste en Supabase aunque `DATA_MODE` sea mock:
 * `AUTH_MODE=supabase` ya implica que el proyecto existe y la billetera no
 * puede vivir en la memoria de una función serverless.
 */
function usesLiveWalletStore(): boolean {
  return serverEnv.DATA_MODE === "live" || isSupabaseAuth();
}

function adminWalletClient() {
  try {
    return createSupabaseAdminClient();
  } catch {
    throw new DomainError(
      "UPSTREAM",
      "No se puede guardar la billetera: falta la configuración de Supabase en el servidor.",
    );
  }
}

/**
 * Verifica la billetera Solana del usuario contra Privy.
 *
 * - Demo explícita (`requireVerified: false` + `DATA_MODE!=live`): wallet mock.
 * - Identidad real (`requireVerified: true` o `DATA_MODE=live`): exige token
 *   ES256 válido y app secret; sin ellos lanza `UNAUTHORIZED`/`UPSTREAM`.
 */
export async function verifyPrivySolanaWallet(
  params: PrivyWalletVerifyParams,
): Promise<VerifiedSolanaWallet> {
  const requireVerified = params.requireVerified === true;
  const dataMode = params.dataMode?.trim() || serverEnv.DATA_MODE;

  // El mock sólo es legítimo en la demo explícita, nunca con identidad Supabase.
  if (!requireVerified && dataMode !== "live") return mockSolanaWallet(params.userId);

  const accessToken = params.accessToken?.trim() ?? "";
  if (accessToken === "") {
    throw new DomainError(
      "UNAUTHORIZED",
      "Falta el token de Privy para verificar la billetera. Inicia sesión con Privy y vuelve a intentarlo.",
    );
  }
  const config = resolvePrivyConfig(params);
  if (config === null) {
    throw new DomainError(
      "UPSTREAM",
      "No se puede verificar la billetera: faltan NEXT_PUBLIC_PRIVY_APP_ID o PRIVY_APP_SECRET en el servidor.",
    );
  }

  const claims = await verifyPrivyAccessToken({
    accessToken,
    appId: config.appId,
    verificationKey: params.verificationKey,
  });
  const linked = await fetchPrivySolanaWallet({
    userId: claims.userId,
    appId: config.appId,
    appSecret: config.appSecret,
    fetchImpl: params.fetchImpl,
  });
  if (linked === null) {
    throw new DomainError("VALIDATION", "Tu cuenta de Privy no tiene una billetera Solana verificada.");
  }
  if (!isValidSolanaAddress(linked.address)) {
    throw new DomainError("VALIDATION", "La billetera Solana devuelta por Privy no es válida.");
  }
  return {
    address: linked.address,
    chain: "solana",
    walletClientType: linked.walletClientType,
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

function assertMockOwnerIsFree(userId: string, wallet: VerifiedSolanaWallet): void {
  for (const [ownerId, rows] of mockWalletStore) {
    if (ownerId === userId) continue;
    const taken = rows.some((row) => row.chain === wallet.chain && row.address === wallet.address);
    if (taken) {
      throw new DomainError("VALIDATION", "Esa billetera ya está vinculada a otra cuenta.");
    }
  }
}

async function persistMockWallet(userId: string, wallet: VerifiedSolanaWallet): Promise<StoredWallet> {
  const now = new Date().toISOString();
  assertMockOwnerIsFree(userId, wallet);
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

const WALLET_COLUMNS =
  "user_id,chain,address,privy_wallet_id,wallet_client_type,is_primary,verified_at,created_at";

async function persistSupabaseWallet(
  userId: string,
  wallet: VerifiedSolanaWallet,
): Promise<StoredWallet> {
  const admin = adminWalletClient();
  const now = new Date().toISOString();

  // Unicidad por (chain, address): nunca se reasigna una billetera de otra cuenta.
  const { data: existing, error: existingError } = await admin
    .from("wallets")
    .select("user_id")
    .eq("chain", wallet.chain)
    .eq("address", wallet.address)
    .maybeSingle();
  if (existingError) throw new DomainError("INTERNAL");
  const owner =
    existing && typeof (existing as Record<string, unknown>).user_id === "string"
      ? ((existing as Record<string, unknown>).user_id as string)
      : null;
  if (owner !== null && owner !== userId) {
    throw new DomainError("VALIDATION", "Esa billetera ya está vinculada a otra cuenta.");
  }

  const values = {
    privy_wallet_id: wallet.privyWalletId,
    wallet_client_type: wallet.walletClientType,
    verified_at: now,
    updated_at: now,
  };

  // Se inserta SIN primaria: si el `unique (chain, address)` choca con una
  // fila de otra cuenta, no se toca nada. El `upsert` anterior podía cambiar
  // el `user_id` de la fila existente y "robar" la billetera en una carrera.
  if (owner === null) {
    const inserted = await admin
      .from("wallets")
      .insert({
        user_id: userId,
        chain: wallet.chain,
        address: wallet.address,
        ...values,
        is_primary: false,
      })
      .select(WALLET_COLUMNS)
      .single();
    if (inserted.error || !inserted.data) {
      // 23505 = unique_violation: otra request la vinculó entre el SELECT y el INSERT.
      if (inserted.error?.code === "23505") {
        const raced = await admin
          .from("wallets")
          .select("user_id")
          .eq("chain", wallet.chain)
          .eq("address", wallet.address)
          .maybeSingle();
        const racedOwner =
          raced.data && typeof (raced.data as Record<string, unknown>).user_id === "string"
            ? ((raced.data as Record<string, unknown>).user_id as string)
            : null;
        if (racedOwner !== userId) {
          throw new DomainError("VALIDATION", "Esa billetera ya está vinculada a otra cuenta.");
        }
        const updated = await admin
          .from("wallets")
          .update(values)
          .eq("user_id", userId)
          .eq("chain", wallet.chain)
          .eq("address", wallet.address)
          .select(WALLET_COLUMNS)
          .single();
        if (updated.error || !updated.data) throw new DomainError("INTERNAL");
      } else {
        throw new DomainError("INTERNAL");
      }
    }
  } else {
    const updated = await admin
      .from("wallets")
      .update(values)
      .eq("user_id", userId)
      .eq("chain", wallet.chain)
      .eq("address", wallet.address)
      .select(WALLET_COLUMNS)
      .single();
    if (updated.error || !updated.data) throw new DomainError("INTERNAL");
  }

  // Sólo una primaria por usuario y cadena: se desmarcan las demás primero.
  const cleared = await admin
    .from("wallets")
    .update({ is_primary: false, updated_at: now })
    .eq("user_id", userId)
    .eq("chain", wallet.chain)
    .eq("is_primary", true)
    .neq("address", wallet.address);
  if (cleared.error) throw new DomainError("INTERNAL");

  const primary = await admin
    .from("wallets")
    .update({ is_primary: true, updated_at: now })
    .eq("user_id", userId)
    .eq("chain", wallet.chain)
    .eq("address", wallet.address)
    .select(WALLET_COLUMNS)
    .single();
  if (primary.error || !primary.data) throw new DomainError("INTERNAL");
  return walletRowOf(primary.data as Record<string, unknown>);
}

async function persistVerifiedWallet(userId: string, wallet: VerifiedSolanaWallet): Promise<StoredWallet> {
  if (!usesLiveWalletStore()) return persistMockWallet(userId, wallet);
  return persistSupabaseWallet(userId, wallet);
}

/**
 * Verifica (Privy o, sólo en demo, mock determinista) y persiste en
 * `public.wallets`. La dirección guardada sale SIEMPRE de
 * `verifyPrivySolanaWallet`; el cuerpo del cliente no aporta direcciones.
 */
export async function syncVerifiedPrivyWallet(params: PrivyWalletSyncParams): Promise<StoredWallet> {
  const verified = await verifyPrivySolanaWallet(params);
  return persistVerifiedWallet(params.userId, verified);
}

/** Billeteras verificadas del usuario. La primaria queda primero en demo. */
export async function getUserWallets(userId: string): Promise<StoredWallet[]> {
  if (!usesLiveWalletStore()) {
    return [...(mockWalletStore.get(userId) ?? [])].sort(
      (a, b) => Number(b.isPrimary) - Number(a.isPrimary),
    );
  }
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from("wallets")
      .select("user_id,chain,address,privy_wallet_id,wallet_client_type,is_primary,verified_at,created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    if (error || !data) return [];
    return (data as Record<string, unknown>[]).map(walletRowOf);
  } catch {
    // Sin configuración de Supabase no hay billetera verificable: fail-closed.
    return [];
  }
}
