import "server-only";

import {
  SponsorError,
  type SponsorAbuseLimits,
  type SponsorErrorCode,
  type SponsorReservation,
  type SponsorUsageDecision,
  type SponsorUsageStore,
} from "./contracts";
import { isValidSponsorAbuseLimits } from "./policy";

/**
 * Almacén durable de cuotas del patrocinio (migración 0048).
 *
 * Regla de oro: este módulo NUNCA devuelve `allowed: true` por su cuenta.
 * Sólo repite el `true` que devolvió la base. Todo lo demás —tabla ausente,
 * RPC caída, fila vacía, tipo raro, código desconocido, timeout— es rechazo
 * con `SPONSOR_LIMITER_UNAVAILABLE`. No existe un modo "sin límites".
 *
 * El almacén por defecto del sistema sigue siendo `DENY_ALL_SPONSOR_USAGE_STORE`
 * (`policy.ts`): nada en la app construye este almacén todavía. El
 * patrocinio sigue apagado (`SPONSOR_ENABLED=false`) y no hay sponsors
 * registrados. Este módulo sólo prepara el camino.
 */

/** Firma mínima de la base; permite probar en memoria sin Supabase. */
export interface SponsorUsageStorePort {
  reserve(input: SponsorUsagePortInput): Promise<SponsorUsagePortResult>;
  release?(input: { readonly requestId: string; readonly sponsorId: string }): Promise<void>;
}

export interface SponsorUsagePortInput {
  readonly requestId: string;
  readonly userId: string;
  readonly sponsorId: string;
  readonly feeLamports: number;
  readonly messageSha256: string;
  readonly limits: SponsorAbuseLimits;
}

export interface SponsorUsagePortResult {
  readonly allowed: boolean;
  readonly code?: string | null;
  readonly remaining?: number | null;
}

/**
 * Códigos que la base puede devolver y que el dominio conoce. Un código
 * fuera de esta lista (versión nueva de la migración, fila manipulada) se
 * convierte en `SPONSOR_LIMITER_UNAVAILABLE`: se niega, no se adivina.
 */
const DENIAL_CODES: Readonly<Record<string, SponsorErrorCode>> = Object.freeze({
  SPONSOR_LIMIT_EXCEEDED: "SPONSOR_LIMIT_EXCEEDED",
  SPONSOR_COOLDOWN: "SPONSOR_COOLDOWN",
  SPONSOR_POLICY_INVALID: "SPONSOR_POLICY_INVALID",
  SPONSOR_REQUEST_INVALID: "SPONSOR_REQUEST_INVALID",
  SPONSOR_USER_NOT_ELIGIBLE: "SPONSOR_USER_NOT_ELIGIBLE",
  SPONSOR_LIMITER_UNAVAILABLE: "SPONSOR_LIMITER_UNAVAILABLE",
});

const SHA256_HEX_RE = /^[0-9a-f]{64}$/;
const HARD_MAX_FEE_LAMPORTS = 10_000_000;

function deny(code: SponsorErrorCode): SponsorUsageDecision {
  return { allowed: false, code };
}

function isNonEmptyBounded(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= Number.MAX_SAFE_INTEGER;
}

/**
 * Valida la reserva antes de tocar la base. Evita mandar a PostgreSQL datos
 * que no son una reserva (y evita depender de que la función SQL los
 * rechace). Una reserva inválida se niega, no se "arregla".
 */
function invalidReservationCode(reservation: SponsorReservation): SponsorErrorCode | null {
  if (!reservation || typeof reservation !== "object") return "SPONSOR_REQUEST_INVALID";
  if (!isNonEmptyBounded(reservation.requestId, 200)) return "SPONSOR_REQUEST_INVALID";
  if (!isNonEmptyBounded(reservation.userId, 200)) return "SPONSOR_USER_NOT_ELIGIBLE";
  if (!isNonEmptyBounded(reservation.sponsorId, 64)) return "SPONSOR_POLICY_INVALID";
  if (
    !isPositiveInteger(reservation.feeLamports) ||
    reservation.feeLamports > HARD_MAX_FEE_LAMPORTS
  ) {
    return "SPONSOR_POLICY_INVALID";
  }
  if (
    typeof reservation.messageSha256 !== "string" ||
    !SHA256_HEX_RE.test(reservation.messageSha256.trim().toLowerCase())
  ) {
    return "SPONSOR_REQUEST_INVALID";
  }
  if (!isValidSponsorAbuseLimits(reservation.limits)) return "SPONSOR_POLICY_INVALID";
  return null;
}

