import "server-only";

import { ONDO_MINTS } from "@/config/ondo.generated";
import { USDC_MINT } from "@/config/tickers";
import { isListedCrossing, notifyOps } from "@/lib/alerts";
import {
  SAFETY_THRESHOLDS,
  effectiveMultiplier,
  evaluateAsset,
  nextSafetyState,
  normalizeSafetySession,
  parseOrderQuote,
  quoteCostBps,
  staticChecks,
} from "@/lib/catalog/safety-core.mjs";
import { serverEnv } from "@/lib/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Re-auditoría acotada del catálogo (M55, server-only). La corrida completa
 * vive en `scripts/audit-catalog.mjs --db` (PC del operador); esta versión
 * procesa un lote por llamada para correr en Vercel con presupuesto de 50 s.
 * Reutiliza lo puro de `safety-core.mjs` (sin copiar fórmulas) con el mismo
 * ritmo y backoff que M52: pausa entre llamadas a Jupiter (300 ms con clave,
 * 1500 ms sin ella) y reintentos ante 429/5xx con espera exponencial.
 * El volumen nunca excluye (sólo informa el tier).
 */

export interface SafetyBatchArgs {
  offset?: number;
  limit?: number;
}

export interface SafetyMonitorDeps {
  fetchImpl?: typeof fetch;
  admin?: ReturnType<typeof createSupabaseAdminClient>;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** Presupuesto de tiempo por lote. Default 50 s. */
  timeBudgetMs?: number;
  /** Pausa entre llamadas a Jupiter. Default 300 ms con clave, 1500 ms sin ella. */
  paceMs?: number;
  /** Sesión forzada (tests). Default: período mayoritario del lote. */
  session?: string;
}

export interface SafetyBatchSummary {
  checked: number;
  changed: number;
  remaining: number;
}

export const SAFETY_BATCH_DEFAULT_LIMIT = 25;
export const SAFETY_BATCH_TIME_BUDGET_MS = 50_000;

const XSTOCKS_ASSET_BASE = "https://api.xstocks.fi/api/v2/public/assets";
const JUP_TOKENS_BASE = "https://lite-api.jup.ag/tokens/v2/search";
const JUP_PRICE_BASE = "https://lite-api.jup.ag/price/v3";
const JUP_ORDER_BASE = "https://api.jup.ag/swap/v2/order";

const FETCH_TRIES = 7;
const FETCH_TIMEOUT_MS = 20_000;
const FETCH_BASE_WAIT_MS = 2000;
const FETCH_MAX_WAIT_MS = 60_000;

const SAFETY_SELECT = [
  "symbol",
  "mint_solana",
  "issuer",
  "company_ticker",
  "category",
  "enabled",
  "is_trading_halted",
  "current_period",
  "safety_status",
  "consecutive_passes",
  "consecutive_fails",
  "manual_override",
  "safety_session",
  "listed_at",
  "hidden_at",
].join(",");

