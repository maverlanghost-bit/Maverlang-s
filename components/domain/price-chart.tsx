"use client";

import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEventParams, UTCTimestamp } from "lightweight-charts";

import type { ChartTone } from "@/lib/market/series";
import type { PricePoint } from "@/lib/types";

const PALETTE: Record<ChartTone, { line: string; top: string; bottom: string }> = {
  up: { line: "#1c7c5b", top: "rgba(28, 124, 91, 0.28)", bottom: "rgba(28, 124, 91, 0)" },
  down: { line: "#cc2c55", top: "rgba(204, 44, 85, 0.22)", bottom: "rgba(204, 44, 85, 0)" },
  flat: { line: "#6c6f75", top: "rgba(108, 111, 117, 0.22)", bottom: "rgba(108, 111, 117, 0)" },
};

function toAreaData(points: readonly PricePoint[]): { time: UTCTimestamp; value: number }[] {
  const sorted = [...points].sort((a, b) => a.t - b.t);
  const rows: { time: UTCTimestamp; value: number }[] = [];
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

function readValue(data: unknown): number | null {
  if (!data || typeof data !== "object" || !("value" in data)) return null;
  const value = data.value;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function PriceChartBase({
  points,
  tone,
  label,
  emptyLabel,
  errorLabel,
  onHover,
}: {
  points: readonly PricePoint[];
  tone: ChartTone;
  label: string;
  emptyLabel: string;
  errorLabel: string;
  onHover: (usd: number | null) => void;
}) {
  const data = useMemo(() => toAreaData(points), [points]);
  const containerRef = useRef<HTMLDivElement>(null);
  const onHoverRef = useRef(onHover);
  const [failure, setFailure] = useState<string | null>(null);
  const attempt = `${tone}:${data.length}:${data[0]?.time ?? 0}:${data[data.length - 1]?.time ?? 0}`;

  useEffect(() => {
    onHoverRef.current = onHover;
  }, [onHover]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node || data.length < 2) return;
    let alive = true;
    let chart: { remove: () => void } | null = null;

    void import("lightweight-charts")
      .then((charts) => {
        if (!alive || containerRef.current !== node) return;
        const palette = PALETTE[tone];
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
            vertLine: { color: "#d5dae3", width: 1, labelVisible: false },
            horzLine: { color: "#d5dae3", width: 1, labelVisible: false },
          },
          handleScroll: {
            mouseWheel: false,
            pressedMouseMove: false,
            horzTouchDrag: false,
            vertTouchDrag: false,
          },
          handleScale: false,
          localization: { locale: document.documentElement.lang || "es-CL" },
        });
        chart = created;
        if (!alive) {
          created.remove();
          chart = null;
          return;
        }
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
        series.setData(data);
        created.timeScale().fitContent();
        const onMove = (param: MouseEventParams) => {
          if (!param.point) {
            onHoverRef.current(null);
            return;
          }
          onHoverRef.current(readValue((param.seriesData as Map<unknown, unknown>).get(series)));
        };
        created.subscribeCrosshairMove(onMove);
      })
      .catch(() => {
        if (alive) setFailure(attempt);
      });

    return () => {
      alive = false;
      chart?.remove();
    };
  }, [attempt, data, tone]);

  if (failure === attempt) return <p className="text-sm text-fg-muted">{errorLabel}</p>;
  if (data.length < 2) return <p className="text-sm text-fg-muted">{emptyLabel}</p>;

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={label}
      data-tone={tone}
      data-points={data.length}
      className="h-56 w-full touch-pan-y overflow-hidden lg:h-72"
    />
  );
}

export const PriceChart = memo(PriceChartBase);
