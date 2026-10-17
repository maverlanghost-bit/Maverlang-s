import "server-only";

import { USDC_MINT, tickerBySymbol } from "@/config/tickers";
import { resolveAppEnv, serverEnv } from "@/lib/env";

/**
 * Chequeos de dependencias (M62) para `/api/health/deep`.
 *
 * Cada chequeo corre aparte, en paralelo, con su propio timeout de 3 s
 * (aplicado dentro de `runCheck`, así un `fetch` colgado no estira la
 * respuesta). El resultado es `{ ok, ms, error? }` con `error` corto y
 * redactado: nunca URLs con claves ni mensajes crudos de terceros.
 *
 * `probe` resuelve: `null` → dependencia no configurada o no usada por
 * este despliegue (`skipped`, cuenta como OK); `true` → respondió bien;
 * `false` → respondió mal; rechaza → error redactado por `shortError`.
 *
 * Críticos (deciden el 200/503): Supabase y Jupiter. Los demás son
 * informativos y nunca tiran la salud general.
 */

export interface HealthCheckResult {
  ok: boolean;
  ms: number;
  /** Mensaje corto del fallo (sin URLs ni claves). */
  error?: string;
}

export type HealthCheckStatus = "ok" | "skipped" | "failed";
export type HealthCheckOutcome = HealthCheckResult & { status: HealthCheckStatus };

export interface DeepHealthChecks {
  supabase: HealthCheckOutcome;
  jupiter: HealthCheckOutcome;
  xstocks: HealthCheckOutcome;
  fx: HealthCheckOutcome;
  rpc: HealthCheckOutcome;
  koywe: HealthCheckOutcome;
}

export interface DeepHealthReport {
  ok: boolean;
  env: string;
  dataMode: string;
  uptimeSeconds: number;
  memory: { usedMb: number; totalMb: number };
  checks: DeepHealthChecks;
}

/** Timeout por chequeo (M62): 3 s. */
export const HEALTH_CHECK_TIMEOUT_MS = 3_000;

/** Símbolo de prueba del catálogo (Jupiter price v3 + xStocks assets). */
const HEALTH_SYMBOL = "AAPLx";
/** Endpoint público de xStocks (el mismo que usa el horario M39). */
const XSTOCKS_ASSET_URL = "https://api.xstocks.fi/api/v2/public/assets/AAPLx";

/** La base es dependencia del despliegue si el despliegue la usa. */
export function supabaseActive(): boolean {
  return serverEnv.AUTH_MODE === "supabase" || serverEnv.DATA_MODE === "live";
}

/** Jupiter se consulta cuando hay precios live (o datos live). */
export function jupiterActive(): boolean {
  return serverEnv.PRICES_MODE === "live" || serverEnv.DATA_MODE === "live";
}

/** xStocks se consulta con horario live (igual que `asset-status.ts`). */
export function xstocksActive(): boolean {
  return serverEnv.PRICES_MODE === "live" || serverEnv.MARKET_STATUS_MODE === "live";
}

/** El dólar live (mindicador) sale con precios live. */
export function fxActive(): boolean {
  return serverEnv.PRICES_MODE === "live" || serverEnv.DATA_MODE === "live";
}

/** El RPC se lee con precios live (multiplicadores) o cartera live. */
export function rpcActive(): boolean {
  return serverEnv.PRICES_MODE === "live" || serverEnv.DATA_MODE === "live";
}

/** URL de Jupiter price v3 (igual que `lib/services/prices.live.ts`). */
function jupiterPriceUrl(): string {
  const base = serverEnv.JUPITER_BASE_URL.replace(/\/+$/, "");
  return base.endsWith("/price/v3") ? base : `${base}/price/v3`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function positiveNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : null;
  return null;
}

/** Mensaje del chequeo cuando el proveedor no respondió a tiempo. */
const TIMEOUT_MESSAGE = "Tiempo de espera agotado.";

/**
 * Mensaje de error corto y redactado. Si el texto crudo parece una URL
 * (la query puede traer claves) se reemplaza por un mensaje genérico.
 */
