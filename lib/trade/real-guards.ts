import "server-only";

/**
 * Guardias M74 conectadas al motor live (`trade.live`). Las usan las rutas
 * `/api/trade/*` de cuenta real junto con `assertRealTradingEnabled` (M46:
 * con `REAL_TRADING_READY != true` la respuesta sigue siendo 503
 * REAL_DISABLED y nada de esto se ejecuta).
 *
 * - Bloqueo de ejecución real (auditoría 2026-11): las reservas atómicas
 *   (0042), la revalidación de montos en build/submit y la huella de la
 *   transacción armada ya existen. El candado sigue cerrado por defecto y el
 *   desbloqueo es controlado: sólo se abre con `REAL_EXECUTION_UNLOCKED=true`
 *   en el servidor, y aun así toda operación real sigue pasando por las
 *   compuertas de Supabase (compliance_config, system_flags, beta, límites y
 *   reservas 0042). Sin esa variable, TODA operación real responde 503
 *   REAL_DISABLED, incluso con `REAL_TRADING_READY=true`. La demo no pasa por
 *   estas guardias.
 * - Motor live obligatorio: con `DATA_MODE != live` la cuenta real responde
 *   503 REAL_DISABLED (nunca se opera dinero real contra el motor mock).
 * - Coherencia de la declaración (DB-03): la versión que exige y persiste
 *   `public.compliance_config` tiene que ser exactamente la de
 *   `serverEnv.US_PERSON_DECLARATION_VERSION`. Una lectura caída, una fila
 *   ausente o un valor distinto bloquea la cuenta real (503 REAL_DISABLED)
 *   y deja un aviso en el log del servidor.
 * - Kill switch: `trading_enabled=false` → 503 TRADING_PAUSED (cache 30 s).
 * - Beta cerrada: con `beta_only=true`, sólo `beta_users` cotiza/armar/envía.
 * - Límites: por orden, diario, mensual y global en America/Santiago.
 */

import { DomainError } from "@/lib/api/result";
import { usPersonDeclarationVerified } from "@/lib/auth/registro-schema";
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
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  assertBetaAccess,
  assertTradingEnabled,
  assertWithdrawalsEnabled,
  checkLimits,
  orderNotionalUsd,
  type CountedOrder,
  type LimitsDeps,
} from "@/lib/trade/limits";
import {
  assertReservationActive,
  assertSubmitReservation,
  mapReservationFailure,
  releaseOtherReservations,
  releaseQuietly,
  rekeyOrThrow,
  reserveOrThrow,
  type ReservationInput,
  type ReservationRecord,
} from "@/lib/trade/reservations";

/**
 * Bloqueo explícito de la ejecución real (auditoría 2026-11), con desbloqueo
 * controlado: el default es fail-closed y sólo se abre con
 * `REAL_EXECUTION_UNLOCKED=true` en el servidor.
 *
 * La variable por sí sola NO autoriza nada. La reserva atómica de cupo
 * (migración 0042), la revalidación de montos de build, la comparación
 * mensaje-armado/mensaje-firmado y la liberación de reservas en la
 * conciliación ya están implementadas, y detrás del candado siguen corriendo
 * las compuertas de Supabase: coherencia de `compliance_config` con
 * `US_PERSON_DECLARATION_VERSION` (DB-03), `system_flags`
 * (`trading_enabled` / `withdrawals_enabled`), beta cerrada, límites por
 * orden/día/mes/global y las reservas de la 0042. Cualquier lectura caída
 * falla cerrado con 503 REAL_DISABLED.
 *
 * Se lee al cargar el módulo: cambiarla exige reiniciar el proceso (o un
 * nuevo despliegue). Ausente o distinta de "true" = candado cerrado.
 */
export const REAL_EXECUTION_LOCKED: boolean =
  process.env.REAL_EXECUTION_UNLOCKED !== "true";

