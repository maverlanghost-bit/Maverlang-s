import "server-only";

import { tickerBySymbol } from "@/config/tickers";
import { aiMessages } from "@/content/i18n/extra-b";
import { findAssetBySymbol } from "@/lib/catalog/assets";
import { fold } from "@/lib/market/browse";
import { readCompanyForSymbol } from "@/lib/services/company-facts.supabase";
import type { CompanyFactsView } from "@/lib/market/fundamentals";
import type { FxRate, Portfolio, PricePoint, Quote, Range } from "@/lib/types";
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
    /** Dólar observado del servicio de precios. Sin esto, la simulación no inventa pesos. */
    fx?: () => Promise<FxRate>;
  };
  loadPortfolio: (req: Request) => Promise<PortfolioLoad>;
  resolveTicker: (query: string, deps?: ResolveDeps) => Promise<ResolvedTicker | null>;
  searchTickers: (query: string, deps?: ResolveDeps) => Promise<ResolvedTicker[]>;
  /** Fila de `company_facts` (SEC). Por defecto, `readCompanyForSymbol`. */
  companyFacts?: (symbol: string) => Promise<CompanyFactsView | null>;
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
      description:
        "Precio y serie de una acción del catálogo. Puedes explicar qué muestran los datos y qué riesgos hay, sin recomendar comprar ni vender.",
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
      description:
        "Compara hasta 4 acciones del catálogo en el mismo rango. Puedes explicar diferencias, supuestos y riesgos, sin recomendar una opción.",
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
      description:
        "Cartera del usuario con sesión. Puedes describirla y explicar sus datos, sin sugerir ajustes personalizados. Si no hay sesión, no inventes posiciones.",
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
  {
    type: "function",
    function: {
      name: "get_company_facts",
      description:
        "Datos de la empresa según la SEC: sector, bolsa, capitalización, ingresos, utilidad, utilidad por acción, dividendos y últimos informes. Úsala para preguntas sobre los fundamentos o los resultados de una empresa. Si un dato no está, dilo; no lo inventes.",
      parameters: objectParams(
        { ticker: { type: "string", description: "Ticker o nombre del catálogo, como AAPLx o Apple." } },
        ["ticker"],
      ),
    },
  },
  {
    type: "function",
    function: {
      name: "portfolio_today",
      description:
        "Cartera del usuario con sesión: total, efectivo, cada posición con su cambio del día y la concentración (HHI, posiciones efectivas, peso de la mayor y de las tres mayores). Sólo lectura. Si no hay sesión, no inventes posiciones.",
      parameters: objectParams({}, []),
    },
  },
  {
    type: "function",
    function: {
      name: "simulate_buy",
      description:
        "Calcula cuántas unidades compraría un monto al precio actual y cuánto se aportaría en total: aporte inicial más el aporte mensual en pesos convertido con el dólar de hoy por los meses. No proyecta rentabilidad ni recomienda comprar.",
      parameters: objectParams(
        {
          ticker: { type: "string", description: "Ticker o nombre del catálogo, como AAPLx o Apple." },
          amountUsd: {
            type: "number",
            minimum: 1,
            maximum: 1_000_000,
            description: "Aporte inicial en USD, de 1 a 1.000.000.",
          },
          monthlyClp: {
            type: "number",
            minimum: 0,
            maximum: 100_000_000,
            description: "Aporte mensual en pesos, de 0 a 100.000.000.",
          },
          months: {
            type: "integer",
            minimum: 1,
            maximum: 120,
            description: "Meses del aporte mensual, de 1 a 120.",
          },
        },
        ["ticker"],
      ),
    },
  },
  {
    type: "function",
    function: {
      name: "propose_price_alert",
      description:
        "Propone una alerta de precio para que la persona la confirme en la app. No guarda ni escribe nada: sólo muestra la propuesta.",
      parameters: objectParams(
        {
          ticker: { type: "string", description: "Ticker o nombre del catálogo, como AAPLx o Apple." },
          direction: {
            type: "string",
            enum: ["above", "below"],
            description: '"above" si el aviso es cuando el precio supere el umbral; "below" si es cuando baje.',
          },
          thresholdUsd: {
            type: "number",
            minimum: 0.01,
            maximum: 1_000_000,
            description: "Precio objetivo en USD.",
          },
        },
        ["ticker", "direction", "thresholdUsd"],
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

/** Tope de posiciones que viajan en el widget de cartera. La concentración usa todas. */
const MAX_POSITIONS = 30;
/** La fila de la SEC no puede colgar el chat: si tarda, queda "sin dato". */
const COMPANY_FACTS_BUDGET_MS = 4_000;

type OptionalNumber = { ok: true; value: number | null } | { ok: false };

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** Número de un argumento del modelo. Acepta "1200" o "1200,5"; otra cosa, null. */
function finiteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const text = value.trim().replace(",", ".");
    if (!/^-?\d+(?:\.\d+)?$/.test(text)) return null;
    const parsed = Number(text);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** Ausente → `{ ok: true, value: null }`; presente pero fuera de rango → `{ ok: false }`. */
function optionalNumber(value: unknown, min: number, max: number): OptionalNumber {
  if (value === undefined || value === null || value === "") return { ok: true, value: null };
  const number = finiteNumber(value);
  if (number === null || number < min || number > max) return { ok: false };
  return { ok: true, value: number };
}

function optionalInteger(value: unknown, min: number, max: number): OptionalNumber {
  const result = optionalNumber(value, min, max);
  if (!result.ok || result.value === null) return result;
  if (!Number.isInteger(result.value)) return { ok: false };
  return result;
}

function formatNumber(value: number | null, digits = 2): string | null {
  if (value === null || !Number.isFinite(value)) return null;
  return new Intl.NumberFormat("es-CL", { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(
    round(value, digits),
  );
}

function formatUsd(value: number | null): string | null {
  const text = formatNumber(value, 2);
  return text === null ? null : `US$ ${text}`;
}

function formatPercent(ratioValue: number | null, digits = 2): string | null {
  if (ratioValue === null || !Number.isFinite(ratioValue)) return null;
  const text = formatNumber(ratioValue * 100, digits);
  return text === null ? null : `${text} %`;
}

export interface PortfolioConcentration {
  hhi: number | null;
  effectivePositions: number | null;
  top1Pct: number | null;
  top3Pct: number | null;
}

/**
 * Pesos normalizados 0..1 sobre el valor invertido (sin efectivo):
 * HHI = Σ w², posiciones efectivas = 1 / HHI, top1 y top3 en %.
 * Sin posiciones con valor, todo null (no se inventa un 0).
 */
export function concentrationOf(values: readonly (number | null)[]): PortfolioConcentration {
  const clean = values.filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0,
  );
  const total = clean.reduce((sum, value) => sum + value, 0);
  if (!(total > 0)) return { hhi: null, effectivePositions: null, top1Pct: null, top3Pct: null };
  const weights = clean.map((value) => value / total).sort((a, b) => b - a);
  const hhi = weights.reduce((sum, weight) => sum + weight * weight, 0);
  const top1 = weights[0] ?? 0;
  const top3 = weights.slice(0, 3).reduce((sum, weight) => sum + weight, 0);
  return {
    hhi: round(hhi, 4),
    effectivePositions: hhi > 0 ? round(1 / hhi, 2) : null,
    top1Pct: round(top1 * 100, 2),
    top3Pct: round(top3 * 100, 2),
  };
}

function normalizedWeights(values: readonly (number | null)[]): (number | null)[] {
  const total = values.reduce<number>((sum, value) => {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return sum;
    return sum + value;
  }, 0);
  if (!(total > 0)) return values.map(() => null);
  return values.map((value) => {
    if (value === null || !Number.isFinite(value)) return null;
    return value / total;
  });
}

async function currentPrice(deps: AssistantDeps, ticker: string): Promise<number | null> {
  try {
    const quotes = await deps.prices.list([ticker]);
    const quote = quotes.find((item) => item.symbol.toLowerCase() === ticker.toLowerCase());
    return positive(quote?.priceUsd);
  } catch {
    console.error("ai chat price");
    return null;
  }
}

async function usdClpRate(deps: AssistantDeps): Promise<number | null> {
  const reader = deps.prices.fx;
  if (!reader) return null;
  try {
    const fx = await reader();
    return positive(fx.rate);
  } catch {
    console.error("ai chat fx");
    return null;
  }
}

async function quoteChangePcts(
  deps: AssistantDeps,
  symbols: readonly string[],
): Promise<Map<string, number | null>> {
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const symbol of symbols) {
    const text = symbol.trim();
    const key = text.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(text);
  }
  const changes = new Map<string, number | null>();
  if (unique.length === 0) return changes;
  try {
    const quotes = await deps.prices.list(unique);
    for (const quote of quotes) changes.set(quote.symbol.toLowerCase(), ratio(quote.change24hPct));
  } catch {
    console.error("ai chat quotes");
  }
  return changes;
}

async function readCompanyFacts(deps: AssistantDeps, symbol: string): Promise<CompanyFactsView | null> {
  const reader = deps.companyFacts ?? readCompanyForSymbol;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), COMPANY_FACTS_BUDGET_MS);
  });
  const work = reader(symbol).catch(() => null);
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** Filas de la ficha con nombre y valor ya formateado. Sin cifra, `null`. */
function companyFactRows(view: CompanyFactsView): { label: string; value: string | null }[] {
  const rows: { label: string; value: string | null }[] = [
    { label: "Sector", value: view.sector },
    { label: "Bolsa", value: view.exchange },
    { label: "Capitalización de mercado", value: formatUsd(view.marketCapUsd) },
    { label: "Precio / utilidad (TTM)", value: formatNumber(view.pe) },
    { label: "Dividendo TTM / precio", value: formatPercent(view.dividendYield) },
    { label: "Ingresos (TTM)", value: formatUsd(view.revenueTtm) },
    { label: "Utilidad neta (TTM)", value: formatUsd(view.netIncomeTtm) },
    { label: "Utilidad por acción (TTM)", value: formatUsd(view.epsTtm) },
    { label: "Acciones en circulación", value: formatNumber(view.sharesOutstanding, 0) },
    { label: "Último 10-K", value: view.last10k },
    { label: "Último 10-Q", value: view.last10q },
  ];
  if (view.kind === "fund") {
    rows.push(
      { label: "Patrimonio del fondo", value: formatUsd(view.fundNetAssets) },
      { label: "Informe del fondo", value: view.fundReportDate },
    );
  }
  if (view.kind === "foreign") rows.push({ label: "Moneda del informe", value: view.reportCurrency });
  return rows;
}

