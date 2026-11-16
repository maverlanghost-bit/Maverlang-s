"use client";

import dynamic from "next/dynamic";
import { Component, type ReactNode } from "react";
import type { PriceChartProps } from "@/components/domain/svg-price-chart";
import { cn } from "@/lib/cn";
import { useChartFullscreen } from "@/lib/hooks/use-chart-fullscreen";
import { useT } from "@/lib/hooks/use-t";
import { pricePrecision, type FinancialPoint } from "@/lib/charts/data";
import { formatDateTime } from "@/lib/format";
import type { Currency } from "@/lib/types";

export interface FinancialChartProps extends PriceChartProps {
  /** Stable instrument/range identity, independent of live prices and hover. */
  datasetKey: string;
  currency?: Currency;
  rate?: number;
  lineColor?: string;
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

function DataFallback({ points, currency = "USD", rate }: FinancialChartProps) {
  const { language } = useT();
  const en = language === "en";
  const fx = currency === "CLP" && rate && rate > 0 ? rate : 1;
  return <div className="absolute inset-0 overflow-auto rounded-md border border-border bg-bg p-3"><p role="status" className="mb-3 text-xs text-fg-muted">{en ? "The interactive chart is unavailable. Observations are shown below; missing values remain blank." : "El gráfico interactivo no está disponible. Puedes revisar los registros; los datos ausentes se muestran sin valor."}</p><table className="w-full text-left text-xs"><thead><tr><th scope="col">{en ? "Observation date" : "Fecha del registro"}</th><th scope="col">{currency}</th></tr></thead><tbody>{(points as readonly FinancialPoint[]).map((row) => <tr key={row.t}><td className="py-2">{formatDateTime(new Date(row.observedAt ?? row.t).toISOString())}</td><td className="num">{row.gap ? "—" : new Intl.NumberFormat(language, { maximumFractionDigits: pricePrecision(row.p * fx, currency) }).format(row.p * fx)}</td></tr>)}</tbody></table></div>;
}

export function FinancialChart(props: FinancialChartProps) {
  const { ref, expanded: ownExpanded, toggle } = useChartFullscreen();
  const expanded = !props.onToggleFullscreen && ownExpanded;
  const chartProps = { ...props, onToggleFullscreen: props.onToggleFullscreen ?? toggle, isFullscreen: props.isFullscreen ?? expanded };
  const gaps = (props.points as readonly FinancialPoint[]).some((point) => point.gap);
  return (
    <div
      ref={ref}
      role={expanded ? "dialog" : undefined}
      aria-modal={expanded || undefined}
      aria-label={expanded ? props.label : undefined}
      className={cn("relative min-w-0", props.heightClassName ?? "h-64 sm:h-80", expanded && "fixed inset-0 z-[100] h-[100dvh] w-screen bg-bg p-4 sm:h-[100dvh]")}
    >
      <ChartBoundary fallback={gaps ? <DataFallback {...chartProps} /> : <><p role="status" className="text-xs text-fg-muted">Gráfico simplificado / Simplified chart</p><FallbackChart {...chartProps} /></>}>
        <CanvasChart {...chartProps} />
      </ChartBoundary>
    </div>
  );
}
