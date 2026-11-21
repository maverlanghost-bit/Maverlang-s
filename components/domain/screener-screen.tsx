"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { ChangeBadge } from "@/components/domain/change-badge";
import { FlashPrice } from "@/components/domain/flash-price";
import { MarketHeatmap, type MarketHeatmapRow } from "@/components/domain/market-heatmap";
import { Sparkline } from "@/components/domain/sparkline";
import { TickerLogo } from "@/components/domain/ticker-logo";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { searchMarket, type MarketSearchItem } from "@/lib/api/client";
import { formatMoney } from "@/lib/format";
import { useFx, useHistories, usePrices } from "@/lib/hooks/queries";
import { useT } from "@/lib/hooks/use-t";
import { displayPrice, downsample, fold, isRealSparkHistory } from "@/lib/market/browse";
import { anchorSeriesToSpot } from "@/lib/market/series";
import type { Currency, Quote } from "@/lib/types";

type SectorFilter =
  | "all"
  | "tech"
  | "etf"
  | "fintech"
  | "consumer"
  | "finance"
  | "health"
  | "energy"
  | "industrial"
  | "commodity";

type IssuerFilter = "all" | "xstocks" | "ondo";
type PerfFilter = "all" | "up" | "down" | "big";
type MinLiquidity = 0 | 10_000 | 50_000 | 250_000;
type ScreenerSort = "liquidity" | "gain" | "loss" | "name";
type ScreenerView = "table" | "heatmap";

const SECTOR_OPTIONS: readonly { value: SectorFilter; label: string; en: string }[] = [
  { value: "all", label: "Todos", en: "All" },
  { value: "tech", label: "Tecnología", en: "Tech" },
  { value: "etf", label: "ETFs", en: "ETFs" },
  { value: "fintech", label: "Fintech", en: "Fintech" },
  { value: "consumer", label: "Consumo", en: "Consumer" },
  { value: "finance", label: "Finanzas", en: "Finance" },
  { value: "health", label: "Salud", en: "Health" },
  { value: "energy", label: "Energía", en: "Energy" },
  { value: "industrial", label: "Industrial", en: "Industrial" },
  { value: "commodity", label: "Materias primas", en: "Commodities" },
];

const ISSUER_OPTIONS: readonly { value: IssuerFilter; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "xstocks", label: "xStocks" },
  { value: "ondo", label: "Ondo" },
];

const PERF_OPTIONS: readonly { value: PerfFilter; label: string; en: string }[] = [
  { value: "all", label: "Todo", en: "All" },
  { value: "up", label: "Alzas (>0%)", en: "Up (>0%)" },
  { value: "down", label: "Bajas (<0%)", en: "Down (<0%)" },
  { value: "big", label: "Movimientos ±3%+", en: "Movers ±3%+" },
];

const LIQUIDITY_OPTIONS: readonly { value: MinLiquidity; label: string }[] = [
  { value: 0, label: "Cualquiera" },
  { value: 10_000, label: "≥ US$10k" },
  { value: 50_000, label: "≥ US$50k" },
  { value: 250_000, label: "≥ US$250k" },
];

const SORT_OPTIONS: readonly { value: ScreenerSort; label: string; en: string }[] = [
  { value: "liquidity", label: "Mayor liquidez", en: "Top liquidity" },
  { value: "gain", label: "Mayor alza 24h", en: "Top gainers" },
  { value: "loss", label: "Mayor baja 24h", en: "Top losers" },
  { value: "name", label: "Nombre A–Z", en: "Name A–Z" },
];

function inferIssuer(symbol: string): "ondo" | "xstocks" {
  return symbol.endsWith("on") ? "ondo" : "xstocks";
}

function issuerLabel(issuer: "ondo" | "xstocks"): string {
  return issuer === "ondo" ? "Ondo" : "xStocks";
}

