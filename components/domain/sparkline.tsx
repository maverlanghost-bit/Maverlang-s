"use client";

import { useEffect, useId, useRef } from "react";

import { cn } from "@/lib/cn";

const DRAW = "stroke-dashoffset 0.8s cubic-bezier(0.16, 1, 0.3, 1)";
/** Margen interior: el trazo no toca el borde del svg. */
const PAD = 2.5;

export function sparklineTone(data: readonly number[]): "text-up" | "text-down" | "text-fg-muted" {
  const first = data[0] ?? 0;
  const last = data[data.length - 1] ?? 0;
  if (last > first) return "text-up";
  if (last < first) return "text-down";
  return "text-fg-muted";
}

/** Trazo normalizado. null si no hay al menos dos puntos. */
export function sparklinePath(data: readonly number[], width: number, height: number): string | null {
  if (data.length < 2) return null;

  let min = data[0] ?? 0;
  let max = min;
  for (const value of data) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  const span = max - min || 1;
  const pad = 2;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  let d = "";
  for (let index = 0; index < data.length; index += 1) {
    const value = data[index] ?? min;
    const x = pad + (index / (data.length - 1)) * innerW;
    const y = pad + innerH - ((value - min) / span) * innerH;
    d += `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    if (index < data.length - 1) d += " ";
  }
  return d;
}

export interface SparklineShape {
  /** Trazo suave (cúbicas de Bézier monótonas). */
  line: string;
  /** Área cerrada bajo la curva, para el degradado. */
  area: string;
  /** Último punto (el precio más reciente). */
  lastX: number;
  lastY: number;
}

/**
 * Curva suave + área, con interpolación cúbica monótona de Fritsch-Carlson.
 * A diferencia de `sparklinePath` (segmentos rectos), esto no produce quiebres
 * ni Overshoot: la curva pasa por cada punto y nunca se sale del rango.
 * null si no quedan al menos dos valores finitos.
 */
export function sparklineSmoothPath(
  data: readonly number[],
  width: number,
  height: number,
): SparklineShape | null {
  const values = data.filter((value) => Number.isFinite(value));
  if (values.length < 2) return null;

  let min = values[0] ?? 0;
  let max = min;
  for (const value of values) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  const span = max - min;
  const innerW = width - PAD * 2;
  const innerH = height - PAD * 2;
  const count = values.length;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const value = values[index] ?? min;
    xs.push(PAD + (index / (count - 1)) * innerW);
    // Serie plana: al centro, para que el degradado bajo la línea se vea.
    const ratio = span > 0 ? (value - min) / span : 0.5;
    ys.push(PAD + innerH - ratio * innerH);
  }

  // Secantes entre puntos consecutivos.
  const secants: number[] = [];
  for (let index = 0; index < count - 1; index += 1) {
    const dx = (xs[index + 1] ?? 0) - (xs[index] ?? 0) || 1e-6;
    secants.push(((ys[index + 1] ?? 0) - (ys[index] ?? 0)) / dx);
  }

  // Tangentes: promedio de secantes y luego límite de Fritsch-Carlson.
  const tangents: number[] = new Array(count).fill(0);
  tangents[0] = secants[0] ?? 0;
  tangents[count - 1] = secants[count - 2] ?? 0;
  for (let index = 1; index < count - 1; index += 1) {
    const prev = secants[index - 1] ?? 0;
    const next = secants[index] ?? 0;
    tangents[index] = prev * next <= 0 ? 0 : (prev + next) / 2;
  }
  for (let index = 0; index < count - 1; index += 1) {
    const delta = secants[index] ?? 0;
    if (delta === 0) {
      tangents[index] = 0;
      tangents[index + 1] = 0;
      continue;
    }
    const alpha = (tangents[index] ?? 0) / delta;
    const beta = (tangents[index + 1] ?? 0) / delta;
    const norm = alpha * alpha + beta * beta;
    if (norm > 9) {
      const tau = 3 / Math.sqrt(norm);
      tangents[index] = tau * alpha * delta;
      tangents[index + 1] = tau * beta * delta;
    }
  }

  // Hermite -> Bézier cúbica.
  let line = `M ${(xs[0] ?? 0).toFixed(2)} ${(ys[0] ?? 0).toFixed(2)}`;
  for (let index = 0; index < count - 1; index += 1) {
    const x0 = xs[index] ?? 0;
    const y0 = ys[index] ?? 0;
    const x1 = xs[index + 1] ?? 0;
    const y1 = ys[index + 1] ?? 0;
    const h = (x1 - x0) / 3;
    const m0 = tangents[index] ?? 0;
    const m1 = tangents[index + 1] ?? 0;
    line +=
      ` C ${(x0 + h).toFixed(2)} ${(y0 + m0 * h).toFixed(2)},` +
      ` ${(x1 - h).toFixed(2)} ${(y1 - m1 * h).toFixed(2)},` +
      ` ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  }

  const firstX = xs[0] ?? 0;
  const lastX = xs[count - 1] ?? 0;
  const lastY = ys[count - 1] ?? 0;
  const base = height - PAD;
  const area = `${line} L ${lastX.toFixed(2)} ${base.toFixed(2)} L ${firstX.toFixed(2)} ${base.toFixed(2)} Z`;
  return { line, area, lastX, lastY };
}

/**
 * Dibuja el trazo al entrar en viewport (20 %).
 * Con movimiento reducido el trazo queda completo, sin transición.
 * Devuelve la limpieza del observer.
 */
export function armSparklineDraw(path: SVGPathElement, reducedMotion: boolean): (() => void) | void {
  const length = path.getTotalLength();
  if (reducedMotion) {
    path.style.transition = "none";
    path.style.strokeDasharray = "none";
    path.style.strokeDashoffset = "0";
    return;
  }
  // Sin transición al esconder: si la serie cambia, no se anima al revés.
  path.style.transition = "none";
  path.style.strokeDasharray = `${length}`;
  path.style.strokeDashoffset = `${length}`;
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        path.style.transition = DRAW;
        path.style.strokeDashoffset = "0";
        observer.disconnect();
      }
    },
    { threshold: 0.2 },
  );
  observer.observe(path);
  return () => observer.disconnect();
}

export function Sparkline({
  data,
  width = 96,
  height = 32,
  label,
  className,
}: {
  data: number[];
  width?: number;
  height?: number;
  label?: string;
  className?: string;
}) {
  const pathRef = useRef<SVGPathElement>(null);
  // La lista arma un arreglo nuevo en cada render con los mismos números.
  // La clave evita reiniciar el trazo si la serie no cambió.
  const seriesKey = data.join(",");
  // Id único por instancia: el degradado no se pisa entre sparklines.
  const gradientId = `spark-fill-${useId().replace(/:/g, "")}`;
  useEffect(() => {
    const path = pathRef.current;
    if (!path) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    return armSparklineDraw(path, reduced);
  }, [seriesKey, width, height]);

  const shape = sparklineSmoothPath(data, width, height);
  if (!shape) return null;
  const tone = sparklineTone(data);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("shrink-0", tone, className)}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.18" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={shape.area} fill={`url(#${gradientId})`} />
      <path
        ref={pathRef}
        d={shape.line}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={shape.lastX} cy={shape.lastY} r="1.75" fill="currentColor" />
    </svg>
  );
}
