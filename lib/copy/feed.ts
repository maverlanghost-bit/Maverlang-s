import "server-only";

import { unstable_cache } from "next/cache";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

import { FIXTURE_INDEX, FIXTURE_STATUS, getFixtureDetail } from "./fixtures";
import { FeedPayloadError, parseFeedDetail, parseFeedIndex, parseFeedStatus } from "./schema";
import { digestMatches, sha256Hex, verifyFeedIndexSignature } from "./signature";
import { canonicalSlug } from "./slugs";
import { COPY_FEED_TAG, type CopyIndexEntry, type CopyPortfolio, type FeedHealth } from "./types";

/**
 * Lectura del feed privado de Fraccion.si (`index.json` firmado + un detalle por
 * portafolio). Sólo servidor.
 *
 * - Caché de datos de Next con la etiqueta `fraccion-feed` y 1 h de vida
 *   (el ping de `/api/revalidate` puede adelantarla).
 * - Timeout de 3 s y un solo reintento. Nunca se siguen URLs del payload:
 *   todo se resuelve contra el host fijo de `FRACCION_FEED_BASE_URL`.
 * - Última copia buena: memoria del proceso y tabla `copy_feed_snapshots`
 *   (best effort: si la tabla no existe, se sigue sin romper).
 * - Frescura: <36 h normal; 36 h–7 días o pipeline `parcial`, aviso; >7 días o
 *   firma inválida, la información sigue visible pero copiar se apaga.
 * - Fixtures de ejemplo sólo con `NODE_ENV !== "production"` o cuenta demo.
 */

export const FEED_TIMEOUT_MS = 3_000;
export const FEED_INDEX_MAX_BYTES = 2 * 1024 * 1024;
export const FEED_DETAIL_MAX_BYTES = 5 * 1024 * 1024;
export const FEED_STATUS_MAX_BYTES = 256 * 1024;
export const FEED_FRESH_MS = 36 * 60 * 60 * 1000;
export const FEED_EXPIRED_MS = 7 * 24 * 60 * 60 * 1000;
/** Tras un fallo no se reintenta el feed en cada request. */
const RETRY_BACKOFF_MS = 60_000;

const SNAPSHOT_TABLE = "copy_feed_snapshots";
const INDEX_SNAPSHOT_KEY = "index";
const DETAIL_SNAPSHOT_PREFIX = "detail:";
const MEMORY_DETAIL_LIMIT = 40;
const INDEX_CACHE_KEY = ["copy-feed-index-v1"];
const DETAIL_CACHE_KEY = ["copy-feed-detail-v1"];

export type CopyFeedOptions = {
  /** Cuenta demo: permite servir fixtures aunque `NODE_ENV === "production"`. */
  allowFixtures?: boolean;
};

type FeedSource = "remote" | "snapshot" | "fixtures";

type FeedIndexSnapshot = {
  entries: CopyIndexEntry[];
  generatedAt: string;
  status: "ok" | "parcial" | null;
};

type RemoteIndexResult = {
  snapshot: FeedIndexSnapshot;
  raw: unknown;
  sha256: string;
};

type RemoteDetailResult = {
  portfolio: CopyPortfolio;
  raw: unknown;
  sha256: string;
};

type FeedFailure = "invalid" | "unavailable";

type FeedFetchReason = "no_feed" | "bad_url" | "http" | "too_large" | "unavailable";

class FeedFetchError extends Error {
  readonly reason: FeedFetchReason;

  constructor(reason: FeedFetchReason, message: string) {
    super(message);
    this.name = "FeedFetchError";
    this.reason = reason;
  }
}

/** Última copia buena del proceso (el caché de Next no guarda los fallos). */
let memoryIndex: FeedIndexSnapshot | null = null;
const memoryDetails = new Map<string, CopyPortfolio>();
let nextFeedAttemptAt = 0;
let lastFeedFailure: FeedFailure | null = null;

const UTF8 = new TextDecoder("utf-8", { fatal: true });

