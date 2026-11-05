import "server-only";

import { DomainError } from "@/lib/api/result";
import { computeNotionalUsd } from "@/lib/trade/integrity";

/**
 * Reservas de cupo atómicas del trading real (auditoría 2026-11).
 *
 * La pieza atómica vive en SQL (`reserve_trade_amount`, migración 0042): ahí
 * se toman los locks, se leen los topes vigentes y se inserta la reserva en
 * una sola transacción. Este módulo es la capa de dominio:
 *
 * - normaliza y acota el vencimiento de la reserva;
 * - traduce los códigos `MV_LIMIT_*` / `MV_RESERVATION_*` a `DomainError`;
 * - valida que una reserva exista, siga vigente y coincida con el monto;
 * - implementa el flujo de submit: una reserva `consumed` permite el
 *   reintento idempotente; una `released`, vencida o inexistente no.
 *
 * Ninguna función toca red ni base por sí sola: el `ReservationStore` se
 * inyecta (producción: `lib/services/trade-reservations.supabase.ts`).
 */

/** Vida de una reserva: cubre el TTL de la cotización (60 s) con margen. */
export const RESERVATION_TTL_MS = 120_000;
/** Tope duro para no retener cupo por accidente. */
export const RESERVATION_MAX_TTL_MS = 10 * 60_000;
/** Margen sobre el vencimiento de la cotización. */
export const RESERVATION_CLOCK_SKEW_MS = 30_000;
/** Diferencia máxima tolerada entre el monto reservado y el validado. */
export const RESERVATION_AMOUNT_TOLERANCE_USD = 0.01;

export type ReservationStatus = "reserved" | "consumed" | "released";

export type ReservationRecord = {
  id: string;
  amountUsd: number;
  expiresAt: string;
  status: ReservationStatus;
};

export type ReservationInput = {
  userId: string;
  requestId: string;
  amountUsd: number;
  /** Vencimiento de la cotización asociada (ISO). */
  expiresAt: string;
};

export type ReservationStore = {
  reserve(input: ReservationInput): Promise<ReservationRecord>;
  consume(userId: string, requestId: string, amountUsd?: number): Promise<boolean>;
  release(userId: string, requestId: string): Promise<boolean>;
  read(userId: string, requestId: string): Promise<ReservationRecord | null>;
  /**
   * Jupiter puede devolver un requestId distinto al armar la transacción.
   * Re-etiqueta la reserva sin cambiar el monto. Opcional para stores de
   * prueba que no ejerciten build.
   */
  rekey?(userId: string, oldRequestId: string, newRequestId: string): Promise<boolean>;
  /**
   * D-06: libera las reservas `reserved` del usuario que no sean
   * `keepRequestId` (cadena vacía = todas). Una sola reserva especulativa por
   * usuario: la cotización nueva reemplaza a la anterior. Opcional; la pieza
   * autoritativa es la función SQL de 0042.
   */
  releaseOthers?(userId: string, keepRequestId: string): Promise<number>;
};

const LIMIT_MARKERS: ReadonlyArray<[string, "LIMIT_ORDER" | "LIMIT_DAILY" | "LIMIT_MONTHLY" | "LIMIT_GLOBAL"]> = [
  ["MV_LIMIT_ORDER", "LIMIT_ORDER"],
  ["MV_LIMIT_DAILY", "LIMIT_DAILY"],
  ["MV_LIMIT_MONTHLY", "LIMIT_MONTHLY"],
  ["MV_LIMIT_GLOBAL", "LIMIT_GLOBAL"],
];

function parseIsoMs(value: string): number {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : Number.NaN;
}

/**
 * Vencimiento de la reserva: cubre la cotización + margen, nunca menos de
 * `ttlMs` ni más de `RESERVATION_MAX_TTL_MS` desde ahora.
 */
export function reservationExpiry(
  quoteExpiresAt: string | null | undefined,
  now: Date = new Date(),
  ttlMs: number = RESERVATION_TTL_MS,
): string {
  const nowMs = now.getTime();
  const ttl = Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : RESERVATION_TTL_MS;
  let target = nowMs + ttl;
  const quoteMs = quoteExpiresAt ? parseIsoMs(quoteExpiresAt) : Number.NaN;
  if (Number.isFinite(quoteMs) && quoteMs > nowMs) {
    target = Math.max(target, quoteMs + RESERVATION_CLOCK_SKEW_MS);
  }
  target = Math.min(target, nowMs + RESERVATION_MAX_TTL_MS);
  return new Date(target).toISOString();
}

/** Notional de la cotización que se va a reservar. */
export function quoteReservationAmount(quote: {
  side: string;
  inAmountUi: number;
  outAmountUi: number;
  pricePerShareUsd?: number | null;
}): number {
  return computeNotionalUsd(quote);
}

