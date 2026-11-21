"use client";

import dynamic from "next/dynamic";
import { Component, type ReactNode } from "react";
import type { PriceChartProps } from "@/components/domain/svg-price-chart";
import { ChartContext } from "./chart-context";
import { cn } from "@/lib/cn";
import { useChartFullscreen } from "@/lib/hooks/use-chart-fullscreen";
import { useT } from "@/lib/hooks/use-t";
import { chartCapabilities, chartPoints, chartVolumeLabel, inChartWindow, observedSeries, sharedWindow, type FinancialPoint } from "@/lib/charts/data";
import { formatDateTime } from "@/lib/format";
import { formatUnitPrice } from "@/lib/market/price-format";
import type { Currency, HistoryMetadata } from "@/lib/types";

export interface FinancialChartProps extends PriceChartProps {
  /** Stable instrument/range identity, independent of live prices and hover. */
  datasetKey: string;
  currency?: Currency;
  rate?: number;
  metadata?: HistoryMetadata;
  /** Cursor time is distinct from the actual date of a carried observation. */
  onCrosshairTime?: (timeMs: number | null) => void;
}

const CanvasChart = dynamic(() => import("./financial-chart-canvas").then((module) => module.FinancialChartCanvas), {
  ssr: false,
  loading: () => <div role="status" className="absolute inset-0 animate-pulse rounded-md bg-surface-1"><span className="sr-only">Cargando gráfico / Loading chart</span></div>,
});

const FallbackChart = dynamic(() => import("@/components/domain/svg-price-chart").then((module) => module.SvgPriceChart), { ssr: false });

class ChartBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

/** The canvas, keyboard explorer and failure state share the same units. */
export function ChartDataTable(props: FinancialChartProps) {
  const { language } = useT();
  const en = language === "en";
  const currency = props.currency === "CLP" && props.rate && props.rate > 0 ? "CLP" : "USD";
  const fx = currency === "CLP" ? props.rate! : 1;
  const main = observedSeries(props.points, props.livePoint);
  const layers = [
    { id: "asset", label: props.label, rows: main, rebased: false },
    ...(props.overlays ?? []).map((layer) => ({ ...layer, rows: chartPoints(layer.points as readonly FinancialPoint[]) })),
    ...(props.benchmark ? [{ id: "benchmark", label: props.benchmark.label, rows: chartPoints(props.benchmark.points as readonly FinancialPoint[]), rebased: true }] : []),
  ];
  const comparative = Boolean(props.benchmark) || Boolean(props.overlays?.some((layer) => layer.rebased));
  const bounds = comparative ? sharedWindow([main, ...layers.filter((layer) => layer.rebased).map((layer) => layer.rows)]) : null;
  const primaryRows = bounds ? inChartWindow(main, bounds) : comparative ? [] : main;
  const mainBase = primaryRows.find((row) => !row.gap)?.p;
  const percent = comparative || props.axisMode === "percent";
  const capabilities = chartCapabilities(main, props.metadata);
  const ohlc = props.chartStyle === "candles" && capabilities.ohlc && !percent;
  const volume = props.showVolume && capabilities.volume;
  const volumeLabel = chartVolumeLabel(props.metadata, en);
  const price = (value: number) => formatUnitPrice(value * fx, currency, language);
  const pct = (value: number, base: number | undefined) => base && base > 0 ? `${new Intl.NumberFormat(language, { maximumFractionDigits: 2, signDisplay: "exceptZero" }).format((value / base - 1) * 100)} %` : "—";
  const source = props.metadata?.instrument === "underlying" ? "closes" : props.metadata?.instrument === "token" ? "ticks" : props.metadata?.instrument === "demo" ? "mock" : undefined;
  return <div className="space-y-5">{props.metadata ? <ChartContext points={primaryRows} currency={currency} metadata={props.metadata} source={source} /> : <p className="text-xs text-fg-muted">{en ? "The source is not specified for this view." : "La fuente no está especificada para esta vista."}</p>}{layers.map((layer) => {
    const rows = bounds ? inChartWindow(layer.rows, bounds) : comparative ? [] : layer.rows;
    const base = layer.rebased ? rows.find((row) => !row.gap)?.p : mainBase;
    const carried = rows.some((row) => row.observedAt !== undefined && row.observedAt !== row.t);
    return <table key={layer.id} className="w-full text-left text-xs"><caption className="py-2 text-left font-medium">{layer.label} · {currency}{percent ? " · %" : ""}</caption><thead><tr><th scope="col" className="pr-3">{en ? "Date" : "Fecha"}</th><th scope="col" className="pr-3">{en ? "Price" : "Precio"} ({currency})</th>{percent ? <th scope="col" className="pr-3">{en ? "Change from start (%)" : "Variación desde inicio (%)"}</th> : null}{carried ? <th scope="col" className="pr-3">{en ? "Observed at" : "Fecha del registro"}</th> : null}{ohlc && layer.id === "asset" ? <><th scope="col" className="pr-3">{en ? "Open" : "Apertura"} ({currency})</th><th scope="col" className="pr-3">{en ? "High" : "Máximo"} ({currency})</th><th scope="col" className="pr-3">{en ? "Low" : "Mínimo"} ({currency})</th><th scope="col" className="pr-3">{en ? "Close" : "Cierre"} ({currency})</th></> : null}{volume && layer.id === "asset" ? <th scope="col">{volumeLabel}</th> : null}</tr></thead><tbody>{rows.map((row) => <tr key={row.t} className="border-t border-border/60"><td className="py-2 pr-3">{formatDateTime(new Date(row.t).toISOString())}</td><td className="num pr-3">{row.gap ? "—" : price(row.p)}</td>{percent ? <td className="num pr-3">{row.gap ? "—" : pct(row.p, base)}</td> : null}{carried ? <td className="pr-3">{row.gap ? "—" : formatDateTime(new Date(row.observedAt ?? row.t).toISOString())}</td> : null}{ohlc && layer.id === "asset" ? [row.o, row.h, row.l, row.c].map((value, index) => <td key={index} className="num pr-3">{row.gap || value === undefined ? "—" : price(value)}</td>) : null}{volume && layer.id === "asset" ? <td className="num">{row.gap || row.v === undefined ? "—" : new Intl.NumberFormat(language, { maximumFractionDigits: 0 }).format(row.v)}</td> : null}</tr>)}</tbody></table>;
  })}</div>;
}

