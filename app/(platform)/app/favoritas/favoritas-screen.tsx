"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQueries } from "@tanstack/react-query";

import { AlertButton } from "@/components/domain/alert-button";
import { AlertsPanel } from "@/components/domain/alert-panel";
import { FavoriteButton } from "@/components/domain/favorite-button";
import { MarketSectionChips } from "@/components/domain/market-section-chips";
import { PriceFreshness } from "@/components/domain/price-freshness";
import { Sparkline } from "@/components/domain/sparkline";
import { TickerLogo } from "@/components/domain/ticker-logo";
import { ChangeBadge } from "@/components/domain/change-badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { FlashPrice } from "@/components/domain/flash-price";
import { PageHeader } from "@/components/ui/page-header";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import { alertasText, fillAlert } from "@/content/i18n/extra-alertas";
import { getPrices } from "@/lib/api/client";
import { isCatalogSymbol } from "@/lib/catalog/symbol";
import { useFavorites, useSyncFavorites } from "@/lib/hooks/use-favorites";
import { PRICE_MS, priceQueryKey, useFx, useHistories } from "@/lib/hooks/queries";
import { useT } from "@/lib/hooks/use-t";
import { isRealSparkHistory, downsample, displayPrice } from "@/lib/market/browse";
import { anchorSeriesToSpot } from "@/lib/market/series";
import { chunkSymbols, sortFavoriteRows, uniqueSymbols, type FavoriteSort } from "@/lib/services/alerts-logic";
import type { Quote } from "@/lib/types";
import { useFavoriteCatalog } from "./use-favorite-catalog";

function tickerHref(symbol: string) {
  return `/app/accion/${encodeURIComponent(symbol)}`;
}

type Row = {
  symbol: string;
  name: string;
  logoUrl: string | null;
  priceUsd: number | null;
  change24hPct: number | null;
  sparkline?: number[];
  lowLiquidity: boolean;
  underReview: boolean;
};

/**
 * Estado vacío de favoritas (§1.9): explica cómo se agrega una y qué se ve
 * después. El texto vive en el componente, no en content/i18n.
 */
type FavoritesEmptyCopy = { body: string; steps: string[] };

const FAVORITES_EMPTY: Record<"es-CL" | "en", FavoritesEmptyCopy> = {
  "es-CL": {
    body: "Aquí ves el precio y el cambio del día de las acciones que sigues.",
    steps: [
      "Abre una acción en el mercado.",
      "Toca la estrella para seguirla.",
      "Vuelve aquí para ver su precio y crear un aviso.",
    ],
  },
  en: {
    body: "Here you'll see the price and daily change of the stocks you follow.",
    steps: [
      "Open a stock in the market.",
      "Tap the star to follow it.",
      "Come back here to see its price and create an alert.",
    ],
  },
};

/**
 * Favoritas con el mismo precio, cambio y sparkline real que el mercado.
 * El orden (cambio o nombre) es local. El aviso se crea desde cada fila.
 */
