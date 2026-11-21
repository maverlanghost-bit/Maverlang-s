"use client";

import { useCallback, useId, useMemo, useState, type ReactNode } from "react";
import { useQueries, useQuery, type UseQueryResult } from "@tanstack/react-query";

import { ChartContext } from "@/components/charts/chart-context";
import { ChartStylePicker, ChartToolButton, ChartToolGroup, ChartTools, type ChartStyle } from "@/components/charts/chart-tools";
import { FinancialChart } from "@/components/charts/financial-chart";

import { ChangeBadge } from "@/components/domain/change-badge";
import {
  ChartMultiCompare,
  COMPARE_CATALOG,
  COMPARE_PALETTE,
  compareLayerId,
  type ActiveComparisonItem,
} from "@/components/domain/chart-multi-compare";
import { ChartLegend, ChartStudyBar, RsiPanel, SMA_COLOR, StudiesSkeleton } from "@/components/domain/chart-overlays";
import { FlashPrice } from "@/components/domain/flash-price";
import { PriceFreshness } from "@/components/domain/price-freshness";
import { PriceRangeBar } from "@/components/domain/price-range-bar";
import { TONE_STROKE } from "@/components/domain/svg-price-chart";
import { SvgPriceChart } from "@/components/domain/svg-price-chart";
import { TickerLogo } from "@/components/domain/ticker-logo";
import { TradingViewChart } from "@/components/domain/tradingview-chart";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { indexFromKey } from "@/components/ui/keys";
import { graficoCopy } from "@/content/i18n/extra-grafico";
import { historyStaleMs } from "@/lib/api/contracts";
import { getHistory } from "@/lib/api/client";
import { chartCapabilities, chartVolumeLabel, compatibleSpot, observedSeries } from "@/lib/charts/data";
import { comparisonSeries } from "@/lib/charts/comparison";
import { cn } from "@/lib/cn";
import { formatDateTime, formatMoney, formatPercent } from "@/lib/format";
import { useChartMode } from "@/lib/hooks/use-chart-mode";
import { useChartFullscreen } from "@/lib/hooks/use-chart-fullscreen";
import { useHistory } from "@/lib/hooks/queries";
import { priceFlashDirection, type PriceFlash } from "@/lib/hooks/use-price-flash";
import { useT } from "@/lib/hooks/use-t";
import { displayPrice } from "@/lib/market/browse";
import { BENCHMARK_COLOR, type ChartOverlay } from "@/lib/market/chart-geometry";
import { poolDislocated, poolDislocationPct } from "@/lib/market/dislocation";
import { chartStudies, SMA_PERIODS, SPY_SYMBOL, type ChartStudies, type SmaPeriod } from "@/lib/market/indicators";
import { DETAIL_RANGES, isDetailRange, isReferenceHistory, rangeBounds, rangeMove, toneOf } from "@/lib/market/series";
import type { Currency, HistoryMetadata, PricePoint, Quote, Range } from "@/lib/types";

const NO_POINTS: readonly PricePoint[] = [];
const NO_OVERLAYS: readonly ChartOverlay[] = [];
/** Cierres largos y SPYx en modo Técnico: una lectura, fresca una hora. */
const STUDY_STALE_MS = 60 * 60 * 1000;
const EMPTY_STUDIES: ChartStudies = {
  spyPoints: [],
  sma: { 20: [], 50: [], 200: [] },
  rsi: [],
};
function compatibleDailyStudies(visible: HistoryMetadata | undefined, study: HistoryMetadata | undefined): boolean {
  return Boolean(visible && study && study.resolution === "1d" && study.instrument !== "demo"
    && study.instrument === visible.instrument && study.provider === visible.provider
    && study.priceUnit === visible.priceUnit && study.priceAdjustment !== undefined
    && study.priceAdjustment === visible.priceAdjustment && study.multiplier === visible.multiplier);
}
function combineHistories(results: readonly UseQueryResult<Awaited<ReturnType<typeof getHistory>>>[]) {
  return results.map(({ data, isPending }) => ({ data, isPending }));
}
/** Comparadores del modo Técnico: SPYx es el de siempre; el resto, alternativas. */
const COMPARE_SYMBOLS = [SPY_SYMBOL, "QQQx", "AAPLx", "NVDAx", "TSLAx"] as const;
/** Comparaciones simultáneas que caben legibles en el mismo gráfico. */
const MAX_COMPARE = 4;
/** Motores del gráfico: el nativo Pro y el widget de TradingView. */
const PROVIDER_OPTIONS = [
  { value: "native", label: "Interactivo", labelEn: "Interactive" },
  { value: "svg", label: "Gráfico clásico", labelEn: "Classic chart" },
  { value: "tradingview", label: "Subyacente en TradingView", labelEn: "Underlying on TradingView" },
] as const;

/**
 * Superficie del gráfico en pantalla completa: ahí sí hace falta una lámina
 * propia porque tapa la página. En línea el gráfico va sin marco.
 */
const CHART_SURFACE = "rounded-2xl bg-bg p-5 shadow-float ring-1 ring-border";

/**
 * Un solo tamaño por rol dentro de la ficha: nota 13px en `fg-muted`,
 * rótulo de métrica 13px mayúsculas y cifra 15px tabular.
 */
