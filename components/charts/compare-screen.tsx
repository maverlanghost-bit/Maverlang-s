"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useQueries, type UseQueryResult } from "@tanstack/react-query";
import { FinancialChart } from "./financial-chart";
import { AssetPicker, type PickedAsset } from "@/components/domain/asset-picker";
import { ChangeBadge } from "@/components/domain/change-badge";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { getHistory, searchMarket } from "@/lib/api/client";
import { historyStaleMs } from "@/lib/api/contracts";
import { CRYPTO_ASSETS } from "@/lib/catalog/crypto";
import { comparisonSeries } from "@/lib/charts/comparison";
import { compatibleSpot, historyDescription, observedSeries, pricePrecision } from "@/lib/charts/data";
import { cn } from "@/lib/cn";
import { formatDateTime, formatMoney, formatPercent } from "@/lib/format";
import { HISTORY_MS, historyPollMs, useFx, usePrices } from "@/lib/hooks/queries";
import { useT } from "@/lib/hooks/use-t";
import type { ChartOverlay } from "@/lib/market/chart-geometry";
import { isDetailRange } from "@/lib/market/series";
import { parseAmount } from "@/lib/trade/amount";
import type { Range } from "@/lib/types";

const DEFAULTS = ["NVDAx", "MSFTx", "SPYx", "BTC"];
const COLORS = ["#047857", "#2563eb", "#7c3aed", "#99651a"];
const RANGES: Range[] = ["1D", "1W", "1M", "3M", "1Y", "ALL"];
const PRESETS = [
  { es: "Tecnología", en: "Technology", symbols: ["NVDAx", "AAPLx", "MSFTx", "AMZNx"] },
  { es: "IA y S&P 500", en: "AI and S&P 500", symbols: ["NVDAx", "MSFTx", "GOOGLx", "SPYx"] },
  { es: "Tecnología y cripto", en: "Tech and crypto", symbols: ["NVDAx", "TSLAx", "BTC", "SOL"] },
];

function combineHistories(results: readonly UseQueryResult<Awaited<ReturnType<typeof getHistory>>>[]) {
  return results.map(({ data, isPending, isError, refetch }) => ({ data, isPending, isError, refetch }));
}
function combineMetadata(results: readonly UseQueryResult<Awaited<ReturnType<typeof searchMarket>>>[]) {
  return results.map(({ data }) => ({ data }));
}

function validSymbols(input: readonly string[] | undefined): string[] {
  const result: string[] = [];
  for (const raw of input ?? []) {
    const symbol = raw.trim();
    if (!/^[a-z\d._-]{1,24}$/i.test(symbol) || result.some((existing) => existing.toLowerCase() === symbol.toLowerCase())) continue;
    result.push(symbol);
    if (result.length === 4) break;
  }
  if (!result.length) return DEFAULTS;
  if (result.length === 1) result.push(result[0]?.toUpperCase() === "SPYX" ? "NVDAx" : "SPYx");
  return result;
}

