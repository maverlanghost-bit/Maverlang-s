import "server-only";

import { serverEnv } from "@/lib/env";
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
import { mockUsers } from "@/lib/services/users.mock";
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

export function getServices(): Services {
  if (serverEnv.DATA_MODE === "live") {
    return {
      prices: livePrices,
      trade: liveTrade,
      portfolio: livePortfolio,
      onramp: liveOnramp(),
      users: supabaseUsers,
      auth: privyAuth,
    };
  }
  return {
    prices: mockPrices,
    trade: mockTrade,
    portfolio: mockPortfolio,
    onramp: mockOnramp,
    users: mockUsers,
    auth: mockAuth,
  };
}