async function toolCompanyFacts(args: Record<string, unknown>, deps: AssistantDeps): Promise<ToolResult> {
  const query = textArg(args.ticker ?? args.query ?? args.symbol);
  if (!query) return { content: copy.badRequest, widgets: [], stockRelated: true };
  const asset = await deps.resolveTicker(query);
  if (!asset) return { content: copy.notFound, widgets: [], stockRelated: true };
  const view = await readCompanyFacts(deps, asset.ticker);
  if (!view) {
    return {
      content: `No hay datos de la SEC para ${asset.ticker}. No los inventes: dilo y ofrece lo que sí venga de otras herramientas.`,
      widgets: [],
      stockRelated: true,
    };
  }
  const facts = companyFactRows(view);
  const asOf = view.updatedAt ?? view.last10k ?? view.last10q ?? null;
  const widget: Extract<AiWidget, { type: "company" }> = {
    type: "company",
    ticker: asset.ticker,
    name: view.name ?? asset.name,
    facts,
    source: "SEC EDGAR",
    asOf,
  };
  return {
    content: JSON.stringify({
      ticker: asset.ticker,
      name: widget.name,
      facts,
      source: widget.source,
      sourceUrl: view.sourceUrl,
      asOf,
      updatedAt: view.updatedAt,
      note: "Cifras publicadas ante la SEC. Lo que no está en esta lista no viene de una fuente: no lo completes con estimaciones.",
    }),
    widgets: [widget],
    stockRelated: true,
  };
}