function readEnv(name: string): string {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
}

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/** Host fijo del feed. En producción sólo https, sin credenciales en la URL. */
function feedBaseUrl(): URL | null {
  const raw = readEnv("FRACCION_FEED_BASE_URL");
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    if (isProduction() && url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    return url;
  } catch {
    return null;
  }
}

/** Resuelve una ruta relativa contra el host del feed (anti-SSRF). */
function resolveFeedUrl(base: URL, relativePath: string): URL {
  const path = relativePath.trim().replace(/^\.\//, "");
  if (!path) throw new FeedFetchError("bad_url", "Ruta del feed vacía");
  if (path.startsWith("/") || path.startsWith("\\")) {
    throw new FeedFetchError("bad_url", "Ruta del feed absoluta");
  }
  if (path.includes("\\") || path.includes("://") || path.split("/").includes("..")) {
    throw new FeedFetchError("bad_url", "Ruta del feed no permitida");
  }
  const baseHref = base.href.endsWith("/") ? base.href : `${base.href}/`;
  const url = new URL(path, baseHref);
  if (url.origin !== base.origin) throw new FeedFetchError("bad_url", "Otro host en la ruta del feed");
  return url;
}

async function fetchFeedBytes(path: string, maxBytes: number, attempts = 2): Promise<Buffer> {
  const base = feedBaseUrl();
  if (!base) throw new FeedFetchError("no_feed", "Falta FRACCION_FEED_BASE_URL");

  const url = resolveFeedUrl(base, path);
  const token = readEnv("FRACCION_FEED_READ_TOKEN");
  const headers: Record<string, string> = {
    accept: "application/json",
    "cache-control": "no-cache",
  };
  if (token) headers.authorization = `Bearer ${token}`;

  let lastError: unknown = null;
  for (let attempt = 0; attempt < Math.max(1, attempts); attempt += 1) {
    try {
      const response = await fetch(url, {
        cache: "no-store",
        redirect: "error",
        headers,
        signal: AbortSignal.timeout(FEED_TIMEOUT_MS),
      });
      if (!response.ok) {
        throw new FeedFetchError("http", `El feed respondió ${response.status}`);
      }
      const declared = Number(response.headers.get("content-length") ?? "");
      if (Number.isFinite(declared) && declared > maxBytes) {
        throw new FeedFetchError("too_large", "El archivo del feed supera el tope");
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length === 0) {
        throw new FeedFetchError("unavailable", "El archivo del feed vino vacío");
      }
      if (bytes.length > maxBytes) {
        throw new FeedFetchError("too_large", "El archivo del feed supera el tope");
      }
      return bytes;
    } catch (error) {
      lastError = error;
      if (
        error instanceof FeedFetchError &&
        (error.reason === "too_large" || error.reason === "bad_url" || error.reason === "no_feed")
      ) {
        break;
      }
    }
  }
  throw lastError instanceof Error ? lastError : new FeedFetchError("unavailable", "No pudimos leer el feed");
}

function parseJsonBytes(bytes: Uint8Array, label: string): unknown {
  try {
    return JSON.parse(UTF8.decode(bytes)) as unknown;
  } catch {
    throw new FeedPayloadError("invalid_payload", `${label} no es JSON UTF-8 válido`);
  }
}

function isSignatureFailure(error: unknown): boolean {
  return error instanceof FeedPayloadError && error.reason === "invalid_signature";
}

type SnapshotRow = { payload?: unknown; generated_at?: string | null };

async function readSnapshot(key: string): Promise<{ payload: unknown } | null> {
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from(SNAPSHOT_TABLE)
      .select("payload")
      .eq("snapshot_key", key)
      .maybeSingle();
    if (error || !data) return null;
    const row = data as SnapshotRow;
    if (row.payload === undefined || row.payload === null) return null;
    return { payload: row.payload };
  } catch {
    return null;
  }
}

