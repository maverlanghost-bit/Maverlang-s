import "server-only";

/**
 * Flags de producto (M57). Cache de 30 s.
 * No lo usan las rutas `/api/trade/*`: el dinero real sigue en 503 (M46)
 * hasta que M70/M74 conecten estos valores en quote, build y submit.
 */

export const FLAG_TTL_MS = 30_000;

export const ADMIN_FLAGS = [
  { key: "trading_enabled", label: "Operar" },
  { key: "onramp_enabled", label: "Entrada de dinero" },
  { key: "offramp_enabled", label: "Salida de dinero" },
  { key: "signup_enabled", label: "Registro de cuentas" },
  { key: "beta_only", label: "Sólo beta" },
] as const;

export type AdminFlagKey = (typeof ADMIN_FLAGS)[number]["key"];

export function isAdminFlagKey(key: string): key is AdminFlagKey {
  return ADMIN_FLAGS.some((flag) => flag.key === key);
}

/**
 * Si la base no responde, el dinero queda apagado.
 * `signup_enabled` y `beta_only` conservan la semilla.
 */
export function safeFlagDefault(key: string): boolean {
  switch (key) {
    case "trading_enabled":
    case "onramp_enabled":
    case "offramp_enabled":
    case "deposits_enabled":
    case "withdrawals_enabled":
      return false;
    case "signup_enabled":
      return true;
    case "beta_only":
      return true;
    default:
      return false;
  }
}

export function coerceFlag(value: unknown, key: string): boolean {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return safeFlagDefault(key);
}

type FlagReader = (key: string) => Promise<unknown>;

type CacheHit = { value: boolean; at: number };

let readerOverride: FlagReader | null = null;
let clock: () => number = () => Date.now();
const cache = new Map<string, CacheHit>();

/** Sólo tests. En producción no cambia la lectura. */
export function __setFlagReaderForTests(next: FlagReader | null): void {
  if (process.env.NODE_ENV === "production") return;
  readerOverride = next;
  cache.clear();
}

/** Sólo tests. */
export function __setFlagClockForTests(next: (() => number) | null): void {
  if (process.env.NODE_ENV === "production") return;
  clock = next ?? (() => Date.now());
}

/** Sólo tests. */
export function __resetFlagsForTests(): void {
  if (process.env.NODE_ENV === "production") return;
  readerOverride = null;
  clock = () => Date.now();
  cache.clear();
}

export function invalidateFlag(key?: string): void {
  if (key) cache.delete(key);
  else cache.clear();
}

async function readFlag(key: string): Promise<unknown> {
  if (readerOverride) return readerOverride(key);
  const { readFlagValue } = await import("@/lib/admin/store");
  return readFlagValue(key);
}

/**
 * Lee un flag. `undefined` del lector = fila ausente → default.
 * Si el lector lanza, devuelve el default seguro y no lo cachea.
 */
export async function getFlag(key: string): Promise<boolean> {
  const now = clock();
  const hit = cache.get(key);
  if (hit && now - hit.at < FLAG_TTL_MS) return hit.value;
  try {
    const raw = await readFlag(key);
    const value = raw === undefined ? safeFlagDefault(key) : coerceFlag(raw, key);
    cache.set(key, { value, at: now });
    return value;
  } catch {
    return safeFlagDefault(key);
  }
}

export function panelFlags(raw: ReadonlyMap<string, unknown> | null): Array<{
  key: AdminFlagKey;
  label: string;
  on: boolean;
}> {
  return ADMIN_FLAGS.map((flag) => ({
    key: flag.key,
    label: flag.label,
    on: raw && raw.has(flag.key) ? coerceFlag(raw.get(flag.key), flag.key) : safeFlagDefault(flag.key),
  }));
}