async function toolPortfolioToday(deps: AssistantDeps, req: Request): Promise<ToolResult> {
  const loaded = await deps.loadPortfolio(req);
  if (loaded.kind === "sign-in") return { content: copy.signIn, widgets: [], stockRelated: false };
  if (loaded.kind === "no-wallet") return { content: copy.noWallet, widgets: [], stockRelated: false };
  if (loaded.kind === "unavailable") return { content: copy.unavailable, widgets: [], stockRelated: false };
  if (loaded.kind === "real-empty") {
    const widget: AiWidget = {
      type: "portfolio-today",
      totalUsd: 0,
      cashUsdc: null,
      positions: [],
      hhi: null,
      effectivePositions: null,
      top1Pct: null,
      top3Pct: null,
    };
    return { content: copy.realEmpty, widgets: [widget], stockRelated: true };
  }
  const portfolio = loaded.portfolio;
  const changes = await quoteChangePcts(deps, portfolio.positions.map((position) => position.symbol));
  const values = portfolio.positions.map((position) => money(position.valueUsd));
  const weights = normalizedWeights(values);
  const summary = concentrationOf(values);
  const ordered = portfolio.positions
    .map((position, index) => ({
      position,
      index,
      value: values[index] ?? null,
      weight: weights[index] ?? null,
    }))
    .sort((a, b) => (b.value ?? -1) - (a.value ?? -1) || a.index - b.index)
    .slice(0, MAX_POSITIONS);
  const positions = await Promise.all(
    ordered.map(async (row) => ({
      ticker: row.position.symbol,
      name: await displayName(row.position.symbol),
      valueUsd: row.value,
      weightPct: row.weight === null ? null : round(row.weight * 100, 1),
      changePct: changes.get(row.position.symbol.toLowerCase()) ?? null,
    })),
  );
  const totalUsd = money(portfolio.totalUsd);
  const cashUsdc = money(portfolio.cashUsdc);
  const widget: AiWidget = {
    type: "portfolio-today",
    totalUsd,
    cashUsdc,
    positions,
    hhi: summary.hhi,
    effectivePositions: summary.effectivePositions,
    top1Pct: summary.top1Pct,
    top3Pct: summary.top3Pct,
  };
  return {
    content: JSON.stringify({
      totalUsd,
      cashUsdc,
      positions: positions.map((position) => ({
        ticker: position.ticker,
        name: position.name,
        valueUsd: position.valueUsd,
        weightPct: position.weightPct,
        changePct: position.changePct,
      })),
      concentration: summary,
      basis:
        "Pesos normalizados sobre el valor invertido, sin el efectivo. HHI = suma de los pesos al cuadrado (0 a 1); posiciones efectivas = 1 / HHI.",
      note: "Sólo lectura: no cambia nada de la cartera.",
    }),
    widgets: [widget],
    stockRelated: true,
  };
}

