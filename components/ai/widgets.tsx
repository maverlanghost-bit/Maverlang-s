"use client";

import Link from "next/link";
import { useCallback, useId, useMemo, useRef, useState } from "react";

import { ChangeBadge } from "@/components/domain/change-badge";
import { sparklineSmoothPath } from "@/components/domain/sparkline";
import { TickerLogo } from "@/components/domain/ticker-logo";
import { Button } from "@/components/ui/button";
import {
  CHART_H,
  CHART_W,
  cleanTicker,
  compareScale,
  detailHref,
  finiteOrNull,
  normalizeToRatio,
  safeBuyHref,
  seriesPath,
  valueY,
} from "@/components/ai/model";
import { getHistory } from "@/lib/api/client";
import { logoPathFromSymbol } from "@/lib/catalog/logos";
import { cn } from "@/lib/cn";
import { formatPercent, formatPortion, formatUsd } from "@/lib/format";
import type { AsistenteCopy } from "@/content/i18n/extra-asistente";
import type { AiWidget } from "@/components/ai/contract";

const LINE_CLASS = ["text-fg", "text-info", "text-up", "text-warn", "text-down"] as const;
const DOT_CLASS = ["bg-fg", "bg-info", "bg-up", "bg-warn", "bg-down"] as const;

export const WIDGET_CARD_CLASS =
  "min-w-0 rounded-2xl border border-border/80 bg-white dark:bg-bg-elevated p-4 shadow-2xs transition-all duration-200 hover:border-brand/35 hover:shadow-xs";

const STOCK_RANGES: readonly ("1D" | "1W" | "1M")[] = ["1D", "1W", "1M"];

function logoFor(ticker: string): string | null {
  return logoPathFromSymbol(ticker);
}

function changeLabel(value: number | null, empty: string): string {
  return value == null ? empty : formatPercent(value);
}

/**
 * Enlace al comparador público: sólo con exactamente dos activos del catálogo.
 * Usa el ticker en minúsculas; la página canónica resuelve slug, símbolo o ticker.
 */
function compareHref(items: readonly { ticker: string }[]): string | null {
  if (items.length !== 2) return null;
  const first = cleanTicker(items[0]?.ticker ?? "");
  const second = cleanTicker(items[1]?.ticker ?? "");
  if (!first || !second) return null;
  return `/comparar/${first.toLowerCase()}-vs-${second.toLowerCase()}`;
}

function clampRatio(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function formatHoverDate(t: number): string | null {
  if (!Number.isFinite(t) || t < 1_000_000) return null;
  const ms = t < 1e11 ? t * 1000 : t;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("es-CL", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Santiago",
  }).format(d);
}

