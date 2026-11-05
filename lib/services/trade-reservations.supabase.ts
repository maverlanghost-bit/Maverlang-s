import "server-only";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type {
  ReservationInput,
  ReservationRecord,
  ReservationStatus,
  ReservationStore,
} from "@/lib/trade/reservations";

/**
 * Acceso a `trade_reservations` y a las funciones SQL atómicas (0042).
 *
 * Vive en `lib/services/*.supabase.ts` para que el cliente admin quede dentro
 * de la lista blanca (M57). La lógica de dominio y la traducción de errores
 * están en `lib/trade/reservations.ts`; acá sólo se habla con Supabase.
 *
 * Si la migración 0042 no está aplicada, las funciones/RPC no existen o la
 * tabla no está: el error sube y el llamador falla cerrado. No hay fallback a
 * "sin límites".
 */

type UnknownRow = Record<string, unknown>;

export type ActiveReservationLimitRow = {
  amountUsd: number;
  expiresAt: string;
};

function rpcErrorMessage(error: unknown): string {
  if (!error || typeof error !== "object") return "reservation_rpc_failed";
  const record = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
  const parts = [record.message, record.details, record.hint, record.code]
    .filter((part): part is string => typeof part === "string" && part.trim() !== "")
    .map((part) => part.trim());
  return parts.length > 0 ? parts.join(" | ") : "reservation_rpc_failed";
}

function firstRow(data: unknown): UnknownRow | null {
  if (Array.isArray(data)) {
    const first = data[0];
    return first && typeof first === "object" ? (first as UnknownRow) : null;
  }
  return data && typeof data === "object" ? (data as UnknownRow) : null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asPositiveNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function asStatus(value: unknown): ReservationStatus {
  return value === "consumed" || value === "released" ? value : "reserved";
}

function toReservation(row: UnknownRow, fallback?: ReservationInput): ReservationRecord | null {
  const id = asString(row.reservation_id ?? row.id);
  const expiresAt = asString(row.reserved_expires_at ?? row.expires_at);
  const amountUsd = asPositiveNumber(row.amount_usd) || (fallback ? fallback.amountUsd : 0);
  if (!id || !expiresAt || !(amountUsd > 0)) return null;
  return { id, amountUsd, expiresAt, status: asStatus(row.status) };
}

export function createTradeReservationStore(): ReservationStore {
  return {
    async reserve(input: ReservationInput): Promise<ReservationRecord> {
      const admin = createSupabaseAdminClient();
      const { data, error } = await admin.rpc("reserve_trade_amount", {
        p_user_id: input.userId,
        p_request_id: input.requestId,
        p_amount_usd: input.amountUsd,
        p_expires_at: input.expiresAt,
      });
      if (error) throw new Error(rpcErrorMessage(error));
      const record = toReservation(firstRow(data) ?? {}, input);
      if (!record) throw new Error("MV_RESERVATION_INVALID");
      return record;
    },

    async consume(userId: string, requestId: string, amountUsd?: number): Promise<boolean> {
      const admin = createSupabaseAdminClient();
      const { data, error } = await admin.rpc("consume_trade_reservation", {
        p_user_id: userId,
        p_request_id: requestId,
        p_amount_usd: amountUsd ?? null,
      });
      if (error) throw new Error(rpcErrorMessage(error));
      return data === true;
    },

    async release(userId: string, requestId: string): Promise<boolean> {
      const admin = createSupabaseAdminClient();
      const { data, error } = await admin.rpc("release_trade_reservation", {
        p_user_id: userId,
        p_request_id: requestId,
      });
      if (error) throw new Error(rpcErrorMessage(error));
      return data === true;
    },

    async read(userId: string, requestId: string): Promise<ReservationRecord | null> {
      const admin = createSupabaseAdminClient();
      const { data, error } = await admin.rpc("read_trade_reservation", {
        p_user_id: userId,
        p_request_id: requestId,
      });
      if (error) throw new Error(rpcErrorMessage(error));
      const row = firstRow(data);
      if (!row) return null;
      return toReservation(row);
    },

    async rekey(userId: string, oldRequestId: string, newRequestId: string): Promise<boolean> {
      const admin = createSupabaseAdminClient();
      const { data, error } = await admin.rpc("rekey_trade_reservation", {
        p_user_id: userId,
        p_old_request_id: oldRequestId,
        p_new_request_id: newRequestId,
      });
      if (error) throw new Error(rpcErrorMessage(error));
      return data === true;
    },

    /**
     * D-06: una sola reserva especulativa por usuario. La cotización nueva
     * libera las `reserved` anteriores en la misma base; las `consumed` no se
     * tocan (ya representan una ejecución en curso).
     */
    async releaseOthers(userId: string, keepRequestId: string): Promise<number> {
      const admin = createSupabaseAdminClient();
      const { data, error } = await admin.rpc("release_other_trade_reservations", {
        p_user_id: userId,
        p_keep_request_id: keepRequestId,
      });
      if (error) throw new Error(rpcErrorMessage(error));
      const released = typeof data === "number" ? data : Number(data);
      return Number.isFinite(released) && released > 0 ? released : 0;
    },
  };
}

/**
 * Reservas activas de un usuario para los topes de defensa en profundidad.
 * Lanza si la lectura falla: `checkLimits` convierte eso en UPSTREAM y no
 * inventa gasto cero.
 */
export async function listActiveReservationsForLimits(
  userId: string,
  limit = 500,
): Promise<ActiveReservationLimitRow[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("trade_reservations")
    .select("amount_usd,expires_at")
    .eq("user_id", userId)
    // `consumed` también retiene cupo hasta su vencimiento: mientras no
    // exista la orden, no debe abrirse una segunda operación.
    .in("status", ["reserved", "consumed"])
    .gt("expires_at", new Date().toISOString())
    .limit(limit);
  if (error || !Array.isArray(data)) throw new Error("reservations_unavailable");
  return data.map((raw) => {
    const row = raw as UnknownRow;
    return {
      amountUsd: asPositiveNumber(row.amount_usd),
      expiresAt: asString(row.expires_at),
    };
  });
}

/** Igual que la anterior, pero para el tope global diario. */
export async function listAllActiveReservationsForLimits(
  limit = 2000,
): Promise<ActiveReservationLimitRow[]> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("trade_reservations")
    .select("amount_usd,expires_at")
    .in("status", ["reserved", "consumed"])
    .gt("expires_at", new Date().toISOString())
    .limit(limit);
  if (error || !Array.isArray(data)) throw new Error("reservations_unavailable");
  return data.map((raw) => {
    const row = raw as UnknownRow;
    return {
      amountUsd: asPositiveNumber(row.amount_usd),
      expiresAt: asString(row.expires_at),
    };
  });
}

/** Lectura y liberación para la conciliación (M72). */
export async function readTradeReservation(
  userId: string,
  requestId: string,
): Promise<{ amountUsd: number; status: ReservationStatus; expiresAt: string } | null> {
  const store = createTradeReservationStore();
  try {
    const record = await store.read(userId, requestId);
    return record ? { amountUsd: record.amountUsd, status: record.status, expiresAt: record.expiresAt } : null;
  } catch {
    // La conciliación no debe caerse por una reserva ilegible: se reporta
    // como ausente y la orden sigue su curso normal.
    return null;
  }
}

export async function releaseTradeReservation(userId: string, requestId: string): Promise<boolean> {
  const store = createTradeReservationStore();
  try {
    return await store.release(userId, requestId);
  } catch {
    return false;
  }
}
