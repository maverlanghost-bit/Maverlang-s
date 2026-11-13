"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { ChangeText, MoverCard, SpyChip } from "@/components/domain/market-today/mover-card";
import { TodaySkeleton } from "@/components/domain/market-today/skeleton";
import { buildFeaturedPool } from "@/components/domain/market-today/spotlight";
import { PriceText } from "@/components/domain/price-text";
import { sparklineSmoothPath } from "@/components/domain/sparkline";
import { TickerLogo } from "@/components/domain/ticker-logo";
import { Button } from "@/components/ui/button";
import { indexFromKey } from "@/components/ui/keys";
import { hoyCopy } from "@/content/i18n/extra-hoy";
import { ApiError, getHistory, searchMarket } from "@/lib/api/client";
import { apiResultSchema } from "@/lib/api/contracts";
import { cn } from "@/lib/cn";
import { formatPercent } from "@/lib/format";
import { useHistory } from "@/lib/hooks/queries";
import { useFavorites } from "@/lib/hooks/use-favorites";
import { useT } from "@/lib/hooks/use-t";
import {
  dayChange,
  formatChileClock,
  todayBoardSchema,
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

/**
 * Rangos y listas del día: texto, no cápsula. El activo va en tinta y
 * subrayado (2px); el resto en gris y sólo oscurece al pasar el puntero.
 * 44px de alto en móvil; 32px con puntero.
 */
const chipClass =
  "inline-flex min-h-11 shrink-0 cursor-pointer items-center text-[13px] leading-5 font-medium whitespace-nowrap transition-colors duration-150 ease-spring sm:min-h-8";
const chipActiveClass = "text-fg";
const chipIdleClass = "text-fg-muted hover:text-fg";
/** Subrayado en el rótulo (no en el flex): siempre se dibuja bajo el texto. */
const chipMarkClass = "underline decoration-2 underline-offset-[5px]";
/** Acción secundaria en texto: 44px en móvil, sin píldora. */
const quietActionClass =
  "inline-flex min-h-11 cursor-pointer items-center gap-1.5 text-[13px] leading-5 font-medium text-fg-muted transition-colors duration-150 hover:text-fg sm:min-h-8";
/** Flecha del carrusel: 44px táctil, 36px con puntero. */
const pagerButtonClass =
  "inline-flex size-11 cursor-pointer items-center justify-center rounded-full text-base font-semibold text-fg transition-colors hover:bg-surface-1 active:scale-[0.96] sm:size-9";

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

/**
 * Reloj del cambio diario. Resolución de un minuto: basta para la ventana de
 * 24 h y evita llamar `Date.now()` durante el render.
 */
const DAY_CLOCK_MS = 60_000;
let dayClockValue: number | null = null;

function subscribeDayClock(onStoreChange: () => void) {
  const id = window.setInterval(() => {
    dayClockValue = Date.now();
    onStoreChange();
  }, DAY_CLOCK_MS);
  return () => window.clearInterval(id);
}

function dayClockSnapshot(): number | null {
  dayClockValue ??= Date.now();
  return dayClockValue;
}

function dayClockServerSnapshot(): number | null {
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

function cardLabel(template: string, card: { name: string }): string {
  return template.replace("{name}", card.name);
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

  /**
   * Catálogo visible para el carrusel. Es opcional: si falla, el selector cae a
   * las listas reales del tablero (`board`) sin inventar fichas.
   */
  const catalog = useQuery({
    queryKey: ["market-today-spotlight-catalog", "listed", 50, "liquidity"],
    queryFn: () => searchMarket({ q: "", page: 1, pageSize: 50, sort: "liquidity", scope: "listed" }),
    enabled: board.isSuccess || board.isError,
    staleTime: 5 * 60_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  });

  const [picked, setPicked] = useState<ListId | null>(null);
  const list: ListId =
    picked ?? LISTS.find((id) => (board.data?.[id].length ?? 0) > 0) ?? "gainers";

  const [slideIndex, setSlideIndex] = useState(0);
  const [range, setRange] = useState<SpotlightRange>("1M");
  const touchStartX = useRef<number | null>(null);

  const featuredPool = useMemo(
    () => buildFeaturedPool(board.data, catalog.data?.items),
    [board.data, catalog.data],
  );
  const safeSlideIndex = featuredPool.length > 0 ? slideIndex % featuredPool.length : 0;
  const activeCard = featuredPool[safeSlideIndex] ?? null;

  const historyQuery = useHistory(activeCard?.symbol ?? "", range);
  const dayNow = useSyncExternalStore(subscribeDayClock, dayClockSnapshot, dayClockServerSnapshot);

  /** Precarga los otros rangos de la acción activa una vez que el gráfico visible terminó de cargar. */
  const queryClient = useQueryClient();
  useEffect(() => {
    const symbol = activeCard?.symbol.trim() ?? "";
    if (!symbol || !historyQuery.isSuccess) return;
    const timer = window.setTimeout(() => {
      for (const item of SPOTLIGHT_RANGES) {
        if (item.id === range) continue;
        void queryClient.prefetchQuery({
          queryKey: ["history", symbol, item.id] as const,
          queryFn: () => getHistory(symbol, item.id),
          staleTime: 60_000,
        });
      }
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [activeCard?.symbol, historyQuery.isSuccess, queryClient, range]);

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
   * Variación del día a partir de la serie real de 1D, con la misma regla del
   * tablero: dos cierres diarios o la ventana de 24 h con ticks. Así una ficha
   * que sólo viene del catálogo no muestra cinco días como si fueran "hoy".
   */
  const dayChangePct = useMemo<number | null>(() => {
    const data = historyQuery.data;
    if (!data || data.points.length < 2 || dayNow === null) return null;
    const points = data.points.map((pt) => ({
      t: pt.t < 1e12 ? pt.t * 1000 : pt.t,
      p: pt.p,
    }));
    return dayChange(points, dayNow, data.source === "closes");
  }, [dayNow, historyQuery.data]);

  /**
   * Variación como fracción (formatPercent usa style "percent": 0,035 → 3,5 %).
   * Antes se multiplicaba por 100 y salían cifras como -3.500 %.
   */
  const basePct = useMemo<number | null>(() => {
    if (!activeCard) return null;
    // 1D conserva la variación del día que ya calculó el tablero. Una ficha que
    // sólo viene del catálogo (sin tablero) usa la serie real de 1D.
    if (range === "1D") {
      if (activeCard.changePct !== null && Number.isFinite(activeCard.changePct)) {
        return activeCard.changePct;
      }
      return dayChangePct;
    }
    if (series.length >= 2) {
      const first = series[0]!.p;
      const last = series[series.length - 1]!.p;
      if (first > 0) return (last - first) / first;
    }
    return null;
  }, [activeCard, dayChangePct, range, series]);

  const displayPct = useMemo<number | null>(() => {
    const first = series[0]?.p ?? 0;
    if (hoverPoint && first > 0) return (hoverPoint.p - first) / first;
    return basePct;
  }, [basePct, hoverPoint, series]);

  /**
   * Precio grande de la destacada: el último punto real de la serie (o el
   * punto bajo el cursor). Sin serie no se pinta una cifra inventada.
   */
  const lastPoint = series.length > 0 ? series[series.length - 1] : undefined;
  const shownPriceUsd = hoverPoint?.p ?? lastPoint?.p ?? null;

  const chartValues = useMemo(() => series.map((pt) => pt.p), [series]);
  const chartShape = useMemo(() => sparklineSmoothPath(chartValues, CHART_W, CHART_H), [chartValues]);
  const isPositive = (basePct ?? 0) >= 0;
  const strokeColor = isPositive ? "#059669" : "#e11d48";

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

  const activeRangeMeta = SPOTLIGHT_RANGES.find((item) => item.id === range) ?? SPOTLIGHT_RANGES[2]!;
  const isFollowed = activeCard ? (favorites ?? []).includes(activeCard.symbol) : false;
  /** Bajo el precio: la fecha del punto bajo el cursor o el periodo del rango. */
  const rangeLabel = language === "en" ? activeRangeMeta.periodEn : activeRangeMeta.periodEs;
  const hoverDate =
    hoverPoint && hoverPoint.t !== null ? dateFormatter.format(new Date(hoverPoint.t)) : "";

  return (
    <section aria-labelledby={titleId} className="flex min-w-0 flex-col">
      {/* Banda de título: rótulo, índice del día y reloj en una línea de dato. */}
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-6 gap-y-1 border-b border-border pb-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
          <h2 id={titleId} className="text-[15px] leading-5 font-semibold tracking-tight text-fg">
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
        <div role="alert" className="flex flex-col items-start gap-3 py-6">
          <p className="text-[13px] leading-5 text-fg-muted">{copy.error}</p>
          <Button variant="secondary" onClick={() => void board.refetch()}>
            {copy.retry}
          </Button>
        </div>
      ) : null}

      {board.data ? (
        <div className="flex min-w-0 flex-col divide-y divide-border">
          {activeCard ? (
            <div
              className="flex min-w-0 flex-col gap-4 py-5"
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
              {/* Identidad + precio: la misma retícula que una fila de la tabla. */}
              <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-6 gap-y-3">
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
                  className="flex min-w-0 cursor-pointer items-center gap-3"
                >
                  <TickerLogo
                    symbol={activeCard.symbol}
                    name={activeCard.name}
                    logoUrl={activeCard.logoUrl}
                    size={36}
                    decorative
                    loading="eager"
                    sizes="36px"
                  />
                  <div className="min-w-0">
                    <p className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                      <span className="num text-[15px] leading-5 font-semibold tracking-tight text-fg">
                        {activeCard.symbol}
                      </span>
                      <span className="min-w-0 truncate text-[13px] leading-5 text-fg-body">{activeCard.name}</span>
                    </p>
                    <p className="mt-0.5 truncate text-[13px] leading-5 text-fg-muted">
                      {language === "en" ? "Tokenized stock · Solana 24/7" : "Acción tokenizada · Solana 24/7"}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                  {shownPriceUsd !== null ? (
                    <PriceText
                      value={shownPriceUsd}
                      currency="USD"
                      size="sm"
                      className="text-[26px] leading-none font-semibold tracking-tight sm:text-[30px]"
                    />
                  ) : (
                    <span className="num text-[26px] leading-none font-semibold text-fg sm:text-[30px]">—</span>
                  )}
                  {displayPct !== null ? (
                    <ChangeText value={displayPct} />
                  ) : (
                    <span className="text-[13px] leading-5 text-fg-muted">—</span>
                  )}
                  <span className="text-[13px] leading-5 text-fg-muted">{hoverDate || rangeLabel}</span>
                </div>
              </div>

              {/* Rangos de texto y paginador del carrusel, sobre el gráfico. */}
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-6 gap-y-1">
                  <div
                    role="group"
                    aria-label={language === "en" ? "Chart range" : "Rango del gráfico"}
                    className="flex min-w-0 flex-wrap items-center gap-x-4"
                  >
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
                          className={cn(chipClass, active ? chipActiveClass : chipIdleClass)}
                        >
                          <span className={cn(active && chipMarkClass)}>
                            {language === "en" ? item.labelEn : item.labelEs}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {featuredPool.length > 1 ? (
                    <div className="flex items-center gap-1">
                      <span aria-hidden className="num mr-1.5 text-[13px] leading-5 tabular-nums text-fg-muted">
                        {safeSlideIndex + 1} / {featuredPool.length}
                      </span>
                      <button
                        type="button"
                        aria-label={language === "en" ? "Previous stock" : "Acción anterior"}
                        onClick={() => stepSlide(-1)}
                        className={pagerButtonClass}
                      >
                        ‹
                      </button>
                      <button
                        type="button"
                        aria-label={language === "en" ? "Next stock" : "Siguiente acción"}
                        onClick={() => stepSlide(1)}
                        className={pagerButtonClass}
                      >
                        ›
                      </button>
                    </div>
                  ) : null}
                </div>

                <div
                  className="relative h-32 w-full cursor-crosshair select-none pr-14 sm:h-40"
                  style={{ touchAction: "pan-y" }}
                  onTouchStart={(event) => event.stopPropagation()}
                  onTouchEnd={(event) => event.stopPropagation()}
                >
                  {chartShape ? (
                    <div
                      key={`${activeCard.symbol}-${range}`}
                      className="relative h-full w-full select-none"
                      role="img"
                      aria-label={`${activeCard.symbol}: ${basePct === null ? "" : formatPercent(basePct)} ${rangeLabel}`}
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
                        className="absolute inset-0 h-full w-full touch-pan-y select-none overflow-visible outline-none focus:outline-none focus-visible:outline-none"
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
                        <span className="pointer-events-none absolute top-1 left-1 text-[13px] text-fg-muted">
                          {copy.loading}
                        </span>
                      ) : null}
                    </div>
                  ) : chartLoading ? (
                    <div className="flex h-full items-center justify-center text-[13px] text-fg-muted">
                      {copy.loading}
                    </div>
                  ) : (
                    <div className="flex h-full items-center justify-center text-[13px] text-fg-muted">
                      {copy.empty}
                    </div>
                  )}
                  {axisLabels ? (
                    <div
                      aria-hidden
                      className="pointer-events-none absolute inset-y-0 right-0 flex w-14 flex-col justify-between text-right text-[13px] text-fg-muted tabular-nums"
                    >
                      <span className="-translate-y-1/2">{axisLabels.top}</span>
                      <span>{axisLabels.mid}</span>
                      <span className="translate-y-1/2">{axisLabels.bot}</span>
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Una sola acción primaria: ver la ficha. Seguir es texto. */}
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                <Button onClick={() => router.push(`/app/accion/${encodeURIComponent(activeCard.symbol)}`)}>
                  {language === "en" ? "View stock" : "Ver acción"}
                </Button>
                <button
                  type="button"
                  aria-pressed={isFollowed}
                  onClick={() => toggleFavorite(activeCard.symbol)}
                  className={quietActionClass}
                >
                  <span aria-hidden>{isFollowed ? "✓" : "+"}</span>
                  <span className={cn("underline-offset-4 hover:underline", isFollowed && "text-fg")}>
                    {isFollowed
                      ? language === "en"
                        ? "Following"
                        : "Siguiendo"
                      : language === "en"
                        ? "Follow"
                        : "Seguir"}
                  </span>
                </button>
              </div>
            </div>
          ) : null}

          {/* Ranking del día: chips de texto y filas de dato con hairline. */}
          <div className="flex min-w-0 flex-col gap-2 py-5">
            <div
              role="tablist"
              aria-label={copy.lists}
              aria-orientation="horizontal"
              className="flex min-w-0 flex-wrap items-center gap-x-6 gap-y-0.5"
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
                    className={cn(chipClass, selected ? chipActiveClass : chipIdleClass)}
                  >
                    <span className={cn(selected && chipMarkClass)}>{option.label}</span>
                  </button>
                );
              })}
            </div>

            <div id={panelId} role="tabpanel" aria-labelledby={`${tabsId}-${list}`} className="min-w-0">
              {cards.length === 0 ? (
                <p className="py-4 text-[13px] leading-5 text-fg-muted">{copy.empty}</p>
              ) : (
                <ol className="flex min-w-0 flex-col divide-y divide-border">
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
        </div>
      ) : null}
    </section>
  );
}
