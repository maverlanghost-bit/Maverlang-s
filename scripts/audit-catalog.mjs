/**
 * Auditoría de seguridad del catálogo xStocks + Ondo (M52/M52b).
 * No cambia la base ni la interfaz. No firma ni envía transacciones.
 *
 * - Pagina la API oficial de xStocks (única fuente de mints xStocks) y suma
 *   el universo Ondo desde config/ondo.generated.ts (única fuente Ondo).
 * - Trae tokens de Jupiter en lotes de 100 y precios en lotes de 50.
 * - Cotiza sólo los que pasan los filtros estáticos (Ondo: con cotizaciones
 *   reales RFQ/JupiterZ, decimales reales del token y referencia del hermano
 *   xStocks; el volumen 24h nunca excluye).
 * - Reintenta ante 429/5xx con espera exponencial; timeout de 20 s.
 * - Guarda cada respuesta en data/audit-cache/<fecha>.jsonl y la reutiliza
 *   SÓLO dentro de la misma sesión (la clave de cotizaciones incluye la
 *   sesión: la corrida nocturna no ciega la de horario regular).
 *
 * Uso:
 *   node scripts/audit-catalog.mjs [--limit N] [--symbols AAPLx,NVDAx] [--no-quotes] [--out <ruta>]
 *   npm run audit:catalog -- --symbols AAPLx,NVDAx,AEHRx,TSLLx
 *   npm run audit:catalog -- --symbols AAPLx --db [--session market] [--all-events]
 *
 * Con --db además del CSV guarda el resultado en Supabase (M53): abre una fila
 * en asset_safety_runs, calcula nextSafetyState por activo, hace upsert SÓLO de
 * las columnas de seguridad (nunca mint_solana, name ni curated) e inserta un
 * evento por activo cuyo estado cambió (--all-events: uno por activo).
 * Usa la secret key igual que sync-xstocks.mjs (SUPABASE_SECRET_KEY o el nombre
 * viejo SUPABASE_SERVICE_ROLE_KEY, sin imprimir claves). Sin la migración 0010
 * aplicada imprime "aplica 0010" y sale con código 2, sin escribir nada.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

import { ensureProjectConfirmed } from "./project-guard.mjs";

import {
  classifyProduct,
  effectiveMultiplier,
  evaluateAsset,
  nextSafetyState,
  normalizeSafetySession,
  orderRouteLabel,
  parseOrderQuote,
  quoteCostBps,
  staticChecks,
} from "../lib/catalog/safety-core.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CURATED_PATH = path.join(ROOT, "data", "curated-symbols.json");
const GENERATED_PATH = path.join(ROOT, "config", "tickers.generated.ts");
const ONDO_GENERATED_PATH = path.join(ROOT, "config", "ondo.generated.ts");
const BOX_CSV_PATH = path.join(ROOT, "data", "catalogo-ampliado-2026-10-06.csv");
const CACHE_DIR = path.join(ROOT, "data", "audit-cache");

const XSTOCKS_BASE = "https://api.xstocks.fi/api/v2/public/assets";
const JUP_TOKENS_BASE = "https://lite-api.jup.ag/tokens/v2/search";
const JUP_PRICE_BASE = "https://lite-api.jup.ag/price/v3";
const JUP_ORDER_BASE = "https://api.jup.ag/swap/v2/order";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const CSV_COLUMNS = [
  "ticker",
  "underlying",
  "name",
  "mint",
  "type",
  "exchange_mic",
  "trading_hours_mode",
  "current_period",
  "jup_liquidity_usd",
  "holder_count",
  "jup_usd_price",
  "ref_price_usd",
  "price_deviation_bps",
  "buy100_ok",
  "buy100_cost_bps",
  "buy100_route",
  "buy1000_ok",
  "buy1000_cost_bps",
  "sell100_ok",
  "sell100_cost_bps",
  "tier",
  "curated_now",
  "result",
  "reasons",
  "checked_at_utc",
];

const TYPE_LABEL = { stock: "stock", etf: "etf", leveraged: "etp_apalancado" };

function loadLocalEnv() {
  const file = path.join(ROOT, ".env.local");
  if (typeof process.loadEnvFile === "function") {
    try {
      process.loadEnvFile(file);
    } catch {
      // Sin .env.local (ej. CI): se sigue sin clave de Jupiter.
    }
  }
}

export function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function utcDate() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * GET con reintentos ante 429/5xx o fallos de red. 400/404 se devuelven tal cual.
 * @param {string} url
 * @param {{ fetchImpl?: typeof fetch, tries?: number, timeoutMs?: number, baseWaitMs?: number, maxWaitMs?: number, headers?: Record<string, string> }} [options]
 * @returns {Promise<{ status: number, json: unknown }>}
 */
export async function fetchJsonWithRetry(url, options = {}) {
  const {
    fetchImpl = globalThis.fetch,
    tries = 7,
    timeoutMs = 20000,
    baseWaitMs = 2000,
    maxWaitMs = 60000,
    headers = {},
  } = options;
  let lastError = null;
  for (let attempt = 1; attempt <= tries; attempt += 1) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetchImpl(url, { redirect: "follow", signal: controller.signal, headers });
      clearTimeout(id);
      if (res.status === 429 || (res.status >= 500 && res.status <= 599)) {
        lastError = new Error(`http ${res.status}`);
        if (attempt < tries) {
          await sleepMs(Math.min(baseWaitMs * 2 ** (attempt - 1), maxWaitMs));
          continue;
        }
        throw lastError;
      }
      let json = null;
      try {
        json = await res.json();
      } catch {
        json = null;
      }
      return { status: res.status, json };
    } catch (error) {
      clearTimeout(id);
      lastError = error;
      if (attempt < tries) {
        await sleepMs(Math.min(baseWaitMs * 2 ** (attempt - 1), maxWaitMs));
      }
    }
  }
  throw lastError ?? new Error("sin respuesta");
}

