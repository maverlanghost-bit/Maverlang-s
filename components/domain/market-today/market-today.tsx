"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { MoverCard, SpyChip } from "@/components/domain/market-today/mover-card";
import { TodaySkeleton } from "@/components/domain/market-today/skeleton";
import { sparklineSmoothPath } from "@/components/domain/sparkline";
import { TickerLogo } from "@/components/domain/ticker-logo";
import { Button } from "@/components/ui/button";
import { indexFromKey } from "@/components/ui/keys";
import { hoyCopy } from "@/content/i18n/extra-hoy";
import { ApiError, getHistory } from "@/lib/api/client";
import { apiResultSchema } from "@/lib/api/contracts";
import { cn } from "@/lib/cn";
import { formatPercent } from "@/lib/format";
import { useHistory } from "@/lib/hooks/queries";
import { useFavorites } from "@/lib/hooks/use-favorites";
import { useT } from "@/lib/hooks/use-t";
import {
  formatChileClock,
  todayBoardSchema,
  type MoverCard as MoverCardData,
  type TodayBoard,
} from "@/lib/market/movers";

const LISTS = ["gainers", "losers", "viewed"] as const;
type ListId = (typeof LISTS)[number];

type SpotlightRange = "1D" | "1W" | "1M" | "3M" | "1Y";

/** Lienzo del gráfico destacado (unidades del viewBox). */
const CHART_W = 520;
const CHART_H = 124;
const CHART_PAD = 2.5;

const SPOTLIGHT_RANGES: { id: SpotlightRange; labelEs: string; labelEn: string; periodEs: string; periodEn: string }[] = [
  { id: "1D", labelEs: "1D", labelEn: "1D", periodEs: "hoy", periodEn: "today" },
  { id: "1W", labelEs: "1S", labelEn: "1W", periodEs: "en 1 semana", periodEn: "past week" },
  { id: "1M", labelEs: "1M", labelEn: "1M", periodEs: "en 1 mes", periodEn: "past month" },
  { id: "3M", labelEs: "3M", labelEn: "3M", periodEs: "en 3 meses", periodEn: "past 3 months" },
  { id: "1Y", labelEs: "1A", labelEn: "1Y", periodEs: "en 1 año", periodEn: "past year" },
];

async function fetchTodayBoard(): Promise<TodayBoard> {
  let response: Response;
  try {
    response = await fetch("/api/market/movers", {
      headers: { accept: "application/json" },
      credentials: "same-origin",
    });
  } catch {
    throw new ApiError("UPSTREAM", "No pudimos conectar.");
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new ApiError("UPSTREAM", "La respuesta no es JSON.", response.status || 502);
  }
  const parsed = apiResultSchema(todayBoardSchema).safeParse(payload);
  if (!parsed.success || !parsed.data.ok) {
    if (parsed.success && !parsed.data.ok) {
      throw new ApiError(parsed.data.error.code, parsed.data.error.message, response.status, parsed.data.requestId);
    }
    throw new ApiError("UPSTREAM", "La respuesta no tiene el formato esperado.", response.status || 502);
  }
  return parsed.data.data;
}

const CLOCK_MS = 15_000;
let chileNow: number | null = null;

function subscribeChileClock(onStoreChange: () => void) {
  const id = window.setInterval(() => {
    chileNow = Date.now();
    onStoreChange();
  }, CLOCK_MS);
  return () => window.clearInterval(id);
}

/** La primera lectura fija la hora. El intervalo la mueve cada 15 s. */
function chileClockSnapshot(): number | null {
  chileNow ??= Date.now();
  return chileNow;
}

function chileClockServerSnapshot(): number | null {
  return null;
}

