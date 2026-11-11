"use client";

import { useMemo } from "react";

import { cn } from "@/lib/cn";

export type PerfPoint = { t: string | number; p: number };

const WIDTH = 640;
const HEIGHT = 180;
const PAD = 8;
/** Tope de puntos que se dibujan: el SVG se mantiene liviano en equipos modestos. */
const MAX_POINTS = 160;

const dayLabel = new Intl.DateTimeFormat("es-CL", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "America/Santiago",
});

function toTime(value: string | number): number | null {
  const time = typeof value === "number" ? value : Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

function toDay(value: string | number): string {
  const time = toTime(value);
  return time === null ? "" : dayLabel.format(time);
}

function sample(points: readonly PerfPoint[]): PerfPoint[] {
  if (points.length <= MAX_POINTS) return [...points];
  const step = (points.length - 1) / (MAX_POINTS - 1);
  const result: PerfPoint[] = [];
  for (let index = 0; index < MAX_POINTS; index += 1) {
    result.push(points[Math.round(index * step)] as PerfPoint);
  }
  return result;
}

/**
 * Curva estimada con precios de Maverlang (composición actual hacia atrás).
 * Siempre punteada: no es la historia real del fondo. Sin historial no se
 * dibuja nada inventado.
 */
export function PerfChart({
  points,
  className,
}: {
  points: readonly PerfPoint[];
  className?: string;
}) {
  const clean = useMemo(
    () =>
      points.filter(
        (point) => toTime(point.t) !== null && Number.isFinite(point.p),
      ),
    [points],
  );

  const drawing = useMemo(() => {
    if (clean.length < 2) return null;
    const values = clean.map((point) => point.p);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min;
    const list = sample(clean);
    const x = (index: number) => (index / (list.length - 1)) * WIDTH;
    const y = (value: number) =>
      span === 0 ? HEIGHT / 2 : PAD + (1 - (value - min) / span) * (HEIGHT - PAD * 2);

    const line = list
      .map((point, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(2)} ${y(point.p).toFixed(2)}`)
      .join(" ");
    const area = `${line} L${WIDTH} ${HEIGHT} L0 ${HEIGHT} Z`;
    return { line, area, first: list[0] as PerfPoint, last: list[list.length - 1] as PerfPoint };
  }, [clean]);

  if (!drawing) {
    return (
      <p className={cn("rounded-2xl border border-dashed border-border-strong px-4 py-8 text-center text-sm text-fg-muted", className)}>
        Sin historial de precios de Maverlang para esta cartera.
      </p>
    );
  }

  const start = toDay(drawing.first.t);
  const end = toDay(drawing.last.t);

  return (
    <figure className={cn("flex flex-col gap-2", className)}>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`Evolución estimada de la cartera${start && end ? ` entre ${start} y ${end}` : ""}. Línea punteada.`}
        className="h-40 w-full text-fg-body sm:h-48"
        preserveAspectRatio="none"
      >
        {[0.25, 0.5, 0.75].map((fraction) => (
          <line
            key={fraction}
            x1={0}
            x2={WIDTH}
            y1={PAD + fraction * (HEIGHT - PAD * 2)}
            y2={PAD + fraction * (HEIGHT - PAD * 2)}
            stroke="currentColor"
            strokeOpacity={0.08}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <path d={drawing.area} fill="currentColor" fillOpacity={0.06} />
        <path
          d={drawing.line}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeDasharray="5 4"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <div className="flex items-center justify-between gap-3 font-mono text-[11px] tabular-nums text-fg-muted">
        <span>{start}</span>
        <span className="text-fg-subtle">Base 100</span>
        <span>{end}</span>
      </div>

      <figcaption className="text-xs leading-relaxed text-fg-muted">
        Estimado: composición actual hacia atrás, con precios de Maverlang
      </figcaption>
    </figure>
  );
}
