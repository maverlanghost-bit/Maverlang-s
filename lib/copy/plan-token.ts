import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

import { DomainError } from "@/lib/api/result";
import type { CopyAccount } from "@/lib/copy/plan";

/**
 * `planId` firmado con HMAC-SHA256 (`node:crypto`), sin dependencias nuevas.
 *
 * El token ES el planId que viaja al cliente: no se guarda nada en memoria ni
 * en base. Lleva dentro el plan completo (piernas, monto, cobertura, cartera y
 * versión) más `sub` (user_id), `iat` y `exp`. Al verificar se comprueba:
 *   1) la firma, con `timingSafeEqual` (comparación en tiempo constante);
 *   2) que el token sea del MISMO usuario (`sub`), para que un planId no se
 *      pueda reutilizar entre cuentas;
 *   3) que no haya vencido: TTL de 10 minutos;
 *   4) la forma del contenido (piernas y cuenta válidas).
 *
 * Sin `COPY_PLAN_HMAC_SECRET` en producción NO se firma ni se verifica: se
 * lanza `PlanTokenUnavailableError` (`status` 503) y la ruta responde 503. En
 * desarrollo se usa un secreto de juguete local para poder probar la mezcla.
 * El secreto nunca se escribe en el código de producción ni se expone al
 * cliente.
 */

/** Vida del plan: 10 minutos (decisión cerrada). */
export const COPY_PLAN_TTL_MS = 10 * 60 * 1000;
/** Un token más grande que esto no es un plan nuestro: se rechaza. */
const MAX_TOKEN_CHARS = 16_384;
const TOKEN_VERSION = "v1";
/** Secreto de juguete, SÓLO fuera de producción y sólo si falta el real. */
const DEV_FALLBACK_SECRET = "maverlang-copiar-plan-solo-desarrollo";

/** La firma de planes no está configurada en este entorno (HTTP 503). */
export class PlanTokenUnavailableError extends Error {
  readonly code = "PLAN_TOKEN_UNAVAILABLE";
  readonly status = 503;

  constructor(message = "La firma de planes de copiar no está configurada.") {
    super(message);
    this.name = "PlanTokenUnavailableError";
  }
}

/** Pierna firmada: lo esencial para ejecutar es símbolo y monto. */
export interface CopyPlanTokenLeg {
  symbol: string;
  usd: number;
  weightOriginal?: number;
  weightMaverlang?: number;
}

/**
 * Lo que se firma: el plan (`buildCopyPlan`) más de qué cartera y versión
 * salió. El cliente lo manda de vuelta como `planId` y el servidor lo verifica
 * antes de cotizar o ejecutar en demo: nunca se confía en pesos del cliente.
 */
export interface CopyPlanPayloadInput {
  /** Slug canónico de la cartera. */
  slug: string;
  /** `versionId` del feed con el que se armó el plan. */
  versionId?: string;
  account: CopyAccount;
  totalUsd: number;
  /** Por defecto `false`; el carrito manda `true` cuando reparte. */
  spreadUnavailable?: boolean;
  coveragePct?: number;
  maxLegs?: number;
  legs: readonly CopyPlanTokenLeg[];
  warnings?: readonly string[];
}

/** Contenido firmado: el plan normalizado + el sobre que agrega `signPlan`. */
export interface CopyPlanToken {
  slug: string;
  versionId: string;
  account: CopyAccount;
  totalUsd: number;
  spreadUnavailable: boolean;
  coveragePct: number;
  maxLegs: number;
  legs: readonly CopyPlanTokenLeg[];
  warnings?: readonly string[];
  /** Identificador único del plan (no adivinable). */
  planId: string;
  /** user_id dueño del plan. */
  sub: string;
  /** Emitido (epoch ms). */
  iat: number;
  /** Vence (epoch ms). */
  exp: number;
}

export type SignedPlan<P extends object> = P & {
  planId: string;
  sub: string;
  iat: number;
  exp: number;
};

export interface SignPlanOptions {
  /** Sólo pruebas: fija el reloj. */
  now?: number;
  /** Sólo pruebas: acorta o alarga la vida del plan. */
  ttlMs?: number;
  /** Sólo pruebas: planId determinista. */
  planId?: string;
}

export type PlanTokenFailure = "invalid" | "expired" | "user" | "unavailable";

export type PlanTokenResult<P extends object> =
  | { ok: true; payload: SignedPlan<P> }
  | { ok: false; reason: PlanTokenFailure };

function planSecret(): string {
  const configured = process.env.COPY_PLAN_HMAC_SECRET?.trim() ?? "";
  if (configured !== "") return configured;
  if (process.env.NODE_ENV === "production") throw new PlanTokenUnavailableError();
  return DEV_FALLBACK_SECRET;
}

function hmac(secret: string, data: string): string {
  return createHmac("sha256", secret).update(data, "utf8").digest("base64url");
}

