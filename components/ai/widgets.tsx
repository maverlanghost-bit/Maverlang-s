"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { QueryClientContext } from "@tanstack/react-query";
import { historyDescription, chartPoints, chartSegments, pricePrecision, resolutionLabel } from "@/lib/charts/data";
import { comparisonSeries } from "@/lib/charts/comparison";
import { useCallback, useContext, useId, useMemo, useRef, useState } from "react";

import { ChangeBadge } from "@/components/domain/change-badge";
import { TickerLogo } from "@/components/domain/ticker-logo";
import { Button } from "@/components/ui/button";
import {
  CHART_H,
  CHART_W,
  cleanTicker,
  compareScale,
  detailHref,
  finiteOrNull,
  safeBuyHref,
  valueY,
} from "@/components/ai/model";
import { getHistory } from "@/lib/api/client";
import { historyStaleMs } from "@/lib/api/contracts";
import { logoPathFromSymbol } from "@/lib/catalog/logos";
import { cn } from "@/lib/cn";
import { formatPercent, formatPortion, formatUsd } from "@/lib/format";
import { HISTORY_MS } from "@/lib/hooks/queries";
import { asistenteCopy, type AsistenteCopy } from "@/content/i18n/extra-asistente";
import type { AiWidget } from "@/components/ai/contract";
import type { HistoryMetadata } from "@/lib/types";

const LINE_CLASS = ["text-fg", "text-info", "text-up", "text-warn", "text-down"] as const;
const DOT_CLASS = ["bg-fg", "bg-info", "bg-up", "bg-warn", "bg-down"] as const;

export const WIDGET_CARD_CLASS =
  "min-w-0 rounded-2xl border border-border/80 bg-white dark:bg-bg-elevated p-4 shadow-2xs transition-all duration-200 hover:border-brand/35 hover:shadow-xs";

const ExpandedAssetChart = dynamic(() => import("@/components/charts/expanded-asset-chart").then((module) => module.ExpandedAssetChart), { ssr: false });

const STOCK_RANGES: readonly ("1D" | "1W" | "1M")[] = ["1D", "1W", "1M"];

function logoFor(ticker: string): string | null {
  return logoPathFromSymbol(ticker);
}

function changeLabel(value: number | null, empty: string): string {
  return value == null ? empty : formatPercent(value);
}

/** Open the full internal comparison without executing an operation. */
function compareHref(items: readonly { ticker: string }[], range: string): string | null {
  const symbols = [...new Set(items.map((item) => cleanTicker(item.ticker)).filter((symbol): symbol is string => Boolean(symbol)))].slice(0, 4);
  return symbols.length >= 2 ? `/app/comparar?activos=${encodeURIComponent(symbols.join(","))}&rango=${encodeURIComponent(range)}` : null;
}

function clampRatio(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function formatHoverDate(t: number, en = false): string | null {
  if (!Number.isFinite(t) || t < 1_000_000) return null;
  const ms = t < 1e11 ? t * 1000 : t;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat(en ? "en" : "es-CL", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Santiago",
  }).format(d);
}

function historySourceLabel(source: string | undefined, en: boolean, metadata?: HistoryMetadata): string {
  const base = source ? historyDescription(source, en) : en ? "History included in the reply · source unidentified" : "Historial incluido en la respuesta · fuente sin identificar";
  const provider = metadata?.provider === "yahoo" ? "Yahoo Finance" : metadata?.provider === "jupiter" ? "Jupiter" : metadata?.provider === "coingecko" ? "CoinGecko" : undefined;
  const resolution = resolutionLabel(metadata?.resolution, en);
  return [base, metadata?.providerSymbol, provider, resolution].filter(Boolean).join(" · ");
}

function historyPrice(value: number, en: boolean): string {
  return new Intl.NumberFormat(en ? "en-US" : "es-CL", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: pricePrecision(value) }).format(value);
}

