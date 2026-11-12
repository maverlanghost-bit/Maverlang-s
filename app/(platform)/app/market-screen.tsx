"use client";

import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQueries } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";

import { ChangeBadge } from "@/components/domain/change-badge";
import { FavoriteButton } from "@/components/domain/favorite-button";
import { MarketHeatmap } from "@/components/domain/market-heatmap";
import { MarketToday } from "@/components/domain/market-today/market-today";
import { FloatingMarketOrb } from "@/components/domain/market-status-pill";
import { PriceFreshness } from "@/components/domain/price-freshness";
import { TickerRow } from "@/components/domain/ticker-row";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { indexFromKey } from "@/components/ui/keys";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";
import { getPrices, searchMarket, type MarketSearchItem } from "@/lib/api/client";
import { useFavorites, useSyncFavorites } from "@/lib/hooks/use-favorites";
import { useFx, useHistories, useMarketStatus } from "@/lib/hooks/queries";
import { useT } from "@/lib/hooks/use-t";
import {
  displayPrice,
  downsample,
  isRealSparkHistory,
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

/** Fila del mapa de calor: misma forma que el contrato de `MarketHeatmap`. */
type HeatmapRow = {
  symbol: string;
  name: string;
  priceUsd: number;
  change24hPct: number;
  priceFormatted: string;
};

/** Vista del mercado: lista detallada (por defecto) o mapa de calor. */
type MarketView = "list" | "heatmap";

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

/**
 * Píldora de criterio, sin contorno en reposo: el filtro se lee como texto y
 * sólo el activo toma tinta. 44px de alto en móvil; 36px en escritorio.
 */
const chipClass =
  "inline-flex min-h-11 shrink-0 items-center justify-center rounded-full px-3.5 text-[13px] font-medium whitespace-nowrap transition-colors duration-150 ease-spring active:scale-[0.98] sm:min-h-9";
const chipActiveClass = "bg-fg text-bg";
const chipIdleClass = "text-fg-muted hover:bg-surface-1 hover:text-fg";

function ChipGroup<T extends string>({
  ariaLabel,
  value,
  options,
  onChange,
}: {
  ariaLabel: string;
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
      aria-label={ariaLabel}
      className="flex min-w-0 flex-wrap items-center gap-1.5"
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
            className={cn(chipClass, selected ? chipActiveClass : chipIdleClass)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function ResultsSkeleton({ label }: { label: string }) {
  // Placeholder estático (sin pulso): mismas filas que la lista, primer pintado
  // más barato y sin saltos cuando llega el catálogo.
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="flex flex-col gap-2">
      <span className="sr-only">{label}</span>
      <div className="flex flex-col divide-y divide-border" aria-hidden>
        {["a", "b", "c", "d", "e", "f", "g", "h"].map((key) => (
          <div key={key} className="flex min-h-16 items-center gap-3 px-2 py-2 sm:px-3">
            <div className="size-9 shrink-0 rounded-full bg-surface-2" />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div className="h-3 w-14 rounded-sm bg-surface-2" />
              <div className="h-3 w-32 max-w-full rounded-sm bg-surface-2" />
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <div className="h-3.5 w-16 rounded-sm bg-surface-2" />
              <div className="h-3 w-12 rounded-sm bg-surface-2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MarketScreen({
  initialFilter,
  initialSort,
  sections,
}: {
  initialFilter: string;
  initialSort: string;
  /** Navegación de secciones del mercado (Acciones · Cripto · Ganar · Copiar). */
  sections?: ReactNode;
}) {
  const { t, currency, language } = useT();
  const router = useRouter();
  const pathname = usePathname();
  const filtersLabelId = useId();
  const sortLabelId = useId();
  const filtersPanelId = useId();
  const moversTitleId = useId();

  const [filter, setFilter] = useState<MarketFilter>(() => parseFilter(initialFilter));
  // N19: sin A–Z en la UI; una URL vieja con `orden=az` cae a Popular.
  const [sort, setSort] = useState<MarketSort>(() => {
    const parsed = parseSort(initialSort);
    return parsed === "az" ? "popular" : parsed;
  });
  const [page, setPage] = useState(1);
  // Vista por defecto: lista. El DOM de la lista no cambia cuando view === "list".
  const [view, setView] = useState<MarketView>("list");
  // En <sm las categorías viven detrás de «Filtros · X ▾»; desde sm se ven siempre.
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Favoritas vive en este navegador: el servidor devuelve todo y se filtra aquí.
  const serverCategory = filter === "favorites" ? "all" : filter;
  const serverSort = "liquidity";

  // Una consulta del servidor por página cargada. Al cambiar el criterio, la página vuelve a 1.
  // Opciones memoizadas: un array nuevo en cada render vuelve a suscribir useQueries.
  const searchQueryOptions = useMemo(
    () =>
      Array.from({ length: page }, (_, index) => {
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
          placeholderData: (previous: Awaited<ReturnType<typeof searchMarket>> | undefined) => previous,
        };
      }),
    [page, serverCategory, serverSort],
  );
  const searchQueries = useQueries({ queries: searchQueryOptions });
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
  const pageSymbolKey = searchQueries
    .map((query) => (query.data?.items ?? []).map((item) => item.symbol).join(","))
    .join("|");
  const symbolsByPage = useMemo(
    () => pageSymbolKey.split("|").map((part) => (part ? part.split(",") : [])),
    [pageSymbolKey],
  );
  const priceQueryOptions = useMemo(
    () =>
      symbolsByPage.map((symbols) => ({
        queryKey: ["prices", [...symbols].sort()] as const,
        queryFn: () => getPrices(symbols),
        enabled: symbols.length > 0,
        staleTime: PRICE_MS,
        refetchInterval: PRICE_MS,
        // Sin refetch al volver a la pestaña: el intervalo de 15 s ya mantiene
        // la lista viva y se evita una ráfaga de llamadas al enfocar.
        refetchOnWindowFocus: false as const,
        refetchIntervalInBackground: false,
        // Mientras revalida, se siguen viendo los últimos precios en vez de
        // volver al placeholder vacío.
        placeholderData: (previous: Quote[] | undefined) => previous,
      })),
    [symbolsByPage],
  );
  const priceQueries = useQueries({ queries: priceQueryOptions });
  // Optimización paralela: priceQueries[index]?.data
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

  // Sparklines 1W: sólo cuando el lote de precios ya tiene datos. `isPending`
  // parpadea al rearmar useQueries y relanzaba ~20 veces el mismo history.
  const sparkKey = symbolsByPage
    .map((symbols) => symbols.join(","))
    .join("|");
  const sparkSymbols = useMemo(() => {
    if (!sparkKey) return [];
    return sparkKey.split("|").flatMap((part) => (part ? part.split(",") : []));
  }, [sparkKey]);
  const firstPagePriced = priceQueries[0]?.isSuccess ?? false;
  const [sparkReady, setSparkReady] = useState(false);
  useEffect(() => {
    if (sparkReady) return;
    const delayMs = firstPagePriced ? 450 : 1200;
    const timer = window.setTimeout(() => setSparkReady(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [firstPagePriced, sparkReady]);
  const histories = useHistories(sparkSymbols, "1W", sparkReady);

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
      const data = histories[index]?.data;
      // Sólo ticks, closes o real === true. Con source "mock" no hay sparkline.
      if (!data || !isRealSparkHistory(data)) return;
      const points = data.points;
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
  /** Filas del mapa de calor: mismas filas ordenadas/filtradas, sin inventar cifras
      (se descarta toda fila sin cotización o sin precio formateable). */
  const heatmapRows = useMemo(() => {
    const out: HeatmapRow[] = [];
    for (const entry of listRows) {
      const quote = entry.quote;
      if (!quote) continue;
      const priced = priceRows([{ item: entry.item, quote, index: entry.index }], currency, rate)[0];
      if (!priced) continue;
      out.push({
        symbol: entry.item.symbol,
        name: entry.item.name,
        priceUsd: quote.priceUsd,
        change24hPct: Number.isFinite(quote.change24hPct) ? quote.change24hPct : 0,
        priceFormatted: formatMoney(priced.price, priced.currency),
      });
    }
    return out;
  }, [currency, listRows, rate]);
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
  // Rótulos fijos del conmutador de vista (no hay claves de i18n para esto).
  const viewOptions: { value: MarketView; label: string }[] = [
    { value: "list", label: "Lista" },
    { value: "heatmap", label: "Mapa de calor" },
  ];
  const activeFilterLabel = filterOptions.find((option) => option.value === filter)?.label ?? t.market.all;
  const filtersTitle = language === "en" ? "Category" : "Categoría";
  const currencyNote = (() => {
    if (currency !== "CLP") return language === "en" ? "Prices in US$" : "Precios en US$";
    if (fx.isPending) return language === "en" ? "Prices in CLP" : "Precios en CLP";
    if (fxKnown && typeof rate === "number") {
      const ref = formatMoney(rate, "CLP");
      return language === "en" ? `Prices in CLP · ref. dollar ${ref}` : `Precios en CLP · dólar ref. ${ref}`;
    }
    return language === "en" ? "US$ · no exchange rate" : "US$ · sin tipo de cambio";
  })();
  const loadMoreLabel = language === "en" ? `Load ${PAGE_SIZE} more` : `Cargar ${PAGE_SIZE} más`;

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

  const emptyTitle = `${t.market.emptyFor} «${t.market[filter]}»`;
  const reduceMotion = useReducedMotion();
  const loadedPct = total > 0 ? Math.min(100, Math.round((listRows.length / total) * 100)) : 0;

  return (
    <motion.div
      className="flex min-w-0 flex-col gap-8 lg:gap-10"
      initial={reduceMotion ? false : { opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={reduceMotion ? { duration: 0 } : { duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="flex min-w-0 flex-col gap-5">
        <PageHeader title={t.pages.market.title} description={t.pages.market.lead} />
        {sections ? <div className="min-w-0">{sections}</div> : null}
      </div>

      <MarketToday />

      <section className="flex min-w-0 flex-col gap-4">
        <h2 className="text-xl leading-tight tracking-tight text-fg">{t.market.list}</h2>

        {/* Conteo real, frescura del precio y vista. Sin cifras hasta que el catálogo llegue. */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[13px] leading-5 text-fg-muted">
            {total > 0 ? (
              <>
                <span
                  className="num font-medium tabular-nums text-fg-body"
                  aria-live="polite"
                  title={t.market.stockCount.replace("{total}", String(total))}
                >
                  {t.market.showingOf.replace("{shown}", String(listRows.length)).replace("{total}", String(total))}
                  {language === "en"
                    ? total === 1
                      ? " stock"
                      : " stocks"
                    : total === 1
                      ? " acción"
                      : " acciones"}
                </span>
                <span aria-hidden className="text-border-strong">
                  ·
                </span>
              </>
            ) : null}
            <PriceFreshness at={freshestAt} stale={anyStale} />
          </div>

          <div
            role="group"
            aria-label="Vista del mercado"
            className="inline-flex shrink-0 items-center gap-0.5 rounded-full border border-border bg-bg p-0.5"
          >
            {viewOptions.map((option) => {
              const active = option.value === view;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setView(option.value)}
                  className={cn(
                    "inline-flex min-h-11 cursor-pointer items-center rounded-full px-3 text-[13px] font-medium transition-colors duration-150 sm:min-h-8",
                    active ? "bg-fg text-bg" : "text-fg-muted hover:text-fg",
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Ordenar y categoría: dos grupos con rótulo visible. En móvil las
            categorías quedan detrás de «Filtros · X»; abiertas, envuelven. */}
        <div className="flex min-w-0 flex-col gap-3 border-t border-border/70 pt-4 sm:grid sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-x-10">
          <div className="flex min-w-0 flex-col gap-1.5">
            <p id={sortLabelId} className="text-[13px] font-medium text-fg-muted">
              {t.market.sortLabel}
            </p>
            <ChipGroup ariaLabel={t.market.sortLabel} value={sort} options={sortOptions} onChange={onSortChange} />
          </div>

          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex min-w-0 items-center justify-between gap-2">
              <p id={filtersLabelId} className="text-[13px] font-medium text-fg-muted">
                {filtersTitle}
              </p>
              <button
                type="button"
                aria-expanded={filtersOpen}
                aria-controls={filtersPanelId}
                onClick={() => setFiltersOpen((value) => !value)}
                className="inline-flex min-h-11 items-center gap-1 rounded-full border border-border-control bg-bg px-3 text-[13px] font-medium text-fg transition-colors hover:bg-surface-1 sm:hidden"
              >
                {`${language === "en" ? "Filters" : "Filtros"} · ${activeFilterLabel}`}
                <span aria-hidden>{filtersOpen ? "▴" : "▾"}</span>
              </button>
            </div>
            <div id={filtersPanelId} className={cn(filtersOpen ? "block" : "hidden", "sm:block")}>
              <ChipGroup ariaLabel={t.market.filtersLabel} value={filter} options={filterOptions} onChange={onFilterChange} />
            </div>
          </div>
        </div>

        {currencyNote ? (
          <p
            className="text-xs leading-5 text-fg-muted"
            title={currency === "CLP" && !fxKnown ? t.detail.fxFallback : undefined}
          >
            {currencyNote}
          </p>
        ) : null}

        {currency === "CLP" && !fxKnown && !fx.isPending && !waiting && !failed ? (
          <p className="text-xs leading-relaxed text-fg-muted">{t.detail.fxFallback}</p>
        ) : null}

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

        {!waiting && !failed && listRows.length === 0 ? (
          filter === "favorites" ? (
            <EmptyState
              title={t.market.emptyFavoritesTitle}
              description={t.market.emptyFavoritesHint}
              action={
                <Button variant="secondary" onClick={() => onFilterChange("all")}>
                  {t.market.emptyFavoritesAction}
                </Button>
              }
            />
          ) : (
            <EmptyState title={emptyTitle} description={t.market.emptyHint} />
          )
        ) : null}

        {view === "list" && !waiting && !failed && listRows.length > 0 ? (
          <>
            {quotesFailed ? (
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm text-fg-muted">{t.market.loadError}</p>
                <Button variant="secondary" onClick={retry}>
                  {t.states.retry}
                </Button>
              </div>
            ) : null}

            <div
              aria-hidden
              className="hidden items-center justify-end border-b border-border pb-1.5 pr-11 text-[11px] font-medium tracking-[0.08em] text-fg-subtle uppercase sm:flex"
            >
              Precio / Var. 24 h
            </div>

            <ul className="flex min-w-0 flex-col divide-y divide-border">
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

            {pageFailed ? (
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm text-fg-muted">{t.market.loadError}</p>
                <Button variant="secondary" onClick={retry}>
                  {t.states.retry}
                </Button>
              </div>
            ) : null}

            {hasMore && !pageFailed ? (
              <div className="flex flex-col items-start gap-3 pt-2">
                <Button variant="secondary" onClick={() => setPage((value) => value + 1)} disabled={loadingMore}>
                  {loadMoreLabel}
                </Button>
                <div aria-hidden className="h-px w-full max-w-xs overflow-hidden rounded-full bg-surface-3">
                  <div className="h-full rounded-full bg-fg" style={{ width: `${loadedPct}%` }} />
                </div>
                <span className="sr-only">
                  {t.market.showingOf.replace("{shown}", String(listRows.length)).replace("{total}", String(total))}
                </span>
                {loadingMore ? (
                  <div
                    role="status"
                    aria-live="polite"
                    aria-busy="true"
                    className="flex w-full flex-col divide-y divide-border"
                  >
                    <span className="sr-only">{t.states.loading}</span>
                    <Skeleton className="h-16 w-full rounded-none" />
                    <Skeleton className="h-16 w-full rounded-none" />
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}

        {/* Vista de mapa de calor: reemplaza sólo la lista; el resto sigue igual.
            Sin cotizaciones no se pinta ninguna celda. */}
        {view === "heatmap" && !waiting && !failed && listRows.length > 0 ? (
          heatmapRows.length > 0 ? (
            <MarketHeatmap rows={heatmapRows} />
          ) : quotesFailed ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm text-fg-muted">{t.market.loadError}</p>
              <Button variant="secondary" onClick={retry}>
                {t.states.retry}
              </Button>
            </div>
          ) : (
            <ResultsSkeleton label={t.states.loading} />
          )
        ) : null}
      </section>

      {/* Las más movidas del lote visible, en una línea de datos: sin tarjetas. */}
      {!waiting && !failed && moverItems.length > 0 ? (
        <section
          aria-labelledby={moversTitleId}
          className="flex min-w-0 flex-col gap-3 border-t border-border/70 pt-5"
        >
          <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <h2 id={moversTitleId} className="text-[13px] font-medium text-fg">
              {t.market.movers}
            </h2>
            <p className="text-[13px] leading-5 text-fg-muted">{t.market.moversNote}</p>
          </div>
          <ul className="flex flex-wrap items-center gap-x-6 gap-y-2">
            {moverItems.map(({ entry, price, currency: rowCurrency }) => (
              <li key={entry.item.symbol} className="min-w-0">
                <Link
                  href={tickerHref(entry.item.symbol)}
                  className="group flex items-baseline gap-2 rounded-md transition-colors"
                >
                  <span className="num text-[13px] font-medium text-fg group-hover:underline group-hover:underline-offset-4">
                    {entry.item.symbol}
                  </span>
                  <span className="num text-[13px] text-fg-muted">{formatMoney(price, rowCurrency)}</span>
                  <ChangeBadge value={entry.quote.change24hPct} size="sm" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {status.data ? (
        <FloatingMarketOrb session={status.data.session} nextChange={status.data.nextChange} language={language} />
      ) : null}
      {/* La píldora del horario y las tabs no deben tapar la última fila. */}
      <div aria-hidden className="h-16 lg:hidden" />
    </motion.div>
  );
}
