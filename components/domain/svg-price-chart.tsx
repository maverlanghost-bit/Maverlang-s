"use client";

import { memo, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";

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
  type CandleMark,
  type ChartBenchmark,
  type ChartLayerModel,
  type ChartOverlay,
  type PlottedPoint,
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
  const base = layer.id === "benchmark" ? layer.points[0]?.usd : assetOpen;
  if (base === undefined) return null;
  return changeFromOpen(base, point.usd)?.label ?? null;
}

function DrawnChart({
  points,
  line,
  area,
  stroke,
  upColor,
  downColor,
  reference,
  label,
  gradId,
  onHover,
  layers,
  percentMode,
  candles,
}: {
  points: readonly DrawnPoint[];
  line: string;
  area: string;
  stroke: string;
  upColor: string;
  downColor: string;
  reference: boolean;
  label: string;
  gradId: string;
  onHover: (usd: number | null, timeMs?: number | null) => void;
  layers: readonly ChartLayerModel[];
  percentMode: boolean;
  candles: readonly CandleMark[] | null;
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
  const candleList = candles !== null && candles.length >= 2 ? candles : null;
  const hoverLeft = hoverPoint ? Math.min(85, Math.max(15, (hoverPoint.x / CHART_W) * 100)) : 0;
  const openPrice = points[0]?.usd;
  const periodMove = hoverPoint && openPrice !== undefined ? changeFromOpen(openPrice, hoverPoint.usd) : null;
  const openY = openingPriceY(points);
  const hints =
    hoverPoint && openPrice !== undefined
      ? layers.flatMap((layer) => {
          const text = layerText(layer, hoverPoint.t, percentMode, openPrice);
          if (!text || layer.label.length === 0) return [];
          return [{ id: layer.id, label: layer.label, text }];
        })
      : [];

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
        data-chart-style={candleList ? "candles" : undefined}
        className="absolute inset-0 h-full w-full touch-pan-y"
        style={{ touchAction: "pan-y" }}
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
            {reference || !area ? null : <path d={area} fill={`url(#${gradId})`} />}
            <path
              d={line}
              fill="none"
              stroke={stroke}
              strokeWidth="2.25"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={reference ? "4 4" : undefined}
              vectorEffect="non-scaling-stroke"
            />
          </>
        )}
        {layers.map((layer) => (
          <path
            key={layer.id}
            data-overlay={layer.id}
            d={layer.line}
            fill="none"
            stroke={graphicInk(layer.color)}
            strokeWidth={layer.width}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={layer.dash}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {hoverPoint ? (
          <line
            x1={hoverPoint.x}
            x2={hoverPoint.x}
            y1={PAD_T}
            y2={CHART_H - PAD_B}
            stroke={GUIDE_STROKE}
            vectorEffect="non-scaling-stroke"
          />
        ) : null}
      </svg>
      {hoverPoint ? (
        <>
          <span
            className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
            style={{
              left: `${(hoverPoint.x / CHART_W) * 100}%`,
              top: `${(hoverPoint.y / CHART_H) * 100}%`,
              background: stroke,
            }}
          />
          <div
            className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-xl bg-fg px-3 py-2 text-xs text-bg shadow-float"
            style={{ left: `${hoverLeft}%` }}
          >
            {reference ? <p>Referencia</p> : null}
            <p className="opacity-70">{hoverWhen(hoverPoint.t)}</p>
            <p className="num font-medium">{formatUsd(hoverPoint.usd)}</p>
            {periodMove ? <p className="num font-medium text-bg">{periodMove.label}</p> : null}
            {hints.map((hint) => (
              <p key={hint.id} className="num">
                <span className="opacity-70">{hint.label} </span>
                {hint.text}
              </p>
            ))}
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
    <div className="relative h-56 w-full touch-pan-y sm:h-64" style={{ touchAction: "pan-y" }} data-tone={tone}>
      {drawn && model ? (
        <DrawnChart
          key={`${model.key}:${model.percentMode ? "pct" : "px"}:${model.candles ? "candles" : "line"}:${model.layers.map((layer) => layer.id).join(".")}`}
          points={model.points}
          line={model.line}
          area={model.area}
          stroke={stroke}
          upColor={upColor}
          downColor={downColor}
          reference={reference}
          label={label}
          gradId={gradId}
          onHover={onHover}
          layers={model.layers}
          percentMode={model.percentMode}
          candles={model.candles}
        />
      ) : quiet ? null : (
        <div className="absolute inset-0 flex flex-col items-center justify-center rounded-xl bg-neutral-50 px-4 text-center">
          <p className="text-[15px] font-medium text-fg">{emptyLabel}</p>
          {emptyHint ? <p className="mt-1 max-w-sm text-[13px] text-fg-muted">{emptyHint}</p> : null}
        </div>
      )}
    </div>
    {drawn && model?.volume && model.volume.length >= 2 ? (
      <VolumeStrip marks={model.volume} label={volumeLabel} />
    ) : null}
    </>
  );
}

export const SvgPriceChart = memo(SvgPriceChartBase);
