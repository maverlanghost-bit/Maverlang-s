"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useInfiniteQuery } from "@tanstack/react-query";
import { AssetMarketRow } from "@/components/market/asset-row";
import { ActiveFilters, FilterPanel } from "@/components/market/filter-panel";
import { MarketHeatmap } from "@/components/domain/market-heatmap";
import { PriceFreshness } from "@/components/domain/price-freshness";
import { TickerLogo } from "@/components/domain/ticker-logo";
import { ChangeBadge } from "@/components/domain/change-badge";
import { Sparkline } from "@/components/domain/sparkline";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { searchMarket } from "@/lib/api/client";
import { useFx, useHistories, usePrices } from "@/lib/hooks/queries";
import { useFavorites, useSyncFavorites } from "@/lib/hooks/use-favorites";
import { useT } from "@/lib/hooks/use-t";
import { downsample, isRealSparkHistory, MARKET_FILTERS, type MarketFilter } from "@/lib/market/browse";
import { DEFAULT_SCREENER, parseScreener, SCREENER_PAGE_SIZE, screenerRows, screenerSearch, type ScreenerFilters } from "@/lib/market/screener";
import { formatMoney } from "@/lib/format";
import type { Currency } from "@/lib/types";

const control = "min-h-11 w-full min-w-0 rounded-lg border border-border-control bg-bg px-3 text-base text-fg sm:text-sm";
const href = (symbol: string) => `/app/accion/${encodeURIComponent(symbol)}`;

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="flex min-w-0 flex-col gap-1.5 text-xs font-medium text-fg-muted">{label}{children}</label>;
}

