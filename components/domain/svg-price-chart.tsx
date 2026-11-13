"use client";

import { memo, useEffect, useId, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent } from "react";

import { cn } from "@/lib/cn";
import { formatDateTime, formatUsd } from "@/lib/format";
import {
  CHART_H,
  CHART_W,
  PAD_B,
  PAD_T,
  VOLUME_H,
  buildChartModel,
  candleMarks,
  changeFromOpen,
  nearestPointWithin,
  openingPriceY,
  readOhlc,
  readVolume,
  toRows,
  volumeMarks,
  yForPrice,
  type CandleMark,
  type ChartBenchmark,
  type ChartLayerModel,
  type ChartOverlay,
  type PlottedPoint,
  type PriceScale,
  type VolumeMark,
} from "@/lib/market/chart-geometry";
import type { ChartTone } from "@/lib/market/series";
import type { PricePoint } from "@/lib/types";

export type { ChartBenchmark, ChartOverlay };

export const TONE_STROKE: Record<ChartTone, string> = {
  up: "var(--color-up, #0f7a32)",
  down: "var(--color-down, #c81e1e)",
  flat: "var(--color-fg-muted, #6c6f75)",
};

/** Gris de gráfico sobre blanco: #a3a3a3 da 2,5:1 y #e5e5e5 da 1,3:1. #767676 pasa 3:1. */
const GRAPHIC_INK = "#767676";
const REFERENCE_STROKE = "#5c5c5c";
const GUIDE_STROKE = "#d4d4d4";
/** Precio inicial del período. Va debajo del área y de la curva. */
const OPEN_STROKE = GRAPHIC_INK;

function graphicInk(color: string): string {
  return color.toLowerCase() === "#a3a3a3" ? REFERENCE_STROKE : color;
}
const OPEN_DASH = "3 4";
const SCRUB_SLOP_PX = 8;
const TOUCH_GHOST_MS = 700;
const TOUCH_RELEASE_MS = 400;
const EMPTY_OVERLAYS: readonly ChartOverlay[] = [];

/** Cierre (`t`, `p`) y, si la fuente los trae, OHLC y volumen. Nunca se inventan. */
export type ChartPoint = PricePoint & {
  o?: number;
  h?: number;
  l?: number;
  c?: number;
  v?: number;
};

export interface PriceChartProps {
  points: readonly ChartPoint[];
  tone: ChartTone;
  label: string;
  emptyLabel: string;
  /** Subtítulo del estado vacío. */
  emptyHint?: string;
  onHover: (usd: number | null, timeMs?: number | null) => void;
  /** Polling del detalle. Se agrega al final sólo si `t` es posterior al último punto. */
  livePoint?: PricePoint;
  /** El padre tapa el gráfico (carga o error) y anuncia ese estado. */
  quiet?: boolean;
  /** Serie de referencia, no es un precio real: línea gris punteada, sin gradiente. */
  reference?: boolean;
  /** Medias u otras series, en la misma escala Y que el precio (o en % si hay benchmark). */
  overlays?: readonly ChartOverlay[];
  /** SPYx u otra serie de referencia, rebasada a % desde el inicio. */
  benchmark?: ChartBenchmark | null;
  /** `candles` sólo dibuja si los puntos traen OHLC. Si no, queda la línea. */
  chartStyle?: "line" | "candles";
  /** Barras sólo si los puntos traen `v`. No se inventa volumen. */
  showVolume?: boolean;
  volumeLabel?: string;
  /**
   * Costo promedio de la posición, en USD. Se dibuja como línea punteada
   * esmeralda sólo si cae dentro del rango visible y el eje Y es precio.
   */
  avgCostUsd?: number | null;
  /**
   * Precio promedio del período seleccionado, en USD. Se dibuja como guía
   * horizontal punteada cuando el usuario activa la vista de promedio.
   */
  periodAvgUsd?: number | null;
  /** Muestra líneas guía horizontales y etiquetas de escala de precio a la derecha. */
  showGrid?: boolean;
  /**
   * `percent` rotula la escala derecha como variación contra el primer punto
   * del período ("+2,45%", "0,00%", "-1,20%"). Si ese punto no es un precio
   * válido, la escala cae a precio.
   */
  axisMode?: "price" | "percent";
  /**
   * Franja sutil entre el cuartil superior y el inferior de la serie, fuera
   * del SVG. No captura el puntero ni tapa los badges de máximo y mínimo.
   */
  showRangeBand?: boolean;
  /** Clases de altura personalizadas (por defecto `"h-56 sm:h-64"`). */
  heightClassName?: string;
  /**
   * Etiquetas flotantes de máximo y mínimo del período sobre la curva. Sólo
   * aparecen en una serie de precio real, sin velas, sin eje % y sin hover.
   * La ficha y la portada las apagan con `showExtremes={false}`.
   */
  showExtremes?: boolean;
  /**
   * Serie enfocada: `"asset"` para la curva principal o el `id` de una capa
   * (`"benchmark"`, `"sma-20"`, `"compare-QQQx"`). El resto se difumina.
   * `null` o ausente deja todas las series a plena opacidad.
   */
  highlightedLayerId?: string | null;
  /** El gráfico avisa qué serie quedó enfocada al pasar el cursor por su curva. */
  onHighlightLayer?: (id: string | null) => void;
  /** Botón flotante de pantalla completa en la esquina superior derecha. */
  onToggleFullscreen?: () => void;
  /** `true` mientras el gráfico ocupa la pantalla completa: cambia ícono y rótulo. */
  isFullscreen?: boolean;
}

