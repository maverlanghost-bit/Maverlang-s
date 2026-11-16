"use client";

import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQueries } from "@tanstack/react-query";

import { ActiveFilters, FilterPanel } from "@/components/market/filter-panel";
import { AssetMarketRow as MarketListRow } from "@/components/market/asset-row";
import { MarketHeatmap } from "@/components/domain/market-heatmap";
import { MarketToday } from "@/components/domain/market-today/market-today";
import { FloatingMarketOrb } from "@/components/domain/market-status-pill";
import { PriceFreshness } from "@/components/domain/price-freshness";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { indexFromKey } from "@/components/ui/keys";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { formatMoney, formatPercent } from "@/lib/format";
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

function withMarketParams(params: URLSearchParams, filter: MarketFilter, sort: MarketSort, query: string, page: number, view: MarketView) {
  if (query.trim()) params.set("q", query.trim()); else params.delete("q");
  if (page > 1) params.set("paginas", String(page)); else params.delete("paginas");
  if (view === "heatmap") params.set("vista", view); else params.delete("vista");
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

/** Missing daily changes stay at the end, never become zero. */
function orderRows(rows: readonly MarketRow[], sort: MarketSort): MarketRow[] {
  if (sort !== "gain" && sort !== "loss") return [...rows];
  return [...rows].sort((a, b) => {
    const left = a.quote && Number.isFinite(a.quote.change24hPct) ? a.quote.change24hPct : null;
    const right = b.quote && Number.isFinite(b.quote.change24hPct) ? b.quote.change24hPct : null;
    if (left === null && right !== null) return 1;
    if (right === null && left !== null) return -1;
    return left !== null && right !== null ? (sort === "gain" ? right - left : left - right) || a.index - b.index : a.index - b.index;
  });
}

function pageNumber(value: string | null | undefined) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(20, parsed) : 1;
}

/** Top por |variación| sobre filas ya cotizadas. Criterio objetivo: no es una selección editorial. */
function moversOfPriced(rows: readonly PricedItem[], limit = 3): PricedItem[] {
  return [...rows]
    .sort((a, b) => Math.abs(changeOf(b)) - Math.abs(changeOf(a)) || a.index - b.index)
    .slice(0, limit);
}

/**
 * Criterio de filtro y orden como texto: sin cápsula ni relleno. El activo
 * toma tinta y subrayado (2px); el resto queda en gris y sólo oscurece al
 * pasar el puntero. 44px de alto en móvil; 32px con puntero. El foco se ve
 * como anillo, no sólo como color.
 */
const chipClass =
  "inline-flex min-h-11 min-w-11 shrink-0 cursor-pointer snap-start items-center justify-center rounded-xs text-[13px] leading-5 font-medium whitespace-nowrap transition-colors duration-150 ease-spring outline-none focus-visible:ring-2 focus-visible:ring-fg focus-visible:ring-offset-2 focus-visible:ring-offset-bg sm:min-h-8";