export function FavoritasScreen() {
  const { t, language, currency } = useT();
  const copy = alertasText(language);
  const { symbols, toggle } = useFavorites();
  useSyncFavorites();
  const fx = useFx();
  const [sort, setSort] = useState<FavoriteSort>("change");
  const emptyCopy = FAVORITES_EMPTY[language];

  const favoriteKey = (symbols ?? []).join("\n");
  const favoriteSymbols = useMemo(() => uniqueSymbols(favoriteKey ? favoriteKey.split("\n") : []), [favoriteKey]);
  /** Lo guardado manda al quitar: el catálogo puede traer `AAPLx` y el almacén `AAPLX`. */
  const storedSymbolByKey = useMemo(
    () => new Map(favoriteSymbols.map((symbol) => [symbol.toLowerCase(), symbol])),
    [favoriteSymbols],
  );

  // Un solo catálogo (paginado) resuelve nombre, logo y estado de todas las filas.
  // Antes se pedía una búsqueda de mercado por cada símbolo favorito. Si la
  // primera página ya cubre todas las favoritas, no se piden las siguientes.
  const catalog = useFavoriteCatalog(favoriteSymbols);
  const catalogBySymbol = catalog.bySymbol;

  /**
   * Precios en paralelo con el catálogo. La clave va en minúsculas para que el
   * símbolo guardado (`AAPLX`) y el del catálogo (`AAPLx`) compartan una sola
   * consulta: ni se pide dos veces ni se espera a la búsqueda para arrancar.
   * La API resuelve el símbolo sin distinguir mayúsculas.
   */
  const [pricesRestricted, setPricesRestricted] = useState(false);
  const favoritePriceSymbols = useMemo(
    () =>
      priceQueryKey(
        favoriteSymbols.filter((symbol) => isCatalogSymbol(symbol)).map((symbol) => symbol.toLowerCase()),
      ),
    [favoriteSymbols],
  );
  /**
   * Si un favorito quedó fuera del catálogo visible (oculto o retirado), el lote
   * de precios falla entero. Cuando las páginas ya terminaron (bien o con error)
   * se reintenta sólo con los símbolos que el catálogo sí muestra, igual que la
   * versión anterior, sin perder el resto. Esperar a `isComplete` dejaba el
   * reintento bloqueado para siempre si fallaba una página secundaria.
   */
  const catalogPriceSymbols = useMemo(() => {
    if (!catalog.isSettled) return null;
    return favoritePriceSymbols.filter((symbol) => catalogBySymbol.has(symbol));
  }, [catalog.isSettled, catalogBySymbol, favoritePriceSymbols]);
  const priceSymbols =
    pricesRestricted && catalogPriceSymbols ? catalogPriceSymbols : favoritePriceSymbols;
  const chunks = useMemo(() => chunkSymbols(priceSymbols, 50), [priceSymbols]);
  const priceQueries = useQueries({
    queries: chunks.map((chunk) => ({
      queryKey: ["prices", chunk] as const,
      /**
       * Si el lote falla se marca la restricción desde la propia consulta (un
       * callback asíncrono, no un efecto): el siguiente render vuelve a pedir
       * sólo los símbolos que el catálogo muestra.
       */
      queryFn: async () => {
        try {
          return await getPrices(chunk);
        } catch (error) {
          setPricesRestricted(true);
          throw error;
        }
      },
      enabled: chunk.length > 0,
      staleTime: PRICE_MS,
      refetchInterval: PRICE_MS,
      refetchOnWindowFocus: false as const,
      refetchIntervalInBackground: false as const,
      placeholderData: (previous: Quote[] | undefined) => previous,
    })),
  });

  const quotes = useMemo(() => {
    const map = new Map<string, Quote>();
    for (const query of priceQueries) {
      for (const quote of query.data ?? []) map.set(quote.symbol.toLowerCase(), quote);
    }
    return map;
  }, [priceQueries]);

  /** Frescura de la lista: el `updatedAt` más reciente de las cotizaciones. */
  const freshestAt = useMemo(() => {
    let max: number | null = null;
    for (const quote of quotes.values()) {
      const ms = Date.parse(quote.updatedAt);
      if (Number.isFinite(ms) && (max === null || ms > max)) max = ms;
    }
    return max;
  }, [quotes]);
  const anyStale = useMemo(() => {
    for (const quote of quotes.values()) {
      if (quote.stale === true) return true;
    }
    return false;
  }, [quotes]);

  // Sparklines en paralelo con los precios: ya no esperan a que llegue la cotización.
  // El lote de historial admite hasta 50 símbolos por llamada.
  const sparkSymbols = useMemo(() => priceSymbols.slice(0, 50), [priceSymbols]);
  const histories = useHistories(sparkSymbols);

  const sparkBySymbol = useMemo(() => {
    const map = new Map<string, number[]>();
    sparkSymbols.forEach((symbol, index) => {
      const data = histories[index]?.data;
      if (!data || !isRealSparkHistory(data)) return;
      const points = data.points;
      if (!points || points.length < 2) return;
      const spot = quotes.get(symbol.toLowerCase())?.priceUsd;
      const series = spot !== undefined && spot > 0 ? anchorSeriesToSpot(points, spot) : points;
      map.set(symbol.toLowerCase(), downsample(series.map((point) => point.p)));
    });
    return map;
  }, [sparkSymbols, histories, quotes]);

  const rows = useMemo(() => {
    const built: Row[] = favoriteSymbols.map((symbol) => {
      const item = catalogBySymbol.get(symbol.toLowerCase()) ?? null;
      const canonical = item?.symbol ?? symbol;
      const quote = quotes.get(canonical.toLowerCase()) ?? null;
      const change = quote && Number.isFinite(quote.change24hPct) ? quote.change24hPct : null;
      return {
        symbol: canonical,
        name: item?.name ?? symbol,
        logoUrl: item?.logoUrl ?? null,
        priceUsd: quote && quote.priceUsd > 0 ? quote.priceUsd : null,
        change24hPct: change,
        sparkline: sparkBySymbol.get(canonical.toLowerCase()),
        lowLiquidity: item?.lowLiquidity === true,
        underReview: item?.underReview === true,
      };
    });
    return sortFavoriteRows(built, sort);
  }, [favoriteSymbols, catalogBySymbol, quotes, sparkBySymbol, sort]);

  const pendingFavorites = symbols === null;
  // Con la primera página ya resuelta se muestran las filas; las páginas
  // siguientes sólo completan nombre, logo y estado sin volver a tapar la lista.
  const searching = favoriteSymbols.length > 0 && catalog.isInitialPending;
  const searchFailed = favoriteSymbols.length > 0 && catalog.isError;
  const rate = fx.data?.rate;
  const fxKnown = typeof rate === "number" && Number.isFinite(rate) && rate > 0;
  const shownCurrency = currency === "CLP" && fxKnown ? "CLP" : "USD";

  function retry() {
    catalog.refetch();
    for (const query of priceQueries) void query.refetch();
    if (currency === "CLP") void fx.refetch();
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <MarketSectionChips active="stocks" />
      <div className="flex flex-col gap-2">
        <PageHeader title={copy.pageTitle} description={copy.pageLead} />
        <PriceFreshness at={freshestAt} stale={anyStale} />
      </div>
      {favoriteSymbols.length > 0 ? (
        <div className="flex max-w-full">
          <SegmentedControl
            label={copy.sortLabel}
            value={sort}
            compact
            onChange={(value) => {
              if (value === "change" || value === "name") setSort(value);
            }}
            options={[
              { value: "change", label: `${copy.sortChange} ↓` },
              { value: "name", label: `${copy.sortName} A–Z` },
            ]}
          />
        </div>
      ) : null}
      {currency === "CLP" && !fxKnown && !fx.isPending && favoriteSymbols.length > 0 ? (
        <p className="text-sm text-fg-muted">{t.detail.fxFallback}</p>
      ) : null}
      {pendingFavorites || searching ? <ListSkeleton label={copy.loading} /> : null}
      {!pendingFavorites && searchFailed ? (
        <ErrorState title={copy.listError} onRetry={retry} retryLabel={copy.retry} label={copy.listError} />
      ) : null}
      {!pendingFavorites && !searching && !searchFailed && favoriteSymbols.length === 0 ? (
        <EmptyState
          media={<FavoritesEmptyArt />}
          title={copy.emptyTitle}
          description={emptyCopy.body}
          action={
            <div className="flex w-full flex-col items-center gap-3">
              <ol className="mx-auto flex w-full max-w-xs flex-col gap-1.5 text-left text-sm leading-relaxed text-fg-muted">
                {emptyCopy.steps.map((step, index) => (
                  <li key={step} className="flex items-start gap-2">
                    <span
                      className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-border/70 bg-surface-1 text-[11px] font-medium text-fg"
                      aria-hidden="true"
                    >
                      {index + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
              <Button asChild size="lg" className="min-h-11 w-full whitespace-nowrap sm:w-auto">
                <Link href="/app">{copy.emptyAction}</Link>
              </Button>
            </div>
          }
        />
      ) : null}
      {!pendingFavorites && !searching && !searchFailed && rows.length > 0 ? (
        <ul className="flex min-w-0 flex-col divide-y divide-border">
          {rows.map((row) => {
            const shown =
              row.priceUsd != null ? displayPrice(row.priceUsd, shownCurrency, fxKnown ? rate : undefined) : null;
            return (
              <li key={row.symbol}>
                <FavoriteRow
                  row={row}
                  shown={shown}
                  currency={shownCurrency}
                  noPrice={copy.noPrice}
                  noChange={copy.noChange}
                  lowLiquidityLabel={row.lowLiquidity ? t.market.lowLiquidity : null}
                  reviewLabel={row.underReview ? t.market.underReview : null}
                  reviewHint={row.underReview ? t.market.underReviewHint : null}
                  favoriteLabel={fillAlert(t.market.favoriteOn, { name: row.name })}
                  onToggle={() => toggle(storedSymbolByKey.get(row.symbol.toLowerCase()) ?? row.symbol)}
                />
              </li>
            );
          })}
        </ul>
      ) : null}
      <AlertsPanel />
    </div>
  );
}

function FavoriteRow({
  row,
  shown,
  currency,
  noPrice,
  noChange,
  lowLiquidityLabel,
  reviewLabel,
  reviewHint,
  favoriteLabel,
  onToggle,
}: {
  row: Row;
  shown: number | null;
  currency: "CLP" | "USD";
  noPrice: string;
  noChange: string;
  lowLiquidityLabel: string | null;
  reviewLabel: string | null;
  reviewHint: string | null;
  favoriteLabel: string;
  onToggle: () => void;
}) {
  return (
    <div className="flex min-h-16 items-center transition-colors duration-150 hover:bg-surface-1/70 active:bg-surface-1">
      <Link
        href={tickerHref(row.symbol)}
        className="flex min-h-16 min-w-0 flex-1 items-center gap-2 px-2 py-2 sm:gap-3 sm:px-3"
      >
        <TickerLogo symbol={row.symbol} name={row.name} logoUrl={row.logoUrl} size={36} decorative loading="lazy" sizes="40px" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-mono text-sm font-semibold tracking-tight text-fg" title={row.symbol}>
            {row.symbol}
          </span>
          <span className="mt-0.5 block truncate text-[13px] leading-4 text-fg-muted" title={row.name}>
            {row.name}
            {lowLiquidityLabel ? <span className="hidden sm:inline"> · {lowLiquidityLabel}</span> : null}
          </span>
          {reviewLabel ? (
            <span
              className="mt-1 block w-fit max-w-full truncate text-[13px] leading-4 font-medium text-warn"
              title={reviewHint ?? undefined}
            >
              {reviewLabel}
            </span>
          ) : null}
        </span>
        {row.sparkline ? <Sparkline data={row.sparkline} width={72} height={28} className="hidden shrink-0 sm:block" /> : null}
        <span className="flex shrink-0 flex-col items-end gap-0.5 pr-1 text-right font-medium tabular-nums">
          {shown == null ? (
            <span className="text-sm whitespace-nowrap text-fg-muted">{noPrice}</span>
          ) : (
            <>
              <span className="flex items-baseline gap-1">
                <FlashPrice value={shown} currency={currency} size="sm" className="-mr-1" />
                {currency === "CLP" ? (
                  <span className="text-[11px] leading-none font-medium text-fg-muted">CLP</span>
                ) : null}
              </span>
              {row.change24hPct == null ? (
                <span className="text-xs whitespace-nowrap text-fg-muted">{noChange}</span>
              ) : (
                <ChangeBadge value={row.change24hPct} />
              )}
            </>
          )}
        </span>
      </Link>
      <div className="flex shrink-0 items-center gap-1 pr-1">
        <span className="hidden sm:inline-flex">
          <AlertButton symbol={row.symbol} name={row.name} priceUsd={row.priceUsd} iconOnly />
        </span>
        <FavoriteButton pressed label={favoriteLabel} onToggle={onToggle} />
      </div>
    </div>
  );
}

/** Ilustración del estado vacío de favoritas: una estrella con el mismo trazo del design system. */
function FavoritesEmptyArt() {
  return (
    <svg viewBox="0 0 80 64" className="size-16 text-fg-muted" fill="none" aria-hidden>
      <path
        d="M40 12 44.1 22.3 55.2 23.1 46.7 30.2 49.4 40.9 40 35 30.6 40.9 33.3 30.2 24.8 23.1 35.9 22.3Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="63" cy="16" r="3" className="fill-brand" />
    </svg>
  );
}

function ListSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="flex flex-col gap-1.5">
      <span className="sr-only">{label}</span>
      {["a", "b", "c", "d"].map((key) => (
        // Se conserva la clase histórica del placeholder y se limita a una
        // fila (h-16) para que no quede un hueco de dos líneas.
        <Skeleton key={key} className="h-[6.75rem] w-full rounded-2xl sm:h-14 max-h-16" />
      ))}
    </div>
  );
}
