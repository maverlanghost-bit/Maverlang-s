"use client";

import { useCallback, useState, type ReactNode } from "react";

import { ChangeBadge } from "@/components/domain/change-badge";
import { MarketStatusPill } from "@/components/domain/market-status-pill";
import { PriceChart } from "@/components/domain/price-chart";
import { PriceText } from "@/components/domain/price-text";
import { ErrorState } from "@/components/ui/error-state";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import { useHistory, useMarketStatus } from "@/lib/hooks/queries";
import { useT } from "@/lib/hooks/use-t";
import { displayPrice } from "@/lib/market/browse";
import { DETAIL_RANGES, isDetailRange, rangeMove, toneOf } from "@/lib/market/series";
import type { Currency, Quote, Range } from "@/lib/types";

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
}: {
  symbol: string;
  name: string;
  quote: Quote | null;
  pending: boolean;
  onRetry: () => void;
  currency: Currency;
  rate: number | undefined;
  fxPending: boolean;
}) {
  const { t } = useT();
  const [range, setRange] = useState<Range>("1M");
  const history = useHistory(symbol, range);
  const status = useMarketStatus();
  const points = history.data ?? [];
  const move = rangeMove(points);
  const tone = toneOf(move);
  const seriesKey = `${range}:${points.length}:${points[0]?.t ?? 0}:${points[points.length - 1]?.p ?? 0}`;
  const [hover, setHover] = useState<{ key: string; usd: number } | null>(null);
  const hoverUsd = hover && hover.key === seriesKey ? hover.usd : null;

  const onHover = useCallback(
    (usd: number | null) => {
      setHover((current) => {
        if (usd === null) return current === null ? current : null;
        if (current && current.key === seriesKey && current.usd === usd) return current;
        return { key: seriesKey, usd };
      });
    },
    [seriesKey],
  );

  const fxKnown = typeof rate === "number" && Number.isFinite(rate) && rate > 0;
  const waitingFx = currency === "CLP" && !fxKnown && fxPending;
  const priceCurrency = currency === "CLP" && fxKnown ? "CLP" : "USD";
  const usd = hoverUsd ?? quote?.priceUsd ?? null;
  const shown = usd === null || waitingFx ? null : displayPrice(usd, priceCurrency, rate);
  const showFxNote = Boolean(quote) && currency === "CLP" && !fxKnown && !fxPending;

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
        <PriceText value={shown} currency={priceCurrency} size="lg" live={hoverUsd === null} />
        {hoverUsd !== null ? <p className="text-sm text-fg-muted">{t.detail.onChart}</p> : null}
        {showFxNote ? <p className="text-sm text-fg-muted">{t.detail.fxFallback}</p> : null}
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-4" data-range={range} data-points={points.length}>
      {priceNode}

      <div className="flex flex-wrap items-center gap-2">
        {history.isPending ? (
          <Skeleton className="h-6 w-16 rounded-full" />
        ) : move === null ? (
          <span className="num text-sm text-fg-muted">—</span>
        ) : (
          <ChangeBadge value={move} />
        )}
        <span className="text-sm text-fg-muted">{t.detail.rangeCaption[range]}</span>
        {status.isSuccess ? (
          <MarketStatusPill open={status.data.underlyingOpen} label={status.data.underlyingOpen ? t.market.open : t.market.closed} />
        ) : status.isError ? (
          <span className="text-sm text-fg-muted">{t.market.statusError}</span>
        ) : (
          <Skeleton className="h-6 w-28 rounded-full" />
        )}
      </div>

      <SegmentedControl
        label={t.detail.rangesLabel}
        options={rangeOptions}
        value={range}
        fullWidth
        onChange={(value) => {
          if (isDetailRange(value)) setRange(value);
        }}
      />

      {history.isPending ? (
        <div role="status" aria-live="polite" aria-busy="true">
          <span className="sr-only">{t.states.loading}</span>
          <Skeleton className="h-56 w-full rounded-xl lg:h-72" />
        </div>
      ) : history.isError ? (
        <ErrorState
          title={t.detail.chartError}
          label={t.states.error}
          retryLabel={t.states.retry}
          onRetry={() => {
            void history.refetch();
          }}
        />
      ) : (
        <PriceChart
          points={points}
          tone={tone}
          label={fill(t.detail.chartLabel, { name, range: t.detail.rangeCaption[range] })}
          emptyLabel={t.detail.chartEmpty}
          errorLabel={t.detail.chartLibError}
          onHover={onHover}
        />
      )}
    </section>
  );
}