const NOTE = "text-[13px] leading-5 text-fg-muted";
const METRIC_LABEL = "font-mono text-[13px] leading-4 font-medium tracking-[0.06em] text-fg-muted uppercase";
const METRIC_VALUE = "num text-[15px] leading-5 font-medium text-fg tabular-nums";

function studyQueryOptions(enabled: boolean) {
  return {
    enabled,
    staleTime: (query: { state: { data: unknown } }) => historyStaleMs(query.state.data, STUDY_STALE_MS),
    gcTime: STUDY_STALE_MS,
    retry: false,
    refetchInterval: false as const,
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

/** Color estable por índice de comparación; nunca repite el mismo tono seguido. */
function compareColor(index: number): string {
  return COMPARE_PALETTE[index % COMPARE_PALETTE.length] ?? "#2563eb";
}

/**
 * Puntos positivos del comparado dentro de la ventana del período principal.
 * El rebase a % lo hace `buildChartModel` (`rebased: true`), no este archivo.
 */
function windowPoints(
  points: readonly PricePoint[],
  bounds: { start: number; end: number } | null,
): PricePoint[] {
  if (!bounds) return [];
  return points.filter(
    (row) =>
      Number.isFinite(row.t) &&
      Number.isFinite(row.p) &&
      row.p > 0 &&
      row.t >= bounds.start &&
      row.t <= bounds.end,
  );
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
  compact = false,
}: {
  label: string;
  options: readonly { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  idPrefix?: string;
  className?: string;
  /** En móvil reparte los botones para que quepan sin scroll. Desktop no cambia. */
  compact?: boolean;
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
        "flex w-fit max-w-full items-center",
        compact && "w-full justify-between sm:w-fit sm:justify-start",
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
              "relative inline-flex h-11 shrink-0 items-center text-[13px] font-medium whitespace-nowrap outline-none transition-colors duration-150 sm:h-9",
              compact ? "px-2.5 sm:px-3" : "px-3",
              selected ? "text-fg" : "text-fg-muted hover:text-fg",
            )}
          >
            {option.label}
            <span
              aria-hidden
              className={cn(
                "absolute inset-x-1 -bottom-px h-px transition-colors duration-150",
                selected ? "bg-fg" : "bg-transparent",
              )}
            />
          </button>
        );
      })}
    </div>
  );
}