function ChileClock({ label, locale }: { label: string; locale: "es-CL" | "en" }) {
  const now = useSyncExternalStore(subscribeChileClock, chileClockSnapshot, chileClockServerSnapshot);
  if (now === null) {
    return <span className="inline-block h-5 w-40 rounded-md bg-surface-2" aria-hidden />;
  }
  const date = new Date(now);
  return (
    <p className="shrink-0 text-sm text-fg-muted tabular-nums">
      <time dateTime={date.toISOString()}>{formatChileClock(date, locale)}</time>
      <span aria-hidden> · </span>
      <span>{label}</span>
    </p>
  );
}

function cardLabel(template: string, card: MoverCardData): string {
  return template.replace("{name}", card.name);
}

function buildFeaturedPool(board: TodayBoard | undefined): MoverCardData[] {
  if (!board) return [];
  const merged = [...board.gainers, ...board.viewed, ...board.losers];
  const seen = new Set<string>();
  const all: MoverCardData[] = [];
  for (const item of merged) {
    if (seen.has(item.symbol)) continue;
    seen.add(item.symbol);
    all.push(item);
  }
  const withSpark = all.filter((item) => item.spark.length >= 2);
  const source = withSpark.length > 0 ? withSpark : all;
  return source.slice(0, 6);
}

