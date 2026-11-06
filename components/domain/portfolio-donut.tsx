"use client";

import { useEffect, useState, type PointerEvent } from "react";

import type { AllocationSlice } from "@/components/domain/allocation-bar";
import { formatPortion } from "@/lib/format";
import { useT } from "@/lib/hooks/use-t";

/** Geometría del anillo, en unidades del viewBox (220 × 220). */
const SIZE = 220;
const CENTER = SIZE / 2;
const RADIUS = 78;
const STROKE = 22;
const STROKE_ACTIVE = 27;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** Separación entre segmentos, en fracción del total (≈ 2 px del anillo). */
const GAP = 0.005;
const MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Movimiento reducido: se resuelve después de montar (el primer render, igual al
 * del servidor, asume movimiento) para no romper la hidratación.
 */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const media = window.matchMedia(MOTION_QUERY);
    setReduced(media.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  return reduced;
}

/** Acepta `pct` como ratio (0-1) o como porcentaje (0-100), clampeado. */
function portion(pct: number): number {
  if (!Number.isFinite(pct)) return 0;
  const ratio = pct > 1 ? pct / 100 : pct;
  return Math.min(Math.max(ratio, 0), 1);
}

/**
 * Donut de composición de cartera. Cada segmento es un arco de `stroke-dasharray`
 * sobre el mismo círculo, rotado al ángulo donde empieza su porción. Al pasar el
 * mouse o tocar, el centro muestra el activo, su peso y su valor; sin interacción
 * muestra el mayor peso (no hay total disponible en las props).
 */
export function PortfolioDonut({ slices }: { slices: readonly AllocationSlice[] }) {
  const { language } = useT();
  const reducedMotion = usePrefersReducedMotion();
  const [activeKey, setActiveKey] = useState<string | null>(null);

  if (slices.length === 0) return null;

  const en = language === "en";

  const normalized = slices.map((slice) => ({
    ...slice,
    fraction: portion(slice.pct),
  }));
  const totalFraction = normalized.reduce((sum, slice) => sum + slice.fraction, 0);
  const scale = totalFraction > 0 ? 1 / totalFraction : 0;
  const gap = normalized.length > 1 ? GAP : 0;

  let cursor = 0;
  const segments = normalized.map((slice) => {
    const fraction = slice.fraction * scale;
    const segment = {
      ...slice,
      fraction,
      start: cursor,
      arc: Math.max(fraction - gap, 0) * CIRCUMFERENCE,
    };
    cursor += fraction;
    return segment;
  });

  const active = segments.find((segment) => segment.key === activeKey) ?? null;
  const largest = segments.reduce<(typeof segments)[number] | null>(
    (best, segment) => (best === null || segment.fraction > best.fraction ? segment : best),
    null,
  );
  const focus = active ?? largest;

  const heading = en ? "Portfolio composition" : "Composición de tu cartera";
  const summary = normalized.map((slice) => `${slice.label} ${formatPortion(slice.pct)}`).join(", ");

  const eyebrow = active ? active.label : en ? "Largest weight" : "Mayor peso";
  const main = focus ? formatPortion(focus.fraction) : formatPortion(0);
  const sub = active ? active.valueLabel : focus ? `${focus.label} · ${focus.valueLabel}` : "";

  const handleEnter = (event: PointerEvent<SVGCircleElement>, key: string) => {
    // En táctil no fijamos el hover: se resuelve con el toque (onClick).
    if (event.pointerType === "mouse") setActiveKey(key);
  };

  const handleLeave = (event: PointerEvent<SVGCircleElement>) => {
    if (event.pointerType === "mouse") setActiveKey(null);
  };

  return (
    <div className="flex w-full items-center justify-center">
      <div className="relative w-full max-w-[220px]">
        <svg
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="block h-auto w-full"
          role="img"
          aria-label={`${heading}: ${summary}`}
        >
          <circle
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
            fill="none"
            stroke="var(--color-surface-3, #e6e6e6)"
            strokeWidth={STROKE}
          />
          {segments.map((segment) => {
            const isActive = activeKey === segment.key;
            // Si el activo ya no existe (la cartera cambió), no se atenúa nada.
            const isDimmed = active !== null && !isActive;
            return (
              <circle
                key={segment.key}
                cx={CENTER}
                cy={CENTER}
                r={RADIUS}
                fill="none"
                stroke={segment.color}
                strokeWidth={isActive ? STROKE_ACTIVE : STROKE}
                strokeDasharray={`${segment.arc.toFixed(2)} ${CIRCUMFERENCE.toFixed(2)}`}
                strokeLinecap="butt"
                transform={`rotate(${(-90 + segment.start * 360).toFixed(3)} ${CENTER} ${CENTER})`}
                className="cursor-pointer outline-none"
                style={{
                  opacity: isDimmed ? 0.35 : 1,
                  transition: reducedMotion ? "none" : "stroke-width 180ms ease, opacity 180ms ease",
                }}
                onPointerEnter={(event) => handleEnter(event, segment.key)}
                onPointerLeave={handleLeave}
                onClick={() => setActiveKey((prev) => (prev === segment.key ? null : segment.key))}
              >
                <title>{`${segment.label}: ${formatPortion(segment.pct)} · ${segment.valueLabel}`}</title>
              </circle>
            );
          })}
        </svg>

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-12 text-center">
          <p
            className="w-full truncate text-[10px] font-semibold tracking-[0.08em] text-fg-muted uppercase"
            aria-hidden="true"
          >
            {eyebrow}
          </p>
          <p className="num mt-0.5 text-lg font-semibold tabular-nums text-fg" aria-hidden="true">
            {main}
          </p>
          <p className="num w-full truncate text-[11px] tabular-nums text-fg-muted" aria-hidden="true">
            {sub}
          </p>
        </div>
      </div>
    </div>
  );
}