export function ScreenerScreen({ sections, initialSearch = "" }: { sections?: ReactNode; initialSearch?: string }) {
  const { t, language, currency } = useT();
  const en = language === "en";
  const [filters, setFilters] = useState(() => parseScreener(initialSearch).filters);
  const [targetPages, setTargetPages] = useState(() => parseScreener(initialSearch).pages);
  const [view, setView] = useState(() => parseScreener(initialSearch).view);
  const [selected, setSelected] = useState(() => parseScreener(initialSearch).selected);
  const [visibleCount, setVisibleCount] = useState(50);
  const [columns, setColumns] = useState({ issuer: true, liquidity: true, trend: true });
  const catalog = useInfiniteQuery({
    queryKey: ["screener-catalog", SCREENER_PAGE_SIZE],
    initialPageParam: 1,
    queryFn: ({ pageParam }) => searchMarket({ page: pageParam, pageSize: SCREENER_PAGE_SIZE, sort: "liquidity", scope: "curated" }),
    getNextPageParam: (last) => last.hasMore ? last.page + 1 : undefined,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const pageCount = catalog.data?.pages.length ?? 0;
  const restoring = pageCount < targetPages && catalog.hasNextPage;
  const { fetchNextPage } = catalog;
  useEffect(() => {
    if (restoring && !catalog.isFetching && !catalog.isError) void fetchNextPage();
  }, [restoring, catalog.isFetching, catalog.isError, fetchNextPage]);
  useEffect(() => {
    const search = screenerSearch(filters, targetPages, view, selected);
    const next = `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`;
    if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== next) window.history.replaceState(window.history.state, "", next);
  }, [filters, targetPages, view, selected]);
  useEffect(() => {
    const onPop = () => {
      const restored = parseScreener(window.location.search);
      setFilters(restored.filters); setTargetPages(restored.pages); setView(restored.view); setSelected(restored.selected); setVisibleCount(50);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const items = useMemo(() => {
    const seen = new Set<string>();
    return (catalog.data?.pages.flatMap((page) => page.items) ?? []).filter((item) => {
      const key = item.symbol.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });
  }, [catalog.data]);
  const symbols = useMemo(() => items.map((item) => item.symbol), [items]);
  const prices = usePrices(symbols, !restoring && !catalog.isFetchingNextPage, 30_000);
  const quotes = useMemo(() => new Map((prices.data ?? []).map((quote) => [quote.symbol.toLowerCase(), quote])), [prices.data]);
  const rows = useMemo(() => screenerRows(items, quotes, filters), [items, quotes, filters]);
  const shown = rows.slice(0, visibleCount);
  const fx = useFx();
  const rate = fx.data?.rate;
  const fxKnown = typeof rate === "number" && Number.isFinite(rate) && rate > 0;
  const shownCurrency: Currency = currency === "CLP" && fxKnown ? "CLP" : "USD";
  const multiplier = shownCurrency === "CLP" && typeof rate === "number" ? rate : 1;
  const { symbols: favorites, toggle } = useFavorites();
  useSyncFavorites();
  const favoriteSet = useMemo(() => new Set(favorites ?? []), [favorites]);
  const trendSymbols = columns.trend && view === "table" ? shown.map((row) => row.item.symbol) : [];
  const histories = useHistories(trendSymbols, "1W", prices.isSuccess && !restoring);
  const sparkBySymbol = new Map<string, { values: number[]; label: string }>();
  histories.forEach((history, index) => {
    const data = history.data;
    const symbol = trendSymbols[index];
    if (!symbol || !data || !isRealSparkHistory(data) || data.points.length < 2) return;
    sparkBySymbol.set(symbol, { values: downsample(data.points.map((point) => point.p)), label: data.source === "closes" ? (en ? "1 week · underlying reference" : "1 semana · referencia del subyacente") : (en ? "1 week · token observations" : "1 semana · observaciones del token") });
  });
  const timestamps = [...quotes.values()].map((quote) => Date.parse(quote.updatedAt)).filter(Number.isFinite);
  const oldestAt = timestamps.length ? Math.min(...timestamps) : null;
  const total = catalog.data?.pages[0]?.total ?? 0;
  const hasDemo = [...quotes.values()].some((quote) => quote.source === "mock");
  const hasReference = [...quotes.values()].some((quote) => quote.reference);
  const anyStale = [...quotes.values()].some((quote) => quote.stale);
  const issuerLabel = (issuer: string) => issuer === "xstocks" ? "xStocks" : issuer === "ondo" ? "Ondo" : (en ? "Not identified" : "Sin identificar");
  const sectorLabel = (sector: string) => t.market[sector as MarketFilter] ?? sector;
  const active = [
    ...(filters.query ? [{ id: "q", label: filters.query, remove: () => update({ query: "" }) }] : []),
    ...(filters.sector !== "all" ? [{ id: "sector", label: sectorLabel(filters.sector), remove: () => update({ sector: "all" }) }] : []),
    ...(filters.issuer !== "all" ? [{ id: "issuer", label: issuerLabel(filters.issuer), remove: () => update({ issuer: "all" }) }] : []),
    ...(filters.performance !== "all" ? [{ id: "performance", label: filters.performance === "up" ? t.market.gain : filters.performance === "down" ? t.market.loss : "|24 h| ≥ 3 %", remove: () => update({ performance: "all" }) }] : []),
    ...(filters.minLiquidity ? [{ id: "liquidity", label: `≥ ${formatMoney(filters.minLiquidity, "USD")}`, remove: () => update({ minLiquidity: 0 }) }] : []),
  ];
  function update(patch: Partial<ScreenerFilters>) { setFilters((current) => ({ ...current, ...patch })); setVisibleCount(50); }
  function clear() { setFilters(DEFAULT_SCREENER); setVisibleCount(50); }
  function select(symbol: string) {
    setSelected((current) => current.some((value) => value.toLowerCase() === symbol.toLowerCase()) ? current.filter((value) => value.toLowerCase() !== symbol.toLowerCase()) : current.length < 4 ? [...current, symbol] : current);
  }
  const selectionSet = new Set(selected.map((symbol) => symbol.toLowerCase()));
  const heatmap = shown.flatMap(({ item, quote }) => quote && Number.isFinite(quote.change24hPct) ? [{ symbol: item.symbol, name: item.name, priceUsd: quote.priceUsd, change24hPct: quote.change24hPct, priceFormatted: formatMoney(quote.priceUsd * multiplier, shownCurrency) }] : []);

  return <div className="flex min-w-0 flex-col gap-6">
    {sections}
    <header className="flex flex-col gap-2"><h1 className="text-2xl tracking-tight">Screener</h1><p className="max-w-2xl text-sm text-fg-muted">{en ? "Explore sectors, liquidity and daily changes, then compare your selection." : "Explora sectores, liquidez y variación diaria; después compara tu selección."}</p></header>
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-44 flex-1"><Field label={t.market.searchLabel}><input type="search" value={filters.query} maxLength={64} onChange={(event) => update({ query: event.target.value })} placeholder={en ? "Search loaded stocks" : "Buscar entre acciones cargadas"} className={control} /></Field></div>
      <FilterPanel activeCount={active.filter((value) => value.id !== "q").length}>
        <Field label={en ? "Sector" : "Sector"}><select value={filters.sector} onChange={(event) => update({ sector: event.target.value })} className={control}>{MARKET_FILTERS.filter((value) => value !== "favorites").map((value) => <option key={value} value={value}>{sectorLabel(value)}</option>)}</select></Field>
        <Field label={en ? "Issuer" : "Emisor"}><select value={filters.issuer} onChange={(event) => update({ issuer: event.target.value as ScreenerFilters["issuer"] })} className={control}><option value="all">{t.market.all}</option>{["xstocks", "ondo", "unknown"].map((value) => <option key={value} value={value}>{issuerLabel(value)}</option>)}</select></Field>
        <Field label={en ? "Change in 24 h" : "Variación en 24 h"}><select value={filters.performance} onChange={(event) => update({ performance: event.target.value as ScreenerFilters["performance"] })} className={control}><option value="all">{t.market.all}</option><option value="up">{en ? "Positive" : "Positiva"}</option><option value="down">{en ? "Negative" : "Negativa"}</option><option value="big">|24 h| ≥ 3 %</option></select></Field>
        <Field label={en ? "Minimum liquidity (USD)" : "Liquidez mínima (USD)"}><select value={filters.minLiquidity} onChange={(event) => update({ minLiquidity: Number(event.target.value) })} className={control}><option value={0}>{en ? "Any / unknown" : "Cualquiera / sin dato"}</option>{[10_000, 50_000, 250_000].map((value) => <option key={value} value={value}>{formatMoney(value, "USD")}</option>)}</select></Field>
      </FilterPanel>
      <div className="w-40"><Field label={t.market.sortLabel}><select value={filters.sort} onChange={(event) => update({ sort: event.target.value as ScreenerFilters["sort"] })} className={control}><option value="liquidity">{en ? "Liquidity" : "Liquidez"}</option><option value="gain">{t.market.gain}</option><option value="loss">{t.market.loss}</option><option value="name">A–Z</option></select></Field></div>
      <div className="w-40"><Field label={en ? "View" : "Vista"}><select value={view} onChange={(event) => setView(event.target.value === "heatmap" ? "heatmap" : "table")} className={control}><option value="table">{en ? "Table" : "Tabla"}</option><option value="heatmap">{en ? "Heatmap" : "Mapa de calor"}</option></select></Field></div>
      {view === "table" ? <DropdownMenu><DropdownMenuTrigger asChild><Button variant="secondary">{en ? "Columns" : "Columnas"}</Button></DropdownMenuTrigger><DropdownMenuContent align="end">{(["issuer", "liquidity", "trend"] as const).map((key) => <DropdownMenuCheckboxItem key={key} checked={columns[key]} onSelect={(event) => event.preventDefault()} onCheckedChange={(checked) => setColumns((current) => ({ ...current, [key]: checked === true }))}>{key === "issuer" ? (en ? "Issuer" : "Emisor") : key === "liquidity" ? (en ? "Liquidity (USD)" : "Liquidez (USD)") : (en ? "Trend · 1 week" : "Tendencia · 1 semana")}</DropdownMenuCheckboxItem>)}</DropdownMenuContent></DropdownMenu> : null}
    </div>
    <ActiveFilters language={language} filters={active} onClear={clear} />
    <div className="flex flex-col gap-2 border-y border-border py-3 text-xs text-fg-muted">
      <p role="status">{en ? `${items.length} of ${catalog.data ? total : "—"} stocks loaded · ${rows.length} match · ${shown.length} displayed` : `${items.length} de ${catalog.data ? total : "—"} acciones cargadas · ${rows.length} coinciden · ${shown.length} visibles`}</p>
      <p>{en ? "Filters and rankings apply to the loaded universe. Liquidity is a catalog reference, not an execution guarantee." : "Los filtros y el orden se aplican al universo cargado. La liquidez es una referencia del catálogo, no una garantía de ejecución."}</p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1"><span>{shownCurrency === "CLP" ? (en ? "CLP · conversion at current reference FX" : "CLP · conversión al dólar de referencia actual") : currency === "CLP" ? (en ? "USD · exchange rate unavailable" : "USD · sin tipo de cambio disponible") : "USD"}</span>{hasDemo ? <span>{en ? "Demo prices" : "Precios de demostración"}</span> : null}{hasReference ? <span>{en ? "Includes reference prices" : "Incluye precios de referencia"}</span> : null}<PriceFreshness at={oldestAt} stale={anyStale} /><span>{oldestAt ? (en ? "Oldest observation in the price batch" : "Observación más antigua del lote de precios") : null}</span></div>
    </div>
    {selected.length ? <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface-1 p-3" aria-label={en ? "Comparison selection" : "Selección para comparar"}>{selected.map((symbol) => <button type="button" key={symbol} onClick={() => select(symbol)} aria-label={`${en ? "Remove" : "Quitar"} ${symbol}`} className="min-h-11 rounded-full bg-bg px-3 text-sm">{symbol} <span aria-hidden>×</span></button>)}{selected.length >= 2 ? <Link href={`/app/comparar?activos=${encodeURIComponent(selected.join(","))}`} className="inline-flex min-h-11 items-center rounded-full bg-fg px-4 text-sm text-bg">{en ? "Compare selection" : "Comparar selección"}</Link> : <span className="text-xs text-fg-muted">{en ? "Select one more stock" : "Selecciona una acción más"}</span>}<button type="button" onClick={() => setSelected([])} className="min-h-11 px-2 text-xs underline">{en ? "Clear selection" : "Limpiar selección"}</button><span className="text-xs text-fg-muted">{selected.length}/4 · {en ? "kept when filtering" : "se conserva al filtrar"}</span></div> : <p className="text-xs text-fg-muted">{en ? "Select 2–4 stocks to compare." : "Selecciona entre 2 y 4 acciones para comparar."}</p>}
    {catalog.isPending ? <div role="status" aria-label={t.states.loading}><Skeleton className="h-64 w-full" /></div> : catalog.isError && !items.length ? <ErrorState title={t.market.loadError} onRetry={() => { void catalog.refetch(); }} retryLabel={t.states.retry} /> : <>
      {restoring || catalog.isFetchingNextPage ? <p role="status" className="text-sm text-fg-muted">{en ? "Loading catalog pages…" : "Cargando páginas del catálogo…"}</p> : null}
      {prices.isError ? <ErrorState title={en ? "Prices could not be refreshed" : "No se pudieron actualizar los precios"} onRetry={() => { void prices.refetch(); }} retryLabel={t.states.retry} /> : prices.isPending && symbols.length ? <p role="status" className="text-xs text-fg-muted">{en ? "Loading prices; daily filters will update when available." : "Cargando precios; los filtros de variación se actualizarán al recibirlos."}</p> : null}
      {!rows.length && !restoring && !prices.isPending ? <EmptyState title={en ? "No matches in the loaded universe" : "Sin coincidencias entre los activos cargados"} description={en ? "Clear filters or load more stocks." : "Limpia filtros o carga más acciones."} action={<Button variant="secondary" onClick={clear}>{en ? "Clear filters" : "Limpiar filtros"}</Button>} /> : null}
      {view === "heatmap" ? <><MarketHeatmap rows={heatmap} /><p className="text-xs text-fg-muted">{en ? "Only stocks with a price and known daily change are shown. Use Table to select assets." : "Sólo se muestran acciones con precio y variación diaria conocidos. Usa Tabla para seleccionar activos."}</p></> : <>
        <ul className="divide-y divide-border lg:hidden">{shown.map(({ item, quote, issuer }) => {
          const checked = selectionSet.has(item.symbol.toLowerCase());
          return <li key={item.symbol}><AssetMarketRow href={href(item.symbol)} symbol={item.symbol} name={item.name} logoUrl={item.logoUrl} price={quote ? quote.priceUsd * multiplier : null} currency={shownCurrency} change={quote && Number.isFinite(quote.change24hPct) ? quote.change24hPct : null} pricePending={prices.isPending} selected={checked} selectionDisabled={!checked && selected.length >= 4} selectionLabel={`${en ? "Compare" : "Comparar"} ${item.name} · ${item.symbol}`} onSelect={select} favoritePressed={favoriteSet.has(item.symbol)} favoriteLabel={`${favoriteSet.has(item.symbol) ? t.market.favoriteOn : t.market.favoriteOff}`.replace("{name}", item.name)} onToggleFavorite={toggle} noPriceLabel={en ? "No price" : "Sin precio"} unavailableLabel={t.detail.unavailable} lowLiquidityLabel={item.lowLiquidity ? t.market.lowLiquidity : null} reviewLabel={item.underReview ? t.market.underReview : null} detail={issuerLabel(issuer)} sparkline={sparkBySymbol.get(item.symbol)?.values} trendLabel={sparkBySymbol.get(item.symbol)?.label} /></li>;
        })}</ul>
        <div className="hidden overflow-x-auto lg:block"><table className="w-full text-left text-sm"><caption className="sr-only">{en ? "Stocks in the loaded universe; prices and change in 24 hours" : "Acciones del universo cargado; precio y variación en 24 horas"}</caption><thead className="border-b border-border text-xs text-fg-muted"><tr><th className="w-11"><span className="sr-only">{en ? "Select" : "Seleccionar"}</span></th><th className="py-3">{en ? "Stock" : "Acción"}</th><th className="text-right">{en ? "Price" : "Precio"} · {shownCurrency}</th><th className="px-4 text-right">24 h</th>{columns.issuer ? <th className="px-3">{en ? "Issuer" : "Emisor"}</th> : null}{columns.liquidity ? <th className="px-3 text-right">{en ? "Liquidity · USD" : "Liquidez · USD"}</th> : null}{columns.trend ? <th className="pl-3">1S</th> : null}</tr></thead><tbody className="divide-y divide-border">{shown.map(({ item, quote, issuer }) => {
          const checked = selectionSet.has(item.symbol.toLowerCase()); const spark = sparkBySymbol.get(item.symbol);
          return <tr key={item.symbol} className="hover:bg-surface-1"><td><label className="flex size-11 items-center justify-center"><input type="checkbox" checked={checked} disabled={!checked && selected.length >= 4} onChange={() => select(item.symbol)} aria-label={`${en ? "Compare" : "Comparar"} ${item.name} · ${item.symbol}`} className="size-4 accent-fg" /></label></td><td><Link href={href(item.symbol)} className="flex min-h-16 items-center gap-3 py-2"><TickerLogo symbol={item.symbol} name={item.name} logoUrl={item.logoUrl} size={32} decorative /><span><span className="font-mono font-medium">{item.symbol}</span><span className="block text-xs text-fg-muted">{item.name}</span>{item.underReview || item.lowLiquidity ? <span className="block text-xs text-warn">{[item.underReview ? t.market.underReview : null, item.lowLiquidity ? t.market.lowLiquidity : null].filter(Boolean).join(" · ")}</span> : null}</span></Link></td><td className="num text-right" title={quote ? `${quote.updatedAt} · ${quote.source ?? "—"}${quote.reference ? " · referencia" : ""}` : undefined}>{quote ? formatMoney(quote.priceUsd * multiplier, shownCurrency) : "—"}</td><td className="px-4 text-right">{quote && Number.isFinite(quote.change24hPct) ? <ChangeBadge value={quote.change24hPct} size="sm" /> : "—"}</td>{columns.issuer ? <td className="px-3 text-xs text-fg-muted">{issuerLabel(issuer)}</td> : null}{columns.liquidity ? <td className="num px-3 text-right text-xs">{item.liquidityUsd === null ? (en ? "Unknown" : "Sin dato") : formatMoney(item.liquidityUsd, "USD")}</td> : null}{columns.trend ? <td className="pl-3">{spark ? <span title={spark.label}><Sparkline data={spark.values} width={80} height={28} change={(spark.values.at(-1) ?? 0) - (spark.values[0] ?? 0)} /><span className="sr-only">{spark.label}</span></span> : <span className="text-xs text-fg-muted">—</span>}</td> : null}</tr>;
        })}</tbody></table></div>
        {shown.length ? <p className="text-xs text-fg-muted">{en ? "Issuer inferred from the catalog symbol. Weekly trends may use the underlying as reference; open the stock for the source details." : "Emisor identificado por el símbolo del catálogo. La tendencia semanal puede usar el subyacente como referencia; abre la ficha para consultar su procedencia."}</p> : null}
      </>}
      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
        {rows.length > shown.length ? <Button variant="secondary" onClick={() => setVisibleCount((value) => value + 50)}>{en ? "Show 50 more results" : "Mostrar 50 resultados más"}</Button> : null}
        {catalog.hasNextPage && pageCount < 20 ? <><Button variant="secondary" disabled={catalog.isFetching || restoring} onClick={() => setTargetPages(pageCount + 1)}>{en ? "Load 50 more stocks" : "Cargar 50 acciones más"}</Button><button type="button" className="min-h-11 text-sm underline" disabled={catalog.isFetching || restoring} onClick={() => setTargetPages(Math.min(20, Math.ceil(total / SCREENER_PAGE_SIZE)))}>{total > 1000 ? (en ? "Analyze up to 1,000 stocks" : "Analizar hasta 1.000 acciones") : (en ? "Analyze full catalog" : "Analizar catálogo completo")}</button></> : null}
        {catalog.isError && items.length ? <Button variant="secondary" onClick={() => { void fetchNextPage(); }}>{t.states.retry}</Button> : null}
        {catalog.hasNextPage && pageCount >= 20 ? <p className="text-xs text-fg-muted">{en ? "Analysis limit: 1,000 stocks." : "Límite de análisis: 1.000 acciones."}</p> : null}
      </div>
      {filters.query ? <Link href={`/app?q=${encodeURIComponent(filters.query)}`} className="w-fit text-sm underline">{en ? "Search this name across Market" : "Buscar este nombre en todo Mercado"}</Link> : null}
    </>}
  </div>;
}
