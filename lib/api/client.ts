import { z, type ZodType } from "zod";

import {
  activityResponseSchema,
  apiResultSchema,
  assetStatusSchema,
  balancesResponseSchema,
  consentsResponseSchema,
  consentSchema,
  deletionStatusSchema,
  fxRateSchema,
  historyResponseSchema,
  marketSearchItemSchema,
  marketSearchResponseSchema,
  marketStatusSchema,
  onrampSessionSchema,
  onrampWebhookResponseSchema,
  portfolioSchema,
  preferencesSchema,
  quotesResponseSchema,
  tickersResponseSchema,
  orderSchema,
  tradeBuildResponseSchema,
  tradeQuoteSchema,
  tradeSubmitResponseSchema,
  userProfileSchema,
  type ConsentRequest,
  type DeletionStatus,
  type ProfileUpdate,
} from "@/lib/api/contracts";
import { httpStatusFor, type ApiErrorCode } from "@/lib/api/result";
import type {
  Activity,
  Balance,
  Consent,
  FxRate,
  MarketStatus,
  OnrampSession,
  OnrampSessionRequest,
  Portfolio,
  Preferences,
  PricePoint,
  Order,
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

/** `?mockError=` lo lee el route handler. Sirve para probar el flujo sin tocar el servicio. */
function withMockQuery(path: string, mockError?: string | null): string {
  if (!mockError) return path;
  const join = path.includes("?") ? "&" : "?";
  return `${path}${join}mockError=${encodeURIComponent(mockError)}`;
}

export function getTickers(): Promise<Ticker[]> {
  return request("/api/tickers", tickersResponseSchema, { next: { revalidate: 3600 } });
}

export type MarketSearchItem = z.infer<typeof marketSearchItemSchema>;
export type MarketSearchResult = z.infer<typeof marketSearchResponseSchema>;
export type MarketSearchSort = "liquidity" | "name";
export type MarketSearchScope = "curated" | "all";

export interface MarketSearchParams {
  q?: string;
  category?: string;
  page?: number;
  pageSize?: number;
  sort?: MarketSearchSort;
  scope?: MarketSearchScope;
}

/** Búsqueda paginada del mercado (M38). Una llamada por página. */
export function searchMarket(params: MarketSearchParams): Promise<MarketSearchResult> {
  const query = new URLSearchParams();
  const q = params.q?.trim() ?? "";
  if (q) query.set("q", q);
  if (params.category && params.category !== "all") query.set("category", params.category);
  query.set("page", String(params.page ?? 1));
  query.set("pageSize", String(params.pageSize ?? 20));
  query.set("sort", params.sort ?? "liquidity");
  if (params.scope) query.set("scope", params.scope);
  const suffix = query.toString();
  return request(`/api/market/search${suffix ? `?${suffix}` : ""}`, marketSearchResponseSchema);
}

export function getPrices(symbols?: readonly string[]): Promise<Quote[]> {
  const list = (symbols ?? []).map((symbol) => symbol.trim()).filter((symbol) => symbol.length > 0);
  const query = list.length > 0 ? `?symbols=${encodeURIComponent(list.join(","))}` : "";
  return request(`/api/prices${query}`, quotesResponseSchema, { cache: "no-store" });
}

export function getFx(): Promise<FxRate> {
  return request("/api/fx/usdclp", fxRateSchema, { cache: "no-store" });
}

export function getMarketStatus(): Promise<MarketStatus> {
  return request("/api/market/status", marketStatusSchema, { cache: "no-store" });
}

export type AssetStatus = z.infer<typeof assetStatusSchema>;

/** Horario real por acción (M39). Sin símbolo se usa `getMarketStatus` (estado general). */
export function getAssetStatus(symbol: string): Promise<AssetStatus> {
  const query = new URLSearchParams({ symbol: symbol.trim() });
  return request(`/api/market/status?${query.toString()}`, assetStatusSchema, { cache: "no-store" });
}

export function getHistory(symbol: string, range: Range = "1M"): Promise<PricePoint[]> {
  const query = new URLSearchParams({ range });
  return request(
    `/api/tickers/${encodeURIComponent(symbol)}/history?${query.toString()}`,
    historyResponseSchema,
    { cache: "no-store" },
  );
}

export function quoteTrade(body: TradeQuoteRequest, mockError?: string | null): Promise<TradeQuote> {
  return send("POST", withMockQuery("/api/trade/quote", mockError), tradeQuoteSchema, body);
}

export function buildTrade(body: TradeBuildRequest, mockError?: string | null): Promise<TradeBuildResponse> {
  return send("POST", withMockQuery("/api/trade/build", mockError), tradeBuildResponseSchema, body);
}

export function submitTrade(body: TradeSubmitRequest, mockError?: string | null): Promise<TradeSubmitResponse> {
  return send("POST", withMockQuery("/api/trade/submit", mockError), tradeSubmitResponseSchema, body);
}

export function getTradeStatus(id: string, mockError?: string | null): Promise<Order> {
  const query = new URLSearchParams({ id });
  if (mockError) query.set("mockError", mockError);
  return request(`/api/trade/status?${query.toString()}`, orderSchema, { cache: "no-store" });
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

export function buildSend(body: SendBuildRequest, mockError?: string | null): Promise<TradeBuildResponse> {
  return send("POST", withMockQuery("/api/wallet/send/build", mockError), tradeBuildResponseSchema, body);
}

export function createOnrampSession(body: OnrampSessionRequest): Promise<OnrampSession> {
  return send("POST", "/api/onramp/session", onrampSessionSchema, body);
}

/** Aviso del proveedor. En mock acredita el USDC de la sesión. */
export function notifyOnrampWebhook(body: { sessionId: string }): Promise<{
  ok: true;
  estimatedUsdc?: number;
  already?: boolean;
}> {
  return send("POST", "/api/onramp/webhook", onrampWebhookResponseSchema, body);
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

export function getConsents(): Promise<Consent[]> {
  return request("/api/me/consents", consentsResponseSchema, { cache: "no-store" });
}

export function getDeletionStatus(): Promise<DeletionStatus> {
  return request("/api/me/deletion", deletionStatusSchema, { cache: "no-store" });
}

/** Reinicia la cuenta demo del usuario (saldo inicial, sin posiciones ni órdenes). */
export function resetDemoAccount(): Promise<{ cashClp: number; resetCount?: number }> {
  return send(
    "POST",
    "/api/demo/reset",
    z.object({ cashClp: z.number(), resetCount: z.number().optional() }),
    {},
  );
}

export function requestDeletion(): Promise<DeletionStatus> {
  return send("POST", "/api/me/deletion", deletionStatusSchema, {});
}

export function getPrefs(): Promise<Preferences> {
  return request("/api/me/preferences", preferencesSchema, { cache: "no-store" });
}

export function setPrefs(body: Preferences): Promise<Preferences> {
  return send("PUT", "/api/me/preferences", preferencesSchema, body);
}
