import "server-only";

import { DomainError } from "@/lib/api/result";

/**
 * Límites por usuario y globales, beta cerrada y kill switches (M74).
 *
 * - Topes por orden, diario y mensual por usuario en zona `America/Santiago`
 *   (default US$200 / US$500 / US$2.000) y tope global diario (US$10.000).
 *   Los defaults viven en `app_flags` (`limits_default` jsonb,
 *   `global_daily_usd`) y cada usuario puede tener fila propia en
 *   `user_limits` (null = usa el default).
 * - El monto contabilizado por orden es el notional en dólares de la
 *   operación: para compra, lo que entra (USDC); para venta, lo que sale.
 * - Se suma el notional de las órdenes vivas y confirmadas del día/mes
 *   (`submitted`, `confirmed`, `pending`, `signed`, `built`; `failed` y
 *   `expired` no cuentan).
 * - La carrera de dos órdenes simultáneas se corta en `build` con una
 *   reserva: el guardado de la cotización se hace después de pasar los
 *   límites, y `submit` vuelve a comprobarlos (defensa en profundidad).
 *   La función SQL `reserve_order_amount` queda fuera de alcance: la
 *   ventana de carrera se reduce a la de una orden `built` sin firmar,
 *   que `submit` re-comprueba y rechaza.
 */

const SANTIAGO_TZ = "America/Santiago";
const USD_EPSILON = Number.EPSILON;

export type LimitCode = "LIMIT_ORDER" | "LIMIT_DAILY" | "LIMIT_MONTHLY" | "LIMIT_GLOBAL";

export type LimitVerdict = {
  ok: boolean;
  code: LimitCode | null;
  remainingUsd: number;
  limitUsd: number;
  message: string;
};

export type LimitDefaults = {
  per_order_usd: number;
  daily_usd: number;
  monthly_usd: number;
};

export type UserLimitRow = {
  per_order_usd: number | null;
  daily_usd: number | null;
  monthly_usd: number | null;
} | null;

/** Orden contable para los topes. */
export type CountedOrder = {
  /** Notional en dólares de la operación. */
  amountUsd: number;
  status: string;
  createdAt: string;
};

export type FlagBoolReader = (key: string) => Promise<boolean>;
export type FlagValueReader = (key: string) => Promise<unknown>;
export type LimitsRowReader = (userId: string) => Promise<UserLimitRow>;
export type BetaMemberReader = (userId: string) => Promise<boolean>;
export type OrdersReader = (userId: string) => Promise<CountedOrder[]>;

export type LimitsDeps = {
  getFlagBool: FlagBoolReader;
  getFlagValue: FlagValueReader;
  readUserLimits: LimitsRowReader;
  isBetaUser: BetaMemberReader;
  listOrders: OrdersReader;
  /** Global: todas las órdenes contables del día (sólo para el tope global). */
  listOrdersAllUsers: () => Promise<CountedOrder[]>;
  now: () => Date;
};

// ---------------------------------------------------------------------------
// Zona horaria (America/Santiago)
// ---------------------------------------------------------------------------

/**
 * Clave local del instante en Santiago: "YYYY-MM-DD". Usa `Intl` con la zona
 * real del producto; ningún cálculo manual de offset.
 */