/**
 * @param {string[]} argv resto de process.argv
 */
export function parseAuditArgs(argv) {
  const out = { limit: null, symbols: null, noQuotes: false, out: null, db: false, session: null, allEvents: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--no-quotes") {
      out.noQuotes = true;
    } else if (arg === "--limit" && i + 1 < argv.length) {
      out.limit = Number(argv[i + 1]);
      i += 1;
    } else if (arg.startsWith("--limit=")) {
      out.limit = Number(arg.slice("--limit=".length));
    } else if (arg === "--symbols" && i + 1 < argv.length) {
      out.symbols = argv[i + 1]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      i += 1;
    } else if (arg.startsWith("--symbols=")) {
      out.symbols = arg
        .slice("--symbols=".length)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (arg === "--out" && i + 1 < argv.length) {
      out.out = argv[i + 1];
      i += 1;
    } else if (arg.startsWith("--out=")) {
      out.out = arg.slice("--out=".length);
    } else if (arg === "--db") {
      out.db = true;
    } else if (arg === "--all-events") {
      out.allEvents = true;
    } else if (arg === "--session" && i + 1 < argv.length) {
      out.session = argv[i + 1];
      i += 1;
    } else if (arg.startsWith("--session=")) {
      out.session = arg.slice("--session=".length);
    }
  }
  return out;
}

/**
 * Columnas que --db puede escribir en public.assets (más `symbol` como clave
 * del upsert). Nunca mint_solana, name ni curated: el test de la tarea lo
 * comprueba contra esta lista.
 */
export const SAFETY_UPSERT_COLUMNS = Object.freeze([
  "safety_status",
  "safety_reasons",
  "safety_metrics",
  "safety_tier",
  "safety_checked_at",
  "safety_session",
  "consecutive_passes",
  "consecutive_fails",
  "listed_at",
  "hidden_at",
]);

/**
 * Sesión de la corrida: --session manda; si no, el período más común de los
 * auditados (regular → market); si no hay dato, "unknown" (conservador).
 * @param {unknown} flag valor de --session
 * @param {Map<string, number>} periodCounts conteo por currentPeriod
 * @returns {"market" | "extended" | "overnight" | "closed" | "unknown"}
 */
export function resolveAuditSession(flag, periodCounts) {
  const explicit = normalizeSafetySession(flag);
  if (explicit !== "unknown") return explicit;
  let top = null;
  let topCount = 0;
  if (periodCounts instanceof Map) {
    for (const [period, count] of periodCounts) {
      if (typeof count === "number" && count > topCount) {
        top = period;
        topCount = count;
      }
    }
  }
  const mapped = normalizeSafetySession(top);
  return mapped !== "unknown" ? mapped : "unknown";
}

/**
 * Arma el payload del upsert SÓLO con columnas de seguridad. Puro (testeable).
 * listed_at/hidden_at sólo se tocan al entrar a ese estado (o se conserva el
 * previo); nunca se inventan fechas.
 * @param {unknown} prev fila previa de assets
 * @param {{ status: string, consecutive_passes: number, consecutive_fails: number }} next salida de nextSafetyState
 * @param {{ result: string, reasons: string[], tier?: string | null }} evaluation veredicto de esta corrida
 * @param {{ checkedAt?: unknown, session?: unknown, metrics?: Record<string, unknown> }} [meta]
 * @returns {Record<string, unknown>} payload con symbol + columnas de SAFETY_UPSERT_COLUMNS
 */
export function buildSafetyUpsert(prev, next, evaluation, meta = {}) {
  const checkedAt = typeof meta.checkedAt === "string" ? meta.checkedAt : new Date().toISOString();
  const session = typeof meta.session === "string" ? meta.session : "unknown";
  const table = (typeof prev === "object" && prev !== null ? prev : {});
  const before = table.safety_status ?? "unknown";
  const reasons = Array.isArray(evaluation?.reasons) ? evaluation.reasons.map(String) : [];
  const metrics = { ...(meta.metrics ?? {}), tier: evaluation?.tier ?? null };
  const payload = {
    safety_status: next.status,
    safety_reasons: reasons,
    safety_metrics: metrics,
    safety_tier: evaluation?.tier ?? null,
    safety_checked_at: checkedAt,
    safety_session: session,
    consecutive_passes: next.consecutive_passes,
    consecutive_fails: next.consecutive_fails,
  };
  if (next.status === "listed" && before !== "listed") {
    payload.listed_at = checkedAt;
  } else if (typeof table.listed_at === "string" && table.listed_at.length > 0) {
    payload.listed_at = table.listed_at;
  }
  if (next.status === "hidden" && before !== "hidden") {
    payload.hidden_at = checkedAt;
  } else if (typeof table.hidden_at === "string" && table.hidden_at.length > 0) {
    payload.hidden_at = table.hidden_at;
  }
  return payload;
}

function readCuratedSet() {
  try {
    const raw = JSON.parse(readFileSync(CURATED_PATH, "utf8"));
    const list = Array.isArray(raw.symbols) ? raw.symbols : [];
    return new Set(list.map((item) => item?.symbol).filter((s) => typeof s === "string"));
  } catch {
    return new Set();
  }
}

