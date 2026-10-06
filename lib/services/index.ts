import "server-only";

import { serverEnv } from "@/lib/env";
import { anchorSeriesToSpot } from "@/lib/market/series";
import { mockAuth } from "@/lib/services/auth.mock";
import { privyAuth } from "@/lib/services/auth.privy";
import { koyweOnramp } from "@/lib/services/onramp.koywe";
import { mockOnramp } from "@/lib/services/onramp.mock";
import { onramperOnramp } from "@/lib/services/onramp.onramper";
import { mockPortfolio } from "@/lib/services/portfolio.mock";
import { livePortfolio } from "@/lib/services/portfolio.live";
import { livePrices } from "@/lib/services/prices.live";
import { mockPrices } from "@/lib/services/prices.mock";
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
    activity(address: string): Promise<Activity[]>;
    sendBuild(request: SendBuildRequest): Promise<TradeBuildResponse>;
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
  };
  auth: {
    getSession(req: Request): Promise<{ userId: string; walletAddress: string | null } | null>;
  };
}

function liveOnramp(): Services["onramp"] {
  return serverEnv.ONRAMP_PROVIDER === "onramper" ? onramperOnramp : koyweOnramp;
}

/**
 * `PRICES_MODE=mock` (default) no consulta Jupiter, el RPC ni el dólar.
 * Con `live`, el precio actual sale de Jupiter y el dólar de mindicador.
 * El historial sigue siendo la serie de referencia, reescalada para terminar en ese spot.
 * Si Jupiter no trae un ticker, la ancla queda en toda la ficha (`reference`).
 * `DATA_MODE` sigue eligiendo trade, cartera on-chain y auth.
 */
async function anchoredHistory(symbol: string, range: Range): Promise<PricePoint[]> {
  const [series, quotes] = await Promise.all([mockPrices.history(symbol, range), livePrices.list([symbol])]);
  const quote = quotes[0];
  if (!quote || quote.reference || !(quote.priceUsd > 0)) return series;
  return anchorSeriesToSpot(series, quote.priceUsd);
}

function priceServices(): Services["prices"] {
  const dataLive = serverEnv.DATA_MODE === "live";
  const pricesLive = serverEnv.PRICES_MODE === "live";
  if (!pricesLive && !dataLive) return mockPrices;
  if (!pricesLive) {
    return {
      list: (symbols) => mockPrices.list(symbols),
      history: (symbol, range) => mockPrices.history(symbol, range),
      fx: () => mockPrices.fx(),
      market: () => livePrices.market(),
    };
  }
  return {
    list: (symbols) => livePrices.list(symbols),
    history: (symbol, range) => anchoredHistory(symbol, range),
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
