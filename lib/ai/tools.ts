import "server-only";

import { tickerBySymbol } from "@/config/tickers";
import { aiMessages } from "@/content/i18n/extra-b";
import { findAssetBySymbol } from "@/lib/catalog/assets";
import { fold } from "@/lib/market/browse";
import type { Portfolio, PricePoint, Quote, Range } from "@/lib/types";
import type { AiWidget } from "@/lib/ai/types";
import type { XaiTool } from "@/lib/ai/xai";
import type { ResolveDeps, ResolvedTicker } from "@/lib/ai/resolve";
import type { PortfolioLoad } from "@/lib/ai/portfolio";

const copy = aiMessages.esCL;

export const MAX_COMPARE = 4;
export const MAX_POINTS = 64;

const STOCK_RANGES = ["1D", "1W", "1M"] as const;
const COMPARE_RANGES = ["1W", "1M", "1Y"] as const;
type StockRange = (typeof STOCK_RANGES)[number];
type CompareRange = (typeof COMPARE_RANGES)[number];

export interface AssistantDeps {
  prices: {
    list: (symbols: string[]) => Promise<Quote[]>;
    history: (symbol: string, range: Range) => Promise<PricePoint[]>;
  };
  loadPortfolio: (req: Request) => Promise<PortfolioLoad>;
  resolveTicker: (query: string, deps?: ResolveDeps) => Promise<ResolvedTicker | null>;
  searchTickers: (query: string, deps?: ResolveDeps) => Promise<ResolvedTicker[]>;
}

export interface ToolResult {
  content: string;
  widgets: AiWidget[];
  /** La respuesta habla de acciones: el servidor agrega el aviso. */
  stockRelated: boolean;
}

const objectParams = (
  properties: Record<string, unknown>,
  required: string[],
): XaiTool["function"]["parameters"] => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

/** Definiciones OpenAI-compatible. El servidor las ejecuta; el modelo no. */
export const AI_TOOLS: readonly XaiTool[] = [
  {
    type: "function",
    function: {
      name: "search_stock",
      description: "Busca en el catálogo visible por nombre o símbolo. Úsala para pasar de un nombre a un ticker, por ejemplo tesla.",
      parameters: objectParams(
        { text: { type: "string", description: "Nombre o símbolo, como tesla o TSLA." } },
        ["text"],
      ),
    },
  },
  {
    type: "function",
    function: {
      name: "get_stock",
      description: "Precio y serie de una acción del catálogo. No opines si conviene.",
      parameters: objectParams(
        {
          query: { type: "string", description: "Ticker o nombre, como TSLAx o Tesla." },
          range: { type: "string", enum: ["1D", "1W", "1M"], description: "Rango de la serie. Si falta, 1D." },
        },
        ["query"],
      ),
    },
  },
  {
    type: "function",
    function: {
      name: "compare_stocks",
      description: "Compara hasta 4 acciones del catálogo en el mismo rango. Sólo datos.",
      parameters: objectParams(
        {
          tickers: { type: "array", items: { type: "string" }, description: "Nombres o símbolos." },
          range: { type: "string", enum: ["1W", "1M", "1Y"], description: "Si falta, 1M." },
        },
        ["tickers"],
      ),
    },
  },
  {
    type: "function",
    function: {
      name: "get_portfolio",
      description: "Cartera del usuario con sesión. Si no hay sesión, no inventes posiciones.",
      parameters: objectParams({}, []),
    },
  },
  {
    type: "function",
    function: {
      name: "open_buy",
      description: "Arma el enlace a la pantalla de la ficha que ya existe. No ejecuta ninguna orden.",
      parameters: objectParams(
        { query: { type: "string", description: "Ticker o nombre." } },
        ["query"],
      ),
    },
  },
];

function textArg(value: unknown, max = 80): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || text.length > max) return null;
  return text;
}

function parseArgs(raw: string): Record<string, unknown> | null {
  const text = raw.trim();
  if (text.length > 4_000) return null;
  if (!text) return {};
  try {
    const value = JSON.parse(text) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
  } catch {
    return null;
  }
}

function stringList(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const text = textArg(item, 40);
    if (!text) continue;
    const key = fold(text);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= max) break;
  }
  return out;
}

export function cleanPoints(points: readonly { t: number; p: number }[]): { t: number; p: number }[] {
  const clean = points.filter((point) => Number.isFinite(point.t) && Number.isFinite(point.p) && point.p > 0);
  clean.sort((a, b) => a.t - b.t);
  if (clean.length <= MAX_POINTS) return clean;
  const last = clean.length - 1;
  const out: { t: number; p: number }[] = [];
  for (let index = 0; index < MAX_POINTS; index += 1) {
    const at = Math.round((index * last) / (MAX_POINTS - 1));
    const point = clean[at];
    if (!point) continue;
    const prev = out[out.length - 1];
    if (prev && prev.t === point.t) continue;
    out.push({ t: point.t, p: point.p });
  }
  return out;
}