type DrawnPoint = PlottedPoint & { usd: number };

function areaUnder(line: string, points: readonly { x: number }[]): string {
  const first = points[0];
  const last = points[points.length - 1];
  if (!line || !first || !last) return "";
  const base = CHART_H - PAD_B;
  return `${line} L ${last.x.toFixed(2)} ${base} L ${first.x.toFixed(2)} ${base} Z`;
}

function indexAt(clientX: number, rect: DOMRect, points: readonly { x: number }[]): number | null {
  if (points.length === 0 || rect.width <= 0) return null;
  const local = clientX - rect.left;
  if (local < 0 || local > rect.width) return null;
  const x = (local / rect.width) * CHART_W;
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    if (!point) continue;
    const distance = Math.abs(point.x - x);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  return best;
}

/**
 * El arrastre vertical sigue siendo de la página.
 * Sólo un gesto claramente horizontal elige un punto del historial.
 */
function bindHorizontalScrub(
  root: SVGSVGElement,
  getPoints: () => readonly { x: number }[],
  onIndex: (index: number | null) => void,
  onTouch: () => void,
): () => void {
  let startX = 0;
  let startY = 0;
  let mode: "idle" | "scroll" | "scrub" = "idle";
  let gesture = 0;
  let clearTimer = 0;

  const start = (event: TouchEvent) => {
    onTouch();
    gesture += 1;
    window.clearTimeout(clearTimer);
    if (event.touches.length !== 1) {
      mode = "scroll";
      return;
    }
    const touch = event.touches[0];
    if (!touch) return;
    startX = touch.clientX;
    startY = touch.clientY;
    mode = "idle";
  };

  const move = (event: TouchEvent) => {
    onTouch();
    const touch = event.touches[0];
    if (!touch || event.touches.length !== 1) {
      mode = "scroll";
      return;
    }
    const dx = Math.abs(touch.clientX - startX);
    const dy = Math.abs(touch.clientY - startY);
    if (mode === "idle") {
      if (dx < SCRUB_SLOP_PX && dy < SCRUB_SLOP_PX) return;
      mode = dy * 2 >= dx ? "scroll" : "scrub";
    }
    if (mode !== "scrub") return;
    if (event.cancelable) event.preventDefault();
    const index = indexAt(touch.clientX, root.getBoundingClientRect(), getPoints());
    if (index === null) return;
    onIndex(index);
  };

  const end = () => {
    onTouch();
    const scrubbed = mode === "scrub";
    const id = gesture;
    mode = "idle";
    if (!scrubbed) return;
    onIndex(null);
    clearTimer = window.setTimeout(() => {
      if (gesture !== id) return;
      onIndex(null);
    }, TOUCH_RELEASE_MS);
  };

  root.addEventListener("touchstart", start, { passive: true });
  root.addEventListener("touchmove", move, { passive: false });
  root.addEventListener("touchend", end);
  root.addEventListener("touchcancel", end);
  return () => {
    window.clearTimeout(clearTimer);
    root.removeEventListener("touchstart", start);
    root.removeEventListener("touchmove", move);
    root.removeEventListener("touchend", end);
    root.removeEventListener("touchcancel", end);
  };
}

function hoverWhen(t: number): string {
  const date = new Date(t);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return formatDateTime(date.toISOString());
  } catch {
    return "";
  }
}

function commitHover(
  index: number | null,
  points: readonly DrawnPoint[],
  hoverRef: { current: number | null },
  setHoverIndex: (index: number | null) => void,
  onHover: (usd: number | null, timeMs: number | null) => void,
) {
  if (index === null || index >= points.length) {
    if (hoverRef.current === null) return;
    hoverRef.current = null;
    setHoverIndex(null);
    onHover(null, null);
    return;
  }
  const point = points[index];
  if (!point) return;
  if (hoverRef.current === index) return;
  hoverRef.current = index;
  setHoverIndex(index);
  onHover(point.usd, point.t);
}

function historyKey(points: readonly PricePoint[]): string {
  const rows = toRows(points);
  const first = rows[0];
  const last = rows[rows.length - 1];
  if (!first || !last) return "0";
  return `${rows.length}:${first.t}:${last.t}:${last.p}`;
}