function DataFallback(props: FinancialChartProps) {
  const { language } = useT();
  return <div className="absolute inset-0 overflow-auto rounded-md border border-border bg-bg p-3">{props.isFullscreen && props.onToggleFullscreen ? <button type="button" onClick={props.onToggleFullscreen} className="mb-2 min-h-11 text-xs underline">{language === "en" ? "Exit full screen" : "Salir de pantalla completa"}</button> : null}<p role="status" className="mb-3 text-xs text-fg-muted">{language === "en" ? "The interactive chart is unavailable. Observations are shown below; missing values remain blank." : "El gráfico interactivo no está disponible. Puedes revisar los registros; los datos ausentes se muestran sin valor."}</p><ChartDataTable {...props} /></div>;
}

export function FinancialChart(props: FinancialChartProps) {
  const { ref, expanded: ownExpanded, toggle } = useChartFullscreen();
  const expanded = !props.onToggleFullscreen && ownExpanded;
  const capabilities = chartCapabilities(props.points, props.metadata);
  const chartProps = { ...props, chartStyle: props.chartStyle === "candles" && !capabilities.ohlc ? "area" as const : props.chartStyle, showVolume: props.showVolume && capabilities.volume, onToggleFullscreen: props.onToggleFullscreen ?? toggle, isFullscreen: props.isFullscreen ?? expanded };
  const gaps = (props.points as readonly FinancialPoint[]).some((point) => point.gap);
  const tableFallback = gaps || props.currency === "CLP" || props.axisMode === "percent" || props.benchmark || props.overlays?.some((layer) => layer.rebased) || chartProps.chartStyle === "candles" || chartProps.showVolume;
  return (
    <div
      ref={ref}
      role={expanded ? "dialog" : undefined}
      aria-modal={expanded || undefined}
      aria-label={expanded ? props.label : undefined}
      className={cn("relative min-w-0", props.heightClassName ?? "h-64 sm:h-80", expanded && "fixed inset-0 z-[100] h-[100dvh] w-screen bg-bg p-4 sm:h-[100dvh]")}
    >
      <ChartBoundary key={props.datasetKey} fallback={tableFallback ? <DataFallback {...chartProps} /> : <><p role="status" className="text-xs text-fg-muted">Gráfico simplificado / Simplified chart</p><FallbackChart {...chartProps} /></>}>
        <CanvasChart {...chartProps} />
      </ChartBoundary>
    </div>
  );
}
