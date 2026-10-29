"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useQuery, type Query } from "@tanstack/react-query";

import { ChangeBadge } from "@/components/domain/change-badge";
import { ChartLegend, ChartStudyBar, RsiPanel, SMA_COLOR, StudiesSkeleton } from "@/components/domain/chart-overlays";
import { FlashPrice } from "@/components/domain/flash-price";
import { PriceFreshness } from "@/components/domain/price-freshness";
import { TONE_STROKE } from "@/components/domain/svg-price-chart";
import { SvgPriceChart } from "@/components/domain/svg-price-chart";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { indexFromKey } from "@/components/ui/keys";
import { graficoCopy } from "@/content/i18n/extra-grafico";
import { historyStaleMs } from "@/lib/api/contracts";
import { getHistory, getPrices } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { formatDateTime, formatMoney, formatPercent } from "@/lib/format";
import { useChartMode } from "@/lib/hooks/use-chart-mode";
import { useHistory, useMarketStatus } from "@/lib/hooks/queries";
import { priceFlashDirection, type PriceFlash } from "@/lib/hooks/use-price-flash";
import { useT } from "@/lib/hooks/use-t";
import { displayPrice } from "@/lib/market/browse";
import { barAvailability, BENCHMARK_COLOR, type ChartOverlay } from "@/lib/market/chart-geometry";
import { poolDislocated, poolDislocationPct } from "@/lib/market/dislocation";
import { chartStudies, SMA_PERIODS, SPY_SYMBOL, type ChartStudies, type SmaPeriod } from "@/lib/market/indicators";
import { DETAIL_RANGES, isDetailRange, isReferenceHistory, rangeMove, toneOf } from "@/lib/market/series";
import type { Currency, PricePoint, Quote, Range } from "@/lib/types";

const NO_POINTS: readonly PricePoint[] = [];
const NO_OVERLAYS: readonly ChartOverlay[] = [];
const LIVE_RANGE_MS = 15_000;
const CLOSED_RANGE_MS = 60_000;
/** Cierres largos y SPYx en modo Técnico: una lectura, fresca una hora. */
const STUDY_STALE_MS = 60 * 60 * 1000;
const EMPTY_STUDIES: ChartStudies = {
  spyPoints: [],
  sma: { 20: [], 50: [], 200: [] },
  rsi: [],
};
const NO_BARS = { volume: false, ohlc: false };

function studyQueryOptions(enabled: boolean) {
  return {
    enabled,
    staleTime: (query: Query) => historyStaleMs(query.state.data, STUDY_STALE_MS),
    gcTime: STUDY_STALE_MS,
    retry: false,
    refetchInterval: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  };
}

const periodDateFormatter = new Intl.DateTimeFormat("es-CL", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "America/Santiago",
});

function formatPeriodDate(timeMs: number): string {
  return periodDateFormatter.format(timeMs);
}

/** Extremos de la serie que pinta el gráfico. El vivo sólo alarga el final. */
function periodBounds(
  points: readonly PricePoint[],
  livePoint: PricePoint | undefined,
): { start: number; end: number } | null {
  let start = Number.POSITIVE_INFINITY;
  let end = Number.NEGATIVE_INFINITY;
  let count = 0;
  for (const point of points) {
    if (!Number.isFinite(point.t) || !Number.isFinite(point.p) || point.p <= 0) continue;
    count += 1;
    if (point.t < start) start = point.t;
    if (point.t > end) end = point.t;
  }
  if (
    livePoint &&
    Number.isFinite(livePoint.t) &&
    Number.isFinite(livePoint.p) &&
    livePoint.p > 0 &&
    count > 0 &&
    livePoint.t > end
  ) {
    end = livePoint.t;
    count += 1;
  }
  if (count < 2) return null;
  return { start, end };
}

function pollsLiveChart(range: Range): boolean {
  return range === "1W" || range === "1M";
}

