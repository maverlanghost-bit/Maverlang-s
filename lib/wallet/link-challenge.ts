import "server-only";

import { createHash, createPublicKey, randomBytes, verify as verifySignature } from "node:crypto";

import { DomainError } from "@/lib/api/result";
import { serverEnv } from "@/lib/env";
import { decodeBase58, isValidSolanaAddress } from "@/lib/solana/address";

/**
 * Desafío de vinculación de billetera (paso 2 del piloto de depósitos).
 *
 * Tres identidades tienen que quedar atadas en el MISMO acto:
 *   1. la sesión de Supabase (usuario verificado por el servidor),
 *   2. el DID de Privy dueño de la billetera (token ES256 verificado + API),
 *   3. la firma ed25519 de la billetera sobre un mensaje que el servidor
 *      emitió dentro de esa sesión.
 *
 * Una sesión Supabase + un token de Privy no bastan (TOFU): dos personas
 * distintas podrían presentar esas dos credenciales. La firma del nonce con la
 * llave de la billetera es lo que demuestra que quien tiene la sesión controla
 * la billetera que Privy atribuye a ese DID.
 *
 * Este módulo no toca la base ni la red: construye el mensaje canónico, emite
 * nonces y verifica la firma. La persistencia y el consumo atómico viven en
 * `lib/wallet/link-challenge-store.ts`.
 */

/** Único propósito aceptado. Un nonce de otro flujo no sirve aquí. */
export const WALLET_LINK_PURPOSE = "wallet_link" as const;

/** Cadena atada al mensaje. Hoy sólo Solana. */
export const WALLET_LINK_CHAIN = "solana" as const;

/** Versión del formato del mensaje: cambiarlo invalida los nonces viejos. */
export const WALLET_LINK_VERSION = 1;

/** Vigencia corta: el usuario firma en el momento. */
export const WALLET_LINK_TTL_MS = 5 * 60_000;

/** 32 bytes de aleatoriedad criptográfica por nonce. */
export const WALLET_LINK_NONCE_BYTES = 32;

/** Tope defensivo del mensaje (un nonce real mide ~43 caracteres). */
export const WALLET_LINK_MAX_MESSAGE_LENGTH = 2_048;

const NONCE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const DOMAIN_PATTERN = /^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?(?::\d{1,5})?$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRIVY_DID_PATTERN = /^did:privy:[A-Za-z0-9._:-]{1,200}$/;

/** Clave pública ed25519 en formato SPKI DER: prefijo fijo + 32 bytes. */
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

export interface WalletLinkMessageInput {
  domain: string;
  userId: string;
  privyUserId: string;
  address: string;
  nonce: string;
  /** ISO 8601 en UTC (`toISOString()`), no una fecha local. */
  issuedAt: string;
  /** ISO 8601 en UTC (`toISOString()`). */
  expiresAt: string;
}

function hasLineBreak(value: string): boolean {
  return value.includes("\n") || value.includes("\r");
}

/**
 * Mensaje exacto que firma la billetera. Todas las líneas son `Clave: valor`
 * y ningún valor puede traer saltos de línea: así un DID o una dirección
 * manipulados no pueden inyectar líneas y cambiar el significado del mensaje.
 */
export function buildWalletLinkMessage(input: WalletLinkMessageInput): string {
  const domain = normalizeWalletLinkDomain(input.domain);
  if (!domain) throw new DomainError("VALIDATION", "El dominio de la vinculación no es válido.");
  if (!UUID_PATTERN.test(input.userId)) {
    throw new DomainError("VALIDATION", "El usuario de la vinculación no es válido.");
  }
  if (!PRIVY_DID_PATTERN.test(input.privyUserId)) {
    throw new DomainError("VALIDATION", "La identidad de Privy no es válida.");
  }
  if (!isValidSolanaAddress(input.address)) {
    throw new DomainError("VALIDATION", "La billetera de la vinculación no es válida.");
  }
  if (!NONCE_PATTERN.test(input.nonce)) {
    throw new DomainError("VALIDATION", "El nonce de la vinculación no es válido.");
  }
  if (!isIsoInstant(input.issuedAt) || !isIsoInstant(input.expiresAt)) {
    throw new DomainError("VALIDATION", "La vigencia de la vinculación no es válida.");
  }
  const values = [
    domain,
    input.userId,
    input.privyUserId.trim(),
    input.address.trim(),
    input.issuedAt,
    input.expiresAt,
    input.nonce,
  ];
  if (values.some(hasLineBreak)) {
    throw new DomainError("VALIDATION", "La vinculación contiene un valor no permitido.");
  }

  return [
    "Maverlang — vinculación de billetera",
    `Versión: ${WALLET_LINK_VERSION}`,
    `Dominio: ${domain}`,
    `Propósito: ${WALLET_LINK_PURPOSE}`,
    `Usuario: ${input.userId}`,
    `Identidad Privy: ${input.privyUserId.trim()}`,
    `Billetera: ${input.address.trim()}`,
    `Cadena: ${WALLET_LINK_CHAIN}`,
    `Emitido: ${input.issuedAt}`,
    `Vence: ${input.expiresAt}`,
    `Nonce: ${input.nonce}`,
  ].join("\n");
}