/** Mints del snapshot oficial: generado + CSV del box como respaldo. */
function readSnapshotMints() {  const map = new Map();
  try {
    const source = readFileSync(GENERATED_PATH, "utf8");
    const re = /symbol:\s*"([^"]+)"[\s\S]*?mint:\s*"([^"]+)"/g;
    let match = re.exec(source);
    while (match) {
      map.set(match[1], match[2]);
      match = re.exec(source);
    }
  } catch {
    // Sin generado: sigue con el CSV.
  }
  for (const [symbol, detail] of readBoxDetails()) {
    if (detail.mint && !map.has(symbol)) map.set(symbol, detail.mint);
  }
  return map;
}

/**
 * Universo Ondo desde `config/ondo.generated.ts` (M52b, sin DB).
 * Orden estable por ticker. Cada entrada: { symbol, ticker, name, mint,
 * kind, winner, volumeWinner }.
 */
export function readOndoUniverse() {
  const list = [];
  let source = "";
  try {
    source = readFileSync(ONDO_GENERATED_PATH, "utf8");
  } catch {
    return list;
  }
  const entryRe =
    /\{\s*symbol:\s*"([^"]+)",\s*ticker:\s*"([^"]+)",\s*name:\s*"((?:[^"\\]|\\.)*)",\s*mint:\s*"([^"]+)",\s*kind:\s*"(stock|etf)",\s*winner:\s*"((?:[^"\\]|\\.)*)",\s*volumeWinner:\s*(null|"(?:xstocks|ondo)")\s*\}/g;
  let match = entryRe.exec(source);
  while (match) {
    let name = match[3];
    let winner = match[6];
    try {
      name = JSON.parse(`"${match[3]}"`);
    } catch {
      // Se conserva crudo.
    }
    try {
      winner = JSON.parse(`"${match[6]}"`);
    } catch {
      // Se conserva crudo.
    }
    list.push({
      symbol: match[1],
      ticker: match[2],
      name,
      mint: match[4],
      kind: match[5],
      winner,
      volumeWinner: match[7] === "null" ? null : match[7].slice(1, -1),
    });
    match = entryRe.exec(source);
  }
  return list;
}

/** Detalles por símbolo del CSV del box (respaldo para símbolos delistados). */
function readBoxDetails() {
  const map = new Map();
  try {
    const raw = readFileSync(BOX_CSV_PATH, "utf8");
    const lines = raw.split(/\r?\n/).filter((line) => line.trim().length > 0);
    for (const line of lines.slice(1)) {
      const cols = line.split(",");
      if (cols.length >= 4 && cols[0]) {
        map.set(cols[0], {
          underlying: cols[1] || cols[0].replace(/x$/i, ""),
          name: cols[2] || cols[0],
          mint: cols[3] || null,
          mic: cols[5] || null,
          refPrice: Number(cols[11]),
        });
      }
    }
  } catch {
    // Sin CSV del box: sin respaldo.
  }
  return map;
}

