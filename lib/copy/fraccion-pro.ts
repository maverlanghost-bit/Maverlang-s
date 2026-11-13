import "server-only";

import {
  createHash,
  createPublicKey,
  timingSafeEqual,
  verify as verifySignature,
  type KeyObject,
} from "node:crypto";

import {
  entitlementFromSubscription,
  hasCopyAccess,
  invalidateCopyEntitlement,
  type CopySubscriptionSnapshot,
} from "@/lib/copy/access";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Vinculación de Fraccion Pro con Copiar carteras (§1.3: «Fraccion Pro incluye
 * Copiar», sin base compartida).
 *
 * Fraccion emite un comprobante firmado con Ed25519:
 * `{ sub_email_sha256, plan: "pro", exp }`. Acá se verifica con
 * `FRACCION_PRO_ED25519_PUBLIC_KEY` y `node:crypto` (sin dependencias), se
 * compara el sha256 del correo de la sesión en tiempo constante y, si todo
 * calza, se hace upsert en `copy_subscriptions` con
 * `provider = "fraccion_pro"`, `status = "active"` y
 * `current_period_end = exp`.
 *
 * Sin clave pública configurada la vinculación queda deshabilitada (nunca se
 * acepta un comprobante sin verificar).
 */

/** Plan que declara el comprobante. */
export const FRACCION_PRO_PLAN = "pro" as const;

export type FraccionProReceipt = {
  /** sha256 hex del correo normalizado (minúsculas, sin espacios extremos). */
  subEmailSha256: string;
  plan: typeof FRACCION_PRO_PLAN;
  /** Vencimiento en ms desde epoch. */
  exp: number;
  /** Vencimiento en ISO: lo que se guarda en `current_period_end`. */
  expiresAt: string;
};

export type FraccionProVerifyResult =
  | { ok: true; receipt: FraccionProReceipt }
  | { ok: false; reason: "disabled" | "misconfigured" | "invalid" };

export type FraccionProRedeemReason =
  | "disabled"
  | "misconfigured"
  | "invalid"
  | "expired"
  | "email_mismatch"
  | "already_subscribed"
  | "store_error";

export type FraccionProRedeemResult =
  | { ok: true; receipt: FraccionProReceipt; currentPeriodEnd: string }
  | { ok: false; reason: FraccionProRedeemReason };

/* --- Clave pública --- */

function publicKeyValue(): string | null {
  const raw = process.env.FRACCION_PRO_ED25519_PUBLIC_KEY;
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  return text === "" ? null : text;
}

/** Prefijo DER de una clave pública Ed25519 SPKI (32 bytes crudos detrás). */
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

function parsePublicKey(raw: string): KeyObject | null {
  // En Vercel es común pegar el PEM con la secuencia "\n" sin convertir.
  const text = raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
  if (text.includes("BEGIN PUBLIC KEY")) {
    try {
      return createPublicKey(text);
    } catch {
      return null;
    }
  }
  const compact = text.replace(/\s+/g, "");
  const bytes = Buffer.from(compact, "base64");
  if (bytes.length === 32) {
    try {
      return createPublicKey({
        key: Buffer.concat([ED25519_SPKI_PREFIX, bytes]),
        format: "der",
        type: "spki",
      });
    } catch {
      return null;
    }
  }
  if (bytes.length > 32) {
    try {
      return createPublicKey({ key: bytes, format: "der", type: "spki" });
    } catch {
      return null;
    }
  }
  return null;
}

let cachedKey: { raw: string; key: KeyObject } | null = null;

function signingKey(raw: string): KeyObject | null {
  if (cachedKey && cachedKey.raw === raw) return cachedKey.key;
  const key = parsePublicKey(raw);
  if (key) cachedKey = { raw, key };
  return key;
}

/** `true` cuando hay clave pública y se puede verificar. */
export function isFraccionProConfigured(): boolean {
  const raw = publicKeyValue();
  if (!raw) return false;
  return signingKey(raw) !== null;
}

/* --- Comprobante --- */

type TokenBytes = {
  /** Bytes exactos que se firmaron. */
  data: Buffer;
  /** Bytes del JSON del comprobante. */
  payload: Buffer;
  signature: Buffer;
};

function base64UrlToBuffer(segment: string): Buffer | null {
  if (segment === "" || !/^[A-Za-z0-9_-]+={0,2}$/.test(segment)) return null;
  const bytes = Buffer.from(segment.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  return bytes.length > 0 ? bytes : null;
}

function readAlg(header: Buffer): string {
  try {
    const parsed = JSON.parse(header.toString("utf8")) as Record<string, unknown>;
    return typeof parsed.alg === "string" ? parsed.alg.trim().toLowerCase() : "";
  } catch {
    return "";
  }
}

/**
 * Formatos aceptados, todos con la firma Ed25519 en base64url:
 * - `payload.firma` (el payload es el JSON en base64url);
 * - `header.payload.firma` (JWS compacto, `alg` Ed25519/EdDSA);
 * - `{"token":"…"}` o `{"payload":"…","signature":"…"}`.
 */
function bytesOfToken(token: string, depth = 0): TokenBytes | null {
  if (depth > 1) return null;
  const trimmed = token.trim();
  if (trimmed === "") return null;

  if (trimmed.startsWith("{")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return null;
    }
    if (!parsed || typeof parsed !== "object") return null;
    const record = parsed as Record<string, unknown>;
    if (typeof record.token === "string") return bytesOfToken(record.token, depth + 1);
    if (typeof record.payload === "string" && typeof record.signature === "string") {
      const payload = base64UrlToBuffer(record.payload.trim());
      const signature = base64UrlToBuffer(record.signature.trim());
      if (!payload || !signature) return null;
      return { data: payload, payload, signature };
    }
    return null;
  }

  const parts = trimmed.split(".");
  if (parts.length === 2) {
    const payload = base64UrlToBuffer(parts[0]);
    const signature = base64UrlToBuffer(parts[1]);
    if (!payload || !signature) return null;
    return { data: payload, payload, signature };
  }
  if (parts.length === 3) {
    const header = base64UrlToBuffer(parts[0]);
    if (!header) return null;
    const alg = readAlg(header);
    if (alg !== "ed25519" && alg !== "eddsa") return null;
    if (parts[1] === "") return null;
    const payload = base64UrlToBuffer(parts[1]);
    const signature = base64UrlToBuffer(parts[2]);
    if (!payload || !signature) return null;
    return { data: Buffer.from(`${parts[0]}.${parts[1]}`, "utf8"), payload, signature };
  }
  return null;
}