export function StockWidget({
  widget,
  copy,
}: {
  widget: Extract<AiWidget, { type: "stock" }>;
  copy: AsistenteCopy;
}) {
  const [activeRange, setActiveRange] = useState<"1D" | "1W" | "1M">(widget.range);
  const [historyCache, setHistoryCache] = useState<
    Partial<
      Record<
        "1D" | "1W" | "1M",
        {
          points: { t: number; p: number }[];
          priceUsd: number | null;
          changePct: number | null;
        }
      >
    >
  >({
    [widget.range]: {
      points: widget.points,
      priceUsd: widget.priceUsd,
      changePct: widget.changePct,
    },
  });
  const [loadingRange, setLoadingRange] = useState<"1D" | "1W" | "1M" | null>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const gradientId = `stock-chart-grad-${useId().replace(/:/g, "")}`;

  const activeData = historyCache[activeRange] ?? {
    points: widget.range === activeRange ? widget.points : [],
    priceUsd: widget.range === activeRange ? widget.priceUsd : null,
    changePct: widget.range === activeRange ? widget.changePct : null,
  };

  const points = activeData.points;
  const currentPrice = finiteOrNull(activeData.priceUsd);
  const currentChange = finiteOrNull(activeData.changePct);
  const href = detailHref(widget.ticker);

  const series = useMemo(() => {
    return points
      .map((pt) => ({ t: pt.t, p: pt.p }))
      .filter((pt) => Number.isFinite(pt.p) && pt.p > 0);
  }, [points]);

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
    if (series.length < 2) return null;
    return sparklineSmoothPath(
      series.map((pt) => pt.p),
      CHART_W,
      72,
    );
  }, [series]);

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
    return formatHoverDate(hoveredPoint.t);
  }, [hoveredPoint]);

  const handleSelectRange = useCallback(
    async (range: "1D" | "1W" | "1M") => {
      if (range === activeRange) return;
      setActiveRange(range);
      setHoveredIndex(null);

      if (historyCache[range]) return;

      setLoadingRange(range);
      try {
        const res = await getHistory(widget.ticker, range);
        const pts = res.points ?? [];
        let price = currentPrice;
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
          [range]: { points: pts, priceUsd: price, changePct: change },
        }));
      } catch {
        // En caso de fallo de red mantenemos los datos previos
      } finally {
        setLoadingRange(null);
      }
    },
    [activeRange, historyCache, widget.ticker, currentPrice],
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
            {displayPrice == null ? copy.noPrice : formatUsd(displayPrice)}
          </p>
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
          role="tablist"
          aria-label="Rango de tiempo"
        >
          {STOCK_RANGES.map((r) => {
            const isSelected = r === activeRange;
            const isLoading = r === loadingRange;
            return (
              <button
                key={r}
                type="button"
                role="tab"
                aria-selected={isSelected}
                disabled={isLoading}
                onClick={() => void handleSelectRange(r)}
                className={cn(
                  "inline-flex min-h-6 min-w-8 items-center justify-center rounded-full px-2 text-[11px] font-semibold transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-fg/20",
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
            aria-label={`${widget.name}, ${copy.ranges[activeRange]}`}
            className={cn("h-20 w-full max-w-full touch-none select-none", toneClass)}
            onPointerMove={(e) => {
              if (!svgRef.current || series.length < 2) return;
              const rect = svgRef.current.getBoundingClientRect();
              if (rect.width <= 0) return;
              const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
              const idx = Math.round(ratio * (series.length - 1));
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
              const x = PAD + (hoveredIndex / (series.length - 1)) * innerW;
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
        <p className="mt-2 text-sm text-fg-muted">{copy.noChart}</p>
      )}

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
              Mín <span className="text-fg-body">{formatUsd(bounds.min)}</span>
            </span>
            <span className="num">
              Máx <span className="text-fg-body">{formatUsd(bounds.max)}</span>
            </span>
          </div>
        </div>
      ) : null}

      {href ? (
        <div className="mt-3.5 flex items-center justify-end gap-2 border-t border-border/60 pt-3">
          <Link
            href={href}
            className="inline-flex min-h-8 items-center rounded-full border border-border/80 bg-surface-2/70 px-3 text-xs font-medium text-fg-body outline-none transition-colors duration-200 hover:border-brand/40 hover:bg-brand-soft/40 hover:text-brand focus-visible:ring-4 focus-visible:ring-fg/20"
          >
            Ver ficha
          </Link>
          <Link
            href={`${href}?operar=comprar`}
            className="inline-flex min-h-8 items-center rounded-full bg-brand px-3 text-xs font-semibold text-white shadow-2xs outline-none transition-all duration-200 hover:bg-brand-hover hover:shadow-xs focus-visible:ring-4 focus-visible:ring-brand/30"
          >
            Comprar
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
  const rows = widget.items.map((item, index) => {
    const ratios = normalizeToRatio(item.points);
    const change = finiteOrNull(item.changePct) ?? (ratios ? (ratios[ratios.length - 1] ?? null) : null);
    return { item, index, ratios, change };
  });
  const drawn = rows.flatMap((row) => (row.ratios ? [row.ratios] : []));
  const scale = compareScale(drawn);
  const paths = rows.map((row) =>
    row.ratios ? seriesPath(row.ratios, CHART_W, CHART_H, scale.min, scale.max) : null,
  );
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
  const href = compareHref(widget.items);

  return (
    <article data-ai-widget="compare" className={WIDGET_CARD_CLASS}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold tracking-tight text-fg">{copy.compareTitle}</h2>
        <p className="label">{copy.ranges[widget.range]}</p>
      </div>
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
                      Mejor del período
                    </span>
                  ) : null}
                </span>
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
            Ver comparación
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
