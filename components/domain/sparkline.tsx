"use client";

import { useEffect, useRef } from "react";

import { cn } from "@/lib/cn";

const DRAW = "stroke-dashoffset 0.8s cubic-bezier(0.16, 1, 0.3, 1)";

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
  useEffect(() => {
    const path = pathRef.current;
    if (!path) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    return armSparklineDraw(path, reduced);
  }, [seriesKey, width, height]);

  const d = sparklinePath(data, width, height);
  if (!d) return null;
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
      <path
        ref={pathRef}
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
