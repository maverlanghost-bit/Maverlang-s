"use client";

import { useQueries, useQuery } from "@tanstack/react-query";

import {
  getActivity,
  getAssetStatus,
  getBalances,
  getConsents,
  getDeletionStatus,
  getFx,
  getHistory,
  getMarketStatus,
  getMe,
  getPortfolio,
  getPrefs,
  getPrices,
  getTickers,
  searchMarket,
  type MarketSearchParams,
} from "@/lib/api/client";
import { useSession } from "@/lib/auth/session-context";
import type { Range } from "@/lib/types";

const HOUR_MS = 3_600_000;
/** Polling de precios en vivo (M41): 15 s en listas, también al volver a la pestaña. */
export const PRICE_MS = 15_000;
/** Detalle y hoja de compra (N13): 5 s. Requiere key de Jupiter (1 req/s en Free). */
export const SPOT_MS = 5_000;
/** Historial del gráfico abierto (M41): cache 5 min, repoll cada 60 s visible. */
export const HISTORY_MS = 5 * 60_000;
export const HISTORY_REFETCH_MS = 60_000;

export function useTickers() {
  return useQuery({
    queryKey: ["tickers"],
    queryFn: getTickers,
    staleTime: HOUR_MS,
  });
}

/** Búsqueda del mercado en el servidor (M38). `enabled` la pausa (favoritas se filtran en el cliente). */
export function useMarketSearch(params: MarketSearchParams, enabled = true) {
  const q = params.q?.trim() ?? "";
  const category = params.category ?? "all";
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 20;
  const sort = params.sort ?? "liquidity";
  const scope = params.scope ?? "curated";
  return useQuery({
    queryKey: ["market-search", q, category, page, pageSize, sort, scope],
    queryFn: () => searchMarket({ q, category, page, pageSize, sort, scope }),
    enabled,
    staleTime: 30_000,
  });
}

export function usePrices(symbols?: readonly string[], enabled = true, intervalMs = PRICE_MS) {
  const list = (symbols ?? []).map((symbol) => symbol.trim()).filter((symbol) => symbol.length > 0);
  const key = [...list].sort();
  return useQuery({
    queryKey: ["prices", key],
    queryFn: () => getPrices(list),
    enabled: enabled && list.length > 0,
    staleTime: intervalMs,
    refetchInterval: intervalMs,
    refetchOnWindowFocus: true,
  });
}

export function useHistory(symbol: string, range: Range = "1M") {
  const trimmed = symbol.trim();
  return useQuery({
    queryKey: ["history", trimmed, range],
    queryFn: () => getHistory(trimmed, range),
    enabled: trimmed.length > 0,
    staleTime: HISTORY_MS,
    refetchInterval: HISTORY_REFETCH_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}

/** Una serie por símbolo. Misma clave que `useHistory`, para compartir caché. */
export function useHistories(symbols: readonly string[], range: Range = "1W") {
  return useQueries({
    queries: symbols.map((symbol) => {
      const trimmed = symbol.trim();
      return {
        queryKey: ["history", trimmed, range] as const,
        queryFn: () => getHistory(trimmed, range),
        enabled: trimmed.length > 0,
        staleTime: HISTORY_MS,
      };
    }),
  });
}

export function useMarketStatus() {
  return useQuery({
    queryKey: ["market-status"],
    queryFn: getMarketStatus,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
}

/** Horario real por acción (M39): live → catálogo → mock. Cache 60 s. */
export function useAssetStatus(symbol: string, enabled = true) {
  const trimmed = symbol.trim();
  return useQuery({
    queryKey: ["asset-status", trimmed],
    queryFn: () => getAssetStatus(trimmed),
    enabled: enabled && trimmed.length > 0,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
}

export function usePortfolio(enabled = true) {
  return useQuery({
    queryKey: ["portfolio"],
    queryFn: getPortfolio,
    enabled,
  });
}

export function useBalances() {
  return useQuery({
    queryKey: ["balances"],
    queryFn: getBalances,
  });
}

export function useActivity() {
  return useQuery({
    queryKey: ["activity"],
    queryFn: getActivity,
  });
}

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: getMe,
  });
}

export function usePrefs() {
  const session = useSession();
  return useQuery({
    queryKey: ["prefs"],
    queryFn: getPrefs,
    enabled: session.status === "authenticated",
  });
}

export function useConsents() {
  return useQuery({
    queryKey: ["consents"],
    queryFn: getConsents,
  });
}

export function useDeletionStatus() {
  return useQuery({
    queryKey: ["deletion"],
    queryFn: getDeletionStatus,
  });
}

/** USDCLP. Refresco cada 5 minutos (M40): la moneda única lo usa en toda la app. */
export function useFx() {
  return useQuery({
    queryKey: ["fx", "USDCLP"],
    queryFn: getFx,
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });
}