/** `exp` en segundos o milisegundos, o una fecha ISO. `null` si no se entiende. */
function toEpochMs(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    // Menos de 10^12 son segundos (una fecha en ms ya anda por 1,7 × 10^12).
    return value < 1e12 ? Math.round(value * 1000) : Math.round(value);
  }
  if (typeof value === "string" && value.trim() !== "") {
    const text = value.trim();
    if (/^[0-9]+$/.test(text)) return toEpochMs(Number(text));
    const parsed = Date.parse(text);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function readPayload(bytes: Buffer): FraccionProReceipt | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const record = parsed as Record<string, unknown>;

  const hash =
    typeof record.sub_email_sha256 === "string"
      ? record.sub_email_sha256.trim().toLowerCase()
      : "";
  if (!/^[a-f0-9]{64}$/.test(hash)) return null;
  if (record.plan !== FRACCION_PRO_PLAN) return null;
  const exp = toEpochMs(record.exp);
  if (exp === null) return null;

  return {
    subEmailSha256: hash,
    plan: FRACCION_PRO_PLAN,
    exp,
    expiresAt: new Date(exp).toISOString(),
  };
}

/** Verifica firma y forma del comprobante. La vigencia se mira al canjearlo. */
export function verifyFraccionProToken(token: string): FraccionProVerifyResult {
  const raw = publicKeyValue();
  if (!raw) return { ok: false, reason: "disabled" };
  const key = signingKey(raw);
  if (!key) return { ok: false, reason: "misconfigured" };

  const bytes = bytesOfToken(token);
  if (!bytes) return { ok: false, reason: "invalid" };

  let valid = false;
  try {
    valid = verifySignature(null, bytes.data, key, bytes.signature);
  } catch {
    valid = false;
  }
  if (!valid) return { ok: false, reason: "invalid" };

  const receipt = readPayload(bytes.payload);
  if (!receipt) return { ok: false, reason: "invalid" };
  return { ok: true, receipt };
}

/* --- Correo de la sesión --- */

/** sha256 hex del correo normalizado (minúsculas, sin espacios extremos). */
export function hashEmailForFraccion(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase(), "utf8").digest("hex");
}

function sameHash(left: string, right: string): boolean {
  if (left.length === 0 || left.length !== right.length) return false;
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/* --- Canje --- */

function adminClient() {
  try {
    return createSupabaseAdminClient();
  } catch {
    return null;
  }
}

/**
 * Verifica el comprobante, lo compara con el correo de la sesión y guarda la
 * suscripción. `store_error` = no se pudo escribir (`copy_subscriptions` no
 * existe todavía o la base falló); la ruta lo cuenta como error interno.
 */
export async function redeemFraccionPro(
  input: { userId: string; email: string; token: string },
  nowMs: number = Date.now(),
): Promise<FraccionProRedeemResult> {
  const verified = verifyFraccionProToken(input.token);
  if (!verified.ok) return { ok: false, reason: verified.reason };
  const { receipt } = verified;

  if (receipt.exp <= nowMs) return { ok: false, reason: "expired" };
  if (!sameHash(hashEmailForFraccion(input.email), receipt.subEmailSha256)) {
    return { ok: false, reason: "email_mismatch" };
  }

  const admin = adminClient();
  if (!admin) return { ok: false, reason: "store_error" };

  // No se pisa una suscripción pagada ni una prueba en curso: el usuario ya
  // tiene acceso y perdería su fila (y el registro de la prueba) al vinculares.
  try {
    const { data: existing, error: readError } = await admin
      .from("copy_subscriptions")
      .select("provider,status,current_period_end,trial_ends_at,updated_at")
      .eq("user_id", input.userId)
      .maybeSingle();
    if (readError) return { ok: false, reason: "store_error" };
    if (existing) {
      const row = existing as CopySubscriptionSnapshot;
      const provider = typeof row.provider === "string" ? row.provider.trim().toLowerCase() : "";
      if (provider !== "fraccion_pro" && hasCopyAccess(entitlementFromSubscription(row, nowMs))) {
        return { ok: false, reason: "already_subscribed" };
      }
    }
  } catch {
    return { ok: false, reason: "store_error" };
  }

  try {
    const { error } = await admin.from("copy_subscriptions").upsert(
      {
        user_id: input.userId,
        // La migración debe aceptar este plan (y `provider`): es un acceso sin cobro.
        plan: "fraccion_pro",
        status: "active",
        provider: "fraccion_pro",
        // El hash del correo, nunca el correo: sirve de rastro de la vinculación.
        provider_customer_id: receipt.subEmailSha256,
        current_period_end: receipt.expiresAt,
        cancel_at: null,
        updated_at: new Date(nowMs).toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (error) return { ok: false, reason: "store_error" };
  } catch {
    return { ok: false, reason: "store_error" };
  }

  invalidateCopyEntitlement(input.userId);
  return { ok: true, receipt, currentPeriodEnd: receipt.expiresAt };
}
