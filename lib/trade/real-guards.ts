import "server-only";

/**
 * Guardias M74 conectadas al motor live (`trade.live`). Las usan las rutas
 * `/api/trade/*` de cuenta real junto con `assertRealTradingEnabled` (M46:
 * con `REAL_TRADING_READY != true` la respuesta sigue siendo 503
 * REAL_DISABLED y nada de esto se ejecuta).
 *
 * - Bloqueo de ejecución real (auditoría 2026-11): las reservas atómicas
 *   (0042), la revalidación de montos en build/submit y la huella de la
 *   transacción armada ya existen, pero la compuerta sigue cerrada hasta
 *   completar la verificación integral (migración aplicada, conciliación de
 *   reservas, pruebas contra Supabase real y revisión externa). TODA
 *   operación real responde 503 REAL_DISABLED, incluso con
 *   `REAL_TRADING_READY=true`. La demo no pasa por estas guardias.
 * - Motor live obligatorio: con `DATA_MODE != live` la cuenta real responde
 *   503 REAL_DISABLED (nunca se opera dinero real contra el motor mock).
 * - Kill switch: `trading_enabled=false` → 503 TRADING_PAUSED (cache 30 s).
 * - Beta cerrada: con `beta_only=true`, sólo `beta_users` cotiza/armar/envía.
 * - Límites: por orden, diario, mensual y global en America/Santiago.
 */

import { DomainError } from "@/lib/api/result";
import { serverEnv } from "@/lib/env";
import {
  isBetaUser,
  readFlagValue,
  readUserLimitsRow,
  toUserLimitsRow,
} from "@/lib/admin/store";
import { getFlag } from "@/lib/flags";
import {
  listAllOrdersForLimits,
  listOrdersForLimits,
} from "@/lib/services/orders.supabase";
import {
  createTradeReservationStore,
  listActiveReservationsForLimits,
  listAllActiveReservationsForLimits,
} from "@/lib/services/trade-reservations.supabase";
import {
  assertBetaAccess,
  assertTradingEnabled,
  checkLimits,
  orderNotionalUsd,
  type CountedOrder,
  type LimitsDeps,
} from "@/lib/trade/limits";
import {
  assertReservationActive,
  assertSubmitReservation,
  mapReservationFailure,
  releaseQuietly,
  rekeyOrThrow,
  reserveOrThrow,
  type ReservationInput,
  type ReservationRecord,
} from "@/lib/trade/reservations";

/**
 * Bloqueo explícito de la ejecución real (auditoría 2026-11).
 *
 * La reserva atómica de cupo (migración 0042), la revalidación de montos de
 * build, la comparación mensaje-armado/mensaje-firmado y la liberación de
 * reservas en la conciliación ya están implementadas. Aun así el bloqueo
 * sigue en `true`: falta aplicar 0042 en un entorno de pruebas, correr la
 * conciliación contra Supabase real y completar la verificación integral de
 * seguridad. El flag es una compuerta de código, no una variable de entorno.
 */
export const REAL_EXECUTION_LOCKED: boolean = true;

/**
 * Corta cualquier operación real antes de leer flags, límites o tocar el
 * motor. Lanza siempre 503 REAL_DISABLED mientras `REAL_EXECUTION_LOCKED`
 * sea `true`; la demo no llama a esta función.
 */
export function assertRealExecutionLocked(): void {
  if (!REAL_EXECUTION_LOCKED) return;
  throw new DomainError("REAL_DISABLED");
}

function reservationStore() {
  return createTradeReservationStore();
}

/**
 * Reserva cupo atómico para una cotización real. La función SQL toma los
 * locks y aplica los topes vigentes; si no cabe, lanza LIMIT_*. Se llama
 * después de `assertRealTradeAllowed` y sigue detrás de la compuerta.
 */
export async function reserveRealTradeAmount(
  input: ReservationInput,
): Promise<ReservationRecord> {
  assertRealExecutionLocked();
  return reserveOrThrow(reservationStore(), input);
}

/** Valida que la reserva de un `quoteId` siga activa antes de armar la tx. */
export async function assertRealTradeReservation(
  userId: string,
  requestId: string,
  amountUsd?: number,
): Promise<void> {
  assertRealExecutionLocked();
  const store = reservationStore();
  let record: ReservationRecord | null;
  try {
    record = await store.read(userId, requestId);
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw mapReservationFailure(error);
  }
  assertReservationActive(record, { amountUsd });
}

/** Re-etiqueta la reserva si Jupiter cambió el requestId al armar la tx. */
export async function rekeyRealTradeReservation(
  userId: string,
  oldRequestId: string,
  newRequestId: string,
): Promise<void> {
  assertRealExecutionLocked();
  await rekeyOrThrow(reservationStore(), userId, oldRequestId, newRequestId);
}

/**
 * Antes de enviar: consume la reserva o acepta un reintento idempotente si
 * ya estaba consumida. Nunca deja pasar una reserva liberada/vencida.
 */
