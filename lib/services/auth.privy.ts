import "server-only";

import { createPublicKey, verify as verifySignature, type KeyObject } from "node:crypto";

import { DomainError } from "@/lib/api/result";
import { PRIVY_SESSION_COOKIE, readCookieValue } from "@/lib/auth/cookies";
import { serverEnv } from "@/lib/env";
import { isValidSolanaAddress } from "@/lib/solana/address";

/**
 * Verificación de identidad de Privy en el servidor.
 *
 * No hay `@privy-io/server-auth` ni `@privy-io/node` instalados y el prompt
 * prohíbe instalar dependencias. Por eso el token de acceso se verifica con
 * `node:crypto`:
 *   - ES256 (ECDSA P-256), firma JWS normalizada `ieee-p1363`.
 *   - `iss` debe ser `privy.io`, `aud` el app id configurado, `exp` vigente.
 *   - La clave pública de verificación sale de `PRIVY_JWT_VERIFICATION_KEY`
 *     (Configuration → App settings del dashboard de Privy).
 *
 * La billetera NO viaja en el token de acceso: se lee de la API de Privy con
 * Basic Auth (`app id:app secret`) usando el `sub` ya verificado. Si falta la
 * clave de verificación, el app secret o la API no responde, se falla cerrado
 * con un mensaje explícito; nunca se inventa una billetera ni se acepta una
 * dirección enviada por el cliente.
 */

const PRIVY_API_BASE = "https://api.privy.io/v1";
const PRIVY_ISSUER = "privy.io";
const PRIVY_FETCH_MS = 5_000;
const CLOCK_SKEW_SECONDS = 30;

/** URL histórica del endpoint de usuario. Se conserva para compatibilidad de imports. */
export const PRIVY_USERS_ME_URL = `${PRIVY_API_BASE}/users/me`;

export interface PrivyAccessTokenClaims {
  /** DID de Privy (`did:privy:…`). */
  userId: string;
  appId: string;
  sessionId: string | null;
  issuedAt: number;
  expiresAt: number;
  issuer: "privy.io";
}

export interface PrivyVerifiedSession {
  userId: string;
  walletAddress: string | null;
}

export interface PrivySolanaWallet {
  address: string;
  walletClientType: "privy" | "external";
  privyWalletId: string | null;
}

export interface VerifyPrivyTokenParams {
  accessToken: string;
  appId?: string | null;
  verificationKey?: string | null;
  /** Inyectable para tests; por defecto `Date.now()`. */
  now?: number;
}

export interface FetchPrivyWalletParams {
  userId: string;
  appId?: string | null;
  appSecret?: string | null;
  fetchImpl?: typeof fetch;
}

type JsonRecord = Record<string, unknown>;

function recordOf(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null ? (value as JsonRecord) : null;
}

function appIdOf(explicit?: string | null): string {
  const value = explicit?.trim() || serverEnv.NEXT_PUBLIC_PRIVY_APP_ID?.trim() || "";
  if (value === "") {
    throw new DomainError(
      "UPSTREAM",
      "No se puede verificar la identidad de Privy: falta NEXT_PUBLIC_PRIVY_APP_ID en el servidor.",
    );
  }
  return value;
}

function appSecretOf(explicit?: string | null): string {
  const value = explicit?.trim() || serverEnv.PRIVY_APP_SECRET?.trim() || "";
  if (value === "") {
    throw new DomainError(
      "UPSTREAM",
      "No se puede verificar la billetera de Privy: falta PRIVY_APP_SECRET en el servidor.",
    );
  }
  return value;
}

function verificationKeyOf(explicit?: string | null): string {
  const raw = explicit?.trim() || process.env.PRIVY_JWT_VERIFICATION_KEY?.trim() || "";
  if (raw === "") {
    throw new DomainError(
      "UPSTREAM",
      "No se puede verificar la sesión de Privy: falta PRIVY_JWT_VERIFICATION_KEY en el servidor.",
    );
  }
  // El dashboard entrega el PEM con saltos escapados (`\n`).
  return raw.replace(/\\n/g, "\n");
}

function base64UrlToBuffer(value: string): Buffer {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, "base64");
}

function decodeJsonPart(value: string): JsonRecord | null {
  try {
    return recordOf(JSON.parse(base64UrlToBuffer(value).toString("utf8")));
  } catch {
    return null;
  }
}

const publicKeyCache = new Map<string, KeyObject>();

