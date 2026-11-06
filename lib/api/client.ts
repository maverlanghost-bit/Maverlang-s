import { z, type ZodType } from "zod";

import {
  activityResponseSchema,
  apiResultSchema,
  assetStatusBatchEntrySchema,
  assetStatusBatchResponseSchema,
  assetStatusSchema,
  balancesResponseSchema,
  consentsResponseSchema,
  consentSchema,
  deletionStatusSchema,
  favoritesResponseSchema,
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
  walletChallengeResponseSchema,
  walletsResponseSchema,
  walletSyncRequestSchema,
  type ConsentRequest,
  type DeletionStatus,
  type ProfileUpdate,
} from "@/lib/api/contracts";
import { httpStatusFor, type ApiErrorCode } from "@/lib/api/result";
import { ASSET_STATUS_BATCH_MAX } from "@/lib/market/asset-status.shared";
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
  readonly requestId?: string;

  constructor(code: ApiErrorCode, message: string, status = httpStatusFor(code), requestId?: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.requestId = requestId;
  }
}

/**
 * Se mantiene el punto de importación histórico (`@/lib/api/client`) para
 * tests y consumidores. La implementación vive en `retry.ts`, un módulo sin
 * dependencias que el provider raíz puede importar sin cargar el cliente API.
 */
export { isRateLimitedError, queryRetry } from "@/lib/api/retry";

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
      throw new ApiError(
        parsed.data.error.code,
        parsed.data.error.message,
        response.status,
        parsed.data.requestId,
      );
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
export type MarketSearchScope = "curated" | "listed" | "all";

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

export type AssetStatusBatchEntry = z.infer<typeof assetStatusBatchEntrySchema>;

/** Lotes de estado que pueden estar en vuelo a la vez. */
const ASSET_STATUS_BATCH_CONCURRENCY = 3;

/**
 * Estados del lote (`/api/market/status/batch`). Se deduplica sin distinguir
 * mayúsculas y se conserva el orden de entrada. El endpoint acepta hasta
 * `ASSET_STATUS_BATCH_MAX` (50) símbolos por llamada, así que una cartera más
 * grande se divide en lotes con concurrencia acotada y se combina en el orden
 * original. Un símbolo que falla no invalida el resto: llega con
 * `status: null` (también los de un lote cuya petición completa falle).
 */
export async function getAssetStatuses(symbols: readonly string[]): Promise<AssetStatusBatchEntry[]> {
  const list: string[] = [];
  const seen = new Set<string>();
  for (const symbol of symbols) {
    const trimmed = symbol.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    list.push(trimmed);
  }
  if (list.length === 0) return [];

  const batches: string[][] = [];
  for (let index = 0; index < list.length; index += ASSET_STATUS_BATCH_MAX) {
    batches.push(list.slice(index, index + ASSET_STATUS_BATCH_MAX));
  }

  const bySymbol = new Map<string, AssetStatusBatchEntry["status"]>();
  let next = 0;
  async function worker() {
    for (;;) {
      const batch = batches[next];
      next += 1;
      if (!batch) return;
      try {
        const query = new URLSearchParams({ symbols: batch.join(",") });
        const data = await request(
          `/api/market/status/batch?${query.toString()}`,
          assetStatusBatchResponseSchema,
          { cache: "no-store" },
        );
        for (const entry of data.statuses) {
          bySymbol.set(entry.symbol.toLowerCase(), entry.status);
        }
      } catch {
        // Un lote caído no invalida los demás: sus símbolos quedan sin aviso.
        for (const symbol of batch) bySymbol.set(symbol.toLowerCase(), null);
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(ASSET_STATUS_BATCH_CONCURRENCY, batches.length) }, () => worker()),
  );

  return list.map((symbol) => ({
    symbol,
    status: bySymbol.get(symbol.toLowerCase()) ?? null,
  }));
}

export interface HistoryResponse {
  points: PricePoint[];
  real: boolean;
  source: "ticks" | "closes" | "mock";
}

export function getHistory(symbol: string, range: Range = "1M"): Promise<HistoryResponse> {
  const query = new URLSearchParams({ range });
  return request(
    `/api/tickers/${encodeURIComponent(symbol)}/history?${query.toString()}`,
    historyResponseSchema,
    { cache: "no-store" },
  ) as Promise<HistoryResponse>;
}

const historySeriesSchema = historyResponseSchema.extend({ symbol: z.string() });
const historiesResponseSchema = z.object({ series: z.array(historySeriesSchema) });

export type HistorySeries = z.infer<typeof historySeriesSchema>;

/** Sparklines: una sola petición para todo el lote (`/api/tickers/history`). */
export function getHistories(symbols: readonly string[], range: Range = "1W"): Promise<HistorySeries[]> {
  const list: string[] = [];
  const seen = new Set<string>();
  for (const symbol of symbols) {
    const trimmed = symbol.trim();
    const key = trimmed.toLowerCase();
    if (!trimmed || seen.has(key)) continue;
    seen.add(key);
    list.push(trimmed);
  }
  if (list.length === 0) return Promise.resolve([]);
  const query = new URLSearchParams({ symbols: list.join(","), range });
  return request(`/api/tickers/history?${query.toString()}`, historiesResponseSchema, { cache: "no-store" }).then(
    (data) => data.series,
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

/** Reinicia la cuenta demo del usuario (US$1.000, sin posiciones ni órdenes). */
export function resetDemoAccount(): Promise<{ cashUsd: number; resetCount?: number }> {
  return send(
    "POST",
    "/api/demo/reset",
    z.object({ cashUsd: z.number(), resetCount: z.number().optional() }),
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

export function getFavorites(): Promise<string[]> {
  return request("/api/me/favorites", favoritesResponseSchema, { cache: "no-store" });
}

export function setFavorites(symbols: string[]): Promise<string[]> {
  return send("PUT", "/api/me/favorites", favoritesResponseSchema, { symbols });
}

/** Billeteras verificadas en el servidor (nunca la billetera demo). */
export function getWallets(): Promise<z.infer<typeof walletsResponseSchema>> {
  return request("/api/me/wallet", walletsResponseSchema, { cache: "no-store" });
}

/**
 * Paso 1 de la vinculación: el servidor emite un nonce y el mensaje exacto.
 * El token de Privy va en `Authorization` (nunca en la URL ni en el cuerpo).
 */
export function requestWalletLinkChallenge(
  privyAccessToken: string,
): Promise<z.infer<typeof walletChallengeResponseSchema>> {
  return request("/api/me/wallet/challenge", walletChallengeResponseSchema, {
    method: "POST",
    body: "{}",
    cache: "no-store",
    headers: { authorization: `Bearer ${privyAccessToken}` },
  });
}

/** Paso 2: envía el nonce y la firma ed25519 del mensaje. */
export function linkWallet(
  body: z.infer<typeof walletSyncRequestSchema>,
  privyAccessToken: string,
): Promise<z.infer<typeof walletsResponseSchema>> {
  return request("/api/me/wallet", walletsResponseSchema, {
    method: "POST",
    body: JSON.stringify(body),
    cache: "no-store",
    headers: { authorization: `Bearer ${privyAccessToken}` },
  });
}