function normalizeAmount(amountUsd: number): number {
  if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
    throw new DomainError("VALIDATION", "El monto de la operación no es válido.");
  }
  const rounded = Math.round((amountUsd + Number.EPSILON) * 100) / 100;
  if (!(rounded > 0)) throw new DomainError("VALIDATION", "El monto de la operación no es válido.");
  return rounded;
}

function normalizeRequestId(requestId: string): string {
  const value = typeof requestId === "string" ? requestId.trim() : "";
  if (!value || value.length > 256) {
    throw new DomainError("VALIDATION", "La operación no tiene un identificador válido.");
  }
  return value;
}

/** Normaliza y valida la entrada antes de llamar a la base. */
export function normalizeReservationInput(
  input: ReservationInput,
  now: Date = new Date(),
): ReservationInput {
  const userId = typeof input.userId === "string" ? input.userId.trim() : "";
  if (!userId) throw new DomainError("UNAUTHORIZED");
  const expiresMs = parseIsoMs(input.expiresAt);
  if (!Number.isFinite(expiresMs) || expiresMs <= now.getTime()) {
    throw new DomainError("QUOTE_EXPIRED", "La cotización venció. Pide una nueva.");
  }
  return {
    userId,
    requestId: normalizeRequestId(input.requestId),
    amountUsd: normalizeAmount(input.amountUsd),
    expiresAt: new Date(expiresMs).toISOString(),
  };
}

/** Traduce el error de la función SQL a un `DomainError` de dominio. */
export function mapReservationFailure(error: unknown): DomainError {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const upper = raw.toUpperCase();
  for (const [marker, code] of LIMIT_MARKERS) {
    if (upper.includes(marker)) return new DomainError(code);
  }
  if (upper.includes("MV_RESERVATION_CONFLICT") || upper.includes("23505")) {
    return new DomainError("VALIDATION", "Esta operación ya se está procesando.");
  }
  if (
    upper.includes("MV_RESERVATION_EXPIRED") ||
    upper.includes("MV_RESERVATION_MISSING")
  ) {
    return new DomainError("QUOTE_EXPIRED", "La reserva de esta operación venció. Pide una nueva cotización.");
  }
  if (upper.includes("MV_RESERVATION_INVALID")) {
    return new DomainError("VALIDATION", "Los datos de la reserva no son válidos.");
  }
  return new DomainError("UPSTREAM", "No pudimos reservar el cupo de la operación. Intenta de nuevo.");
}

/**
 * D-06: libera las reservas especulativas previas del usuario.
 *
 * Cada cotización creaba una reserva nueva sin liberar la anterior: tres
 * cotizaciones de US$200 agotaban el tope diario de US$500 sin haber operado.
 * La cotización nueva reemplaza a la anterior, así que el cupo retenido es el
 * de una sola intención de operar.
 *
 * Nunca toca reservas `consumed`: ésas ya representan una ejecución en curso
 * o hecha y deben seguir contando. `keepRequestId` vacío libera todas.
 * Devuelve cuántas liberó; si el store no lo soporta, 0 (la SQL de 0042 hace
 * la misma liberación dentro de la transacción de reserva).
 */
export async function releaseOtherReservations(
  store: ReservationStore,
  userId: string,
  keepRequestId: string = "",
): Promise<number> {
  const owner = typeof userId === "string" ? userId.trim() : "";
  if (!owner || !store.releaseOthers) return 0;
  try {
    return await store.releaseOthers(owner, keepRequestId.trim());
  } catch {
    // No es una compuerta de seguridad: si falla, la reserva atómica vuelve a
    // intentar la liberación y, si tampoco puede, falla cerrado.
    return 0;
  }
}

/** Reserva el cupo o lanza el `DomainError` que corresponda. */
export async function reserveOrThrow(
  store: ReservationStore,
  input: ReservationInput,
  now: Date = new Date(),
): Promise<ReservationRecord> {
  const normalized = normalizeReservationInput(input, now);
  // D-06: una sola reserva activa por usuario. Se libera la anterior antes de
  // crear la nueva; la función SQL repite la liberación bajo los advisory
  // locks, así que un fallo acá no deja dos reservas activas.
  await releaseOtherReservations(store, normalized.userId, normalized.requestId);
  let record: ReservationRecord;
  try {
    record = await store.reserve(normalized);
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw mapReservationFailure(error);
  }
  if (!record || typeof record.id !== "string" || !record.id) {
    throw new DomainError("UPSTREAM", "La reserva no se pudo registrar. No se envió nada.");
  }
  if (record.status !== "reserved") {
    throw new DomainError("VALIDATION", "La reserva no quedó activa. Intenta de nuevo.");
  }
  if (record.amountUsd !== normalized.amountUsd) {
    throw new DomainError("UPSTREAM", "La reserva no coincide con el monto de la operación.");
  }
  return record;
}

/**
 * Verifica que una reserva siga activa y coincida con el monto esperado.
 * `amountUsd` es opcional cuando la capa que llama no conoce el monto.
 */
