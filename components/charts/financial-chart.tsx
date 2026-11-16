"use client";

import dynamic from "next/dynamic";
import { Component, type ReactNode } from "react";
import type { PriceChartProps } from "@/components/domain/svg-price-chart";
import { cn } from "@/lib/cn";
import { useChartFullscreen } from "@/lib/hooks/use-chart-fullscreen";
import type { Currency } from "@/lib/types";

export interface FinancialChartProps extends PriceChartProps {
  /** Stable instrument/range identity, independent of live prices and hover. */
  datasetKey: string;
  currency?: Currency;
  rate?: number;
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

export function FinancialChart(props: FinancialChartProps) {
  const { ref, expanded: ownExpanded, toggle } = useChartFullscreen();
  const expanded = !props.onToggleFullscreen && ownExpanded;
  const chartProps = { ...props, onToggleFullscreen: props.onToggleFullscreen ?? toggle, isFullscreen: props.isFullscreen ?? expanded };
  return (
    <div
      ref={ref}
      role={expanded ? "dialog" : undefined}
      aria-modal={expanded || undefined}
      aria-label={expanded ? props.label : undefined}
      className={cn("relative min-w-0", props.heightClassName ?? "h-64 sm:h-80", expanded && "fixed inset-0 z-[100] h-[100dvh] w-screen bg-bg p-4 sm:h-[100dvh]")}
    >
      <ChartBoundary fallback={<><p role="status" className="text-xs text-fg-muted">Gráfico simplificado / Simplified chart</p><FallbackChart {...chartProps} /></>}>
        <CanvasChart {...chartProps} />
      </ChartBoundary>
    </div>
  );
}