export function MarketToday() {
  const { language } = useT();
  const router = useRouter();
  const copy = hoyCopy(language);
  const locale = language === "en" ? "en" : "es-CL";
  const titleId = useId();
  const tabsId = useId();
  const panelId = useId();
  const chartGradId = `spotlight-grad-${useId().replace(/:/g, "")}`;
  const { symbols: favorites, toggle: toggleFavorite } = useFavorites();

  const board = useQuery({
    queryKey: ["market-today"],
    queryFn: fetchTodayBoard,
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  });

  const [picked, setPicked] = useState<ListId | null>(null);
  const list: ListId =
    picked ?? LISTS.find((id) => (board.data?.[id].length ?? 0) > 0) ?? "gainers";

  const [slideIndex, setSlideIndex] = useState(0);
  const [range, setRange] = useState<SpotlightRange>("1M");
  const touchStartX = useRef<number | null>(null);

  const featuredPool = useMemo(() => buildFeaturedPool(board.data), [board.data]);
  const safeSlideIndex = featuredPool.length > 0 ? slideIndex % featuredPool.length : 0;
  const activeCard = featuredPool[safeSlideIndex] ?? null;

  const historyQuery = useHistory(activeCard?.symbol ?? "", range);

  /** Precarga todos los rangos de las acciones destacadas para que cambiar entre 1D/1S/1M/3M/1A sea instantáneo. */
  const queryClient = useQueryClient();
  useEffect(() => {
    const targets = featuredPool.slice(0, 3);
    for (const card of targets) {
      const symbol = card.symbol.trim();
      if (!symbol) continue;
      for (const item of SPOTLIGHT_RANGES) {
        if (symbol === activeCard?.symbol && item.id === range) continue;
        void queryClient.prefetchQuery({
          queryKey: ["history", symbol, item.id] as const,
          queryFn: () => getHistory(symbol, item.id),
          staleTime: 60_000,
        });
      }
    }
  }, [activeCard?.symbol, featuredPool, queryClient, range]);

  /**
   * Serie del gráfico según el rango activo:
   * - Si `useHistory(symbol, range)` ya devolvió >= 2 puntos reales, usa esa serie exacta.
   * - Si aún está cargando o `1D` no tiene ticks intradía, recorta `spark` a la ventana
   *   proporcional (`1D` = últimos 3 cierres, `1W` = últimos 6 cierres, `1M` = mes completo)
   *   para que cada pestaña muestre su propia curva y horizonte temporal.
   */
  const series = useMemo<{ p: number; t: number | null }[]>(() => {
    const pts = historyQuery.data?.points;
    if (pts && pts.length >= 2) {
      return pts
        .filter((pt) => Number.isFinite(pt.p) && pt.p > 0)
        .map((pt) => ({ p: pt.p, t: pt.t < 1e12 ? pt.t * 1000 : pt.t }));
    }
    const cleanSpark = (activeCard?.spark ?? []).filter((p) => Number.isFinite(p) && p > 0);
    if (cleanSpark.length >= 2) {
      if (range === "1D") {
        return cleanSpark.slice(-3).map((p) => ({ p, t: null }));
      }
      if (range === "1W" && historyQuery.isPending) {
        return cleanSpark.slice(-6).map((p) => ({ p, t: null }));
      }
      if (range === "1M" && historyQuery.isPending) {
        return cleanSpark.map((p) => ({ p, t: null }));
      }
    }
    return [];
  }, [activeCard, historyQuery.data, historyQuery.isPending, range]);
  const hasHistory = (historyQuery.data?.points?.length ?? 0) >= 2;
  const chartLoading = historyQuery.isPending && series.length < 2;

  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const hoverPoint = hoverIdx !== null ? series[hoverIdx] : undefined;

  /** Coordenadas (mismo cálculo que `sparklineSmoothPath`) para el cursor interactivo. */
  const chartCoords = useMemo(() => {
    const n = series.length;
    if (n < 2) return [] as { x: number; y: number }[];
    let min = series[0]!.p;
    let max = min;
    for (const pt of series) {
      if (pt.p < min) min = pt.p;
      if (pt.p > max) max = pt.p;
    }
    const span = max - min;
    const innerW = CHART_W - CHART_PAD * 2;
    const innerH = CHART_H - CHART_PAD * 2;
    return series.map((pt, i) => ({
      x: CHART_PAD + (i / (n - 1)) * innerW,
      y: CHART_PAD + innerH - (span > 0 ? (pt.p - min) / span : 0.5) * innerH,
    }));
  }, [series]);

  /**
   * Variación como fracción (formatPercent usa style "percent": 0,035 → 3,5 %).
   * Antes se multiplicaba por 100 y salían cifras como -3.500 %.
   */
  const basePct = useMemo<number | null>(() => {
    if (!activeCard) return null;
    if (range === "1D") return activeCard.changePct;
    if (series.length >= 2) {
      const first = series[0]!.p;
      const last = series[series.length - 1]!.p;
      if (first > 0) return (last - first) / first;
    }
    return null;
  }, [activeCard, range, series]);

  const displayPct = useMemo<number | null>(() => {
    const first = series[0]?.p ?? 0;
    if (hoverPoint && first > 0) return (hoverPoint.p - first) / first;
    return basePct;
  }, [basePct, hoverPoint, series]);

  const chartValues = useMemo(() => series.map((pt) => pt.p), [series]);
  const chartShape = useMemo(() => sparklineSmoothPath(chartValues, CHART_W, CHART_H), [chartValues]);
  const isPositive = (basePct ?? 0) >= 0;
  const strokeColor = isPositive ? "#059669" : "#e11d48";
  const hoverPositive = (displayPct ?? 0) >= 0;

  /** Eje derecho real: máximo, medio y mínimo de la serie respecto del primer punto. */
  const axisLabels = useMemo(() => {
    const first = series[0]?.p ?? 0;
    if (first <= 0 || series.length < 2) return null;
    let min = first;
    let max = first;
    for (const pt of series) {
      if (pt.p < min) min = pt.p;
      if (pt.p > max) max = pt.p;
    }
    const pct = (v: number) => (v - first) / first;
    return { top: formatPercent(pct(max)), mid: formatPercent(pct((max + min) / 2)), bot: formatPercent(pct(min)) };
  }, [series]);

  const usdFormatter = useMemo(
    () => new Intl.NumberFormat(locale, { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    [locale],
  );
  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(
        locale,
        range === "1D"
          ? { hour: "2-digit", minute: "2-digit" }
          : range === "1Y"
            ? { day: "numeric", month: "short", year: "numeric" }
            : { day: "numeric", month: "short" },
      ),
    [locale, range],
  );

  function scrub(clientX: number, rect: DOMRect) {
    const n = series.length;
    if (n < 2 || rect.width <= 0) return;
    const innerLeft = rect.left + (CHART_PAD / CHART_W) * rect.width;
    const innerWidth = rect.width * ((CHART_W - CHART_PAD * 2) / CHART_W);
    const ratio = Math.min(1, Math.max(0, (clientX - innerLeft) / innerWidth));
    setHoverIdx(Math.round(ratio * (n - 1)));
  }

  const options: { id: ListId; label: string }[] = [
    { id: "gainers", label: copy.gainers },
    { id: "losers", label: copy.losers },
    { id: "viewed", label: copy.viewed },
  ];
  const cards = board.data ? board.data[list] : [];

  function move(current: ListId, key: string) {
    const index = Math.max(0, options.findIndex((option) => option.id === current));
    const nextIndex = indexFromKey(key, index, options.length);
    if (nextIndex === null) return;
    const option = options[nextIndex];
    if (!option) return;
    setPicked(option.id);
    document.getElementById(`${tabsId}-${option.id}`)?.focus();
  }

  function stepSlide(delta: number) {
    if (featuredPool.length <= 1) return;
    setHoverIdx(null);
    setSlideIndex((prev) => (prev + delta + featuredPool.length) % featuredPool.length);
  }

  function cycleList() {
    const idx = LISTS.indexOf(list);
    const next = LISTS[(idx + 1) % LISTS.length] ?? "gainers";
    setPicked(next);
  }

  const activeRangeMeta = SPOTLIGHT_RANGES.find((item) => item.id === range) ?? SPOTLIGHT_RANGES[2]!;
  const isFollowed = activeCard ? (favorites ?? []).includes(activeCard.symbol) : false;

  return (
    <section aria-labelledby={titleId} className="flex min-w-0 flex-col gap-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id={titleId} className="text-lg font-semibold tracking-tight text-fg">
            {copy.title}
          </h2>
          {board.data?.spy ? (
            <SpyChip
              card={board.data.spy}
              name={copy.spy}
              label={`${cardLabel(copy.openStock, board.data.spy)}. ${copy.spy}. ${formatPercent(board.data.spy.changePct)}`}
            />
          ) : null}
        </div>
        <ChileClock label={copy.clock} locale={locale} />
      </div>

      {board.isPending ? <TodaySkeleton label={copy.loading} /> : null}

      {board.isError && !board.data ? (
        <div role="alert" className="flex min-h-[148px] flex-col items-start justify-center gap-3">
          <p className="text-sm text-fg">{copy.error}</p>
          <Button variant="secondary" size="lg" onClick={() => void board.refetch()}>
            {copy.retry}
          </Button>
        </div>
      ) : null}

      {board.data ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-stretch">
          {activeCard ? (
            <div
              className="flex flex-col justify-between rounded-3xl border border-border/80 bg-white p-4 shadow-[0_12px_36px_-16px_rgba(12,15,20,0.08)] sm:p-5 lg:col-span-8"
              onTouchStart={(event) => {
                touchStartX.current = event.touches[0]?.clientX ?? null;
              }}
              onTouchEnd={(event) => {
                const startX = touchStartX.current;
                touchStartX.current = null;
                if (startX === null) return;
                const endX = event.changedTouches[0]?.clientX ?? startX;
                const deltaX = endX - startX;
                if (deltaX < -40) stepSlide(1);
                else if (deltaX > 40) stepSlide(-1);
              }}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div
                  role="link"
                  tabIndex={0}
                  aria-label={`${cardLabel(copy.openStock, activeCard)}. ${activeCard.symbol}`}
                  onClick={() => router.push(`/app/accion/${encodeURIComponent(activeCard.symbol)}`)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    router.push(`/app/accion/${encodeURIComponent(activeCard.symbol)}`);
                  }}
                  className="flex min-w-0 cursor-pointer items-center gap-3 rounded-xl outline-none focus-visible:ring-4 focus-visible:ring-fg/20"
                >
                  <TickerLogo
                    symbol={activeCard.symbol}
                    name={activeCard.name}
                    logoUrl={activeCard.logoUrl}
                    size={40}
                    decorative
                    loading="eager"
                    sizes="40px"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-base font-bold tracking-tight text-fg sm:text-[17px]">
                      {activeCard.name} ({activeCard.symbol})
                    </p>
                    <p className="truncate text-xs text-fg-muted">
                      {language === "en"
                        ? `Tokenized stock · Solana 24/7 · #${safeSlideIndex + 1} featured`
                        : `Acción tokenizada · Solana 24/7 · Destacada #${safeSlideIndex + 1}`}
                    </p>
                  </div>
                </div>

                <div className="inline-flex shrink-0 items-center rounded-full bg-surface-2/90 p-0.5">
                  {SPOTLIGHT_RANGES.map((item) => {
                    const active = item.id === range;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() => {
                          setHoverIdx(null);
                          setRange(item.id);
                        }}
                        className={cn(
                          "cursor-pointer rounded-full px-2.5 py-1 text-[11px] transition-all",
                          active
                            ? "bg-white font-semibold text-fg shadow-2xs"
                            : "font-medium text-fg-muted hover:text-fg",
                        )}
                      >
                        {language === "en" ? item.labelEn : item.labelEs}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-2.5 flex items-baseline gap-2">
                <span
                  className={cn(
                    "num text-2xl font-bold tracking-tight tabular-nums transition-colors sm:text-[28px]",
                    hoverPositive ? "text-up" : "text-down",
                  )}
                >
                  {displayPct === null ? "—" : formatPercent(displayPct)}
                </span>
                <span className="text-xs font-medium text-fg-muted">
                  {hoverPoint
                    ? `${usdFormatter.format(hoverPoint.p)}${hoverPoint.t !== null ? ` · ${dateFormatter.format(new Date(hoverPoint.t))}` : ""}`
                    : language === "en"
                      ? activeRangeMeta.periodEn
                      : activeRangeMeta.periodEs}
                </span>
              </div>

              <div
                className="relative my-2 h-[136px] w-full cursor-crosshair select-none pr-14 sm:h-[148px]"
                style={{ touchAction: "pan-y" }}
                onTouchStart={(event) => event.stopPropagation()}
                onTouchEnd={(event) => event.stopPropagation()}
              >
                {chartShape ? (
                  <div
                    key={`${activeCard.symbol}-${range}`}
                    className="relative h-full w-full"
                    role="img"
                    aria-label={`${activeCard.symbol}: ${basePct === null ? "" : formatPercent(basePct)} ${language === "en" ? activeRangeMeta.periodEn : activeRangeMeta.periodEs}`}
                    onPointerMove={(event) => scrub(event.clientX, event.currentTarget.getBoundingClientRect())}
                    onPointerDown={(event) => scrub(event.clientX, event.currentTarget.getBoundingClientRect())}
                    onPointerLeave={() => setHoverIdx(null)}
                    onPointerCancel={() => setHoverIdx(null)}
                    onPointerUp={(event) => {
                      if (event.pointerType !== "mouse") setHoverIdx(null);
                    }}
                  >
                    <svg
                      viewBox={`0 0 ${CHART_W} ${CHART_H}`}
                      preserveAspectRatio="none"
                      className="absolute inset-0 h-full w-full overflow-visible"
                      aria-hidden
                    >
                      <defs>
                        <linearGradient id={chartGradId} x1="0" x2="0" y1="0" y2="1">
                          <stop offset="0%" stopColor={strokeColor} stopOpacity="0.22" />
                          <stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
                        </linearGradient>
                      </defs>
                      {[CHART_PAD, CHART_H / 2, CHART_H - CHART_PAD].map((y) => (
                        <line
                          key={y}
                          x1="0"
                          y1={y}
                          x2={CHART_W}
                          y2={y}
                          stroke="currentColor"
                          className="text-border/70"
                          strokeDasharray="3 3"
                          vectorEffect="non-scaling-stroke"
                        />
                      ))}
                      <path d={chartShape.area} fill={`url(#${chartGradId})`} />
                      <path
                        d={chartShape.line}
                        fill="none"
                        stroke={strokeColor}
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        vectorEffect="non-scaling-stroke"
                        className="transition-opacity"
                        opacity={hoverIdx !== null ? 0.9 : 1}
                      />
                    </svg>
                    {hoverIdx !== null && chartCoords[hoverIdx] ? (
                      <>
                        <span
                          aria-hidden
                          className="pointer-events-none absolute inset-y-0 w-px bg-fg/25"
                          style={{ left: `${(chartCoords[hoverIdx]!.x / CHART_W) * 100}%` }}
                        />
                        <span
                          aria-hidden
                          className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_2px_8px_rgba(12,15,20,0.25)]"
                          style={{
                            left: `${(chartCoords[hoverIdx]!.x / CHART_W) * 100}%`,
                            top: `${(chartCoords[hoverIdx]!.y / CHART_H) * 100}%`,
                            backgroundColor: strokeColor,
                          }}
                        />
                      </>
                    ) : (
                      <span
                        aria-hidden
                        className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
                        style={{
                          left: `${(chartShape.lastX / CHART_W) * 100}%`,
                          top: `${(chartShape.lastY / CHART_H) * 100}%`,
                          backgroundColor: strokeColor,
                          boxShadow: `0 0 0 4px ${isPositive ? "rgba(5,150,105,0.18)" : "rgba(225,29,72,0.18)"}`,
                        }}
                      />
                    )}
                    {historyQuery.isFetching && !hasHistory ? (
                      <span className="pointer-events-none absolute top-1 left-1 text-[10px] text-fg-muted">
                        {copy.loading}
                      </span>
                    ) : null}
                  </div>
                ) : chartLoading ? (
                  <div className="flex h-full items-center justify-center rounded-2xl bg-surface-1/60 text-xs text-fg-muted motion-safe:animate-pulse">
                    {copy.loading}
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center rounded-2xl bg-surface-1/60 text-xs text-fg-muted">
                    {copy.empty}
                  </div>
                )}
                {axisLabels ? (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-y-0 right-0 flex w-14 flex-col justify-between text-right text-[10px] font-medium text-fg-muted tabular-nums"
                  >
                    <span className="-translate-y-1/2">{axisLabels.top}</span>
                    <span>{axisLabels.mid}</span>
                    <span className="translate-y-1/2">{axisLabels.bot}</span>
                  </div>
                ) : null}
              </div>

              <div className="mt-2 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => toggleFavorite(activeCard.symbol)}
                    className="inline-flex min-h-9 cursor-pointer items-center justify-center gap-1.5 rounded-full bg-fg px-5 py-1.5 text-xs font-semibold text-bg shadow-xs transition hover:bg-fg/90 active:scale-[0.98]"
                  >
                    <span>{isFollowed ? "✓" : "+"}</span>
                    <span>
                      {isFollowed
                        ? language === "en"
                          ? "Following"
                          : "Siguiendo"
                        : language === "en"
                          ? "Follow"
                          : "Seguir"}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push(`/app/accion/${encodeURIComponent(activeCard.symbol)}`)}
                    className="inline-flex min-h-9 cursor-pointer items-center justify-center rounded-full border border-border bg-white px-4 py-1.5 text-xs font-semibold text-fg transition hover:bg-surface-2 active:scale-[0.98]"
                  >
                    {language === "en" ? "Open" : "Ver"}
                  </button>
                </div>

                {featuredPool.length > 1 ? (
                  <div className="flex items-center gap-2.5">
                    <div className="flex items-center gap-1.5">
                      {featuredPool.map((item, idx) => (
                        <button
                          key={item.symbol}
                          type="button"
                          aria-label={`${idx + 1}: ${item.name}`}
                          onClick={() => setSlideIndex(idx)}
                          className={cn(
                            "cursor-pointer rounded-full transition-all",
                            safeSlideIndex === idx
                              ? "h-1.5 w-5 bg-fg"
                              : "h-1.5 w-1.5 bg-border hover:bg-fg-muted",
                          )}
                        />
                      ))}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        aria-label={language === "en" ? "Previous stock" : "Acción anterior"}
                        onClick={() => stepSlide(-1)}
                        className="inline-flex size-8 cursor-pointer items-center justify-center rounded-full border border-border bg-white text-xs font-semibold text-fg transition hover:bg-surface-2 active:scale-[0.96]"
                      >
                        ‹
                      </button>
                      <button
                        type="button"
                        aria-label={language === "en" ? "Next stock" : "Siguiente acción"}
                        onClick={() => stepSlide(1)}
                        className="inline-flex size-8 cursor-pointer items-center justify-center rounded-full border border-border bg-white text-xs font-semibold text-fg transition hover:bg-surface-2 active:scale-[0.96]"
                      >
                        ›
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          <div
            className={cn(
              "flex flex-col justify-between rounded-3xl border border-border/80 bg-white p-4 shadow-[0_12px_36px_-16px_rgba(12,15,20,0.08)] sm:p-5",
              activeCard ? "lg:col-span-4" : "lg:col-span-12",
            )}
          >
            <div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[15px] font-bold tracking-tight text-fg">
                  {language === "en" ? "Top movers" : "Mejor rendimiento"}
                </span>
                <span className="text-xs font-medium text-fg-muted">
                  {language === "en" ? "Ranking →" : "Ranking →"}
                </span>
              </div>

              <div
                role="tablist"
                aria-label={copy.lists}
                aria-orientation="horizontal"
                className="mt-2.5 grid grid-cols-3 gap-1 rounded-full bg-surface-2/85 p-1"
                onKeyDown={(event) => {
                  if (indexFromKey(event.key, 0, options.length) === null) return;
                  event.preventDefault();
                  move(list, event.key);
                }}
              >
                {options.map((option) => {
                  const selected = option.id === list;
                  return (
                    <button
                      key={option.id}
                      id={`${tabsId}-${option.id}`}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      aria-controls={panelId}
                      tabIndex={selected ? 0 : -1}
                      onClick={() => setPicked(option.id)}
                      className={cn(
                        "inline-flex min-h-8 cursor-pointer items-center justify-center rounded-full px-2 text-xs font-semibold whitespace-nowrap outline-none transition-all focus-visible:ring-4 focus-visible:ring-fg/20",
                        selected
                          ? "bg-fg text-bg shadow-2xs"
                          : "text-fg-muted hover:text-fg",
                      )}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>

              <div id={panelId} role="tabpanel" aria-labelledby={`${tabsId}-${list}`} className="mt-2 min-h-[180px] min-w-0">
                {cards.length === 0 ? (
                  <p className="flex min-h-[180px] items-center justify-center text-sm text-fg-muted">
                    {copy.empty}
                  </p>
                ) : (
                  <ol className="flex flex-col divide-y divide-border/50">
                    {cards.map((card, index) => (
                      <li key={card.symbol}>
                        <MoverCard
                          card={card}
                          rank={index + 1}
                          label={`${cardLabel(copy.openStock, card)}. ${card.symbol}. ${formatPercent(card.changePct)}`}
                        />
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={cycleList}
              className="mt-3 w-full cursor-pointer rounded-full bg-surface-2/80 py-2 text-center text-xs font-semibold text-fg transition hover:bg-surface-3"
            >
              {language === "en" ? "Switch ranking view" : "Cambiar vista del ranking"}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
