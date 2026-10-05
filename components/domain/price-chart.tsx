"use client";

import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { IChartApi, ISeriesApi, MouseEventParams, Time, UTCTimestamp } from "lightweight-charts";

import type { ChartTone } from "@/lib/market/series";
import type { PricePoint } from "@/lib/types";
import { cn } from "@/lib/cn";

const PALETTE: Record<ChartTone, { line: string; top: string; bottom: string }> = {
  up: { line: "#1c7c5b", top: "rgba(28, 124, 91, 0.28)", bottom: "rgba(28, 124, 91, 0)" },
  down: { line: "#cc2c55", top: "rgba(204, 44, 85, 0.22)", bottom: "rgba(204, 44, 85, 0)" },
  flat: { line: "#6c6f75", top: "rgba(108, 111, 117, 0.22)", bottom: "rgba(108, 111, 117, 0)" },
};

type AreaPoint = { time: UTCTimestamp; value: number };
type ChartBundle = { chart: IChartApi; series: ISeriesApi<"Area", Time> };

function toAreaData(points: readonly PricePoint[]): AreaPoint[] {
  const sorted = [...points].sort((a, b) => a.t - b.t);
  const rows: AreaPoint[] = [];
  let last = -1;
  for (const point of sorted) {
    if (!Number.isFinite(point.t) || !Number.isFinite(point.p)) continue;
    const time = Math.floor(point.t / 1000);
    if (time <= last) continue;
    last = time;
    rows.push({ time: time as UTCTimestamp, value: point.p });
  }
  return rows;
}

function rowsKey(rows: readonly AreaPoint[]): string {
  if (rows.length === 0) return "0";
  const first = rows[0];
  const last = rows[rows.length - 1];
  if (!first || !last) return "0";
  return `${rows.length}:${first.time}:${last.time}:${last.value}`;
}

