"use client";

import { useMemo, type ReactNode } from "react";

import { ChangeBadge } from "@/components/domain/change-badge";
import { InfoTip } from "@/components/domain/info-tip";
import { ErrorState } from "@/components/ui/error-state";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import { carteraCopy } from "@/content/i18n/extra-cartera";
import { useT } from "@/lib/hooks/use-t";
import { periodPerformance } from "@/lib/portfolio/performance";
import { decodePoints, encodePoints, portfolioValueSeries } from "@/lib/portfolio/series";
import type { Position, PricePoint, Range } from "@/lib/types";

/**
 * Rangos del gráfico del valor de la cartera: 1S, 1M, 3M y 1A.
 *
 * El histórico se pide con los rangos de la ficha (1W/1M/3M/1Y); la cartera
 * no ofrece 1D ni "Todo" porque la serie suma el valor de las posiciones y en
 * un día el movimiento del pool pesa más que la cartera. Si un rango no trae
 * dos puntos, el gráfico muestra su estado vacío y la variación del período
 * queda en "Sin dato": no se rellena con cero.
 */
export const PORTFOLIO_RANGES = ["1W", "1M", "3M", "1Y"] as const satisfies readonly Range[];

/** `true` si el rango es uno de los cuatro de la cartera. */
export function isPortfolioRange(value: string): value is (typeof PORTFOLIO_RANGES)[number] {
  return (PORTFOLIO_RANGES as readonly string[]).includes(value);
}

/**
 * Serie del valor de la cartera en el rango activo: efectivo más cada posición
 * a su precio de ese instante (`portfolioValueSeries`). `rows[i]` es el
 * historial de `positions[i]`. Si falta un historial o trae menos de dos
 * puntos no hay serie dibujable: se devuelve vacío, nunca una recta inventada.
 */
export function usePortfolioValueSeries(
  positions: readonly Pick<Position, "shares">[],
  rows: readonly (readonly PricePoint[])[],
  cashUsdc: number,
  totalUsd: number,
): PricePoint[] {
  const encoded = encodePoints(
    positions.length > 0 && rows.length === positions.length && rows.every((row) => row.length >= 2)
      ? portfolioValueSeries(positions, rows, cashUsdc, totalUsd)
      : [],
  );
  return useMemo(() => decodePoints(encoded), [encoded]);
}

export interface PortfolioValueChartProps {
  /** Opciones del selector, en orden (1S, 1M, 3M, 1A). */
  ranges: readonly { value: Range; label: string }[];
  range: Range;
  onRangeChange: (value: string) => void;
  /** Serie del valor de la cartera en el rango activo. */
  points: readonly PricePoint[];
  /** Monto de la variación en la moneda visible de la pantalla. */
  formatValue: (usd: number) => string;
  /** Falta el tipo de cambio: el monto se muestra como esqueleto, no como cero. */
  pendingFx: boolean;
  /** Comparación contra el S&P 500 (SPYx), en porcentaje. */
  compare: { active: boolean; onToggle: () => void };
  pending: boolean;
  failed: boolean;
  onRetry: () => void;
  /** Aviso de historial de referencia. null si la serie es real. */
  referenceNote: ReactNode | null;
  /**
   * La curva del rango. La cartera entrega `SvgPriceChart` con la serie que
   * armó desde los historiales de cada posición.
   */
  children: ReactNode;
}

/** Tinte del monto: verde si sube, rojo si baja, neutro si queda igual. */
function amountTone(deltaUsd: number): string {
  if (deltaUsd > 0) return "text-up";
  if (deltaUsd < 0) return "text-down";
  return "text-fg";
}

/**
 * Bloque del gráfico del valor de la cartera: selector de rango, variación del
 * período, aviso de referencia y estados de carga y error.
 *
 * La variación sale de `periodPerformance` sobre la serie visible, así que es
 * el cambio de valor del período, no una ganancia contra el costo. Sin dos
 * puntos no hay cifra: se muestra "Sin dato".
 */
export function PortfolioValueChart({
  ranges,
  range,
  onRangeChange,
  points,
  formatValue,
  pendingFx,
  compare,
  pending,
  failed,
  onRetry,
  referenceNote,
  children,
}: PortfolioValueChartProps) {
  const { t, language } = useT();
  const copy = carteraCopy(language);
  const period = points.length >= 2 ? periodPerformance(points) : null;
  const options = ranges.map((option) => ({ value: option.value, label: option.label }));

  return (
    <div className="flex flex-col gap-3" data-range={range}>
      <SegmentedControl
        label={t.detail.rangesLabel}
        options={options}
        value={range}
        fullWidth
        onChange={onRangeChange}
      />
      {referenceNote ? <p className="text-sm text-fg-muted">{referenceNote}</p> : null}
      {!pending && !failed ? (
        <div className="flex flex-col gap-2">
          <div className="flex min-h-11 min-w-0 flex-wrap items-center gap-x-1 gap-y-1.5">
            <span className="label shrink-0">{copy.period}</span>
            <span className="min-w-0 truncate text-sm text-fg-muted">{t.detail.rangeCaption[range]}</span>
            <InfoTip label={`${copy.whatIsThis}. ${copy.period}`} text={copy.periodTip} align="start" />
            <button
              type="button"
              aria-pressed={compare.active}
              onClick={compare.onToggle}
              className={`ml-auto shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                compare.active
                  ? "border-fg bg-fg text-bg"
                  : "border-border/80 bg-surface-1/80 text-fg-muted hover:bg-surface-2 hover:text-fg"
              }`}
            >
              vs S&amp;P 500 (SPYx)
            </button>
          </div>
          {period === null ? (
            <span className="text-sm text-fg-muted">{copy.emptyFigure}</span>
          ) : pendingFx ? (
            <Skeleton className="h-6 w-40" />
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span className={`num text-sm whitespace-nowrap ${amountTone(period.deltaUsd)}`}>
                {formatValue(period.deltaUsd)}
              </span>
              <ChangeBadge value={period.pct} />
            </div>
          )}
        </div>
      ) : null}
      {pending ? (
        <div role="status" aria-live="polite" aria-busy="true">
          <span className="sr-only">{t.states.loading}</span>
          <Skeleton className="h-56 w-full rounded-xl lg:h-72" />
        </div>
      ) : failed ? (
        <ErrorState
          title={t.detail.chartError}
          label={t.states.error}
          retryLabel={t.states.retry}
          onRetry={onRetry}
        />
      ) : (
        children
      )}
    </div>
  );
}
