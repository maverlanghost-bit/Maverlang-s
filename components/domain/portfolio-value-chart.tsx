"use client";

import { useId, useMemo, type ReactNode } from "react";

import { ChangeBadge } from "@/components/domain/change-badge";
import { InfoTip } from "@/components/domain/info-tip";
import { TONE_STROKE } from "@/components/domain/svg-price-chart";
import { ErrorState } from "@/components/ui/error-state";
import { indexFromKey } from "@/components/ui/keys";
import { Skeleton } from "@/components/ui/skeleton";
import { carteraCopy } from "@/content/i18n/extra-cartera";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/hooks/use-t";
import { rangeMove, toneOf } from "@/lib/market/series";
import { periodPerformance } from "@/lib/portfolio/performance";
import { decodePoints, encodePoints, portfolioValueSeries } from "@/lib/portfolio/series";
import type { Currency, Position, PricePoint, Range } from "@/lib/types";

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
  /** Moneda de la pantalla: la escala del gráfico siempre se rotula en US$. */
  valueCurrency: Currency;
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
 * Cápsula de rangos con subrayado: el mismo lenguaje que la ficha de la
 * acción, sin píldora de fondo. `role="group"` + `aria-pressed` y el mismo
 * `aria-label` que usaba `SegmentedControl`, para no cambiar el contrato de
 * accesibilidad.
 */
function RangeTabs({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  const idPrefix = useId();

  function move(current: string, key: string) {
    const index = Math.max(0, options.findIndex((option) => option.value === current));
    const next = indexFromKey(key, index, options.length);
    if (next === null) return;
    const option = options[next];
    if (!option) return;
    onChange(option.value);
    document.getElementById(`${idPrefix}-${option.value}`)?.focus();
  }

  return (
    <div
      role="group"
      aria-label={label}
      className="no-scrollbar flex w-full items-center overflow-x-auto"
      onKeyDown={(event) => {
        if (indexFromKey(event.key, 0, options.length) === null) return;
        event.preventDefault();
        move(value, event.key);
      }}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            id={`${idPrefix}-${option.value}`}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "relative inline-flex h-11 shrink-0 items-center px-3 text-[13px] font-medium whitespace-nowrap outline-none transition-colors duration-150 sm:px-4",
              selected ? "text-fg" : "text-fg-muted hover:text-fg",
            )}
          >
            {option.label}
            <span
              aria-hidden
              className={cn(
                "absolute inset-x-2 bottom-0 h-0.5 transition-colors duration-150 sm:inset-x-3",
                selected ? "bg-fg" : "bg-transparent",
              )}
            />
          </button>
        );
      })}
    </div>
  );
}

/**
 * Bloque del gráfico del valor de la cartera: variación del período, selector
 * de rango, aviso de referencia y estados de carga y error. Va sin cáscara de
 * tarjeta: el gráfico se apoya directo en la página, separado por hairlines.
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
  valueCurrency,
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
  const isEn = language === "en";
  const period = points.length >= 2 ? periodPerformance(points) : null;
  const options = ranges.map((option) => ({ value: option.value, label: option.label }));
  // Mismo tono que la curva: el color de la leyenda no inventa un segundo trazo.
  const tone = toneOf(rangeMove(points));

  return (
    <section className="flex min-w-0 flex-col" data-range={range}>
      <div className="flex items-center gap-1.5">
        <p className="label shrink-0">{copy.period}</p>
        <span aria-hidden className="text-xs text-fg-subtle">
          ·
        </span>
        <p className="min-w-0 truncate text-xs text-fg-muted">{t.detail.rangeCaption[range]}</p>
        <InfoTip label={`${copy.whatIsThis}. ${copy.period}`} text={copy.periodTip} align="start" />
      </div>

      <div className="mt-2 flex min-h-9 flex-wrap items-baseline gap-x-2.5 gap-y-1">
        {pending ? (
          <Skeleton className="h-8 w-40" />
        ) : period === null ? (
          <span className="text-sm text-fg-muted">{copy.emptyFigure}</span>
        ) : pendingFx ? (
          <Skeleton className="h-8 w-40" />
        ) : (
          <>
            <span
              className={cn(
                "num text-xl leading-none font-medium tracking-tight whitespace-nowrap sm:text-2xl",
                amountTone(period.deltaUsd),
              )}
            >
              {formatValue(period.deltaUsd)}
            </span>
            <ChangeBadge value={period.pct} />
          </>
        )}
      </div>

      <div className="mt-4 flex w-full border-b border-border">
        <RangeTabs label={t.detail.rangesLabel} options={options} value={range} onChange={onRangeChange} />
      </div>

      {referenceNote ? (
        <p className="mt-3 text-xs leading-relaxed text-fg-subtle">{referenceNote}</p>
      ) : null}

      <div className="mt-3">
        {pending ? (
          <div role="status" aria-live="polite" aria-busy="true">
            <span className="sr-only">{t.states.loading}</span>
            <Skeleton className="h-60 w-full sm:h-72 lg:h-[360px]" />
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

      <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1">
        <button
          type="button"
          aria-pressed={compare.active}
          onClick={compare.onToggle}
          className={cn(
            "inline-flex min-h-11 items-center gap-2 text-[13px] font-medium transition-colors duration-150 outline-none focus-visible:ring-4 focus-visible:ring-fg/20 sm:min-h-9",
            compare.active ? "text-fg" : "text-fg-muted hover:text-fg",
          )}
        >
          <span
            aria-hidden
            className={cn("size-1.5 rounded-full transition-colors", compare.active ? "bg-fg" : "bg-control")}
          />
          vs S&amp;P 500 (SPYx)
        </button>
      </div>

      {/* Leyenda y unidad de la escala. Sin esto, la línea comparativa no tenía
          nombre y el eje en dólares no se distinguía del monto en pesos. */}
      {compare.active ? (
        <ul className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs leading-5 text-fg-muted">
          <li className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="h-0 w-4 border-t-2"
              style={{ borderColor: TONE_STROKE[tone] }}
            />
            {isEn ? "Your portfolio" : "Tu cartera"}
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="h-0 w-4 border-t-2 border-dashed border-[#5c5c5c]" />
            S&amp;P 500 (SPYx)
          </li>
          <li className="text-fg-subtle">
            {isEn ? "% from the start of the period" : "% desde el inicio del período"}
          </li>
        </ul>
      ) : valueCurrency === "CLP" ? (
        <p className="mt-1 text-xs leading-5 text-fg-subtle">
          {isEn ? "Chart scale and readout in USD" : "Escala y lectura del gráfico en US$"}
        </p>
      ) : null}
    </section>
  );
}
