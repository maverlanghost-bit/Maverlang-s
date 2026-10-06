"use client";

import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQueries } from "@tanstack/react-query";

import { FavoriteButton } from "@/components/domain/favorite-button";
import { MarketStatusPill } from "@/components/domain/market-status-pill";
import { TickerCard } from "@/components/domain/ticker-card";
import { TickerRow } from "@/components/domain/ticker-row";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { IconSearch } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { indexFromKey } from "@/components/ui/keys";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { getPrices, searchMarket, type MarketSearchItem } from "@/lib/api/client";
import { useFavorites } from "@/lib/hooks/use-favorites";
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

const SEARCH_MS = 300;
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

function withMarketParams(params: URLSearchParams, query: string, filter: MarketFilter, sort: MarketSort) {
  const trimmed = query.trim();
  if (trimmed) params.set("q", trimmed);
  else params.delete("q");
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

type PricedItem = {
  item: MarketSearchItem;
  quote: Quote;
  /** Posición acumulada (orden Popular del servidor). */
  index: number;
};

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
}: {
  labelId: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
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
      className="flex min-w-0 gap-2 overflow-x-auto p-1"
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
              "h-11 shrink-0 rounded-full px-3 text-sm transition duration-[140ms] ease-spring active:scale-[0.98]",
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
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="flex flex-col gap-6">
      <span className="sr-only">{label}</span>
      <div className="flex gap-3 overflow-hidden">
        <Skeleton className="h-28 w-60 shrink-0 rounded-3xl" />
        <Skeleton className="h-28 w-60 shrink-0 rounded-3xl" />
        <Skeleton className="h-28 w-60 shrink-0 rounded-3xl" />
      </div>
      <div className="flex flex-col gap-2">
        {["a", "b", "c", "d", "e", "f"].map((key) => (
          <Skeleton key={key} className="h-16 w-full rounded-xl" />
        ))}
      </div>
    </div>
  );
}