async function persistSnapshot(
  key: string,
  payload: unknown,
  generatedAt: string | null,
  sha256: string,
  versionId: string | null = null,
): Promise<void> {
  try {
    const admin = createSupabaseAdminClient();
    const { error } = await admin.from(SNAPSHOT_TABLE).upsert(
      {
        snapshot_key: key,
        payload,
        sha256,
        version_id: versionId,
        generated_at: generatedAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "snapshot_key" },
    );
    if (error) throw error;
  } catch {
    // La tabla puede no existir todavía (0053 pendiente): la copia en memoria alcanza.
  }
}

async function loadRemoteStatus(): Promise<"ok" | "parcial" | null> {
  try {
    // Auxiliar: un solo intento para no sumar 3 s extra al índice.
    const bytes = await fetchFeedBytes("status.json", FEED_STATUS_MAX_BYTES, 1);
    const parsed = parseFeedStatus(parseJsonBytes(bytes, "status.json"));
    return parsed.status;
  } catch {
    return null;
  }
}

async function loadRemoteIndex(): Promise<RemoteIndexResult> {
  const bytes = await fetchFeedBytes("index.json", FEED_INDEX_MAX_BYTES);
  const raw = parseJsonBytes(bytes, "index.json");

  const publicKey = readEnv("FRACCION_FEED_ED25519_PUBLIC_KEY");
  if (publicKey) {
    const check = verifyFeedIndexSignature(
      raw,
      publicKey,
      readEnv("FRACCION_FEED_ED25519_KEY_ID") || null,
    );
    if (!check.ok) {
      throw new FeedPayloadError("invalid_signature", `Firma del feed inválida (${check.reason})`);
    }
  } else if (isProduction()) {
    // Fail closed: sin clave pública no se acepta un índice sin verificar.
    throw new FeedPayloadError("invalid_signature", "Falta FRACCION_FEED_ED25519_PUBLIC_KEY");
  }

  const parsed = parseFeedIndex(raw, { rejectExample: isProduction() });
  const pipelineStatus = await loadRemoteStatus();
  const sha256 = sha256Hex(bytes);
  const snapshot: FeedIndexSnapshot = {
    entries: parsed.entries,
    generatedAt: parsed.generatedAt,
    status: pipelineStatus ?? parsed.status,
  };
  // Sólo corre cuando el caché de Next falla o vence: no es una escritura por request.
  await persistSnapshot(INDEX_SNAPSHOT_KEY, raw, snapshot.generatedAt, sha256);
  return { snapshot, raw, sha256 };
}

async function loadRemoteDetail(entry: CopyIndexEntry): Promise<RemoteDetailResult> {
  const bytes = await fetchFeedBytes(entry.detailPath, FEED_DETAIL_MAX_BYTES);
  if (!digestMatches(bytes, entry.detailSha256)) {
    throw new FeedPayloadError("invalid_payload", "El detalle no coincide con el sha256 del índice");
  }
  const raw = parseJsonBytes(bytes, entry.detailPath);
  const portfolio = parseFeedDetail(raw, entry.slug, { rejectExample: isProduction() });
  if (portfolio.versionId !== entry.versionId) {
    throw new FeedPayloadError("invalid_payload", "El detalle no coincide con el version_id del índice");
  }
  const sha256 = sha256Hex(bytes);
  await persistSnapshot(
    `${DETAIL_SNAPSHOT_PREFIX}${entry.slug}`,
    raw,
    portfolio.generatedAt,
    sha256,
    portfolio.versionId,
  );
  return { portfolio, raw, sha256 };
}

const cachedRemoteIndex = unstable_cache(loadRemoteIndex, INDEX_CACHE_KEY, {
  revalidate: 3600,
  tags: [COPY_FEED_TAG],
});

/**
 * `unstable_cache` lanza si no hay caché incremental de Next (tests, scripts o
 * un contexto sin App Router). En ese caso se lee directo, sin caché.
 */
function isMissingNextCache(error: unknown): boolean {
  return error instanceof Error && error.message.includes("incrementalCache missing");
}

