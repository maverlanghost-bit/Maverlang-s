"use client";

import { useCallback, useMemo, useState, type ComponentProps, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";

import { ChangeBadge } from "@/components/domain/change-badge";
import { FlashPrice } from "@/components/domain/flash-price";
import { LazyPriceChart } from "@/components/domain/lazy-price-chart";
import { PriceFreshness } from "@/components/domain/price-freshness";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { indexFromKey } from "@/components/ui/keys";
import { getPrices } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { formatDateTime, formatMoney, formatPercent } from "@/lib/format";
import { useHistory, useMarketStatus } from "@/lib/hooks/queries";
import { useT } from "@/lib/hooks/use-t";
import { displayPrice } from "@/lib/market/browse";
import { poolDislocated, poolDislocationPct } from "@/lib/market/dislocation";
import { priceFlashDirection, type PriceFlash } from "@/lib/hooks/use-price-flash";
import { DETAIL_RANGES, isDetailRange, isReferenceHistory, rangeMove, seriesForQuote, toneOf } from "@/lib/market/series";
import type { Currency, PricePoint, Quote, Range } from "@/lib/types";

const NO_POINTS: readonly PricePoint[] = [];
const LIVE_RANGE_MS = 15_000;
const CLOSED_RANGE_MS = 60_000;

function pollsLiveChart(range: Range): boolean {
  return range === "1W" || range === "1M";
}

function fill(template: string, values: Record<string, string>) {
  let next = template;
  for (const [key, value] of Object.entries(values)) next = next.split(`{${key}}`).join(value);
  return next;
}

/**
 * Cápsula de rangos estilo broker (x.ai/bot light). Reemplaza al
 * `SegmentedControl` aquí para poder fijar el look de la ficha sin tocar el
 * componente compartido: contenedor `role="group"` con el mismo
 * `aria-label` ("Rango del gráfico") y botones con `aria-pressed`, tal como
 * los busca `e2e/detail.spec.ts`; el rango activo marca `data-range` en la
 * sección del panel. Teclado igual: ←→/Home/End mueven y enfocan.
 */
function RangeCapsule({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  const enabled = options;

  function move(current: string, key: string) {
    const index = Math.max(0, enabled.findIndex((option) => option.value === current));
    const nextIndex = indexFromKey(key, index, enabled.length);
    if (nextIndex === null) return;
    const option = enabled[nextIndex];
    if (!option) return;
    onChange(option.value);
    document.getElementById(`range-${option.value}`)?.focus();
  }

  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full border border-border/70 bg-surface-1/80 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      onKeyDown={(event) => {
        if (indexFromKey(event.key, 0, enabled.length) === null) return;
        event.preventDefault();
        move(value, event.key);
      }}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            id={`range-${option.value}`}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "min-h-9 shrink-0 rounded-full px-3.5 text-[13px] font-medium whitespace-nowrap outline-none transition-all duration-150 ease-spring focus-visible:ring-4 focus-visible:ring-fg/20 active:scale-[0.98]",
              selected ? "bg-fg text-bg shadow-xs" : "text-fg-muted hover:bg-surface-2 hover:text-fg",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
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
  priceUpdatedAt = null,
  priceStale = false,
  underlying = "",
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
  priceUpdatedAt?: string | number | null;
  priceStale?: boolean;
  /** Acción subyacente (AAPL). La muestra la fuente del cierre diario. */
  underlying?: string;
}) {
  const { t } = useT();
  const history = useHistory(symbol, range);
  const market = useMarketStatus();
  const marketOpen = market.data?.underlyingOpen === true;
  const pollChart = pollsLiveChart(range);
  const liveQuote = useQuery({
    queryKey: ["quote", symbol],
    queryFn: () => getPrices([symbol]),
    enabled: pollChart && symbol.trim().length > 0,
    refetchInterval: marketOpen ? LIVE_RANGE_MS : CLOSED_RANGE_MS,
    refetchIntervalInBackground: false,
  });
  const polledRow = pollChart ? liveQuote.data?.find((item) => item.symbol === symbol) : undefined;
  const polledAt = pollChart && liveQuote.dataUpdatedAt > 0 ? liveQuote.dataUpdatedAt : 0;
  const livePoint = useMemo(() => {
    if (!polledRow || polledAt <= 0 || !Number.isFinite(polledRow.priceUsd) || polledRow.priceUsd <= 0) {
      return undefined;
    }
    return { t: polledAt, p: polledRow.priceUsd };
  }, [polledRow, polledAt]);
  const points = seriesForQuote(history.data?.points ?? NO_POINTS, quote?.priceUsd);
  const move = rangeMove(points);
  // Referencia si el historial es mock o no está marcado real, sea cual sea
  // la fuente del precio actual. Sin datos cargados no hay serie que rotular.
  const illustrative = !history.isPending && !history.isError && isReferenceHistory(history.data);
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
  // N18: al recorrer el gráfico el precio se tiñe sólo contra el actual
  // (rojo si el punto es menor, verde si es mayor), sin destellar por tramo.
  const currentUsd = quote?.priceUsd ?? null;
  const hoverForce: PriceFlash | undefined =
    point !== null && currentUsd !== null && Number.isFinite(currentUsd)
      ? priceFlashDirection(currentUsd, point.usd, "usd", "usd")
      : undefined;
  const showFxNote = Boolean(quote) && currency === "CLP" && !fxKnown && !fxPending;
  const pointIso = point ? new Date(point.timeMs).toISOString() : null;
  const poolPct =
    quote && quote.source === "jupiter" && !quote.reference
      ? poolDislocationPct(quote.priceUsd, quote.marketPriceUsd)
      : null;
  const showDislocation = quote !== null && point === null && poolDislocated(quote.priceUsd, quote.marketPriceUsd);
  const marketValue =
    showDislocation && quote?.marketPriceUsd !== undefined && !waitingFx
      ? displayPrice(quote.marketPriceUsd, priceCurrency, rate)
      : null;
  const marketShown = marketValue === null ? null : formatMoney(marketValue, priceCurrency);

  const rangeOptions = DETAIL_RANGES.map((value) => ({ value, label: t.detail.rangeShort[value] }));
  const historySource = history.data?.source;
  const lastT = points[points.length - 1]?.t;
  const sourceLine =
    !history.isPending &&
    !history.isError &&
    points.length >= 2 &&
    lastT !== undefined &&
    (historySource === "closes" || historySource === "ticks")
      ? historySource === "closes"
        ? fill(t.detail.chartSourceClose, {
            symbol: underlying.trim() || symbol,
            when: formatDateTime(new Date(lastT).toISOString()),
          })
        : fill(t.detail.chartSourceTicks, { when: formatDateTime(new Date(lastT).toISOString()) })
      : null;

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
      <div className="flex min-w-0 max-w-full flex-col gap-2">
        <span className="font-medium">
          <FlashPrice value={shown} currency={priceCurrency} size="lg" live={point === null} force={hoverForce} />
        </span>
        <PriceFreshness
          at={polledAt > 0 ? polledAt : (priceUpdatedAt ?? quote.updatedAt)}
          stale={polledAt > 0 ? polledRow?.stale === true : priceStale || quote.stale === true}
          delayedOnly={polledAt <= 0}
          live={polledAt > 0 && polledRow?.stale !== true}
        />
        {point === null && quote.reference ? (
          <p className="text-sm text-fg-muted">{t.detail.referencePrice}</p>
        ) : null}
        {showFxNote ? <p className="text-sm text-fg-muted">{t.detail.fxFallback}</p> : null}
        {showDislocation && poolPct !== null && marketShown !== null ? (
          <p className="text-sm text-warn">
            {fill(t.detail.dislocated, { pct: formatPercent(poolPct), market: marketShown })}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <section className="flex min-w-0 max-w-full flex-col gap-4" data-range={range} data-points={points.length}>
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

      <RangeCapsule
        label={t.detail.rangesLabel}
        options={rangeOptions}
        value={range}
        onChange={(value) => {
          if (isDetailRange(value)) onRangeChange(value);
        }}
      />

      {illustrative ? <p className="text-sm text-fg-muted">{t.detail.chartReference}</p> : null}

      <div className="relative min-w-0 max-w-full">
        <LazyPriceChart
          points={points}
          tone={tone}
          livePoint={livePoint}
          quiet={history.isPending || history.isError}
          label={fill(t.detail.chartLabel, { name, range: t.detail.rangeCaption[range] })}
          emptyLabel={t.detail.chartEmpty}
          errorLabel={t.detail.chartLibError}
          onHover={onHover}
          {...({ reference: illustrative } as object as ComponentProps<typeof LazyPriceChart>)}
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
      {sourceLine ? <p className="text-xs text-fg-muted">{sourceLine}</p> : null}
    </section>
  );
}
