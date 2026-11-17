"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQueries } from "@tanstack/react-query";

import { AssetMarketRow } from "@/components/market/asset-row";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { IconButton } from "@/components/ui/icon-button";
import { AlertButton } from "@/components/domain/alert-button";
import { AlertsPanel } from "@/components/domain/alert-panel";
import { PriceFreshness } from "@/components/domain/price-freshness";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import { alertasText, fillAlert } from "@/content/i18n/extra-alertas";
import { getPrices } from "@/lib/api/client";
import { isCatalogSymbol } from "@/lib/catalog/symbol";
import { useFavorites, useSyncFavorites } from "@/lib/hooks/use-favorites";
import { PRICE_MS, priceQueryKey, useFx, useHistories } from "@/lib/hooks/queries";
import { useT } from "@/lib/hooks/use-t";
import { isRealSparkHistory, downsample, displayPrice } from "@/lib/market/browse";
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
        favoriteSymbols.filter((symbol) => isCatalogSymbol(symbol.toLowerCase())).map((symbol) => symbol.toLowerCase()),
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
    const times = [...quotes.values()].map((quote) => Date.parse(quote.updatedAt)).filter(Number.isFinite);
    return times.length ? Math.min(...times) : null;
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
      map.set(symbol.toLowerCase(), downsample(points.map((point) => point.p)));
    });
    return map;
  }, [sparkSymbols, histories]);

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
      <h1 className="sr-only">{copy.pageTitle}</h1>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-muted"><span>{shownCurrency}{shownCurrency === "CLP" ? (language === "en" ? " · current reference FX" : " · dólar de referencia actual") : ""}</span><PriceFreshness at={freshestAt} stale={anyStale} />{freshestAt ? <span>{language === "en" ? "Oldest observation in the batch" : "Observación más antigua del lote"}</span> : null}{[...quotes.values()].some((quote) => quote.source === "mock") ? <span>{language === "en" ? "Demo prices" : "Precios demo"}</span> : null}{[...quotes.values()].some((quote) => quote.reference) ? <span>{language === "en" ? "Includes reference prices" : "Incluye precios de referencia"}</span> : null}</div>
      {priceQueries.some((query) => query.isError) ? <ErrorState title={language === "en" ? "Some prices could not be refreshed" : "No se pudieron actualizar algunos precios"} onRetry={retry} retryLabel={copy.retry} /> : null}
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
        <p className="text-[13px] leading-5 text-fg-muted">{t.detail.fxFallback}</p>
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
      {!pendingFavorites && !searching && rows.length > 0 ? (
        <div className="flex min-w-0 flex-col">
          <div
            aria-hidden
            className="hidden items-center justify-end border-b border-border pb-2 pr-[5.75rem] sm:flex"
          >
            <span className="label-xs">Precio / Var. 24 h</span>
          </div>
          <ul className="flex min-w-0 flex-col divide-y divide-border">
            {rows.map((row) => {
              const shown =
                row.priceUsd != null ? displayPrice(row.priceUsd, shownCurrency, fxKnown ? rate : undefined) : null;
              return (
                <li key={row.symbol}>
                  <FavoriteRow
                    row={row}
                    shown={shown}
                    pending={priceQueries.some((query) => query.isPending)}
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
        </div>
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
  pending = false,
}: {
  pending?: boolean;
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
  const { language } = useT();
  const en = language === "en";
  const peer = row.symbol.toLowerCase() === "spyx" ? "QQQx" : "SPYx";
  return <div className="flex min-w-0 items-center">
    <div className="min-w-0 flex-1"><AssetMarketRow href={tickerHref(row.symbol)} symbol={row.symbol} name={row.name} logoUrl={row.logoUrl} price={shown} currency={currency} change={row.change24hPct} pricePending={pending} sparkline={row.sparkline} trendLabel={en ? "1 week · source in stock details" : "1 semana · fuente en la ficha"} lowLiquidityLabel={lowLiquidityLabel} reviewLabel={reviewLabel} reviewHint={reviewHint} favoritePressed favoriteLabel={favoriteLabel} onToggleFavorite={() => onToggle()} hideFavorite noPriceLabel={noPrice} unavailableLabel={noChange} /></div>
    <div className="flex shrink-0 items-center"><span className="hidden sm:inline-flex"><AlertButton symbol={row.symbol} name={row.name} priceUsd={row.priceUsd} iconOnly /></span><DropdownMenu><DropdownMenuTrigger asChild><IconButton label={`${en ? "Favorite options" : "Opciones de favorita"}: ${row.name}`}><span aria-hidden className="text-lg">⋯</span></IconButton></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem asChild><Link href={tickerHref(row.symbol)}>{en ? "Open stock" : "Abrir ficha"}</Link></DropdownMenuItem><DropdownMenuItem asChild><Link href={`/app/comparar?activos=${encodeURIComponent([row.symbol, peer].join(","))}`}>{en ? "Compare" : "Comparar"}</Link></DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem onSelect={onToggle}>{en ? "Remove favorite" : "Quitar favorita"}</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div>
  </div>;
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
    <div role="status" aria-live="polite" aria-busy="true" className="flex flex-col">
      <span className="sr-only">{label}</span>
      <div className="flex flex-col divide-y divide-border" aria-hidden>
        {["a", "b", "c", "d"].map((key) => (
          // Misma retícula que la fila real: logo, símbolo + nombre, precio y estrella.
          <div key={key} className="flex min-h-16 items-center gap-3 px-1 py-2 sm:gap-4">
            <Skeleton className="size-9 shrink-0 rounded-full" />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-3 w-32 max-w-full" />
            </div>
            <Skeleton className="hidden h-7 w-[72px] shrink-0 sm:block" />
            <div className="flex shrink-0 flex-col items-end gap-1">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-5 w-12 rounded-full" />
            </div>
            <div className="flex size-11 shrink-0 items-center justify-center">
              <Skeleton className="size-4 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