async function toolSimulateBuy(args: Record<string, unknown>, deps: AssistantDeps): Promise<ToolResult> {
  const query = textArg(args.ticker ?? args.query ?? args.symbol);
  if (!query) return { content: copy.badRequest, widgets: [], stockRelated: true };
  const amount = optionalNumber(args.amountUsd, 1, 1_000_000);
  const monthly = optionalNumber(args.monthlyClp, 0, 100_000_000);
  const months = optionalInteger(args.months, 1, 120);
  if (!amount.ok || !monthly.ok || !months.ok) {
    return {
      content:
        "Los montos de simulate_buy son: amountUsd de 1 a 1.000.000, monthlyClp de 0 a 100.000.000 y months de 1 a 120 (entero).",
      widgets: [],
      stockRelated: true,
    };
  }
  if (amount.value === null && (monthly.value === null || monthly.value === 0)) {
    return {
      content: "Falta el monto: indica amountUsd (aporte inicial) o monthlyClp (aporte mensual).",
      widgets: [],
      stockRelated: true,
    };
  }
  const asset = await deps.resolveTicker(query);
  if (!asset) return { content: copy.notFound, widgets: [], stockRelated: true };
  const priceUsd = await currentPrice(deps, asset.ticker);
  const needsFx = monthly.value !== null && monthly.value > 0;
  const usdClp = needsFx ? await usdClpRate(deps) : null;
  const monthlyUsd = monthly.value !== null && usdClp !== null ? round(monthly.value / usdClp, 2) : null;
  const monthlyTotal = monthlyUsd !== null && months.value !== null ? round(monthlyUsd * months.value, 2) : null;
  // Sin dólar no hay total: no se inventa el tipo de cambio ni se deja el aporte mensual fuera.
  let totalUsd: number | null = null;
  if (!needsFx || monthlyTotal !== null) {
    if (amount.value !== null || monthlyTotal !== null) totalUsd = round((amount.value ?? 0) + (monthlyTotal ?? 0), 2);
  }
  const units = amount.value !== null && priceUsd !== null ? round(amount.value / priceUsd, 6) : null;
  const widget: AiWidget = {
    type: "simulation",
    ticker: asset.ticker,
    name: asset.name,
    priceUsd,
    amountUsd: amount.value,
    units,
    monthlyClp: monthly.value,
    usdClp,
    monthlyUsd,
    months: months.value,
    totalUsd,
  };
  return {
    content: JSON.stringify({
      ticker: asset.ticker,
      name: asset.name,
      priceUsd,
      amountUsd: amount.value,
      units,
      monthlyClp: monthly.value,
      usdClp,
      monthlyUsd,
      months: months.value,
      totalUsd,
      note: "Aritmética con el precio actual y el dólar de hoy: no es una proyección de resultados ni una recomendación. Cada aporte mensual compraría unidades al precio de ese mes, que hoy no se conoce.",
    }),
    widgets: [widget],
    stockRelated: true,
  };
}

