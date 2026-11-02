import "server-only";

/**
 * Guardias M74 conectadas al motor live (`trade.live`). Las usan las rutas
 * `/api/trade/*` de cuenta real junto con `assertRealTradingEnabled` (M46:
 * con `REAL_TRADING_READY != true` la respuesta sigue siendo 503
 * REAL_DISABLED y nada de esto se ejecuta).
 *
 * - Bloqueo de ejecución real (auditoría 2026-11): mientras no existan
 *   reservas atómicas de límites ni revalidación de montos en build/submit,
 *   TODA operación real queda bloqueada con 503 REAL_DISABLED, incluso con
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
  assertBetaAccess,
  assertTradingEnabled,
  checkLimits,
  orderNotionalUsd,
  type CountedOrder,
  type LimitsDeps,
} from "@/lib/trade/limits";

/**
 * Bloqueo explícito de la ejecución real (auditoría 2026-11).
 *
 * Motivo: `checkLimits` cuenta órdenes ya creadas, pero no reserva cupo de
 * forma atómica entre quote/build/submit. Dos solicitudes concurrentes pueden
 * pasar el mismo tope, y una orden `built` no revalida que el monto siga
 * coincidiendo con la cotización al firmarse. Hasta implementar reservas
 * atómicas y esa revalidación, este flag queda fijo en `true` y no se puede
 * abrir con variables de entorno.
 *
 * No es una variable de configuración: es una compuerta de código. Sólo se
 * cambia cuando existan las garantías de arriba (T20/auditoría posterior).
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

  // Esta secuencia queda lista para cuando se levante el bloqueo, una vez
  // implementadas las reservas atómicas y la revalidación de montos.
  const deps = realTradeLimitsDeps();
  await assertTradingEnabled(deps);
  await assertBetaAccess(userId, deps);
  if (amountUsd !== null) {
    await assertLimitsOk(userId, amountUsd);
  }
}