function textOf(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function solanaMintOf(node) {
  const list = node?.deployments;
  if (!Array.isArray(list)) return null;
  for (const item of list) {
    if (typeof item !== "object" || item === null) continue;
    if (item.network !== "Solana") continue;
    const address = textOf(item.address);
    if (address) return address;
  }
  return null;
}

function parseAssetNode(node) {
  const symbol = textOf(node?.symbol);
  if (!symbol) return null;
  const underlyingObj =
    typeof node?.underlying === "object" && node?.underlying !== null ? node.underlying : null;
  const exchange =
    underlyingObj && typeof underlyingObj.exchange === "object" && underlyingObj.exchange !== null
      ? underlyingObj.exchange
      : null;
  const trading = typeof node?.trading === "object" && node?.trading !== null ? node.trading : null;
  const halted =
    (typeof node?.isTradingHalted === "boolean" ? node.isTradingHalted : false) ||
    (trading && typeof trading.isTradingHalted === "boolean" ? trading.isTradingHalted : false);
  const rawName = textOf(node?.name) ?? symbol;
  return {
    symbol,
    name: rawName.replace(/\s+xStocks?$/i, "").trim() || symbol,
    underlying: textOf(node?.underlyingSymbol) ?? textOf(underlyingObj?.symbol) ?? symbol.replace(/x$/i, ""),
    underlyingCurrency: textOf(underlyingObj?.currency) ?? "USD",
    exchangeMic: exchange ? textOf(exchange.mic) : null,
    mint: solanaMintOf(node),
    tradingHoursMode: trading ? textOf(trading.tradingHoursMode) : null,
    currentPeriod: trading ? textOf(trading.currentPeriod) : null,
    isTradingHalted: halted,
    trading,
    refPrice: NaN,
  };
}

function tokenLiquidity(token) {
  const value = Number(token?.liquidity ?? token?.liquidityUsd);
  return Number.isFinite(value) ? value : null;
}

function tokenHolders(token) {
  const value = Number(token?.holderCount ?? token?.holders ?? token?.holder_count);
  return Number.isFinite(value) ? Math.round(value) : null;
}

function priceEntryOf(body, mint) {
  if (typeof body !== "object" || body === null) return null;
  const root = /** @type {Record<string, unknown>} */ (body);
  const scoped = typeof root.data === "object" && root.data !== null ? root.data : root;
  const entry = /** @type {Record<string, unknown>} */ (scoped)[mint];
  return typeof entry === "object" && entry !== null ? entry : null;
}

/**
 * Etiqueta de ruta (M52b: alias de `orderRouteLabel` del core).
 * @param {unknown} body cuerpo del order de Jupiter
 */
export function buildRouteLabel(body) {
  return orderRouteLabel(body);
}

function csvCell(value) {
  const text = value === null || value === undefined ? "" : String(value);
  if (text.includes('"') || text.includes(",") || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function oneDecimal(value) {
  if (!Number.isFinite(value)) return "";
  return String(Math.round(value * 10) / 10);
}

function boolCell(value) {
  if (value === true) return "True";
  if (value === false) return "False";
  return "";
}

async function main() {
  loadLocalEnv();
  const args = parseAuditArgs(process.argv.slice(2));
  const runStartedAt = new Date().toISOString();
  if (args.db) {
    // M46: imprime el proyecto destino (sólo el ref) y, si no es el de
    // desarrollo, exige --confirm-project <ref>. Sin --db no toca la DB.
    ensureProjectConfirmed({
      targetUrl: (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim(),
      script: "audit-catalog",
    });
    const probe = await checkSafetyMigration();
    if (probe === "missing-keys") {
      console.log("falta SUPABASE_SECRET_KEY (o SUPABASE_SERVICE_ROLE_KEY) en .env.local: no se puede escribir en --db.");
      process.exitCode = 1;
      return;
    }
    if (probe === "missing-migration") {
      console.log("aplica 0010: pega supabase/migrations/0010_asset_safety.sql en el SQL Editor y vuelve a correr con --db.");
      process.exitCode = 2;
      return;
    }
    if (probe !== "ok") {
      console.log("no se pudo sondar la migración 0010 (revisa la conexión y vuelve a intentar).");
      process.exitCode = 1;
      return;
    }
  }
  const apiKey = (process.env.JUPITER_API_KEY ?? "").trim();
  const paceMs = apiKey ? 300 : 1500;
  const jupHeaders = apiKey ? { "x-api-key": apiKey } : {};
  const date = utcDate();
  const outPath = args.out ? path.resolve(args.out) : path.join(ROOT, "data", `catalog-audit-${date}.csv`);

  mkdirSync(CACHE_DIR, { recursive: true });
  const cachePath = path.join(CACHE_DIR, `${date}.jsonl`);
  /** @type {Map<string, unknown>} */
  const cache = new Map();
  if (existsSync(cachePath)) {
    for (const line of readFileSync(cachePath, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        if (entry && typeof entry.key === "string") cache.set(entry.key, entry.data);
      } catch {
        // Línea corrupta: se ignora y se vuelve a pedir.
      }
    }
  }
  const cacheGet = (key) => (cache.has(key) ? cache.get(key) : undefined);
  const cacheSet = (key, data) => {
    cache.set(key, data);
    appendFileSync(cachePath, `${JSON.stringify({ key, data })}\n`, "utf8");
  };

  let lastJupAt = 0;
  async function paceJupiter() {
    const wait = paceMs - (Date.now() - lastJupAt);
    if (wait > 0) await sleepMs(wait);
    lastJupAt = Date.now();
  }
  async function jupGet(url) {
    await paceJupiter();
    return fetchJsonWithRetry(url, { timeoutMs: 20000, headers: jupHeaders });
  }

  // 1. xStocks paginado (única fuente de mints).
  const nodes = [];
  let page = 1;
  for (;;) {
    const key = `xstocks:page:${page}`;
    let payload = cacheGet(key);
    if (payload === undefined) {
      const { json } = await fetchJsonWithRetry(`${XSTOCKS_BASE}?network=Solana&page=${page}&pageSize=100`, {
        timeoutMs: 20000,
      });
      const batch = Array.isArray(json?.nodes) ? json.nodes : [];
      payload = { nodes: batch, hasNext: json?.page?.hasNextPage === true };
      cacheSet(key, payload);
    }
    nodes.push(...payload.nodes);
    if (!payload.hasNext) break;
    page += 1;
    await sleepMs(400);
    if (page > 30) break;
  }

  let assets = nodes.map(parseAssetNode).filter(Boolean);
  if (args.symbols) {
    const wanted = new Set(args.symbols);
    assets = assets.filter((a) => wanted.has(a.symbol));
    // Pedidos que ya no están en la API: se auditan contra el snapshot
    // para que el CSV lo diga explícito (NO PASA con motivos).
    const found = new Set(assets.map((a) => a.symbol));
    const box = readBoxDetails();
    for (const symbol of wanted) {
      if (found.has(symbol)) continue;
      const detail = box.get(symbol);
      if (!detail?.mint) {
        console.log(`Aviso: ${symbol} no está en la API de xStocks ni en el snapshot; se omite.`);
        continue;
      }
      console.log(`Aviso: ${symbol} ya no está en la API de xStocks; se audita contra el snapshot.`);
      assets.push({
        symbol,
        name: detail.name,
        underlying: detail.underlying,
        underlyingCurrency: null,
        exchangeMic: detail.mic,
        mint: detail.mint,
        tradingHoursMode: null,
        currentPeriod: null,
        isTradingHalted: false,
        trading: null,
        refPrice: Number.isFinite(detail.refPrice) && detail.refPrice > 0 ? detail.refPrice : NaN,
      });
    }
  }
  if (Number.isFinite(args.limit) && args.limit !== null && args.limit > 0) {
    assets = assets.slice(0, args.limit);
  }

  const curated = readCuratedSet();
  const snapshots = readSnapshotMints();

  // Universo Ondo (M52b): del snapshot generado, sin DB. Con --symbols sólo
  // los pedidos; el resto siempre entra (en watch hasta ganar el listado).
  const ondoUniverse = readOndoUniverse();
  let ondoAssets = ondoUniverse.map((entry) => ({
    symbol: entry.symbol,
    name: entry.name,
    underlying: entry.ticker,
    underlyingCurrency: "USD",
    exchangeMic: null,
    mint: entry.mint,
    tradingHoursMode: null,
    currentPeriod: null,
    isTradingHalted: false,
    trading: null,
    refPrice: NaN,
    issuer: "ondo",
    kind: entry.kind,
    volumeWinner: entry.volumeWinner,
    companyTicker: entry.ticker,
  }));
  if (args.symbols) {
    const wanted = new Set(args.symbols);
    ondoAssets = ondoAssets.filter((a) => wanted.has(a.symbol));
  }
  for (const asset of assets) {
    asset.issuer = "xstocks";
    asset.companyTicker = asset.underlying;
  }
  assets.push(...ondoAssets);
  const ondoMintList = ondoAssets.map((a) => a.mint).filter(Boolean);

  // Sesión temprana (M52b, punto 6): el período mayoritario de xStocks define
  // la sesión ANTES de cotizar; la clave del cache de cotizaciones la incluye
  // para no reutilizar cotizaciones de otra sesión (reintento en horario
  // regular de los xStocks que fallaron de noche).
  const earlyPeriodCounts = new Map();
  for (const asset of assets) {
    if (asset.issuer === "ondo" || !asset.currentPeriod) continue;
    earlyPeriodCounts.set(asset.currentPeriod, (earlyPeriodCounts.get(asset.currentPeriod) ?? 0) + 1);
  }
  const quoteSession = resolveAuditSession(args.session, earlyPeriodCounts);

  const mints = assets.map((a) => a.mint).filter(Boolean);

  // 2. Tokens Jupiter en lotes de 100.
  /** @type {Map<string, unknown>} */
  const tokensByMint = new Map();
  /** Decimales reales por mint (M52b: el costo Ondo usa los del token). */
  const tokenDecimalsByMint = new Map();
  const uniqueMints = [...new Set(mints)];
  for (let i = 0; i < uniqueMints.length; i += 100) {
    const batch = uniqueMints.slice(i, i + 100);
    const key = `jup:tokens:${batch.join(",")}`;
    let list = cacheGet(key);
    if (list === undefined) {
      const { json } = await jupGet(`${JUP_TOKENS_BASE}?query=${encodeURIComponent(batch.join(","))}`);
      list = Array.isArray(json) ? json : Array.isArray(json?.tokens) ? json.tokens : [];
      cacheSet(key, list);
    }
    for (const token of list) {
      const id = textOf(token?.id) ?? textOf(token?.mint) ?? textOf(token?.address);
      if (id) {
        tokensByMint.set(id, token);
        const decimals = Number(token?.decimals);
        if (Number.isInteger(decimals) && decimals >= 0 && decimals <= 18) {
          tokenDecimalsByMint.set(id, decimals);
        }
      }
    }
  }

  // 3. Precios Jupiter en lotes de 50.
  /** @type {Map<string, { usdPrice: number, refPrice: number, scaled: unknown }>} */
  const pricesByMint = new Map();
  const nowIso = new Date().toISOString();
  for (let i = 0; i < uniqueMints.length; i += 50) {
    const batch = uniqueMints.slice(i, i + 50);
    const key = `jup:price:${batch.join(",")}`;
    let body = cacheGet(key);
    if (body === undefined) {
      const result = await jupGet(`${JUP_PRICE_BASE}?ids=${encodeURIComponent(batch.join(","))}`);
      body = result.json;
      cacheSet(key, body);
    }
    for (const mint of batch) {
      const entry = priceEntryOf(body, mint);
      if (!entry) continue;
      const usd = Number(entry.usdPrice);
      const stockData = typeof entry.stockData === "object" && entry.stockData !== null ? entry.stockData : null;
      const ref = Number(stockData?.price);
      pricesByMint.set(mint, {
        usdPrice: Number.isFinite(usd) && usd > 0 ? usd : NaN,
        refPrice: Number.isFinite(ref) && ref > 0 ? ref : NaN,
        scaled: entry.scaledUiConfig ?? null,
      });
    }
  }

  // Multiplicador vigente y precio de referencia por activo.
  /** @type {Map<string, number>} */
  const multiplierByMint = new Map();
  for (const asset of assets) {
    if (!asset.mint) continue;
    const info = pricesByMint.get(asset.mint);
    const mult = asset.issuer === "ondo" ? 1 : effectiveMultiplier(info?.scaled ?? null, nowIso);
    multiplierByMint.set(asset.mint, mult);
    asset.refPrice = info && Number.isFinite(info.refPrice) ? info.refPrice : NaN;
  }
  // Referencia Ondo (M52b): precio del xStocks hermano de la misma empresa;
  // si no hay, el precio de Jupiter price/v3 del propio mint.
  const siblingRefByCompany = new Map();
  for (const asset of assets) {
    if (asset.issuer !== "xstocks" || !asset.companyTicker) continue;
    if (Number.isFinite(asset.refPrice) && !siblingRefByCompany.has(asset.companyTicker)) {
      siblingRefByCompany.set(asset.companyTicker, asset.refPrice);
    }
  }
  for (const asset of assets) {
    if (asset.issuer !== "ondo" || !asset.mint) continue;
    if (!Number.isFinite(asset.refPrice)) {
      const sibling = siblingRefByCompany.get(asset.companyTicker);
      if (Number.isFinite(sibling)) {
        asset.refPrice = sibling;
      } else {
        const info = pricesByMint.get(asset.mint);
        asset.refPrice = info && Number.isFinite(info.usdPrice) ? info.usdPrice : NaN;
      }
    }
  }

  async function fetchQuote(inputMint, outputMint, amount) {
    // La clave incluye la sesión (M52b, punto 6): nunca se reutilizan
    // cotizaciones de otra sesión entre corridas.
    const key = `quote:${quoteSession}:${inputMint}:${outputMint}:${amount}`;
    const cached = cacheGet(key);
    if (cached !== undefined) return cached;
    const url = `${JUP_ORDER_BASE}?inputMint=${encodeURIComponent(inputMint)}&outputMint=${encodeURIComponent(outputMint)}&amount=${encodeURIComponent(String(amount))}`;
    await paceJupiter();
    try {
      const res = await fetchJsonWithRetry(url, { timeoutMs: 20000, headers: jupHeaders });
      const payload = { status: res.status, body: res.json };
      cacheSet(key, payload);
      lastJupAt = Date.now();
      return payload;
    } catch {
      // Sin ruta tras los reintentos: se marca sin ruta y se sigue con el resto.
      lastJupAt = Date.now();
      return { status: -1, body: null };
    }
  }

  // 4. Cotizaciones sólo para los que pasan los filtros estáticos.
  const rows = [];
  const outcomes = [];
  let staticPass = 0;
  let quoted = 0;
  const reasonCounts = new Map();
  const periodCounts = new Map();
  const checkedAt = new Date().toISOString();

  for (const asset of assets) {
    const token = asset.mint ? (tokensByMint.get(asset.mint) ?? null) : null;
    const isOndo = asset.issuer === "ondo";
    // Decimales reales del token (M52b): 8 en xStocks; en Ondo los de Jupiter.
    const assetDecimals = isOndo ? (tokenDecimalsByMint.get(asset.mint) ?? NaN) : 8;
    const staticReasons = isOndo
      ? staticChecks({
          node: {
            symbol: asset.symbol,
            name: asset.name,
            mint: asset.mint,
            exchangeMic: asset.exchangeMic,
            underlyingCurrency: asset.underlyingCurrency,
            isTradingHalted: asset.isTradingHalted,
            trading: asset.trading,
            refPrice: asset.refPrice,
          },
          jupToken: null,
          snapshotMint: null,
          issuer: "ondo",
          ondoMints: ondoMintList,
          ondoKind: asset.kind,
        })
      : staticChecks({
          node: {
            symbol: asset.symbol,
            name: asset.name,
            mint: asset.mint,
            exchangeMic: asset.exchangeMic,
            underlyingCurrency: asset.underlyingCurrency,
            isTradingHalted: asset.isTradingHalted,
            trading: asset.trading,
            refPrice: asset.refPrice,
          },
          jupToken: token,
          snapshotMint: snapshots.get(asset.symbol) ?? null,
        });

    const info = asset.mint ? pricesByMint.get(asset.mint) : undefined;
    const mult = asset.mint ? (multiplierByMint.get(asset.mint) ?? 1) : 1;
    const liquidity = token ? tokenLiquidity(token) : null;
    const holders = token ? tokenHolders(token) : null;
    const usdPrice = info && Number.isFinite(info.usdPrice) ? info.usdPrice : NaN;
    const refPrice = Number.isFinite(asset.refPrice) ? asset.refPrice : NaN;
    const deviation =
      Number.isFinite(usdPrice) && Number.isFinite(refPrice) ? (usdPrice / refPrice - 1) * 10000 : NaN;

    /** @type {{ ok: boolean, costBps: number, route?: string } | undefined} */
    let buy100;
    /** @type {{ ok: boolean, costBps: number } | undefined} */
    let buy1000;
    /** @type {{ ok: boolean, costBps: number } | undefined} */
    let sell100;
    let buy100Route = "";

    if (staticReasons.length === 0) staticPass += 1;
    // Ondo sin referencia ni decimales no se cotiza: queda sin ruta de compra
    // (motivo de cotización, nunca oculta de noche) hasta tener datos reales.
    const quotable =
      staticReasons.length === 0 &&
      !args.noQuotes &&
      asset.mint &&
      Number.isFinite(refPrice) &&
      (!isOndo || Number.isInteger(assetDecimals));
    if (!quotable && isOndo && staticReasons.length === 0 && !args.noQuotes && asset.mint) {
      buy100 = { ok: false, costBps: NaN };
    }
    if (quotable) {
      quoted += 1;
      const buyAmount = 100 * 1e6;
      try {
        const res = await fetchQuote(USDC_MINT, asset.mint, buyAmount);
        const parsed = res.status === 200 ? parseOrderQuote(res.body) : { ok: false };
        if (parsed.ok) {
          const route = parsed.route;
          const cost = quoteCostBps({
            side: "buy",
            inAmount: parsed.inAmount,
            outAmount: parsed.outAmount,
            multiplier: mult,
            refPrice,
            assetDecimals,
          });
          buy100 = { ok: true, costBps: cost, route };
          buy100Route = route;
        } else {
          buy100 = { ok: false, costBps: NaN };
        }
      } catch {
        buy100 = { ok: false, costBps: NaN };
      }
      const buyCost = buy100.ok ? Number(buy100.costBps) : NaN;
      if (buy100.ok && Number.isFinite(buyCost) && buyCost <= 100) {
        try {
          const res = await fetchQuote(USDC_MINT, asset.mint, 1000 * 1e6);
          const parsed = res.status === 200 ? parseOrderQuote(res.body) : { ok: false };
          if (parsed.ok) {
            buy1000 = {
              ok: true,
              costBps: quoteCostBps({
                side: "buy",
                inAmount: parsed.inAmount,
                outAmount: parsed.outAmount,
                multiplier: mult,
                refPrice,
                assetDecimals,
              }),
            };
          } else {
            buy1000 = { ok: false, costBps: NaN };
          }
        } catch {
          buy1000 = { ok: false, costBps: NaN };
        }
      }
      try {
        const crude = Math.round((100 / (refPrice * mult)) * 10 ** assetDecimals);
        const res = await fetchQuote(asset.mint, USDC_MINT, crude);
        const parsed = res.status === 200 ? parseOrderQuote(res.body) : { ok: false };
        if (parsed.ok) {
          sell100 = {
            ok: true,
            costBps: quoteCostBps({
              side: "sell",
              inAmount: parsed.inAmount,
              outAmount: parsed.outAmount,
              multiplier: mult,
              refPrice,
              assetDecimals,
            }),
          };
        } else {
          sell100 = { ok: false, costBps: NaN };
        }
      } catch {
        sell100 = { ok: false, costBps: NaN };
      }
    }

    const verdict = evaluateAsset({
      staticReasons,
      buy100,
      buy1000,
      sell100,
      jupUsdPrice: usdPrice,
      refPrice,
      liquidityUsd: liquidity,
      rfqOnly: isOndo,
    });
    for (const reason of verdict.reasons) {
      reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
    }
    outcomes.push({
      symbol: asset.symbol,
      issuer: asset.issuer,
      companyTicker: asset.companyTicker ?? null,
      verdict,
      usdPrice: Number.isFinite(usdPrice) ? usdPrice : null,
      refPrice: Number.isFinite(refPrice) ? refPrice : null,
      deviationBps: Number.isFinite(deviation) ? Math.round(deviation * 10) / 10 : null,
      liquidityUsd: liquidity,
      holders,
      buy100CostBps: buy100?.ok ? buy100.costBps : null,
      buy100Route,
      buy1000CostBps: buy1000?.ok ? buy1000.costBps : null,
      sell100CostBps: sell100?.ok ? sell100.costBps : null,
      currentPeriod: asset.currentPeriod ?? null,
    });
    if (asset.currentPeriod) {
      periodCounts.set(asset.currentPeriod, (periodCounts.get(asset.currentPeriod) ?? 0) + 1);
    }

    const product = asset.issuer === "ondo" ? asset.kind : classifyProduct(asset.name, asset.exchangeMic);
    rows.push(
      [
        asset.symbol,
        asset.underlying,
        asset.name,
        asset.mint ?? "",
        TYPE_LABEL[product] ?? product,
        asset.exchangeMic ?? "",
        asset.tradingHoursMode ?? "",
        asset.currentPeriod ?? "",
        liquidity === null ? "" : oneDecimal(liquidity),
        holders === null ? "" : String(holders),
        Number.isFinite(usdPrice) ? String(usdPrice) : "",
        Number.isFinite(refPrice) ? String(refPrice) : "",
        oneDecimal(deviation),
        buy100 === undefined ? "" : boolCell(buy100.ok),
        buy100?.ok ? oneDecimal(buy100.costBps) : "",
        buy100Route,
        buy1000 === undefined ? "" : boolCell(buy1000.ok),
        buy1000?.ok ? oneDecimal(buy1000.costBps) : "",
        sell100 === undefined ? "" : boolCell(sell100.ok),
        sell100?.ok ? oneDecimal(sell100.costBps) : "",
        verdict.tier ?? "",
        curated.has(asset.symbol) ? "yes" : "no",
        verdict.result === "pass" ? "PASA" : "NO PASA",
        verdict.reasons.join("|"),
        checkedAt,
      ]
        .map(csvCell)
        .join(","),
    );
  }

  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${CSV_COLUMNS.join(",")}\n${rows.join("\n")}\n`, "utf8");

  const passCount = rows.filter((line) => line.includes(",PASA,")).length;
  const passOutside = rows.filter((line) => line.includes(",no,PASA,")).length;
  const topReasons = [...reasonCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const topPeriod = [...periodCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  console.log(`Activos: ${assets.length}`);
  console.log(`Pasan filtros estáticos: ${staticPass}`);
  console.log(`Cotizados: ${quoted}`);
  console.log(`PASA: ${passCount}`);
  console.log(`PASA fuera de los 50 curados: ${passOutside}`);
  console.log("Motivos más comunes:");
  for (const [reason, count] of topReasons) {
    console.log(`- ${reason}: ${count}`);
  }
  console.log(`Sesión de mercado: ${topPeriod ? `${topPeriod[0]} (${topPeriod[1]})` : "sin datos"}`);
  console.log(`CSV: ${outPath}`);

  if (args.db) {
    const session = resolveAuditSession(args.session, periodCounts);
    await syncSafetyToDb({ outcomes, session, runStartedAt, source: "audit-catalog", allEvents: args.allEvents });
  }
}

/**
 * Cliente admin con la secret key, igual que sync-xstocks.mjs.
 * Nunca imprime claves.
 */
function readSafetyAdmin() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/$/, "");
  const secret = (
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    ""
  ).trim();
  if (!url || !secret) return { error: "missing-keys" };
  const admin = createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return { admin };
}

/**
 * Sonda de sólo lectura: ¿existen las columnas de 0010?
 * @returns {Promise<"ok" | "missing-keys" | "missing-migration" | "probe-error">}
 */
export async function checkSafetyMigration() {
  const { admin, error } = readSafetyAdmin();
  if (error || !admin) return "missing-keys";
  const probe = await admin.from("assets").select("safety_status").limit(1);
  if (!probe.error) return "ok";
  const message = probe.error.message ?? "";
  if (/does not exist|schema cache|could not find|could not identify|column/i.test(message)) {
    return "missing-migration";
  }
  console.error(`DB sonda falló: ${message}`);
  return "probe-error";
}

/**
 * Guarda el resultado de la auditoría en Supabase (M53). Sólo con --db y con
 * 0010 aplicada (main() lo sonda antes). Nunca toca mint_solana, name ni
 * curated: el upsert sólo lleva symbol + SAFETY_UPSERT_COLUMNS.
 */
export async function syncSafetyToDb({ outcomes, session, runStartedAt, source, allEvents }) {
  const { admin } = readSafetyAdmin();
  if (!admin) {
    console.log("falta SUPABASE_SECRET_KEY (o SUPABASE_SERVICE_ROLE_KEY) en .env.local: no se puede escribir en --db.");
    process.exitCode = 1;
    return;
  }
  const checkedAt = new Date().toISOString();
  const list = Array.isArray(outcomes) ? outcomes : [];
  // Filas Ondo (M52b): sin la migración 0022 aplicada no existen las columnas
  // `issuer`/`company_ticker` ni las filas Ondo: van sólo al CSV, con un aviso.
  let writable = list;
  if (list.some((o) => o?.issuer === "ondo")) {
    const probe = await admin.from("assets").select("issuer,company_ticker").limit(1);
    const message = probe.error?.message ?? "";
    if (probe.error && /does not exist|schema cache|could not find|could not identify|column/i.test(message)) {
      const skipped = list.filter((o) => o?.issuer === "ondo").length;
      console.log(
        `0022 sin aplicar: ${skipped} resultados Ondo no se escriben (sólo CSV). Aplica supabase/migrations/0022_ondo_issuer.sql y vuelve a correr con --db.`,
      );
      writable = list.filter((o) => o?.issuer !== "ondo");
    }
  }
  const passed = writable.filter((o) => o?.verdict?.result === "pass").length;

  const runRes = await admin
    .from("asset_safety_runs")
    .insert({
      started_at: runStartedAt,
      session,
      total: writable.length,
      passed,
      source: source ?? "audit-catalog",
      notes: `audit-catalog ${checkedAt}`,
    })
    .select("id")
    .single();
  if (runRes.error || !runRes.data) {
    console.error(`DB run falló: ${runRes.error?.message ?? "sin id"}`);
    process.exitCode = 1;
    return;
  }
  const runId = runRes.data.id;

  const symbols = [...new Set(writable.map((o) => o?.symbol).filter((s) => typeof s === "string"))];
  /** @type {Map<string, Record<string, unknown>>} */
  const prevBySymbol = new Map();
  for (let i = 0; i < symbols.length; i += 200) {
    const batch = symbols.slice(i, i + 200);
    const res = await admin
      .from("assets")
      .select("symbol,safety_status,consecutive_passes,consecutive_fails,manual_override,safety_session,listed_at,hidden_at")
      .in_("symbol", batch);
    if (res.error) {
      console.error(`DB lectura de assets falló: ${res.error.message}`);
      process.exitCode = 1;
      return;
    }
    for (const row of res.data ?? []) prevBySymbol.set(row.symbol, row);
  }

  const payloads = [];
  const events = [];
  let skipped = 0;
  for (const outcome of writable) {
    const prev = prevBySymbol.get(outcome.symbol);
    if (!prev) {
      console.log(`Aviso: ${outcome.symbol} no está en public.assets; se omite en --db.`);
      skipped += 1;
      continue;
    }
    const evaluation = { result: outcome.verdict.result, reasons: outcome.verdict.reasons, tier: outcome.verdict.tier ?? null };
    const next = nextSafetyState(prev, evaluation, session);
    const metrics = {
      usd_price: outcome.usdPrice,
      ref_price_usd: outcome.refPrice,
      deviation_bps: outcome.deviationBps,
      buy100_cost_bps: outcome.buy100CostBps,
      buy100_route: outcome.buy100Route || null,
      buy1000_cost_bps: outcome.buy1000CostBps,
      sell100_cost_bps: outcome.sell100CostBps,
      liquidity_usd: outcome.liquidityUsd,
      holders: outcome.holders,
    };
    const safety = buildSafetyUpsert(prev, next, evaluation, { checkedAt, session, metrics });
    payloads.push({ symbol: outcome.symbol, ...safety });
    const before = typeof prev.safety_status === "string" ? prev.safety_status : "unknown";
    if (allEvents || before !== next.status) {
      events.push({
        run_id: runId,
        symbol: outcome.symbol,
        result: outcome.verdict.result === "pass" ? "PASA" : "NO PASA",
        reasons: evaluation.reasons,
        metrics,
        status_before: before,
        status_after: next.status,
      });
    }
  }

  for (let i = 0; i < payloads.length; i += 200) {
    const batch = payloads.slice(i, i + 200);
    const res = await admin.from("assets").upsert(batch, { onConflict: "symbol" });
    if (res.error) {
      console.error(`DB upsert de seguridad falló: ${res.error.message}`);
      process.exitCode = 1;
      return;
    }
  }
  for (let i = 0; i < events.length; i += 200) {
    const batch = events.slice(i, i + 200);
    const res = await admin.from("asset_safety_events").insert(batch);
    if (res.error) {
      console.error(`DB eventos falló: ${res.error.message}`);
      process.exitCode = 1;
      return;
    }
  }

  const doneRes = await admin
    .from("asset_safety_runs")
    .update({ finished_at: new Date().toISOString(), total: payloads.length + skipped, passed })
    .eq("id", runId);
  if (doneRes.error) {
    console.error(`DB cierre del run falló: ${doneRes.error.message}`);
    process.exitCode = 1;
    return;
  }
  console.log(`DB: run ${runId} sesión ${session}: ${payloads.length} activos, ${passed} PASA, ${events.length} eventos.`);
}

const isMain =
  typeof process.argv[1] === "string" &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  await main();
}