async function readRemoteIndex(): Promise<RemoteIndexResult> {
  try {
    return await cachedRemoteIndex();
  } catch (error) {
    if (isMissingNextCache(error)) return loadRemoteIndex();
    throw error;
  }
}

async function readRemoteDetail(entry: CopyIndexEntry): Promise<RemoteDetailResult> {
  const cached = unstable_cache(
    () => loadRemoteDetail(entry),
    [...DETAIL_CACHE_KEY, entry.slug, entry.detailSha256],
    { revalidate: 3600, tags: [COPY_FEED_TAG] },
  );
  try {
    return await cached();
  } catch (error) {
    if (isMissingNextCache(error)) return loadRemoteDetail(entry);
    throw error;
  }
}

function detailKey(entry: CopyIndexEntry): string {
  return `${entry.slug}:${entry.detailSha256}`;
}

function rememberDetail(entry: CopyIndexEntry, portfolio: CopyPortfolio): void {
  const key = detailKey(entry);
  memoryDetails.delete(key);
  memoryDetails.set(key, portfolio);
  while (memoryDetails.size > MEMORY_DETAIL_LIMIT) {
    const oldest = memoryDetails.keys().next();
    if (oldest.done) break;
    memoryDetails.delete(oldest.value);
  }
}

/**
 * Frescura del feed a partir de su fecha de generación y del estado del
 * pipeline. Exportada para pruebas y para la UI.
 */
export function computeFeedHealth(input: {
  generatedAt: string | null;
  status: "ok" | "parcial" | null;
  source: FeedHealth["source"];
  now?: number;
}): FeedHealth {
  const { generatedAt, status, source } = input;
  const now = input.now ?? Date.now();
  if (!generatedAt) return { state: "none", generatedAt: null, status, source: "none" };

  const timestamp = Date.parse(generatedAt);
  if (!Number.isFinite(timestamp)) return { state: "invalid", generatedAt, status, source };

  const age = now - timestamp;
  if (age > FEED_EXPIRED_MS) return { state: "expired", generatedAt, status, source };
  if (age > FEED_FRESH_MS || status === "parcial") {
    return { state: "stale", generatedAt, status, source };
  }
  return { state: "fresh", generatedAt, status, source };
}

/** `true` cuando la información se puede mirar pero copiar está apagado. */
export function isCopyFrozenByFeed(health: FeedHealth): boolean {
  return health.state === "expired" || health.state === "invalid";
}

function withFailure(
  snapshot: FeedIndexSnapshot,
  source: FeedSource,
  failure: FeedFailure | null,
): { entries: CopyIndexEntry[]; health: FeedHealth } {
  const health = computeFeedHealth({
    generatedAt: snapshot.generatedAt,
    status: snapshot.status,
    source,
  });
  if (failure === "invalid") return { entries: snapshot.entries, health: { ...health, state: "invalid" } };
  return { entries: snapshot.entries, health };
}

function fixturesAllowed(options?: CopyFeedOptions): boolean {
  return !isProduction() || options?.allowFixtures === true;
}

function fixtureResult(): { entries: CopyIndexEntry[]; health: FeedHealth } {
  try {
    const parsed = parseFeedIndex(FIXTURE_INDEX);
    let status: "ok" | "parcial" | null = parsed.status;
    try {
      status = parseFeedStatus(FIXTURE_STATUS).status ?? status;
    } catch {
      // El índice alcanza; el estado del pipeline es un extra.
    }
    return {
      entries: parsed.entries,
      health: {
        // Los fixtures son de ejemplo y no envejecen: la franja de la UI avisa
        // que son datos de ejemplo, no que el feed esté atrasado.
        state: "fresh",
        generatedAt: parsed.generatedAt,
        status: status ?? "ok",
        source: "fixtures",
      },
    };
  } catch {
    return { entries: [], health: { state: "none", generatedAt: null, status: null, source: "none" } };
  }
}

function readSnapshotIndex(): Promise<FeedIndexSnapshot | null> {
  return readSnapshot(INDEX_SNAPSHOT_KEY).then((row) => {
    if (!row) return null;
    try {
      const parsed = parseFeedIndex(row.payload, { rejectExample: isProduction() });
      return { entries: parsed.entries, generatedAt: parsed.generatedAt, status: parsed.status };
    } catch {
      return null;
    }
  });
}