interface SafetyRow {
  symbol: unknown;
  mint_solana: unknown;
  issuer: unknown;
  company_ticker: unknown;
  category: unknown;
  enabled: unknown;
  is_trading_halted: unknown;
  current_period: unknown;
  safety_status: unknown;
  consecutive_passes: unknown;
  consecutive_fails: unknown;
  manual_override: unknown;
  safety_session: unknown;
  listed_at: unknown;
  hidden_at: unknown;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** GET con reintentos ante 429/5xx o fallos de red (mismo backoff que M52). */
async function fetchJsonWithRetry(
  url: string,
  options: { fetchImpl: typeof fetch; sleep: (ms: number) => Promise<void>; headers?: Record<string, string> },
): Promise<{ status: number; json: unknown }> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= FETCH_TRIES; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await options.fetchImpl(url, {
        method: "GET",
        headers: { accept: "application/json", ...(options.headers ?? {}) },
        signal: controller.signal,
        cache: "no-store",
      });
      clearTimeout(timer);
      if (response.status === 429 || (response.status >= 500 && response.status <= 599)) {
        lastError = new Error(`http ${response.status}`);
        if (attempt < FETCH_TRIES) {
          await options.sleep(Math.min(FETCH_BASE_WAIT_MS * 2 ** (attempt - 1), FETCH_MAX_WAIT_MS));
          continue;
        }
        throw lastError;
      }
      let json: unknown = null;
      try {
        json = await response.json();
      } catch {
        json = null;
      }
      return { status: response.status, json };
    } catch (error) {
      clearTimeout(timer);
      lastError = error;
      if (attempt < FETCH_TRIES) {
        await options.sleep(Math.min(FETCH_BASE_WAIT_MS * 2 ** (attempt - 1), FETCH_MAX_WAIT_MS));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("sin respuesta");
}

/** Nodo xStocks por símbolo. 400/404 = ya no está (null, se evalúa con la fila). */
async function fetchXstocksNode(
  symbol: string,
  options: { fetchImpl: typeof fetch; sleep: (ms: number) => Promise<void> },
): Promise<unknown> {
  const { status, json } = await fetchJsonWithRetry(
    `${XSTOCKS_ASSET_BASE}/${encodeURIComponent(symbol)}`,
    options,
  );
  if (status === 400 || status === 404 || json === null || typeof json !== "object") return null;
  const root = json as Record<string, unknown>;
  const nested = root.node ?? root.asset ?? root.data;
  return nested !== null && typeof nested === "object" ? nested : root;
}

function tokenIdOf(token: unknown): string | null {
  if (token === null || typeof token !== "object") return null;
  const entry = token as Record<string, unknown>;
  for (const key of ["id", "mint", "address"]) {
    if (typeof entry[key] === "string" && (entry[key] as string).trim() !== "") {
      return (entry[key] as string).trim();
    }
  }
  return null;
}

function tokenLiquidityOf(token: unknown): number | null {
  if (token === null || typeof token !== "object") return null;
  const value = Number((token as Record<string, unknown>).liquidity ?? (token as Record<string, unknown>).liquidityUsd);
  return Number.isFinite(value) ? value : null;
}

function priceEntryOf(body: unknown, mint: string): Record<string, unknown> | null {
  if (body === null || typeof body !== "object") return null;
  const root = body as Record<string, unknown>;
  const scoped =
    root.data !== null && typeof root.data === "object" ? (root.data as Record<string, unknown>) : root;
  const entry = scoped[mint];
  return entry !== null && typeof entry === "object" ? (entry as Record<string, unknown>) : null;
}

/** Sesión del lote: período mayoritario de las filas (`unknown` si no hay dato). */
function deriveSession(rows: SafetyRow[]): string {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const session = normalizeSafetySession(typeof row.current_period === "string" ? row.current_period : null);
    if (session === "unknown") continue;
    counts.set(session, (counts.get(session) ?? 0) + 1);
  }
  let top = "unknown";
  let topCount = 0;
  for (const [session, count] of counts) {
    if (count > topCount) {
      top = session;
      topCount = count;
    }
  }
  return top;
}

/**
 * Un lote de la vigilancia del catálogo: activos `listed`/`watch` ordenados
 * por `safety_checked_at` (nulos primero). Evalúa cada uno con xStocks +
 * precio v3 + 3 cotizaciones, aplica `nextSafetyState`, actualiza la fila e
 * inserta evento (y avisa) cuando el cambio cruza `listed`. Corta limpio al
 * agotar el presupuesto y deja el resto para la próxima corrida.
 */
