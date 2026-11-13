import Link from "next/link";

import { ChangeBadge } from "@/components/domain/change-badge";
import { Sparkline } from "@/components/domain/sparkline";
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
import { logoPathFromSymbol } from "@/lib/catalog/logos";
import { cn } from "@/lib/cn";
import { formatPercent, formatPortion, formatUsd } from "@/lib/format";
import type { AsistenteCopy } from "@/content/i18n/extra-asistente";
import type { AiWidget } from "@/components/ai/contract";

const LINE_CLASS = ["text-fg", "text-info", "text-up", "text-warn", "text-down"] as const;
const DOT_CLASS = ["bg-fg", "bg-info", "bg-up", "bg-warn", "bg-down"] as const;
const WIDGET_CARD_CLASS =
  "min-w-0 rounded-2xl border border-border/85 bg-bg-elevated/95 p-4 shadow-[0_10px_30px_-14px_rgba(12,15,20,0.1)] backdrop-blur-md transition-all duration-200 hover:border-brand/35 hover:shadow-[0_14px_34px_-14px_rgba(12,15,20,0.14)]";

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

/** Mínimo y máximo de una serie ya filtrada por finitud; `null` si no hay trazo posible. */
function seriesBounds(series: readonly number[]): { min: number; max: number } | null {
  if (series.length < 2) return null;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const value of series) {
    if (!Number.isFinite(value)) continue;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  return { min, max };
}

function clampRatio(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function StockWidget({
  widget,
  copy,
}: {
  widget: Extract<AiWidget, { type: "stock" }>;
  copy: AsistenteCopy;
}) {
  const price = finiteOrNull(widget.priceUsd);
  const change = finiteOrNull(widget.changePct);
  const href = detailHref(widget.ticker);
  const series = widget.points.map((point) => point.p).filter((value) => Number.isFinite(value));
  const chartLabel = `${widget.name}, ${copy.ranges[widget.range]}`;
  const bounds = seriesBounds(series);
  const lastPrice = series.length > 0 ? (series[series.length - 1] ?? null) : null;
  const span = bounds ? bounds.max - bounds.min : 0;
  const position =
    bounds == null || lastPrice == null
      ? 0
      : span > 0
        ? clampRatio((lastPrice - bounds.min) / span)
        : 1;

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
            {price == null ? copy.noPrice : formatUsd(price)}
          </p>
          {change == null ? (
            <p className="text-sm tabular-nums text-fg-muted">{copy.noChange}</p>
          ) : (
            <ChangeBadge value={change} className="mt-1 tabular-nums" />
          )}
        </div>
      </div>
      <p className="label mt-4">{copy.ranges[widget.range]}</p>
      {series.length >= 2 ? (
        <Sparkline data={series} width={CHART_W} height={72} label={chartLabel} className="mt-2 h-auto w-full max-w-full" />
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
        <div className="mt-3 flex items-center justify-end">
          <Link
            href={href}
            className="inline-flex min-h-8 items-center rounded-full border border-border/80 bg-surface-2/70 px-3 text-xs font-medium text-fg-body outline-none transition-colors duration-200 hover:border-brand/40 hover:bg-brand-soft/40 hover:text-brand focus-visible:ring-4 focus-visible:ring-fg/20"
          >
            Ver ficha
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
                strokeWidth={highlighted ? "2" : "1.75"}
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
          return (
            <li key={`${row.item.ticker}-${row.index}`} className="flex min-h-11 items-center gap-2 tabular-nums">
              <span
                className={cn(
                  "size-2.5 shrink-0 rounded-full",
                  DOT_CLASS[row.index % DOT_CLASS.length],
                  isBest && "ring-2 ring-brand/25 ring-offset-2 ring-offset-bg-elevated",
                )}
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-fg">{row.item.name}</span>
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
        <div className="mt-3 flex items-center justify-end">
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
            return (
              <li key={position.ticker} className="border-b border-border/70 py-2 last:border-b-0">
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
                    <span className="block truncate font-medium text-fg">{position.name}</span>
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
                <span aria-hidden className="mt-1 block h-1 overflow-hidden rounded-full bg-surface-2">
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
