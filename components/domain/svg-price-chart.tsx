"use client";

import { memo, useEffect, useId, useMemo, useRef, useState, type MouseEvent } from "react";

import { formatDateTime, formatUsd } from "@/lib/format";
import {
  CHART_H,
  CHART_W,
  PAD_B,
  PAD_T,
  plotSeries,
  smoothPath,
  toRows,
  type PlottedPoint,
} from "@/lib/market/chart-geometry";
import type { ChartTone } from "@/lib/market/series";
import type { PricePoint } from "@/lib/types";

const TONE_STROKE: Record<ChartTone, string> = {
  up: "var(--color-up, #0f7a32)",
  down: "var(--color-down, #c81e1e)",
  flat: "var(--color-fg-muted, #6c6f75)",
};

const REFERENCE_STROKE = "#a3a3a3";
const GUIDE_STROKE = "#d4d4d4";
const SCRUB_SLOP_PX = 8;
const TOUCH_GHOST_MS = 700;
const TOUCH_RELEASE_MS = 400;

export interface PriceChartProps {
  points: readonly PricePoint[];
  tone: ChartTone;
  label: string;
  emptyLabel: string;
  /**
   * El contrato de PriceChart lo sigue pidiendo. El SVG no carga una
   * librería, así que no hay un fallo de import que mostrar.
   */
  errorLabel: string;
  onHover: (usd: number | null, timeMs?: number | null) => void;
  /** Polling del detalle. Se agrega al final sólo si `t` es posterior al último punto. */
  livePoint?: PricePoint;
  /** El padre tapa el gráfico (carga o error) y anuncia ese estado. */
  quiet?: boolean;
  /** Serie de referencia, no es un precio real: línea gris punteada, sin gradiente. */
  reference?: boolean;
}

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
  points: readonly PlottedPoint[],
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
  onHover(point.p, point.t);
}

function historyKey(points: readonly PricePoint[]): string {
  const rows = toRows(points);
  const first = rows[0];
  const last = rows[rows.length - 1];
  if (!first || !last) return "0";
  return `${rows.length}:${first.t}:${last.t}:${last.p}`;
}

function DrawnChart({
  points,
  line,
  area,
  stroke,
  reference,
  label,
  gradId,
  onHover,
}: {
  points: readonly PlottedPoint[];
  line: string;
  area: string;
  stroke: string;
  reference: boolean;
  label: string;
  gradId: string;
  onHover: (usd: number | null, timeMs?: number | null) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const plotRef = useRef(points);
  const onHoverRef = useRef(onHover);
  const hoverRef = useRef<number | null>(null);
  const ignorePointerUntil = useRef(0);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

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
  const hoverLeft = hoverPoint ? Math.min(85, Math.max(15, (hoverPoint.x / CHART_W) * 100)) : 0;

  const onMouseMove = (event: MouseEvent<SVGSVGElement>) => {
    if (performance.now() < ignorePointerUntil.current) return;
    const index = indexAt(event.clientX, event.currentTarget.getBoundingClientRect(), plotRef.current);
    if (index === null) return;
    choose(index);
  };

  const onMouseLeave = () => {
    if (performance.now() < ignorePointerUntil.current) return;
    choose(null);
  };

  return (
    <>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={label}
        focusable="false"
        data-points={points.length}
        data-reference={reference ? "true" : "false"}
        className="absolute inset-0 h-full w-full touch-pan-y"
        style={{ touchAction: "pan-y" }}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
      >
        {reference ? null : (
          <defs>
            <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity="0.22" />
              <stop offset="100%" stopColor={stroke} stopOpacity="0" />
            </linearGradient>
          </defs>
        )}
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
            <p className="num font-medium">{formatUsd(hoverPoint.p)}</p>
          </div>
        </>
      ) : null}
    </>
  );
}

function SvgPriceChartBase({
  points,
  tone,
  label,
  emptyLabel,
  onHover,
  livePoint,
  quiet = false,
  reference = false,
}: PriceChartProps) {
  const gradRaw = useId().replace(/:/g, "");
  const gradId = `svg-price-${gradRaw}`;
  const model = useMemo(() => {
    const rows = toRows(points, livePoint);
    const plot = plotSeries(rows);
    const line = plot ? smoothPath(plot.points) : "";
    return {
      key: historyKey(points),
      plot,
      line,
      area: plot ? areaUnder(line, plot.points) : "",
    };
  }, [points, livePoint]);
  const drawn = model.plot !== null && model.plot.points.length >= 2;
  const stroke = reference ? REFERENCE_STROKE : TONE_STROKE[tone];

  return (
    <div className="relative h-56 w-full touch-pan-y lg:h-72" style={{ touchAction: "pan-y" }} data-tone={tone}>
      {drawn && model.plot ? (
        <DrawnChart
          key={model.key}
          points={model.plot.points}
          line={model.line}
          area={model.area}
          stroke={stroke}
          reference={reference}
          label={label}
          gradId={gradId}
          onHover={onHover}
        />
      ) : quiet ? null : (
        <p className="absolute inset-0 flex items-center text-sm text-fg-muted">{emptyLabel}</p>
      )}
    </div>
  );
}

export const SvgPriceChart = memo(SvgPriceChartBase);
