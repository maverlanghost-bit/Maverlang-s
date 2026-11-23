"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQueries } from "@tanstack/react-query";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { IconButton } from "@/components/ui/icon-button";
import { AlertButton } from "@/components/domain/alert-button";
import { AlertsPanel } from "@/components/domain/alert-panel";
import { ChangeBadge } from "@/components/domain/change-badge";
import { FavoriteButton } from "@/components/domain/favorite-button";
import { FlashPrice } from "@/components/domain/flash-price";
import { Sparkline } from "@/components/domain/sparkline";
import { TickerLogo } from "@/components/domain/ticker-logo";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { alertasText, fillAlert } from "@/content/i18n/extra-alertas";
import { cn } from "@/lib/cn";
import { getPrices } from "@/lib/api/client";
import { isCatalogSymbol } from "@/lib/catalog/symbol";
import { useFavorites, useSyncFavorites } from "@/lib/hooks/use-favorites";
import { PRICE_MS, priceQueryKey, useFx, useHistories } from "@/lib/hooks/queries";
import { useT } from "@/lib/hooks/use-t";
import { isRealSparkHistory, downsample, displayPrice } from "@/lib/market/browse";
import { chunkSymbols, sortFavoriteRows, uniqueSymbols } from "@/lib/services/alerts-logic";
import type { Quote } from "@/lib/types";
import { useFavoriteCatalog } from "./use-favorite-catalog";

function tickerHref(symbol: string) {
  return `/app/accion/${encodeURIComponent(symbol)}`;
}