/**
 * Estado vivo del candado, releído en cada llamada. Así un desbloqueo o un
 * rollback no dependen de volver a cargar el candado de módulo.
 */
export function isRealExecutionLocked(): boolean {
  return process.env.REAL_EXECUTION_UNLOCKED !== "true" && REAL_EXECUTION_LOCKED;
}

/**
 * Corta cualquier operación real antes de leer flags, límites o tocar el
 * motor. Con el candado cerrado lanza 503 REAL_DISABLED; con el desbloqueo
 * controlado devuelve el paso para que se evalúen las compuertas de Supabase.
 * La demo no llama a esta función.
 */
export function assertRealExecutionLocked(): void {
  if (!isRealExecutionLocked()) return;
  throw new DomainError("REAL_DISABLED");
}

/**
 * DB-03: columnas mínimas para autorizar una operación real. Se leen por id
 * con el cliente de servidor (el id viene de la sesión ya verificada), no con
 * la cookie ni con datos del cuerpo.
 */
const REAL_COMPLIANCE_COLUMNS =
  "onboarding_completed,is_us_person,us_person_declaration_version,us_person_declared_at";

/** Ruta canónica de regularización: el onboarding vuelve a pedir la declaración. */
export const DECLARATION_REGULARIZATION_PATH = "/app/onboarding";

/**
 * Derivación segura cuando falta la declaración: no se inventa evidencia ni se
 * deja pasar la operación. El mensaje lleva a la persona al paso que sí puede
 * resolverla.
 */
export const REAL_COMPLIANCE_REQUIRED_MESSAGE =
  `Completa o actualiza tu declaración de residencia en ${DECLARATION_REGULARIZATION_PATH} antes de operar con dinero real.`;

/**
 * DB-03: coherencia entre la versión de la declaración que exige y persiste la
 * base (`public.compliance_config`) y la que usa la app para verificar
 * (`serverEnv.US_PERSON_DECLARATION_VERSION`).
 *
 * `update_my_profile` (0046) persiste la versión de la DB, mientras que
 * `assertRealAccountCompliance` verifica contra la del entorno. Si ambas
 * fuentes se separan, o se rechaza toda declaración nueva o se autoriza con
 * una referencia que la DB ya no acepta. Por eso la elegibilidad real exige
 * que coincidan exactamente: fila ausente, valor inválido, lectura caída o
 * versiones distintas bloquean con 503 REAL_DISABLED. La lectura no se cachea,
 * así una rotación se detecta en la siguiente comprobación.
 */
const COMPLIANCE_CONFIG_TABLE = "compliance_config";
const COMPLIANCE_CONFIG_COLUMNS = "us_person_declaration_version";

/**
 * Mismo formato que valida `set_us_person_declaration_version` (0046). Una
 * versión fuera de este patrón no puede ser la vigente: se rechaza tal cual,
 * sin normalizarla ni "arreglarla".
 */
const DECLARATION_VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

export type DeclarationVersionCoherenceFailureReason =
  /** No se pudo leer `compliance_config` (config, red, permisos o RLS). */
  | "config_unavailable"
  /** La fila singleton no existe o no trae versión. */
  | "db_version_missing"
  /** La DB trae un valor que no cumple el formato de la migración 0046. */
  | "db_version_invalid"
  /** `serverEnv` no trae versión utilizable. */
  | "server_version_missing"
  /** `serverEnv` trae un valor fuera del formato admitido. */
  | "server_version_invalid"
  /** Ambas fuentes son válidas, pero no son exactamente la misma versión. */
  | "version_mismatch";

export type DeclarationVersionCoherence =
  | { ok: true; version: string }
  | { ok: false; reason: DeclarationVersionCoherenceFailureReason };

function declarationVersionText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function serverVersionFailureReason(
  value: unknown,
): DeclarationVersionCoherenceFailureReason | null {
  if (value === null || value === undefined) return "server_version_missing";
  if (typeof value !== "string") return "server_version_invalid";
  const version = declarationVersionText(value);
  if (version === null) return "server_version_missing";
  return DECLARATION_VERSION_PATTERN.test(version) ? null : "server_version_invalid";
}

