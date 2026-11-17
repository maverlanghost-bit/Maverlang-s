"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";

import { ChangeBadge } from "@/components/domain/change-badge";
import { FlashPrice } from "@/components/domain/flash-price";
import { PriceText } from "@/components/domain/price-text";
import { PriceFreshness } from "@/components/domain/price-freshness";
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
  source?: Quote["source"];
  reference?: boolean;
  stale?: boolean;
  updatedAt?: string;
  live?: boolean;
}

interface LandingResolved extends LandingInitial {
  reference: boolean;
  demo: boolean;
  stale: boolean;
}

interface LandingLiveState {
  initialBySymbol: ReadonlyMap<string, LandingInitial>;
  liveBySymbol: ReadonlyMap<string, Quote>;
  /** true cuando el último refetch falló: el número visible es el último conocido. */
  stale: boolean;
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
        initial.map((quote) => [quote.symbol, quote]),
      ),
      liveBySymbol: new Map((query.data ?? []).map((quote) => [quote.symbol, quote])),
      // El refetch que falla deja el último precio bueno en pantalla: se
      // avisa como «último precio conocido» en vez de «en vivo».
      stale: live && (query.isError || query.isRefetchError),
    }),
    [initial, query.data, live, query.isError, query.isRefetchError],
  );
  return <LandingLiveContext.Provider value={value}>{children}</LandingLiveContext.Provider>;
}

function resolvedQuote(state: LandingLiveState, symbol: string, initial?: LandingInitial): LandingResolved {
  const quote = state.liveBySymbol.get(symbol);
  if (
    quote &&
    Number.isFinite(quote.priceUsd) &&
    quote.priceUsd > 0 &&
    Number.isFinite(quote.change24hPct)
  ) {
    return {
      priceUsd: quote.priceUsd, change: quote.change24hPct, source: quote.source,
      updatedAt: quote.updatedAt, reference: quote.source === "mock" || quote.reference === true,
      demo: quote.source === "mock", stale: state.stale || quote.stale === true,
    };
  }
  // Los callers antiguos pasan sólo números. El mapa conserva la procedencia
  // del servidor para que ese objeto parcial no convierta una muestra en live.
  const fallback = state.initialBySymbol.get(symbol) ?? initial;
  return {
    ...fallback, priceUsd: fallback?.priceUsd ?? 0, change: fallback?.change ?? 0,
    reference: fallback?.source !== "jupiter" || fallback.reference === true,
    demo: fallback?.source === "mock" || (!fallback?.source && fallback?.live !== true),
    stale: state.stale || fallback?.stale === true,
  };
}

/** Valores y procedencia de la MISMA cotización; nunca del instante del refetch. */
export function useLandingQuote(symbol: string, initial?: LandingInitial): LandingResolved {
  return resolvedQuote(useLandingLiveState(), symbol, initial);
}

/**
 * Estado del origen de los precios para la etiqueta de la portada. Fuera del
 * provider devuelve `stale: false` (la etiqueta es presentacional; el dato
 * sigue saliendo de `useLandingQuote`, que sí exige el provider).
 */
export function useLandingStatus(): { stale: boolean; reference: boolean; demo: boolean; token: boolean } {
  const state = useContext(LandingLiveContext);
  if (!state) return { stale: false, reference: true, demo: true, token: false };
  const quotes = [...state.initialBySymbol.keys()].map((symbol) => resolvedQuote(state, symbol));
  return {
    stale: state.stale || quotes.some((quote) => quote.stale),
    reference: quotes.some((quote) => quote.reference),
    demo: quotes.length === 0 || quotes.every((quote) => quote.demo),
    token: quotes.length > 0 && quotes.every((quote) => quote.source === "jupiter" && !quote.reference),
  };
}

/**
 * Etiqueta del origen de las cotizaciones. Sin `live` es una muestra; si el
 * último refetch falló, el número en pantalla es el último bueno y se avisa
 * con punto `warn` en vez de verde: nunca se dice «en vivo» sobre un dato
 * viejo.
 */
export function LandingLiveBadge({ live }: { live: boolean }) {
  const { stale, demo, token } = useLandingStatus();
  const state = demo ? "sample" : stale ? "stale" : live && token ? "token" : "reference";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 text-xs font-medium whitespace-nowrap",
        state === "stale" ? "text-warn" : "text-fg-muted",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 shrink-0 rounded-full",
          state === "stale" ? "bg-warn" : "bg-fg-muted",
        )}
      />
      {state === "stale" ? "Últimos precios conocidos · USD" : state === "token" ? "Cotizaciones del token · USD" : state === "sample" ? "Precios ilustrativos · USD" : "Incluye precios de referencia · USD"}
    </span>
  );
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
  const quote = useLandingQuote(symbol, initial);
  const { priceUsd, change, demo, reference, stale, updatedAt } = quote;
  const sourceLabel = demo ? "Demostración" : reference ? "Referencia" : "Cotización del token";

  if (layout === "tape") {
    const tone = change > 0 ? "text-up" : change < 0 ? "text-down" : "text-fg-muted";
    return (
      <span className="inline-flex items-center gap-2 px-4" title={`${sourceLabel} · USD${stale ? " · atrasado" : ""}`}>
        <span className="text-sm font-medium whitespace-nowrap text-fg">{symbol}</span>
        <span className="font-mono text-sm whitespace-nowrap tabular-nums text-fg-muted">{formatUsd(priceUsd)}</span>
        <span className={cn("font-mono text-sm whitespace-nowrap tabular-nums", tone)}>{formatPercent(change)}</span>
        <span className="sr-only">24 h · {sourceLabel}{stale ? " · atrasado" : ""}</span>
      </span>
    );
  }

  return (
    <span className="flex shrink-0 flex-col items-end gap-1">
      <FlashPrice value={priceUsd} currency="USD" size="sm" live={quote.source === "jupiter" && !reference && !stale} />
      <ChangeBadge value={change} />
      <span className="text-[11px] text-fg-muted">24 h · {sourceLabel} · USD</span>
      {!demo && !reference ? <PriceFreshness at={updatedAt} stale={stale} /> : null}
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