type Sort = "up" | "down" | "name";

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
  const [sort, setSort] = useState<Sort>("up");
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
    if (sort === "down") {
      const sorted = sortFavoriteRows(built, "change");
      const withChange = sorted.filter((row) => row.change24hPct != null).reverse();
      return [...withChange, ...sorted.filter((row) => row.change24hPct == null)];
    }
    return sortFavoriteRows(built, sort === "name" ? "name" : "change");
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

  const ready = !pendingFavorites && !searching && !searchFailed;
  const pricesPending = priceQueries.some((query) => query.isPending);
  const en = language === "en";
  const known = rows.filter((row) => row.change24hPct != null);
  const upCount = known.filter((row) => (row.change24hPct ?? 0) > 0).length;
  const downCount = known.filter((row) => (row.change24hPct ?? 0) < 0).length;
  const sortOptions: { value: Sort; label: string }[] = [
    { value: "up", label: en ? "Top gainers" : "Mayor alza" },
    { value: "down", label: en ? "Top losers" : "Mayor baja" },
    { value: "name", label: "A–Z" },
  ];
  const demoPrices = [...quotes.values()].some((quote) => quote.source === "mock");
  const referencePrices = [...quotes.values()].some((quote) => quote.reference);
  const footnote = [
    shownCurrency === "CLP" ? (en ? "CLP at the current reference FX" : "CLP al dólar de referencia actual") : null,
    demoPrices ? (en ? "Demo prices" : "Precios demo") : null,
    referencePrices ? (en ? "Includes reference prices" : "Incluye precios de referencia") : null,
  ].filter(Boolean);

  return (
    <div className="flex min-w-0 flex-col gap-5 sm:gap-6">
      <header className="flex min-w-0 flex-col gap-1">
        <h1 className="flex items-baseline gap-2 text-2xl leading-tight font-semibold tracking-tight text-fg sm:text-3xl">
          {copy.pageTitle}
          {ready && rows.length > 0 ? (
            <span className="num text-base font-medium text-fg-muted sm:text-lg">{rows.length}</span>
          ) : null}
        </h1>
        {ready && rows.length > 0 ? (
          <p className="text-sm leading-5 text-fg-muted">
            {known.length === 0
              ? en
                ? "Waiting for today's prices."
                : "Esperando los precios de hoy."
              : en
                ? `Today: ${upCount} up, ${downCount} down.`
                : `Hoy: ${upCount} ${upCount === 1 ? "sube" : "suben"}, ${downCount} ${downCount === 1 ? "baja" : "bajan"}.`}
          </p>
        ) : null}
      </header>
      {priceQueries.some((query) => query.isError) ? (
        <ErrorState
          title={en ? "Some prices could not be refreshed" : "No se pudieron actualizar algunos precios"}
          onRetry={retry}
          retryLabel={copy.retry}
        />
      ) : null}
      {ready && rows.length > 1 ? (
        <div role="group" aria-label={copy.sortLabel} className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {sortOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={sort === option.value}
              onClick={() => setSort(option.value)}
              className={cn(
                "inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-[13px] font-medium transition-colors duration-150 motion-reduce:transition-none sm:min-h-9",
                sort === option.value
                  ? "border-fg bg-fg text-bg"
                  : "border-border bg-bg text-fg-muted hover:border-fg-muted hover:text-fg",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
      {pendingFavorites || searching ? <ListSkeleton label={copy.loading} /> : null}
      {!pendingFavorites && searchFailed ? (
        <ErrorState title={copy.listError} onRetry={retry} retryLabel={copy.retry} label={copy.listError} />
      ) : null}
      {ready && favoriteSymbols.length === 0 ? (
        <div className="rounded-3xl border border-border bg-bg px-5 py-10 sm:py-14">
          <EmptyState
            className="py-0 sm:py-0"
            media={<FavoritesEmptyArt />}
            title={copy.emptyTitle}
            description={emptyCopy.body}
            action={
              <div className="flex w-full flex-col items-center gap-5">
                <ol className="mx-auto flex w-full max-w-xs flex-col gap-2 text-left text-sm leading-relaxed text-fg-muted">
                  {emptyCopy.steps.map((step, index) => (
                    <li key={step} className="flex items-start gap-2.5">
                      <span
                        className="num mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[11px] font-medium text-fg"
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
        </div>
      ) : null}
      {ready && rows.length > 0 ? (
        <ul className="flex min-w-0 flex-col divide-y divide-border overflow-hidden rounded-3xl border border-border bg-bg">
          {rows.map((row) => {
            const shown =
              row.priceUsd != null ? displayPrice(row.priceUsd, shownCurrency, fxKnown ? rate : undefined) : null;
            return (
              <li key={row.symbol}>
                <FavoriteRow
                  row={row}
                  shown={shown}
                  pending={pricesPending}
                  currency={shownCurrency}
                  noPrice={copy.noPrice}
                  noChange={copy.noChange}
                  lowLiquidityLabel={row.lowLiquidity ? t.market.lowLiquidity : null}
                  reviewLabel={row.underReview ? t.market.underReview : null}
                  favoriteLabel={fillAlert(t.market.favoriteOn, { name: row.name })}
                  onToggle={() => toggle(storedSymbolByKey.get(row.symbol.toLowerCase()) ?? row.symbol)}
                />
              </li>
            );
          })}
        </ul>
      ) : null}
      {ready && currency === "CLP" && !fxKnown && !fx.isPending && favoriteSymbols.length > 0 ? (
        <p className="text-[13px] leading-5 text-fg-muted">{t.detail.fxFallback}</p>
      ) : null}
      {ready && rows.length > 0 && footnote.length > 0 ? (
        <p className="text-xs leading-5 text-fg-muted">{footnote.join(" · ")}</p>
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
  favoriteLabel: string;
  onToggle: () => void;
}) {
  const { language } = useT();
  const en = language === "en";
  const peer = row.symbol.toLowerCase() === "spyx" ? "QQQx" : "SPYx";
  const spark = row.sparkline;
  return (
    <div className="flex min-w-0 items-center pr-1 transition-colors duration-150 hover:bg-surface-1/70 motion-reduce:transition-none sm:pr-2">
      <Link href={tickerHref(row.symbol)} className="flex min-h-[72px] min-w-0 flex-1 items-center gap-3 py-3 pl-4 sm:gap-4 sm:pl-5">
        <TickerLogo symbol={row.symbol} name={row.name} logoUrl={row.logoUrl} size={40} decorative loading="lazy" sizes="40px" />
        <span className="min-w-0 flex-1">
          <span className="block font-mono text-sm leading-5 font-semibold tracking-tight text-fg">{row.symbol}</span>
          <span className="block text-[13px] leading-4 break-words text-fg-muted">
            {row.name}
            {lowLiquidityLabel ? <span className="whitespace-nowrap"> · {lowLiquidityLabel}</span> : null}
            {reviewLabel ? <span className="whitespace-nowrap text-warn"> · {reviewLabel}</span> : null}
          </span>
        </span>
        {spark ? (
          <span className="shrink-0" title={en ? "1 week" : "1 semana"}>
            <Sparkline data={spark} change={(spark.at(-1) ?? 0) - (spark[0] ?? 0)} width={56} height={28} />
            <span className="sr-only">{en ? "1 week trend" : "Tendencia de 1 semana"}</span>
          </span>
        ) : null}
        <span className="flex min-w-[76px] shrink-0 flex-col items-end gap-1 text-right">
          {shown === null ? (
            pending ? (
              <>
                <span aria-hidden className="block h-5 w-16 rounded-sm bg-surface-2" />
                <span aria-hidden className="block h-4 w-12 rounded-full bg-surface-2" />
              </>
            ) : (
              <span className="text-[13px] leading-5 whitespace-nowrap text-fg-muted">{noPrice}</span>
            )
          ) : (
            <>
              <FlashPrice value={shown} currency={currency} size="sm" className="font-medium" />
              {row.change24hPct === null ? (
                <span className="text-xs leading-4 text-fg-muted">
                  <span aria-hidden>—</span>
                  <span className="sr-only">{noChange}</span>
                </span>
              ) : (
                <ChangeBadge value={row.change24hPct} size="sm" />
              )}
            </>
          )}
        </span>
      </Link>
      <div className="flex shrink-0 items-center">
        <FavoriteButton pressed label={favoriteLabel} onToggle={onToggle} />
        <span className="hidden sm:inline-flex">
          <AlertButton symbol={row.symbol} name={row.name} priceUsd={row.priceUsd} iconOnly />
        </span>
        <span className="hidden sm:inline-flex">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton label={`${en ? "Favorite options" : "Opciones de favorita"}: ${row.name}`}>
                <span aria-hidden className="text-lg">⋯</span>
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={tickerHref(row.symbol)}>{en ? "Open stock" : "Abrir ficha"}</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/app/comparar?activos=${encodeURIComponent([row.symbol, peer].join(","))}`}>
                  {en ? "Compare" : "Comparar"}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onToggle}>{en ? "Remove favorite" : "Quitar favorita"}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </span>
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
    <div role="status" aria-live="polite" aria-busy="true" className="flex flex-col">
      <span className="sr-only">{label}</span>
      <div className="flex flex-col divide-y divide-border overflow-hidden rounded-3xl border border-border bg-bg" aria-hidden>
        {["a", "b", "c", "d"].map((key) => (
          <div key={key} className="flex min-h-[72px] items-center gap-3 py-3 pr-4 pl-4 sm:gap-4 sm:pl-5">
            <Skeleton className="size-10 shrink-0 rounded-full" />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-3 w-32 max-w-full" />
            </div>
            <Skeleton className="h-7 w-14 shrink-0" />
            <div className="flex min-w-[76px] shrink-0 flex-col items-end gap-1.5">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-5 w-12 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