function livePricePoint(row: { priceUsd: number } | undefined, at: number): PricePoint | undefined {
  if (!row || at <= 0 || !Number.isFinite(row.priceUsd) || row.priceUsd <= 0) return undefined;
  return { t: at, p: row.priceUsd };
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
  idPrefix = "range",
  className,
}: {
  label: string;
  options: readonly { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  idPrefix?: string;
  className?: string;
}) {
  const enabled = options;

  function move(current: string, key: string) {
    const index = Math.max(0, enabled.findIndex((option) => option.value === current));
    const nextIndex = indexFromKey(key, index, enabled.length);
    if (nextIndex === null) return;
    const option = enabled[nextIndex];
    if (!option) return;
    onChange(option.value);
    document.getElementById(`${idPrefix}-${option.value}`)?.focus();
  }

  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full border border-border/70 bg-surface-1/80 p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
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
            id={`${idPrefix}-${option.value}`}
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
  const { t, language } = useT();
  const copy = graficoCopy(language);
  const { mode, setMode } = useChartMode();
  const technical = mode === "technical";
  const symbolKey = symbol.trim();
  const history = useHistory(symbol, range);
  // Simple no pide SPYx ni el historial largo. Técnico los pide una vez.
  const spyEnabled = technical && symbolKey.length > 0 && symbolKey.toUpperCase() !== SPY_SYMBOL.toUpperCase();
  const spyHistory = useQuery({
    queryKey: ["history", SPY_SYMBOL, range] as const,
    queryFn: () => getHistory(SPY_SYMBOL, range),
    ...studyQueryOptions(spyEnabled),
  });
  const longHistory = useQuery({
    queryKey: ["history", symbolKey, "ALL"] as const,
    queryFn: () => getHistory(symbolKey, "ALL"),
    ...studyQueryOptions(technical && symbolKey.length > 0),
  });
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
  const livePoint = useMemo(() => livePricePoint(polledRow, polledAt), [polledRow, polledAt]);
  const points = history.data?.points ?? NO_POINTS;
  const period = periodBounds(points, livePoint);
  const move = rangeMove(points);
  // Referencia si el historial es mock o no está marcado real, sea cual sea
  // la fuente del precio actual. Sin datos cargados no hay serie que rotular.
  // Sin línea dibujada (menos de 2 puntos) no hay serie que rotular.
  const illustrative =
    !history.isPending && !history.isError && points.length >= 2 && isReferenceHistory(history.data);
  const tone = toneOf(move);
  const [hover, setHover] = useState<{ key: string; usd: number; timeMs: number } | null>(null);
  const [spyOn, setSpyOn] = useState(false);
  const [smaOn, setSmaOn] = useState<Record<SmaPeriod, boolean>>({ 20: false, 50: false, 200: false });
  const [rsiOn, setRsiOn] = useState(false);
  const [draw, setDraw] = useState<"line" | "candles">("line");
  const [volumeOn, setVolumeOn] = useState(false);
  const chartReady = !history.isPending && !history.isError && points.length >= 2;
  const bars = useMemo(() => (chartReady ? barAvailability(points) : NO_BARS), [chartReady, points]);
  // El intervalo se recalcula adentro. Depender de `period.start` (un número
  // sacado de un objeto local) hace que el compilador descarte el useMemo.
  const studies = useMemo(() => {
    if (!technical) return EMPTY_STUDIES;
    return chartStudies({
      symbol,
      range,
      illustrative,
      window: periodBounds(history.data?.points ?? NO_POINTS, livePricePoint(polledRow, polledAt)),
      spy: spyHistory.data
        ? { points: spyHistory.data.points, reference: isReferenceHistory(spyHistory.data) }
        : null,
      closes: longHistory.data
        ? { points: longHistory.data.points, reference: isReferenceHistory(longHistory.data) }
        : null,
    });
  }, [technical, symbol, range, illustrative, history.data, polledRow, polledAt, spyHistory.data, longHistory.data]);
  const overlays = useMemo(() => {
    if (!technical || !chartReady) return NO_OVERLAYS;
    const list: ChartOverlay[] = [];
    for (const periodKey of SMA_PERIODS) {
      if (!smaOn[periodKey]) continue;
      const series = studies.sma[periodKey];
      if (series.length < 2) continue;
      list.push({
        id: `sma-${periodKey}`,
        points: series,
        color: SMA_COLOR[periodKey],
        label: periodKey === 20 ? copy.sma20 : periodKey === 50 ? copy.sma50 : copy.sma200,
      });
    }
    return list.length === 0 ? NO_OVERLAYS : list;
  }, [technical, chartReady, smaOn, studies, copy]);
  const benchmark = useMemo(() => {
    if (!technical || !chartReady || !spyOn || studies.spyPoints.length < 2) return null;
    return { points: studies.spyPoints, label: copy.spyLegend };
  }, [technical, chartReady, spyOn, studies.spyPoints, copy.spyLegend]);
  const showSpy = chartReady && studies.spyPoints.length >= 2;
  const smaChoices = chartReady ? SMA_PERIODS.filter((periodKey) => studies.sma[periodKey].length >= 2) : [];
  const showRsi = chartReady && studies.rsi.length >= 2;
  const legendItems = [
    ...(benchmark
      ? [
          {
            id: "asset",
            label: symbol,
            color: illustrative ? BENCHMARK_COLOR : TONE_STROKE[tone],
            dashed: illustrative,
          },
          { id: "benchmark", label: copy.spyLegend, color: BENCHMARK_COLOR, dashed: true },
        ]
      : []),
    ...overlays.map((item) => ({
      id: item.id,
      label: item.label,
      color: item.color,
      dashed: Boolean(item.dash),
    })),
  ];
  const seriesKey = `${range}:${points.length}:${points[0]?.t ?? 0}:${points[points.length - 1]?.p ?? 0}`;
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
    <section
      className="flex min-w-0 max-w-full flex-col gap-4"
      data-range={range}
      data-points={points.length}
      data-chart-mode={mode}
    >
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

      <div className="flex min-w-0 items-center gap-2">
        <div className="min-w-0">
          <RangeCapsule
            label={t.detail.rangesLabel}
            options={rangeOptions}
            value={range}
            onChange={(value) => {
              if (isDetailRange(value)) onRangeChange(value);
            }}
          />
        </div>
        <RangeCapsule
          className="shrink-0"
          idPrefix="chart-mode"
          label={copy.modeLabel}
          options={[
            { value: "simple", label: copy.modeSimple },
            { value: "technical", label: copy.modeTechnical },
          ]}
          value={mode}
          onChange={(value) => setMode(value === "technical" ? "technical" : "simple")}
        />
      </div>

      {illustrative ? <p className="text-sm text-fg-muted">{t.detail.chartReference}</p> : null}

      <div className="min-w-0 max-w-full rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_rgba(16,24,40,0.08)] sm:p-7">
        {technical ? (
          longHistory.isLoading ? (
            <StudiesSkeleton label={copy.studiesLoading} />
          ) : (
            <ChartStudyBar
              copy={copy}
              spyPending={spyHistory.isLoading}
              spy={showSpy ? { on: spyOn, onToggle: () => setSpyOn((value) => !value) } : null}
              smas={smaChoices.map((periodKey) => ({
                period: periodKey,
                on: smaOn[periodKey],
                onToggle: () => setSmaOn((current) => ({ ...current, [periodKey]: !current[periodKey] })),
              }))}
              rsi={showRsi ? { on: rsiOn, onToggle: () => setRsiOn((value) => !value) } : null}
              volume={
                bars.volume ? { on: volumeOn, onToggle: () => setVolumeOn((value) => !value), label: copy.volume } : null
              }
              style={
                bars.ohlc
                  ? {
                      value: draw,
                      line: copy.styleLine,
                      candles: copy.styleCandles,
                      label: copy.styleLabel,
                      onChange: setDraw,
                    }
                  : null
              }
            />
          )
        ) : null}
        <div className="relative min-w-0 max-w-full">
          <SvgPriceChart
            points={points}
            tone={tone}
            livePoint={livePoint}
            quiet={history.isPending || history.isError}
            label={fill(t.detail.chartLabel, { name, range: t.detail.rangeCaption[range] })}
            emptyLabel={t.detail.chartEmpty}
            emptyHint={t.detail.chartEmptyHint}
            onHover={onHover}
            reference={illustrative}
            overlays={overlays}
            benchmark={benchmark}
            chartStyle={technical && bars.ohlc ? draw : "line"}
            showVolume={technical && bars.volume && volumeOn}
            volumeLabel={copy.volume}
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
        {period ? (
          <div className="mt-2 flex justify-between gap-3 text-xs text-fg-muted">
            <time dateTime={new Date(period.start).toISOString()}>{formatPeriodDate(period.start)}</time>
            <time dateTime={new Date(period.end).toISOString()}>{formatPeriodDate(period.end)}</time>
          </div>
        ) : null}
        {technical ? <ChartLegend label={copy.legend} items={legendItems} /> : null}
        {technical && rsiOn && showRsi && period ? (
          <RsiPanel
            points={studies.rsi}
            t0={period.start}
            t1={period.end}
            label={copy.rsi}
            axisLabel={copy.rsiAxis}
            emptyLabel={copy.rsiEmpty}
          />
        ) : null}
        {technical ? <p className="mt-3 text-xs text-fg-muted">{copy.disclaimer}</p> : null}
      </div>
      {sourceLine ? <p className="text-xs text-fg-muted">{sourceLine}</p> : null}
    </section>
  );
}