export function CompareProScreen({ initialSymbols, initialRange = "1M", sections }: {
  initialSymbols?: readonly string[];
  initialRange?: Range;
  sections?: ReactNode;
}) {
  const { language, currency, t } = useT();
  const en = language === "en";
  const [symbols, setSymbols] = useState(() => validSymbols(initialSymbols));
  const [range, setRange] = useState<Range>(initialRange);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [picked, setPicked] = useState<Record<string, PickedAsset>>({});
  const [simulation, setSimulation] = useState({ currency, value: currency === "CLP" ? "1000000" : "1000" });
  const prices = usePrices(symbols);
  const fx = useFx();
  const rate = fx.data?.rate;
  const shownCurrency = currency === "CLP" && rate && rate > 0 ? "CLP" : "USD";
  const symbolKey = symbols.join(",");

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("activos", symbolKey);
    url.searchParams.set("rango", range);
    if (url.pathname === "/app/comparar") window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
  }, [symbolKey, range]);
  useEffect(() => {
    const restore = () => {
      const params = new URLSearchParams(window.location.search);
      setSymbols(validSymbols(params.get("activos")?.split(",")));
      const nextRange = params.get("rango");
      setRange(nextRange && isDetailRange(nextRange) ? nextRange : "1M");
      setHidden(new Set());
    };
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);

  const histories = useQueries({ combine: combineHistories, queries: symbols.map((symbol) => ({
    queryKey: ["history", symbol, range], queryFn: () => getHistory(symbol, range),
    staleTime: (query: { state: { data: unknown } }) => historyStaleMs(query.state.data, HISTORY_MS),
    refetchInterval: (query: { state: { data: unknown } }) => historyPollMs(query.state.data),
    refetchIntervalInBackground: false, refetchOnWindowFocus: false, retry: false,
  })) });
  const metadata = useQueries({ combine: combineMetadata, queries: symbols.map((symbol) => ({
    queryKey: ["compare-meta", symbol], queryFn: () => searchMarket({ q: symbol, page: 1, pageSize: 5, scope: "listed" }),
    enabled: !CRYPTO_ASSETS.some((asset) => asset.symbol.toLowerCase() === symbol.toLowerCase()), staleTime: 300_000, retry: false,
  })) });
  const assets = useMemo(() => symbols.map((symbol, index) => {
    const crypto = CRYPTO_ASSETS.find((asset) => asset.symbol.toLowerCase() === symbol.toLowerCase());
    const stock = metadata[index]?.data?.items.find((asset) => asset.symbol.toLowerCase() === symbol.toLowerCase());
    const quote = prices.data?.find((item) => item.symbol.toLowerCase() === symbol.toLowerCase()) ?? null;
    return {
      symbol, name: crypto?.name ?? stock?.name ?? picked[symbol]?.name ?? symbol,
      kind: crypto ? "crypto" : "stock", color: COLORS[index]!, quote,
      source: histories[index]?.data?.source,
      points: observedSeries(histories[index]?.data?.points ?? [], compatibleSpot(histories[index]?.data?.source, quote)),
      pending: histories[index]?.isPending,
      error: histories[index]?.isError,
      issuer: crypto ? `${crypto.originLabel} · Solana` : stock ? (symbol.toLowerCase().endsWith("on") ? "Ondo · Solana" : "Backed (xStocks) · Solana") : (en ? "Issuer unavailable" : "Emisor no disponible"),
      href: crypto ? `/app/cripto/${encodeURIComponent(symbol)}` : `/app/accion/${encodeURIComponent(symbol)}`,
    };
  }), [symbols, metadata, prices.data, histories, picked, en]);
  const comparison = useMemo(() => comparisonSeries(assets.map((asset) => ({ id: asset.symbol, source: asset.source, points: asset.points }))), [assets]);
  const plotted = useMemo(() => assets.map((asset) => ({ ...asset, comparison: comparison.series.find((entry) => entry.id === asset.symbol)! })), [assets, comparison.series]);
  const visible = useMemo(() => plotted.filter((asset) => !hidden.has(asset.symbol) && asset.comparison.points.length >= 2), [plotted, hidden]);
  const main = visible[0];
  const overlays = useMemo<ChartOverlay[]>(() => visible.slice(1).map((asset) => ({ id: asset.symbol, label: asset.symbol, points: asset.comparison.points, color: asset.color, rebased: true })), [visible]);
  const onHover = useCallback((_price: number | null, time?: number | null) => setHoverTime(time ?? null), []);
  const onCrosshairTime = useCallback((time: number | null) => setHoverTime(time), []);
  const hasError = histories.some((history) => history.isError);
  const loading = histories.some((history) => history.isPending);
  const simulatedInput = simulation.currency === shownCurrency ? simulation.value : shownCurrency === "CLP" ? "1000000" : "1000";
  const amount = parseAmount(simulatedInput);
  const formatPrice = (usd: number) => {
    const value = shownCurrency === "CLP" ? usd * rate! : usd;
    return new Intl.NumberFormat(language, { style: "currency", currency: shownCurrency, maximumFractionDigits: pricePrecision(value, shownCurrency) }).format(value);
  };
  const choose = (asset: PickedAsset) => {
    if (symbols.length >= 4 || symbols.some((symbol) => symbol.toLowerCase() === asset.symbol.toLowerCase())) return;
    setPicked((previous) => ({ ...previous, [asset.symbol]: asset }));
    setSymbols((previous) => [...previous, asset.symbol]);
  };
  const changeSymbols = (next: string[]) => { setSymbols(next); setHidden(new Set()); setHoverTime(null); };
  const toggle = (symbol: string) => setHidden((previous) => {
    const next = new Set(previous);
    if (next.has(symbol)) next.delete(symbol);
    else if (!visible.some((asset) => asset.symbol === symbol) || visible.length > 1) next.add(symbol);
    return next;
  });

  return (
    <div className="flex min-w-0 flex-col gap-6 sm:gap-8">
      {sections}
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-medium tracking-tight">{en ? "Compare assets" : "Comparar activos"}</h1><p className="mt-1 text-sm text-fg-muted">{en ? "Compare price changes over the same window." : "Compara variaciones de precio en una misma ventana."}</p></div>
        <div role="group" aria-label={en ? "Chart range" : "Rango del gráfico"} className="flex gap-1 border-b border-border">
          {RANGES.map((value) => <button key={value} type="button" aria-pressed={range === value} onClick={() => { setRange(value); setHoverTime(null); }} className={cn("min-h-11 min-w-10 border-b-2 px-3 text-xs font-medium sm:min-h-9", range === value ? "border-fg text-fg" : "border-transparent text-fg-muted")}>{t.detail.rangeShort[value]}</button>)}
        </div>
      </header>
      <section aria-label={en ? "Selected assets" : "Activos seleccionados"} className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">{PRESETS.map((preset) => <button key={preset.es} type="button" onClick={() => changeSymbols(preset.symbols)} className="min-h-11 rounded-full border border-border bg-bg px-3 text-xs text-fg-muted hover:bg-surface-1 sm:min-h-9">{en ? preset.en : preset.es}</button>)}</div>
        <div className="flex flex-wrap items-center gap-2">
          {assets.map((asset) => <span key={asset.symbol} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-surface-1 pl-3 text-xs"><span aria-hidden="true" className="size-2 rounded-full" style={{ background: asset.color }} /><span className="font-medium">{asset.symbol}</span><span className="max-w-28 truncate text-fg-muted">{asset.name}</span><button type="button" disabled={symbols.length <= 2} onClick={() => changeSymbols(symbols.filter((symbol) => symbol !== asset.symbol))} aria-label={`${en ? "Remove" : "Quitar"} ${asset.symbol}`} className="inline-flex size-11 items-center justify-center rounded-full text-base text-fg-muted hover:bg-surface-2 disabled:opacity-30">×</button></span>)}
          <AssetPicker selectedSymbols={symbols} onSelect={choose} />
        </div>
      </section>
      <section className="flex min-w-0 flex-col gap-3 border-y border-border py-4">
        {comparison.bounds ? <p className="text-xs text-fg-muted">{en ? "Common window" : "Ventana común"}: {formatDateTime(new Date(comparison.bounds.start).toISOString())} — {formatDateTime(new Date(comparison.bounds.end).toISOString())}</p> : null}
        <div className="flex flex-wrap gap-2" aria-label={en ? "Chart legend" : "Series del gráfico"}>
          {plotted.map((asset) => {
            const row = hoverTime === null ? undefined : asset.comparison.points.find((point) => point.t === hoverTime);
            const value = row && !row.gap ? row.p / asset.comparison.points[0]!.p - 1 : hoverTime === null ? asset.comparison.returnRatio : null;
            return <button key={asset.symbol} type="button" aria-pressed={!hidden.has(asset.symbol)} onClick={() => toggle(asset.symbol)} className={cn("inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-3 text-xs sm:min-h-9", hidden.has(asset.symbol) && "opacity-45")}><span aria-hidden="true" className="size-2 rounded-full" style={{ background: asset.color }} /><span className="font-medium">{asset.symbol}</span><span className="num">{value === null ? "—" : formatPercent(value)}</span></button>;
          })}
        </div>
        {loading && !main ? <Skeleton className="h-72 sm:h-96" /> : main ? <FinancialChart datasetKey={`compare:${symbolKey}:${range}`} points={main.comparison.points} overlays={overlays} tone="flat" lineColor={main.color} axisMode="percent" label={main.symbol} emptyLabel={en ? "No comparable history" : "Sin historial comparable"} onHover={onHover} onCrosshairTime={onCrosshairTime} heightClassName="h-72 sm:h-96" /> : <div role="status" className="flex h-64 items-center justify-center text-center text-sm text-fg-muted">{en ? "There is not enough history in a common window." : "No hay suficiente historial en una ventana común."}</div>}
        {hasError ? <ErrorState title={en ? "Some histories could not be loaded" : "No pudimos cargar algunos historiales"} onRetry={() => { for (const history of histories) if (history.isError) void history.refetch(); }} retryLabel={en ? "Retry histories" : "Reintentar historiales"} /> : null}
        {comparison.unavailable.length ? <p role="status" className="text-xs text-warn">{en ? "No comparable history" : "Sin historial comparable"}: {comparison.unavailable.join(", ")}.</p> : null}
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-fg-muted">{assets.map((asset) => <li key={asset.symbol}>{asset.symbol} · {historyDescription(asset.source, en)}</li>)}</ul>
        <p className="max-w-prose text-xs leading-relaxed text-fg-muted">{en ? "Price changes in USD, rebased to 0% at the common start. At each time, the last known observation is used; long gaps remain blank. Dividends, fees and taxes are not included." : "Variación de precios en USD, con base 0 % al inicio común. En cada instante se usa el último registro conocido; los vacíos prolongados quedan sin curva. No incluye dividendos, comisiones ni impuestos."}</p>
      </section>
      <section aria-label={en ? "Asset comparison" : "Datos de los activos"}>
        <div className="flex flex-col divide-y divide-border md:hidden">{plotted.map((asset) => <div key={asset.symbol} className="flex flex-col gap-3 py-4"><div className="flex items-start justify-between gap-3"><Link href={asset.href} className="min-h-11 text-sm font-medium">{asset.name}<span className="num mt-1 block text-xs text-fg-muted">{asset.symbol}</span></Link><span className="num text-right text-sm">{asset.quote ? formatPrice(asset.quote.priceUsd) : "—"}</span></div><dl className="grid grid-cols-2 gap-2 text-xs"><div><dt className="text-fg-muted">{en ? "Common window change" : "Variación en ventana común"}</dt><dd className="num mt-1">{asset.comparison.returnRatio === null ? "—" : formatPercent(asset.comparison.returnRatio)}</dd></div><div><dt className="text-fg-muted">24 h</dt><dd className="mt-1">{asset.quote ? <ChangeBadge value={asset.quote.change24hPct} /> : "—"}</dd></div></dl><p className="text-xs text-fg-muted">{asset.issuer}</p></div>)}</div>
        <div className="hidden overflow-x-auto md:block"><table className="w-full text-left text-sm"><caption className="sr-only">{en ? "Comparison of selected assets" : "Comparación de activos seleccionados"}</caption><thead><tr className="border-b border-border text-xs text-fg-muted">{[en ? "Asset" : "Activo", shownCurrency, en ? "Common window change" : "Variación común", "24 h", en ? "Issuer / network" : "Emisor / red"].map((label, index) => <th key={label} scope="col" className={cn("px-3 py-3 font-medium", index > 0 && index < 4 && "text-right")}>{label}</th>)}</tr></thead><tbody>{plotted.map((asset) => <tr key={asset.symbol} className="border-b border-border/70"><th scope="row" className="px-3 py-4 font-normal"><Link href={asset.href} className="inline-flex min-h-11 flex-col justify-center"><span className="font-medium">{asset.name}</span><span className="num text-xs text-fg-muted">{asset.symbol}</span></Link></th><td className="num px-3 text-right">{asset.quote ? formatPrice(asset.quote.priceUsd) : "—"}</td><td className="num px-3 text-right">{asset.comparison.returnRatio === null ? "—" : formatPercent(asset.comparison.returnRatio)}</td><td className="px-3 text-right">{asset.quote ? <ChangeBadge value={asset.quote.change24hPct} /> : "—"}</td><td className="px-3 text-xs text-fg-muted">{asset.issuer}</td></tr>)}</tbody></table></div>
        {currency === "CLP" ? <p className="mt-2 text-xs text-fg-muted">{shownCurrency === "CLP" ? (en ? "Current prices converted at today's reference FX; the comparison shows USD price changes." : "Precios actuales convertidos al dólar de referencia vigente; la comparación muestra variación en USD.") : (en ? "FX unavailable. Prices are shown in USD." : "Dólar no disponible. Los precios se muestran en USD.")}</p> : null}
      </section>
      <details className="rounded-xl border border-border px-4 py-1">
        <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium">{en ? "Historical investment simulation" : "Simulación histórica de una inversión"}</summary>
        <div className="flex flex-col gap-4 border-t border-border py-4">
          <div className="flex flex-wrap items-center gap-2">{(shownCurrency === "CLP" ? [100_000, 500_000, 1_000_000] : [100, 500, 1000]).map((value) => <button key={value} type="button" onClick={() => setSimulation({ currency: shownCurrency, value: String(value) })} className="min-h-11 rounded-full border border-border px-3 text-xs">{formatMoney(value, shownCurrency)}</button>)}<label className="flex items-center gap-2 text-xs">{en ? "Amount" : "Monto"} ({shownCurrency})<input inputMode="decimal" value={simulatedInput} onChange={(event) => setSimulation({ currency: shownCurrency, value: event.target.value })} className="h-11 w-32 rounded-md border border-border-control bg-bg px-3 text-base" /></label></div>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{plotted.map((asset) => <dl key={asset.symbol}><dt className="text-xs font-medium">{asset.symbol}</dt><dd className="num mt-1 text-lg">{asset.comparison.returnRatio === null || !(amount > 0) ? "—" : formatMoney(amount * (1 + asset.comparison.returnRatio), shownCurrency)}</dd></dl>)}</div>
          <p className="text-xs leading-relaxed text-fg-muted">{en ? "Illustration over the common window. It excludes fees and taxes, uses a constant reference FX for CLP, and is not your personal return or a forecast." : "Ilustración en la ventana común. Excluye comisiones e impuestos y usa un dólar de referencia constante para CLP. No es tu rendimiento personal ni una proyección."}</p>
        </div>
      </details>
    </div>
  );
}