/** Firma en tiempo constante; un largo distinto ya es firma inválida. */
function sameSignature(expected: string, received: string): boolean {
  const left = Buffer.from(expected, "utf8");
  const right = Buffer.from(received, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPlanLeg(value: unknown): value is CopyPlanTokenLeg {
  if (value === null || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  // Lo esencial para ejecutar: símbolo operable y monto en dólares.
  return (
    typeof row.symbol === "string" &&
    row.symbol.trim() !== "" &&
    isFiniteNumber(row.usd) &&
    row.usd >= 0
  );
}

/** Forma mínima que se firma y que se acepta de vuelta. */
function isPayload(value: unknown): value is CopyPlanPayloadInput {
  if (value === null || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  if (typeof row.slug !== "string" || row.slug.trim() === "") return false;
  if (row.account !== "demo" && row.account !== "real") return false;
  if (!isFiniteNumber(row.totalUsd) || row.totalUsd <= 0) return false;
  // Un plan sin piernas no se firma: no hay nada que ejecutar.
  if (!Array.isArray(row.legs) || row.legs.length === 0) return false;
  if (!row.legs.every(isPlanLeg)) return false;
  // Los demás campos son opcionales: si vienen, se valida el tipo.
  if (row.versionId !== undefined && typeof row.versionId !== "string") return false;
  if (row.spreadUnavailable !== undefined && typeof row.spreadUnavailable !== "boolean") {
    return false;
  }
  if (row.coveragePct !== undefined && !isFiniteNumber(row.coveragePct)) return false;
  if (row.maxLegs !== undefined && !isFiniteNumber(row.maxLegs)) return false;
  if (row.warnings !== undefined && !Array.isArray(row.warnings)) return false;
  return true;
}

function isToken(value: unknown): value is CopyPlanToken {
  if (!isPayload(value)) return false;
  const row = value as unknown as Record<string, unknown>;
  return (
    typeof row.planId === "string" &&
    row.planId !== "" &&
    typeof row.sub === "string" &&
    row.sub !== "" &&
    isFiniteNumber(row.iat) &&
    isFiniteNumber(row.exp) &&
    row.exp > row.iat
  );
}

/**
 * Firma el plan y devuelve el `planId` (token `v1.<carga>.<firma>`).
 * Lanza `DomainError("UNAUTHORIZED")` sin usuario y
 * `DomainError("VALIDATION")` con un plan imposible de firmar.
 */
export function signPlan(
  payload: CopyPlanPayloadInput,
  userId: string,
  options: SignPlanOptions = {},
): string {
  const sub = typeof userId === "string" ? userId.trim() : "";
  if (sub === "") throw new DomainError("UNAUTHORIZED");
  if (!isPayload(payload)) throw new DomainError("VALIDATION");
  const now = options.now ?? Date.now();
  const ttlMs = options.ttlMs ?? COPY_PLAN_TTL_MS;
  if (!Number.isFinite(ttlMs) || ttlMs <= 0 || ttlMs > COPY_PLAN_TTL_MS) {
    throw new DomainError("VALIDATION");
  }
  const token: CopyPlanToken = {
    slug: payload.slug,
    versionId: payload.versionId ?? "",
    account: payload.account,
    totalUsd: payload.totalUsd,
    spreadUnavailable: payload.spreadUnavailable ?? false,
    coveragePct: payload.coveragePct ?? 0,
    maxLegs: payload.maxLegs ?? 0,
    legs: payload.legs,
    warnings: payload.warnings,
    planId: options.planId ?? randomUUID(),
    sub,
    iat: now,
    exp: now + ttlMs,
  };
  const body = Buffer.from(JSON.stringify(token), "utf8").toString("base64url");
  const signature = hmac(planSecret(), `${TOKEN_VERSION}.${body}`);
  return `${TOKEN_VERSION}.${body}.${signature}`;
}

/**
 * Verifica el `planId` contra el usuario de la sesión. Devuelve el detalle del
 * fallo para que la ruta pueda responder 400 (inválido), 410 (vencido) o 503
 * (sin secreto). Nunca lanza por un token mal formado.
 */
export function verifyPlanDetailed<P extends object = CopyPlanToken>(
  token: unknown,
  userId: string,
  options: { now?: number } = {},
): PlanTokenResult<P> {
  const raw = typeof token === "string" ? token.trim() : "";
  const sub = typeof userId === "string" ? userId.trim() : "";
  if (raw === "" || raw.length > MAX_TOKEN_CHARS || sub === "") {
    return { ok: false, reason: "invalid" };
  }
  const parts = raw.split(".");
  if (parts.length !== 3 || parts[0] !== TOKEN_VERSION) return { ok: false, reason: "invalid" };
  const [, body, signature] = parts;

  let secret: string;
  try {
    secret = planSecret();
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  const expected = hmac(secret, `${TOKEN_VERSION}.${body}`);
  if (!sameSignature(expected, signature)) return { ok: false, reason: "invalid" };

  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (!isToken(decoded)) return { ok: false, reason: "invalid" };
  if (decoded.sub !== sub) return { ok: false, reason: "user" };

  const now = options.now ?? Date.now();
  if (decoded.exp <= now) return { ok: false, reason: "expired" };
  // Un plan no puede durar más que el TTL aunque la firma sea válida.
  if (decoded.iat > now + 60_000 || decoded.exp - decoded.iat > COPY_PLAN_TTL_MS) {
    return { ok: false, reason: "invalid" };
  }
  return { ok: true, payload: decoded as unknown as SignedPlan<P> };
}

/**
 * `verifyPlan(token, userId)`: el plan firmado, o `null` si el token no sirve
 * (otra cuenta, vencido, adulterado o sin secreto configurado).
 */
export function verifyPlan<P extends object = CopyPlanToken>(
  token: unknown,
  userId: string,
  options: { now?: number } = {},
): SignedPlan<P> | null {
  const result = verifyPlanDetailed<P>(token, userId, options);
  return result.ok ? result.payload : null;
}
