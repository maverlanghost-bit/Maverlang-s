import Link from "next/link";

import { ChangeBadge } from "@/components/domain/change-badge";
import { Sparkline } from "@/components/domain/sparkline";
import { TickerLogo } from "@/components/domain/ticker-logo";
import { Button } from "@/components/ui/button";
import {
  CHART_H,
  CHART_W,
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

function logoFor(ticker: string): string | null {
  return logoPathFromSymbol(ticker);
}

function changeLabel(value: number | null, empty: string): string {
  return value == null ? empty : formatPercent(value);
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

  return (
    <article data-ai-widget="stock" className="min-w-0 rounded-2xl border border-border/70 bg-surface-1 p-4">
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
              className="block truncate rounded-sm font-semibold text-fg outline-none focus-visible:ring-4 focus-visible:ring-fg/20"
            >
              {widget.name}
            </Link>
          ) : (
            <p className="truncate font-semibold text-fg">{widget.name}</p>
          )}
          <p className="truncate text-sm text-fg-muted">{widget.ticker}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="num text-base text-fg">{price == null ? copy.noPrice : formatUsd(price)}</p>
          {change == null ? (
            <p className="text-sm text-fg-muted">{copy.noChange}</p>
          ) : (
            <ChangeBadge value={change} className="mt-1" />
          )}
        </div>
      </div>
      <p className="label mt-4">{copy.ranges[widget.range]}</p>
      {series.length >= 2 ? (
        <Sparkline data={series} width={CHART_W} height={72} label={chartLabel} className="mt-2 h-auto w-full max-w-full" />
      ) : (
        <p className="mt-2 text-sm text-fg-muted">{copy.noChart}</p>
      )}
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
  const summary = rows
    .map((row) => `${row.item.name} ${changeLabel(row.change, copy.noChange)}`)
    .join(". ");
  const zeroY = valueY(0, CHART_H, scale.min, scale.max);

  return (
    <article data-ai-widget="compare" className="min-w-0 rounded-2xl border border-border/70 bg-surface-1 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold text-fg">{copy.compareTitle}</h2>
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
          {paths.map((path, index) =>
            path ? (
              <path
                key={`${rows[index]?.item.ticker ?? "serie"}-${index}`}
                d={path}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={LINE_CLASS[index % LINE_CLASS.length]}
              />
            ) : null,
          )}
        </svg>
      ) : (
        <p className="mt-3 text-sm text-fg-muted">{copy.noChart}</p>
      )}
      <ul className="mt-3 flex flex-col gap-2">
        {rows.map((row) => (
          <li key={`${row.item.ticker}-${row.index}`} className="flex min-h-11 items-center gap-2">
            <span className={cn("size-2.5 shrink-0 rounded-full", DOT_CLASS[row.index % DOT_CLASS.length])} aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-fg">{row.item.name}</span>
              <span className="block truncate text-sm text-fg-muted">{row.item.ticker}</span>
            </span>
            {row.change == null ? (
              <span className="text-sm text-fg-muted">{copy.noChange}</span>
            ) : (
              <ChangeBadge value={row.change} />
            )}
          </li>
        ))}
      </ul>
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
    <article data-ai-widget="portfolio" className="min-w-0 rounded-2xl border border-border/70 bg-surface-1 p-4">
      <h2 className="label">{copy.portfolioTitle}</h2>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <p className="num text-2xl tracking-tight text-fg">{total == null ? copy.noTotal : formatUsd(total)}</p>
        {pnl == null ? null : <ChangeBadge value={pnl} />}
      </div>
      {widget.positions.length === 0 ? (
        <p className="mt-3 text-sm text-fg-muted">{copy.noPositions}</p>
      ) : (
        <ul className="mt-3 border-t border-border/70">
          {widget.positions.map((position) => {
            const value = finiteOrNull(position.valueUsd);
            const weight = finiteOrNull(position.weightPct);
            return (
              <li
                key={position.ticker}
                className="flex min-h-11 items-center gap-2 border-b border-border/70 py-2 last:border-b-0"
              >
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
                <span className="shrink-0 text-right">
                  <span className="sr-only">{copy.valueLabel} </span>
                  <span className="num block text-sm text-fg">{value == null ? copy.noPrice : formatUsd(value)}</span>
                  <span className="sr-only">{copy.weightLabel} </span>
                  <span className="num block text-sm text-fg-muted">
                    {weight == null ? copy.noChange : formatPortion(weight)}
                  </span>
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
    <article data-ai-widget="buy" className="min-w-0 rounded-2xl border border-border/70 bg-surface-1 p-4">
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
