import "server-only";

import { tickerBySymbol } from "@/config/tickers";
import { serverEnv } from "@/lib/env";
import { yahooSymbol } from "@/lib/market/underlying-move";
import { mockAuth } from "@/lib/services/auth.mock";
import { privyAuth } from "@/lib/services/auth.privy";
import { koyweOnramp } from "@/lib/services/onramp.koywe";
import { mockOnramp } from "@/lib/services/onramp.mock";
import { onramperOnramp } from "@/lib/services/onramp.onramper";
import { mockPortfolio } from "@/lib/services/portfolio.mock";
import { livePortfolio } from "@/lib/services/portfolio.live";
import { livePrices } from "@/lib/services/prices.live";
import { mockPrices } from "@/lib/services/prices.mock";
import { historyMemoTtl, scaleCloses, ticksForRange, ticksIfEnough } from "@/lib/services/history-series";
import { readUnderlyingCloses } from "@/lib/services/underlying-prices.supabase";
import { liveTrade } from "@/lib/services/trade.live";
import { mockTrade } from "@/lib/services/trade.mock";
import { isSupabaseAuth } from "@/lib/auth/mode";
import { supabaseSessionAuth } from "@/lib/services/auth.supabase";
import { mockUsers } from "@/lib/services/users.mock";
import { rlsUsers } from "@/lib/services/users.rls";
import { supabaseUsers } from "@/lib/services/users.supabase";
import type {
  Activity,
  Balance,
  Consent,
  FxRate,
  MarketStatus,
  OnrampSession,
  OnrampSessionRequest,
  Order,
  Portfolio,
  Preferences,
  PricePoint,
  Quote,
  Range,
  SendBuildRequest,
  TradeBuildRequest,
  TradeBuildResponse,
  TradeQuote,
  TradeQuoteRequest,
  TradeSubmitRequest,
  TradeSubmitResponse,
  UserProfile,
} from "@/lib/types";

/**
 * `sendBuild` no está en el bloque de §5, pero sí el endpoint
 * POST /api/wallet/send/build (§2.4). Vive en portfolio para que T07 lo encuentre.
 */
export interface Services {
  prices: {
    list(symbols: string[]): Promise<Quote[]>;
    history(symbol: string, range: Range): Promise<PricePoint[]>;
    fx(): Promise<FxRate>;
    market(): Promise<MarketStatus>;
  };
  trade: {
    quote(request: TradeQuoteRequest): Promise<TradeQuote>;
    build(request: TradeBuildRequest): Promise<TradeBuildResponse>;
    submit(request: TradeSubmitRequest, userId: string): Promise<TradeSubmitResponse>;
    status(id: string): Promise<Order>;
  };
  portfolio: {
    get(address: string): Promise<Portfolio>;
    balances(address: string): Promise<Balance[]>;
    activity(input: { address: string; userId: string }): Promise<Activity[]>;
    sendBuild(request: SendBuildRequest): Promise<TradeBuildResponse>;
    /** Detecta y registra depósitos de cripto on-chain (sólo live). */
    detectDeposits?(input: { address: string; userId: string }): Promise<{ mint: string; amountUi: number; signature: string }[]>;
  };
  onramp: {
    createSession(request: OnrampSessionRequest, userId: string): Promise<OnrampSession>;
    /** El mock devuelve el USDC acreditado. Live verifica la firma y todavía no acredita. */
    handleWebhook(req: Request): Promise<{ estimatedUsdc: number; already: boolean } | void>;
  };
  users: {
    get(id: string): Promise<UserProfile>;
    update(id: string, patch: Partial<UserProfile>): Promise<UserProfile>;
    addConsent(row: Consent): Promise<Consent>;
    listConsents(id: string): Promise<Consent[]>;
    /** La solicitud no borra la cuenta. En mock queda el instante; en live el stub no persiste. */
    deletionStatus(id: string): Promise<{ requestedAt: string | null }>;
    requestDeletion(id: string): Promise<{ requestedAt: string }>;
    prefs(id: string): Promise<Preferences>;
    setPrefs(id: string, prefs: Preferences): Promise<Preferences>;
    /** Favoritas de la cuenta. En mock viven en memoria; en live/RLS, en `user_favorites`. */
    listFavorites(id: string): Promise<string[]>;
    saveFavorites(id: string, symbols: string[]): Promise<string[]>;
  };
  auth: {
    getSession(req: Request): Promise<{ userId: string; walletAddress: string | null } | null>;
  };
}

