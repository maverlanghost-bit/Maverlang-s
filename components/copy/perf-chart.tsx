"use client";

import { useMemo, type ReactNode } from "react";

import { cn } from "@/lib/cn";
import { formatPercent } from "@/lib/format";

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

/** Fila de dato con hairline: rótulo a la izquierda, cifra tabular a la derecha. */
function DataRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/70 py-2.5 last:border-b-0">
      <dt className="min-w-0 text-[13px] leading-5 text-fg-muted">{label}</dt>
      <dd className="num shrink-0 text-[13px] leading-5 font-medium whitespace-nowrap tabular-nums text-fg">
        {children}
      </dd>
    </div>
  );
}

/**
 * Curva estimada con precios de Maverlang (composición actual hacia atrás).
 * El retorno manda: es la cifra que se busca al abrir la ficha, en mono y
 * tabular. Siempre punteada: no es la historia real del fondo. Sin historial
 * no se dibuja nada inventado.
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
    return {
      line,
      area,
      first: list[0] as PerfPoint,
      last: list[list.length - 1] as PerfPoint,
      min,
      max,
      /** Nivel base del índice (100): referencia punteada. */
      yBase: y(100),
    };
  }, [clean]);

  if (!drawing) {
    return (
      <p className={cn("text-[13px] leading-relaxed text-fg-muted", className)}>
        Sin historial de precios de Maverlang para esta cartera. No dibujamos una curva con datos que no
        tenemos.
      </p>
    );
  }

  const start = toDay(drawing.first.t);
  const end = toDay(drawing.last.t);
  const base = drawing.first.p;
  const periodPct = base > 0 ? (drawing.last.p - base) / base : 0;
  const topPct = base > 0 ? (drawing.max - base) / base : 0;
  const bottomPct = base > 0 ? (drawing.min - base) / base : 0;

  return (
    <figure className={cn("flex min-w-0 flex-col", className)}>
      <div className="flex flex-col gap-1.5">
        <p
          className={cn(
            "num text-[36px] leading-none font-medium tracking-tight tabular-nums sm:text-[40px]",
            periodPct > 0 ? "text-up" : periodPct < 0 ? "text-down" : "text-fg",
          )}
        >
          {formatPercent(periodPct)}
        </p>
        <p className="text-[13px] leading-5 text-fg-muted">
          Índice base 100 desde {start || "el primer dato"}
        </p>
      </div>

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`Evolución estimada de la cartera${start && end ? ` entre ${start} y ${end}` : ""}. Línea punteada.`}
        className="mt-6 h-40 w-full min-w-0 text-fg-body sm:h-44"
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
        {/* Referencia base 100 del índice. */}
        <line
          x1={0}
          x2={WIDTH}
          y1={drawing.yBase}
          y2={drawing.yBase}
          stroke="currentColor"
          strokeOpacity={0.32}
          strokeWidth={1}
          strokeDasharray="3 3"
          vectorEffect="non-scaling-stroke"
        />
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

      <div className="mt-3 flex items-center justify-between gap-4 num text-[13px] leading-5 tabular-nums text-fg-muted">
        <span>{start}</span>
        <span>{end}</span>
      </div>

      <dl className="mt-6 border-t border-border/70">
        <DataRow label="Máximo del período">{formatPercent(topPct)}</DataRow>
        <DataRow label="Mínimo del período">{formatPercent(bottomPct)}</DataRow>
      </dl>

      <figcaption className="mt-3 text-[13px] leading-relaxed text-pretty text-fg-muted">
        Estimado: composición actual hacia atrás, con precios de Maverlang. Línea punteada.
      </figcaption>
    </figure>
  );
}