function seriesChange(points: readonly { t: number; p: number }[]): number | null {
  const first = points[0]?.p;
  const last = points[points.length - 1]?.p;
  if (first == null || last == null || first === 0) return null;
  return Math.round(((last - first) / first) * 1e6) / 1e6;
}

function positive(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  return value;
}

function money(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return value;
}

function ratio(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.round(value * 1e6) / 1e6;
}

/** Peso 0–100. El mock guarda un ratio (suma ~1); la cartera live guarda puntos (suma ~100). */
export function toWeightPcts(allocations: readonly number[]): (number | null)[] {
  const finite = allocations.filter((value) => Number.isFinite(value) && value >= 0);
  const sum = finite.reduce((total, value) => total + value, 0);
  const asRatio = sum <= 1.5;
  return allocations.map((value) => {
    if (!Number.isFinite(value) || value < 0) return null;
    const pct = asRatio ? value * 100 : value;
    return Math.round(pct * 10) / 10;
  });
}

/** Enlace a la hoja que ya abre `?operar=comprar`. No envía la orden. */
export function buyHref(ticker: string): string {
  return `/app/accion/${encodeURIComponent(ticker)}?operar=comprar`;
}

async function displayName(symbol: string): Promise<string> {
  try {
    const asset = await findAssetBySymbol(symbol);
    if (asset?.name) return asset.name;
  } catch {
    console.error("ai chat name");
  }
  return tickerBySymbol(symbol)?.name ?? symbol;
}

async function loadSeries(
  deps: AssistantDeps,
  ticker: string,
  range: Range,
): Promise<{ priceUsd: number | null; changePct: number | null; points: { t: number; p: number }[] }> {
  const [quoteResult, historyResult] = await Promise.allSettled([
    deps.prices.list([ticker]),
    deps.prices.history(ticker, range),
  ]);
  const quotes = quoteResult.status === "fulfilled" ? quoteResult.value : [];
  const quote = quotes.find((item) => item.symbol.toLowerCase() === ticker.toLowerCase());
  const raw = historyResult.status === "fulfilled" ? historyResult.value : [];
  const points = cleanPoints(raw);
  const fromSeries = seriesChange(points);
  const priceUsd = positive(quote?.priceUsd) ?? positive(points[points.length - 1]?.p);
  const changePct = range === "1D" ? (ratio(quote?.change24hPct) ?? fromSeries) : fromSeries;
  return { priceUsd, changePct, points };
}

function stockRange(value: unknown): StockRange | null {
  if (value == null || value === "") return "1D";
  if (typeof value === "string" && (STOCK_RANGES as readonly string[]).includes(value)) return value as StockRange;
  return null;
}

function compareRange(value: unknown): CompareRange | null {
  if (value == null || value === "") return "1M";
  if (typeof value === "string" && (COMPARE_RANGES as readonly string[]).includes(value)) return value as CompareRange;
  return null;
}

async function toolSearch(args: Record<string, unknown>, deps: AssistantDeps): Promise<ToolResult> {
  const text = textArg(args.text ?? args.query);
  if (!text) return { content: copy.badRequest, widgets: [], stockRelated: true };
  const matches = await deps.searchTickers(text);
  if (matches.length === 0) return { content: copy.notFound, widgets: [], stockRelated: true };
  return {
    content: JSON.stringify({ matches: matches.map((item) => ({ ticker: item.ticker, name: item.name })) }),
    widgets: [],
    stockRelated: true,
  };
}

async function toolStock(args: Record<string, unknown>, deps: AssistantDeps): Promise<ToolResult> {
  const query = textArg(args.query ?? args.ticker ?? args.name ?? args.symbol);
  const range = stockRange(args.range);
  if (!query) return { content: copy.badRequest, widgets: [], stockRelated: true };
  if (!range) return { content: "El rango de get_stock es 1D, 1W o 1M.", widgets: [], stockRelated: true };
  const asset = await deps.resolveTicker(query);
  if (!asset) return { content: copy.notFound, widgets: [], stockRelated: true };
  const series = await loadSeries(deps, asset.ticker, range);
  if (series.priceUsd == null && series.points.length === 0) {
    return { content: `No pude leer el precio de ${asset.ticker}.`, widgets: [], stockRelated: true };
  }
  const widget: AiWidget = {
    type: "stock",
    ticker: asset.ticker,
    name: asset.name,
    priceUsd: series.priceUsd,
    changePct: series.changePct,
    range,
    points: series.points,
  };
  return {
    content: JSON.stringify({
      ticker: asset.ticker,
      name: asset.name,
      priceUsd: series.priceUsd,
      changePct: series.changePct,
      range,
    }),
    widgets: [widget],
    stockRelated: true,
  };
}

