import "server-only";

/**
 * Guardias M74 conectadas al motor live (`trade.live`). Las usan las rutas
 * `/api/trade/*` de cuenta real DESPUÉS de `assertRealTradingEnabled` (M46:
 * con `REAL_TRADING_READY != true` la respuesta sigue siendo 503
 * REAL_DISABLED y nada de esto se ejecuta).
 *
 * - Kill switch: `trading_enabled=false` → 503 TRADING_PAUSED (cache 30 s).
 * - Beta cerrada: con `beta_only=true`, sólo `beta_users` cotiza/armar/envía.
 * - Límites: por orden, diario, mensual y global en America/Santiago.
 */

import { DomainError } from "@/lib/api/result";
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
  const deps = realTradeLimitsDeps();
  await assertTradingEnabled(deps);
  await assertBetaAccess(userId, deps);
  if (amountUsd !== null) {
    await assertLimitsOk(userId, amountUsd);
  }
}