export function MarketScreen({
  initialQuery,
  initialFilter,
  initialSort,
}: {
  initialQuery: string;
  initialFilter: string;
  initialSort: string;
}) {
  const { t, currency } = useT();
  const router = useRouter();
  const pathname = usePathname();
  const searchRef = useRef<HTMLInputElement>(null);
  const searchId = useId();
  const filtersLabelId = useId();
  const sortLabelId = useId();
  const moversTitleId = useId();

  const [draft, setDraft] = useState(initialQuery);
  const [applied, setApplied] = useState(initialQuery);
  const [filter, setFilter] = useState<MarketFilter>(() => parseFilter(initialFilter));
  const [sort, setSort] = useState<MarketSort>(() => parseSort(initialSort));
  const [page, setPage] = useState(1);

  // Favoritas vive en este navegador: el servidor devuelve todo y se filtra aquí.
  const serverCategory = filter === "favorites" ? "all" : filter;
  const serverSort = sort === "az" ? "name" : "liquidity";

  // Una consulta del servidor por página cargada. Al cambiar el criterio, la página vuelve a 1.
  const searchQueries = useQueries({
    queries: Array.from({ length: page }, (_, index) => {
      const pageNum = index + 1;
      return {
        queryKey: ["market-search", applied, serverCategory, pageNum, PAGE_SIZE, serverSort] as const,
        queryFn: () =>
          searchMarket({
            q: applied,
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
    })),
  });
  const quotesBySymbol = (() => {
    const map = new Map<string, Quote>();
    for (const query of priceQueries) {
      for (const quote of query.data ?? []) map.set(quote.symbol, quote);
    }
    return map;
  })();

  const loadedSymbols = useMemo(() => items.map((item) => item.symbol), [items]);
  const histories = useHistories(loadedSymbols);

  useEffect(() => {
    const id = window.setTimeout(() => {
      setApplied(draft);
      setPage(1);
    }, SEARCH_MS);
    return () => window.clearTimeout(id);
  }, [draft]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    withMarketParams(params, applied, filter, sort);
    const searchText = params.toString();
    if (canonicalSearch(window.location.search) === canonicalSearch(searchText ? `?${searchText}` : "")) return;
    router.replace(searchText ? `${pathname}?${searchText}` : pathname, { scroll: false });
  }, [applied, filter, pathname, router, sort]);

  useEffect(() => {
    const onPop = () => {
      const params = new URLSearchParams(window.location.search);
      const query = params.get("q") ?? "";
      setDraft(query);
      setApplied(query);
      setFilter(parseFilter(params.get("filtro")));
      setSort(parseSort(params.get("orden")));
      setPage(1);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey || event.isComposing) return;
      if (!window.matchMedia("(min-width: 1024px)").matches) return;
      const target = event.target;
      if (target instanceof HTMLElement) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) return;
      }
      event.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const favoriteSet = useMemo(() => new Set(favorites ?? []), [favorites]);
  const priced = useMemo(() => {
    const rows: PricedItem[] = [];
    items.forEach((item, index) => {
      if (filter === "favorites" && !favoriteSet.has(item.symbol)) return;
      const quote = quotesBySymbol.get(item.symbol);
      if (!quote) return;
      rows.push({ item, quote, index });
    });
    return rows;
  }, [favoriteSet, filter, items, quotesBySymbol]);
  const ordered = useMemo(() => orderPriced(priced, sort), [priced, sort]);
  const moverSource = useMemo(() => (applied.trim() ? [] : moversOfPriced(priced)), [applied, priced]);

  const sparkBySymbol = useMemo(() => {
    const map = new Map<string, number[]>();
    loadedSymbols.forEach((symbol, index) => {
      const points = histories[index]?.data;
      if (!points || points.length < 2) return;
      const spot = quotesBySymbol.get(symbol)?.priceUsd;
      const series = spot !== undefined && spot > 0 ? anchorSeriesToSpot(points, spot) : points;
      map.set(symbol, downsample(series.map((point) => point.p)));
    });
    return map;
  }, [loadedSymbols, histories, quotesBySymbol]);

  const favoritesPending = filter === "favorites" && favorites === null;
  const rate = fx.data?.rate;
  const fxKnown = typeof rate === "number" && Number.isFinite(rate) && rate > 0;
  const firstQuery = searchQueries[0];
  const firstPrices = priceQueries[0];
  const quotesFailed = items.length > 0 && quotesBySymbol.size === 0 && (firstPrices?.isError ?? false);
  const failed = (firstQuery?.isError && items.length === 0) || quotesFailed;
  const waiting =
    !failed &&
    (favoritesPending ||
      (items.length === 0 && ((firstQuery?.isPending ?? true) || (firstPrices?.isPending ?? false))) ||
      (items.length === 0 && currency === "CLP" && !fxKnown && fx.isPending));
  const pageFailed = !failed && items.length > 0 && searchQueries.some((query) => query.isError);
  const loadingMore =
    items.length > 0 &&
    (searchQueries.some((query) => query.isFetching) || priceQueries.some((query) => query.isFetching));
  const moverItems = waiting || failed ? [] : priceRows(moverSource, currency, rate);
  const listItems = waiting || failed ? [] : priceRows(ordered, currency, rate);
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
    { value: "favorites", label: t.market.favorites },
  ];
  const sortOptions: { value: MarketSort; label: string }[] = [
    { value: "popular", label: t.market.popular },
    { value: "gain", label: t.market.gain },
    { value: "loss", label: t.market.loss },
    { value: "az", label: t.market.az },
  ];

  function onSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setApplied(draft);
    setPage(1);
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

  const emptyTitle = applied.trim() ? t.market.noResultsTitle : `${t.market.emptyFor} «${t.market[filter]}»`;

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader title={t.pages.market.title} description={t.pages.market.lead} action={statusNode} />
      {currency === "CLP" && !fxKnown && !fx.isPending && !waiting && !failed ? (
        <p className="text-sm text-fg-muted">{t.detail.fxFallback}</p>
      ) : null}

      <form role="search" onSubmit={onSearch}>
        <label htmlFor={searchId} className="sr-only">
          {t.market.searchLabel}
        </label>
        <div className="relative">
          <IconSearch className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-fg-muted" />
          <Input
            ref={searchRef}
            id={searchId}
            name="q"
            type="search"
            value={draft}
            placeholder={t.market.searchPlaceholder}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
            onChange={(event) => setDraft(event.target.value)}
            className={draft ? "pr-10 pl-10" : "pr-12 pl-10"}
          />
          {draft ? null : (
            <kbd
              className="pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 rounded-xs border border-border px-1.5 font-mono text-[11px] text-fg-muted lg:inline"
              aria-hidden
            >
              /
            </kbd>
          )}
        </div>
      </form>

      <div className="flex min-w-0 flex-col gap-2">
        <p id={filtersLabelId} className="label">
          {t.market.filtersLabel}
        </p>
        <ChipGroup labelId={filtersLabelId} value={filter} options={filterOptions} onChange={onFilterChange} />
      </div>

      <div className="flex min-w-0 flex-col gap-2">
        <p id={sortLabelId} className="label">
          {t.market.sortLabel}
        </p>
        <ChipGroup labelId={sortLabelId} value={sort} options={sortOptions} onChange={onSortChange} />
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
        <section className="flex min-w-0 flex-col gap-2" aria-labelledby={moversTitleId}>
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
      {!waiting && !failed && listItems.length > 0 ? (
        <section className="flex min-w-0 flex-col gap-2">
          <h2 className="text-base font-medium text-fg">{applied.trim() ? t.market.results : t.market.list}</h2>
          <ul>
            {listItems.map(({ entry, price, currency: rowCurrency }) => (
              <li key={entry.item.symbol}>
                <TickerRow
                  href={tickerHref(entry.item.symbol)}
                  symbol={entry.item.symbol}
                  name={entry.item.name}
                  logoUrl={entry.item.logoUrl}
                  price={price}
                  currency={rowCurrency}
                  change={entry.quote.change24hPct}
                  sparkline={sparkBySymbol.get(entry.item.symbol)}
                  sparklineClassName="block"
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
              </li>
            ))}
          </ul>
          {total > 0 ? (
            <p className="text-sm text-fg-muted" aria-live="polite">
              {t.market.showingOf.replace("{shown}", String(listItems.length)).replace("{total}", String(total))}
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
                  <Skeleton className="h-16 w-full rounded-xl" />
                  <Skeleton className="h-16 w-full rounded-xl" />
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}
      {!waiting && !failed && listItems.length === 0 ? (
        <EmptyState title={emptyTitle} description={t.market.emptyHint} />
      ) : null}
    </div>
  );
}