function publicKeyOf(pem: string): KeyObject {
  const cached = publicKeyCache.get(pem);
  if (cached) return cached;
  let key: KeyObject;
  try {
    key = createPublicKey({ key: pem, format: "pem" });
  } catch {
    throw new DomainError(
      "UPSTREAM",
      "PRIVY_JWT_VERIFICATION_KEY no es una clave pública PEM válida.",
    );
  }
  if (key.asymmetricKeyType !== "ec" || key.asymmetricKeyDetails?.namedCurve !== "prime256v1") {
    throw new DomainError(
      "UPSTREAM",
      "PRIVY_JWT_VERIFICATION_KEY debe ser una clave pública EC P-256 (ES256).",
    );
  }
  publicKeyCache.set(pem, key);
  return key;
}

function unauthorized(): DomainError {
  return new DomainError("UNAUTHORIZED", "La sesión de Privy no es válida o venció.");
}

function numberClaim(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Verifica la firma ES256 y las claims del access token de Privy.
 * Lanza `UNAUTHORIZED` si el token no sirve y `UPSTREAM` si falta la
 * configuración de verificación. No consulta la red.
 */
export async function verifyPrivyAccessToken(
  params: VerifyPrivyTokenParams,
): Promise<PrivyAccessTokenClaims> {
  const token = params.accessToken.trim();
  if (token === "") throw unauthorized();
  const appId = appIdOf(params.appId);
  const verificationKey = verificationKeyOf(params.verificationKey);

  const parts = token.split(".");
  if (parts.length !== 3) throw unauthorized();
  const [encodedHeader = "", encodedPayload = "", encodedSignature = ""] = parts;

  const header = decodeJsonPart(encodedHeader);
  if (!header || header.alg !== "ES256") throw unauthorized();
  if (header.typ !== undefined && header.typ !== "JWT") throw unauthorized();

  const payload = decodeJsonPart(encodedPayload);
  if (!payload) throw unauthorized();

  const key = publicKeyOf(verificationKey);
  let validSignature = false;
  try {
    validSignature = verifySignature(
      "sha256",
      Buffer.from(`${encodedHeader}.${encodedPayload}`, "utf8"),
      { key, dsaEncoding: "ieee-p1363" },
      base64UrlToBuffer(encodedSignature),
    );
  } catch {
    throw unauthorized();
  }
  if (!validSignature) throw unauthorized();

  const now = params.now ?? Date.now();
  const nowSeconds = Math.floor(now / 1000);
  const exp = numberClaim(payload.exp);
  const iat = numberClaim(payload.iat);
  const nbf = numberClaim(payload.nbf);
  if (exp === null || exp + CLOCK_SKEW_SECONDS < nowSeconds) throw unauthorized();
  if (iat === null || iat - CLOCK_SKEW_SECONDS > nowSeconds) throw unauthorized();
  if (nbf !== null && nbf - CLOCK_SKEW_SECONDS > nowSeconds) throw unauthorized();

  if (payload.iss !== PRIVY_ISSUER) throw unauthorized();
  const audience = payload.aud;
  const audienceOk =
    typeof audience === "string"
      ? audience === appId
      : Array.isArray(audience) && audience.some((item) => item === appId);
  if (!audienceOk) throw unauthorized();

  const sub = typeof payload.sub === "string" ? payload.sub.trim() : "";
  if (!sub.startsWith("did:privy:")) throw unauthorized();

  return {
    userId: sub,
    appId,
    sessionId: typeof payload.sid === "string" && payload.sid.trim() !== "" ? payload.sid.trim() : null,
    issuedAt: iat,
    expiresAt: exp,
    issuer: PRIVY_ISSUER,
  };
}

/** Verificación sin red para decisiones de sesión (layout/servidor). `null` = no autenticado. */
export async function verifyPrivySessionToken(
  accessToken: string,
  params: Omit<VerifyPrivyTokenParams, "accessToken"> = {},
): Promise<PrivyAccessTokenClaims | null> {
  if (accessToken.trim() === "") return null;
  try {
    return await verifyPrivyAccessToken({ ...params, accessToken });
  } catch {
    return null;
  }
}

/** `Authorization: Bearer …` o la cookie HttpOnly `privy-token`. */
export function privyAccessTokenOf(req: Request): string | null {
  const header = req.headers.get("authorization") ?? "";
  const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (bearer !== "") return bearer;
  return readCookieValue(req.headers.get("cookie"), PRIVY_SESSION_COOKIE);
}

/**
 * Billetera Solana del usuario de Privy. El `userId` debe venir de un token
 * ya verificado; nunca de un campo del cliente. Devuelve `null` si la cuenta
 * no tiene billetera Solana. Falla cerrado si falta el app secret o la API
 * no responde.
 */
export async function fetchPrivySolanaWallet(
  params: FetchPrivyWalletParams,
): Promise<PrivySolanaWallet | null> {
  const userId = params.userId.trim();
  if (!userId.startsWith("did:privy:")) {
    throw new DomainError("UNAUTHORIZED", "La identidad de Privy no es válida.");
  }
  const appId = appIdOf(params.appId);
  const appSecret = appSecretOf(params.appSecret);
  const fetchImpl = params.fetchImpl ?? fetch;
  const basic = Buffer.from(`${appId}:${appSecret}`, "utf8").toString("base64");

  let response: Response;
  try {
    response = await fetchImpl(`${PRIVY_API_BASE}/users/${encodeURIComponent(userId)}`, {
      headers: {
        accept: "application/json",
        authorization: `Basic ${basic}`,
        "privy-app-id": appId,
      },
      signal: AbortSignal.timeout(PRIVY_FETCH_MS),
    });
  } catch {
    throw new DomainError("UPSTREAM", "Privy no respondió al verificar la billetera.");
  }
  if (!response.ok) {
    // Sin eco del cuerpo: el detalle queda en el log del servidor si hace falta.
    throw new DomainError("UPSTREAM", "Privy rechazó la consulta de la billetera.");
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new DomainError("UPSTREAM", "Privy devolvió una respuesta ilegible.");
  }
  return extractSolanaWallet(payload);
}

/**
 * Elige la billetera Solana del payload de Privy. Prefiere la embebida de
 * Privy; una cuenta con `user_can_sign: false` no se usa.
 */
export function extractSolanaWallet(payload: unknown): PrivySolanaWallet | null {
  const record = recordOf(payload);
  if (!record) return null;
  const candidates = [
    ...(Array.isArray(record.linked_accounts) ? record.linked_accounts : []),
    ...(Array.isArray(record.wallets) ? record.wallets : []),
  ];
  let embedded: PrivySolanaWallet | null = null;
  let external: PrivySolanaWallet | null = null;
  for (const raw of candidates) {
    const account = recordOf(raw);
    if (!account) continue;
    const type = typeof account.type === "string" ? account.type : null;
    if (type !== null && type !== "wallet") continue;
    const chain =
      typeof account.chain_type === "string"
        ? account.chain_type
        : typeof account.chain === "string"
          ? account.chain
          : null;
    if (chain !== "solana") continue;
    if (account.user_can_sign === false) continue;
    const address = typeof account.address === "string" ? account.address.trim() : "";
    if (!address || !isValidSolanaAddress(address)) continue;
    const clientType =
      typeof account.wallet_client_type === "string" ? account.wallet_client_type : "";
    const walletClientType: "privy" | "external" =
      clientType === "privy" || clientType === "privy-v2" ? "privy" : "external";
    const wallet: PrivySolanaWallet = {
      address,
      walletClientType,
      privyWalletId:
        typeof account.id === "string"
          ? account.id
          : typeof account.wallet_id === "string"
            ? account.wallet_id
            : null,
    };
    if (walletClientType === "privy") {
      if (!embedded) embedded = wallet;
    } else if (!external) {
      external = wallet;
    }
  }
  return embedded ?? external;
}

/**
 * Sesión de Privy para las rutas que usan `getServices().auth`. Verifica el
 * token y resuelve la billetera Solana con el app secret. Si el token falta
 * devuelve `null` (el handler responde 401); si la configuración falta o
 * Privy cae, lanza un error explícito.
 */
export const privyAuth = {
  async getSession(req: Request): Promise<PrivyVerifiedSession | null> {
    const accessToken = privyAccessTokenOf(req);
    if (!accessToken) return null;
    const claims = await verifyPrivyAccessToken({ accessToken });
    const appSecret = serverEnv.PRIVY_APP_SECRET?.trim() ?? "";
    if (appSecret === "") {
      throw new DomainError(
        "UPSTREAM",
        "No se puede resolver la billetera de Privy: falta PRIVY_APP_SECRET en el servidor.",
      );
    }
    const wallet = await fetchPrivySolanaWallet({
      userId: claims.userId,
      appId: claims.appId,
      appSecret,
    });
    return { userId: claims.userId, walletAddress: wallet?.address ?? null };
  },
};