async function readSnapshotDetail(entry: CopyIndexEntry): Promise<CopyPortfolio | null> {
  const row = await readSnapshot(`${DETAIL_SNAPSHOT_PREFIX}${entry.slug}`);
  if (!row) return null;
  try {
    const portfolio = parseFeedDetail(row.payload, entry.slug, { rejectExample: isProduction() });
    return portfolio.versionId === entry.versionId ? portfolio : null;
  } catch {
    return null;
  }
}

function readFixturePortfolio(entry: CopyIndexEntry): CopyPortfolio | null {
  const raw = getFixtureDetail(entry.slug);
  if (raw === null) return null;
  try {
    const portfolio = parseFeedDetail(raw, entry.slug);
    return portfolio.versionId === entry.versionId ? portfolio : null;
  } catch {
    return null;
  }
}

/**
 * Índice del feed con su estado de frescura. Nunca lanza: ante un fallo sirve
 * la última copia buena (memoria o snapshot) y, si no hay, «sin feed».
 */
export async function getCopyIndex(
  options: CopyFeedOptions = {},
): Promise<{ entries: CopyIndexEntry[]; health: FeedHealth }> {
  const base = feedBaseUrl();
  let failure: FeedFailure | null = null;

  if (base) {
    const now = Date.now();
    if (lastFeedFailure && now < nextFeedAttemptAt) {
      // Backoff: no se golpea el feed en cada request mientras falla.
      failure = lastFeedFailure;
    } else {
      try {
        const result = await readRemoteIndex();
        memoryIndex = result.snapshot;
        lastFeedFailure = null;
        nextFeedAttemptAt = 0;
        return {
          entries: result.snapshot.entries,
          health: computeFeedHealth({
            generatedAt: result.snapshot.generatedAt,
            status: result.snapshot.status,
            source: "remote",
          }),
        };
      } catch (error) {
        failure = isSignatureFailure(error) ? "invalid" : "unavailable";
        lastFeedFailure = failure;
        nextFeedAttemptAt = Date.now() + RETRY_BACKOFF_MS;
        if (failure === "invalid") {
          // Sin datos del payload: sólo el hecho, para poder alertar.
          console.warn("[copy] firma del feed inválida; se sirve la última copia buena");
        }
      }
    }
  }

  const remembered = memoryIndex;
  if (remembered) return withFailure(remembered, "snapshot", failure);

  const stored = await readSnapshotIndex();
  if (stored) {
    memoryIndex = stored;
    return withFailure(stored, "snapshot", failure);
  }

  if (fixturesAllowed(options)) return fixtureResult();

  return {
    entries: [],
    health: { state: failure === "invalid" ? "invalid" : "none", generatedAt: null, status: null, source: "none" },
  };
}

/**
 * Detalle validado de un portafolio. Acepta alias (se resuelve al canónico) y
 * devuelve `null` si la familia está excluida, el slug no existe o no hay feed.
 */
export async function getCopyPortfolio(
  slug: string,
  options: CopyFeedOptions = {},
): Promise<CopyPortfolio | null> {
  const canonical = canonicalSlug(slug);
  if (!canonical) return null;

  const { entries, health } = await getCopyIndex(options);
  if (health.state === "none") return null;

  const entry = entries.find((item) => item.slug === canonical);
  if (!entry) return null;

  if (health.source === "fixtures") return readFixturePortfolio(entry);

  const key = detailKey(entry);
  const remembered = memoryDetails.get(key);
  if (remembered) return remembered;

  try {
    const result = await readRemoteDetail(entry);
    rememberDetail(entry, result.portfolio);
    return result.portfolio;
  } catch {
    const stored = await readSnapshotDetail(entry);
    if (stored) {
      rememberDetail(entry, stored);
      return stored;
    }
    return null;
  }
}