async function toolCompare(args: Record<string, unknown>, deps: AssistantDeps): Promise<ToolResult> {
  const queries = stringList(args.tickers ?? args.queries, MAX_COMPARE);
  const range = compareRange(args.range);
  if (queries.length === 0) return { content: copy.badRequest, widgets: [], stockRelated: true };
  if (!range) return { content: "El rango de compare_stocks es 1W, 1M o 1Y.", widgets: [], stockRelated: true };
  const resolved: ResolvedTicker[] = [];
  const seen = new Set<string>();
  for (const query of queries) {
    const asset = await deps.resolveTicker(query);
    if (!asset) continue;
    const key = asset.ticker.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    resolved.push(asset);
  }
  if (resolved.length < 2) {
    return {
      content: resolved.length === 1 ? `Sólo encontré ${resolved[0]!.ticker}. Falta otra acción para comparar.` : copy.notFound,
      widgets: [],
      stockRelated: true,
    };
  }
  const items: Extract<AiWidget, { type: "compare" }>["items"] = [];
  for (const asset of resolved) {
    const series = await loadSeries(deps, asset.ticker, range);
    items.push({
      ticker: asset.ticker,
      name: asset.name,
      changePct: series.changePct,
      points: series.points,
    });
  }
  const widget: AiWidget = { type: "compare", items, range };
  return {
    content: JSON.stringify({
      range,
      items: items.map((item) => ({ ticker: item.ticker, name: item.name, changePct: item.changePct })),
    }),
    widgets: [widget],
    stockRelated: true,
  };
}

async function portfolioWidget(portfolio: Portfolio): Promise<Extract<AiWidget, { type: "portfolio" }>> {
  const weights = toWeightPcts(portfolio.positions.map((position) => position.allocationPct));
  const positions = await Promise.all(
    portfolio.positions.slice(0, 30).map(async (position, index) => ({
      ticker: position.symbol,
      name: await displayName(position.symbol),
      valueUsd: money(position.valueUsd),
      weightPct: weights[index] ?? null,
    })),
  );
  return {
    type: "portfolio",
    totalUsd: money(portfolio.totalUsd),
    pnlPct: ratio(portfolio.pnlPct),
    positions,
  };
}

async function toolPortfolio(deps: AssistantDeps, req: Request): Promise<ToolResult> {
  const loaded = await deps.loadPortfolio(req);
  if (loaded.kind === "sign-in") return { content: copy.signIn, widgets: [], stockRelated: false };
  if (loaded.kind === "no-wallet") return { content: copy.noWallet, widgets: [], stockRelated: false };
  if (loaded.kind === "unavailable") return { content: copy.unavailable, widgets: [], stockRelated: false };
  if (loaded.kind === "real-empty") {
    const widget: AiWidget = { type: "portfolio", totalUsd: 0, pnlPct: null, positions: [] };
    return { content: copy.realEmpty, widgets: [widget], stockRelated: true };
  }
  const widget = await portfolioWidget(loaded.portfolio);
  return {
    content: JSON.stringify({
      totalUsd: widget.totalUsd,
      pnlPct: widget.pnlPct,
      positions: widget.positions.map((position) => ({
        ticker: position.ticker,
        name: position.name,
        valueUsd: position.valueUsd,
        weightPct: position.weightPct,
      })),
    }),
    widgets: [widget],
    stockRelated: true,
  };
}

async function toolBuy(args: Record<string, unknown>, deps: AssistantDeps): Promise<ToolResult> {
  const query = textArg(args.query ?? args.ticker ?? args.symbol);
  if (!query) return { content: copy.badRequest, widgets: [], stockRelated: true };
  const asset = await deps.resolveTicker(query);
  if (!asset) return { content: copy.notFound, widgets: [], stockRelated: true };
  const href = buyHref(asset.ticker);
  const widget: AiWidget = { type: "buy", ticker: asset.ticker, name: asset.name, href };
  const note = asset.tradable
    ? "Hay un enlace a la ficha. No se ejecutó ninguna orden."
    : "Está en el catálogo y ahora no se puede operar. No se ejecutó ninguna orden.";
  return {
    content: JSON.stringify({ ticker: asset.ticker, name: asset.name, href, note }),
    widgets: [widget],
    stockRelated: true,
  };
}

export async function executeToolCall(
  name: string,
  rawArgs: string,
  req: Request,
  deps: AssistantDeps,
): Promise<ToolResult> {
  const args = parseArgs(rawArgs);
  if (!args) return { content: copy.badRequest, widgets: [], stockRelated: false };
  try {
    if (name === "search_stock") return await toolSearch(args, deps);
    if (name === "get_stock") return await toolStock(args, deps);
    if (name === "compare_stocks") return await toolCompare(args, deps);
    if (name === "get_portfolio") return await toolPortfolio(deps, req);
    if (name === "open_buy") return await toolBuy(args, deps);
    return { content: "No conozco esa herramienta.", widgets: [], stockRelated: false };
  } catch {
    const safeName = /^[a-z0-9_-]{1,40}$/i.test(name) ? name : "unknown";
    console.error(`ai chat tool ${safeName}`);
    return { content: copy.unavailable, widgets: [], stockRelated: false };
  }
}
