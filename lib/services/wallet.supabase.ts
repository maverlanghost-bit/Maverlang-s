import "server-only";

import { createHash } from "node:crypto";

import { DomainError } from "@/lib/api/result";
import { isSupabaseAuth } from "@/lib/auth/mode";
import {
  assertDepositIdentityAllowed,
  normalizeDepositEmail,
  type DepositIdentity,
} from "@/lib/deposits/pilot";
import { serverEnv } from "@/lib/env";
import { isValidSolanaAddress } from "@/lib/solana/address";
import {
  fetchPrivyLinkedIdentity,
  fetchPrivySolanaWallet,
  verifyPrivyAccessToken,
} from "@/lib/services/auth.privy";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isMissingSchemaError } from "@/lib/supabase/schema-error";
import {
  buildWalletLinkMessage,
  createWalletLinkNonce,
  verifyWalletLinkSignature,
  walletLinkNonceHash,
  WALLET_LINK_CHAIN,
  WALLET_LINK_PURPOSE,
  WALLET_LINK_TTL_MS,
  type WalletLinkMessageInput,
} from "@/lib/wallet/link-challenge";
import {
  challengeMessageInput,
  consumeWalletLinkChallenge,
  insertWalletLinkChallenge,
  purgeExpiredWalletLinkChallenges,
} from "@/lib/wallet/link-challenge-store";
import {
  planPrivyWalletBinding,
  PRIVY_BINDING_MIGRATION,
  PRIVY_DID_PREFIX,
  type WalletBindingRow,
} from "@/lib/wallet/identity";
import { assertWalletLinkingOpen } from "@/lib/wallet/linking-policy";
import type { WalletLinkingProof } from "@/lib/wallet/linking-proof";

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
 *
 * Desde 0040 el DID verificado (`did:privy:…`) se guarda en
 * `wallets.privy_user_id` con índice único. Eso convierte la asociación en
 * algo persistente y auditable: un DID pertenece a una sola cuenta Supabase y
 * una cuenta no puede alternar de DID. Si la columna no existe, la vinculación
 * real falla cerrada; la demo en memoria sigue igual.
 */

/** URL histórica; el endpoint real por usuario se construye en `auth.privy.ts`. */
export { PRIVY_USERS_ME_URL } from "@/lib/services/auth.privy";

export type WalletClientType = "privy" | "external";

