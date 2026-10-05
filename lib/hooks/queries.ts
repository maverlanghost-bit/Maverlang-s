"use client";

import { useQueries, useQuery } from "@tanstack/react-query";

import {
  getActivity,
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
} from "@/lib/api/client";
import type { Range } from "@/lib/types";

const HOUR_MS = 3_600_000;
const PRICE_MS = 15_000;

export function useTickers() {
  return useQuery({
    queryKey: ["tickers"],
    queryFn: getTickers,
    staleTime: HOUR_MS,
  });
}

export function usePrices(symbols?: readonly string[]) {
  const list = (symbols ?? []).map((symbol) => symbol.trim()).filter((symbol) => symbol.length > 0);
  const key = [...list].sort();
  return useQuery({
    queryKey: ["prices", key],
    queryFn: () => getPrices(list),
    staleTime: PRICE_MS,
    refetchInterval: PRICE_MS,
  });
}

export function useHistory(symbol: string, range: Range = "1M") {
  const trimmed = symbol.trim();
  return useQuery({
    queryKey: ["history", trimmed, range],
    queryFn: () => getHistory(trimmed, range),
    enabled: trimmed.length > 0,
  });
}

const HISTORY_MS = 5 * 60_000;

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

export function usePortfolio() {
  return useQuery({
    queryKey: ["portfolio"],
    queryFn: getPortfolio,
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
  return useQuery({
    queryKey: ["prefs"],
    queryFn: getPrefs,
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

/** USDCLP. El route es no-store; el cliente lo retiene 1 h. */
export function useFx() {
  return useQuery({
    queryKey: ["fx", "USDCLP"],
    queryFn: getFx,
    staleTime: HOUR_MS,
  });
}
