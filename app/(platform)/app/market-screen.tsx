"use client";

import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { usePathname, useRouter } from "next/navigation";

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
import { useFavorites } from "@/lib/hooks/use-favorites";
import { useFx, useHistories, useMarketStatus, usePrices, useTickers } from "@/lib/hooks/queries";
import { useT } from "@/lib/hooks/use-t";
import {
  displayPrice,
  downsample,
  matchesQuery,
  moversOf,
  parseFilter,
  parseSort,
  passesFilter,
  sortRows,
  type MarketFilter,
  type MarketRow,
  type MarketSort,
} from "@/lib/market/browse";
import type { Currency, Quote } from "@/lib/types";

const SEARCH_MS = 150;

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

function priceRows(rows: readonly MarketRow[], currency: Currency, rate: number | undefined) {
  const items: { row: MarketRow; price: number }[] = [];
  for (const row of rows) {
    const price = displayPrice(row.quote.priceUsd, currency, rate);
    if (price !== null) items.push({ row, price });
  }
  return items;
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

  const tickers = useTickers();
  const prices = usePrices();
  const fx = useFx();
  const status = useMarketStatus();
  const { symbols: favorites, toggle } = useFavorites();

  const catalog = useMemo(
    () => (tickers.data ?? []).filter((ticker) => ticker.enabled).map((ticker) => ticker.symbol),
    [tickers.data],
  );
  const histories = useHistories(catalog);

  useEffect(() => {
    const id = window.setTimeout(() => setApplied(draft), SEARCH_MS);
    return () => window.clearTimeout(id);
  }, [draft]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    withMarketParams(params, applied, filter, sort);
    const search = params.toString();
    if (canonicalSearch(window.location.search) === canonicalSearch(search ? `?${search}` : "")) return;
    router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false });
  }, [applied, filter, pathname, router, sort]);

  useEffect(() => {
    const onPop = () => {
      const params = new URLSearchParams(window.location.search);
      const query = params.get("q") ?? "";
      setDraft(query);
      setApplied(query);
      setFilter(parseFilter(params.get("filtro")));
      setSort(parseSort(params.get("orden")));
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

  const quoteBySymbol = useMemo(() => {
    const map = new Map<string, Quote>();
    for (const quote of prices.data ?? []) map.set(quote.symbol, quote);
    return map;
  }, [prices.data]);

  const indexed = useMemo(() => {
    const rows: MarketRow[] = [];
    (tickers.data ?? []).forEach((ticker, index) => {
      if (!ticker.enabled) return;
      const quote = quoteBySymbol.get(ticker.symbol);
      if (!quote) return;
      rows.push({ ticker, quote, index });
    });
    return rows;
  }, [quoteBySymbol, tickers.data]);

  const favoriteSet = useMemo(() => new Set(favorites ?? []), [favorites]);
  const inFilter = useMemo(
    () => indexed.filter((row) => passesFilter(row.ticker, filter, favoriteSet)),
    [favoriteSet, filter, indexed],
  );
  const searched = useMemo(
    () => inFilter.filter((row) => matchesQuery(row.ticker, applied)),
    [applied, inFilter],
  );
  const ordered = useMemo(() => sortRows(searched, sort), [searched, sort]);
  const moverSource = useMemo(() => (applied.trim() ? [] : moversOf(inFilter)), [applied, inFilter]);

  const sparkBySymbol = useMemo(() => {
    const map = new Map<string, number[]>();
    catalog.forEach((symbol, index) => {
      const points = histories[index]?.data;
      if (!points || points.length < 2) return;
      map.set(symbol, downsample(points.map((point) => point.p)));
    });
    return map;
  }, [catalog, histories]);

  const favoritesPending = filter === "favorites" && favorites === null;
  const failed =
    (tickers.isError && !tickers.data) ||
    (prices.isError && !prices.data) ||
    (currency === "CLP" && fx.isError && !fx.data);
  const waiting =
    !failed && (favoritesPending || tickers.isPending || prices.isPending || (currency === "CLP" && fx.isPending));

  const rate = fx.data?.rate;
  const moverItems = waiting || failed ? [] : priceRows(moverSource, currency, rate);
  const listItems = waiting || failed ? [] : priceRows(ordered, currency, rate);
  const failure = tickers.error ?? prices.error ?? (currency === "CLP" ? fx.error : null);
  const failureDetail = failure instanceof Error && failure.message.trim() ? failure.message : undefined;

  const filterOptions: { value: MarketFilter; label: string }[] = [
    { value: "all", label: t.market.all },
    { value: "tech", label: t.market.tech },
    { value: "etf", label: t.market.etf },
    { value: "fintech", label: t.market.fintech },
    { value: "consumer", label: t.market.consumer },
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
  }

  function retry() {
    void tickers.refetch();
    void prices.refetch();
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

  const emptyTerm = applied.trim() || t.market[filter];

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader title={t.pages.market.title} description={t.pages.market.lead} action={statusNode} />

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
        <ChipGroup labelId={filtersLabelId} value={filter} options={filterOptions} onChange={setFilter} />
      </div>

      <div className="flex min-w-0 flex-col gap-2">
        <p id={sortLabelId} className="label">
          {t.market.sortLabel}
        </p>
        <ChipGroup labelId={sortLabelId} value={sort} options={sortOptions} onChange={setSort} />
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
            {moverItems.map(({ row, price }) => (
              <TickerCard
                key={row.ticker.symbol}
                href={tickerHref(row.ticker.symbol)}
                symbol={row.ticker.symbol}
                name={row.ticker.name}
                logoUrl={row.ticker.logo}
                price={price}
                currency={currency}
                change={row.quote.change24hPct}
                action={
                  <FavoriteButton
                    pressed={favoriteSet.has(row.ticker.symbol)}
                    label={withName(
                      favoriteSet.has(row.ticker.symbol) ? t.market.favoriteOn : t.market.favoriteOff,
                      row.ticker.name,
                    )}
                    onToggle={() => toggle(row.ticker.symbol)}
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
            {listItems.map(({ row, price }) => (
              <li key={row.ticker.symbol}>
                <TickerRow
                  href={tickerHref(row.ticker.symbol)}
                  symbol={row.ticker.symbol}
                  name={row.ticker.name}
                  logoUrl={row.ticker.logo}
                  price={price}
                  currency={currency}
                  change={row.quote.change24hPct}
                  sparkline={sparkBySymbol.get(row.ticker.symbol)}
                  sparklineClassName="block"
                  action={
                    <FavoriteButton
                      pressed={favoriteSet.has(row.ticker.symbol)}
                      label={withName(
                        favoriteSet.has(row.ticker.symbol) ? t.market.favoriteOn : t.market.favoriteOff,
                        row.ticker.name,
                      )}
                      onToggle={() => toggle(row.ticker.symbol)}
                    />
                  }
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {!waiting && !failed && listItems.length === 0 ? (
        <EmptyState title={`${t.market.emptyFor} «${emptyTerm}»`} description={t.market.emptyHint} />
      ) : null}
    </div>
  );
}
