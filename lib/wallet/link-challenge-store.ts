import "server-only";

import { DomainError } from "@/lib/api/result";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isMissingSchemaError } from "@/lib/supabase/schema-error";
import {
  WALLET_LINK_CHAIN,
  WALLET_LINK_PURPOSE,
  walletLinkNonceHash,
  type WalletLinkMessageInput,
} from "@/lib/wallet/link-challenge";

/**
 * Persistencia del desafío de vinculación (migración 0050).
 *
 * El nonce en claro nunca se guarda: la clave primaria es su SHA-256. El
 * consumo es UN solo UPDATE condicional sobre `consumed_at is null` y
 * `expires_at > now()`, además de usuario, DID, dirección, cadena, dominio y
 * propósito. Bajo READ COMMITTED, PostgreSQL bloquea la fila y reevalúa el
 * WHERE sobre la versión nueva: si dos requests concurrentes presentan el
 * mismo nonce, sólo una marca la fila y las demás reciben 0 filas. No hay
 * "leer y después escribir" en dos pasos, que es donde se cuela el replay.
 *
 * Si la migración no está aplicada se falla cerrado con un mensaje explícito;
 * nunca se vincula sin haber consumido el desafío.
 */

export const WALLET_LINK_CHALLENGE_TABLE = "wallet_link_challenges";

/** Migración requerida. Sin ella la vinculación real queda bloqueada. */
export const WALLET_LINK_CHALLENGE_MIGRATION = "0050_wallet_link_challenges.sql";

export interface StoredWalletLinkChallenge {
  nonceHash: string;
  userId: string;
  privyUserId: string;
  address: string;
  domain: string;
  issuedAt: string;
  expiresAt: string;
  message: string;
}

export interface ConsumedWalletLinkChallenge {
  message: string;
  issuedAt: string;
  expiresAt: string;
}

type WalletAdmin = ReturnType<typeof createSupabaseAdminClient>;
type QueryError = { code?: string; message?: string } | null;

function challengeStoreError(error: QueryError): never {
  if (error && isMissingSchemaError(error)) {
    throw new DomainError(
      "UPSTREAM",
      `No se puede verificar la vinculación: falta la migración ${WALLET_LINK_CHALLENGE_MIGRATION} en Supabase.`,
    );
  }
  throw new DomainError("INTERNAL");
}

/** Guarda un desafío ya emitido. El llamador calcula el hash con el nonce. */
export async function insertWalletLinkChallenge(
  admin: WalletAdmin,
  challenge: StoredWalletLinkChallenge,
): Promise<void> {
  const { error } = await admin.from(WALLET_LINK_CHALLENGE_TABLE).insert({
    nonce_hash: challenge.nonceHash,
    user_id: challenge.userId,
    privy_user_id: challenge.privyUserId,
    address: challenge.address,
    chain: WALLET_LINK_CHAIN,
    domain: challenge.domain,
    purpose: WALLET_LINK_PURPOSE,
    message: challenge.message,
    issued_at: challenge.issuedAt,
    expires_at: challenge.expiresAt,
  });
  if (error) challengeStoreError(error);
}

export interface ConsumeWalletLinkChallengeInput {
  nonce: string;
  userId: string;
  privyUserId: string;
  address: string;
  domain: string;
  /** Inyectable para tests. */
  now?: Date;
}

/**
 * Consume el desafío de forma atómica y devuelve su mensaje. `null` significa
 * "no existe, venció, ya se usó o no coincide con esta identidad": el
 * llamador debe responder igual en los cuatro casos (no filtra cuál falló).
 */
export async function consumeWalletLinkChallenge(
  admin: WalletAdmin,
  input: ConsumeWalletLinkChallengeInput,
): Promise<ConsumedWalletLinkChallenge | null> {
  const now = input.now ?? new Date();
  const { data, error } = await admin
    .from(WALLET_LINK_CHALLENGE_TABLE)
    .update({ consumed_at: now.toISOString() })
    .eq("nonce_hash", walletLinkNonceHash(input.nonce))
    .eq("user_id", input.userId)
    .eq("privy_user_id", input.privyUserId)
    .eq("address", input.address)
    .eq("chain", WALLET_LINK_CHAIN)
    .eq("domain", input.domain)
    .eq("purpose", WALLET_LINK_PURPOSE)
    .is("consumed_at", null)
    .gt("expires_at", now.toISOString())
    .select("message,issued_at,expires_at")
    .maybeSingle();
  if (error) challengeStoreError(error);
  if (!data) return null;
  const row = data as Record<string, unknown>;
  const message = typeof row.message === "string" ? row.message : "";
  const issuedAt = typeof row.issued_at === "string" ? row.issued_at : "";
  const expiresAt = typeof row.expires_at === "string" ? row.expires_at : "";
  if (message === "" || issuedAt === "" || expiresAt === "") {
    throw new DomainError("INTERNAL");
  }
  return { message, issuedAt, expiresAt };
}

/**
 * Borra los desafíos vencidos del usuario. Es higiene, no seguridad: el
 * consumo ya rechaza lo vencido. Un fallo aquí no bloquea la emisión.
 */
export async function purgeExpiredWalletLinkChallenges(
  admin: WalletAdmin,
  userId: string,
  now: Date = new Date(),
): Promise<void> {
  try {
    await admin
      .from(WALLET_LINK_CHALLENGE_TABLE)
      .delete()
      .eq("user_id", userId)
      .lt("expires_at", now.toISOString());
  } catch {
    // Sin efecto sobre la decisión de seguridad.
  }
}

/** Reconstruye el mensaje esperado con los datos persistidos. */
export function challengeMessageInput(
  challenge: ConsumedWalletLinkChallenge,
  binding: Omit<WalletLinkMessageInput, "issuedAt" | "expiresAt">,
): WalletLinkMessageInput {
  return {
    ...binding,
    issuedAt: new Date(challenge.issuedAt).toISOString(),
    expiresAt: new Date(challenge.expiresAt).toISOString(),
  };
}
