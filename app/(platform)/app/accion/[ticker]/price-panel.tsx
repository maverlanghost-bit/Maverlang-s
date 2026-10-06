"use client";

import { useCallback, useState, type ReactNode } from "react";

import { ChangeBadge } from "@/components/domain/change-badge";
import { PriceChart } from "@/components/domain/price-chart";
import { PriceText } from "@/components/domain/price-text";
import { ErrorState } from "@/components/ui/error-state";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip } from "@/components/ui/tooltip";
import { formatDateTime } from "@/lib/format";
import { useHistory } from "@/lib/hooks/queries";
import { useT } from "@/lib/hooks/use-t";
import { displayPrice } from "@/lib/market/browse";
import { DETAIL_RANGES, isDetailRange, rangeMove, seriesForQuote, toneOf } from "@/lib/market/series";
import type { Currency, PricePoint, Quote, Range } from "@/lib/types";

const NO_POINTS: readonly PricePoint[] = [];

function fill(template: string, values: Record<string, string>) {
  let next = template;
  for (const [key, value] of Object.entries(values)) next = next.split(`{${key}}`).join(value);
  return next;
}

export function PricePanel({
  symbol,
  name,
  quote,
  pending,
  onRetry,
  currency,
  rate,
  fxPending,
  range,
  onRangeChange,
}: {
  symbol: string;
  name: string;
  quote: Quote | null;
  pending: boolean;
  onRetry: () => void;
  currency: Currency;
  rate: number | undefined;
  fxPending: boolean;
  range: Range;
  onRangeChange: (range: Range) => void;
}) {
  const { t } = useT();
  const history = useHistory(symbol, range);
  const points = seriesForQuote(history.data ?? NO_POINTS, quote?.priceUsd);
  const move = rangeMove(points);
  const illustrative =
    !history.isPending &&
    !history.isError &&
    points.length > 1 &&
    quote?.source === "jupiter" &&
    quote.reference !== true;
  const tone = toneOf(move);
  const seriesKey = `${range}:${points.length}:${points[0]?.t ?? 0}:${points[points.length - 1]?.p ?? 0}`;
  const [hover, setHover] = useState<{ key: string; usd: number; timeMs: number } | null>(null);
  const point = hover && hover.key === seriesKey ? hover : null;

  const onHover = useCallback(
    (usd: number | null, timeMs?: number | null) => {
      setHover((current) => {
        if (usd === null || timeMs == null || !Number.isFinite(timeMs)) return current === null ? current : null;
        if (current && current.key === seriesKey && current.usd === usd && current.timeMs === timeMs) return current;
        return { key: seriesKey, usd, timeMs };
      });
    },
    [seriesKey],
  );

  const fxKnown = typeof rate === "number" && Number.isFinite(rate) && rate > 0;
  const waitingFx = currency === "CLP" && !fxKnown && fxPending;
  const priceCurrency = currency === "CLP" && fxKnown ? "CLP" : "USD";
  const usd = point?.usd ?? quote?.priceUsd ?? null;
  const shown = usd === null || waitingFx ? null : displayPrice(usd, priceCurrency, rate);
  const showFxNote = Boolean(quote) && currency === "CLP" && !fxKnown && !fxPending;
  const pointIso = point ? new Date(point.timeMs).toISOString() : null;

  const rangeOptions = DETAIL_RANGES.map((value) => ({ value, label: t.detail.rangeShort[value] }));

  let priceNode: ReactNode;
  if ((pending && !quote) || waitingFx) {
    priceNode = <Skeleton className="h-12 w-48" />;
  } else if (!quote || shown === null) {
    priceNode = (
      <ErrorState
        title={t.detail.priceError}
        label={t.states.error}
        retryLabel={t.states.retry}
        onRetry={onRetry}
      />
    );
  } else {
    priceNode = (
      <div className="flex flex-col gap-2">
        <PriceText value={shown} currency={priceCurrency} size="lg" live={point === null} />
        {point === null && quote.reference ? (
          <p className="text-sm text-fg-muted">{t.detail.referencePrice}</p>
        ) : null}
        {showFxNote ? <p className="text-sm text-fg-muted">{t.detail.fxFallback}</p> : null}
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-4" data-range={range} data-points={points.length}>
      {priceNode}

      <div className="flex h-7 min-w-0 items-center gap-2 overflow-hidden">
        {history.isPending ? (
          <Skeleton className="h-6 w-16 shrink-0 rounded-full" />
        ) : pointIso ? (
          <p className="num min-w-0 truncate text-sm text-fg-muted">
            <span className="sr-only">{t.detail.onChart}. </span>
            <time dateTime={pointIso}>{formatDateTime(pointIso)}</time>
          </p>
        ) : move === null ? (
          <span className="num text-sm text-fg-muted">—</span>
        ) : (
          <>
            <ChangeBadge value={move} />
            <span className="min-w-0 truncate text-sm text-fg-muted">{t.detail.rangeCaption[range]}</span>
          </>
        )}
      </div>

      <SegmentedControl
        toggle
        label={t.detail.rangesLabel}
        options={rangeOptions}
        value={range}
        fullWidth
        onChange={(value) => {
          if (isDetailRange(value)) onRangeChange(value);
        }}
      />

      <div className="relative">
        {illustrative ? (
          <div className="absolute top-2 right-2 z-20">
            <Tooltip content={t.detail.chartIllustrativeNote}>
              <button
                type="button"
                className="rounded-full bg-surface-2 px-2 py-1 text-xs text-fg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg"
              >
                {t.detail.chartIllustrative}
              </button>
            </Tooltip>
          </div>
        ) : null}
        <PriceChart
          points={points}
          tone={tone}
          quiet={history.isPending || history.isError}
          label={fill(t.detail.chartLabel, { name, range: t.detail.rangeCaption[range] })}
          emptyLabel={t.detail.chartEmpty}
          errorLabel={t.detail.chartLibError}
          onHover={onHover}
        />
        {history.isPending ? (
          <div className="absolute inset-0 z-10 bg-bg" role="status" aria-live="polite" aria-busy="true">
            <span className="sr-only">{t.states.loading}</span>
            <Skeleton className="size-full rounded-xl" />
          </div>
        ) : null}
        {history.isError ? (
          <div className="absolute inset-0 z-10 overflow-y-auto bg-bg">
            <ErrorState
              title={t.detail.chartError}
              label={t.states.error}
              retryLabel={t.states.retry}
              onRetry={() => {
                void history.refetch();
              }}
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}