export function StockWidget({
  widget,
  copy,
}: {
  widget: Extract<AiWidget, { type: "stock" }>;
  copy: AsistenteCopy;
}) {
  const en = copy === asistenteCopy.en;
  const queryClient = useContext(QueryClientContext);
  const [expanded, setExpanded] = useState(false);
  const [failedRange, setFailedRange] = useState<string | null>(null);
  const requestId = useRef(0);
  const [activeRange, setActiveRange] = useState<"1D" | "1W" | "1M">(widget.range);
  const [historyCache, setHistoryCache] = useState<
    Partial<
      Record<
        "1D" | "1W" | "1M",
        {
          points: { t: number; p: number }[];
          source?: string;
          metadata?: HistoryMetadata;
          priceUsd: number | null;
          changePct: number | null;
        }
      >
    >
  >({});
  const [loadingRange, setLoadingRange] = useState<"1D" | "1W" | "1M" | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const gradientId = `stock-chart-grad-${useId().replace(/:/g, "")}`;

  const activeData = historyCache[activeRange] ?? {
    source: widget.range === activeRange ? widget.source : undefined,
    metadata: widget.range === activeRange ? widget.metadata : undefined,
    points: widget.range === activeRange ? widget.points : [],
    priceUsd: widget.range === activeRange ? widget.priceUsd : null,
    changePct: widget.range === activeRange ? widget.changePct : null,
  };

  const points = activeData.points;
  const href = detailHref(widget.ticker);

  const series = useMemo(() => chartPoints(points), [points]);
  const currentPrice = series[series.length - 1]?.p ?? finiteOrNull(activeData.priceUsd);
  const currentChange = series.length >= 2 ? series[series.length - 1]!.p / series[0]!.p - 1 : null;

  const bounds = useMemo(() => {
    if (series.length < 2) return null;
    let min = Number.POSITIVE_INFINITY;
    let max = Number.NEGATIVE_INFINITY;
    for (const pt of series) {
      if (pt.p < min) min = pt.p;
      if (pt.p > max) max = pt.p;
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
    return { min, max };
  }, [series]);

  const lastPrice = series.length > 0 ? (series[series.length - 1]?.p ?? null) : null;
  const span = bounds ? bounds.max - bounds.min : 0;
  const position =
    bounds == null || lastPrice == null
      ? 0
      : span > 0
        ? clampRatio((lastPrice - bounds.min) / span)
        : 1;

  const chartShape = useMemo(() => {
    if (series.length < 2 || !bounds) return null;
    const start = series[0]!.t;
    const duration = series[series.length - 1]!.t - start;
    if (duration <= 0) return null;
    const padded = comparisonSeries([{ id: widget.ticker, points: series, source: activeData.source }]).series[0]?.points ?? [];
    const coordinates = (point: { t: number; p: number }) => ({
      x: 2.5 + (point.t - start) / duration * (CHART_W - 5),
      y: 2.5 + 67 - (bounds.max > bounds.min ? (point.p - bounds.min) / (bounds.max - bounds.min) : 0.5) * 67,
    });
    const segments = chartSegments(padded).filter((segment) => segment.length >= 2).map((segment) => {
      const positions = segment.map(coordinates);
      const line = positions.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ");
      return { line, area: `${line} L${positions[positions.length - 1]!.x.toFixed(1)} 72 L${positions[0]!.x.toFixed(1)} 72 Z` };
    });
    return segments.length ? { line: segments.map((segment) => segment.line).join(" "), area: segments.map((segment) => segment.area).join(" ") } : null;
  }, [series, bounds, widget.ticker, activeData.source]);

  const toneClass =
    currentChange != null && currentChange > 0
      ? "text-up"
      : currentChange != null && currentChange < 0
        ? "text-down"
        : "text-fg-muted";

  const hoveredPoint = hoveredIndex !== null && series[hoveredIndex] ? series[hoveredIndex] : null;
  const displayPrice = hoveredPoint ? hoveredPoint.p : currentPrice;

  const hoveredDateLabel = useMemo(() => {
    if (!hoveredPoint) return null;
    return formatHoverDate(hoveredPoint.t, en);
  }, [hoveredPoint, en]);
  const lastDateLabel = series.length ? formatHoverDate(series[series.length - 1]!.t, en) : null;

  const handleSelectRange = useCallback(
    async (range: "1D" | "1W" | "1M") => {
      if (range === activeRange && failedRange !== range) return;
      const id = ++requestId.current;
      setFailedRange(null);
      setActiveRange(range);
      setHoveredIndex(null);

      if (historyCache[range] || range === widget.range) { setLoadingRange(null); return; }

      setLoadingRange(range);
      try {
        const fetchHistory = () => getHistory(widget.ticker.trim(), range);
        const res = queryClient
          ? await queryClient.fetchQuery({ queryKey: ["history", widget.ticker.trim(), range], queryFn: fetchHistory, staleTime: (query) => historyStaleMs(query.state.data, HISTORY_MS) })
          : await fetchHistory();
        const pts = chartPoints(res.points ?? []);
        let price: number | null = null;
        let change: number | null = null;
        if (pts.length > 0) {
          const first = pts[0]?.p;
          const last = pts[pts.length - 1]?.p;
          if (last != null) price = last;
          if (first != null && last != null && first > 0) {
            change = Math.round(((last - first) / first) * 1e6) / 1e6;
          }
        }
        setHistoryCache((prev) => ({
          ...prev,
          [range]: { points: pts, priceUsd: price, changePct: change, source: res.source, metadata: res.metadata },
        }));
      } catch {
        if (requestId.current === id) setFailedRange(range);
      } finally {
        if (requestId.current === id) setLoadingRange(null);
      }
    },
    [activeRange, failedRange, historyCache, widget.ticker, widget.range, queryClient],
  );

  return (
    <article data-ai-widget="stock" className={WIDGET_CARD_CLASS}>
      <div className="flex items-center gap-3">
        <TickerLogo
          symbol={widget.ticker}
          name={widget.name}
          logoUrl={logoFor(widget.ticker)}
          size={40}
          loading="lazy"
          sizes="40px"
        />
        <div className="min-w-0 flex-1">
          {href ? (
            <Link
              href={href}
              className="block truncate rounded-sm font-semibold text-fg outline-none transition-colors hover:text-brand focus-visible:ring-4 focus-visible:ring-fg/20"
            >
              {widget.name}
            </Link>
          ) : (
            <p className="truncate font-semibold text-fg">{widget.name}</p>
          )}
          <p className="truncate text-sm text-fg-muted">{widget.ticker}</p>
        </div>
        <div className="shrink-0 text-right tabular-nums">
          <p className="num text-base font-semibold tabular-nums text-fg">
            {displayPrice == null ? copy.noPrice : historyPrice(displayPrice, en)}
          </p>
          {!hoveredPoint ? <p className="text-[10px] text-fg-muted">{series.length ? (en ? "Last observation · USD" : "Último registro · USD") : "USD"}</p> : null}
          {hoveredPoint ? (
            <p className="text-xs tabular-nums text-fg-muted animate-fade-in">
              {hoveredDateLabel ?? copy.ranges[activeRange]}
            </p>
          ) : currentChange == null ? (
            <p className="text-sm tabular-nums text-fg-muted">{copy.noChange}</p>
          ) : (
            <ChangeBadge value={currentChange} className="mt-1 tabular-nums" />
          )}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="label">{copy.ranges[activeRange] ?? activeRange}</p>
        <div
          className="flex items-center gap-1 rounded-full border border-border/80 bg-surface-1 p-0.5"
          role="group"
          aria-label={en ? "Time range" : "Rango de tiempo"}
        >
          {STOCK_RANGES.map((r) => {
            const isSelected = r === activeRange;
            const isLoading = r === loadingRange;
            return (
              <button
                key={r}
                type="button"
                aria-pressed={isSelected}
                aria-label={copy.ranges[r] ?? r}
                disabled={isLoading}
                onClick={() => void handleSelectRange(r)}
                className={cn(
                  "inline-flex min-h-11 min-w-11 items-center justify-center rounded-full px-2 text-[11px] font-semibold transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-fg/20 sm:min-h-8 sm:min-w-9",
                  isSelected
                    ? "bg-brand text-white shadow-2xs"
                    : "text-fg-muted hover:text-fg hover:bg-surface-2",
                  isLoading && "opacity-60 cursor-wait",
                )}
              >
                {isLoading ? (
                  <span className="inline-block size-2 animate-spin rounded-full border border-current border-t-transparent" />
                ) : (
                  copy.ranges[r] ?? r
                )}
              </button>
            );
          })}
        </div>
      </div>

      {chartShape && series.length >= 2 ? (
        <div className="relative mt-2" onPointerLeave={() => setHoveredIndex(null)}>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${CHART_W} 72`}
            role="img"
            aria-label={`${widget.name}, ${copy.ranges[activeRange]}, USD. ${historySourceLabel(activeData.source, en, activeData.metadata)}. ${currentChange == null ? copy.noChange : formatPercent(currentChange)}`}
            className={cn("h-20 w-full max-w-full touch-pan-y select-none", toneClass)}
            onPointerMove={(e) => {
              if (!svgRef.current || series.length < 2) return;
              const rect = svgRef.current.getBoundingClientRect();
              if (rect.width <= 0) return;
              const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
              const target = series[0]!.t + ratio * (series[series.length - 1]!.t - series[0]!.t);
              let idx = 0;
              for (let index = 1; index < series.length; index += 1) {
                if (Math.abs(series[index]!.t - target) < Math.abs(series[idx]!.t - target)) idx = index;
              }
              setHoveredIndex(idx);
            }}
            onPointerLeave={() => setHoveredIndex(null)}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
                <stop offset="100%" stopColor="currentColor" stopOpacity="0.0" />
              </linearGradient>
            </defs>
            <path d={chartShape.area} fill={`url(#${gradientId})`} />
            <path
              d={chartShape.line}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {hoveredIndex !== null && bounds && series[hoveredIndex] ? (() => {
              const PAD = 2.5;
              const innerW = CHART_W - PAD * 2;
              const innerH = 72 - PAD * 2;
              const pt = series[hoveredIndex];
              if (!pt) return null;
              const duration = series[series.length - 1]!.t - series[0]!.t;
              const x = PAD + (duration > 0 ? (pt.t - series[0]!.t) / duration : 0) * innerW;
              const ratioY = span > 0 ? (pt.p - bounds.min) / span : 0.5;
              const y = PAD + innerH - ratioY * innerH;
              return (
                <g className="pointer-events-none">
                  <line
                    x1={x.toFixed(1)}
                    x2={x.toFixed(1)}
                    y1={PAD}
                    y2={72 - PAD}
                    stroke="currentColor"
                    strokeDasharray="2 3"
                    strokeWidth="1"
                    className="text-border-strong opacity-80"
                  />
                  <circle
                    cx={x.toFixed(1)}
                    cy={y.toFixed(1)}
                    r="4.5"
                    className="fill-white stroke-current stroke-2"
                  />
                  <circle
                    cx={x.toFixed(1)}
                    cy={y.toFixed(1)}
                    r="2"
                    className="fill-current"
                  />
                </g>
              );
            })() : null}
          </svg>
        </div>
      ) : (
        <div className="mt-2 flex h-20 items-center text-sm text-fg-muted" role="status">{loadingRange === activeRange ? (en ? "Loading history…" : "Cargando historial…") : copy.noChart}</div>
      )}

      <p className="mt-2 text-[11px] leading-relaxed text-fg-muted" data-chart-source={activeData.source ?? "unknown"}>{historySourceLabel(activeData.source, en, activeData.metadata)} · USD{lastDateLabel ? ` · ${lastDateLabel}` : ""}</p>
      {series.length >= 2 ? <p className="mt-1 text-[11px] text-fg-muted">{en ? "Change between the first and last observations of this period." : "Variación entre el primer y último registro del período."}</p> : null}
      {failedRange === activeRange ? <div role="status" className="mt-2 flex flex-wrap items-center gap-2 text-xs text-fg-muted"><span>{en ? "This period could not be loaded." : "No se pudo cargar este período."}</span><button type="button" className="min-h-11 underline" onClick={() => void handleSelectRange(activeRange)}>{copy.retry}</button></div> : null}
      {expanded ? <ExpandedAssetChart symbol={widget.ticker} name={widget.name} initialRange={activeRange} onClose={() => setExpanded(false)} /> : null}
      {bounds ? (
        <div className="mt-2">
          <div className="relative h-1 overflow-hidden rounded-full bg-surface-2" aria-hidden>
            <span
              className="absolute inset-y-0 left-0 rounded-full bg-brand/60"
              style={{ width: `${(position * 100).toFixed(1)}%` }}
            />
          </div>
          <div className="mt-1 flex items-center justify-between gap-3 text-[11px] tabular-nums text-fg-muted">
            <span className="num">
              {en ? "Min" : "Mín"} <span className="text-fg-body">{historyPrice(bounds.min, en)}</span>
            </span>
            <span className="num">
              {en ? "Max" : "Máx"} <span className="text-fg-body">{historyPrice(bounds.max, en)}</span>
            </span>
          </div>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center justify-end gap-2"><button type="button" onClick={() => setExpanded(true)} aria-haspopup="dialog" className="min-h-11 rounded-full border border-border-control px-3 text-xs font-medium text-fg outline-none hover:bg-surface-1 focus-visible:ring-4 focus-visible:ring-fg/20">{en ? "Expand and update chart" : "Ampliar y actualizar gráfico"}</button></div>
      {href ? (
        <div className="mt-3.5 flex flex-wrap items-center justify-end gap-2 border-t border-border/60 pt-3">
          <Link
            href={href}
            className="inline-flex min-h-8 items-center rounded-full border border-border/80 bg-surface-2/70 px-3 text-xs font-medium text-fg-body outline-none transition-colors duration-200 hover:border-brand/40 hover:bg-brand-soft/40 hover:text-brand focus-visible:ring-4 focus-visible:ring-fg/20"
          >
            {en ? "View asset" : "Ver ficha"}
          </Link>
          <Link
            href={`${href}?operar=comprar`}
            className="inline-flex min-h-8 items-center rounded-full bg-brand px-3 text-xs font-semibold text-white shadow-2xs outline-none transition-all duration-200 hover:bg-brand-hover hover:shadow-xs focus-visible:ring-4 focus-visible:ring-brand/30"
          >
            {copy.buyCta}
          </Link>
        </div>
      ) : null}
    </article>
  );
}

export function CompareWidget({
  widget,
  copy,
}: {
  widget: Extract<AiWidget, { type: "compare" }>;
  copy: AsistenteCopy;
}) {
  const en = copy === asistenteCopy.en;
  const aligned = useMemo(() => comparisonSeries(widget.items.map((item, index) => ({ id: String(index), points: item.points, source: item.source }))), [widget.items]);
  const rows = widget.items.map((item, index) => {
    const data = aligned.series[index];
    const base = data?.points[0]?.p;
    const ratios = base ? data!.points.filter((point) => !point.gap).map((point) => point.p / base - 1) : null;
    return { item, index, points: data?.points ?? [], ratios, change: data?.returnRatio ?? null, hasGaps: data?.hasGaps ?? false };
  });
  const scale = compareScale(rows.flatMap((row) => row.ratios ? [row.ratios] : []));
  const paths = rows.map((row) => {
    const bounds = aligned.bounds;
    const base = row.points[0]?.p;
    if (!bounds || !base || row.points.length < 2) return null;
    return chartSegments(row.points).filter((segment) => segment.length >= 2).map((segment) => segment.map((point, index) => {
      const x = 4 + (point.t - bounds.start) / (bounds.end - bounds.start) * (CHART_W - 8);
      const y = valueY(point.p / base - 1, CHART_H, scale.min, scale.max);
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(" ")).join(" ") || null;
  });
  const hasLine = paths.some((path) => path != null);
  const withChange = rows.filter((row) => row.change != null);
  let best: { index: number; change: number } | null = null;
  if (withChange.length >= 2) {
    for (const row of withChange) {
      if (row.change == null) continue;
      if (best == null || row.change > best.change) best = { index: row.index, change: row.change };
    }
  }
  const bestIndex = best?.index ?? -1;
  const summary = rows
    .map((row) => `${row.item.name} ${changeLabel(row.change, copy.noChange)}`)
    .join(". ");
  const zeroY = valueY(0, CHART_H, scale.min, scale.max);
  const href = compareHref(widget.items, widget.range);

  return (
    <article data-ai-widget="compare" className={WIDGET_CARD_CLASS}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold tracking-tight text-fg">{copy.compareTitle}</h2>
        <p className="label">{copy.ranges[widget.range]}</p>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-fg-muted">{aligned.bounds ? `${en ? "Common window" : "Ventana común"}: ${formatHoverDate(aligned.bounds.start, en)} → ${formatHoverDate(aligned.bounds.end, en)}. ` : en ? "No sufficient common window. " : "Sin ventana común suficiente. "}{en ? "Price changes included in this reply; open the comparison to update its data and coverage." : "Variaciones de precios incluidos en la respuesta; abre el comparador para actualizar sus datos y cobertura."}</p>
      {aligned.unavailable.length ? <p className="mt-1 text-xs text-fg-muted">{en ? "Assets without comparable history are excluded from the curves." : "Los activos sin historial comparable quedan fuera de las curvas."}</p> : null}
      {hasLine ? (
        <svg
          viewBox={`0 0 ${CHART_W} ${CHART_H}`}
          role="img"
          aria-label={`${copy.compareTitle}. ${summary}`}
          className="mt-3 h-24 w-full max-w-full"
        >
          <line
            x1="2"
            x2={CHART_W - 2}
            y1={zeroY.toFixed(1)}
            y2={zeroY.toFixed(1)}
            stroke="currentColor"
            className="text-border-strong"
            strokeDasharray="3 4"
          />
          {paths.map((path, index) => {
            const highlighted = index === bestIndex;
            return path ? (
              <path
                key={`${rows[index]?.item.ticker ?? "serie"}-${index}`}
                d={path}
                fill="none"
                stroke="currentColor"
                strokeWidth={highlighted ? "2.25" : "1.75"}
                strokeOpacity={highlighted ? "1" : "0.75"}
                strokeLinecap="round"
                strokeLinejoin="round"
                className={LINE_CLASS[index % LINE_CLASS.length]}
              />
            ) : null;
          })}
        </svg>
      ) : (
        <p className="mt-3 text-sm text-fg-muted">{copy.noChart}</p>
      )}
      <ul className="mt-3 flex flex-col gap-2">
        {rows.map((row) => {
          const isBest = row.index === bestIndex;
          const rowHref = detailHref(row.item.ticker);
          return (
            <li
              key={`${row.item.ticker}-${row.index}`}
              className={cn(
                "flex min-h-11 items-center gap-2 rounded-xl px-2 py-1 tabular-nums transition-colors",
                isBest ? "bg-surface-1/80 border border-brand/20" : "hover:bg-surface-1/40",
              )}
            >
              <span
                className={cn(
                  "size-2.5 shrink-0 rounded-full",
                  DOT_CLASS[row.index % DOT_CLASS.length],
                  isBest && "ring-2 ring-brand/30 ring-offset-2 ring-offset-bg-elevated",
                )}
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                {rowHref ? (
                  <Link
                    href={rowHref}
                    className="block truncate font-medium text-fg outline-none transition-colors hover:text-brand focus-visible:ring-4 focus-visible:ring-fg/20"
                  >
                    {row.item.name}
                  </Link>
                ) : (
                  <span className="block truncate font-medium text-fg">{row.item.name}</span>
                )}
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="block truncate text-sm text-fg-muted">{row.item.ticker}</span>
                  {isBest ? (
                    <span className="shrink-0 rounded-full border border-brand/30 bg-brand/10 px-1.5 py-px text-[10px] font-semibold tracking-wide text-brand">
                      {en ? "Highest change" : "Mayor variación"}
                    </span>
                  ) : null}
                </span>
                <span className="mt-0.5 block text-[11px] leading-relaxed text-fg-muted" data-chart-source={row.item.source ?? "unknown"}>{historySourceLabel(row.item.source, en, row.item.metadata)}{row.hasGaps ? (en ? " · Gaps in coverage" : " · Huecos de cobertura") : ""}</span>
              </span>
              {row.change == null ? (
                <span className="text-sm tabular-nums text-fg-muted">{copy.noChange}</span>
              ) : (
                <ChangeBadge value={row.change} className="tabular-nums" />
              )}
            </li>
          );
        })}
      </ul>
      {href ? (
        <div className="mt-3.5 flex items-center justify-end border-t border-border/60 pt-3">
          <Link
            href={href}
            className="inline-flex min-h-8 items-center rounded-full border border-border/80 bg-surface-2/70 px-3 text-xs font-medium text-fg-body outline-none transition-colors duration-200 hover:border-brand/40 hover:bg-brand-soft/40 hover:text-brand focus-visible:ring-4 focus-visible:ring-fg/20"
          >
            {en ? "Expand and update comparison" : "Ampliar y actualizar comparación"}
          </Link>
        </div>
      ) : null}
    </article>
  );
}

export function PortfolioWidget({
  widget,
  copy,
}: {
  widget: Extract<AiWidget, { type: "portfolio" }>;
  copy: AsistenteCopy;
}) {
  const total = finiteOrNull(widget.totalUsd);
  const pnl = finiteOrNull(widget.pnlPct);

  return (
    <article data-ai-widget="portfolio" className={WIDGET_CARD_CLASS}>
      <h2 className="label">{copy.portfolioTitle}</h2>
      <div className="mt-1 flex flex-wrap items-center gap-2 tabular-nums">
        <p className="num text-2xl font-semibold tracking-tight tabular-nums text-fg">
          {total == null ? copy.noTotal : formatUsd(total)}
        </p>
        {pnl == null ? null : <ChangeBadge value={pnl} className="tabular-nums" />}
      </div>
      {widget.positions.length === 0 ? (
        <p className="mt-3 text-sm text-fg-muted">{copy.noPositions}</p>
      ) : (
        <ul className="mt-3 border-t border-border/70">
          {widget.positions.map((position) => {
            const value = finiteOrNull(position.valueUsd);
            const weight = finiteOrNull(position.weightPct);
            const pct = weight == null ? null : clampRatio(weight <= 1 ? weight : weight / 100) * 100;
            const href = detailHref(position.ticker);
            return (
              <li key={position.ticker} className="border-b border-border/70 py-2.5 last:border-b-0">
                <div className="flex min-h-11 items-center gap-2 tabular-nums">
                  <TickerLogo
                    symbol={position.ticker}
                    name={position.name}
                    logoUrl={logoFor(position.ticker)}
                    size={32}
                    loading="lazy"
                    sizes="32px"
                  />
                  <span className="min-w-0 flex-1">
                    {href ? (
                      <Link
                        href={href}
                        className="block truncate font-medium text-fg outline-none transition-colors hover:text-brand focus-visible:ring-4 focus-visible:ring-fg/20"
                      >
                        {position.name}
                      </Link>
                    ) : (
                      <span className="block truncate font-medium text-fg">{position.name}</span>
                    )}
                    <span className="block truncate text-sm text-fg-muted">{position.ticker}</span>
                  </span>
                  <span className="shrink-0 text-right tabular-nums">
                    <span className="sr-only">{copy.valueLabel} </span>
                    <span className="num block text-sm font-medium tabular-nums text-fg">
                      {value == null ? copy.noPrice : formatUsd(value)}
                    </span>
                    <span className="sr-only">{copy.weightLabel} </span>
                    <span className="num block text-sm tabular-nums text-fg-muted">
                      {weight == null ? copy.noChange : formatPortion(weight)}
                    </span>
                  </span>
                </div>
                <span aria-hidden className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-surface-2 ring-1 ring-border/40">
                  <span
                    className="block h-full rounded-full bg-brand transition-[width] duration-300"
                    style={{ width: `${(pct ?? 0).toFixed(1)}%` }}
                  />
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </article>
  );
}

export function BuyWidget({
  widget,
  copy,
}: {
  widget: Extract<AiWidget, { type: "buy" }>;
  copy: AsistenteCopy;
}) {
  const href = safeBuyHref(widget.href);

  return (
    <article data-ai-widget="buy" className={WIDGET_CARD_CLASS}>
      <div className="flex items-center gap-3">
        <TickerLogo
          symbol={widget.ticker}
          name={widget.name}
          logoUrl={logoFor(widget.ticker)}
          size={40}
          loading="lazy"
          sizes="40px"
        />
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-fg">{widget.name}</h2>
          <p className="truncate text-sm text-fg-muted">{widget.ticker}</p>
        </div>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-fg-body">{copy.buyNote}</p>
      {href ? (
        <Button asChild className="mt-3 min-h-11 w-full">
          <Link href={href}>{copy.buyCta}</Link>
        </Button>
      ) : (
        <p className="mt-3 text-sm text-fg-muted">{copy.buyMissing}</p>
      )}
    </article>
  );
}