export async function runSafetyBatch(
  args: SafetyBatchArgs = {},
  deps: SafetyMonitorDeps = {},
): Promise<SafetyBatchSummary> {
  const offset = Number.isInteger(args.offset) && (args.offset ?? 0) >= 0 ? (args.offset as number) : 0;
  const limit =
    Number.isInteger(args.limit) && (args.limit ?? 0) > 0
      ? Math.min(args.limit as number, 100)
      : SAFETY_BATCH_DEFAULT_LIMIT;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? defaultSleep;
  const budgetMs = deps.timeBudgetMs ?? SAFETY_BATCH_TIME_BUDGET_MS;
  const apiKey = (serverEnv.JUPITER_API_KEY ?? "").trim();
  const paceMs = deps.paceMs ?? (apiKey ? 300 : 1500);
  const jupHeaders: Record<string, string> = apiKey ? { "x-api-key": apiKey } : {};
  const startMs = now();
  const overBudget = (): boolean => now() - startMs >= budgetMs;

  const admin = deps.admin ?? createSupabaseAdminClient();
  const listed = await admin
    .from("assets")
    .select(SAFETY_SELECT, { count: "exact" })
    .in("safety_status", ["listed", "watch"])
    .order("safety_checked_at", { ascending: true, nullsFirst: true })
    .range(offset, offset + limit - 1);
  if (listed.error) {
    throw new Error(`No se pudo leer el catálogo: ${listed.error.message ?? "db"}`);
  }
  const rows = (
    Array.isArray(listed.data) ? (listed.data as unknown as SafetyRow[]) : []
  );
  const total =
    typeof listed.count === "number" && Number.isFinite(listed.count)
      ? listed.count
      : offset + rows.length;
  if (rows.length === 0) {
    return { checked: 0, changed: 0, remaining: Math.max(0, total - offset) };
  }
  const session = deps.session ?? deriveSession(rows);
  const checkedAt = new Date(startMs).toISOString();

  let lastJupAt = 0;
  async function paceJupiter(): Promise<void> {
    const wait = paceMs - (now() - lastJupAt);
    if (wait > 0) await sleep(wait);
    lastJupAt = now();
  }
  async function jupGet(url: string): Promise<{ status: number; json: unknown }> {
    await paceJupiter();
    const result = await fetchJsonWithRetry(url, { fetchImpl, sleep, headers: jupHeaders });
    lastJupAt = now();
    return result;
  }

  const mints = [...new Set(rows.map((row) => text(row.mint_solana)).filter((mint): mint is string => mint !== null))];

  const tokensByMint = new Map<string, unknown>();
  const decimalsByMint = new Map<string, number>();
  if (mints.length > 0 && !overBudget()) {
    const { json } = await jupGet(`${JUP_TOKENS_BASE}?query=${encodeURIComponent(mints.join(","))}`);
    const list = Array.isArray(json) ? json : Array.isArray((json as Record<string, unknown>)?.tokens)
      ? ((json as Record<string, unknown>).tokens as unknown[])
      : [];
    for (const token of list) {
      const id = tokenIdOf(token);
      if (!id) continue;
      tokensByMint.set(id, token);
      const decimals =
        token !== null && typeof token === "object"
          ? Number((token as Record<string, unknown>).decimals)
          : NaN;
      if (Number.isInteger(decimals) && decimals >= 0 && decimals <= 18) decimalsByMint.set(id, decimals);
    }
  }

  const pricesByMint = new Map<string, { usdPrice: number; refPrice: number; scaled: unknown }>();
  if (mints.length > 0 && !overBudget()) {
    const { json } = await jupGet(`${JUP_PRICE_BASE}?ids=${encodeURIComponent(mints.join(","))}`);
    for (const mint of mints) {
      const entry = priceEntryOf(json, mint);
      if (!entry) continue;
      const usd = Number(entry.usdPrice);
      const stockData =
        entry.stockData !== null && typeof entry.stockData === "object"
          ? (entry.stockData as Record<string, unknown>)
          : null;
      const ref = Number(stockData?.price);
      pricesByMint.set(mint, {
        usdPrice: Number.isFinite(usd) && usd > 0 ? usd : NaN,
        refPrice: Number.isFinite(ref) && ref > 0 ? ref : NaN,
        scaled: entry.scaledUiConfig ?? null,
      });
    }
  }

  // Referencia Ondo: precio del hermano xStocks de la misma empresa.
  const siblingRefByCompany = new Map<string, number>();
  for (const row of rows) {
    if (text(row.issuer) === "ondo") continue;
    const mint = text(row.mint_solana);
    const company = text(row.company_ticker);
    const ref = mint ? pricesByMint.get(mint)?.refPrice : undefined;
    if (company && Number.isFinite(ref) && !siblingRefByCompany.has(company)) {
      siblingRefByCompany.set(company, ref as number);
    }
  }

  async function fetchQuote(inputMint: string, outputMint: string, amount: number | string): Promise<{ status: number; body: unknown }> {
    const url = `${JUP_ORDER_BASE}?inputMint=${encodeURIComponent(inputMint)}&outputMint=${encodeURIComponent(outputMint)}&amount=${encodeURIComponent(String(amount))}`;
    await paceJupiter();
    try {
      const result = await fetchJsonWithRetry(url, { fetchImpl, sleep, headers: jupHeaders });
      lastJupAt = now();
      return { status: result.status, body: result.json };
    } catch {
      lastJupAt = now();
      return { status: -1, body: null };
    }
  }

  const payloads: Array<Record<string, unknown>> = [];
  const events: Array<Record<string, unknown>> = [];
  let checked = 0;
  let changed = 0;

  for (const row of rows) {
    if (overBudget()) break;
    const symbol = text(row.symbol);
    const mint = text(row.mint_solana);
    if (!symbol || !mint) continue;
    const issuer = text(row.issuer) === "ondo" ? "ondo" : "xstocks";
    const isOndo = issuer === "ondo";

    let node: unknown = null;
    if (!isOndo) {
      try {
        node = await fetchXstocksNode(symbol, { fetchImpl, sleep });
      } catch {
        continue;
      }
      if (overBudget()) break;
    }
    if (node === null || typeof node !== "object") {
      // Sin nodo (Ondo o xStocks caído): se evalúa con la fila.
      node = {
        symbol,
        name: symbol,
        mint,
        exchangeMic: null,
        underlyingCurrency: "USD",
        isTradingHalted: row.is_trading_halted === true,
        trading: null,
        refPrice: NaN,
      };
    }

    const token = isOndo ? null : (tokensByMint.get(mint) ?? null);
    const assetDecimals = isOndo ? (decimalsByMint.get(mint) ?? NaN) : 8;
    const staticReasons = isOndo
      ? staticChecks({
          node,
          jupToken: null,
          snapshotMint: null,
          issuer: "ondo",
          ondoMints: [...ONDO_MINTS],
          ondoKind: text(row.category) === "etf" ? "etf" : "stock",
        })
      : staticChecks({ node, jupToken: token, snapshotMint: mint });

    const info = pricesByMint.get(mint);
    const mult = isOndo ? 1 : effectiveMultiplier(info?.scaled ?? null, checkedAt);
    const usdPrice = info && Number.isFinite(info.usdPrice) ? (info.usdPrice as number) : NaN;
    let refPrice = info && Number.isFinite(info.refPrice) ? (info.refPrice as number) : NaN;
    if (isOndo && !Number.isFinite(refPrice)) {
      const sibling = siblingRefByCompany.get(text(row.company_ticker) ?? "");
      refPrice = Number.isFinite(sibling) ? (sibling as number) : usdPrice;
    }
    const liquidity = token ? tokenLiquidityOf(token) : null;

    let buy100: { ok: boolean; costBps: number } | undefined;
    let buy1000: { ok: boolean; costBps: number } | undefined;
    let sell100: { ok: boolean; costBps: number } | undefined;
    const quotable =
      staticReasons.length === 0 && Number.isFinite(refPrice) && (!isOndo || Number.isInteger(assetDecimals));
    if (!quotable && isOndo && staticReasons.length === 0) {
      // Ondo sin referencia ni decimales: sin ruta hasta tener datos reales.
      buy100 = { ok: false, costBps: NaN };
    }
    if (quotable) {
      if (overBudget()) break;
      try {
        const res = await fetchQuote(USDC_MINT, mint, 100 * 1e6);
        const parsed = res.status === 200 ? parseOrderQuote(res.body) : { ok: false as const };
        buy100 = parsed.ok
          ? {
              ok: true,
              costBps: quoteCostBps({
                side: "buy",
                inAmount: parsed.inAmount,
                outAmount: parsed.outAmount,
                multiplier: mult,
                refPrice,
                assetDecimals,
              }),
            }
          : { ok: false, costBps: NaN };
      } catch {
        buy100 = { ok: false, costBps: NaN };
      }
      const buyCost = buy100.ok ? Number(buy100.costBps) : NaN;
      if (buy100.ok && Number.isFinite(buyCost) && buyCost <= SAFETY_THRESHOLDS.buy100MaxCostBps) {
        if (overBudget()) break;
        try {
          const res = await fetchQuote(USDC_MINT, mint, 1000 * 1e6);
          const parsed = res.status === 200 ? parseOrderQuote(res.body) : { ok: false as const };
          buy1000 = parsed.ok
            ? {
                ok: true,
                costBps: quoteCostBps({
                  side: "buy",
                  inAmount: parsed.inAmount,
                  outAmount: parsed.outAmount,
                  multiplier: mult,
                  refPrice,
                  assetDecimals,
                }),
              }
            : { ok: false, costBps: NaN };
        } catch {
          buy1000 = { ok: false, costBps: NaN };
        }
      }
      if (overBudget()) break;
      try {
        const crude = Math.round((100 / ((refPrice as number) * mult)) * 10 ** (assetDecimals as number));
        const res = await fetchQuote(mint, USDC_MINT, crude);
        const parsed = res.status === 200 ? parseOrderQuote(res.body) : { ok: false as const };
        sell100 = parsed.ok
          ? {
              ok: true,
              costBps: quoteCostBps({
                side: "sell",
                inAmount: parsed.inAmount,
                outAmount: parsed.outAmount,
                multiplier: mult,
                refPrice,
                assetDecimals,
              }),
            }
          : { ok: false, costBps: NaN };
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
    const next = nextSafetyState(row, { result: verdict.result, reasons: verdict.reasons }, session);
    const before = text(row.safety_status) ?? "unknown";
    const reasons = verdict.reasons.map(String);
    const metrics = {
      usd_price: Number.isFinite(usdPrice) ? usdPrice : null,
      ref_price_usd: Number.isFinite(refPrice) ? refPrice : null,
      buy100_cost_bps: buy100?.ok ? buy100.costBps : null,
      buy1000_cost_bps: buy1000?.ok ? buy1000.costBps : null,
      sell100_cost_bps: sell100?.ok ? sell100.costBps : null,
      liquidity_usd: liquidity,
      tier: verdict.tier,
    };
    const payload: Record<string, unknown> = {
      symbol,
      safety_status: next.status,
      safety_reasons: reasons,
      safety_metrics: metrics,
      safety_tier: verdict.tier,
      safety_checked_at: checkedAt,
      safety_session: session,
      consecutive_passes: next.consecutive_passes,
      consecutive_fails: next.consecutive_fails,
    };
    if (next.status === "listed" && before !== "listed") {
      payload.listed_at = checkedAt;
    } else if (typeof row.listed_at === "string" && row.listed_at.length > 0) {
      payload.listed_at = row.listed_at;
    }
    if (next.status === "hidden" && before !== "hidden") {
      payload.hidden_at = checkedAt;
    } else if (typeof row.hidden_at === "string" && row.hidden_at.length > 0) {
      payload.hidden_at = row.hidden_at;
    }
    payloads.push(payload);
    checked += 1;
    if (before !== next.status) {
      changed += 1;
      if (isListedCrossing(before, next.status)) {
        events.push({
          symbol,
          result: verdict.result === "pass" ? "PASA" : "NO PASA",
          reasons,
          metrics,
          status_before: before,
          status_after: next.status,
        });
        notifyOps({ symbol, before, after: next.status, reasons });
      }
    }
  }

  if (payloads.length > 0) {
    const upserted = await admin.from("assets").upsert(payloads, { onConflict: "symbol" });
    if (upserted.error) {
      throw new Error(`No se pudo guardar el lote: ${upserted.error.message ?? "db"}`);
    }
  }
  if (events.length > 0) {
    const inserted = await admin.from("asset_safety_events").insert(events);
    if (inserted.error) {
      throw new Error(`No se pudieron guardar los eventos: ${inserted.error.message ?? "db"}`);
    }
  }
  return { checked, changed, remaining: Math.max(0, total - offset - checked) };
}