function layerText(layer: ChartLayerModel, t: number, percentMode: boolean, assetOpen: number): string | null {
  const point = nearestPointWithin(layer.points, t);
  if (!point || !Number.isFinite(point.usd)) return null;
  if (!percentMode) return formatUsd(point.usd);
  const base = layer.id === "benchmark" || layer.rebased === true ? layer.points[0]?.usd : assetOpen;
  if (base === undefined) return null;
  return changeFromOpen(base, point.usd)?.label ?? null;
}

/**
 * Y de la línea de costo promedio. null si el eje es porcentaje, si el valor
 * no es un precio positivo o si queda fuera del área visible del gráfico.
 */
function avgCostLineY(
  avgCostUsd: number | null | undefined,
  scale: PriceScale,
  percentMode: boolean,
): number | null {
  if (percentMode) return null;
  if (avgCostUsd === null || avgCostUsd === undefined) return null;
  if (!Number.isFinite(avgCostUsd) || avgCostUsd <= 0) return null;
  const y = yForPrice(avgCostUsd, scale);
  if (!Number.isFinite(y) || y < PAD_T || y > CHART_H - PAD_B) return null;
  return y;
}

/**
 * Máximo y mínimo del período. Sólo tiene sentido en una serie de precio real,
 * sin velas, sin eje porcentual y sin hover: ahí las etiquetas estorban.
 */
function priceExtremes(
  points: readonly DrawnPoint[],
  enabled: boolean,
): { high: DrawnPoint; low: DrawnPoint } | null {
  if (!enabled || points.length < 3) return null;
  let high: DrawnPoint | undefined;
  let low: DrawnPoint | undefined;
  for (const point of points) {
    if (!Number.isFinite(point.usd)) continue;
    if (!high || point.usd > high.usd) high = point;
    if (!low || point.usd < low.usd) low = point;
  }
  if (!high || !low || !(high.usd > low.usd)) return null;
  return { high, low };
}