async function toolPriceAlert(args: Record<string, unknown>, deps: AssistantDeps): Promise<ToolResult> {
  const query = textArg(args.ticker ?? args.query ?? args.symbol);
  if (!query) return { content: copy.badRequest, widgets: [], stockRelated: true };
  let direction: "above" | "below" | null = null;
  if (args.direction === "above") direction = "above";
  else if (args.direction === "below") direction = "below";
  if (!direction) {
    return { content: 'La dirección de propose_price_alert es "above" o "below".', widgets: [], stockRelated: true };
  }
  const threshold = optionalNumber(args.thresholdUsd ?? args.threshold, 0.01, 1_000_000);
  if (!threshold.ok || threshold.value === null) {
    return {
      content: "El umbral de propose_price_alert es un precio en USD entre 0,01 y 1.000.000.",
      widgets: [],
      stockRelated: true,
    };
  }
  const asset = await deps.resolveTicker(query);
  if (!asset) return { content: copy.notFound, widgets: [], stockRelated: true };
  const priceUsd = await currentPrice(deps, asset.ticker);
  const thresholdUsd = round(threshold.value, 2);
  const widget: AiWidget = {
    type: "alert-confirm",
    ticker: asset.ticker,
    name: asset.name,
    direction,
    thresholdUsd,
    priceUsd,
  };
  return {
    content: JSON.stringify({
      ticker: asset.ticker,
      name: asset.name,
      direction,
      thresholdUsd,
      priceUsd,
      note: "Propuesta sin guardar. La alerta se crea sólo si la persona confirma en la app; ninguna herramienta escribe.",
    }),
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
    if (name === "get_company_facts") return await toolCompanyFacts(args, deps);
    if (name === "portfolio_today") return await toolPortfolioToday(deps, req);
    if (name === "simulate_buy") return await toolSimulateBuy(args, deps);
    if (name === "propose_price_alert") return await toolPriceAlert(args, deps);
    return { content: "No conozco esa herramienta.", widgets: [], stockRelated: false };
  } catch {
    const safeName = /^[a-z0-9_-]{1,40}$/i.test(name) ? name : "unknown";
    console.error(`ai chat tool ${safeName}`);
    return { content: copy.unavailable, widgets: [], stockRelated: false };
  }
}