function isIsoInstant(value: string): boolean {
  if (typeof value !== "string" || value.length < 20 || value.length > 30) return false;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return false;
  // Sólo se acepta la forma canónica que produce `toISOString()`: evita que
  // dos representaciones de la misma fecha generen mensajes distintos.
  return new Date(parsed).toISOString() === value;
}

/**
 * Host canónico del sitio (con puerto si lo hay). Minúsculas y sin esquema.
 * Rechaza credenciales, rutas, espacios y cualquier cosa que no sea host.
 */
export function normalizeWalletLinkDomain(raw: string): string | null {
  const value = raw.trim().toLowerCase();
  if (value === "" || value.length > 259 || hasLineBreak(value)) return null;
  if (!DOMAIN_PATTERN.test(value)) return null;
  return value;
}

/**
 * Dominio al que se ata el desafío. Prioriza `NEXT_PUBLIC_SITE_URL` (el sitio
 * canónico) y, si no está configurado, usa el host por el que entró la
 * petición (`x-forwarded-host` lo pone la plataforma). Sin un host válido no
 * se emite nada: falla cerrado.
 */
export function walletLinkDomainOf(req: Request): string {
  // `process.env` primero: permite que el valor vigente (incluido un cambio en
  // pruebas) mande sobre el snapshot de `serverEnv`, que se lee al importar.
  const configured =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() || serverEnv.NEXT_PUBLIC_SITE_URL?.trim() || "";
  if (configured !== "") {
    try {
      const host = normalizeWalletLinkDomain(new URL(configured).host);
      if (host) return host;
    } catch {
      // Sigue con el host de la petición; un valor mal formado no habilita nada.
    }
  }
  const forwarded = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ?? "";
  const hostHeader = req.headers.get("host")?.trim() ?? "";
  const urlHost = (() => {
    try {
      return new URL(req.url).host;
    } catch {
      return "";
    }
  })();
  for (const candidate of [forwarded, hostHeader, urlHost]) {
    const host = normalizeWalletLinkDomain(candidate);
    if (host) return host;
  }
  throw new DomainError("UPSTREAM", "No se pudo determinar el dominio de la vinculación.");
}

/** Nonce nuevo: 32 bytes aleatorios en base64url (43 caracteres). */
export function createWalletLinkNonce(): string {
  return randomBytes(WALLET_LINK_NONCE_BYTES).toString("base64url");
}

/** SHA-256 hex del nonce. Es lo único que se persiste. */
export function walletLinkNonceHash(nonce: string): string {
  return createHash("sha256").update(nonce, "utf8").digest("hex");
}

/** Valida y devuelve el nonce tal cual (sin normalizar: es opaco). */
export function assertWalletLinkNonce(nonce: string): string {
  if (typeof nonce !== "string" || !NONCE_PATTERN.test(nonce)) {
    throw new DomainError("VALIDATION", "El nonce de la vinculación no es válido.");
  }
  return nonce;
}

/**
 * Verifica una firma ed25519 de Solana.
 *
 * La dirección base58 de Solana ES la clave pública ed25519 (32 bytes), así
 * que no hay que resolver nada en la cadena: se decodifica la dirección, se
 * arma la clave SPKI y se verifica la firma (64 bytes) sobre los bytes UTF-8
 * del mensaje exacto. Cualquier entrada mal formada devuelve `false`; nunca
 * lanza ni acepta una firma parcial.
 */
export function verifyWalletLinkSignature(input: {
  message: string;
  address: string;
  signature: string;
}): boolean {
  const message = typeof input.message === "string" ? input.message : "";
  if (message === "" || message.length > WALLET_LINK_MAX_MESSAGE_LENGTH) return false;
  if (typeof input.address !== "string" || !isValidSolanaAddress(input.address)) return false;
  if (typeof input.signature !== "string") return false;
  if (input.signature.length === 0 || input.signature.length > 128) return false;
  const publicKeyBytes = decodeBase58(input.address.trim());
  const signatureBytes = decodeBase58(input.signature.trim());
  if (!publicKeyBytes || publicKeyBytes.length !== 32) return false;
  if (!signatureBytes || signatureBytes.length !== 64) return false;
  try {
    const key = createPublicKey({
      key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(publicKeyBytes)]),
      format: "der",
      type: "spki",
    });
    if (key.asymmetricKeyType !== "ed25519") return false;
    return verifySignature(null, Buffer.from(message, "utf8"), key, Buffer.from(signatureBytes));
  } catch {
    return false;
  }
}