function shortError(error: unknown): string {
  if (error instanceof Error && (error.name === "AbortError" || error.name === "HealthTimeout")) {
    return TIMEOUT_MESSAGE;
  }
  const message = error instanceof Error ? error.message : String(error);
  const trimmed = message.trim();
  if (trimmed === "") return "Sin respuesta.";
  if (/https?:\/\//i.test(trimmed)) return "El proveedor no respondió correctamente.";
  return trimmed.slice(0, 160);
}

/** ms desde `start` (hrtime bigint), redondeado y nunca negativo. */
function elapsedMs(start: bigint): number {
  return Math.max(0, Math.round(Number(process.hrtime.bigint() - start) / 1_000_000));
}

/** GET JSON con timeout propio (AbortController) y `cache: no-store`. */
async function fetchJson(
  url: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
  headers?: Record<string, string>,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: { accept: "application/json", ...headers },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`http ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Timeout interno de `runCheck` (rechaza para que la carrera falle). */
class HealthTimeout extends Error {
  constructor() {
    super(TIMEOUT_MESSAGE);
    this.name = "HealthTimeout";
  }
}

/**
 * Corre un chequeo con su propio timeout de `timeoutMs`. `probe` resuelve:
 * `null` → `skipped` (ok); `true` → ok; `false` → failed genérico;
 * rechaza → failed con el error redactado. Si el chequeo no termina a
 * tiempo → failed "Tiempo de espera agotado." (nunca cuelga la respuesta).
 */
export async function runCheck(
  probe: () => Promise<boolean | null>,
  timeoutMs: number = HEALTH_CHECK_TIMEOUT_MS,
): Promise<HealthCheckOutcome> {
  const start = process.hrtime.bigint();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new HealthTimeout()), timeoutMs);
  });
  const work = Promise.resolve().then(probe);
  try {
    const verdict = await Promise.race([work, timeout]);
    const ms = elapsedMs(start);
    if (verdict === null) return { ok: true, ms, status: "skipped" };
    if (verdict) return { ok: true, ms, status: "ok" };
    return { ok: false, ms, status: "failed", error: "El proveedor no respondió correctamente." };
  } catch (error) {
    const ms = elapsedMs(start);
    return { ok: false, ms, status: "failed", error: shortError(error) };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/* --- Probes (inyectables para tests) --- */

export interface HealthProbes {
  fetchImpl?: typeof fetch;
  /** Reemplaza el chequeo de Supabase (tests). */
  supabaseSelect?: () => Promise<boolean | null>;
  /** Reemplaza el chequeo del RPC (tests; una promesa colgante sirve para ver el timeout). */
  rpcGetSlot?: () => Promise<boolean | null>;
  /** Reemplaza el chequeo de Koywe (tests). */
  koyweAuth?: () => Promise<boolean | null>;
}

/** Jupiter: price v3 de USDC + AAPLx con al menos una fila parseable. */
export function jupiterProbe(fetchImpl: typeof fetch): () => Promise<boolean | null> {
  return async () => {
    if (!jupiterActive()) return null;
    const mint = tickerBySymbol(HEALTH_SYMBOL)?.mint;
    if (!mint) return null;
    const url = new URL(jupiterPriceUrl());
    url.searchParams.set("ids", `${USDC_MINT},${mint}`);
    const headers: Record<string, string> = {};
    const apiKey = serverEnv.JUPITER_API_KEY?.trim();
    if (apiKey) headers["x-api-key"] = apiKey;
    const parsed = await fetchJson(url.toString(), fetchImpl, HEALTH_CHECK_TIMEOUT_MS, headers);
    return isObject(parsed) && Object.keys(parsed).length > 0;
  };
}

/** xStocks: `GET /public/assets/AAPLx` con un objeto JSON de vuelta. */
export function xstocksProbe(fetchImpl: typeof fetch): () => Promise<boolean | null> {
  return async () => {
    if (!xstocksActive()) return null;
    const parsed = await fetchJson(XSTOCKS_ASSET_URL, fetchImpl, HEALTH_CHECK_TIMEOUT_MS);
    return isObject(parsed);
  };
}

/** FX: `FX_SOURCE_URL` (mindicador) debe traer `serie[0].valor` > 0. */
export function fxProbe(fetchImpl: typeof fetch): () => Promise<boolean | null> {
  return async () => {
    if (!fxActive()) return null;
    const parsed = await fetchJson(serverEnv.FX_SOURCE_URL, fetchImpl, HEALTH_CHECK_TIMEOUT_MS);
    if (!isObject(parsed)) return false;
    const serie = parsed.serie;
    if (!Array.isArray(serie) || serie.length === 0) return false;
    const row = serie[0];
    return positiveNumber(isObject(row) ? row.valor : null) !== null;
  };
}

/**
 * Supabase: `select symbol from assets limit 1` con la clave de servidor
 * (misma sonda que la auditoría del catálogo). Si el despliegue no usa la
 * base (`AUTH_MODE=mock` + `DATA_MODE=mock`) o no hay credenciales → `skipped`.
 */
export function supabaseProbe(override?: () => Promise<boolean | null>): () => Promise<boolean | null> {
  if (override) return override;
  return async () => {
    if (!supabaseActive()) return null;
    const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
    const client = createSupabaseAdminClient();
    const { error } = await client.from("assets").select("symbol").limit(1).maybeSingle();
    if (error) throw new Error(`supabase ${error.code ?? "error"}`);
    return true;
  };
}

/**
 * RPC de Solana: `getSlot` con la conexión del servidor. Siempre
 * configurado (`SOLANA_RPC_URL` o el cluster público). Con el público un
 * rate-limit puede fallarlo; queda como fallo informativo, no crítico.
 */
export function rpcProbe(override?: () => Promise<boolean | null>): () => Promise<boolean | null> {
  if (override) return override;
  return async () => {
    if (!rpcActive()) return null;
    const { getServerConnection } = await import("@/lib/solana/connection");
    const slot = await getServerConnection().getSlot("confirmed");
    return Number.isFinite(slot) && slot > 0;
  };
}

/**
 * Koywe: sin endpoint de auth conocido aún (el adaptador real llega con
 * M80) queda siempre `skipped`. Los tests pueden inyectar `koyweAuth`.
 */
export function koyweProbe(override?: () => Promise<boolean | null>): () => Promise<boolean | null> {
  if (override) return override;
  return async () => null;
}

/** Los críticos del deep (M62): Supabase y Jupiter. */
export const CRITICAL_CHECK_NAMES = ["supabase", "jupiter"] as const;
export type CriticalCheckName = (typeof CRITICAL_CHECK_NAMES)[number];

export function deepOk(checks: DeepHealthChecks): boolean {
  return checks.supabase.ok && checks.jupiter.ok;
}

/** Memoria del proceso, redondeada a MB. */
export function memoryUsageMb(): { usedMb: number; totalMb: number } {
  const usage = process.memoryUsage();
  return {
    usedMb: Math.round(usage.heapUsed / 1_048_576),
    totalMb: Math.round(usage.heapTotal / 1_048_576),
  };
}

/**
 * Corre los seis chequeos en paralelo, cada uno con su timeout de 3 s, y
 * arma el reporte completo (env, modo de datos, uptime y memoria).
 */
export async function runDeepHealth(probes: HealthProbes = {}): Promise<DeepHealthReport> {
  const fetchImpl = probes.fetchImpl ?? fetch;
  const [supabase, jupiter, xstocks, fx, rpc, koywe] = await Promise.all([
    runCheck(supabaseProbe(probes.supabaseSelect)),
    runCheck(jupiterProbe(fetchImpl)),
    runCheck(xstocksProbe(fetchImpl)),
    runCheck(fxProbe(fetchImpl)),
    runCheck(rpcProbe(probes.rpcGetSlot)),
    runCheck(koyweProbe(probes.koyweAuth)),
  ]);
  const checks: DeepHealthChecks = { supabase, jupiter, xstocks, fx, rpc, koywe };
  return {
    ok: deepOk(checks),
    env: resolveAppEnv(process.env),
    dataMode: serverEnv.DATA_MODE,
    uptimeSeconds: Math.round(process.uptime()),
    memory: memoryUsageMb(),
    checks,
  };
}
