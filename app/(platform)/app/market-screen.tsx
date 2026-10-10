"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQueries } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";

import { FavoriteButton } from "@/components/domain/favorite-button";
import { MarketStatusPill } from "@/components/domain/market-status-pill";
import { PriceFreshness } from "@/components/domain/price-freshness";
import { TickerCard } from "@/components/domain/ticker-card";
import { TickerRow } from "@/components/domain/ticker-row";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { indexFromKey } from "@/components/ui/keys";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { getPrices, searchMarket, type MarketSearchItem } from "@/lib/api/client";
import { useFavorites, useSyncFavorites } from "@/lib/hooks/use-favorites";
import { useFx, useHistories, useMarketStatus } from "@/lib/hooks/queries";
import { useT } from "@/lib/hooks/use-t";
import {
  displayPrice,
  downsample,
  parseFilter,
  parseSort,
  type MarketFilter,
  type MarketSort,
} from "@/lib/market/browse";
import { anchorSeriesToSpot } from "@/lib/market/series";
import type { Currency, Quote } from "@/lib/types";

const PAGE_SIZE = 20;
const SEARCH_STALE_MS = 30_000;
const PRICE_MS = 15_000;

function canonicalSearch(search: string): string {
  const params = new URLSearchParams(search);
  return [...params.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

function withMarketParams(params: URLSearchParams, filter: MarketFilter, sort: MarketSort) {
  params.delete("q");
  if (filter === "all") params.delete("filtro");
  else params.set("filtro", filter);
  if (sort === "popular") params.delete("orden");
  else params.set("orden", sort);
}

function tickerHref(symbol: string) {
  return `/app/accion/${encodeURIComponent(symbol)}`;
}

function withName(template: string, name: string) {
  return template.replace("{name}", name);
}

type MarketRow = {
  item: MarketSearchItem;
  quote: Quote | null;
  /** Posición acumulada (orden Popular del servidor). */
  index: number;
};

type PricedItem = MarketRow & { quote: Quote };

function priceRows(items: readonly PricedItem[], currency: Currency, rate: number | undefined) {
  const fxKnown = typeof rate === "number" && Number.isFinite(rate) && rate > 0;
  const shown: Currency = currency === "CLP" && fxKnown ? "CLP" : "USD";
  const out: { entry: PricedItem; price: number; currency: Currency }[] = [];
  for (const entry of items) {
    const price = displayPrice(entry.quote.priceUsd, shown, fxKnown ? rate : undefined);
    if (price !== null) out.push({ entry, price, currency: shown });
  }
  return out;
}

function changeOf(entry: PricedItem): number {
  return Number.isFinite(entry.quote.change24hPct) ? entry.quote.change24hPct : 0;
}

function orderPriced(rows: readonly PricedItem[], sort: MarketSort): PricedItem[] {
  if (sort !== "gain" && sort !== "loss") return [...rows];
  return [...rows].sort((a, b) => {
    const delta = changeOf(a) - changeOf(b);
    const directed = sort === "gain" ? -delta : delta;
    return directed || a.index - b.index;
  });
}

/** Mayor alza o baja espera a tener todos los precios, para no reordenar la lista a medias. */
function orderRows(rows: readonly MarketRow[], sort: MarketSort): MarketRow[] {
  if (sort !== "gain" && sort !== "loss") return [...rows];
  if (rows.some((row) => row.quote === null)) return [...rows];
  return orderPriced(rows as PricedItem[], sort);
}

/** Top por |variación| sobre filas ya cotizadas. Criterio objetivo: no es una selección editorial. */
function moversOfPriced(rows: readonly PricedItem[], limit = 3): PricedItem[] {
  return [...rows]
    .sort((a, b) => Math.abs(changeOf(b)) - Math.abs(changeOf(a)) || a.index - b.index)
    .slice(0, limit);
}

function ChipGroup<T extends string>({
  labelId,
  value,
  options,
  onChange,
  bare = false,
}: {
  labelId: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  /** N19: sin scroll propio, para vivir dentro de una tira combinada. */
  bare?: boolean;
}) {
  const baseId = useId();

  function move(current: string, key: string) {
    const index = Math.max(0, options.findIndex((option) => option.value === current));
    const nextIndex = indexFromKey(key, index, options.length);
    if (nextIndex === null) return;
    const option = options[nextIndex];
    if (!option) return;
    onChange(option.value);
    document.getElementById(`${baseId}-${option.value}`)?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-labelledby={labelId}
      className={bare ? "flex shrink-0 items-center gap-2 py-1" : "flex min-w-0 gap-2 overflow-x-auto p-1"}
      onKeyDown={(event) => {
        if (indexFromKey(event.key, 0, options.length) === null) return;
        event.preventDefault();
        move(value, event.key);
      }}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            id={`${baseId}-${option.value}`}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={cn(
              "h-11 shrink-0 rounded-full px-3 text-sm outline-none transition duration-[140ms] ease-spring focus-visible:ring-4 focus-visible:ring-fg/20 active:scale-[0.98]",
              selected ? "bg-surface-3 text-fg" : "bg-surface-2 text-fg-muted hover:text-fg",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function ResultsSkeleton({ label }: { label: string }) {
  // Placeholder estático (sin pulso): misma caja que la lista, primer pintado
  // más barato y sin saltos cuando llega el catálogo.
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="flex flex-col gap-6">
      <span className="sr-only">{label}</span>
      <div className="flex gap-3 overflow-hidden" aria-hidden>
        <div className="h-28 w-60 shrink-0 rounded-3xl bg-surface-2" />
        <div className="h-28 w-60 shrink-0 rounded-3xl bg-surface-2" />
        <div className="h-28 w-60 shrink-0 rounded-3xl bg-surface-2" />
      </div>
      <div className="flex flex-col gap-2" aria-hidden>
        {["a", "b", "c", "d", "e", "f"].map((key) => (
          <div key={key} className="min-h-14 w-full rounded-xl bg-surface-2" />
        ))}
      </div>
    </div>
  );
}

export function MarketScreen({
  initialFilter,
  initialSort,
}: {
  initialFilter: string;
  initialSort: string;
}) {
  const { t, currency } = useT();
  const router = useRouter();
  const pathname = usePathname();
  const filtersLabelId = useId();
  const sortLabelId = useId();
  const filterSortLabelId = useId();
  const moversTitleId = useId();

  const [filter, setFilter] = useState<MarketFilter>(() => parseFilter(initialFilter));
  // N19: sin A–Z en la UI; una URL vieja con `orden=az` cae a Popular.
  const [sort, setSort] = useState<MarketSort>(() => {
    const parsed = parseSort(initialSort);
    return parsed === "az" ? "popular" : parsed;
  });
  const [page, setPage] = useState(1);

  // Favoritas vive en este navegador: el servidor devuelve todo y se filtra aquí.
  const serverCategory = filter === "favorites" ? "all" : filter;
  const serverSort = "liquidity";

  // Una consulta del servidor por página cargada. Al cambiar el criterio, la página vuelve a 1.
  const searchQueries = useQueries({
    queries: Array.from({ length: page }, (_, index) => {
      const pageNum = index + 1;
      return {
        queryKey: ["market-search", "", serverCategory, pageNum, PAGE_SIZE, serverSort] as const,
        queryFn: () =>
          searchMarket({
            q: "",
            category: serverCategory,
            page: pageNum,
            pageSize: PAGE_SIZE,
            sort: serverSort,
          }),
        staleTime: SEARCH_STALE_MS,
      };
    }),
  });
  const fx = useFx();
  const status = useMarketStatus();
  const { symbols: favorites, toggle } = useFavorites();
  useSyncFavorites();

  const items: MarketSearchItem[] = (() => {
    const seen = new Set<string>();
    const out: MarketSearchItem[] = [];
    for (const query of searchQueries) {
      for (const item of query.data?.items ?? []) {
        if (seen.has(item.symbol)) continue;
        seen.add(item.symbol);
        out.push(item);
      }
    }
    return out;
  })();

  // Precios y sparklines sólo de las filas cargadas: una llamada de precios por página.
  const symbolsByPage = searchQueries.map((query) => (query.data?.items ?? []).map((item) => item.symbol));
  const priceQueries = useQueries({
    queries: symbolsByPage.map((symbols) => ({
      queryKey: ["prices", [...symbols].sort()] as const,
      queryFn: () => getPrices(symbols),
      enabled: symbols.length > 0,
      staleTime: PRICE_MS,
      refetchInterval: PRICE_MS,
      // Sin refetch al volver a la pestaña: el intervalo de 15 s ya mantiene
      // la lista viva y se evita una ráfaga de llamadas al enfocar.
      refetchOnWindowFocus: false,
      refetchIntervalInBackground: false,
      // Mientras revalida, se siguen viendo los últimos precios en vez de
      // volver al placeholder vacío.
      placeholderData: (previous: Quote[] | undefined) => previous,
    })),
  });
  const quotesBySymbol = (() => {
    const map = new Map<string, Quote>();
    for (const query of priceQueries) {
      for (const quote of query.data ?? []) map.set(quote.symbol, quote);
    }
    return map;
  })();
  /** Un solo indicador para la lista (M41): el `updatedAt` más reciente. */
  const freshestAt = (() => {
    let max: number | null = null;
    for (const quote of quotesBySymbol.values()) {
      const ms = Date.parse(quote.updatedAt);
      if (Number.isFinite(ms) && (max === null || ms > max)) max = ms;
    }
    if (max !== null) return max;
    for (const query of priceQueries) {
      const at = query.dataUpdatedAt;
      if (typeof at === "number" && Number.isFinite(at) && at > 0 && (max === null || at > max)) max = at;
    }
    return max;
  })();
  const anyStale = (() => {
    for (const quote of quotesBySymbol.values()) {
      if (quote.stale === true) return true;
    }
    return false;
  })();

  // El gráfico de cada fila pide otro precio. Se pide cuando el lote de la
  // página ya volvió, para no frenar la lista con veinte consultas a la vez.
  const sparkSymbols = symbolsByPage.flatMap((symbols, index) => {
    const query = priceQueries[index];
    if (!query || query.isPending) return [];
    return symbols;
  });
  const histories = useHistories(sparkSymbols);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    withMarketParams(params, filter, sort);
    const searchText = params.toString();
    if (canonicalSearch(window.location.search) === canonicalSearch(searchText ? `?${searchText}` : "")) return;
    router.replace(searchText ? `${pathname}?${searchText}` : pathname, { scroll: false });
  }, [filter, pathname, router, sort]);

  useEffect(() => {
    const onPop = () => {
      const params = new URLSearchParams(window.location.search);
      setFilter(parseFilter(params.get("filtro")));
      const parsed = parseSort(params.get("orden"));
      setSort(parsed === "az" ? "popular" : parsed);
      setPage(1);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const favoriteSet = useMemo(() => new Set(favorites ?? []), [favorites]);
  const shown = useMemo(() => {
    const rows: MarketRow[] = [];
    items.forEach((item, index) => {
      if (filter === "favorites" && !favoriteSet.has(item.symbol)) return;
      rows.push({ item, quote: quotesBySymbol.get(item.symbol) ?? null, index });
    });
    return rows;
  }, [favoriteSet, filter, items, quotesBySymbol]);
  const ordered = useMemo(() => orderRows(shown, sort), [shown, sort]);
  const moverSource = useMemo(
    () => moversOfPriced(shown.filter((row): row is PricedItem => row.quote !== null)),
    [shown],
  );

  const sparkBySymbol = useMemo(() => {
    const map = new Map<string, number[]>();
    sparkSymbols.forEach((symbol, index) => {
      const points = histories[index]?.data;
      if (!points || points.length < 2) return;
      const spot = quotesBySymbol.get(symbol)?.priceUsd;
      const series = spot !== undefined && spot > 0 ? anchorSeriesToSpot(points, spot) : points;
      map.set(symbol, downsample(series.map((point) => point.p)));
    });
    return map;
  }, [sparkSymbols, histories, quotesBySymbol]);

  const favoritesPending = filter === "favorites" && favorites === null;
  const rate = fx.data?.rate;
  const fxKnown = typeof rate === "number" && Number.isFinite(rate) && rate > 0;
  const firstQuery = searchQueries[0];
  const firstPrices = priceQueries[0];
  const quotesFailed = items.length > 0 && quotesBySymbol.size === 0 && (firstPrices?.isError ?? false);
  const failed = (firstQuery?.isError ?? false) && items.length === 0;
  const waiting = !failed && (favoritesPending || (items.length === 0 && (firstQuery?.isPending ?? true)));
  const pageFailed = !failed && items.length > 0 && searchQueries.some((query) => query.isError);
  const loadingMore = searchQueries.some((query) => !query.data && query.isFetching);
  const moverItems = waiting || failed ? [] : priceRows(moverSource, currency, rate);
  const listRows = waiting || failed ? [] : ordered;
  const failure = searchQueries.find((query) => query.error)?.error ?? firstPrices?.error;
  const failureDetail = failure instanceof Error && failure.message.trim() ? failure.message : undefined;
  const lastWithData = [...searchQueries].reverse().find((query) => query.data);
  const total = lastWithData?.data?.total ?? 0;
  const hasMore = lastWithData?.data?.hasMore ?? false;

  const filterOptions: { value: MarketFilter; label: string }[] = [
    { value: "all", label: t.market.all },
    { value: "tech", label: t.market.tech },
    { value: "etf", label: t.market.etf },
    { value: "fintech", label: t.market.fintech },
    { value: "consumer", label: t.market.consumer },
    { value: "finance", label: t.market.finance },
    { value: "health", label: t.market.health },
    { value: "energy", label: t.market.energy },
    { value: "industrial", label: t.market.industrial },
    { value: "commodity", label: t.market.commodity },
    { value: "other", label: t.market.other },
    { value: "favorites", label: t.market.favorites },
  ];
  const sortOptions: { value: MarketSort; label: string }[] = [
    { value: "popular", label: t.market.popular },
    { value: "gain", label: t.market.gain },
    { value: "loss", label: t.market.loss },
  ];

  /** Punto de estado por fila desde el catálogo (M39): sin pedir la API por fila. */
  function dotFor(item: MarketSearchItem): { kind: "open" | "closed" | "halted"; label: string } | null {
    if (item.halted) return { kind: "halted", label: t.market.dotHalted };
    const period = (item.period ?? "").toLowerCase();
    const openNow = item.openNow;
    if (openNow === true && (period === "" || period === "market" || period === "extended" || period === "overnight")) {
      return { kind: "open", label: t.market.dotOpen };
    }
    if (openNow === false || period === "closed") return { kind: "closed", label: t.market.dotClosed };
    if (period === "market" || period === "extended" || period === "overnight") {
      return { kind: "open", label: t.market.dotOpen };
    }
    return null;
  }

  function onFilterChange(value: MarketFilter) {
    setFilter(value);
    setPage(1);
  }

  function onSortChange(value: MarketSort) {
    setSort(value);
    setPage(1);
  }

  function retry() {
    for (const query of searchQueries) void query.refetch();
    for (const query of priceQueries) void query.refetch();
    void status.refetch();
    if (currency === "CLP") void fx.refetch();
  }

  let statusNode = <Skeleton className="h-6 w-40 rounded-full" />;
  if (status.data) {
    statusNode = (
      <MarketStatusPill
        open={status.data.session === "regular"}
        label={
          status.data.session === "closed"
            ? t.market.closed
            : status.data.session === "offHours"
              ? t.market.offHours
              : t.market.open
        }
      />
    );
  } else if (status.isError) {
    statusNode = (
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-fg-muted">{t.market.statusError}</p>
        <Button variant="secondary" onClick={() => void status.refetch()}>
          {t.states.retry}
        </Button>
      </div>
    );
  }

  const emptyTitle = `${t.market.emptyFor} «${t.market[filter]}»`;
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      className="flex min-w-0 flex-col gap-6"
      initial={reduceMotion ? false : { opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={reduceMotion ? { duration: 0 } : { duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
    >
      <PageHeader title={t.pages.market.title} description={t.pages.market.lead} action={statusNode} />
      {currency === "CLP" && !fxKnown && !fx.isPending && !waiting && !failed ? (
        <p className="text-sm text-fg-muted">{t.detail.fxFallback}</p>
      ) : null}

      {/* N19: ordenar + filtrar en una sola tira con fundido (sin scrollbar). */}
      <div className="flex min-w-0 flex-col gap-2">
        <p id={filterSortLabelId} className="label">
          {t.market.filterSortLabel}
        </p>
        <div className="no-scrollbar -mx-1 flex min-w-0 items-center gap-1 overflow-x-auto px-1 [mask-image:linear-gradient(to_right,black_calc(100%-2rem),transparent)]">
          <ChipGroup bare labelId={sortLabelId} value={sort} options={sortOptions} onChange={onSortChange} />
          <span aria-hidden className="h-6 w-px shrink-0 bg-border" />
          <ChipGroup bare labelId={filtersLabelId} value={filter} options={filterOptions} onChange={onFilterChange} />
        </div>
        <p id={sortLabelId} className="sr-only">
          {t.market.sortLabel}
        </p>
        <p id={filtersLabelId} className="sr-only">
          {t.market.filtersLabel}
        </p>
      </div>

      {waiting ? <ResultsSkeleton label={t.states.loading} /> : null}
      {!waiting && failed ? (
        <ErrorState
          title={t.market.loadError}
          description={failureDetail && failureDetail !== t.market.loadError ? failureDetail : undefined}
          onRetry={retry}
          retryLabel={t.states.retry}
          label={t.states.error}
        />
      ) : null}
      {!waiting && !failed && moverItems.length > 0 ? (
        <section className="order-2 flex min-w-0 flex-col gap-2 lg:order-1" aria-labelledby={moversTitleId}>
          <div>
            <h2 id={moversTitleId} className="text-base font-medium text-fg">
              {t.market.movers}
            </h2>
            <p className="mt-1 text-sm text-fg-muted">{t.market.moversNote}</p>
          </div>
          <div className="flex min-w-0 snap-x snap-mandatory gap-3 overflow-x-auto p-1">
            {moverItems.map(({ entry, price, currency: rowCurrency }) => (
              <TickerCard
                key={entry.item.symbol}
                href={tickerHref(entry.item.symbol)}
                symbol={entry.item.symbol}
                name={entry.item.name}
                logoUrl={entry.item.logoUrl}
                price={price}
                currency={rowCurrency}
                change={entry.quote.change24hPct}
                lowLiquidityLabel={entry.item.lowLiquidity ? t.market.lowLiquidity : null}
                action={
                  <FavoriteButton
                    pressed={favoriteSet.has(entry.item.symbol)}
                    label={withName(
                      favoriteSet.has(entry.item.symbol) ? t.market.favoriteOn : t.market.favoriteOff,
                      entry.item.name,
                    )}
                    onToggle={() => toggle(entry.item.symbol)}
                  />
                }
              />
            ))}
          </div>
        </section>
      ) : null}
      {!waiting && !failed && listRows.length > 0 ? (
        <section className="order-1 flex min-w-0 flex-col gap-2 lg:order-2">
          <h2 className="text-base font-medium text-fg">{t.market.list}</h2>
          {total > 0 ? (
            <p className="text-sm text-fg-muted">
              {t.market.stockCount.replace("{total}", String(total))}
            </p>
          ) : null}
          <PriceFreshness at={freshestAt} stale={anyStale} delayedOnly />
          {quotesFailed ? (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm text-fg-muted">{t.market.loadError}</p>
              <Button variant="secondary" onClick={retry}>
                {t.states.retry}
              </Button>
            </div>
          ) : null}
          <ul className="flex min-w-0 flex-col gap-1">
            {listRows.map((entry) => {
              const shownPrice = entry.quote
                ? priceRows([{ item: entry.item, quote: entry.quote, index: entry.index }], currency, rate)[0]
                : undefined;
              return (
                <li key={entry.item.symbol}>
                <TickerRow
                  href={tickerHref(entry.item.symbol)}
                  symbol={entry.item.symbol}
                  name={entry.item.name}
                  logoUrl={entry.item.logoUrl}
                  price={shownPrice?.price ?? 0}
                  currency={shownPrice?.currency ?? "USD"}
                  change={entry.quote?.change24hPct ?? 0}
                  sparkline={sparkBySymbol.get(entry.item.symbol)}
                  sparklineClassName="block"
                  lowLiquidityLabel={entry.item.lowLiquidity ? t.market.lowLiquidity : null}
                  reviewLabel={entry.item.underReview ? t.market.underReview : null}
                  reviewHint={entry.item.underReview ? t.market.underReviewHint : null}
                  statusDot={dotFor(entry.item)}
                  priceSlot={
                    shownPrice ? null : (
                      <span className="block h-8 w-16 shrink-0 rounded-md bg-surface-2" aria-hidden />
                    )
                  }
                  action={
                    <FavoriteButton
                      pressed={favoriteSet.has(entry.item.symbol)}
                      label={withName(
                        favoriteSet.has(entry.item.symbol) ? t.market.favoriteOn : t.market.favoriteOff,
                        entry.item.name,
                      )}
                      onToggle={() => toggle(entry.item.symbol)}
                    />
                  }
                />
                </li>
              );
            })}
          </ul>
          {total > 0 ? (
            <p className="text-sm text-fg-muted" aria-live="polite">
              {t.market.showingOf.replace("{shown}", String(listRows.length)).replace("{total}", String(total))}
            </p>
          ) : null}
          {pageFailed ? (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm text-fg-muted">{t.market.loadError}</p>
              <Button variant="secondary" onClick={retry}>
                {t.states.retry}
              </Button>
            </div>
          ) : null}
          {hasMore && !pageFailed ? (
            <div>
              <Button variant="secondary" onClick={() => setPage((value) => value + 1)} disabled={loadingMore}>
                {t.market.loadMore}
              </Button>
              {loadingMore ? (
                <div role="status" aria-live="polite" aria-busy="true" className="mt-2 flex flex-col gap-2">
                  <span className="sr-only">{t.states.loading}</span>
                  <Skeleton className="min-h-14 w-full rounded-xl" />
                  <Skeleton className="min-h-14 w-full rounded-xl" />
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}
      {!waiting && !failed && listRows.length === 0 ? (
        <EmptyState
          title={emptyTitle}
          description={filter === "favorites" ? t.market.emptyFavoritesHint : t.market.emptyHint}
        />
      ) : null}
    </motion.div>
  );
}
