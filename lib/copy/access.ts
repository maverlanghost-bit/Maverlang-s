import "server-only";

import { DomainError } from "@/lib/api/result";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Paywall de «Copiar carteras» (§1.10). Se aplica SIEMPRE en el servidor:
 * los server components no serializan la composición de quien no tiene acceso
 * y las APIs de plan/follow responden 402. La verdad del estado es el webhook
 * del proveedor de pago; la vuelta del checkout no da acceso por sí sola.
 *
 * Estados:
 * - `trial`: prueba de 7 días vigente.
 * - `active`: suscripción pagada vigente.
 * - `past_due`: pago fallido, 3 días de gracia SOLO LECTURA.
 * - `canceled`: cancelada, con acceso hasta `current_period_end`.
 * - `fraccion_pro`: vinculada a Fraccion Pro (incluye Copiar), vigente hasta `exp`.
 * - `none`: sin acceso.
 *
 * Caché por usuario de 60 s (`invalidateCopyEntitlement` la limpia).
 */

export type CopyEntitlement =
  | "none"
  | "trial"
  | "active"
  | "past_due"
  | "canceled"
  | "fraccion_pro";

export const COPY_ENTITLEMENTS = [
  "none",
  "trial",
  "active",
  "past_due",
  "canceled",
  "fraccion_pro",
] as const satisfies readonly CopyEntitlement[];

export function isCopyEntitlement(value: unknown): value is CopyEntitlement {
  return typeof value === "string" && (COPY_ENTITLEMENTS as readonly string[]).includes(value);
}

/** Código propio del paywall (no existe en `ApiErrorCode` de `lib/api/result.ts`). */
export const COPY_SUBSCRIPTION_REQUIRED = "COPY_SUBSCRIPTION_REQUIRED" as const;

export const COPY_SUBSCRIPTION_REQUIRED_MESSAGE =
  "Copiar carteras requiere una suscripción activa.";

export const COPY_PAST_DUE_MESSAGE =
  "Tu pago está pendiente: puedes revisar las carteras, pero no copiar hasta regularizarlo.";

/** TTL de la caché por usuario (§5.3 del diseño). */
export const COPY_ENTITLEMENT_TTL_MS = 60_000;

/** Días de gracia de `past_due`, solo lectura. */
export const PAST_DUE_GRACE_DAYS = 3;

const DAY_MS = 86_400_000;
const PAST_DUE_GRACE_MS = PAST_DUE_GRACE_DAYS * DAY_MS;

/** Fila de `copy_subscriptions` tal como llega de PostgREST (sin tipar la tabla). */
export type CopySubscriptionSnapshot = {
  plan?: unknown;
  status?: unknown;
  provider?: unknown;
  trial_ends_at?: unknown;
  current_period_end?: unknown;
  cancel_at?: unknown;
  updated_at?: unknown;
};