export interface VerifiedSolanaWallet {
  address: string;
  chain: "solana";
  walletClientType: WalletClientType;
  privyWalletId: string | null;
  /** DID de Privy que demostró poseer la billetera; `null` en la demo. */
  privyUserId: string | null;
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
  /**
   * Identidad de Supabase Auth (correo verificado). Con identidad real
   * (`isSupabaseAuth()`) se exige correo verificado: sin él no se vincula nada.
   */
  identity?: DepositIdentity;
  /**
   * Desafío firmado que devolvió `/api/me/wallet/challenge`. Con identidad
   * Supabase es obligatorio: sin nonce ni firma no se vincula.
   */
  proof?: WalletLinkingProof | null;
  /** Dominio atado al mensaje. Con identidad Supabase es obligatorio. */
  domain?: string | null;
  /** Inyectable para tests; por defecto `new Date()`. */
  now?: Date;
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
  return {
    address,
    chain: "solana",
    walletClientType: "privy",
    privyWalletId: null,
    privyUserId: null,
    source: "mock",
  };
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
    privyUserId: claims.userId,
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

type BindingQueryError = { code?: string; message?: string } | null;

interface WalletWriteResult {
  data: unknown;
  error: BindingQueryError;
}

interface WalletBindingState {
  byPrivyUser: WalletBindingRow | null;
  byAddress: WalletBindingRow | null;
  userRows: WalletBindingRow[];
}

/**
 * La migración 0040 es requisito para vincular en real. Si todavía no está
 * aplicada, se falla cerrado con un mensaje explícito en vez de guardar una
 * billetera sin identidad demostrable.
 */
function throwBindingQueryError(error: BindingQueryError): void {
  if (!error) return;
  if (isMissingSchemaError(error)) {
    throw new DomainError(
      "UPSTREAM",
      `No se puede verificar la identidad de la billetera: falta la migración ${PRIVY_BINDING_MIGRATION} en Supabase.`,
    );
  }
  throw new DomainError("INTERNAL");
}

function bindingRowOf(data: unknown): WalletBindingRow | null {
  if (data === null || data === undefined) return null;
  if (typeof data !== "object") throw new DomainError("INTERNAL");
  const row = data as Record<string, unknown>;
  const userId = typeof row.user_id === "string" ? row.user_id : "";
  const address = typeof row.address === "string" ? row.address : "";
  if (userId === "" || address === "") throw new DomainError("INTERNAL");
  const privyUserId =
    typeof row.privy_user_id === "string" && row.privy_user_id.trim() !== ""
      ? row.privy_user_id.trim()
      : null;
  return { userId, address, privyUserId };
}

function bindingRowsOf(data: unknown): WalletBindingRow[] {
  if (!Array.isArray(data)) throw new DomainError("INTERNAL");
  return data
    .map((row) => bindingRowOf(row))
    .filter((row): row is WalletBindingRow => row !== null);
}

async function readWalletBindingState(
  admin: ReturnType<typeof adminWalletClient>,
  userId: string,
  address: string,
  privyUserId: string,
): Promise<WalletBindingState> {
  const [byPrivy, byAddress, userRows] = await Promise.all([
    admin
      .from("wallets")
      .select("user_id,address,privy_user_id")
      .eq("privy_user_id", privyUserId)
      .maybeSingle(),
    admin
      .from("wallets")
      .select("user_id,address,privy_user_id")
      .eq("chain", "solana")
      .eq("address", address)
      .maybeSingle(),
    admin.from("wallets").select("user_id,address,privy_user_id").eq("user_id", userId),
  ]);
  throwBindingQueryError(byPrivy.error);
  throwBindingQueryError(byAddress.error);
  throwBindingQueryError(userRows.error);
  return {
    byPrivyUser: bindingRowOf(byPrivy.data),
    byAddress: bindingRowOf(byAddress.data),
    userRows: bindingRowsOf(userRows.data),
  };
}

async function writeWalletBinding(
  admin: ReturnType<typeof adminWalletClient>,
  action: "insert" | "update" | "move",
  params: {
    userId: string;
    address: string;
    privyUserId: string;
    values: Record<string, unknown>;
  },
): Promise<WalletWriteResult> {
  if (action === "insert") {
    const query = admin
      .from("wallets")
      .insert({
        user_id: params.userId,
        chain: "solana",
        address: params.address,
        ...params.values,
        is_primary: false,
      })
      .select(WALLET_COLUMNS)
      .single();
    return (await query) as unknown as WalletWriteResult;
  }
  if (action === "move") {
    // Mismo DID, dirección nueva: se mueve la fila existente (no se crea una
    // segunda identidad). La comparación de la dirección es exacta.
    const query = admin
      .from("wallets")
      .update({ ...params.values, address: params.address })
      .eq("user_id", params.userId)
      .eq("chain", "solana")
      .eq("privy_user_id", params.privyUserId)
      .select(WALLET_COLUMNS)
      .single();
    return (await query) as unknown as WalletWriteResult;
  }
  const query = admin
    .from("wallets")
    .update(params.values)
    .eq("user_id", params.userId)
    .eq("chain", "solana")
    .eq("address", params.address)
    .select(WALLET_COLUMNS)
    .single();
  return (await query) as unknown as WalletWriteResult;
}

async function persistSupabaseWallet(
  userId: string,
  wallet: VerifiedSolanaWallet,
): Promise<StoredWallet> {
  const privyUserId = wallet.privyUserId?.trim() ?? "";
  if (wallet.source !== "privy" || !privyUserId.startsWith(PRIVY_DID_PREFIX)) {
    throw new DomainError(
      "UPSTREAM",
      "No se puede guardar la billetera sin una identidad de Privy verificada.",
    );
  }

  const admin = adminWalletClient();
  const now = new Date().toISOString();
  const address = wallet.address.trim();
  const values = {
    privy_wallet_id: wallet.privyWalletId,
    privy_user_id: privyUserId,
    wallet_client_type: wallet.walletClientType,
    verified_at: now,
    updated_at: now,
  };

  let saved: Record<string, unknown> | null = null;
  // Dos intentos: si otra request gana la carrera del índice único, se relee
  // el estado y se vuelve a decidir. Nunca se reasigna a otro dueño.
  for (let attempt = 0; attempt < 2 && saved === null; attempt += 1) {
    const state = await readWalletBindingState(admin, userId, address, privyUserId);
    const action = planPrivyWalletBinding({
      userId,
      privyUserId,
      address,
      ...state,
    });
    const result = await writeWalletBinding(admin, action, {
      userId,
      address,
      privyUserId,
      values,
    });
    if (!result.error && result.data) {
      saved = result.data as Record<string, unknown>;
      break;
    }
    // 23505 = unique_violation: DID o dirección tomados entre la lectura y la
    // escritura. Sólo es reintentable; la próxima lectura decide con datos
    // frescos y rechaza si el dueño es otra cuenta.
    if (result.error?.code !== "23505") throw new DomainError("INTERNAL");
  }
  if (saved === null) throw new DomainError("INTERNAL");

  // Sólo una primaria por usuario y cadena: se desmarcan las demás primero.
  const cleared = await admin
    .from("wallets")
    .update({ is_primary: false, updated_at: now })
    .eq("user_id", userId)
    .eq("chain", wallet.chain)
    .eq("is_primary", true)
    .neq("address", address);
  if (cleared.error) throw new DomainError("INTERNAL");

  const primary = await admin
    .from("wallets")
    .update({ is_primary: true, updated_at: now })
    .eq("user_id", userId)
    .eq("chain", wallet.chain)
    .eq("address", address)
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
 * Correo de Privy vs correo verificado de Supabase.
 *
 * Si Privy expone al menos un correo vinculado y la cuenta Supabase tiene
 * correo verificado, tienen que coincidir (normalizado). Si Privy no expone
 * correo, no hay nada que comparar: la prueba sigue siendo la firma de la
 * billetera atada al DID. Un correo distinto se rechaza: vincular una cuenta
 * de Privy de otra persona permitiría mezclar billeteras.
 */
export function assertPrivyEmailConsistency(
  privyEmails: readonly string[] | null | undefined,
  supabaseEmail: string | null | undefined,
): void {
  const own = normalizeDepositEmail(supabaseEmail);
  if (!own) return;
  const emails = (privyEmails ?? [])
    .map((email) => normalizeDepositEmail(email))
    .filter((email): email is string => email !== null);
  if (emails.length === 0) return;
  if (!emails.includes(own)) {
    throw new DomainError(
      "VALIDATION",
      "El correo de tu cuenta de Privy no coincide con el correo verificado de esta cuenta.",
    );
  }
}

interface VerifiedPrivyBinding {
  privyUserId: string;
  address: string;
  walletClientType: "privy" | "external";
  privyWalletId: string | null;
  emails: string[];
}

/**
 * Verifica el token de Privy y resuelve la billetera que ESE DID tiene en
 * Privy. La dirección nunca sale del cuerpo del cliente.
 */
async function resolveVerifiedPrivyBinding(
  params: PrivyWalletVerifyParams,
): Promise<VerifiedPrivyBinding> {
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
  const identity = await fetchPrivyLinkedIdentity({
    userId: claims.userId,
    appId: config.appId,
    appSecret: config.appSecret,
    fetchImpl: params.fetchImpl,
  });
  if (identity.wallet === null) {
    throw new DomainError("VALIDATION", "Tu cuenta de Privy no tiene una billetera Solana verificada.");
  }
  if (!isValidSolanaAddress(identity.wallet.address)) {
    throw new DomainError("VALIDATION", "La billetera Solana devuelta por Privy no es válida.");
  }
  return {
    privyUserId: claims.userId,
    address: identity.wallet.address,
    walletClientType: identity.wallet.walletClientType,
    privyWalletId: identity.wallet.privyWalletId,
    emails: identity.emails,
  };
}

export interface WalletLinkChallengeIssued {
  nonce: string;
  message: string;
  address: string;
  chain: typeof WALLET_LINK_CHAIN;
  purpose: typeof WALLET_LINK_PURPOSE;
  domain: string;
  issuedAt: string;
  expiresAt: string;
}

/**
 * Emite un desafío de vinculación. Sólo con identidad Supabase y correo
 * verificado: la identidad (usuario + correo verificado) y la billetera (DID
 * de Privy) salen del servidor, nunca del cuerpo. El nonce se guarda hasheado;
 * el mensaje exacto se devuelve al cliente para que lo firme.
 */
export async function issueWalletLinkChallenge(
  params: PrivyWalletVerifyParams & { domain: string },
): Promise<WalletLinkChallengeIssued> {
  if (!isSupabaseAuth()) {
    throw new DomainError(
      "REAL_DISABLED",
      "La vinculación de billetera sólo está disponible con una cuenta real.",
    );
  }
  assertDepositIdentityAllowed({
    email: params.identity?.email,
    emailVerified: params.identity?.emailVerified,
  });
  const binding = await resolveVerifiedPrivyBinding(params);
  assertPrivyEmailConsistency(binding.emails, params.identity?.email);

  const now = params.now ?? new Date();
  const issuedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + WALLET_LINK_TTL_MS).toISOString();
  const nonce = createWalletLinkNonce();
  const messageInput: WalletLinkMessageInput = {
    domain: params.domain,
    userId: params.userId,
    privyUserId: binding.privyUserId,
    address: binding.address,
    nonce,
    issuedAt,
    expiresAt,
  };
  const message = buildWalletLinkMessage(messageInput);

  const admin = adminWalletClient();
  await purgeExpiredWalletLinkChallenges(admin, params.userId, now);
  await insertWalletLinkChallenge(admin, {
    nonceHash: walletLinkNonceHash(nonce),
    userId: params.userId,
    privyUserId: binding.privyUserId,
    address: binding.address,
    domain: messageInput.domain,
    issuedAt,
    expiresAt,
    message,
  });

  return {
    nonce,
    message,
    address: binding.address,
    chain: WALLET_LINK_CHAIN,
    purpose: WALLET_LINK_PURPOSE,
    domain: messageInput.domain,
    issuedAt,
    expiresAt,
  };
}

/**
 * Vincula la billetera sólo después de consumir el desafío y verificar la
 * firma ed25519. Orden: identidad (correo verificado) → prueba declarada →
 * token/DID → billetera de Privy → correo → consumo atómico del nonce →
 * mensaje exacto → firma → persistencia única.
 *
 * El consumo ocurre antes de verificar la firma: una firma inválida quema el
 * nonce (falla cerrado), y dos requests concurrentes con el mismo nonce sólo
 * pueden consumirlo una vez. Si la persistencia falla después, el usuario
 * pide un desafío nuevo; nunca queda una vinculación a medias.
 */
export async function linkVerifiedPrivyWallet(
  params: PrivyWalletVerifyParams & { proof: WalletLinkingProof; domain: string },
): Promise<StoredWallet> {
  if (!isSupabaseAuth()) {
    throw new DomainError(
      "REAL_DISABLED",
      "La vinculación de billetera sólo está disponible con una cuenta real.",
    );
  }
  assertDepositIdentityAllowed({
    email: params.identity?.email,
    emailVerified: params.identity?.emailVerified,
  });
  assertWalletLinkingOpen(params.proof);
  const binding = await resolveVerifiedPrivyBinding(params);
  assertPrivyEmailConsistency(binding.emails, params.identity?.email);

  const admin = adminWalletClient();
  const consumed = await consumeWalletLinkChallenge(admin, {
    nonce: params.proof.nonce,
    userId: params.userId,
    privyUserId: binding.privyUserId,
    address: binding.address,
    domain: params.domain,
    now: params.now,
  });
  if (consumed === null) {
    // Mismo mensaje para inexistente, vencido, usado o mal atado: no se filtra
    // cuál de los cuatro falló.
    throw new DomainError(
      "UNAUTHORIZED",
      "La prueba de la billetera no es válida o venció. Vuelve a intentarlo.",
    );
  }

  const expectedMessage = buildWalletLinkMessage(
    challengeMessageInput(consumed, {
      domain: params.domain,
      userId: params.userId,
      privyUserId: binding.privyUserId,
      address: binding.address,
      nonce: params.proof.nonce,
    }),
  );
  if (expectedMessage !== consumed.message) {
    throw new DomainError("UNAUTHORIZED", "La prueba de la billetera no corresponde a esta cuenta.");
  }
  if (
    !verifyWalletLinkSignature({
      message: consumed.message,
      address: binding.address,
      signature: params.proof.signature,
    })
  ) {
    throw new DomainError("UNAUTHORIZED", "La firma de la billetera no es válida.");
  }

  return persistSupabaseWallet(params.userId, {
    address: binding.address,
    chain: "solana",
    walletClientType: binding.walletClientType,
    privyWalletId: binding.privyWalletId,
    privyUserId: binding.privyUserId,
    source: "privy",
  });
}

/**
 * Verifica (Privy o, sólo en demo, mock determinista) y persiste en
 * `public.wallets`. La dirección guardada sale SIEMPRE de
 * `verifyPrivySolanaWallet`; el cuerpo del cliente no aporta direcciones.
 *
 * Con identidad Supabase delega en `linkVerifiedPrivyWallet`: exige desafío
 * firmado, correo verificado y billetera de Privy. La demo en memoria
 * (`AUTH_MODE=mock`) conserva su billetera determinista y no usa este flujo.
 */
export async function syncVerifiedPrivyWallet(params: PrivyWalletSyncParams): Promise<StoredWallet> {
  if (isSupabaseAuth()) {
    if (!params.proof || !params.domain) {
      // Defensa en profundidad: la ruta ya exige ambos, pero el servicio no
      // puede quedar abierto para un llamador futuro.
      assertWalletLinkingOpen(params.proof);
      throw new DomainError(
        "VALIDATION",
        "La vinculación exige el desafío firmado de tu billetera y su dominio.",
      );
    }
    return linkVerifiedPrivyWallet({
      ...params,
      proof: params.proof,
      domain: params.domain,
    });
  }
  const verified = await verifyPrivySolanaWallet(params);
  return persistVerifiedWallet(params.userId, verified);
}

/**
 * Billeteras verificadas del usuario. La primaria queda primero en demo.
 *
 * En el store real sólo cuentan las filas con un DID de Privy persistido
 * (0040): una fila antigua sin DID no demuestra qué identidad la vinculó y,
 * por lo tanto, no se expone ni se usa como billetera verificada. Esas filas
 * requieren volver a sincronizar. Si falta la columna, la lectura devuelve
 * vacío (fail-closed), nunca una billetera sin identidad demostrable.
 */
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
      .select(
        "user_id,chain,address,privy_wallet_id,wallet_client_type,is_primary,verified_at,created_at,privy_user_id",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    if (error || !data) return [];
    return (data as Record<string, unknown>[])
      .filter((row) => {
        const did = typeof row.privy_user_id === "string" ? row.privy_user_id.trim() : "";
        return did.startsWith(PRIVY_DID_PREFIX);
      })
      .map(walletRowOf);
  } catch {
    // Sin configuración de Supabase no hay billetera verificable: fail-closed.
    return [];
  }
}