function readValue(data: unknown): number | null {
  if (!data || typeof data !== "object" || !("value" in data)) return null;
  const value = data.value;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function timeToMs(time: Time | undefined): number | null {
  if (time === undefined) return null;
  if (typeof time === "number") return Number.isFinite(time) ? time * 1000 : null;
  if (typeof time === "string") {
    const parsed = Date.parse(time);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (Number.isFinite(time.year) && Number.isFinite(time.month) && Number.isFinite(time.day)) {
    return Date.UTC(time.year, time.month - 1, time.day);
  }
  return null;
}

function timeToSeconds(time: Time): number | null {
  const ms = timeToMs(time);
  return ms === null ? null : Math.floor(ms / 1000);
}

function nearestRow(rows: readonly AreaPoint[], seconds: number): AreaPoint | null {
  if (rows.length === 0) return null;
  let low = 0;
  let high = rows.length - 1;
  while (low < high) {
    const mid = (low + high) >> 1;
    const row = rows[mid];
    if (!row || row.time < seconds) low = mid + 1;
    else high = mid;
  }
  const next = rows[low];
  const prev = rows[low - 1];
  if (!next) return prev ?? null;
  if (!prev) return next;
  return seconds - prev.time <= next.time - seconds ? prev : next;
}

function allowVerticalScroll(root: HTMLElement) {
  root.style.touchAction = "pan-y";
  root.querySelectorAll<HTMLElement>("canvas, table, td, tr").forEach((node) => {
    node.style.touchAction = "pan-y";
  });
}

/**
 * El arrastre vertical sigue siendo de la página.
 * Sólo un gesto claramente horizontal elige un punto del historial.
 */
function bindTouchScrub(
  root: HTMLElement,
  getChart: () => ChartBundle | null,
  getRows: () => readonly AreaPoint[],
  onPoint: (usd: number | null, timeMs: number | null) => void,
  onTouch: () => void,
) {
  let startX = 0;
  let startY = 0;
  let mode: "idle" | "scroll" | "scrub" = "idle";
  let gesture = 0;
  let clearTimer = 0;

  const releasePoint = () => {
    getChart()?.chart.clearCrosshairPosition();
    onPoint(null, null);
  };

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
      if (dx < 8 && dy < 8) return;
      mode = dy * 2 >= dx ? "scroll" : "scrub";
    }
    if (mode !== "scrub") return;
    if (event.cancelable) event.preventDefault();

    const bundle = getChart();
    if (!bundle) return;
    const canvas = root.querySelector("canvas");
    const rect = (canvas ?? root).getBoundingClientRect();
    const x = touch.clientX - rect.left;
    if (x < 0 || x > rect.width) return;
    const raw = bundle.chart.timeScale().coordinateToTime(x);
    if (raw === null) return;
    const seconds = timeToSeconds(raw);
    if (seconds === null) return;
    const row = nearestRow(getRows(), seconds);
    if (!row) return;
    bundle.chart.setCrosshairPosition(row.value, row.time, bundle.series);
    onPoint(row.value, row.time * 1000);
  };

  const end = () => {
    onTouch();
    const scrubbed = mode === "scrub";
    const id = gesture;
    mode = "idle";
    if (!scrubbed) return;
    releasePoint();
    // El navegador puede soltar un mouse fantasma después del dedo y volver a pintar el punto.
    clearTimer = window.setTimeout(() => {
      if (gesture !== id) return;
      releasePoint();
    }, 400);
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

function PriceChartBase({
  points,
  tone,
  label,
  emptyLabel,
  errorLabel,
  onHover,
  quiet = false,
}: {
  points: readonly PricePoint[];
  tone: ChartTone;
  label: string;
  emptyLabel: string;
  errorLabel: string;
  onHover: (usd: number | null, timeMs?: number | null) => void;
  /** El padre tapa el gráfico (carga o error) y anuncia ese estado. */
  quiet?: boolean;
}) {
  const rows = useMemo(() => toAreaData(points), [points]);
  const key = rowsKey(rows);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ChartBundle | null>(null);
  const rowsRef = useRef(rows);
  const toneRef = useRef(tone);
  const onHoverRef = useRef(onHover);
  const [ready, setReady] = useState(false);
  const [failure, setFailure] = useState(false);
  const drawn = !failure && rows.length >= 2;

  useLayoutEffect(() => {
    rowsRef.current = rows;
    toneRef.current = tone;
  }, [rows, tone]);

  useEffect(() => {
    onHoverRef.current = onHover;
  }, [onHover]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    let alive = true;

    let ignorePointerUntil = 0;
    const onMove = (param: MouseEventParams<Time>) => {
      if (performance.now() < ignorePointerUntil) return;
      const series = chartRef.current?.series;
      if (!series || !param.point || param.time === undefined) {
        onHoverRef.current(null, null);
        return;
      }
      const usd = readValue(param.seriesData.get(series));
      const timeMs = timeToMs(param.time);
      if (usd === null || timeMs === null) {
        onHoverRef.current(null, null);
        return;
      }
      onHoverRef.current(usd, timeMs);
    };

    const detachTouch = bindTouchScrub(
      node,
      () => chartRef.current,
      () => rowsRef.current,
      (usd, timeMs) => onHoverRef.current(usd, timeMs),
      () => {
        ignorePointerUntil = performance.now() + 700;
      },
    );

    void import("lightweight-charts")
      .then((charts) => {
        if (!alive || containerRef.current !== node) return;
        const palette = PALETTE[toneRef.current];
        const mono = getComputedStyle(document.documentElement).getPropertyValue("--font-mono").trim();
        const fontFamily =
          mono.length > 0 && !mono.includes("var(") ? mono : "ui-monospace, SFMono-Regular, Menlo, monospace";
        const created = charts.createChart(node, {
          autoSize: true,
          layout: {
            background: { type: charts.ColorType.Solid, color: "transparent" },
            textColor: "#6c6f75",
            fontFamily,
            fontSize: 12,
            attributionLogo: true,
          },
          grid: {
            vertLines: { visible: false },
            horzLines: { visible: false },
          },
          rightPriceScale: { borderVisible: false },
          timeScale: { borderVisible: false, fixLeftEdge: true, fixRightEdge: true },
          crosshair: {
            mode: charts.CrosshairMode.Magnet,
            vertLine: {
              color: "#d5dae3",
              width: 1,
              style: charts.LineStyle.Dashed,
              visible: true,
              labelVisible: false,
            },
            horzLine: {
              color: "#d5dae3",
              width: 1,
              style: charts.LineStyle.Dashed,
              visible: true,
              labelVisible: false,
            },
          },
          handleScroll: {
            mouseWheel: false,
            pressedMouseMove: false,
            horzTouchDrag: false,
            vertTouchDrag: false,
          },
          handleScale: {
            mouseWheel: false,
            pinch: false,
            axisPressedMouseMove: false,
            axisDoubleClickReset: false,
          },
          kineticScroll: { mouse: false, touch: false },
          trackingMode: { exitMode: charts.TrackingModeExitMode.OnTouchEnd },
          localization: { locale: document.documentElement.lang || "es-CL" },
        });
        const series = created.addSeries(charts.AreaSeries, {
          lineColor: palette.line,
          topColor: palette.top,
          bottomColor: palette.bottom,
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerRadius: 4,
          crosshairMarkerBorderWidth: 2,
          crosshairMarkerBorderColor: "#ffffff",
          crosshairMarkerBackgroundColor: palette.line,
        });
        const next = rowsRef.current;
        series.setData(next);
        if (next.length > 1) created.timeScale().fitContent();
        created.subscribeCrosshairMove(onMove);
        chartRef.current = { chart: created, series };
        allowVerticalScroll(node);
        if (!alive) {
          created.unsubscribeCrosshairMove(onMove);
          created.remove();
          chartRef.current = null;
          return;
        }
        setReady(true);
      })
      .catch(() => {
        if (alive) setFailure(true);
      });

    return () => {
      alive = false;
      detachTouch();
      const current = chartRef.current;
      if (!current) return;
      current.chart.unsubscribeCrosshairMove(onMove);
      current.chart.remove();
      chartRef.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    const bundle = chartRef.current;
    if (!bundle || !ready) return;
    const next = rowsRef.current;
    bundle.series.setData(next);
    bundle.chart.clearCrosshairPosition();
    onHoverRef.current(null, null);
    if (next.length > 1) bundle.chart.timeScale().fitContent();
  }, [key, ready]);

  useLayoutEffect(() => {
    const bundle = chartRef.current;
    if (!bundle || !ready) return;
    const palette = PALETTE[tone];
    bundle.series.applyOptions({
      lineColor: palette.line,
      topColor: palette.top,
      bottomColor: palette.bottom,
      crosshairMarkerBackgroundColor: palette.line,
    });
  }, [tone, ready]);

  return (
    <div className="relative h-56 w-full lg:h-72">
      <div
        ref={containerRef}
        role={drawn && !quiet ? "img" : undefined}
        aria-label={drawn && !quiet ? label : undefined}
        aria-hidden={drawn && !quiet ? undefined : true}
        data-tone={tone}
        data-points={rows.length}
        className={cn("absolute inset-0 touch-pan-y overflow-hidden [&_canvas]:touch-pan-y", !drawn && "invisible")}
      />
      {failure ? (
        <p className="absolute inset-0 flex items-center text-sm text-fg-muted">{errorLabel}</p>
      ) : quiet || drawn ? null : (
        <p className="absolute inset-0 flex items-center text-sm text-fg-muted">{emptyLabel}</p>
      )}
    </div>
  );
}

export const PriceChart = memo(PriceChartBase);