function textOf(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function timeOf(value: unknown): number | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Estado puro a partir de la fila (sin I/O, testeable).
 * Falla cerrado: cualquier combinación que no calce es `none`.
 */
export function entitlementFromSubscription(
  row: CopySubscriptionSnapshot | null,
  nowMs: number = Date.now(),
): CopyEntitlement {
  if (!row) return "none";
  const status = textOf(row.status);
  if (status === "") return "none";
  const provider = textOf(row.provider);
  const periodEnd = timeOf(row.current_period_end);
  const trialEnd = timeOf(row.trial_ends_at);
  const updatedAt = timeOf(row.updated_at);

  // Fraccion Pro: no hay webhook que renueve, así que manda `current_period_end`.
  if (provider === "fraccion_pro") {
    if (status === "active" && periodEnd !== null && periodEnd > nowMs) return "fraccion_pro";
    return "none";
  }

  switch (status) {
    case "active":
    case "authorized":
      return "active";
    case "trialing":
    case "trial":
      return trialEnd !== null && trialEnd > nowMs ? "trial" : "none";
    case "past_due": {
      const anchor = periodEnd ?? updatedAt;
      if (anchor === null) return "none";
      return nowMs <= anchor + PAST_DUE_GRACE_MS ? "past_due" : "none";
    }
    case "canceled":
    case "cancelled":
    case "ended":
    case "paused":
    case "inactive":
      return periodEnd !== null && periodEnd > nowMs ? "canceled" : "none";
    default:
      return "none";
  }
}

/** `true` para todo estado con acceso (incluido `past_due`, que es solo lectura). */
export function hasCopyAccess(entitlement: CopyEntitlement): boolean {
  return entitlement !== "none";
}

/** `past_due`: puede mirar, no copiar. */
export function isCopyReadOnly(entitlement: CopyEntitlement): boolean {
  return entitlement === "past_due";
}

const cache = new Map<string, { value: CopyEntitlement; at: number }>();

/** Limpia la caché de un usuario (webhook, vinculación Pro) o de todos. */
export function invalidateCopyEntitlement(userId?: string): void {
  if (userId) cache.delete(userId);
  else cache.clear();
}

function adminClient() {
  try {
    return createSupabaseAdminClient();
  } catch {
    return null;
  }
}

type SubscriptionRead = { ok: true; row: CopySubscriptionSnapshot | null } | { ok: false };

/** Lectura de la fila. `ok: false` = no se pudo leer (sin config o tabla ausente). */
async function readSubscription(userId: string): Promise<SubscriptionRead> {
  const admin = adminClient();
  if (!admin) return { ok: false };
  try {
    const { data, error } = await admin
      .from("copy_subscriptions")
      .select("plan,status,provider,trial_ends_at,current_period_end,cancel_at,updated_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return { ok: false };
    return { ok: true, row: (data ?? null) as CopySubscriptionSnapshot | null };
  } catch {
    return { ok: false };
  }
}

/**
 * `COPY_DEV_ENTITLEMENT=active` (o cualquier estado con acceso) permite probar
 * el paywall en desarrollo. En producción se ignora por completo.
 */
function devEntitlement(): CopyEntitlement | null {
  if (process.env.NODE_ENV === "production") return null;
  const raw = process.env.COPY_DEV_ENTITLEMENT?.trim().toLowerCase() ?? "";
  if (raw === "" || raw === "none") return null;
  return isCopyEntitlement(raw) ? raw : null;
}

/** Estado de acceso del usuario. Nunca lanza: ante duda, `none`. */
export async function getCopyEntitlement(
  userId: string,
  nowMs: number = Date.now(),
): Promise<CopyEntitlement> {
  const dev = devEntitlement();
  if (dev) return dev;

  const hit = cache.get(userId);
  if (hit && nowMs - hit.at < COPY_ENTITLEMENT_TTL_MS) return hit.value;

  const read = await readSubscription(userId);
  if (!read.ok) return "none";

  const value = entitlementFromSubscription(read.row, nowMs);
  cache.set(userId, { value, at: nowMs });
  return value;
}

/**
 * Error del paywall. Extiende `DomainError` para que el resto del código lo
 * trate como error de dominio; el HTTP correcto es 402 y el código propio
 * viaja en `copyCode` (`ApiErrorCode` no tiene un 402 y no se edita acá).
 *
 * Las rutas DEBEN convertirlo con `copyAccessResponseOf(error)` o envolver el
 * cuerpo con `withCopyAccessResponse`: `handle()` mapea `DomainError` por su
 * `code` (401), así que sin esa conversión el 402 se pierde.
 */
export class CopyAccessError extends DomainError {
  readonly copyCode: typeof COPY_SUBSCRIPTION_REQUIRED;
  readonly status: 402;

  constructor(message: string = COPY_SUBSCRIPTION_REQUIRED_MESSAGE) {
    super("UNAUTHORIZED", message);
    this.name = "CopyAccessError";
    this.copyCode = COPY_SUBSCRIPTION_REQUIRED;
    this.status = 402;
  }
}

/** `Response` 402 `COPY_SUBSCRIPTION_REQUIRED`, o `null` si el error es otro. */
export function copyAccessResponseOf(error: unknown): Response | null {
  if (!(error instanceof CopyAccessError)) return null;
  return Response.json(
    { ok: false, error: { code: COPY_SUBSCRIPTION_REQUIRED, message: error.message } },
    { status: 402, headers: { "cache-control": "private, no-store" } },
  );
}

/**
 * Envuelve el cuerpo de una ruta: si salta el paywall devuelve el 402 y, si no,
 * deja pasar el resultado o el error original. Uso:
 * `handle("private", () => withCopyAccessResponse(async () => { ... }))`.
 */
export async function withCopyAccessResponse<T>(
  run: () => Promise<T | Response>,
): Promise<T | Response> {
  try {
    return await run();
  } catch (error) {
    const response = copyAccessResponseOf(error);
    if (response) return response;
    throw error;
  }
}

export type CopyAccessMode = "read" | "write";

/**
 * Exige acceso a Copiar o lanza 402 `COPY_SUBSCRIPTION_REQUIRED`.
 * `write` (por defecto) también rechaza `past_due`: en la gracia solo se lee.
 * Devuelve el estado para que la ruta decida detalles de la respuesta.
 */
export async function requireCopyAccess(
  userId: string,
  mode: CopyAccessMode = "write",
): Promise<CopyEntitlement> {
  const entitlement = await getCopyEntitlement(userId);
  if (!hasCopyAccess(entitlement)) {
    throw new CopyAccessError(COPY_SUBSCRIPTION_REQUIRED_MESSAGE);
  }
  if (mode === "write" && isCopyReadOnly(entitlement)) {
    throw new CopyAccessError(COPY_PAST_DUE_MESSAGE);
  }
  return entitlement;
}

/** Forma mínima que se redacta: detalle validado del feed (contrato §3). */
type RedactablePortfolio = {
  portfolio: { family: string };
  positions?: readonly unknown[];
  movements?: readonly unknown[];
};

/**
 * Sin acceso no viaja la composición: se quitan posiciones y movimientos y se
 * conservan catálogo, cabecera, fechas, atraso y cobertura. La única excepción
 * es `broker_cl`, que se ve completa (§1.10). El genérico conserva el tipo del
 * detalle para que la respuesta siga cuadrando con su esquema.
 */
export function redactPortfolio<T extends RedactablePortfolio>(
  portfolio: T,
  hasAccess: boolean,
): T {
  if (hasAccess) return portfolio;
  if (portfolio.portfolio.family === "broker_cl") return portfolio;
  return { ...portfolio, positions: [], movements: [] } as T;
}