export function PricePanel({
  symbol,
  name,
  logoUrl,
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
  avgCostUsd = null,
}: {
  symbol: string;
  name: string;
  logoUrl?: string | null;
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
  /** Costo promedio de la posición en USD, si la cartera lo conoce. */
  avgCostUsd?: number | null;
}) {
  const { t, language } = useT();
  const copy = graficoCopy(language);
  const capabilityId = useId();
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
  // The screen already polls the spot. Reuse that quote instead of a second cache/poller.
  const rawPoints = history.data?.points ?? NO_POINTS;
  const effectiveLivePoint = useMemo(() => compatibleSpot(history.data?.source, quote), [history.data?.source, quote]);
  const points = useMemo(() => observedSeries(rawPoints, effectiveLivePoint), [rawPoints, effectiveLivePoint]);
  const period = periodBounds(points, undefined);
  const move = rangeMove(points);
  const stats = !history.isPending ? rangeBounds(points) : null;
  const illustrative =
    !history.isPending && points.length >= 2 && isReferenceHistory(history.data);
  const [hover, setHover] = useState<{ key: string; usd: number; timeMs: number } | null>(null);
  const [spyOn, setSpyOn] = useState(false);
  const [smaOn, setSmaOn] = useState<Record<SmaPeriod, boolean>>({ 20: false, 50: false, 200: false });
  const [rsiOn, setRsiOn] = useState(false);
  const [draw, setDraw] = useState<ChartStyle>("area");
  const [volumeOn, setVolumeOn] = useState(false);
  // Opciones visuales del gráfico: por defecto limpio, sin grilla ni promedio.
  const [showGrid, setShowGrid] = useState(false);
  const [showPeriodAvg, setShowPeriodAvg] = useState(false);
  // Comparación multi-activo: símbolos elegidos y la serie enfocada (difumina el resto).
  const [comparedSymbols, setComparedSymbols] = useState<string[]>([]);
  const [highlightedLayerId, setHighlightedLayerId] = useState<string | null>(null);
  // Motor del gráfico: Pro nativo y TradingView conviven; el SVG sigue montado.
  const [provider, setProvider] = useState<"native" | "svg" | "tradingview">("native");
  // Eje Y: precio o porcentaje desde la apertura del período.
  const [axisMode, setAxisMode] = useState<"price" | "percent">("price");
  const { ref: chartCardRef, expanded: fullscreen, toggle: toggleFullscreen } = useChartFullscreen();
  const tvActive = provider === "tradingview";
  // Comparador del modo Técnico. SPYx por defecto; el resto se pide con el
  // mismo rango y, si alcanza dos puntos, reemplaza a SPYx como benchmark.
  const [compareSymbol, setCompareSymbol] = useState<string>(SPY_SYMBOL);
  const compareKey = compareSymbol.trim();
  const compareIsSpy = compareKey.toUpperCase() === SPY_SYMBOL.toUpperCase();
  const compareEnabled =
    technical &&
    spyOn &&
    compareKey.length > 0 &&
    !compareIsSpy &&
    compareKey.toUpperCase() !== symbolKey.toUpperCase();
  const compareHistory = useQuery({
    queryKey: ["history", compareKey, range] as const,
    queryFn: () => getHistory(compareKey, range),
    ...studyQueryOptions(compareEnabled),
  });
  const chartReady = !history.isPending && points.length >= 2;
  // Comparados: mismo rango y misma caché que `useHistory` (["history", sym, range]).
  const compareQueries = useQueries({
    queries: comparedSymbols.map((compared) => ({
      queryKey: ["history", compared, range],
      queryFn: () => getHistory(compared, range),
      ...studyQueryOptions(chartReady),
    })),
    combine: combineHistories,
  });
  const bars = useMemo(() => chartCapabilities(points, history.data?.metadata), [points, history.data?.metadata]);
  const dailyStudies = compatibleDailyStudies(history.data?.metadata, longHistory.data?.metadata);
  const studies = useMemo(() => {
    if (!technical) return EMPTY_STUDIES;
    return chartStudies({
      symbol,
      range,
      illustrative,
      window: periodBounds(points, undefined),
      spy: spyHistory.data && spyHistory.data.source === history.data?.source
        ? { points: spyHistory.data.points, reference: isReferenceHistory(spyHistory.data) }
        : null,
      closes: dailyStudies && longHistory.data && longHistory.data.source === history.data?.source
        ? { points: longHistory.data.points, reference: isReferenceHistory(longHistory.data) }
        : null,
    });
  }, [technical, symbol, range, illustrative, points, history.data?.source, spyHistory.data, longHistory.data, dailyStudies]);
  const overlays = useMemo(() => {
    const list: ChartOverlay[] = [];
    if (technical && chartReady) {
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
    }
    // Comparados: sólo entran si su serie tiene >= 2 puntos en la ventana del período.
    const bounds = periodBounds(points, effectiveLivePoint);
    if (bounds) {
      comparedSymbols.forEach((compared, index) => {
        const rows = compareQueries[index]?.data?.points;
        if (!rows) return;
        const inWindow = windowPoints(rows, bounds);
        if (inWindow.length < 2) return;
        list.push({
          id: compareLayerId(compared),
          points: inWindow,
          color: compareColor(index),
          label: compared,
          rebased: true,
        });
      });
    }
    return list.length === 0 ? NO_OVERLAYS : list;
  }, [
    technical,
    chartReady,
    smaOn,
    studies,
    copy,
    points,
    effectiveLivePoint,
    comparedSymbols,
    compareQueries,
  ]);
  const benchmark = useMemo(() => {
    if (!technical || !chartReady || !spyOn) return null;
    const key = compareSymbol.trim();
    const enabled =
      key.length > 0 &&
      key.toUpperCase() !== SPY_SYMBOL.toUpperCase() &&
      key.toUpperCase() !== symbol.trim().toUpperCase();
    if (enabled && isReferenceHistory(compareHistory.data) === illustrative) {
      const rows = compareHistory.data?.points ?? NO_POINTS;
      const bounds = periodBounds(points, effectiveLivePoint);
      if (bounds && rows.length >= 2) {
        const inWindow = rows.filter(
          (row) =>
            Number.isFinite(row.t) &&
            Number.isFinite(row.p) &&
            row.p > 0 &&
            row.t >= bounds.start &&
            row.t <= bounds.end,
        );
        if (inWindow.length >= 2) return { points: inWindow, label: key };
      }
    }
    if (enabled) return null;
    if (studies.spyPoints.length < 2) return null;
    return { points: studies.spyPoints, label: copy.spyLegend };
  }, [
    technical,
    chartReady,
    spyOn,
    compareSymbol,
    compareHistory.data,
    points,
    effectiveLivePoint,
    illustrative,
    symbol,
    studies.spyPoints,
    copy.spyLegend,
  ]);
  const hasComparable = Boolean(benchmark) || overlays.some((layer) => layer.rebased);
  const candlesAvailable = chartReady && bars.ohlc && !hasComparable && axisMode === "price";
  const volumeAvailable = chartReady && bars.volume && !hasComparable;
  const volumeLabel = chartVolumeLabel(history.data?.metadata, language === "en");
  const aligned = useMemo(() => comparisonSeries([
    { id: "asset", points, source: history.data?.source },
    ...overlays.filter((layer) => layer.rebased).map((layer) => ({ id: layer.id, points: layer.points, source: history.data?.source })),
    ...(benchmark ? [{ id: "benchmark", points: benchmark.points, source: history.data?.source }] : []),
  ]), [points, overlays, benchmark, history.data?.source]);
  const plotPoints = hasComparable ? aligned.series[0]?.points ?? NO_POINTS : points;
  const plotOverlays = useMemo(() => hasComparable ? overlays.map((layer) => layer.rebased ? { ...layer, points: aligned.series.find((entry) => entry.id === layer.id)?.points ?? NO_POINTS } : layer) : overlays, [hasComparable, overlays, aligned.series]);
  const plotBenchmark = useMemo(() => benchmark ? { ...benchmark, points: aligned.series.find((entry) => entry.id === "benchmark")?.points ?? NO_POINTS } : null, [benchmark, aligned.series]);
  const plotMove = hasComparable ? aligned.series[0]?.returnRatio ?? null : move;
  const chartPeriod = hasComparable ? aligned.bounds : period;
  const tone = toneOf(plotMove);
  const unavailableCompared = comparedSymbols.filter((_symbol, index) => !compareQueries[index]?.isPending && (compareQueries[index]?.data?.points.length ?? 0) < 2);
  const showSpy = chartReady && studies.spyPoints.length >= 2;
  const compareOptions = COMPARE_SYMBOLS.filter((item) => item.toUpperCase() !== symbolKey.toUpperCase()).map(
    (item) => ({ value: item, label: item }),
  );
  const showCompare = technical && spyOn;
  const smaChoices = chartReady ? SMA_PERIODS.filter((periodKey) => studies.sma[periodKey].length >= 2) : [];
  const showRsi = chartReady && studies.rsi.length >= 2;
  const legendItems = [
    ...(benchmark
      ? [
          {
            id: "asset",
            label: symbol,
            color: TONE_STROKE[tone],
            dashed: illustrative,
          },
          { id: "benchmark", label: benchmark.label, color: BENCHMARK_COLOR, dashed: true },
        ]
      : []),
    ...overlays.map((item) => ({
      id: item.id,
      label: item.label,
      color: item.color,
      dashed: Boolean(item.dash),
    })),
  ];
  const seriesKey = `${symbol}:${range}:${history.data?.source ?? "unavailable"}`;
  const point = hover && hover.key === seriesKey ? hover : null;

  // Píldoras de comparación: la acción principal primero y cada comparado con su % del período.
  // Sin memoización manual: las deps derivadas de props no se pueden preservar y el
  // compilador de React ya memoiza el resultado.
  const comparisonItems: ActiveComparisonItem[] = (() => {
    const items: ActiveComparisonItem[] = [
      {
        id: "asset",
        symbol: symbolKey,
        name,
        color: TONE_STROKE[tone],
        changePct: plotMove,
        source: history.data?.source,
        removable: false,
      },
    ];
    comparedSymbols.forEach((compared, index) => {
      const query = compareQueries[index];
      const catalog = COMPARE_CATALOG.find((option) => option.symbol === compared);
      items.push({
        id: compareLayerId(compared),
        symbol: compared,
        name: catalog?.name ?? compared,
        color: compareColor(index),
        changePct: aligned.series.find((entry) => entry.id === compareLayerId(compared))?.returnRatio ?? null,
        removable: true,
        pending: query?.isPending === true,
        source: query?.data?.source,
      });
    });
    return items;
  })();

  const toggleComparedSymbol = (compared: string): void => {
    // La acción principal ya está en el gráfico: no se compara consigo misma.
    if (compared.trim().toUpperCase() === symbolKey.toUpperCase()) return;
    if (comparedSymbols.includes(compared)) {
      setComparedSymbols(comparedSymbols.filter((item) => item !== compared));
      // El foco se suelta si el activo enfocado deja de estar en el gráfico.
      setHighlightedLayerId((active) => (active === compareLayerId(compared) ? null : active));
      return;
    }
    if (comparedSymbols.length >= MAX_COMPARE) return;
    setComparedSymbols([...comparedSymbols, compared]);
  };

  const clearComparedSymbols = (): void => {
    setComparedSymbols([]);
    setHighlightedLayerId(null);
  };

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
  const priceCurrency = currency === "CLP" && fxKnown ? "CLP" : "USD";
  const usd = point?.usd ?? quote?.priceUsd ?? null;
  const shown = usd === null ? null : displayPrice(usd, priceCurrency, rate);
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
    showDislocation && quote?.marketPriceUsd !== undefined
      ? displayPrice(quote.marketPriceUsd, priceCurrency, rate)
      : null;
  const marketShown = marketValue === null ? null : formatMoney(marketValue, priceCurrency);

  // Estadísticas del período activo (Apertura, Promedio y Variación absoluta en dinero)
  const openUsd = plotPoints.length >= 2 && Number.isFinite(plotPoints[0]?.p) && (plotPoints[0]?.p ?? 0) > 0 ? plotPoints[0]!.p : null;
  const periodAvgUsd = useMemo(() => {
    if (plotPoints.length < 2) return null;
    let sum = 0;
    let count = 0;
    for (const pt of plotPoints) {
      if (Number.isFinite(pt.p) && pt.p > 0) {
        sum += pt.p;
        count += 1;
      }
    }
    return count >= 2 ? sum / count : null;
  }, [plotPoints]);
  const activeEndUsd =
    point?.usd ?? plotPoints[plotPoints.length - 1]?.p ?? null;
  const deltaUsd = openUsd !== null && activeEndUsd !== null ? activeEndUsd - openUsd : null;
  const deltaShown = deltaUsd !== null ? displayPrice(Math.abs(deltaUsd), priceCurrency, rate) : null;
  const deltaFormatted =
    deltaUsd !== null && deltaShown !== null
      ? `${deltaUsd >= 0 ? "+" : "-"}${formatMoney(deltaShown, priceCurrency)}`
      : null;

  // Simulador de retorno: sólo con apertura y punto activo reales del período.
  const investmentBase = priceCurrency === "CLP" ? 1_000_000 : 1_000;
  const simulator =
    openUsd !== null && activeEndUsd !== null && openUsd > 0
      ? {
          base: investmentBase,
          ratio: activeEndUsd / openUsd,
          finalValue: investmentBase * (activeEndUsd / openUsd),
          profit: investmentBase * (activeEndUsd / openUsd - 1),
        }
      : null;
  const simulatorProfit =
    simulator !== null
      ? `${simulator.profit > 0 ? "+" : simulator.profit < 0 ? "-" : ""}${formatMoney(Math.abs(simulator.profit), priceCurrency)}`
      : null;
  const simulatorPct = simulator !== null ? formatPercent(simulator.ratio - 1) : null;

  const rangeOptions = DETAIL_RANGES.map((value) => ({ value, label: t.detail.rangeShort[value] }));
  // La cápsula normal conserva "Todo" (lo exige detail.spec); la cabecera ejecutiva usa "Máx".
  const fullscreenRangeOptions = DETAIL_RANGES.map((value) => ({
    value,
    label: value === "ALL" ? "Máx" : t.detail.rangeShort[value],
  }));
  const historySource = history.data?.source;
  const classicAvailable = !hasComparable || aligned.series.every((entry) => !entry.hasGaps);
  const shownProvider = provider === "svg" && !classicAvailable ? "native" : provider;
  const PriceChart = shownProvider === "svg" ? SvgPriceChart : FinancialChart;
  const selectProvider = (value: string) => setProvider(value === "tradingview" ? "tradingview" : value === "svg" ? "svg" : "native");
  const chartStyle = draw === "candles" && !candlesAvailable ? "area" : draw;
  const settings = (
    <ChartTools>
      <div className="grid min-w-0 gap-3">
        {!tvActive ? <>
          <ChartStylePicker
            value={chartStyle}
            onChange={setDraw}
            candlesAvailable={candlesAvailable}
            candleHint={bars.ohlc
              ? (language === "en" ? "Use the price scale and turn off comparisons to view candles." : "Usa la escala de precio y desactiva las comparaciones para ver velas.")
              : (language === "en" ? "This range has no verified candle data." : "Este rango no tiene datos verificados para velas.")}
          />
          <ChartToolGroup label={language === "en" ? "Display" : "Visualización"}>
            <div className="flex flex-wrap gap-1.5">
              <ChartToolButton pressed={showPeriodAvg} onClick={() => setShowPeriodAvg((value) => !value)}>{language === "en" ? "Average" : "Promedio"}</ChartToolButton>
              <ChartToolButton pressed={showGrid} onClick={() => setShowGrid((value) => !value)}>{language === "en" ? "Grid" : "Cuadrícula"}</ChartToolButton>
              <ChartToolButton
                label={language === "en" ? "Axis scale: percent or price" : "Escala del eje: porcentaje o precio"}
                pressed={axisMode === "percent" || hasComparable}
                disabled={hasComparable}
                onClick={() => setAxisMode((value) => value === "price" ? "percent" : "price")}
              >
                {language === "en" ? "Axis" : "Eje"} · {axisMode === "percent" || hasComparable ? "%" : priceCurrency}
              </ChartToolButton>
            </div>
          </ChartToolGroup>
          {technical ? <ChartToolGroup label={language === "en" ? "Indicators" : "Indicadores"}>
            {longHistory.isLoading ? <StudiesSkeleton label={copy.studiesLoading} /> : <ChartStudyBar
              copy={copy}
              spyPending={spyHistory.isLoading}
              spy={showSpy ? { on: spyOn, onToggle: () => setSpyOn((value) => !value) } : null}
              smas={smaChoices.map((periodKey) => ({ period: periodKey, on: smaOn[periodKey], onToggle: () => setSmaOn((current) => ({ ...current, [periodKey]: !current[periodKey] })) }))}
              rsi={showRsi ? { on: rsiOn, onToggle: () => setRsiOn((value) => !value) } : null}
            />}
            {showCompare ? <RangeCapsule compact idPrefix="compare" label={language === "en" ? "Compare with" : "Comparar con"} options={compareOptions} value={compareSymbol} onChange={setCompareSymbol} /> : null}
            <div className="mt-2 flex flex-wrap gap-1.5">
              <ChartToolButton pressed={volumeAvailable && volumeOn} disabled={!volumeAvailable} describedBy={!volumeAvailable ? capabilityId : undefined} onClick={() => setVolumeOn((value) => !value)}>{volumeLabel ?? copy.volume}</ChartToolButton>
            </div>
            {!volumeAvailable ? <p id={capabilityId} className="mt-2 text-xs text-fg-muted">
              {bars.volume
                ? (language === "en" ? "Turn off comparisons to view the original volume." : "Desactiva las comparaciones para ver el volumen original.")
                : (language === "en" ? "This range has no verified volume." : "Este rango no tiene volumen verificado.")}
            </p> : null}
            {!dailyStudies && !longHistory.isLoading ? <p className="mt-2 text-xs text-fg-muted">{language === "en" ? "SMA and RSI need compatible daily data." : "Las SMA y el RSI requieren datos diarios compatibles."}</p> : null}
          </ChartToolGroup> : null}
        </> : null}
        <ChartToolGroup label={language === "en" ? "Chart version" : "Versión del gráfico"}>
          <div className="flex flex-wrap gap-1.5">
            {PROVIDER_OPTIONS.map((option) => <ChartToolButton key={option.value} disabled={option.value === "svg" && !classicAvailable} pressed={shownProvider === option.value} onClick={() => selectProvider(option.value)}>{language === "en" ? option.labelEn : option.label}</ChartToolButton>)}
          </div>
          {tvActive ? <p className="mt-2 text-xs text-fg-muted">{language === "en" ? "TradingView displays the underlying asset using its own data." : "TradingView muestra el activo subyacente con sus propios datos."}</p> : null}
          {!classicAvailable ? <p className="mt-2 text-xs text-fg-muted">{language === "en" ? "The interactive chart shows gaps in this comparison." : "El gráfico interactivo muestra los cortes de datos en esta comparación."}</p> : null}
        </ChartToolGroup>
      </div>
    </ChartTools>
  );

  let priceNode: ReactNode;
  if (pending && !quote) {
    priceNode = (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-12 w-48 max-w-full" />
        <Skeleton className="h-4 w-36" />
      </div>
    );
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
      <div className="flex min-w-0 max-w-full flex-col gap-2.5">
        <div className="-ml-1 flex flex-wrap items-baseline gap-x-3 gap-y-1.5">
          <FlashPrice
            value={shown}
            currency={priceCurrency}
            size="lg"
            live={point === null}
            force={hoverForce}
            className="font-medium"
          />
          {quote && Number.isFinite(quote.change24hPct) ? (
            <span className="inline-flex items-baseline gap-1.5">
              <ChangeBadge value={quote.change24hPct} />
              <span className="text-xs leading-5 text-fg-muted">24 h</span>
            </span>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-xs text-fg-muted">{point ? (language === "en" ? "Historical observation" : "Registro histórico") : quote.source === "mock" ? (language === "en" ? "Demo quote" : "Cotización de demostración") : quote.reference ? t.detail.referencePrice : (language === "en" ? "Token quote" : "Cotización del token")} · {priceCurrency}</span>
          {point === null ? <PriceFreshness
            at={quote.updatedAt || priceUpdatedAt}
            stale={priceStale || quote.stale === true}
            live={quote.source === "jupiter" && !quote.reference}
          /> : null}
          {point === null && quote.reference ? (
            <p className={NOTE}>{t.detail.referencePrice}</p>
          ) : null}
          {showFxNote ? <p className={NOTE}>{t.detail.fxFallback}</p> : null}
        </div>
        {showDislocation && poolPct !== null && marketShown !== null ? (
          <p className="text-xs leading-relaxed text-warn">
            {fill(t.detail.dislocated, { pct: formatPercent(poolPct), market: marketShown })}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <section
      className="flex min-w-0 max-w-full flex-col"
      data-range={range}
      data-points={points.length}
      data-chart-mode={mode}
    >
      {priceNode}

      <div className="mt-3 flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <div className="flex min-h-6 min-w-0 items-baseline gap-x-3 overflow-hidden">
          {history.isPending ? (
            <Skeleton className="h-6 w-16 shrink-0 rounded-full" />
          ) : pointIso ? (
            <div className="flex min-w-0 items-center gap-2">
              {deltaFormatted ? (
                <span
                  className={cn(
                    "num shrink-0 text-[13px] font-semibold tabular-nums",
                    deltaUsd !== null && deltaUsd >= 0 ? "text-up" : "text-down",
                  )}
                >
                  {deltaFormatted}
                </span>
              ) : null}
              <p className="num min-w-0 truncate text-[13px] text-fg-muted">
                <span className="sr-only">{t.detail.onChart}. </span>
                <time dateTime={pointIso}>{formatDateTime(pointIso)}</time>
              </p>
            </div>
          ) : plotMove === null ? (
            <span className="num text-[13px] text-fg-muted">—</span>
          ) : (
            <>
              <span
                className={cn(
                  "num shrink-0 text-[13px] font-medium",
                  plotMove !== null && plotMove > 0 ? "text-up" : plotMove !== null && plotMove < 0 ? "text-down" : "text-fg-muted",
                )}
              >
                {formatPercent(plotMove)}
              </span>
              <span className="min-w-0 truncate text-[13px] text-fg-muted">{hasComparable ? (language === "en" ? "common window" : "ventana común") : t.detail.rangeCaption[range]}</span>
              {deltaFormatted ? (
                <span
                  className={cn(
                    "num hidden shrink-0 text-[13px] text-fg-muted sm:inline",
                    deltaUsd !== null && deltaUsd >= 0 ? "text-up" : "text-down",
                  )}
                >
                  · {deltaFormatted}
                </span>
              ) : null}
            </>
          )}
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

      <div className="mt-2 flex w-full min-w-0 max-w-full border-b border-border">
        <RangeCapsule
          compact
          label={t.detail.rangesLabel}
          options={rangeOptions}
          value={range}
          onChange={(value) => {
            if (isDetailRange(value)) onRangeChange(value);
          }}
        />
      </div>

      {historySource === "mock" || historySource === "closes" ? <p className="mt-2 text-xs text-fg-muted">{historySource === "mock" ? (language === "en" ? "Demonstration history · simulated prices" : "Historial de demostración · precios simulados") : (language === "en" ? "Underlying price history · reference, not token trades" : "Histórico del subyacente · referencia, no operaciones del token")}</p> : null}

      <div
        ref={chartCardRef}
        className={cn(
          "min-w-0 max-w-full",
          fullscreen &&
            cn(
              CHART_SURFACE,
              "fixed inset-0 z-[100] flex h-screen w-screen flex-col justify-between gap-4 overflow-y-auto rounded-none p-5 sm:p-8",
            ),
        )}
        role={fullscreen ? "dialog" : undefined}
        aria-modal={fullscreen ? true : undefined}
        aria-label={fullscreen ? `Gráfico de ${name}` : undefined}
      >
        {/* Cabecera ejecutiva: sólo existe en pantalla completa y reutiliza el estado del panel */}
        {fullscreen ? (
          <div className="flex flex-col gap-3 border-b border-border/60 pt-[max(1rem,env(safe-area-inset-top))] pb-4">
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
              <div className="min-w-0">
                <div className="flex items-center gap-3">
                  <TickerLogo symbol={symbol} name={name} logoUrl={logoUrl} size={40} decorative />
                  <div className="min-w-0">
                    <p className="truncate text-lg font-medium text-fg">{name}</p>
                    <p className="num text-xs font-medium text-fg-muted">{symbol}</p>
                  </div>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  {shown !== null ? (
                    <FlashPrice value={shown} currency={priceCurrency} size="lg" live={point === null} force={hoverForce} />
                  ) : (
                    <span className="text-sm text-fg-muted">—</span>
                  )}
                  {plotMove !== null ? <ChangeBadge value={plotMove} /> : null}
                </div>
              </div>
              <button
                type="button"
                onClick={toggleFullscreen}
                className="inline-flex h-11 items-center gap-2 rounded-full border border-control bg-bg px-4 text-[13px] font-medium text-fg transition-colors outline-none hover:bg-surface-1 focus-visible:ring-4 focus-visible:ring-fg/20"
              >
                Cerrar pantalla completa (Esc)
              </button>
            </div>
            <div className="flex min-w-0 flex-nowrap items-center gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:pb-0">
              <RangeCapsule
                compact
                idPrefix="fullscreen-range"
                label={`${t.detail.rangesLabel} (pantalla completa)`}
                options={fullscreenRangeOptions}
                value={range}
                onChange={(value) => {
                  if (isDetailRange(value)) onRangeChange(value);
                }}
              />
            </div>
          </div>
        ) : null}
        <div className="mt-3 flex min-w-0 items-start justify-between gap-2">
          {!tvActive ? <div className="min-w-0 flex-1"><ChartMultiCompare
            baseSymbol={symbolKey}
            selectedSymbols={comparedSymbols}
            onToggleSymbol={toggleComparedSymbol}
            onClearAll={clearComparedSymbols}
            activeItems={comparisonItems}
            highlightedId={highlightedLayerId}
            onHighlightChange={setHighlightedLayerId}
            maxCompare={MAX_COMPARE}
          /></div> : <span className="self-center text-xs text-fg-muted">{language === "en" ? "Underlying reference" : "Referencia del subyacente"}</span>}
          {settings}
        </div>
        {technical && (smaChoices.some((key) => smaOn[key]) || rsiOn) ? <div className="mt-1 flex flex-wrap gap-1.5" aria-label={language === "en" ? "Active studies" : "Indicadores activos"}>
          {smaChoices.filter((key) => smaOn[key]).map((key) => <button type="button" key={key} onClick={() => setSmaOn((current) => ({ ...current, [key]: false }))} className="min-h-9 rounded-full bg-surface-1 px-3 text-xs text-fg-muted">SMA {key} ×</button>)}
          {rsiOn ? <button type="button" onClick={() => setRsiOn(false)} className="min-h-9 rounded-full bg-surface-1 px-3 text-xs text-fg-muted">RSI ×</button> : null}
        </div> : null}
        {hasComparable ? <p className="mt-2 text-xs text-fg-muted">{language === "en" ? "Compared on a common window. The last known observation is used, with its original date; long gaps remain blank." : "Comparación en ventana común. Se usa el último registro conocido, con su fecha original; los vacíos prolongados quedan sin curva."}</p> : null}
        {unavailableCompared.length ? <p role="status" className="mt-2 text-xs text-warn">{language === "en" ? "History unavailable" : "Sin historial"}: {unavailableCompared.join(", ")}.</p> : null}
        <div className="relative mt-4 min-w-0 max-w-full">
          {tvActive ? (
            <TradingViewChart symbol={symbol} underlying={underlying} range={range} fullscreen={fullscreen} />
          ) : null}
          <div className={cn("relative min-w-0 max-w-full", tvActive && "hidden")}>
            <PriceChart
              datasetKey={`${seriesKey}:${history.data?.metadata?.provider ?? "unknown"}:${history.data?.metadata?.resolution ?? "unknown"}`}
              currency={priceCurrency}
              rate={rate}
              points={plotPoints}
              tone={tone}
              metadata={history.data?.metadata}
              quiet={history.isPending || (history.isError && !chartReady)}
              label={fill(t.detail.chartLabel, { name, range: t.detail.rangeCaption[range] })}
              emptyLabel={t.detail.chartEmpty}
              emptyHint={t.detail.chartEmptyHint}
              onHover={onHover}
              reference={illustrative || historySource === "closes"}
              overlays={plotOverlays}
              benchmark={plotBenchmark}
              avgCostUsd={historySource === "ticks" ? avgCostUsd : null}
              periodAvgUsd={showPeriodAvg ? periodAvgUsd : null}
              showGrid={showGrid}
              showExtremes={false}
              axisMode={axisMode}
              highlightedLayerId={highlightedLayerId}
              onHighlightLayer={setHighlightedLayerId}
              onToggleFullscreen={toggleFullscreen}
              isFullscreen={fullscreen}
              heightClassName={fullscreen ? "h-[52dvh] min-h-64 sm:h-[60dvh]" : "h-64 sm:h-80 md:h-[380px]"}
              chartStyle={chartStyle}
              lineColor={TONE_STROKE[tone]}
              showVolume={technical && volumeAvailable && volumeOn}
              volumeLabel={volumeLabel ?? copy.volume}
            />
            {history.isPending ? (
              <div className="absolute inset-0 z-10 bg-bg" role="status" aria-live="polite" aria-busy="true">
                <span className="sr-only">{t.states.loading}</span>
                <Skeleton className="size-full rounded-xl" />
              </div>
            ) : null}
            {history.isError && !chartReady ? (
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
        </div>
        {chartPeriod ? (
          <div className="num mt-2 flex justify-between gap-3 text-xs leading-5 text-fg-muted">
            <time dateTime={new Date(chartPeriod.start).toISOString()}>{formatPeriodDate(chartPeriod.start)}</time>
            <time dateTime={new Date(chartPeriod.end).toISOString()}>{formatPeriodDate(chartPeriod.end)}</time>
          </div>
        ) : null}
        {!hasComparable && historySource === "ticks" && chartReady && stats && quote && Number.isFinite(quote.priceUsd) ? (
          <PriceRangeBar
            lowUsd={stats.low}
            highUsd={stats.high}
            currentUsd={quote.priceUsd}
            rangeLabel={t.detail.rangeCaption[range]}
            currency={priceCurrency}
            rate={rate}
          />
        ) : null}
        {!hasComparable && chartReady && openUsd !== null && periodAvgUsd !== null ? (() => {
          const openShown = displayPrice(openUsd, priceCurrency, rate);
          const avgShown = displayPrice(periodAvgUsd, priceCurrency, rate);
          return (
            <div className="mt-5 border-t border-border pt-4">
              <p className="label">Resumen del período</p>
              <dl className="mt-3 grid grid-cols-2 gap-x-8 gap-y-4">
                <div className="min-w-0">
                  <dt className={METRIC_LABEL}>{language === "en" ? "First observation" : "Primer registro"}</dt>
                  <dd className={cn("mt-1", METRIC_VALUE)}>
                    {formatMoney(openShown ?? openUsd, openShown === null ? "USD" : priceCurrency)}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className={METRIC_LABEL}>{language === "en" ? "Observation average" : "Promedio de registros"}</dt>
                  <dd className={cn("mt-1", METRIC_VALUE)}>
                    {formatMoney(avgShown ?? periodAvgUsd, avgShown === null ? "USD" : priceCurrency)}
                  </dd>
                </div>
              </dl>
              {simulator ? (
                <p className={cn("mt-4", NOTE)}>
                  {language === "en" ? "Price simulation for" : "Simulación de precios con"} {formatMoney(simulator.base, priceCurrency)}:{" "}
                  <span className="num font-medium text-fg">{formatMoney(simulator.finalValue, priceCurrency)}</span>{" "}
                  <span
                    className={cn(
                      "num font-medium",
                      simulator.profit > 0 ? "text-up" : simulator.profit < 0 ? "text-down" : "text-fg-muted",
                    )}
                  >
                    ({simulatorProfit} · {simulatorPct})
                  </span>
                  {point ? language === "en" ? ". Uses the selected historical observation; excludes costs and cash flows." : ". Usa el registro histórico seleccionado; excluye costes y flujos." : language === "en" ? ". Uses the last historical observation; excludes costs and cash flows." : ". Usa el último registro histórico; excluye costes y flujos."}
                </p>
              ) : null}
            </div>
          );
        })() : null}
        {technical ? <ChartLegend label={copy.legend} items={legendItems} /> : null}
        {technical && rsiOn && showRsi && chartPeriod ? (
          <RsiPanel
            points={studies.rsi}
            t0={chartPeriod.start}
            t1={chartPeriod.end}
            label={language === "en" ? "RSI (14 daily periods)" : "RSI (14 períodos diarios)"}
            axisLabel={language === "en" ? "RSI over 14 daily periods, from 0 to 100. Lines at 30 and 70." : "RSI de 14 períodos diarios, de 0 a 100. Líneas en 30 y 70."}
            emptyLabel={language === "en" ? "There are not enough daily observations in this range for RSI (14)." : "No hay suficientes registros diarios en este rango para el RSI (14)."}
          />
        ) : null}
        {technical ? <p className="mt-3 text-xs text-fg-muted">{copy.disclaimer}</p> : null}
      </div>
      <div className="mt-3"><ChartContext source={historySource} points={plotPoints} currency={priceCurrency} range={range} underlying={underlying} metadata={history.data?.metadata} refreshing={history.isFetching && chartReady} refreshFailed={history.isError && chartReady} onRetry={() => { void history.refetch(); }} /></div>
    </section>
  );
}