export function santiagoDayKey(at: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SANTIAGO_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/** Clave local del mes en Santiago: "YYYY-MM". */
export function santiagoMonthKey(at: Date): string {
  return santiagoDayKey(at).slice(0, 7);
}

// ---------------------------------------------------------------------------
// Defaults desde app_flags
// ---------------------------------------------------------------------------

function positiveNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function parseLimitsDefault(raw: unknown): LimitDefaults {
  const base: LimitDefaults = { per_order_usd: 200, daily_usd: 500, monthly_usd: 2000 };
  if (!raw || typeof raw !== "object") return base;
  const obj = raw as Record<string, unknown>;
  return {
    per_order_usd: positiveNumber(obj.per_order_usd) ?? base.per_order_usd,
    daily_usd: positiveNumber(obj.daily_usd) ?? base.daily_usd,
    monthly_usd: positiveNumber(obj.monthly_usd) ?? base.monthly_usd,
  };
}

export function parseGlobalDailyUsd(raw: unknown): number {
  return positiveNumber(raw) ?? 10_000;
}

export async function readLimitsDefaults(getFlagValue: FlagValueReader): Promise<LimitDefaults> {
  try {
    return parseLimitsDefault(await getFlagValue("limits_default"));
  } catch {
    return parseLimitsDefault(null);
  }
}

export async function readGlobalDailyUsd(getFlagValue: FlagValueReader): Promise<number> {
  try {
    return parseGlobalDailyUsd(await getFlagValue("global_daily_usd"));
  } catch {
    return parseGlobalDailyUsd(null);
  }
}

// ---------------------------------------------------------------------------
// Órdenes contables
// ---------------------------------------------------------------------------

/**
 * Estados que suman al gasto: vivas (pending/submitted/signed/built) y
 * confirmadas. `failed` y `expired` no reservan plata.
 */
const COUNTED_STATUSES = new Set([
  "pending",
  "submitted",
  "confirmed",
  "signed",
  "built",
]);

export function isCountedStatus(status: string): boolean {
  return COUNTED_STATUSES.has(status);
}

/** Ventana contable [desde, hasta) en ms: día o mes local de Santiago. */
export function countedWindow(
  now: Date,
  scope: "day" | "month",
): { fromMs: number; toMs: number } {
  const targetKey = scope === "day" ? santiagoDayKey(now) : santiagoMonthKey(now);
  const msOfDay = 24 * 60 * 60 * 1000;
  // Arranque: 2 días atrás para el día, 40 atrás para el mes (cubre 31 días
  // de mes + desfase de zona); el borde derecho siempre es now + 2 días.
  let lo = now.getTime() - (scope === "day" ? 2 : 40) * msOfDay;
  let hi = now.getTime() + 2 * msOfDay;
  const keyAt = (ms: number): string => {
    const at = new Date(ms);
    return scope === "day" ? santiagoDayKey(at) : santiagoMonthKey(at);
  };
  // Búsqueda binaria del primer instante cuya clave local == objetivo.
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (keyAt(mid) < targetKey) lo = mid;
    else hi = mid;
  }
  const fromMs = hi;
  if (scope === "day") return { fromMs, toMs: fromMs + msOfDay };
  // Mes: avanzar en pasos de 1 día hasta que la clave de mes cambie. Barato
  // (≤ 31 iteraciones) y correcto para cualquier longitud de mes.
  let cursor = fromMs;
  for (let i = 0; i < 32; i += 1) {
    const next = cursor + msOfDay;
    if (santiagoMonthKey(new Date(next)) !== targetKey) {
      return { fromMs, toMs: next };
    }
    cursor = next;
  }
  return { fromMs, toMs: cursor + msOfDay };
}

/** Notional contable de una orden real: entra USDC (compra) o sale (venta). */
export function orderNotionalUsd(row: {
  side: string;
  in_amount_ui: number | string | null;
  out_amount_ui: number | string | null;
  price_per_share_usd?: number | string | null;
}): number {
  const side = row.side === "sell" ? "sell" : "buy";
  const inUi = Number(row.in_amount_ui ?? 0);
  const outUi = Number(row.out_amount_ui ?? 0);
  if (side === "buy") return inUi > 0 ? inUi : 0;
  if (outUi > 0) return outUi;
  // Venta sin out_amount_ui: aproximación con in (acciones) × precio.
  const price = Number(row.price_per_share_usd ?? 0);
  if (inUi > 0 && price > 0) return inUi * price;
  return 0;
}