/** Número con dos decimales y coma chilena: 2.45 → "2,45", 1023.45 → "1.023,45". */
function decimalCl(value: number): string {
  return Math.abs(value).toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Porcentaje ya expresado en puntos porcentuales. Cero va sin signo; el resto
 * lleva "+" o "-" explícito. Es el mismo formato del tooltip, pero sin el "+"
 * del cero que usa `changeFromOpen`.
 */
function signedPercentLabel(pct: number): string {
  if (!Number.isFinite(pct)) return "0,00%";
  const rounded = Math.round(pct * 100) / 100;
  if (rounded === 0) return "0,00%";
  return `${rounded > 0 ? "+" : "-"}${decimalCl(rounded)}%`;
}

/** Variación de `price` contra `base`, en el formato de la escala derecha. */
function percentAxisLabel(base: number, price: number): string | null {
  if (!Number.isFinite(base) || !(base > 0) || !Number.isFinite(price)) return null;
  const pct = ((price - base) * 100) / base;
  if (!Number.isFinite(pct)) return null;
  return signedPercentLabel(pct);
}

/**
 * Franja Q1–Q3 de la serie. `points[].p` ya viene proyectado a la escala del
 * modelo (precio o %), así que los cuartiles se ubican con `yForPrice` y se
 * devuelven como porcentaje de la altura del viewBox.
 */
function quartileBand(
  points: readonly DrawnPoint[],
  scale: PriceScale,
): { topPct: number; heightPct: number } | null {
  if (points.length < 3) return null;
  const values: number[] = [];
  for (const point of points) {
    if (Number.isFinite(point.p)) values.push(point.p);
  }
  if (values.length < 3) return null;
  values.sort((a, b) => a - b);
  const at = (q: number): number | null => {
    const pos = (values.length - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;
    const low = values[base];
    const high = values[Math.min(values.length - 1, base + 1)];
    if (low === undefined || high === undefined) return null;
    const value = low + (high - low) * rest;
    return Number.isFinite(value) ? value : null;
  };
  const upper = at(0.75);
  const lower = at(0.25);
  if (upper === null || lower === null || !(upper > lower)) return null;
  const yA = yForPrice(upper, scale);
  const yB = yForPrice(lower, scale);
  if (!Number.isFinite(yA) || !Number.isFinite(yB)) return null;
  const top = Math.max(0, Math.min(96, (Math.min(yA, yB) / CHART_H) * 100));
  const height = Math.max(2, Math.min(100 - top, (Math.abs(yB - yA) / CHART_H) * 100));
  return { topPct: top, heightPct: height };
}

function DrawnChart({
  points,
  line,
  area,
  stroke,
  tone,
  upColor,
  downColor,
  reference,
  label,
  gradId,
  onHover,
  layers,
  percentMode,
  candles,
  scale,
  avgCostUsd,
  periodAvgUsd,
  showGrid,
  axisMode,
  showRangeBand,
  lineMode,
  showExtremes,
  highlightedLayerId,
  onHighlightLayer,
}: {
  points: readonly DrawnPoint[];
  line: string;
  area: string;
  stroke: string;
  tone: ChartTone;
  upColor: string;
  downColor: string;
  reference: boolean;
  label: string;
  gradId: string;
  onHover: (usd: number | null, timeMs?: number | null) => void;
  layers: readonly ChartLayerModel[];
  percentMode: boolean;
  candles: readonly CandleMark[] | null;
  /** Escala Y del modelo: la misma que usó `buildChartModel` para ubicar la serie. */
  scale: PriceScale;
  avgCostUsd?: number | null;
  periodAvgUsd?: number | null;
  showGrid?: boolean;
  axisMode: "price" | "percent";
  showRangeBand: boolean;
  /** `chartStyle === "line"`: el SVG no dibuja el punto final, lo dibuja el beacon. */
  lineMode: boolean;
  /** Etiquetas Máx/Mín sobre la curva. */
  showExtremes: boolean;
  /** Serie enfocada (`"asset"` o `layer.id`). Sin foco no se difumina nada. */
  highlightedLayerId?: string | null;
  /** Avisa al padre qué curva quedó enfocada al pasar el cursor por ella. */
  onHighlightLayer?: (id: string | null) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const plotRef = useRef(points);
  const onHoverRef = useRef(onHover);
  const hoverRef = useRef<number | null>(null);
  const ignorePointerUntil = useRef(0);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [liveText, setLiveText] = useState("");
  const keyboardRef = useRef(false);

  useEffect(() => {
    plotRef.current = points;
    onHoverRef.current = onHover;
  }, [points, onHover]);

  useEffect(() => {
    return () => {
      onHoverRef.current(null, null);
    };
  }, []);

  const choose = (index: number | null) => {
    commitHover(index, plotRef.current, hoverRef, setHoverIndex, (usd, timeMs) => onHoverRef.current(usd, timeMs));
  };

  useEffect(() => {
    const node = svgRef.current;
    if (!node) return;
    return bindHorizontalScrub(
      node,
      () => plotRef.current,
      (index) => {
        commitHover(index, plotRef.current, hoverRef, setHoverIndex, (usd, timeMs) => onHoverRef.current(usd, timeMs));
      },
      () => {
        ignorePointerUntil.current = performance.now() + TOUCH_GHOST_MS;
      },
    );
  }, []);

  const hoverPoint = hoverIndex !== null && hoverIndex < points.length ? points[hoverIndex] : undefined;
  /** Foco de serie: `"asset"` o el `id` de una capa. Sin foco, nada se difumina. */
  const hasFocus = typeof highlightedLayerId === "string" && highlightedLayerId.length > 0;
  const assetFocused = !hasFocus || highlightedLayerId === "asset";
  const candleList = candles !== null && candles.length >= 2 ? candles : null;
  const avgY = avgCostLineY(avgCostUsd, scale, percentMode);
  const periodAvgY = avgCostLineY(periodAvgUsd, scale, percentMode);
  const lastPoint = points.length >= 2 ? points[points.length - 1] : undefined;
  const openPrice = points[0]?.usd;
  /** Eje en % sólo con un primer precio válido; si no, queda la escala de precio. */
  const axisPercent =
    axisMode === "percent" && openPrice !== undefined && Number.isFinite(openPrice) && openPrice > 0;
  /** Beacon del último precio: línea, serie quieta, sin velas y sin hover. */
  const showBeacon =
    lineMode && !reference && candleList === null && hoverPoint === undefined && lastPoint !== undefined;
  /** En 360px el tooltip no puede pegarse a los bordes: se mantiene al 22–78%. */
  const hoverLeft = hoverPoint ? Math.min(78, Math.max(22, (hoverPoint.x / CHART_W) * 100)) : 0;
  /** En móvil el tooltip se ancla al borde más cercano: 215px no caben a 360px. */
  const hoverOnRight = hoverPoint ? hoverPoint.x > CHART_W / 2 : false;
  const periodMove = hoverPoint && openPrice !== undefined ? changeFromOpen(openPrice, hoverPoint.usd) : null;
  const openY = openingPriceY(points);
  const rangeBand = showRangeBand ? quartileBand(points, scale) : null;
  const bandClass =
    tone === "down" ? "bg-down/10 border-down/25" : tone === "flat" ? "bg-fg/5 border-fg/15" : "bg-up/10 border-up/25";
  const beaconHaloClass = tone === "down" ? "bg-down/30" : tone === "flat" ? "bg-fg/25" : "bg-up/30";
  const beaconCoreClass = tone === "down" ? "bg-down" : tone === "flat" ? "bg-fg-muted" : "bg-up";
  const hints =
    hoverPoint && openPrice !== undefined
      ? layers.flatMap((layer) => {
          const text = layerText(layer, hoverPoint.t, percentMode, openPrice);
          if (!text || layer.label.length === 0) return [];
          return [{ id: layer.id, label: layer.label, text, color: layer.color }];
        })
      : [];

  const extremes = priceExtremes(
    points,
    showExtremes && !reference && !candleList && !percentMode && hoverPoint === undefined && points.length >= 3,
  );

  // Niveles de grilla horizontal cuando showGrid está activo (22%, 50% y 78% de la altura útil)
  const gridTicks =
    showGrid &&
    (!percentMode || axisMode === "percent") &&
    Number.isFinite(scale.hi) &&
    Number.isFinite(scale.lo) &&
    scale.hi > scale.lo
      ? ([0.22, 0.5, 0.78] as const).map((ratio) => {
          const price = scale.hi - (scale.hi - scale.lo) * ratio;
          const y = yForPrice(price, scale);
          const percentLabel = percentMode
            ? signedPercentLabel(price)
            : axisPercent && openPrice !== undefined
              ? percentAxisLabel(openPrice, price)
              : null;
          return { price, y, label: percentLabel ?? formatUsd(price) };
        })
      : null;

  const onMouseMove = (event: MouseEvent<SVGSVGElement>) => {
    if (performance.now() < ignorePointerUntil.current) return;
    const index = indexAt(event.clientX, event.currentTarget.getBoundingClientRect(), plotRef.current);
    if (index === null) return;
    choose(index);
  };

  const onMouseLeave = () => {
    if (performance.now() < ignorePointerUntil.current) return;
    if (keyboardRef.current && document.activeElement === svgRef.current) return;
    choose(null);
    // Al salir del lienzo se suelta cualquier foco de serie.
    onHighlightLayer?.(null);
  };

  const onKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    const key = event.key;
    if (key !== "ArrowLeft" && key !== "ArrowRight" && key !== "Home" && key !== "End") return;
    keyboardRef.current = true;
    event.preventDefault();
    const series = plotRef.current;
    const last = series.length - 1;
    if (last < 0) return;
    const current = hoverRef.current ?? last;
    const next =
      key === "ArrowLeft" ? Math.max(0, current - 1) : key === "ArrowRight" ? Math.min(last, current + 1) : key === "Home" ? 0 : last;
    choose(next);
    const point = series[next];
    if (!point) return;
    const open = series[0]?.usd;
    const move = open === undefined ? null : changeFromOpen(open, point.usd);
    setLiveText([hoverWhen(point.t), formatUsd(point.usd), move?.label].filter((part) => part && part.length > 0).join(", "));
  };

  return (
    <>
      {/* Franja de rango Q1–Q3: va antes del SVG para quedar debajo de la curva. */}
      {rangeBand ? (
        <div
          aria-hidden="true"
          data-chart-range-band="true"
          className={cn("pointer-events-none absolute inset-x-0 border-y border-dashed", bandClass)}
          style={{ top: `${rangeBand.topPct}%`, height: `${rangeBand.heightPct}%` }}
        />
      ) : null}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        preserveAspectRatio="none"
        role="slider"
        aria-orientation="horizontal"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={Math.max(0, points.length - 1)}
        aria-valuenow={hoverIndex ?? Math.max(0, points.length - 1)}
        aria-valuetext={hoverPoint ? [hoverWhen(hoverPoint.t), formatUsd(hoverPoint.usd), periodMove?.label].filter((part) => part && part.length > 0).join(", ") : label}
        tabIndex={0}
        data-points={points.length}
        data-reference={reference ? "true" : "false"}
        data-percent={percentMode ? "true" : "false"}
        data-axis={axisPercent ? "percent" : "price"}
        data-chart-style={candleList ? "candles" : undefined}
        className="absolute inset-0 h-full w-full touch-pan-y select-none outline-none focus:outline-none focus-visible:outline-none"
        style={{ touchAction: "pan-y", outline: "none" }}
        onMouseDown={() => {
          keyboardRef.current = false;
          setLiveText("");
        }}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        onKeyDown={onKeyDown}
        onBlur={() => {
          keyboardRef.current = false;
          setLiveText("");
          choose(null);
        }}
      >
        {reference || !area ? null : (
          <defs>
            <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity="0.22" />
              <stop offset="100%" stopColor={stroke} stopOpacity="0" />
            </linearGradient>
          </defs>
        )}
        {openY === null ? null : (
          <line
            x1={0}
            x2={CHART_W}
            y1={openY}
            y2={openY}
            stroke={OPEN_STROKE}
            strokeWidth="2"
            strokeDasharray={OPEN_DASH}
            vectorEffect="non-scaling-stroke"
          />
        )}
        {gridTicks
          ? gridTicks.map((tick, idx) => (
              <line
                key={idx}
                x1={0}
                x2={CHART_W}
                y1={tick.y}
                y2={tick.y}
                stroke="#e5e7eb"
                strokeWidth="1"
                strokeDasharray="2 4"
                vectorEffect="non-scaling-stroke"
              />
            ))
          : null}
        {candleList ? (
          <g data-candles={candleList.length}>
            {candleList.map((mark) => {
              const color = mark.up ? upColor : downColor;
              const top = Math.min(mark.yOpen, mark.yClose);
              const height = Math.max(1, Math.abs(mark.yClose - mark.yOpen));
              return (
                <g key={mark.t}>
                  <line
                    x1={mark.x}
                    x2={mark.x}
                    y1={mark.yHigh}
                    y2={mark.yLow}
                    stroke={color}
                    strokeWidth="1"
                    vectorEffect="non-scaling-stroke"
                  />
                  <rect
                    x={mark.x - mark.width / 2}
                    y={top}
                    width={mark.width}
                    height={height}
                    fill={color}
                    data-candle={mark.up ? "up" : "down"}
                  />
                </g>
              );
            })}
          </g>
        ) : (
          <>
            {reference || !area ? null : (
              <path
                d={area}
                fill={`url(#${gradId})`}
                opacity={hasFocus && !assetFocused ? 0.12 : undefined}
                className={hasFocus ? "transition-opacity duration-200" : undefined}
              />
            )}
            <path
              d={line}
              fill="none"
              stroke={stroke}
              strokeWidth={hasFocus ? (assetFocused ? "3" : "2.25") : "2.25"}
              opacity={hasFocus ? (assetFocused ? 1 : 0.18) : undefined}
              className={hasFocus ? "transition-opacity duration-200" : undefined}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={reference ? "4 4" : undefined}
              vectorEffect="non-scaling-stroke"
            />
          </>
        )}
        {layers.map((layer) => {
          const layerFocused = !hasFocus || highlightedLayerId === layer.id;
          return (
            <path
              key={layer.id}
              data-overlay={layer.id}
              d={layer.line}
              fill="none"
              stroke={graphicInk(layer.color)}
              strokeWidth={hasFocus ? (layerFocused ? 2.75 : layer.width) : layer.width}
              opacity={hasFocus ? (layerFocused ? 1 : 0.18) : undefined}
              className={hasFocus ? "transition-opacity duration-200" : undefined}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={layer.dash}
              vectorEffect="non-scaling-stroke"
              onMouseEnter={onHighlightLayer ? () => onHighlightLayer(layer.id) : undefined}
            />
          );
        })}
        {periodAvgY === null ? null : (
          <line
            data-period-avg="true"
            x1={0}
            x2={CHART_W}
            y1={periodAvgY}
            y2={periodAvgY}
            stroke="#2b7fd9"
            strokeWidth="1.5"
            strokeDasharray="4 4"
            opacity="0.75"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {avgY === null ? null : (
          <line
            data-avg-cost="true"
            x1={0}
            x2={CHART_W}
            y1={avgY}
            y2={avgY}
            stroke="var(--color-brand, #059669)"
            strokeDasharray="4 3"
            opacity="0.65"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {hoverPoint ? (
          <>
            <line
              x1={hoverPoint.x}
              x2={hoverPoint.x}
              y1={PAD_T}
              y2={CHART_H - PAD_B}
              stroke={GUIDE_STROKE}
              vectorEffect="non-scaling-stroke"
            />
            {/* Cruz del hover: la guía vertical de siempre más su horizontal. */}
            <line
              x1={0}
              x2={CHART_W}
              y1={hoverPoint.y}
              y2={hoverPoint.y}
              stroke={GUIDE_STROKE}
              strokeDasharray="2 3"
              vectorEffect="non-scaling-stroke"
            />
          </>
        ) : null}
      </svg>
      {/* Escala lateral derecha de precios cuando showGrid está activo */}
      {gridTicks && hoverPoint === undefined ? (
        <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-1.5 flex flex-col justify-between py-3">
          {gridTicks.map((tick, idx) => (
            <span
              key={idx}
              className="num rounded bg-bg/95 px-1 py-0.5 text-[11px] leading-4 font-medium text-fg-muted"
              style={{
                position: "absolute",
                right: 0,
                top: `${(tick.y / CHART_H) * 100}%`,
                transform: "translateY(-50%)",
              }}
            >
              {tick.label}
            </span>
          ))}
        </div>
      ) : null}
      {/* Etiqueta flotante del promedio del período si está activo */}
      {periodAvgY !== null && periodAvgUsd && hoverPoint === undefined ? (
        <span
          aria-hidden="true"
          className="num pointer-events-none absolute left-2 -translate-y-1/2 rounded-full bg-[#2b7fd9]/10 px-2 py-0.5 text-[10px] font-semibold text-[#2b7fd9] ring-1 ring-[#2b7fd9]/25 backdrop-blur-xs"
          style={{ top: `${(periodAvgY / CHART_H) * 100}%` }}
        >
          Prom. {formatUsd(periodAvgUsd)}
        </span>
      ) : null}
      {/* Beacon del último precio: halo del tono, fuera del SVG, sólo en línea y sin hover. */}
      {showBeacon && lastPoint ? (
        <span
          aria-hidden="true"
          data-chart-beacon="true"
          className="pointer-events-none absolute z-[1] size-2 -translate-x-1/2 -translate-y-1/2"
          style={{
            left: `${(lastPoint.x / CHART_W) * 100}%`,
            top: `${(lastPoint.y / CHART_H) * 100}%`,
          }}
        >
          <span className={cn("absolute -inset-2 rounded-full motion-safe:animate-ping", beaconHaloClass)} />
          <span className={cn("absolute -inset-1 rounded-full opacity-60", beaconHaloClass)} />
          <span className={cn("absolute inset-0 rounded-full ring-2 ring-bg", beaconCoreClass)} />
        </span>
      ) : null}
      {extremes ? (
        <>
          <span
            aria-hidden="true"
            data-chart-extreme="high"
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-full bg-bg/95 px-2 py-0.5 text-[11px] leading-4 font-medium text-fg ring-1 ring-border num"
            style={{
              left: `${Math.min(86, Math.max(14, (extremes.high.x / CHART_W) * 100))}%`,
              top: `${Math.max(4, (extremes.high.y / CHART_H) * 100 - 6)}%`,
            }}
          >
            Máx {formatUsd(extremes.high.usd)}
          </span>
          <span
            aria-hidden="true"
            data-chart-extreme="low"
            className="pointer-events-none absolute -translate-x-1/2 rounded-full bg-bg/95 px-2 py-0.5 text-[11px] leading-4 font-medium text-fg-muted ring-1 ring-border num"
            style={{
              left: `${Math.min(86, Math.max(14, (extremes.low.x / CHART_W) * 100))}%`,
              top: `${Math.min(92, (extremes.low.y / CHART_H) * 100 + 6)}%`,
            }}
          >
            Mín {formatUsd(extremes.low.usd)}
          </span>
        </>
      ) : null}
      {hoverPoint ? (
        <>
          <span
            className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-bg"
            style={{
              left: `${(hoverPoint.x / CHART_W) * 100}%`,
              top: `${(hoverPoint.y / CHART_H) * 100}%`,
              background: stroke,
            }}
          />
          <div
            className={cn(
              "pointer-events-none absolute top-0 z-10 max-w-[calc(100%-1rem)] rounded-xl bg-fg px-3 py-2 text-xs text-bg sm:max-w-[215px] sm:left-[var(--chart-hover-left)] sm:-translate-x-1/2",
              hoverOnRight ? "right-2 sm:right-auto" : "left-2",
            )}
            style={{ "--chart-hover-left": `${hoverLeft}%` } as CSSProperties}
          >
            {reference ? <p>Referencia</p> : null}
            <p className="opacity-70">{hoverWhen(hoverPoint.t)}</p>
            <p className="num font-medium">{formatUsd(hoverPoint.usd)}</p>
            {periodMove ? <p className="num font-medium text-bg">{periodMove.label}</p> : null}
            {hints.map((hint) => {
              // Con una serie enfocada, la fila de las demás se atenúa.
              const dim = hasFocus && highlightedLayerId !== hint.id;
              return (
                <p key={hint.id} className={cn("num flex items-center gap-1.5", dim && "opacity-45")}>
                  <span
                    aria-hidden="true"
                    className="size-2 shrink-0 rounded-full"
                    style={{ background: hint.color }}
                  />
                  <span className="opacity-70">{hint.label}</span>
                  <span>{hint.text}</span>
                </p>
              );
            })}
          </div>
        </>
      ) : null}
      <p className="sr-only" aria-live="polite">
        {liveText}
      </p>
    </>
  );
}

function VolumeStrip({ marks, label }: { marks: readonly VolumeMark[]; label: string }) {
  return (
    <div className="relative mt-2 h-10 w-full">
      <svg
        viewBox={`0 0 ${CHART_W} ${VOLUME_H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={label}
        data-volume="true"
        className="absolute inset-0 h-full w-full"
      >
        {marks.map((mark) => (
          <rect
            key={mark.t}
            x={mark.x - mark.width / 2}
            y={mark.y}
            width={mark.width}
            height={Math.max(mark.height, 0)}
            fill="var(--color-fg-muted, #6c6f75)"
            opacity="0.45"
          />
        ))}
      </svg>
    </div>
  );
}

function SvgPriceChartBase({
  points,
  tone,
  label,
  emptyLabel,
  emptyHint,
  onHover,
  livePoint,
  quiet = false,
  reference = false,
  overlays,
  benchmark = null,
  chartStyle = "line",
  showVolume = false,
  volumeLabel = "",
  avgCostUsd = null,
  periodAvgUsd = null,
  showGrid = false,
  axisMode = "price",
  showRangeBand = false,
  heightClassName,
  showExtremes = true,
  highlightedLayerId = null,
  onHighlightLayer,
  onToggleFullscreen,
  isFullscreen = false,
}: PriceChartProps) {
  const gradRaw = useId().replace(/:/g, "");
  const gradId = `svg-price-${gradRaw}`;
  const model = useMemo(() => {
    const rows = toRows(points, livePoint);
    const first = rows[0];
    const last = rows[rows.length - 1];
    const ohlc =
      chartStyle === "candles" && first && last
        ? readOhlc(points).filter((bar) => bar.t >= first.t && bar.t <= last.t)
        : [];
    const extra = ohlc.length >= 2 ? ohlc.flatMap((bar) => [bar.o, bar.h, bar.l, bar.c]) : undefined;
    const built = buildChartModel(rows, overlays ?? EMPTY_OVERLAYS, benchmark, extra);
    if (!built || !first || !last) return null;
    const candles =
      extra !== undefined ? candleMarks(ohlc, first.t, last.t, built.scale, built.percentMode, first.p) : null;
    const candleMode = candles !== null && candles.length >= 2;
    const volume = showVolume
      ? volumeMarks(
          readVolume(points).filter((row) => row.t >= first.t && row.t <= last.t),
          first.t,
          last.t,
        )
      : null;
    return {
      ...built,
      key: historyKey(points),
      area: built.percentMode || candleMode ? "" : areaUnder(built.line, built.points),
      candles: candleMode ? candles : null,
      volume,
    };
  }, [points, livePoint, overlays, benchmark, chartStyle, showVolume]);
  const drawn = model !== null && model.points.length >= 2;
  const stroke = reference ? REFERENCE_STROKE : TONE_STROKE[tone];
  const upColor = reference ? REFERENCE_STROKE : TONE_STROKE.up;
  const downColor = reference ? REFERENCE_STROKE : TONE_STROKE.down;

  return (
    <>
    <div
      className={cn("group/chart relative w-full touch-pan-y", heightClassName ?? "h-56 sm:h-64")}
      style={{ touchAction: "pan-y" }}
      data-tone={tone}
    >
      {drawn && model ? (
        <DrawnChart
          key={`${model.key}:${model.percentMode ? "pct" : "px"}:${model.candles ? "candles" : "line"}:${model.layers.map((layer) => layer.id).join(".")}`}
          points={model.points}
          line={model.line}
          area={model.area}
          stroke={stroke}
          tone={tone}
          upColor={upColor}
          downColor={downColor}
          reference={reference}
          label={label}
          gradId={gradId}
          onHover={onHover}
          layers={model.layers}
          percentMode={model.percentMode}
          candles={model.candles}
          scale={model.scale}
          avgCostUsd={avgCostUsd}
          periodAvgUsd={periodAvgUsd}
          showGrid={showGrid}
          axisMode={axisMode}
          showRangeBand={showRangeBand}
          lineMode={chartStyle === "line"}
          showExtremes={showExtremes}
          highlightedLayerId={highlightedLayerId}
          onHighlightLayer={onHighlightLayer}
        />
      ) : quiet ? null : (
        <div className="absolute inset-0 flex flex-col items-center justify-center rounded-xl bg-surface-1 px-4 text-center">
          <p className="text-[15px] font-medium text-fg">{emptyLabel}</p>
          {emptyHint ? <p className="mt-1 max-w-sm text-[13px] text-fg-muted">{emptyHint}</p> : null}
        </div>
      )}
      {/* Pantalla completa: fuera del SVG. En celular se ve siempre; en escritorio, al pasar el cursor. */}
      {onToggleFullscreen && !quiet && drawn && model ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleFullscreen?.();
          }}
          aria-label={isFullscreen ? "Salir de pantalla completa" : "Pantalla completa"}
          title={isFullscreen ? "Salir de pantalla completa (Esc)" : "Expandir a pantalla completa"}
          className="absolute right-2.5 top-2.5 z-20 inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-full border border-border bg-bg/95 px-2.5 py-1.5 text-xs font-medium text-fg transition-colors duration-150 sm:min-h-8 sm:min-w-8 sm:opacity-0 sm:group-hover/chart:opacity-100 focus-visible:opacity-100 hover:border-fg hover:bg-fg hover:text-bg outline-none"
        >
          {isFullscreen ? (
            <svg
              viewBox="0 0 16 16"
              fill="none"
              className="size-3.5 shrink-0"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M6 2v4H2M10 2v4h4M6 14v-4H2M10 14v-4h4" />
            </svg>
          ) : (
            <svg
              viewBox="0 0 16 16"
              fill="none"
              className="size-3.5 shrink-0"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M10 2h4v4M6 14H2v-4M14 2L9.5 6.5M2 14l4.5-4.5" />
            </svg>
          )}
          <span className="hidden sm:inline">{isFullscreen ? "Salir" : "Pantalla completa"}</span>
        </button>
      ) : null}
    </div>
    {drawn && model?.volume && model.volume.length >= 2 ? (
      <VolumeStrip marks={model.volume} label={volumeLabel} />
    ) : null}
    </>
  );
}

export const SvgPriceChart = memo(SvgPriceChartBase);