export async function assertRealSubmitReservation(
  userId: string,
  requestId: string,
): Promise<"consumed" | "already_consumed"> {
  assertRealExecutionLocked();
  return assertSubmitReservation(reservationStore(), userId, requestId);
}

/** Libera el cupo cuando la ejecución no ocurrió (fallo/expiración). */
export async function releaseRealTradeReservation(
  userId: string,
  requestId: string,
): Promise<boolean> {
  assertRealExecutionLocked();
  return releaseQuietly(reservationStore(), userId, requestId);
}

function toCounted(
  rows: Awaited<ReturnType<typeof listOrdersForLimits>>,
): CountedOrder[] {
  return rows.map((row) => ({
    amountUsd: orderNotionalUsd(row),
    status: row.status,
    createdAt: row.created_at,
  }));
}

/**
 * Dependencias reales de los límites. `getFlagValue` usa el store admin
 * (misma lista blanca M57: `lib/admin/*`); `getFlagBool` pasa por `getFlag`
 * con su cache de 30 s y defaults seguros.
 */
export function realTradeLimitsDeps(): LimitsDeps {
  return {
    getFlagBool: (key) => getFlag(key),
    getFlagValue: (key) => readFlagValue(key),
    readUserLimits: async (userId) => {
      const row = await readUserLimitsRow(userId);
      return row ? toUserLimitsRow(row as unknown as Record<string, unknown>) : null;
    },
    isBetaUser: (userId) => isBetaUser(userId),
    listOrders: async (userId) => toCounted(await listOrdersForLimits(userId)),
    listOrdersAllUsers: async () => toCounted(await listAllOrdersForLimits()),
    // Defensa en profundidad: además de las órdenes, el chequeo de límites
    // suma las reservas atómicas activas (0042). Si esta lectura falla,
    // `checkLimits` falla cerrado.
    listReservations: (userId) => listActiveReservationsForLimits(userId),
    listReservationsAllUsers: () => listAllActiveReservationsForLimits(),
    now: () => new Date(),
  };
}

/**
 * Defensa en profundidad: una cuenta real sólo opera si el motor de datos es
 * live. Con `DATA_MODE=mock` las rutas reales responderían con el motor mock
 * (saldos y órdenes de juguete), así que se apagan con 503 REAL_DISABLED.
 */
export function assertRealTradingDataMode(): void {
  if (serverEnv.DATA_MODE !== "live") throw new DomainError("REAL_DISABLED");
}

/**
 * Fallo cerrado del motor live (auditoría 2026-11).
 *
 * `DATA_MODE=live` elige `liveTrade` sin mirar `AUTH_MODE`. Por eso un request
 * que no sea cuenta real de Supabase (sesión verificada + `mv_account=real`)
 * ni una demo explícita de Supabase no puede caer al camino live: los flags
 * `REAL_TRADING_READY`, la beta y los límites sólo se evalúan en la rama real.
 * Sin Supabase auth no hay sesión verificable, así que se responde 503
 * REAL_DISABLED antes de tocar el motor. La cuenta real queda bloqueada en
 * cualquier `DATA_MODE`; en `DATA_MODE=mock` la demo sigue usando el motor
 * mock en memoria.
 */
export function assertLiveEngineAccess(
  isRealAccount: boolean,
  isDemoAccount: boolean,
): void {
  // Auditoría 2026-11: una cuenta real no toca el motor live en ninguna
  // etapa (cotizar, armar, enviar ni leer estado), aunque M46 esté encendido.
  if (isRealAccount) assertRealExecutionLocked();
  if (serverEnv.DATA_MODE !== "live") return;
  if (isDemoAccount) return;
  throw new DomainError("REAL_DISABLED");
}

/** Verifica los límites y lanza el DomainError del código que falló. */
export async function assertLimitsOk(
  userId: string,
  amountUsd: number,
): Promise<void> {
  const verdict = await checkLimits(userId, amountUsd, realTradeLimitsDeps());
  if (!verdict.ok) {
    throw new DomainError(verdict.code ?? "LIMIT_ORDER", verdict.message);
  }
}

/**
 * Guardia completa de una operación real (cotizar, armar o enviar):
 * kill switch → beta → límites. `amountUsd` null = etapa sin monto todavía
 * (build/submit, que re-comprueban sobre la cotización guardada).
 */
export async function assertRealTradeAllowed(
  userId: string,
  amountUsd: number | null,
): Promise<void> {
  // Defensa en profundidad para futuras rutas que no pasen por
  // `assertLiveEngineAccess`: la compuerta de ejecución va primero y no
  // depende de `REAL_TRADING_READY`, del kill switch ni de la beta.
  assertRealExecutionLocked();

  // Secuencia lista para cuando se levante el bloqueo: kill switch → beta →
  // límites de defensa en profundidad. La reserva atómica (0042) se toma
  // después, al cotizar, y es la pieza autoritativa de cupo.
  const deps = realTradeLimitsDeps();
  await assertTradingEnabled(deps);
  await assertBetaAccess(userId, deps);
  if (amountUsd !== null) {
    await assertLimitsOk(userId, amountUsd);
  }
}