/** Filtra a las órdenes contables dentro de la ventana. */
export function countOrdersInWindow(
  rows: CountedOrder[],
  window: { fromMs: number; toMs: number },
): number {
  let total = 0;
  for (const row of rows) {
    if (!isCountedStatus(row.status)) continue;
    const at = Date.parse(row.createdAt);
    if (!Number.isFinite(at) || at < window.fromMs || at >= window.toMs) continue;
    if (!(row.amountUsd > 0)) continue;
    total += row.amountUsd;
  }
  return total;
}

function round2(n: number): number {
  return Math.round((n + USD_EPSILON) * 100) / 100;
}

function verdict(
  ok: boolean,
  code: LimitCode | null,
  limitUsd: number,
  remainingUsd: number,
  message: string,
): LimitVerdict {
  return { ok, code, limitUsd: round2(limitUsd), remainingUsd: round2(Math.max(0, remainingUsd)), message };
}

// ---------------------------------------------------------------------------
// checkLimits
// ---------------------------------------------------------------------------

/**
 * Verifica los 4 topes. `amountUsd` es el notional de esta operación en
 * dólares. Orden de comprobación: por orden → mensual → diario → global
 * (el más específico primero: el mensaje apunta a la causa).
 */
export async function checkLimits(
  userId: string,
  amountUsd: number,
  deps: LimitsDeps,
): Promise<LimitVerdict> {
  const now = deps.now();
  if (!(Number.isFinite(amountUsd) && amountUsd > 0)) {
    return verdict(false, "LIMIT_ORDER", 0, 0, "El monto tiene que ser mayor que cero.");
  }

  const [defaults, userRow, globalCap] = await Promise.all([
    readLimitsDefaults(deps.getFlagValue),
    deps.readUserLimits(userId).catch(() => null),
    readGlobalDailyUsd(deps.getFlagValue),
  ]);

  const perOrder = userRow?.per_order_usd ?? defaults.per_order_usd;
  if (amountUsd > perOrder) {
    return verdict(
      false,
      "LIMIT_ORDER",
      perOrder,
      Math.max(0, perOrder - amountUsd),
      `La operación supera tu tope por orden (US$${round2(perOrder)}).`,
    );
  }

  const [orders, globalOrders] = await Promise.all([
    deps.listOrders(userId).catch(() => [] as CountedOrder[]),
    deps.listOrdersAllUsers().catch(() => [] as CountedOrder[]),
  ]);

  const dayWindow = countedWindow(now, "day");
  const monthWindow = countedWindow(now, "month");

  const dailyLimit = userRow?.daily_usd ?? defaults.daily_usd;
  const monthlyLimit = userRow?.monthly_usd ?? defaults.monthly_usd;

  const spentMonth = countOrdersInWindow(orders, monthWindow);
  if (spentMonth + amountUsd > monthlyLimit) {
    return verdict(
      false,
      "LIMIT_MONTHLY",
      monthlyLimit,
      monthlyLimit - spentMonth,
      `Alcanzaste tu límite mensual (US$${round2(monthlyLimit)}).`,
    );
  }

  const spentDay = countOrdersInWindow(orders, dayWindow);
  if (spentDay + amountUsd > dailyLimit) {
    return verdict(
      false,
      "LIMIT_DAILY",
      dailyLimit,
      dailyLimit - spentDay,
      `Alcanzaste tu límite diario (US$${round2(dailyLimit)}).`,
    );
  }

  const spentGlobalDay = countOrdersInWindow(globalOrders, dayWindow);
  if (spentGlobalDay + amountUsd > globalCap) {
    return verdict(
      false,
      "LIMIT_GLOBAL",
      globalCap,
      globalCap - spentGlobalDay,
      `Alcanzamos el tope global del día (US$${round2(globalCap)}). Intenta mañana.`,
    );
  }

  return verdict(true, null, dailyLimit, dailyLimit - spentDay - amountUsd, "");
}

