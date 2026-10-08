"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";

import { ChangeBadge } from "@/components/domain/change-badge";
import { FlashPrice } from "@/components/domain/flash-price";
import { PriceText } from "@/components/domain/price-text";
import { getPrices } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { formatPercent, formatUsd } from "@/lib/format";
import type { LandingQuote } from "@/lib/mocks/landing";
import type { Quote } from "@/lib/types";

/**
 * Números en vivo de la portada (M42). El servidor entrega `initial` y este
 * provider refresca con la misma query de precios (`["prices", symbols]`,
 * `refetchOnWindowFocus: true`). Los componentes de la portada siguen siendo
 * de servidor: sólo precio y cambio 24 h son cliente. Sin `live` (muestra),
 * la query queda apagada y siempre se ven los valores iniciales.
 * No importa módulos server-only: la etiqueta vive en el servidor.
 */

/** Refresco de la portada. `usePrices` usa 15 s; aquí bastan 20 s. */
export const LANDING_REFETCH_MS = 20_000;

export interface LandingInitial {
  priceUsd: number;
  change: number;
}

interface LandingLiveState {
  initialBySymbol: ReadonlyMap<string, LandingInitial>;
  liveBySymbol: ReadonlyMap<string, Quote>;
}

const LandingLiveContext = createContext<LandingLiveState | null>(null);

function useLandingLiveState(): LandingLiveState {
  const state = useContext(LandingLiveContext);
  if (!state) throw new Error("LandingPrice fuera de <LiveLandingPrices>");
  return state;
}

export function LiveLandingPrices({
  symbols,
  live,
  initial,
  children,
}: {
  symbols: readonly string[];
  live: boolean;
  initial: readonly LandingQuote[];
  children: ReactNode;
}) {
  const sorted = useMemo(() => [...symbols].sort(), [symbols]);
  const query = useQuery({
    queryKey: ["prices", sorted],
    queryFn: () => getPrices(sorted),
    enabled: live && sorted.length > 0,
    staleTime: LANDING_REFETCH_MS,
    refetchInterval: LANDING_REFETCH_MS,
    refetchOnWindowFocus: true,
  });
  const value = useMemo<LandingLiveState>(
    () => ({
      initialBySymbol: new Map(
        initial.map((quote) => [quote.symbol, { priceUsd: quote.priceUsd, change: quote.change }]),
      ),
      liveBySymbol: new Map((query.data ?? []).map((quote) => [quote.symbol, quote])),
    }),
    [initial, query.data],
  );
  return <LandingLiveContext.Provider value={value}>{children}</LandingLiveContext.Provider>;
}

/** Precio y cambio 24 h: en vivo si la query ya trajo el símbolo, si no el valor inicial. */
export function useLandingQuote(symbol: string, initial?: LandingInitial): { priceUsd: number; change: number } {
  const state = useLandingLiveState();
  const quote = state.liveBySymbol.get(symbol);
  if (
    quote &&
    Number.isFinite(quote.priceUsd) &&
    quote.priceUsd > 0 &&
    Number.isFinite(quote.change24hPct)
  ) {
    return { priceUsd: quote.priceUsd, change: quote.change24hPct };
  }
  const fallback = initial ?? state.initialBySymbol.get(symbol);
  return { priceUsd: fallback?.priceUsd ?? 0, change: fallback?.change ?? 0 };
}

/**
 * Número de la portada en dólares (US$). `full` (filas y ficha) usa el
 * destello de M41; `tape` (cinta) es texto liviano con `formatUsd`.
 */
export function LandingPrice({
  symbol,
  initial,
  layout = "full",
}: {
  symbol: string;
  initial?: LandingInitial;
  layout?: "full" | "tape";
}) {
  const { priceUsd, change } = useLandingQuote(symbol, initial);

  if (layout === "tape") {
    const tone = change > 0 ? "text-up" : change < 0 ? "text-down" : "text-fg-muted";
    return (
      <span className="inline-flex items-center gap-2 px-4">
        <span className="text-sm font-medium text-fg">{symbol}</span>
        <span className="font-mono text-sm tabular-nums text-fg-muted">{formatUsd(priceUsd)}</span>
        <span className={cn("font-mono text-sm tabular-nums", tone)}>{formatPercent(change)}</span>
      </span>
    );
  }

  return (
    <span className="flex shrink-0 flex-col items-end gap-0.5">
      <FlashPrice value={priceUsd} currency="USD" size="sm" />
      <ChangeBadge value={change} />
    </span>
  );
}

/** Valor en dólares de una fracción de ejemplo (HowItWorks, en US$). */
export function LandingSharesValue({
  symbol,
  shares,
  initialPrice,
}: {
  symbol: string;
  shares: number;
  initialPrice: number;
}) {
  const { priceUsd } = useLandingQuote(symbol, { priceUsd: initialPrice, change: 0 });
  const valueUsd = Math.round(priceUsd * shares * 100) / 100;
  return <PriceText value={valueUsd} currency="USD" size="sm" className="shrink-0" />;
}