function dbVersionFailureReason(
  value: unknown,
): DeclarationVersionCoherenceFailureReason | null {
  if (value === null || value === undefined) return "db_version_missing";
  if (typeof value !== "string") return "db_version_invalid";
  const version = declarationVersionText(value);
  if (version === null) return "db_version_missing";
  return DECLARATION_VERSION_PATTERN.test(version) ? null : "db_version_invalid";
}

/**
 * Veredicto puro de coherencia DB ↔ servidor. Falla cerrado en cualquier
 * duda y en el orden más útil para operaciones: primero la versión del
 * servidor (se puede corregir con un deploy), después la de la DB. Una
 * versión sólo se recorta en los bordes; el resto se compara exacto.
 */
export function declarationVersionCoherenceVerdict(
  dbVersion: unknown,
  serverVersion: unknown,
): DeclarationVersionCoherence {
  const serverReason = serverVersionFailureReason(serverVersion);
  if (serverReason) return { ok: false, reason: serverReason };

  const dbReason = dbVersionFailureReason(dbVersion);
  if (dbReason) return { ok: false, reason: dbReason };

  const db = (dbVersion as string).trim();
  const server = (serverVersion as string).trim();
  if (db !== server) return { ok: false, reason: "version_mismatch" };
  return { ok: true, version: server };
}

let lastDeclarationVersionIssueKey: string | null = null;

/**
 * Aviso operativo único por estado. No registra secretos ni datos de
 * personas; en `version_mismatch` sólo aparecen las dos versiones, que ya
 * pasaron el patrón seguro de la migración. El cliente recibe un 503
 * genérico: el detalle queda en el log del servidor.
 */
function reportDeclarationVersionIssue(
  reason: DeclarationVersionCoherenceFailureReason,
  detail?: string,
): void {
  const key = detail ? `${reason}:${detail}` : reason;
  if (key === lastDeclarationVersionIssueKey) return;
  lastDeclarationVersionIssueKey = key;
  const extra = detail ? ` (${detail})` : "";
  console.error(
    `[real-guards] declaración no verificable: ${reason}${extra}. ` +
      "Dinero real bloqueado: revisa compliance_config y US_PERSON_DECLARATION_VERSION.",
  );
}

/** Reinicia el aviso único (sólo tests). */
export function resetDeclarationVersionCoherenceWarningsForTests(): void {
  lastDeclarationVersionIssueKey = null;
}

async function readComplianceConfigDeclarationVersion(): Promise<unknown> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from(COMPLIANCE_CONFIG_TABLE)
    .select(COMPLIANCE_CONFIG_COLUMNS)
    .eq("singleton", true)
    .maybeSingle();
  if (error) throw error;
  const row = data as Record<string, unknown> | null;
  return row?.[COMPLIANCE_CONFIG_COLUMNS] ?? null;
}

export type DeclarationVersionCoherenceDeps = {
  /** Sólo tests: inyecta la lectura de `compliance_config` sin tocar Supabase. */
  read?: () => Promise<unknown>;
  /** Sólo tests: fija la versión del servidor sin tocar el entorno. */
  serverVersion?: string | null;
};

/**
 * Comprueba la coherencia sin lanzar. Devuelve el veredicto y deja el aviso
 * operativo correspondiente; sirve para tests y para un diagnóstico futuro.
 */
