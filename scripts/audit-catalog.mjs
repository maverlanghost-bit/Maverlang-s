/**
 * Auditoría de seguridad del catálogo xStocks (M52).
 * No cambia la base ni la interfaz. No firma ni envía transacciones.
 *
 * - Pagina la API oficial de xStocks (única fuente de mints).
 * - Trae tokens de Jupiter en lotes de 100 y precios en lotes de 50.
 * - Cotiza sólo los que pasan los filtros estáticos.
 * - Reintenta ante 429/5xx con espera exponencial; timeout de 20 s.
 * - Guarda cada respuesta en data/audit-cache/<fecha>.jsonl y la reutiliza.
 *
 * Uso:
 *   node scripts/audit-catalog.mjs [--limit N] [--symbols AAPLx,NVDAx] [--no-quotes] [--out <ruta>]
 *   npm run audit:catalog -- --symbols AAPLx,NVDAx,AEHRx,TSLLx
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  classifyProduct,
  effectiveMultiplier,
  evaluateAsset,
  quoteCostBps,
  staticChecks,
} from "../lib/catalog/safety-core.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CURATED_PATH = path.join(ROOT, "data", "curated-symbols.json");
const GENERATED_PATH = path.join(ROOT, "config", "tickers.generated.ts");
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
  const out = { limit: null, symbols: null, noQuotes: false, out: null };
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
    }
  }
  return out;
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
function readSnapshotMints() {
  const map = new Map();
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
 * @param {unknown} body cuerpo del order de Jupiter
 */
export function buildRouteLabel(body) {
  if (typeof body !== "object" || body === null) return "";
  const root = /** @type {Record<string, unknown>} */ (body);
  const swapType = typeof root.swapType === "string" ? root.swapType : "";
  const plan = Array.isArray(root.routePlan) ? root.routePlan : [];
  const labels = [];
  for (const step of plan) {
    const label = step?.swapInfo?.label;
    if (typeof label === "string" && label.length > 0) labels.push(label);
  }
  if (swapType && labels.length > 0) return `${swapType}/${labels.join("+")}`;
  if (typeof root.router === "string" && root.router.length > 0) {
    return swapType ? `${swapType}/${root.router}` : root.router;
  }
  return swapType;
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
  const mints = assets.map((a) => a.mint).filter(Boolean);

  // 2. Tokens Jupiter en lotes de 100.
  /** @type {Map<string, unknown>} */
  const tokensByMint = new Map();
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
      if (id) tokensByMint.set(id, token);
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
    const mult = effectiveMultiplier(info?.scaled ?? null, nowIso);
    multiplierByMint.set(asset.mint, mult);
    asset.refPrice = info && Number.isFinite(info.refPrice) ? info.refPrice : NaN;
  }

  async function fetchQuote(inputMint, outputMint, amount) {
    const key = `quote:${inputMint}:${outputMint}:${amount}`;
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
  let staticPass = 0;
  let quoted = 0;
  const reasonCounts = new Map();
  const periodCounts = new Map();
  const checkedAt = new Date().toISOString();

  for (const asset of assets) {
    const token = asset.mint ? (tokensByMint.get(asset.mint) ?? null) : null;
    const staticReasons = staticChecks({
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
    if (staticReasons.length === 0 && !args.noQuotes && asset.mint && Number.isFinite(refPrice)) {
      quoted += 1;
      const buyAmount = 100 * 1e6;
      try {
        const res = await fetchQuote(USDC_MINT, asset.mint, buyAmount);
        if (res.status === 200 && res.body?.outAmount) {
          const route = buildRouteLabel(res.body);
          const cost = quoteCostBps({
            side: "buy",
            inAmount: res.body.inAmount ?? buyAmount,
            outAmount: res.body.outAmount,
            multiplier: mult,
            refPrice,
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
          if (res.status === 200 && res.body?.outAmount) {
            buy1000 = {
              ok: true,
              costBps: quoteCostBps({
                side: "buy",
                inAmount: res.body.inAmount ?? 1000 * 1e6,
                outAmount: res.body.outAmount,
                multiplier: mult,
                refPrice,
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
        const crude = Math.round((100 / (refPrice * mult)) * 1e8);
        const res = await fetchQuote(asset.mint, USDC_MINT, crude);
        if (res.status === 200 && res.body?.outAmount) {
          sell100 = {
            ok: true,
            costBps: quoteCostBps({
              side: "sell",
              inAmount: res.body.inAmount ?? crude,
              outAmount: res.body.outAmount,
              multiplier: mult,
              refPrice,
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
    });
    for (const reason of verdict.reasons) {
      reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
    }
    if (asset.currentPeriod) {
      periodCounts.set(asset.currentPeriod, (periodCounts.get(asset.currentPeriod) ?? 0) + 1);
    }

    const product = classifyProduct(asset.name, asset.exchangeMic);
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
}

const isMain =
  typeof process.argv[1] === "string" &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  await main();
}