export function assertReservationActive(
  record: ReservationRecord | null,
  opts: { amountUsd?: number; now?: Date; toleranceUsd?: number } = {},
): void {
  const now = opts.now ?? new Date();
  if (!record) {
    throw new DomainError("QUOTE_EXPIRED", "La reserva de esta operación no existe o venció.");
  }
  if (record.status !== "reserved") {
    throw new DomainError("QUOTE_EXPIRED", "La reserva de esta operación ya no está activa.");
  }
  if (!Number.isFinite(record.amountUsd) || record.amountUsd <= 0) {
    throw new DomainError("UPSTREAM", "La reserva no tiene un monto válido.");
  }
  const expiresMs = parseIsoMs(record.expiresAt);
  if (!Number.isFinite(expiresMs) || expiresMs <= now.getTime()) {
    throw new DomainError("QUOTE_EXPIRED", "La reserva de esta operación venció. Pide una nueva cotización.");
  }
  if (opts.amountUsd !== undefined) {
    const tolerance =
      typeof opts.toleranceUsd === "number" && Number.isFinite(opts.toleranceUsd) && opts.toleranceUsd >= 0
        ? opts.toleranceUsd
        : RESERVATION_AMOUNT_TOLERANCE_USD;
    if (Math.abs(record.amountUsd - opts.amountUsd) > tolerance) {
      throw new DomainError("VALIDATION", "La reserva no coincide con el monto de la operación.");
    }
  }
}

/** Consume la reserva antes de ejecutar. `false` = ya no estaba activa. */
export async function consumeOrThrow(
  store: ReservationStore,
  userId: string,
  requestId: string,
  amountUsd?: number,
): Promise<void> {
  let consumed = false;
  try {
    consumed = await store.consume(userId, normalizeRequestId(requestId), amountUsd);
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw mapReservationFailure(error);
  }
  if (!consumed) {
    throw new DomainError("QUOTE_EXPIRED", "La reserva de esta operación venció. Pide una nueva cotización.");
  }
}

/**
 * Re-etiqueta la reserva con el requestId que devolvió Jupiter en `build`.
 * Si el id no cambió, valida que la reserva siga activa.
 */
export async function rekeyOrThrow(
  store: ReservationStore,
  userId: string,
  oldRequestId: string,
  newRequestId: string,
  now: Date = new Date(),
): Promise<void> {
  const oldId = normalizeRequestId(oldRequestId);
  const newId = normalizeRequestId(newRequestId);
  if (oldId === newId) {
    assertReservationActive(await store.read(userId, newId), { now });
    return;
  }
  if (!store.rekey) {
    throw new DomainError("UPSTREAM", "No pudimos reasignar la reserva de la operación.");
  }
  let moved: boolean;
  try {
    moved = await store.rekey(userId, oldId, newId);
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw mapReservationFailure(error);
  }
  if (!moved) {
    throw new DomainError("QUOTE_EXPIRED", "La reserva de esta operación venció. Pide una nueva cotización.");
  }
}

/** Libera sin lanzar: la conciliación no debe romperse por un reintento. */
export async function releaseQuietly(
  store: ReservationStore,
  userId: string,
  requestId: string,
): Promise<boolean> {
  try {
    return await store.release(userId, normalizeRequestId(requestId));
  } catch {
    return false;
  }
}

/**
 * Flujo de submit: una reserva `consumed` permite el reintento idempotente
 * (el `request_id` único de `orders` evita ejecutar dos veces). Una reserva
 * `reserved` se consume ahora. Una `released`, vencida o inexistente corta
 * antes de enviar nada.
 */
export async function assertSubmitReservation(
  store: ReservationStore,
  userId: string,
  requestId: string,
  now: Date = new Date(),
): Promise<"consumed" | "already_consumed"> {
  let record: ReservationRecord | null;
  try {
    record = await store.read(userId, normalizeRequestId(requestId));
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw mapReservationFailure(error);
  }
  if (!record) {
    throw new DomainError("QUOTE_EXPIRED", "La reserva de esta operación no existe. Pide una nueva cotización.");
  }
  if (record.status === "consumed") return "already_consumed";
  if (record.status !== "reserved") {
    throw new DomainError("QUOTE_EXPIRED", "La reserva de esta operación ya no está activa.");
  }
  if (!Number.isFinite(record.amountUsd) || record.amountUsd <= 0) {
    throw new DomainError("UPSTREAM", "La reserva no tiene un monto válido.");
  }
  const expiresMs = parseIsoMs(record.expiresAt);
  if (!Number.isFinite(expiresMs) || expiresMs <= now.getTime()) {
    throw new DomainError("QUOTE_EXPIRED", "La reserva de esta operación venció. Pide una nueva cotización.");
  }
  await consumeOrThrow(store, userId, requestId, record.amountUsd);
  return "consumed";
}