export async function checkRealDeclarationVersionCoherence(
  deps: DeclarationVersionCoherenceDeps = {},
): Promise<DeclarationVersionCoherence> {
  const serverVersion =
    deps.serverVersion === undefined
      ? serverEnv.US_PERSON_DECLARATION_VERSION
      : deps.serverVersion;

  // Si la versión del servidor no sirve, no hay nada que comparar y no se
  // consulta la base: se falla cerrado de inmediato.
  const serverReason = serverVersionFailureReason(serverVersion);
  if (serverReason) {
    reportDeclarationVersionIssue(serverReason);
    return { ok: false, reason: serverReason };
  }

  let dbVersion: unknown;
  try {
    dbVersion = await (deps.read ?? readComplianceConfigDeclarationVersion)();
  } catch {
    // Sin fuente de verdad (config, red, permisos) no se autoriza nada.
    reportDeclarationVersionIssue("config_unavailable");
    return { ok: false, reason: "config_unavailable" };
  }

  const verdict = declarationVersionCoherenceVerdict(dbVersion, serverVersion);
  if (!verdict.ok) {
    const detail =
      verdict.reason === "version_mismatch"
        ? `db=${(dbVersion as string).trim()}, env=${(serverVersion as string).trim()}`
        : undefined;
    reportDeclarationVersionIssue(verdict.reason, detail);
  } else {
    // Estado sano: si más adelante vuelve a fallar, queda rastro otra vez.
    lastDeclarationVersionIssueKey = null;
  }
  return verdict;
}

/**
 * Guardia de coherencia para dinero real. Cualquier fallo de lectura o
 * comparación se traduce en 503 REAL_DISABLED; nunca se "corrige" la versión
 * ni se elige una de las dos fuentes por conveniencia.
 */
export async function assertRealDeclarationVersionCoherent(
  deps: DeclarationVersionCoherenceDeps = {},
): Promise<void> {
  const verdict = await checkRealDeclarationVersionCoherence(deps);
  if (!verdict.ok) throw new DomainError("REAL_DISABLED");
}

export type RealComplianceRow = Record<string, unknown> | null;

export type RealComplianceVerdict =
  | { ok: true }
  | { ok: false; reason: "missing" | "onboarding" | "declaration" };

/**
 * Veredicto puro de la declaración para dinero real (DB-03). Falla cerrado en
 * cualquier duda: sin fila, onboarding incompleto, respuesta "sí",
 * `is_us_person` ausente, fecha que no es un instante o versión que no es la
 * vigente. `currentVersion` vacía tampoco verifica nada.
 */
export function realAccountComplianceVerdict(
  row: RealComplianceRow,
  currentVersion: string | null = serverEnv.US_PERSON_DECLARATION_VERSION,
): RealComplianceVerdict {
  if (!row) return { ok: false, reason: "missing" };
  if (row.onboarding_completed !== true) return { ok: false, reason: "onboarding" };
  if (!usPersonDeclarationVerified(row, currentVersion)) {
    return { ok: false, reason: "declaration" };
  }
  return { ok: true };
}

export type RealComplianceDeps = {
  /** Sólo tests: inyecta la lectura del perfil sin tocar Supabase. */
  read?: (userId: string) => Promise<RealComplianceRow>;
  /** Sólo tests: fija la versión vigente sin tocar el entorno. */
  currentVersion?: string | null;
  /** Sólo tests: inyecta la lectura de `compliance_config` sin tocar Supabase. */
  readDeclarationVersion?: () => Promise<unknown>;
};

async function readRealComplianceRow(userId: string): Promise<RealComplianceRow> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select(REAL_COMPLIANCE_COLUMNS)
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  return (data as Record<string, unknown> | null) ?? null;
}

/**
 * Guardia de identidad y declaración para dinero real (DB-03). Exige, en
 * este orden: coherencia entre la versión vigente en la DB y la del servidor,
 * perfil completo (`onboarding_completed`) y declaración U.S. person vigente.
 * Todo esto va ANTES de flags, beta o límites.
 *
 * Falla cerrado:
 * - sin id → UNAUTHORIZED (no hay a quién autorizar);
 * - sin configuración de servidor, `compliance_config` ilegible, versiones
 *   distintas o lectura del perfil caída → REAL_DISABLED (no se opera a
 *   ciegas ni contra una referencia dudosa);
 * - sin fila / onboarding incompleto / declaración ausente, no vigente o con
 *   fecha ilegible → VALIDATION con la ruta de regularización. No se deriva
 *   `false` ni se inventa una respuesta: la persona vuelve a declarar.
 */