function defaultPort(): Promise<SponsorUsageStorePort> {
  // Import perezoso: un test con puerto en memoria no carga Supabase ni la
  // configuración del servidor, y el módulo sigue siendo server-only.
  return import("@/lib/services/sponsor-usage.supabase").then((mod) => ({
    reserve: mod.reserveSponsorUsage,
    release: mod.releaseSponsorUsage,
  }));
}

export interface CreateSponsorUsageStoreOptions {
  /**
   * `null` fuerza el rechazo (equivalente a `DENY_ALL_SPONSOR_USAGE_STORE`).
   * Omitido usa la base real (0048).
   */
  readonly port?: SponsorUsageStorePort | null;
}

/**
 * Construye el almacén durable. No se registra en ningún orquestador: hay que
 * pasarlo explícitamente en `SponsorshipDeps.usage`.
 */
export function createSponsorUsageStore(
  options: CreateSponsorUsageStoreOptions = {},
): SponsorUsageStore {
  const injected = options.port;

  async function resolvePort(): Promise<SponsorUsageStorePort | null> {
    if (injected === null) return null;
    if (injected) return injected;
    return defaultPort();
  }

  return {
    async reserve(reservation: SponsorReservation): Promise<SponsorUsageDecision> {
      const invalid = invalidReservationCode(reservation);
      if (invalid) return deny(invalid);

      let port: SponsorUsageStorePort | null;
      try {
        port = await resolvePort();
      } catch {
        return deny("SPONSOR_LIMITER_UNAVAILABLE");
      }
      if (!port || typeof port.reserve !== "function") {
        return deny("SPONSOR_LIMITER_UNAVAILABLE");
      }

      let result: SponsorUsagePortResult;
      try {
        result = await port.reserve({
          requestId: reservation.requestId.trim(),
          userId: reservation.userId.trim(),
          sponsorId: reservation.sponsorId.trim(),
          feeLamports: reservation.feeLamports,
          messageSha256: reservation.messageSha256.trim().toLowerCase(),
          limits: reservation.limits,
        });
      } catch {
        // Tabla ausente, RPC caída, timeout, error de red: se niega.
        return deny("SPONSOR_LIMITER_UNAVAILABLE");
      }

      // `!== true` es intencional: "true" (string), 1 o undefined no autorizan.
      if (!result || result.allowed !== true) {
        return deny(mapFailureCode(result?.code));
      }

      const remaining =
        typeof result.remaining === "number" &&
        Number.isInteger(result.remaining) &&
        result.remaining >= 0
          ? result.remaining
          : undefined;
      return remaining === undefined ? { allowed: true } : { allowed: true, remaining };
    },

    async release(reservation: SponsorReservation): Promise<void> {
      if (!reservation || !isNonEmptyBounded(reservation.requestId, 200)) {
        throw new SponsorError("SPONSOR_REQUEST_INVALID");
      }
      if (!isNonEmptyBounded(reservation.sponsorId, 64)) {
        throw new SponsorError("SPONSOR_POLICY_INVALID");
      }
      const port = await resolvePort();
      if (!port || typeof port.release !== "function") return;
      await port.release({
        requestId: reservation.requestId.trim(),
        sponsorId: reservation.sponsorId.trim(),
      });
    },
  };
}

/** Traduce el código de la base; desconocido o ausente ⇒ limiter unavailable. */
export function mapFailureCode(code: unknown): SponsorErrorCode {
  if (typeof code !== "string") return "SPONSOR_LIMITER_UNAVAILABLE";
  const normalized = code.trim();
  return DENIAL_CODES[normalized] ?? "SPONSOR_LIMITER_UNAVAILABLE";
}
