import "server-only";

import { tickerBySymbol } from "@/config/tickers";
import { serverEnv } from "@/lib/env";
import { anchorSeriesToSpot } from "@/lib/market/series";
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
 * El historial en live (y con `DATA_MODE=live`) usa `price_ticks` si hay
 * al menos 20 puntos en 1W/1M; si no, los cierres de `underlying_prices`
 * por el multiplicador. Sin datos devuelve []. En mock (dev, CI, e2e) la
 * serie de referencia no cambia. `DATA_MODE` sigue eligiendo trade, cartera y auth.
 */
const INTRADAY: ReadonlySet<Range> = new Set(["1W", "1M"]);
const MIN_TICKS = 20;

export type HistorySource = "ticks" | "closes" | "mock";

async function anchoredHistory(
  symbol: string,
  range: Range,
): Promise<{ points: PricePoint[]; source: "ticks" | "closes" }> {
  const pricesLive = serverEnv.PRICES_MODE === "live";
  const intraday = INTRADAY.has(range);
  const [ticks, quotes] = await Promise.all([
    intraday ? livePrices.history(symbol, range).catch(() => [] as PricePoint[]) : Promise.resolve([] as PricePoint[]),
    pricesLive ? livePrices.list([symbol]).catch(() => [] as Quote[]) : Promise.resolve([] as Quote[]),
  ]);
  const quote = quotes[0];
  const spot = quote && !quote.reference && quote.priceUsd > 0 ? quote.priceUsd : null;
  const multiplier = quote && Number.isFinite(quote.multiplier) && quote.multiplier > 0 ? quote.multiplier : 1;

  let points: PricePoint[] = [];
  let source: "ticks" | "closes" = "closes";
  if (intraday && ticks.length >= MIN_TICKS) {
    points = ticks;
    source = "ticks";
  } else {
    const ticker = tickerBySymbol(symbol);
    const underlying = ticker?.underlying ? yahooSymbol(ticker.underlying) : "";
    const closes = underlying ? await readUnderlyingCloses(underlying, range).catch(() => [] as PricePoint[]) : [];
    points = closes
      .map((point) => ({ t: point.t, p: point.p * multiplier }))
      .filter((point) => Number.isFinite(point.t) && Number.isFinite(point.p) && point.p > 0);
  }
  if (spot !== null && points.length > 0) points = anchorSeriesToSpot(points, spot);
  return { points, source };
}

/** Mock intacto si precios y datos están en mock. Si no: ticks → cierres → []. */
export async function historyWithSource(
  symbol: string,
  range: Range,
): Promise<{ points: PricePoint[]; source: HistorySource }> {
  const pricesLive = serverEnv.PRICES_MODE === "live";
  const dataLive = serverEnv.DATA_MODE === "live";
  if (!pricesLive && !dataLive) {
    return { points: await mockPrices.history(symbol, range), source: "mock" };
  }
  const anchored = await anchoredHistory(symbol, range).catch(() => null);
  if (anchored && anchored.points.length >= 2) return anchored;
  // Sin 0032_underlying_prices, sin secretos de Supabase o sin datos aún:
  // vuelve a la serie de referencia (como antes), anclada al spot si existe.
  const series = await mockPrices.history(symbol, range);
  const quote =
    serverEnv.PRICES_MODE === "live" ? (await livePrices.list([symbol]).catch(() => [] as Quote[]))[0] : undefined;
  const spot = quote && !quote.reference && quote.priceUsd > 0 ? quote.priceUsd : null;
  return { points: spot !== null ? anchorSeriesToSpot(series, spot) : series, source: "mock" };
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
