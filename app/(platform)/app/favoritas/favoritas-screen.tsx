"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQueries } from "@tanstack/react-query";

import { AlertButton } from "@/components/domain/alert-button";
import { AlertsPanel } from "@/components/domain/alert-panel";
import { FavoriteButton } from "@/components/domain/favorite-button";
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
import { getPrices, searchMarket } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { useFavorites, useSyncFavorites } from "@/lib/hooks/use-favorites";
import { PRICE_MS, useFx, useHistories } from "@/lib/hooks/queries";
import { useT } from "@/lib/hooks/use-t";
import { isRealSparkHistory, downsample, displayPrice } from "@/lib/market/browse";
import { anchorSeriesToSpot } from "@/lib/market/series";
import { chunkSymbols, sortFavoriteRows, uniqueSymbols, type FavoriteSort } from "@/lib/services/alerts-logic";
import type { Quote } from "@/lib/types";

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

  const favoriteKey = (symbols ?? []).join("\n");
  const favoriteSymbols = useMemo(() => uniqueSymbols(favoriteKey ? favoriteKey.split("\n") : []), [favoriteKey]);

  const searchQueriesDef = useMemo(
    () =>
      favoriteSymbols.map((symbol) => ({
        queryKey: ["market-search", symbol, "favoritas", "listed"] as const,
        queryFn: () => searchMarket({ q: symbol, page: 1, pageSize: 50, sort: "name", scope: "listed" }),
        staleTime: 60_000,
      })),
    [favoriteSymbols],
  );
  const searchQueries = useQueries({ queries: searchQueriesDef });

  const catalogKey = searchQueries
    .map((query, index) => {
      const symbol = favoriteSymbols[index];
      if (!symbol) return "";
      const item = (query.data?.items ?? []).find((row) => row.symbol.toLowerCase() === symbol.toLowerCase());
      return item?.symbol ?? "";
    })
    .filter((symbol) => symbol.length > 0)
    .join(",");
  const priceSymbols = useMemo(() => (catalogKey ? catalogKey.split(",") : []), [catalogKey]);
  const chunks = useMemo(() => chunkSymbols(priceSymbols, 50), [priceSymbols]);
  const priceQueries = useQueries({
    queries: chunks.map((chunk) => ({
      queryKey: ["prices", [...chunk].sort()] as const,
      queryFn: () => getPrices(chunk),
      enabled: chunk.length > 0,
      staleTime: PRICE_MS,
      refetchInterval: PRICE_MS,
      refetchOnWindowFocus: false as const,
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

  const sparkKey = priceQueries.some((query) => query.data)
    ? [...quotes.keys()].sort().join(",")
    : "";
  const sparkSymbols = useMemo(() => {
    if (!sparkKey) return [];
    return sparkKey.split(",").map((key) => quotes.get(key)?.symbol ?? key);
  }, [sparkKey, quotes]);
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
    const built: Row[] = favoriteSymbols.map((symbol, index) => {
      const items = searchQueries[index]?.data?.items ?? [];
      const item = items.find((row) => row.symbol.toLowerCase() === symbol.toLowerCase()) ?? null;
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
  }, [favoriteSymbols, searchQueries, quotes, sparkBySymbol, sort]);

  const pendingFavorites = symbols === null;
  const searching = favoriteSymbols.length > 0 && searchQueries.some((query) => query.isPending) && rows.every((row) => row.name === row.symbol && row.priceUsd == null);
  const searchFailed = favoriteSymbols.length > 0 && searchQueries.every((query) => query.isError);
  const rate = fx.data?.rate;
  const fxKnown = typeof rate === "number" && Number.isFinite(rate) && rate > 0;
  const shownCurrency = currency === "CLP" && fxKnown ? "CLP" : "USD";

  function retry() {
    for (const query of searchQueries) void query.refetch();
    for (const query of priceQueries) void query.refetch();
    if (currency === "CLP") void fx.refetch();
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader title={copy.pageTitle} description={copy.pageLead} />
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
              { value: "change", label: copy.sortChange },
              { value: "name", label: copy.sortName },
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
          title={copy.emptyTitle}
          description={copy.emptyBody}
          action={
            <Button asChild size="lg" className="min-h-11 w-full whitespace-nowrap sm:w-auto">
              <Link href="/app">{copy.emptyAction}</Link>
            </Button>
          }
        />
      ) : null}
      {!pendingFavorites && !searching && !searchFailed && rows.length > 0 ? (
        <ul className="flex min-w-0 flex-col gap-1.5">
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
                  onToggle={() => toggle(row.symbol)}
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

function AlertBell({ symbol, name, priceUsd }: { symbol: string; name: string; priceUsd: number | null }) {
  return (
    <span className="relative inline-flex size-11 shrink-0 items-center justify-center text-fg-muted">
      <svg viewBox="0 0 16 16" className="pointer-events-none size-4" fill="none" aria-hidden>
        <path
          d="M8 2.5a3.5 3.5 0 0 0-3.5 3.5v2.1L3.2 10.2a.6.6 0 0 0 .5 1h8.6a.6.6 0 0 0 .5-1L11.5 8.1V6A3.5 3.5 0 0 0 8 2.5Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path d="M6.6 11.8a1.4 1.4 0 0 0 2.8 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <span className="absolute inset-0 [&_button]:absolute [&_button]:inset-0 [&_button]:size-11 [&_button]:h-11 [&_button]:min-h-0 [&_button]:w-11 [&_button]:overflow-hidden [&_button]:rounded-full [&_button]:border-0 [&_button]:bg-transparent [&_button]:p-0 [&_button]:text-transparent [&_button]:shadow-none [&_button]:hover:bg-surface-2 [&_button]:hover:text-transparent">
        <AlertButton symbol={symbol} name={name} priceUsd={priceUsd} />
      </span>
    </span>
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
    <div className="rounded-2xl border border-border/70 transition-colors duration-150 hover:bg-surface-1/80 sm:flex sm:min-h-14 sm:items-center">
      <Link
        href={tickerHref(row.symbol)}
        className="flex min-h-14 min-w-0 flex-1 items-center gap-2 rounded-2xl px-2 py-1 sm:gap-3 sm:px-3"
      >
        <TickerLogo symbol={row.symbol} name={row.name} logoUrl={row.logoUrl} size={36} decorative loading="lazy" sizes="40px" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold tracking-tight text-fg">{row.symbol}</span>
          <span className="block truncate text-sm text-fg-muted">
            {row.name}
            {lowLiquidityLabel ? <span> · {lowLiquidityLabel}</span> : null}
          </span>
          {reviewLabel ? (
            <span
              className="mt-1 inline-flex w-fit max-w-full items-center truncate rounded-full border border-border/70 bg-surface-2/60 px-2 py-0.5 text-xs leading-4 font-medium whitespace-nowrap text-fg-muted"
              title={reviewHint ?? undefined}
            >
              {reviewLabel}
            </span>
          ) : null}
        </span>
        {row.sparkline ? <Sparkline data={row.sparkline} width={72} height={28} className="hidden sm:block" /> : null}
        <span className="flex shrink-0 flex-col items-end gap-0.5 text-right font-medium tabular-nums">
          {shown == null ? (
            <span className="text-sm whitespace-nowrap text-fg-muted">{noPrice}</span>
          ) : (
            <>
              <FlashPrice value={shown} currency={currency} size="sm" />
              {row.change24hPct == null ? (
                <span className="text-xs whitespace-nowrap text-fg-muted">{noChange}</span>
              ) : (
                <ChangeBadge value={row.change24hPct} />
              )}
            </>
          )}
        </span>
      </Link>
      <div
        className={cn(
          "flex items-center gap-2 px-2 pb-2 sm:shrink-0 sm:justify-end sm:px-0 sm:pr-1 sm:pb-0",
          row.sparkline ? "justify-between" : "justify-end",
        )}
      >
        {row.sparkline ? <Sparkline data={row.sparkline} width={72} height={28} className="block sm:hidden" /> : null}
        <span className="inline-flex shrink-0 items-center">
          <AlertBell symbol={row.symbol} name={row.name} priceUsd={row.priceUsd} />
          <FavoriteButton pressed label={favoriteLabel} onToggle={onToggle} />
        </span>
      </div>
    </div>
  );
}

function ListSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="flex flex-col gap-1.5">
      <span className="sr-only">{label}</span>
      {["a", "b", "c", "d"].map((key) => (
        <Skeleton key={key} className="h-[6.75rem] w-full rounded-2xl sm:h-14" />
      ))}
    </div>
  );
}