// ---------------------------------------------------------------------------
// Beta cerrada
// ---------------------------------------------------------------------------

/**
 * Con `beta_only=true`, sólo los usuarios de `beta_users` operan en la cuenta
 * real. Si la lectura de la lista falla, se deniega (fail-closed).
 */
export async function checkBetaAccess(
  userId: string,
  deps: Pick<LimitsDeps, "getFlagBool" | "isBetaUser">,
): Promise<{ ok: boolean; betaOnly: boolean }> {
  let betaOnly = true;
  try {
    betaOnly = await deps.getFlagBool("beta_only");
  } catch {
    betaOnly = true;
  }
  if (!betaOnly) return { ok: true, betaOnly: false };
  let member = false;
  try {
    member = await deps.isBetaUser(userId);
  } catch {
    member = false;
  }
  return { ok: member, betaOnly: true };
}

// ---------------------------------------------------------------------------
// Kill switches
// ---------------------------------------------------------------------------

/** Cache propio de 30 s para no golpear la base en cada cotización. */
const KILL_TTL_MS = 30_000;
const killCache = new Map<string, { value: boolean; at: number }>();
let killClock: () => number = () => Date.now();

/** Sólo tests. */
export function __setKillSwitchClockForTests(next: (() => number) | null): void {
  if (process.env.NODE_ENV === "production") return;
  killClock = next ?? (() => Date.now());
}

/** Sólo tests. */
export function __resetKillSwitchesForTests(): void {
  if (process.env.NODE_ENV === "production") return;
  killCache.clear();
  killClock = () => Date.now();
}

async function readSwitch(key: string, deps: Pick<LimitsDeps, "getFlagBool">): Promise<boolean> {
  const now = killClock();
  const hit = killCache.get(key);
  if (hit && now - hit.at < KILL_TTL_MS) return hit.value;
  let value = false;
  try {
    value = await deps.getFlagBool(key);
  } catch {
    value = false;
  }
  killCache.set(key, { value, at: now });
  return value;
}

/** Limpia el cache local del servidor (lo llama /admin tras cambiar un flag). */
export function invalidateKillSwitchCache(): void {
  killCache.clear();
}

/** `trading_enabled=true` en `app_flags`. Default seguro: apagado. */
export async function isTradingEnabled(deps: Pick<LimitsDeps, "getFlagBool">): Promise<boolean> {
  return readSwitch("trading_enabled", deps);
}

/**
 * Kill switch global de trading: `trading_enabled=false` → 503
 * TRADING_PAUSED en quote, build y submit (≤ 30 s por el cache).
 */
export async function assertTradingEnabled(deps: Pick<LimitsDeps, "getFlagBool">): Promise<void> {
  if (!(await isTradingEnabled(deps))) {
    throw new DomainError("TRADING_PAUSED");
  }
}

/** Kill switch de entrada de dinero (M80): `onramp_enabled`. */
export async function assertOnrampEnabled(deps: Pick<LimitsDeps, "getFlagBool">): Promise<void> {
  if (!(await readSwitch("onramp_enabled", deps))) {
    throw new DomainError("REAL_DISABLED", "La entrada de dinero está pausada.");
  }
}

/** Kill switch de salidas (M79): `withdrawals_enabled`. */
export async function assertWithdrawalsEnabled(deps: Pick<LimitsDeps, "getFlagBool">): Promise<void> {
  if (!(await readSwitch("withdrawals_enabled", deps))) {
    throw new DomainError("REAL_DISABLED", "Las salidas de dinero están pausadas.");
  }
}

/** Verdad: el usuario está en la beta (para el gate de la cuenta real). */
export async function assertBetaAccess(
  userId: string,
  deps: Pick<LimitsDeps, "getFlagBool" | "isBetaUser">,
): Promise<void> {
  const access = await checkBetaAccess(userId, deps);
  if (!access.ok) throw new DomainError("BETA_CLOSED");
}
