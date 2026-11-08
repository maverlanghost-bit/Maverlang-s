"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueries, useQuery } from "@tanstack/react-query";

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
import { TONE_STROKE } from "@/components/domain/svg-price-chart";
import { SvgPriceChart } from "@/components/domain/svg-price-chart";
import { TradingViewChart } from "@/components/domain/tradingview-chart";
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
import { DETAIL_RANGES, isDetailRange, isReferenceHistory, rangeBounds, rangeMove, toneOf } from "@/lib/market/series";
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
/** Comparadores del modo Técnico: SPYx es el de siempre; el resto, alternativas. */
const COMPARE_SYMBOLS = [SPY_SYMBOL, "QQQx", "AAPLx", "NVDAx", "TSLAx"] as const;
/** Comparaciones simultáneas que caben legibles en el mismo gráfico. */
const MAX_COMPARE = 4;
/** Motores del gráfico: el nativo Pro y el widget de TradingView. */
const PROVIDER_OPTIONS = [
  { value: "native", label: "Gráfico Pro" },
  { value: "tradingview", label: "TradingView" },
] as const;

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

function pollsLiveChart(range: Range): boolean {
  return range === "1W" || range === "1M";
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
        "inline-flex w-fit max-w-full items-center gap-0.5 rounded-full border border-border/70 bg-surface-1/80 p-1",
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
              "min-h-9 shrink-0 rounded-full text-[13px] font-medium whitespace-nowrap outline-none transition-all duration-150 ease-spring focus-visible:ring-4 focus-visible:ring-fg/20 active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100",
              compact ? "px-2 sm:px-3.5" : "px-3.5",
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

const TOGGLE_ACTIVE = {
  accent: "border-[#2b7fd9]/40 bg-[#2b7fd9]/10 text-[#2b7fd9]",
  solid: "border-fg bg-fg text-bg",
  neutral: "border-fg/20 bg-surface-2 text-fg",
} as const;

/** Píldora de control del gráfico. Mismo look en la barra y en pantalla completa. */
function ChartToggle({
  pressed,
  onClick,
  children,
  tone = "neutral",
  label,
  className,
}: {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
  tone?: keyof typeof TOGGLE_ACTIVE;
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={label}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-4 focus-visible:ring-fg/20",
        pressed ? TOGGLE_ACTIVE[tone] : "border-border/70 bg-white text-fg-muted hover:bg-surface-1 hover:text-fg",
        className,
      )}
    >
      {children}
    </button>
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
  avgCostUsd = null,
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
  /** Costo promedio de la posición en USD, si la cartera lo conoce. */
  avgCostUsd?: number | null;
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
  // Sin dos puntos el SVG no puede dibujar: se cae a TradingView y se avisa.
  const autoTradingView = !history.isPending && points.length < 2;
  const period = periodBounds(points, livePoint);
  const move = rangeMove(points);
  const stats = !history.isPending && !history.isError ? rangeBounds(points) : null;
  const illustrative =
    !history.isPending && !history.isError && points.length >= 2 && isReferenceHistory(history.data);
  const tone = toneOf(move);
  const [hover, setHover] = useState<{ key: string; usd: number; timeMs: number } | null>(null);
  const [spyOn, setSpyOn] = useState(false);
  const [smaOn, setSmaOn] = useState<Record<SmaPeriod, boolean>>({ 20: false, 50: false, 200: false });
  const [rsiOn, setRsiOn] = useState(false);
  const [draw, setDraw] = useState<"line" | "candles">("line");
  const [volumeOn, setVolumeOn] = useState(false);
  // Opciones visuales del gráfico: por defecto limpio, sin grilla ni promedio.
  const [showGrid, setShowGrid] = useState(false);
  const [showPeriodAvg, setShowPeriodAvg] = useState(false);
  // Comparación multi-activo: símbolos elegidos y la serie enfocada (difumina el resto).
  const [comparedSymbols, setComparedSymbols] = useState<string[]>([]);
  const [highlightedLayerId, setHighlightedLayerId] = useState<string | null>(null);
  // Motor del gráfico: Pro nativo y TradingView conviven; el SVG sigue montado.
  const [provider, setProvider] = useState<"native" | "tradingview">("native");
  // Eje Y: precio o porcentaje desde la apertura del período.
  const [axisMode, setAxisMode] = useState<"price" | "percent">("price");
  const [fullscreen, setFullscreen] = useState(false);
  const chartCardRef = useRef<HTMLDivElement>(null);
  const tvActive = provider === "tradingview" || autoTradingView;
  /** Sale del modo amplio y, si el navegador tomó la tarjeta, del fullscreen nativo. */
  const exitFullscreen = useCallback(() => {
    setFullscreen(false);
    if (document.fullscreenElement && typeof document.exitFullscreen === "function") {
      document.exitFullscreen().catch(() => {});
    }
  }, []);
  /** Pantalla completa real: estado propio + API nativa cuando está disponible. */
  const toggleFullscreen = useCallback(() => {
    if (fullscreen) {
      exitFullscreen();
      return;
    }
    setFullscreen(true);
    const card = chartCardRef.current;
    if (card && typeof card.requestFullscreen === "function") {
      card.requestFullscreen().catch(() => {});
    }
  }, [fullscreen, exitFullscreen]);
  // Escape cierra la pantalla completa; el body no scrollea detrás del modal.
  useEffect(() => {
    if (!fullscreen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullscreen(false);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [fullscreen]);
  // Esc nativo del navegador suelta el elemento fullscreen: sincroniza el estado.
  useEffect(() => {
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) setFullscreen(false);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);
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
  const chartReady = !history.isPending && !history.isError && points.length >= 2;
  // Comparados: mismo rango y misma caché que `useHistory` (["history", sym, range]).
  const compareQueries = useQueries({
    queries: comparedSymbols.map((compared) => ({
      queryKey: ["history", compared, range],
      queryFn: () => getHistory(compared, range),
      ...studyQueryOptions(chartReady),
    })),
  });
  const bars = useMemo(() => (chartReady ? barAvailability(points) : NO_BARS), [chartReady, points]);
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
    const bounds = periodBounds(points, livePoint);
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
    livePoint,
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
      const bounds = periodBounds(points, livePoint);
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
    if (studies.spyPoints.length < 2) return null;
    return { points: studies.spyPoints, label: copy.spyLegend };
  }, [
    technical,
    chartReady,
    spyOn,
    compareSymbol,
    compareHistory.data,
    points,
    livePoint,
    illustrative,
    symbol,
    studies.spyPoints,
    copy.spyLegend,
  ]);
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
            color: illustrative ? BENCHMARK_COLOR : TONE_STROKE[tone],
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
  const seriesKey = `${range}:${points.length}:${points[0]?.t ?? 0}:${points[points.length - 1]?.p ?? 0}`;
  const point = hover && hover.key === seriesKey ? hover : null;

  // Píldoras de comparación: la acción principal primero y cada comparado con su % del período.
  // Sin memoización manual: las deps derivadas de props no se pueden preservar y el
  // compilador de React ya memoiza el resultado.
  const comparisonItems: ActiveComparisonItem[] = (() => {
    const bounds = periodBounds(points, livePoint);
    const items: ActiveComparisonItem[] = [
      {
        id: "asset",
        symbol: symbolKey,
        name,
        color: TONE_STROKE[tone],
        changePct: move,
        removable: false,
      },
    ];
    comparedSymbols.forEach((compared, index) => {
      const query = compareQueries[index];
      const rows = query?.data?.points;
      const inWindow = rows ? windowPoints(rows, bounds) : [];
      const catalog = COMPARE_CATALOG.find((option) => option.symbol === compared);
      items.push({
        id: compareLayerId(compared),
        symbol: compared,
        name: catalog?.name ?? compared,
        color: compareColor(index),
        changePct: inWindow.length >= 2 ? rangeMove(inWindow) : null,
        removable: true,
        pending: query?.isPending === true,
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
  const openUsd = points.length >= 2 && Number.isFinite(points[0]?.p) && (points[0]?.p ?? 0) > 0 ? points[0]!.p : null;
  const periodAvgUsd = useMemo(() => {
    if (points.length < 2) return null;
    let sum = 0;
    let count = 0;
    for (const pt of points) {
      if (Number.isFinite(pt.p) && pt.p > 0) {
        sum += pt.p;
        count += 1;
      }
    }
    return count >= 2 ? sum / count : null;
  }, [points]);
  const activeEndUsd = point?.usd ?? (points.length >= 2 ? points[points.length - 1]?.p ?? null : null);
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
  if (pending && !quote) {
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
          <span className="inline-flex items-center gap-2.5">
            <FlashPrice value={shown} currency={priceCurrency} size="lg" live={point === null} force={hoverForce} />
            {point === null ? (
              <span
                className="inline-flex h-2 w-2 shrink-0 rounded-full bg-brand shadow-[0_0_8px_rgba(5,150,105,0.75)] motion-safe:animate-pulse"
                aria-hidden="true"
              />
            ) : null}
          </span>
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
          <div className="flex min-w-0 items-center gap-2">
            {deltaFormatted ? (
              <span
                className={cn(
                  "num shrink-0 text-sm font-semibold tabular-nums",
                  deltaUsd !== null && deltaUsd >= 0 ? "text-up" : "text-down",
                )}
              >
                {deltaFormatted}
              </span>
            ) : null}
            <p className="num min-w-0 truncate text-sm text-fg-muted">
              <span className="sr-only">{t.detail.onChart}. </span>
              <time dateTime={pointIso}>{formatDateTime(pointIso)}</time>
            </p>
          </div>
        ) : move === null ? (
          <span className="num text-sm text-fg-muted">—</span>
        ) : (
          <>
            <ChangeBadge value={move} />
            {deltaFormatted ? (
              <span
                className={cn(
                  "num shrink-0 text-sm font-medium tabular-nums",
                  deltaUsd !== null && deltaUsd >= 0 ? "text-up" : "text-down",
                )}
              >
                {deltaFormatted}
              </span>
            ) : null}
            <span className="min-w-0 truncate text-sm text-fg-muted">{t.detail.rangeCaption[range]}</span>
          </>
        )}
      </div>

      <div className="flex w-full min-w-0 max-w-full flex-col items-start justify-between gap-2 sm:flex-row sm: flex-wrap sm:items-center">
        <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto">
          <div className="w-full min-w-0 sm:w-auto">
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

        {/* Controles del gráfico: motor Pro/TradingView, promedio, escala, eje y pantalla completa */}
        <div className="flex w-full min-w-0 flex-nowrap items-center gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:w-auto sm:flex-wrap sm:pb-0">
          <RangeCapsule
            className="shrink-0"
            idPrefix="chart-provider"
            label="Motor del gráfico"
            options={PROVIDER_OPTIONS}
            value={provider}
            onChange={(value) => setProvider(value === "tradingview" ? "tradingview" : "native")}
          />
          <ChartToggle tone="accent" pressed={showPeriodAvg} onClick={() => setShowPeriodAvg((v) => !v)}>
            <span aria-hidden="true" className="size-1.5 rounded-full bg-[#2b7fd9]" />
            Promedio
          </ChartToggle>
          <ChartToggle pressed={showGrid} onClick={() => setShowGrid((v) => !v)}>
            Escala
          </ChartToggle>
          <ChartToggle
            pressed={axisMode === "percent"}
            onClick={() => setAxisMode((v) => (v === "price" ? "percent" : "price"))}
            label="Escala del eje: porcentaje o precio"
          >
            % / $
          </ChartToggle>
          <ChartToggle pressed={fullscreen} onClick={toggleFullscreen}>
            {fullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
          </ChartToggle>
        </div>
      </div>

      {illustrative ? <p className="text-sm text-fg-muted">{t.detail.chartReference}</p> : null}

      <div
        ref={chartCardRef}
        className={cn(
          "min-w-0 max-w-full rounded-2xl bg-white p-5 border border-border/70 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_rgba(16,24,40,0.08)] sm:p-7",
          fullscreen &&
            "fixed inset-0 z-[100] flex h-screen w-screen flex-col justify-between overflow-y-auto rounded-none border-0 bg-white p-5 sm:p-8 gap-4",
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
                <p className="truncate text-lg font-semibold text-fg">{name}</p>
                <p className="num mt-0.5 text-xs font-medium text-fg-muted">{symbol}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  {shown !== null ? (
                    <FlashPrice value={shown} currency={priceCurrency} size="lg" live={point === null} force={hoverForce} />
                  ) : (
                    <span className="text-sm text-fg-muted">—</span>
                  )}
                  {move !== null ? <ChangeBadge value={move} /> : null}
                </div>
              </div>
              <button
                type="button"
                onClick={toggleFullscreen}
                className="inline-flex h-10 items-center gap-2 rounded-full bg-fg px-4 text-sm font-semibold text-bg shadow-sm transition-transform outline-none focus-visible:ring-4 focus-visible:ring-fg/20 active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100"
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
              <RangeCapsule
                idPrefix="fullscreen-provider"
                label="Motor del gráfico (pantalla completa)"
                options={PROVIDER_OPTIONS}
                value={provider}
                onChange={(value) => setProvider(value === "tradingview" ? "tradingview" : "native")}
              />
              <div className="flex shrink-0 items-center gap-1.5">
                <ChartToggle tone="accent" pressed={showPeriodAvg} onClick={() => setShowPeriodAvg((v) => !v)}>
                  <span aria-hidden="true" className="size-1.5 rounded-full bg-[#2b7fd9]" />
                  Promedio
                </ChartToggle>
                <ChartToggle pressed={showGrid} onClick={() => setShowGrid((v) => !v)}>
                  Escala
                </ChartToggle>
                <ChartToggle
                  pressed={axisMode === "percent"}
                  onClick={() => setAxisMode((v) => (v === "price" ? "percent" : "price"))}
                  label="Escala del eje: porcentaje o precio"
                >
                  % / $
                </ChartToggle>
              </div>
            </div>
          </div>
        ) : null}
        {/* Cinta superior de métricas rápidas del período dentro de la tarjeta del gráfico */}
        {chartReady && stats && openUsd !== null && periodAvgUsd !== null ? (() => {
          const openShown = displayPrice(openUsd, priceCurrency, rate);
          const avgShown = displayPrice(periodAvgUsd, priceCurrency, rate);
          const highShown = displayPrice(stats.high, priceCurrency, rate);
          const lowShown = displayPrice(stats.low, priceCurrency, rate);
          const amplitudePct = stats.low > 0 ? ((stats.high - stats.low) / stats.low) * 100 : 0;
          return (
            <div className="mb-4 grid grid-cols-2 gap-2 border-b border-border/60 pb-3.5 sm:grid-cols-4">
              <div>
                <p className="text-[11px] font-medium text-fg-muted">Apertura período</p>
                <p className="num mt-0.5 text-xs font-semibold text-fg sm:text-sm">
                  {formatMoney(openShown ?? openUsd, openShown === null ? "USD" : priceCurrency)}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-medium text-fg-muted">Promedio período</p>
                <p className="num mt-0.5 text-xs font-semibold text-fg sm:text-sm">
                  {formatMoney(avgShown ?? periodAvgUsd, avgShown === null ? "USD" : priceCurrency)}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-medium text-fg-muted">Máx / Mín</p>
                <p className="num mt-0.5 truncate text-xs font-semibold text-fg sm:text-sm">
                  {formatMoney(highShown ?? stats.high, highShown === null ? "USD" : priceCurrency)}
                  <span className="text-fg-muted"> · </span>
                  {formatMoney(lowShown ?? stats.low, lowShown === null ? "USD" : priceCurrency)}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-medium text-fg-muted">Amplitud del rango</p>
                <p className="num mt-0.5 text-xs font-semibold text-fg sm:text-sm">
                  {amplitudePct.toFixed(2).replace(".", ",")}%
                </p>
              </div>
            </div>
          );
        })() : null}

        {/* Simulador de retorno con los datos reales del período activo */}
        {simulator ? (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-2xl border border-border/60 bg-surface-1/60 px-3 py-2 sm:px-3.5 sm:py-2.5">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold text-fg-muted">¿Cuánto tendrías hoy?</p>
              <p className="text-xs text-fg-muted">
                Si hubieras invertido {formatMoney(simulator.base, priceCurrency)} al inicio del período
              </p>
            </div>
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-[11px] font-medium text-fg-muted">Hoy tendrías</span>
              <span className="num text-sm font-semibold text-fg">
                {formatMoney(simulator.finalValue, priceCurrency)}
              </span>
              <span
                className={cn(
                  "num rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums",
                  simulator.profit > 0
                    ? "bg-up-bg text-up"
                    : simulator.profit < 0
                      ? "bg-down-bg text-down"
                      : "bg-surface-2 text-fg-muted",
                )}
              >
                {simulatorProfit} · {simulatorPct}
              </span>
            </div>
          </div>
        ) : null}

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
        {showCompare ? (
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-fg-muted">Comparar con</span>
            <RangeCapsule
              compact
              idPrefix="compare"
              label="Comparar con"
              options={compareOptions}
              value={compareSymbol}
              onChange={setCompareSymbol}
            />
          </div>
        ) : null}
        {tvActive ? null : (
          <ChartMultiCompare
            baseSymbol={symbolKey}
            selectedSymbols={comparedSymbols}
            onToggleSymbol={toggleComparedSymbol}
            onClearAll={clearComparedSymbols}
            activeItems={comparisonItems}
            highlightedId={highlightedLayerId}
            onHighlightChange={setHighlightedLayerId}
            maxCompare={MAX_COMPARE}
          />
        )}
        <div className="relative min-w-0 max-w-full">
          {tvActive ? (
            <TradingViewChart symbol={symbol} underlying={underlying} range={range} fullscreen={fullscreen} />
          ) : null}
          {/* El SVG nativo sigue montado aunque TradingView esté visible: los tests buscan su SVG. */}
          <div className={cn("relative min-w-0 max-w-full", (provider === "tradingview" || autoTradingView) && "hidden")}>
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
              avgCostUsd={avgCostUsd}
              periodAvgUsd={showPeriodAvg ? periodAvgUsd : null}
              showGrid={showGrid}
              showExtremes={false}
              axisMode={axisMode}
              highlightedLayerId={highlightedLayerId}
              onHighlightLayer={setHighlightedLayerId}
              onToggleFullscreen={toggleFullscreen}
              isFullscreen={fullscreen}
              heightClassName={fullscreen ? "h-[58vh] sm:h-[66vh] md:h-[72vh]" : "h-64 sm:h-80 md:h-[380px]"}
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
        </div>
        {autoTradingView && provider === "native" ? (
          <p className="mt-2 text-xs text-fg-muted">Mostrando gráfico en tiempo real vía TradingView</p>
        ) : null}
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
