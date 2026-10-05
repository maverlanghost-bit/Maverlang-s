import type { ZodType } from "zod";

import {
  activityResponseSchema,
  apiResultSchema,
  balancesResponseSchema,
  consentSchema,
  fxRateSchema,
  historyResponseSchema,
  onrampSessionSchema,
  portfolioSchema,
  preferencesSchema,
  quotesResponseSchema,
  tickersResponseSchema,
  tradeBuildResponseSchema,
  tradeQuoteSchema,
  tradeSubmitResponseSchema,
  userProfileSchema,
  type ConsentRequest,
  type ProfileUpdate,
} from "@/lib/api/contracts";
import { httpStatusFor, type ApiErrorCode } from "@/lib/api/result";
import type {
  Activity,
  Balance,
  Consent,
  FxRate,
  OnrampSession,
  OnrampSessionRequest,
  Portfolio,
  Preferences,
  PricePoint,
  Quote,
  Range,
  SendBuildRequest,
  Ticker,
  TradeBuildRequest,
  TradeBuildResponse,
  TradeQuote,
  TradeQuoteRequest,
  TradeSubmitRequest,
  TradeSubmitResponse,
  UserProfile,
} from "@/lib/types";

/** Error de `/api/*` ya desempaquetado. `status` es el HTTP de la respuesta. */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;

  constructor(code: ApiErrorCode, message: string, status = httpStatusFor(code)) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

async function request<T>(path: string, schema: ZodType<T>, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("accept", "application/json");
  if (init?.body != null && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(path, { ...init, headers, credentials: "same-origin" });
  } catch {
    throw new ApiError("UPSTREAM", "No pudimos conectar.");
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError("UPSTREAM", "La respuesta no es JSON.", response.status || 502);
  }

  const parsed = apiResultSchema(schema).safeParse(payload);
  if (!parsed.success || !parsed.data.ok) {
    if (parsed.success && !parsed.data.ok) {
      throw new ApiError(parsed.data.error.code, parsed.data.error.message, response.status);
    }
    throw new ApiError("UPSTREAM", "La respuesta no tiene el formato esperado.", response.status || 502);
  }
  return parsed.data.data;
}

function send<T>(method: "POST" | "PUT" | "PATCH", path: string, schema: ZodType<T>, body: unknown): Promise<T> {
  return request(path, schema, { method, body: JSON.stringify(body), cache: "no-store" });
}

export function getTickers(): Promise<Ticker[]> {
  return request("/api/tickers", tickersResponseSchema, { next: { revalidate: 3600 } });
}

export function getPrices(symbols?: readonly string[]): Promise<Quote[]> {
  const list = (symbols ?? []).map((symbol) => symbol.trim()).filter((symbol) => symbol.length > 0);
  const query = list.length > 0 ? `?symbols=${encodeURIComponent(list.join(","))}` : "";
  return request(`/api/prices${query}`, quotesResponseSchema, { cache: "no-store" });
}

export function getFx(): Promise<FxRate> {
  return request("/api/fx/usdclp", fxRateSchema, { cache: "no-store" });
}

export function getHistory(symbol: string, range: Range = "1M"): Promise<PricePoint[]> {
  const query = new URLSearchParams({ range });
  return request(
    `/api/tickers/${encodeURIComponent(symbol)}/history?${query.toString()}`,
    historyResponseSchema,
    { cache: "no-store" },
  );
}

export function quoteTrade(body: TradeQuoteRequest): Promise<TradeQuote> {
  return send("POST", "/api/trade/quote", tradeQuoteSchema, body);
}

export function buildTrade(body: TradeBuildRequest): Promise<TradeBuildResponse> {
  return send("POST", "/api/trade/build", tradeBuildResponseSchema, body);
}

export function submitTrade(body: TradeSubmitRequest): Promise<TradeSubmitResponse> {
  return send("POST", "/api/trade/submit", tradeSubmitResponseSchema, body);
}

export function getPortfolio(): Promise<Portfolio> {
  return request("/api/portfolio", portfolioSchema, { cache: "no-store" });
}

export function getBalances(): Promise<Balance[]> {
  return request("/api/wallet/balances", balancesResponseSchema, { cache: "no-store" });
}

export function getActivity(): Promise<Activity[]> {
  return request("/api/wallet/activity", activityResponseSchema, { cache: "no-store" });
}

export function buildSend(body: SendBuildRequest): Promise<TradeBuildResponse> {
  return send("POST", "/api/wallet/send/build", tradeBuildResponseSchema, body);
}

export function createOnrampSession(body: OnrampSessionRequest): Promise<OnrampSession> {
  return send("POST", "/api/onramp/session", onrampSessionSchema, body);
}

export function getMe(): Promise<UserProfile> {
  return request("/api/me", userProfileSchema, { cache: "no-store" });
}

export function updateMe(body: ProfileUpdate): Promise<UserProfile> {
  return send("PATCH", "/api/me", userProfileSchema, body);
}

export function addConsent(body: ConsentRequest): Promise<Consent> {
  return send("POST", "/api/me/consents", consentSchema, body);
}

export function getPrefs(): Promise<Preferences> {
  return request("/api/me/preferences", preferencesSchema, { cache: "no-store" });
}

export function setPrefs(body: Preferences): Promise<Preferences> {
  return send("PUT", "/api/me/preferences", preferencesSchema, body);
}
