/**
 * APY de los LST de la sección Ganar (MODO DEMO: saldo ficticio).
 *
 * Fuentes públicas, sin clave y sin headers secretos:
 * - Jito:     `POST https://kobe.mainnet.jito.network/api/v1/stake_pool_stats`.
 *             `apy[].data` es una FRACCIÓN (0.0718 = 7,18 %) y cada punto trae
 *             `date`; se toma el punto más reciente.
 * - Marinade: `GET https://api.marinade.finance/msol/apy/7d`. `value` es una
 *             FRACCIÓN a 7 días (no se mezcla con la serie de 1 año).
 * - Blaze:    `GET https://stake.solblaze.org/api/v1/apy`. `apy` viene en
 *             PORCENTAJE (4.9 = 4,9 %). Se pide con el comodín de tipo de
 *             contenido: con `application/json` el servidor responde 406.
 *
 * Regla: 0, negativo, no numérico, JSON roto o error de red → `null`. Nunca se
 * devuelve 0 como APY válido ni se rellena con un porcentaje fijo.
 * JupSOL, INF y dSOL no tienen fuente oficial sin clave: quedan `null`
 * ("sin dato"). Sin claves ni variables de entorno nuevas.
 *
 * En tests (`NODE_ENV=test`) no se usa la cache en memoria: cada caso debe ver
 * su propio mock de `fetch`. En ejecución normal, cache de 10 min.
 */

/**
 * Origen del dato de APY. `"none"` no es una fuente: significa "sin dato"
 * (LST sin endpoint público sin clave y USDY).
 */
export type LstApySource = "jito" | "marinade7d" | "blaze" | "none";

export interface LstApyResult {
  /** Fracción 0..1 (0.0485 = 4,85 %); `null` si no hay dato válido. */
  apyFraction: number | null;
  /** Porcentaje para la UI (4.85 = 4,85 %); `null` si no hay dato válido. */
  apyPercent: number | null;
  /** Fecha de la medición en ISO 8601; `null` si la fuente no la expone. */
  asOf: string | null;
  source: LstApySource;
}

/** Lectura normalizada de una fuente, antes de asignarle un símbolo. */
export interface LstApyReading {
  apyFraction: number | null;
  apyPercent: number | null;
  asOf: string | null;
}

export const LST_APY_TIMEOUT_MS = 6_000;
/** Tope de cache en memoria: 10 min (el encargo pide ≤ 10 min). */
export const LST_APY_CACHE_MS = 10 * 60 * 1000;

export const JITO_STAKE_POOL_STATS_URL =
  "https://kobe.mainnet.jito.network/api/v1/stake_pool_stats";
export const MARINADE_MSOL_APY_7D_URL = "https://api.marinade.finance/msol/apy/7d";
export const BLAZE_STAKE_APY_URL = "https://stake.solblaze.org/api/v1/apy";

/** Los 6 LST que muestra Ganar, en el orden de la tabla del encargo. */
export const LST_APY_SYMBOLS: ReadonlyArray<{ symbol: string; source: LstApySource }> = [
  { symbol: "JitoSOL", source: "jito" },
  { symbol: "JupSOL", source: "none" },
  { symbol: "mSOL", source: "marinade7d" },
  { symbol: "INF", source: "none" },
  { symbol: "dSOL", source: "none" },
  { symbol: "bSOL", source: "blaze" },
];