function formatLiquidityCompact(value: number | null): string {
  if (value === null || !Number.isFinite(value) || value <= 0) return "—";
  if (value >= 1_000_000) return `US$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `US$${Math.round(value / 1_000)}k`;
  return formatMoney(value, "USD");
}

async function fetchScreenerCatalog(): Promise<MarketSearchItem[]> {
  const first = await searchMarket({ q: "", page: 1, pageSize: 50, sort: "liquidity", scope: "listed" });
  if (!first.hasMore || first.items.length >= 60) {
    return first.items.slice(0, 60);
  }
  const second = await searchMarket({ q: "", page: 2, pageSize: 10, sort: "liquidity", scope: "listed" });
  const seen = new Set(first.items.map((item) => item.symbol));
  const merged = [...first.items];
  for (const item of second.items) {
    if (seen.has(item.symbol)) continue;
    seen.add(item.symbol);
    merged.push(item);
    if (merged.length >= 60) break;
  }
  return merged;
}

export function ScreenerScreen({ sections }: { sections?: ReactNode }) {
  const { language, currency } = useT();
  const isEn = language === "en";

  const [query, setQuery] = useState("");
  const [sector, setSector] = useState<SectorFilter>("all");
  const [issuer, setIssuer] = useState<IssuerFilter>("all");
  const [perf, setPerf] = useState<PerfFilter>("all");
  const [minLiquidity, setMinLiquidity] = useState<MinLiquidity>(0);
  const [sort, setSort] = useState<ScreenerSort>("liquidity");
  const [view, setView] = useState<ScreenerView>("table");

  const catalogQuery = useQuery({
    queryKey: ["screener-catalog"],
    queryFn: fetchScreenerCatalog,
    staleTime: 60_000,
  });

  const items = useMemo(() => catalogQuery.data ?? [], [catalogQuery.data]);
  const symbols = useMemo(() => items.map((item) => item.symbol), [items]);

  const pricesQuery = usePrices(symbols, symbols.length > 0);
  const histories = useHistories(symbols, "1W", symbols.length > 0);
  const fx = useFx();

  const quotesBySymbol = useMemo(() => {
    const map = new Map<string, Quote>();
    for (const quote of pricesQuery.data ?? []) {
      map.set(quote.symbol, quote);
    }
    return map;
  }, [pricesQuery.data]);

  const sparkBySymbol = useMemo(() => {
    const map = new Map<string, number[]>();
    symbols.forEach((symbol, index) => {
      const data = histories[index]?.data;
      if (!data || !isRealSparkHistory(data)) return;
      const points = data.points;
      if (!points || points.length < 2) return;
      const spot = quotesBySymbol.get(symbol)?.priceUsd;
      const series = spot !== undefined && spot > 0 ? anchorSeriesToSpot(points, spot) : points;
      map.set(symbol, downsample(series.map((p) => p.p)));
    });
    return map;
  }, [symbols, histories, quotesBySymbol]);

  const rate = fx.data?.rate;
  const fxKnown = typeof rate === "number" && Number.isFinite(rate) && rate > 0;
  const shownCurrency: Currency = currency === "CLP" && fxKnown ? "CLP" : "USD";

  const filteredRows = useMemo(() => {
    const needle = fold(query.trim());
    const out: { item: MarketSearchItem; quote: Quote | null; issuer: "ondo" | "xstocks" }[] = [];

    for (const item of items) {
      if (sector !== "all" && item.category !== sector) continue;
      const itemIssuer = inferIssuer(item.symbol);
      if (issuer !== "all" && itemIssuer !== issuer) continue;
      if (minLiquidity > 0 && (item.liquidityUsd ?? 0) < minLiquidity) continue;

      if (needle) {
        const hit =
          fold(item.symbol).includes(needle) ||
          fold(item.name).includes(needle) ||
          fold(item.underlying).includes(needle);
        if (!hit) continue;
      }

      const quote = quotesBySymbol.get(item.symbol) ?? null;
      if (perf !== "all") {
        if (!quote || !Number.isFinite(quote.change24hPct)) continue;
        const chg = quote.change24hPct;
        if (perf === "up" && chg <= 0) continue;
        if (perf === "down" && chg >= 0) continue;
        if (perf === "big" && Math.abs(chg) < 0.03) continue;
      }

      out.push({ item, quote, issuer: itemIssuer });
    }

    out.sort((a, b) => {
      if (sort === "name") {
        return a.item.name.localeCompare(b.item.name, "es", { sensitivity: "base" });
      }
      if (sort === "gain" || sort === "loss") {
        const chgA = a.quote?.change24hPct;
        const chgB = b.quote?.change24hPct;
        const valA = typeof chgA === "number" && Number.isFinite(chgA) ? chgA : sort === "gain" ? -Infinity : Infinity;
        const valB = typeof chgB === "number" && Number.isFinite(chgB) ? chgB : sort === "gain" ? -Infinity : Infinity;
        const diff = sort === "gain" ? valB - valA : valA - valB;
        if (diff !== 0) return diff;
      }
      return (b.item.liquidityUsd ?? 0) - (a.item.liquidityUsd ?? 0);
    });

    return out;
  }, [items, sector, issuer, minLiquidity, query, quotesBySymbol, perf, sort]);

  const heatmapRows = useMemo<MarketHeatmapRow[]>(() => {
    const out: MarketHeatmapRow[] = [];
    for (const row of filteredRows) {
      if (!row.quote) continue;
      const price = displayPrice(row.quote.priceUsd, shownCurrency, fxKnown ? rate : undefined);
      if (price === null) continue;
      out.push({
        symbol: row.item.symbol,
        name: row.item.name,
        priceUsd: row.quote.priceUsd,
        change24hPct: Number.isFinite(row.quote.change24hPct) ? row.quote.change24hPct : 0,
        priceFormatted: formatMoney(price, shownCurrency),
      });
    }
    return out;
  }, [filteredRows, shownCurrency, fxKnown, rate]);

  const hasActiveFilters =
    query.trim().length > 0 || sector !== "all" || issuer !== "all" || perf !== "all" || minLiquidity !== 0;

  function resetFilters() {
    setQuery("");
    setSector("all");
    setIssuer("all");
    setPerf("all");
    setMinLiquidity(0);
  }

  return (
    <div className="flex min-w-0 flex-col gap-6 lg:gap-8">
      {sections ? <div className="-mx-5 min-w-0 px-5 sm:mx-0 sm:px-0">{sections}</div> : null}

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl leading-tight font-semibold tracking-tight text-fg sm:text-[28px]">
            {isEn ? "Screener Pro" : "Screener Pro"}
          </h1>
          <p className="mt-1 text-sm text-fg-muted">
            {isEn
              ? "Filter tokenized US stocks and ETFs by sector, issuer, 24h performance, and DEX liquidity."
              : "Filtra acciones y ETFs de EE.UU. tokenizados por sector, emisor, rendimiento 24h y liquidez DEX."}
          </p>
        </div>

        <div
          role="group"
          aria-label={isEn ? "View mode" : "Vista"}
          className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-1 p-1"
        >
          <button
            type="button"
            onClick={() => setView("table")}
            aria-pressed={view === "table"}
            className={cn(
              "min-h-9 cursor-pointer rounded-full px-3.5 text-[13px] font-medium transition-colors",
              view === "table" ? "bg-fg text-bg" : "text-fg-muted hover:text-fg",
            )}
          >
            {isEn ? "Table" : "Tabla"}
          </button>
          <button
            type="button"
            onClick={() => setView("heatmap")}
            aria-pressed={view === "heatmap"}
            className={cn(
              "min-h-9 cursor-pointer rounded-full px-3.5 text-[13px] font-medium transition-colors",
              view === "heatmap" ? "bg-fg text-bg" : "text-fg-muted hover:text-fg",
            )}
          >
            {isEn ? "Heatmap" : "Mapa de calor"}
          </button>
        </div>
      </header>

      {/* Panel de filtros */}
      <section
        aria-label={isEn ? "Screener filters" : "Filtros del screener"}
        className="flex flex-col gap-4 rounded-2xl border border-border bg-surface-1/60 p-4 sm:p-5"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <label className="flex flex-col gap-1.5 text-xs font-medium text-fg-muted">
            <span>{isEn ? "Search symbol or name" : "Buscar símbolo o nombre"}</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={isEn ? "Ex. NVDAx, Apple, SPY…" : "Ej. NVDAx, Apple, SPY…"}
              className="min-h-11 rounded-xl border border-border bg-bg px-3 text-sm text-fg placeholder:text-fg-muted/70 focus:border-fg focus:outline-none"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-xs font-medium text-fg-muted">
            <span>{isEn ? "Sector" : "Sector"}</span>
            <select
              value={sector}
              onChange={(e) => setSector(e.target.value as SectorFilter)}
              className="min-h-11 rounded-xl border border-border bg-bg px-3 text-sm text-fg focus:border-fg focus:outline-none"
            >
              {SECTOR_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {isEn ? opt.en : opt.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5 text-xs font-medium text-fg-muted">
            <span>{isEn ? "Issuer" : "Emisor"}</span>
            <select
              value={issuer}
              onChange={(e) => setIssuer(e.target.value as IssuerFilter)}
              className="min-h-11 rounded-xl border border-border bg-bg px-3 text-sm text-fg focus:border-fg focus:outline-none"
            >
              {ISSUER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5 text-xs font-medium text-fg-muted">
            <span>{isEn ? "24h Performance" : "Rendimiento 24h"}</span>
            <select
              value={perf}
              onChange={(e) => setPerf(e.target.value as PerfFilter)}
              className="min-h-11 rounded-xl border border-border bg-bg px-3 text-sm text-fg focus:border-fg focus:outline-none"
            >
              {PERF_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {isEn ? opt.en : opt.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5 text-xs font-medium text-fg-muted">
            <span>{isEn ? "Min DEX Liquidity" : "Liquidez DEX mínima"}</span>
            <select
              value={String(minLiquidity)}
              onChange={(e) => setMinLiquidity(Number(e.target.value) as MinLiquidity)}
              className="min-h-11 rounded-xl border border-border bg-bg px-3 text-sm text-fg focus:border-fg focus:outline-none"
            >
              {LIQUIDITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-3">
          <div className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
            <span className="num font-medium text-fg">
              {filteredRows.length} {filteredRows.length === 1 ? "resultado" : "resultados"}
            </span>
            {hasActiveFilters ? (
              <button
                type="button"
                onClick={resetFilters}
                className="cursor-pointer font-medium text-fg underline underline-offset-4 hover:opacity-80"
              >
                {isEn ? "Clear filters" : "Limpiar filtros"}
              </button>
            ) : null}
          </div>

          <label className="flex items-center gap-2 text-xs font-medium text-fg-muted">
            <span>{isEn ? "Sort:" : "Orden:"}</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as ScreenerSort)}
              className="min-h-9 rounded-lg border border-border bg-bg px-2.5 text-xs font-medium text-fg focus:border-fg focus:outline-none"
            >
              {SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {isEn ? opt.en : opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {/* Contenido */}
      {catalogQuery.isPending ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 8 }).map((_, idx) => (
            <Skeleton key={idx} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : catalogQuery.isError ? (
        <ErrorState
          title={isEn ? "Could not load screener" : "No pudimos cargar el screener"}
          description={catalogQuery.error instanceof Error ? catalogQuery.error.message : undefined}
          onRetry={() => void catalogQuery.refetch()}
        />
      ) : filteredRows.length === 0 ? (
        <EmptyState
          title={isEn ? "No matching assets" : "Sin activos que coincidan"}
          description={
            isEn
              ? "Try relaxing one of the filters or clearing your search."
              : "Prueba ajustando alguno de los filtros o limpiando el buscador."
          }
          action={
            hasActiveFilters ? (
              <Button variant="secondary" onClick={resetFilters}>
                {isEn ? "Reset filters" : "Restablecer filtros"}
              </Button>
            ) : undefined
          }
        />
      ) : view === "heatmap" ? (
        <MarketHeatmap rows={heatmapRows} />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-bg">
          <table className="w-full min-w-[760px] border-collapse text-left">
            <thead>
              <tr className="border-b border-border text-[12px] font-medium text-fg-muted">
                <th className="py-3 pr-3 pl-4">{isEn ? "Asset" : "Activo"}</th>
                <th className="px-3 py-3">{isEn ? "Issuer" : "Emisor"}</th>
                <th className="px-3 py-3 text-right">{isEn ? "DEX Liquidity" : "Liquidez DEX"}</th>
                <th className="px-3 py-3 text-center">{isEn ? "7D Trend" : "Tendencia 7D"}</th>
                <th className="px-3 py-3 text-right">{isEn ? "Price" : "Precio"}</th>
                <th className="px-3 py-3 text-right">{isEn ? "24h" : "Cambio 24h"}</th>
                <th className="py-3 pr-4 pl-3 text-right">{isEn ? "Actions" : "Acciones"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {filteredRows.map(({ item, quote, issuer: itemIssuer }) => {
                const price = quote ? displayPrice(quote.priceUsd, shownCurrency, fxKnown ? rate : undefined) : null;
                const change = quote && Number.isFinite(quote.change24hPct) ? quote.change24hPct : null;
                const spark = sparkBySymbol.get(item.symbol);

                return (
                  <tr key={item.symbol} className="transition-colors hover:bg-surface-1/60">
                    <td className="py-3 pr-3 pl-4">
                      <Link
                        href={`/app/accion/${encodeURIComponent(item.symbol)}`}
                        className="flex items-center gap-3"
                      >
                        <TickerLogo
                          symbol={item.symbol}
                          name={item.name}
                          logoUrl={item.logoUrl}
                          size={36}
                          decorative
                          loading="lazy"
                          sizes="40px"
                        />
                        <span className="min-w-0">
                          <span className="block font-mono text-sm font-semibold text-fg">{item.symbol}</span>
                          <span className="block max-w-[200px] truncate text-xs text-fg-muted">{item.name}</span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      <span className="inline-flex rounded-full border border-border bg-surface-1 px-2.5 py-0.5 text-xs font-medium text-fg-muted">
                        {issuerLabel(itemIssuer)}
                      </span>
                    </td>
                    <td className="num px-3 py-3 text-right text-sm text-fg tabular-nums">
                      {formatLiquidityCompact(item.liquidityUsd)}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex justify-center">
                        {spark ? (
                          <Sparkline data={spark} change={change ?? 0} width={88} height={28} />
                        ) : (
                          <span className="text-xs text-fg-muted">—</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right">
                      {price !== null ? (
                        <span className="inline-flex items-baseline justify-end gap-1 whitespace-nowrap">
                          <FlashPrice value={price} currency={shownCurrency} size="sm" className="font-medium" />
                          {shownCurrency === "CLP" ? (
                            <span className="text-[11px] font-medium text-fg-muted">CLP</span>
                          ) : null}
                        </span>
                      ) : pricesQuery.isPending ? (
                        <Skeleton className="ml-auto h-5 w-16" />
                      ) : (
                        <span className="text-xs text-fg-muted">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right">
                      {change !== null ? (
                        <ChangeBadge value={change} size="sm" />
                      ) : pricesQuery.isPending ? (
                        <Skeleton className="ml-auto h-5 w-14 rounded-full" />
                      ) : (
                        <span className="text-xs text-fg-muted">—</span>
                      )}
                    </td>
                    <td className="py-3 pr-4 pl-3 text-right">
                      <div className="inline-flex items-center justify-end gap-2">
                        <Link
                          href={`/app/comparar?activos=${encodeURIComponent(item.symbol)}`}
                          className="inline-flex min-h-9 items-center rounded-lg border border-border px-2.5 text-xs font-medium text-fg transition-colors hover:bg-surface-1"
                        >
                          {isEn ? "Compare" : "Comparar"}
                        </Link>
                        <Link
                          href={`/app/accion/${encodeURIComponent(item.symbol)}?operar=comprar`}
                          className="inline-flex min-h-9 items-center rounded-lg bg-fg px-3 text-xs font-medium text-bg transition-opacity hover:opacity-90"
                        >
                          {isEn ? "Buy" : "Comprar"}
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