const chipActiveClass = "text-fg";
const chipIdleClass = "text-fg-muted hover:text-fg";
/** Subrayado en el rótulo (no en el flex): siempre se dibuja bajo el texto. */
const chipMarkClass = "underline decoration-2 underline-offset-[5px]";

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
      className={cn(
        // Un solo carril en móvil: los chips no envuelven ni empujan la página,
        // se desplazan dentro de su propio scroll con snap. Desde sm envuelven.
        "no-scrollbar -mx-5 flex min-w-0 snap-x snap-mandatory items-center gap-x-5 overflow-x-auto overscroll-x-contain px-5 py-0.5",
        "sm:mx-0 sm:flex-wrap sm:gap-x-6 sm:overflow-visible sm:px-0 sm:py-0",
      )}
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
            <span className={cn(selected && chipMarkClass)}>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function ResultsSkeleton({ label }: { label: string }) {
  // Mismo esqueleto que `components/ui/skeleton`, con la retícula real:
  // logo, símbolo + nombre, sparkline (desde sm), precio + variación y el
  // área del favorito. Así las columnas no saltan al llegar el catálogo.
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="flex flex-col gap-2">
      <span className="sr-only">{label}</span>
      <div className="flex flex-col divide-y divide-border" aria-hidden>
        {["a", "b", "c", "d", "e", "f", "g", "h"].map((key) => (
          <div key={key} className="flex min-h-16 items-center gap-3 px-1 py-2 sm:gap-4">
            <Skeleton className="size-9 shrink-0 rounded-full" />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Skeleton className="h-3.5 w-14" />
              <Skeleton className="h-3 w-32 max-w-full" />
            </div>
            <Skeleton className="hidden h-8 w-[88px] shrink-0 sm:block" />
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

/** Mismo aviso para catálogo, precios y paginación: un error no cambia de forma. */
function LoadFailure({ message, retryLabel, onRetry }: { message: string; retryLabel: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <p className="inline-flex items-center gap-2 text-[13px] leading-5 text-fg-muted">
        <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-down" />
        {message}
      </p>
      <Button variant="secondary" size="sm" onClick={onRetry}>
        {retryLabel}
      </Button>
    </div>
  );
}

export function MarketScreen({
  initialFilter,
  initialSort,
  initialQuery = "",
  initialPage = "",
  initialView = "",
  sections,
}: {
  initialFilter: string;
  initialSort: string;
  initialQuery?: string;
  initialPage?: string;
  initialView?: string;
  /** Navegación de secciones del mercado (Acciones · Cripto · Ganar · Copiar). */
  sections?: ReactNode;
}) {
  const { t, currency, language } = useT();
  const router = useRouter();
  const pathname = usePathname();
  const moversTitleId = useId();
  const listTitleId = useId();

  const [filter, setFilter] = useState<MarketFilter>(() => parseFilter(initialFilter));
  const [sort, setSort] = useState<MarketSort>(() => parseSort(initialSort));
  const [page, setPage] = useState(() => pageNumber(initialPage));
  const [view, setView] = useState<MarketView>(initialView === "heatmap" ? "heatmap" : "list");
  const [draft, setDraft] = useState(initialQuery.slice(0, 64));
  const [query, setQuery] = useState(initialQuery.trim().slice(0, 64));
  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(draft.trim()), 200);
    return () => window.clearTimeout(timer);
  }, [draft]);

  // Favoritas vive en este navegador: el servidor devuelve todo y se filtra aquí.
  const serverCategory = filter === "favorites" ? "all" : filter;
  const serverSort = sort === "az" ? "name" : "liquidity";

  // Una consulta del servidor por página cargada. Al cambiar el criterio, la página vuelve a 1.
  // Opciones memoizadas: un array nuevo en cada render vuelve a suscribir useQueries.
  const searchQueryOptions = useMemo(
    () =>
      Array.from({ length: page }, (_, index) => {
        const pageNum = index + 1;
        return {
          queryKey: ["market-search", query, serverCategory, pageNum, PAGE_SIZE, serverSort, "curated"] as const,
          queryFn: () =>
            searchMarket({
              q: query,
              category: serverCategory,
              page: pageNum,
              pageSize: PAGE_SIZE,
              sort: serverSort,
            }),
          staleTime: SEARCH_STALE_MS,
        };
      }),
    [page, query, serverCategory, serverSort],
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
  // Conservative batch timestamp: a recent row must not hide older observations.
  const freshestAt = (() => {
    const times = [...quotesBySymbol.values()].map((quote) => Date.parse(quote.updatedAt)).filter(Number.isFinite);
    return times.length ? Math.min(...times) : null;
  })();
  const hasDemo = [...quotesBySymbol.values()].some((quote) => quote.source === "mock");
  const hasReference = [...quotesBySymbol.values()].some((quote) => quote.reference);
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
    withMarketParams(params, filter, sort, draft, page, view);
    const searchText = params.toString();
    if (canonicalSearch(window.location.search) === canonicalSearch(searchText ? `?${searchText}` : "")) return;
    router.replace(searchText ? `${pathname}?${searchText}` : pathname, { scroll: false });
  }, [filter, pathname, router, sort, draft, page, view]);

  useEffect(() => {
    const onPop = () => {
      const params = new URLSearchParams(window.location.search);
      setFilter(parseFilter(params.get("filtro")));
      const parsed = parseSort(params.get("orden"));
      setSort(parsed);
      setDraft((params.get("q") ?? "").slice(0, 64));
      setQuery((params.get("q") ?? "").trim().slice(0, 64));
      setPage(pageNumber(params.get("paginas")));
      setView(params.get("vista") === "heatmap" ? "heatmap" : "list");
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
      map.set(symbol, downsample(points.map((point) => point.p)));
    });
    return map;
  }, [sparkSymbols, histories]);

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
  // Estable para `heatmapRows`: la lista vacía de los estados de carga/error
  // no debe rearmar el mapa de calor en cada render.
  const listRows = useMemo(() => (waiting || failed ? [] : ordered), [failed, ordered, waiting]);
  /** Filas del mapa de calor: mismas filas ordenadas/filtradas, sin inventar cifras
      (se descarta toda fila sin cotización o sin precio formateable). */
  const heatmapRows = useMemo(() => {
    const out: HeatmapRow[] = [];
    for (const entry of listRows) {
      const quote = entry.quote;
      if (!quote || !Number.isFinite(quote.change24hPct)) continue;
      const priced = priceRows([{ item: entry.item, quote, index: entry.index }], currency, rate)[0];
      if (!priced) continue;
      out.push({
        symbol: entry.item.symbol,
        name: entry.item.name,
        priceUsd: quote.priceUsd,
        change24hPct: quote.change24hPct,
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
    { value: "az", label: "A–Z" },
  ];
  // Rótulos fijos del conmutador de vista (no hay claves de i18n para esto).
  const viewOptions: { value: MarketView; label: string }[] = [
    { value: "list", label: language === "en" ? "List" : "Lista" },
    { value: "heatmap", label: language === "en" ? "Heatmap" : "Mapa de calor" },
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
    if (value === "az" || sort === "az") setPage(1);
  }

  function retry() {
    for (const query of searchQueries) void query.refetch();
    for (const query of priceQueries) void query.refetch();
    void status.refetch();
    if (currency === "CLP") void fx.refetch();
  }

  const emptyTitle = draft ? `${t.market.emptyFor} «${draft}»` : `${t.market.emptyFor} «${t.market[filter]}»`;
  function clearFilters() { setFilter("all"); setSort("popular"); setDraft(""); setQuery(""); setPage(1); }
  /** Ningún precio del lote todavía: la fila muestra marcador, nunca un cero. */
  const pricePending = quotesBySymbol.size === 0 && (firstPrices?.isPending ?? true);
  const noPriceLabel = language === "en" ? "No price" : "Sin precio";

  return (
    <div className="flex min-w-0 flex-col gap-8 lg:gap-10">
      <h1 className="sr-only">{t.pages.market.title}</h1>
      {sections ? <div className="-mx-5 min-w-0 px-5 sm:mx-0 sm:px-0">{sections}</div> : null}

      {!draft && filter === "all" ? <MarketToday /> : null}

      <section
        aria-labelledby={listTitleId}
        className="flex min-w-0 flex-wrap items-center gap-x-6 gap-y-4"
      >
        <h2 id={listTitleId} className="min-w-0 flex-1 text-xl leading-tight tracking-tight text-fg">
          {t.market.list}
        </h2>
        {/* Vista: mismo criterio de texto que el orden y las categorías. */}
        <div className="min-w-0 max-w-full shrink-0">
          <ChipGroup
            ariaLabel={language === "en" ? "Market view" : "Vista del mercado"}
            value={view}
            options={viewOptions}
            onChange={setView}
          />
        </div>

        {/* Conteo real y frescura en una sola línea de dato. Sin cifras hasta
            que el catálogo llegue. */}
        <div className="flex w-full min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 border-t border-border pt-4 text-[13px] leading-5 text-fg-muted">
          {total > 0 ? (
            <>
              <span
                className="num font-medium tabular-nums text-fg"
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
              <span aria-hidden className="text-fg-muted">
                ·
              </span>
            </>
          ) : null}
          <PriceFreshness at={freshestAt} stale={anyStale} className="text-[13px] leading-5" />
          {freshestAt ? <span className="text-xs">{language === "en" ? "Oldest observation in this batch" : "Observación más antigua del lote"}</span> : null}
        </div>

        <div className="flex w-full min-w-0 flex-wrap items-end gap-3">
          <label className="flex min-w-40 flex-1 flex-col gap-1.5 text-xs text-fg-muted">{t.market.searchLabel}<input type="search" value={draft} maxLength={64} onChange={(event) => { setDraft(event.target.value); setPage(1); }} placeholder={language === "en" ? "Name or symbol" : "Nombre o símbolo"} className="min-h-11 rounded-lg border border-border-control bg-bg px-3 text-base text-fg sm:text-sm" /></label>
          <FilterPanel activeCount={filter === "all" ? 0 : 1}>
            <label className="flex flex-col gap-1.5 text-xs text-fg-muted">{filtersTitle}<select value={filter} onChange={(event) => onFilterChange(parseFilter(event.target.value))} className="min-h-11 rounded-lg border border-border-control bg-bg px-3 text-base text-fg sm:text-sm">{filterOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          </FilterPanel>
          <label className="flex w-40 flex-col gap-1.5 text-xs text-fg-muted">{t.market.sortLabel}<select value={sort} onChange={(event) => onSortChange(parseSort(event.target.value))} className="min-h-11 rounded-lg border border-border-control bg-bg px-3 text-base text-fg sm:text-sm">{sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        </div>
        <div className="w-full"><ActiveFilters filters={[
          ...(draft ? [{ id: "q", label: draft, remove: () => { setDraft(""); setQuery(""); setPage(1); } }] : []),
          ...(filter !== "all" ? [{ id: "category", label: activeFilterLabel, remove: () => onFilterChange("all") }] : []),
        ]} onClear={clearFilters} /></div>
        {draft.trim() !== query ? <p role="status" className="w-full text-xs text-fg-muted">{t.states.loading}</p> : null}
        {sort === "gain" || sort === "loss" || filter === "favorites" ? <p className="w-full text-xs text-fg-muted">{language === "en" ? `Filtered and ranked among ${items.length} loaded stocks. Load more to expand the universe.` : `Filtro y orden entre ${items.length} acciones cargadas. Carga más para ampliar el universo.`}</p> : null}
        <p className="w-full text-xs text-fg-muted">{hasDemo ? (language === "en" ? "Demo prices. " : "Precios de demostración. ") : ""}{hasReference ? (language === "en" ? "Includes reference prices. " : "Incluye precios de referencia. ") : ""}{language === "en" ? "Weekly trends may show the underlying reference; source details are in each stock." : "La tendencia semanal puede mostrar la referencia del subyacente; la procedencia está en cada ficha."}</p>

        {currencyNote ? (
          <p
            className="w-full text-[13px] leading-5 text-fg-muted"
            title={currency === "CLP" && !fxKnown ? t.detail.fxFallback : undefined}
          >
            {currencyNote}
          </p>
        ) : null}

        {currency === "CLP" && !fxKnown && !fx.isPending && !waiting && !failed ? (
          <p className="w-full text-[13px] leading-relaxed text-fg-muted">{t.detail.fxFallback}</p>
        ) : null}

        {waiting ? (
          <div className="w-full">
            <ResultsSkeleton label={t.states.loading} />
          </div>
        ) : null}

        {!waiting && failed ? (
          <div className="w-full">
            <ErrorState
              title={t.market.loadError}
              description={failureDetail && failureDetail !== t.market.loadError ? failureDetail : undefined}
              onRetry={retry}
              retryLabel={t.states.retry}
              label={t.states.error}
            />
          </div>
        ) : null}

        {!waiting && !failed && listRows.length === 0 ? (
          <div className="w-full">
            {filter === "favorites" ? (
              <EmptyState
                title={favoriteSet.size ? (language === "en" ? "No favorites in the loaded results" : "Sin favoritas entre los resultados cargados") : t.market.emptyFavoritesTitle}
                description={favoriteSet.size ? (language === "en" ? "Load more stocks or open your favorites list." : "Carga más acciones o abre tu lista de favoritas.") : t.market.emptyFavoritesHint}
                action={
                  favoriteSet.size ? <Link href="/app/favoritas" className="inline-flex min-h-11 items-center text-sm underline">{t.market.favorites}</Link> : <Button variant="secondary" onClick={() => onFilterChange("all")}>{t.market.emptyFavoritesAction}</Button>
                }
              />
            ) : (
              <EmptyState title={emptyTitle} description={t.market.emptyHint} action={<Button variant="secondary" onClick={clearFilters}>{language === "en" ? "Clear filters" : "Limpiar filtros"}</Button>} />
            )}
          </div>
        ) : null}

        {view === "list" && !waiting && !failed && listRows.length > 0 ? (
          <>
            {quotesFailed ? (
              <div className="w-full">
                <LoadFailure message={t.market.loadError} retryLabel={t.states.retry} onRetry={retry} />
              </div>
            ) : null}

            {/* Rótulo de la columna de cifras; la hairline la pone la lista. */}
            <div
              aria-hidden
              className="hidden w-full items-center justify-end pr-12 sm:flex"
            >
              <span className="label-xs">Precio / Var. 24 h</span>
            </div>

            <ul className="flex w-full min-w-0 flex-col divide-y divide-border border-t border-border">
              {listRows.map((entry) => {
                const shownPrice = entry.quote
                  ? priceRows([{ item: entry.item, quote: entry.quote, index: entry.index }], currency, rate)[0]
                  : undefined;
                const favorite = favoriteSet.has(entry.item.symbol);
                const change =
                  entry.quote && Number.isFinite(entry.quote.change24hPct) ? entry.quote.change24hPct : null;
                return (
                  <li key={entry.item.symbol}>
                    <MarketListRow
                      href={tickerHref(entry.item.symbol)}
                      symbol={entry.item.symbol}
                      name={entry.item.name}
                      logoUrl={entry.item.logoUrl}
                      price={shownPrice?.price ?? null}
                      currency={shownPrice?.currency ?? "USD"}
                      change={change}
                      pricePending={pricePending}
                      sparkline={sparkBySymbol.get(entry.item.symbol)}
                      trendLabel={language === "en" ? "1 week · see source in stock details" : "1 semana · consulta la fuente en la ficha"}
                      lowLiquidityLabel={entry.item.lowLiquidity ? t.market.lowLiquidity : null}
                      reviewLabel={entry.item.underReview ? t.market.underReview : null}
                      reviewHint={entry.item.underReview ? t.market.underReviewHint : null}
                      status={dotFor(entry.item)}
                      favoritePressed={favorite}
                      favoriteLabel={withName(favorite ? t.market.favoriteOn : t.market.favoriteOff, entry.item.name)}
                      onToggleFavorite={toggle}
                      noPriceLabel={noPriceLabel}
                      unavailableLabel={t.detail.unavailable}
                    />
                  </li>
                );
              })}
            </ul>

            {pageFailed ? (
              <div className="w-full">
                <LoadFailure message={t.market.loadError} retryLabel={t.states.retry} onRetry={retry} />
              </div>
            ) : null}

          </>
        ) : null}

        {/* Vista de mapa de calor: reemplaza sólo la lista; el resto sigue igual.
            Sin cotizaciones no se pinta ninguna celda y se dice tal cual. */}
        {view === "heatmap" && !waiting && !failed && listRows.length > 0 ? (
          <div className="w-full">
            {quotesFailed && heatmapRows.length === 0 ? (
              <LoadFailure message={t.market.loadError} retryLabel={t.states.retry} onRetry={retry} />
            ) : heatmapRows.length === 0 && (firstPrices?.isPending ?? false) ? (
              <ResultsSkeleton label={t.states.loading} />
            ) : (
              <MarketHeatmap rows={heatmapRows} />
            )}
          </div>
        ) : null}
        {!waiting && !failed && hasMore && !pageFailed && page < 20 ? <div className="w-full border-t border-border pt-4"><Button variant="secondary" onClick={() => setPage((value) => value + 1)} disabled={loadingMore}>{loadingMore ? t.states.loading : loadMoreLabel}</Button></div> : null}
        {page >= 20 && hasMore ? <Link href="/app/screener" className="min-h-11 text-sm underline">{language === "en" ? "Expand analysis in Screener" : "Ampliar el análisis en Screener"}</Link> : null}
      </section>

      {/* Las más movidas del lote visible, en una línea de dato que envuelve. */}
      {!draft && !waiting && !failed && moverItems.length > 0 ? (
        <section
          aria-labelledby={moversTitleId}
          className="flex min-w-0 flex-col gap-1 border-t border-border pt-5"
        >
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <h2 id={moversTitleId} className="text-[13px] font-medium text-fg">
              {t.market.movers}
            </h2>
            <p className="text-[13px] leading-5 text-fg-muted">{t.market.moversNote}</p>
          </div>
          <ul className="flex flex-wrap items-center gap-x-6">
            {moverItems.map(({ entry, price, currency: rowCurrency }) => {
              const changePct = entry.quote.change24hPct;
              const changeLabel = Number.isFinite(changePct) ? formatPercent(changePct) : "—";
              return (
                <li key={entry.item.symbol} className="min-w-0">
                  <Link
                    href={tickerHref(entry.item.symbol)}
                    className="group inline-flex min-h-11 items-center gap-2 sm:min-h-8"
                  >
                    <span className="num text-[13px] font-medium text-fg group-hover:underline group-hover:underline-offset-4">
                      {entry.item.symbol}
                    </span>
                    <span className="num text-[13px] text-fg-muted">{formatMoney(price, rowCurrency)}</span>
                    <span
                      className={cn(
                        "num text-[13px] font-medium tabular-nums",
                        changePct > 0 ? "text-up" : changePct < 0 ? "text-down" : "text-fg-muted",
                      )}
                    >
                      {changeLabel}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {status.data ? (
        <FloatingMarketOrb session={status.data.session} nextChange={status.data.nextChange} language={language} />
      ) : null}
      {/* La píldora del horario y las tabs no deben tapar la última fila. */}
      <div aria-hidden className="h-16 lg:hidden" />
    </div>
  );
}