function liveOnramp(): Services["onramp"] {
  // M58: el comercio por API de Koywe (cotización + deal con PAYIN a la cuenta
  // de Maverlang) quedó descartado (M80 usa el widget en modelo directo). El
  // adaptador queda para M75/dev; en producción `lib/env.ts` impide elegirlo
  // (ONRAMP_MODEL=api con NODE_ENV=production hace fallar el arranque).
  if (serverEnv.ONRAMP_MODEL === "api") return koyweOnramp;
  return serverEnv.ONRAMP_PROVIDER === "onramper" ? onramperOnramp : koyweOnramp;
}

/**
 * `PRICES_MODE=mock` (default) no consulta Jupiter, el RPC ni el dólar.
 * Con `live`, el precio actual sale de Jupiter y el dólar de mindicador.
 * El historial en live (y con `DATA_MODE=live`) usa `price_ticks` en 1D/1W/1M
 * si hay al menos `MIN_TICKS` puntos. 1D sale de esos ticks y se recorta a
 * las últimas `DIAS` jornadas. Si no alcanzan, los cierres de
 * `underlying_prices` por el multiplicador, con el precio guardado tal cual.
 * Con menos de dos puntos reales la serie queda vacía (`source: "mock"`,
 * `real: false` en la ruta): no se rellena con `mockPrices.history`.
 * En mock (dev, CI, e2e) la serie de referencia no cambia.
 * `DATA_MODE` sigue eligiendo trade, cartera y auth.
 */
const INTRADAY: ReadonlySet<Range> = new Set(["1D", "1W", "1M"]);
const DIAS = 2;
const MIN_TICKS = 2;
/**
 * Tope de la respuesta HTTP. Los ticks y los cierres cortan antes;
 * esto cubre un cuelgue que el abort de la base no alcanzó a cortar.
 * La ficha pide tres series a la vez: ninguna puede quedarse abierta.
 */
const HISTORY_BUDGET_MS = 6_000;

export type HistorySource = "ticks" | "closes" | "mock";

type HistoryResult = { points: PricePoint[]; source: HistorySource };

const historyMemo = new Map<string, { at: number; value: HistoryResult }>();
const historyInflight = new Map<string, Promise<HistoryResult>>();

const HISTORY_EMPTY: HistoryResult = { points: [], source: "mock" };

function historyKey(symbol: string, range: Range): string {
  return `${symbol.trim()}:${range}`;
}

async function realHistory(
  symbol: string,
  range: Range,
): Promise<{ points: PricePoint[]; source: "ticks" | "closes" }> {
  const pricesLive = serverEnv.PRICES_MODE === "live";
  const intraday = INTRADAY.has(range);
  // 1D no depende de la ventana de `price_ticks`: se pide una semana y se corta a DIAS.
  // No se pide el spot: el gráfico no reescala, y Jupiter queda sólo en /api/prices.
  const tickRange: Range = range === "1D" ? "1W" : range;
  if (intraday) {
    const rawTicks = await livePrices.history(symbol, tickRange).catch(() => [] as PricePoint[]);
    const ticks = ticksIfEnough(ticksForRange(range, rawTicks, DIAS, Date.now()), MIN_TICKS);
    if (ticks) return { points: ticks, source: "ticks" };
  }

  const ticker = tickerBySymbol(symbol);
  const underlying = ticker?.underlying ? yahooSymbol(ticker.underlying) : "";
  const [multiplier, closes] = await Promise.all([
    pricesLive ? livePrices.multiplierFor(symbol).catch(() => 1) : Promise.resolve(1),
    underlying ? readUnderlyingCloses(underlying, range).catch(() => [] as PricePoint[]) : Promise.resolve([] as PricePoint[]),
  ]);
  return { points: scaleCloses(closes, multiplier), source: "closes" };
}