export async function assertRealAccountCompliance(
  userId: string,
  deps: RealComplianceDeps = {},
): Promise<void> {
  const id = typeof userId === "string" ? userId.trim() : "";
  if (id.length === 0) throw new DomainError("UNAUTHORIZED");

  const currentVersion =
    deps.currentVersion === undefined
      ? serverEnv.US_PERSON_DECLARATION_VERSION
      : deps.currentVersion;

  // DB-03: la declaración no se evalúa contra una versión que la base no
  // comparte. Va antes de leer el perfil: si la configuración está derivada,
  // no se consulta ni se autoriza evidencia de la persona.
  await assertRealDeclarationVersionCoherent({
    read: deps.readDeclarationVersion,
    serverVersion: currentVersion,
  });

  let row: RealComplianceRow;
  try {
    row = await (deps.read ?? readRealComplianceRow)(id);
  } catch (error) {
    if (error instanceof DomainError) throw error;
    // Sin fuente de verdad (config, red, permisos) no hay autorización.
    throw new DomainError("REAL_DISABLED");
  }

  const verdict = realAccountComplianceVerdict(row, currentVersion);
  if (!verdict.ok) throw new DomainError("VALIDATION", REAL_COMPLIANCE_REQUIRED_MESSAGE);
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

/**
 * Dependencias reales del kill switch de salidas (`withdrawals_enabled`, la
 * misma clave que muestra el panel en "Salida de dinero"). Fuera de
 * `real-guards` para que una ruta de salida no arme su propio lector de flags.
 */
export function realWithdrawalGuardDeps(): Pick<LimitsDeps, "getFlagBool"> {
  return { getFlagBool: (key) => getFlag(key) };
}

/**
 * Kill switch de salidas (auditoría D-01). Toda ruta que arme una salida de
 * dinero lo consulta ANTES de armar: apagado en el panel → 503 REAL_DISABLED.
 * La compuerta de ejecución real va primero, así que mientras
 * `REAL_EXECUTION_LOCKED` siga en `true` nada llega al proveedor.
 */
export async function assertRealWithdrawalsEnabled(): Promise<void> {
  assertRealExecutionLocked();
  await assertWithdrawalsEnabled(realWithdrawalGuardDeps());
}

/**
 * D-06: libera las reservas especulativas previas del usuario antes de pedir
 * una cotización nueva. Sin `keepRequestId` libera todas; la función SQL
 * repite la liberación dentro de la transacción de reserva.
 */
export async function releaseRealTradeReservations(
  userId: string,
  keepRequestId: string = "",
): Promise<number> {
  assertRealExecutionLocked();
  return releaseOtherReservations(reservationStore(), userId, keepRequestId);
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
 * coherencia DB↔servidor + identidad/declaración → kill switch → beta →
 * límites. `amountUsd` null = etapa sin monto todavía (build/submit, que
 * re-comprueban sobre la cotización guardada).
 */
export async function assertRealTradeAllowed(
  userId: string,
  amountUsd: number | null,
): Promise<void> {
  // Defensa en profundidad para futuras rutas que no pasen por
  // `assertLiveEngineAccess`: la compuerta de ejecución va primero y no
  // depende de `REAL_TRADING_READY`, del kill switch ni de la beta. Mientras
  // esté cerrada no se consulta la base para autorizar operaciones.
  assertRealExecutionLocked();

  // DB-03: cuando la compuerta se abra, ninguna operación real sigue sin
  // perfil completo + declaración U.S. person vigente. Va antes de flags,
  // beta y límites, y falla cerrado si la fuente no está disponible.
  await assertRealAccountCompliance(userId);

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