function emptyReading(): LstApyReading {
  return { apyFraction: null, apyPercent: null, asOf: null };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/** Número finito y estrictamente positivo; cualquier otra cosa → `null`. */
function positiveNumber(value: unknown): number | null {
  let parsed: number;
  if (typeof value === "number") parsed = value;
  else if (typeof value === "string" && value.trim() !== "") parsed = Number(value);
  else return null;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Fracción → lectura. Un valor ≥ 1 (100 %) no es un APY de LST plausible y se
 * descarta antes que mostrar una cifra absurda.
 */
function fractionReading(value: unknown): LstApyReading {
  const fraction = positiveNumber(value);
  if (fraction === null || fraction >= 1) return emptyReading();
  return {
    // La fracción se conserva tal como la fuente (sólo se limpia el ruido de coma flotante).
    apyFraction: roundTo(fraction, 10),
    apyPercent: roundTo(fraction * 100, 10),
    asOf: null,
  };
}

/** Porcentaje → lectura (Blaze ya viene en porcentaje). */
function percentReading(value: unknown): LstApyReading {
  const percent = positiveNumber(value);
  if (percent === null || percent >= 100) return emptyReading();
  return {
    apyFraction: roundTo(percent / 100, 10),
    apyPercent: roundTo(percent, 10),
    asOf: null,
  };
}

const AS_OF_KEYS = [
  "date",
  "as_of",
  "asOf",
  "updated_at",
  "updatedAt",
  "timestamp",
  "ts",
  "time",
];

/** Fecha ISO 8601 si se puede leer; si no, `null` (nunca se inventa la fecha). */
function isoOrNull(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    // Milisegundos si es grande; segundos si cae en el rango epoch Unix.
    if (value > 1e12) return new Date(value).toISOString();
    if (value > 1e9) return new Date(value * 1000).toISOString();
    return null;
  }
  if (typeof value !== "string" || value.trim() === "") return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function asOfOf(row: Record<string, unknown>): string | null {
  for (const key of AS_OF_KEYS) {
    const iso = isoOrNull(row[key]);
    if (iso) return iso;
  }
  return null;
}

/**
 * Jito Kobe: `{ apy: [{ data, date }, …] }` con `data` en fracción. Se elige el
 * punto con la fecha más reciente; si la fuente no trae fechas, el último
 * punto válido (la serie viene ordenada por BlockTime ascendente).
 */
export function parseJitoApy(body: unknown): LstApyReading {
  const points = asRecord(body)?.apy;
  if (!Array.isArray(points)) return emptyReading();

  let best: { reading: LstApyReading; at: number | null } | null = null;
  for (const point of points) {
    const row = asRecord(point);
    if (!row) continue;
    const reading = fractionReading(row.data);
    if (reading.apyFraction === null) continue;
    const asOf = asOfOf(row);
    const at = asOf === null ? null : Date.parse(asOf);
    const candidate = { reading: { ...reading, asOf }, at };
    if (best === null) {
      best = candidate;
      continue;
    }
    // Una fecha conocida gana a una desconocida; entre fechas, la mayor.
    if (at !== null && (best.at === null || at >= best.at)) best = candidate;
    else if (at === null && best.at === null) best = candidate;
  }
  return best?.reading ?? emptyReading();
}

/** Marinade: `{ value }` en fracción a 7 días. */
export function parseMarinadeApy(body: unknown): LstApyReading {
  const root = Array.isArray(body) ? body[body.length - 1] : body;
  const row = asRecord(root);
  if (!row) return emptyReading();
  const reading = fractionReading(row.value);
  if (reading.apyFraction === null) return emptyReading();
  return { ...reading, asOf: asOfOf(row) };
}

/** BlazeStake: `{ apy }` en porcentaje (4.9 = 4,9 %). */
export function parseBlazeApy(body: unknown): LstApyReading {
  const row = asRecord(body);
  if (!row) return emptyReading();
  const reading = percentReading(row.apy);
  if (reading.apyFraction === null) return emptyReading();
  return { ...reading, asOf: asOfOf(row) };
}

async function getJson(
  url: string,
  init: RequestInit,
  fetchImpl: typeof fetch,
): Promise<unknown | null> {
  try {
    const response = await fetchImpl(url, {
      ...init,
      signal: AbortSignal.timeout(LST_APY_TIMEOUT_MS),
      cache: "no-store",
    });
    if (response.ok === false) return null;
    return (await response.json()) as unknown;
  } catch {
    // Timeout, red caída o JSON roto: la fuente queda "sin dato".
    return null;
  }
}

async function readJito(fetchImpl: typeof fetch): Promise<LstApyReading> {
  const body = await getJson(
    JITO_STAKE_POOL_STATS_URL,
    {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: "{}",
    },
    fetchImpl,
  );
  return body === null ? emptyReading() : parseJitoApy(body);
}

async function readMarinade(fetchImpl: typeof fetch): Promise<LstApyReading> {
  const body = await getJson(
    MARINADE_MSOL_APY_7D_URL,
    { method: "GET", headers: { accept: "application/json" } },
    fetchImpl,
  );
  return body === null ? emptyReading() : parseMarinadeApy(body);
}

async function readBlaze(fetchImpl: typeof fetch): Promise<LstApyReading> {
  const body = await getJson(
    BLAZE_STAKE_APY_URL,
    // Comodín obligatorio: con `application/json` BlazeStake responde 406.
    { method: "GET", headers: { accept: "*/*" } },
    fetchImpl,
  );
  return body === null ? emptyReading() : parseBlazeApy(body);
}

interface SourceReadings {
  jito: LstApyReading;
  marinade7d: LstApyReading;
  blaze: LstApyReading;
}

function readingFor(source: LstApySource, readings: SourceReadings): LstApyReading {
  if (source === "jito") return readings.jito;
  if (source === "marinade7d") return readings.marinade7d;
  if (source === "blaze") return readings.blaze;
  return emptyReading();
}

interface LstApyCache {
  storedAt: number;
  value: Record<string, LstApyResult>;
}

let cache: LstApyCache | null = null;
let inflight: Promise<Record<string, LstApyResult>> | null = null;

/** En tests no se cachea: cada caso debe ver su propio mock. */
function cacheEnabled(): boolean {
  return process.env.NODE_ENV !== "test";
}

/** Sólo para tests: olvida el valor cacheado y el pedido en vuelo. */
export function __resetLstApyCacheForTests(): void {
  cache = null;
  inflight = null;
}

export interface FetchLstApysOptions {
  /** Inyectable en tests; por defecto el `fetch` global. */
  fetchImpl?: typeof fetch;
  now?: () => number;
}

/**
 * APY de los 6 LST, con clave = símbolo. JupSOL/INF/dSOL siempre
 * `null` + `source: "none"`. Un fallo de una fuente no tumba a las demás.
 * Cache en memoria de hasta 10 min; un resultado sin ningún dato no se cachea
 * para poder reintentar en la siguiente visita.
 */
export async function fetchLstApys(
  options: FetchLstApysOptions = {},
): Promise<Record<string, LstApyResult>> {
  const now = options.now?.() ?? Date.now();
  if (cacheEnabled() && cache && now - cache.storedAt < LST_APY_CACHE_MS) return cache.value;
  if (inflight) return inflight;

  const fetchImpl = options.fetchImpl ?? fetch;

  const job = (async (): Promise<Record<string, LstApyResult>> => {
    const startedAt = options.now?.() ?? Date.now();
    const [jito, marinade7d, blaze] = await Promise.all([
      readJito(fetchImpl),
      readMarinade(fetchImpl),
      readBlaze(fetchImpl),
    ]);
    const readings: SourceReadings = { jito, marinade7d, blaze };

    const value: Record<string, LstApyResult> = {};
    for (const entry of LST_APY_SYMBOLS) {
      const reading = readingFor(entry.source, readings);
      value[entry.symbol] = {
        apyFraction: reading.apyFraction,
        apyPercent: reading.apyPercent,
        asOf: reading.asOf,
        source: entry.source,
      };
    }

    const hasData = Object.values(value).some((item) => item.apyFraction !== null);
    if (hasData && cacheEnabled()) cache = { storedAt: startedAt, value };
    return value;
  })().finally(() => {
    inflight = null;
  });

  inflight = job;
  return job;
}