async function loadHistory(symbol: string, range: Range): Promise<HistoryResult> {
  const pricesLive = serverEnv.PRICES_MODE === "live";
  const dataLive = serverEnv.DATA_MODE === "live";
  if (!pricesLive && !dataLive) {
    return { points: await mockPrices.history(symbol, range), source: "mock" };
  }
  const real = await realHistory(symbol, range).catch(() => null);
  if (real && real.points.length >= MIN_TICKS) return real;
  // Menos de dos observaciones reales: vacío. La ruta marca real:false.
  return { points: [], source: "mock" };
}

function rememberHistory(key: string, value: HistoryResult): HistoryResult {
  historyMemo.set(key, { at: Date.now(), value });
  return value;
}

/**
 * Espera como máximo `ms`. Si el trabajo sigue, el llamador recibe `fallback`
 * y la promesa original puede llenar la memoria cuando termine.
 */
function within<T>(work: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  // Si el tope gana, un rechazo tardío del trabajo no queda sin manejar.
  void work.catch(() => undefined);
  return Promise.race([work, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

/** Mock intacto si precios y datos están en mock. Si no: ticks → cierres → []. */
export async function historyWithSource(symbol: string, range: Range): Promise<HistoryResult> {
  const key = historyKey(symbol, range);
  const cached = historyMemo.get(key);
  if (cached && Date.now() - cached.at < historyMemoTtl(cached.value)) return cached.value;

  const pending = historyInflight.get(key);
  if (pending) return within(pending, HISTORY_BUDGET_MS, HISTORY_EMPTY).then(releasedHistory);

  let settled = false;
  const slot: { current?: Promise<HistoryResult> } = {};
  const job = loadHistory(symbol, range)
    .then((value) => {
      settled = true;
      return rememberHistory(key, value);
    })
    .finally(() => {
      if (slot.current !== undefined && historyInflight.get(key) === slot.current) historyInflight.delete(key);
    });
  slot.current = job;
  historyInflight.set(key, job);
  const value = await within(job, HISTORY_BUDGET_MS, HISTORY_EMPTY);
  if (!settled && historyInflight.get(key) === job) historyInflight.delete(key);
  return releasedHistory(value);
}

/** El vacío compartido no se devuelve: un llamador podría mutar `points`. */
function releasedHistory(value: HistoryResult): HistoryResult {
  return value === HISTORY_EMPTY ? { points: [], source: "mock" } : value;
}

function priceServices(): Services["prices"] {
  const dataLive = serverEnv.DATA_MODE === "live";
  const pricesLive = serverEnv.PRICES_MODE === "live";
  if (!pricesLive && !dataLive) return mockPrices;
  const history = (symbol: string, range: Range) => historyWithSource(symbol, range).then((row) => row.points);
  if (!pricesLive) {
    return {
      list: (symbols) => mockPrices.list(symbols),
      history,
      fx: () => mockPrices.fx(),
      market: () => livePrices.market(),
    };
  }
  return {
    list: (symbols) => livePrices.list(symbols),
    history,
    fx: () => livePrices.fx(),
    market: () => (dataLive ? livePrices.market() : mockPrices.market()),
  };
}

export function getServices(): Services {
  const dataLive = serverEnv.DATA_MODE === "live";
  const supabaseSession = isSupabaseAuth();
  return {
    prices: priceServices(),
    trade: dataLive ? liveTrade : mockTrade,
    portfolio: dataLive ? livePortfolio : mockPortfolio,
    onramp: dataLive ? liveOnramp() : mockOnramp,
    users: supabaseSession ? rlsUsers : dataLive ? supabaseUsers : mockUsers,
    auth: supabaseSession ? supabaseSessionAuth : dataLive ? privyAuth : mockAuth,
  };
}
