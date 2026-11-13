"use client";

import { useState } from "react";

import { cn } from "@/lib/cn";
import { formatPortion } from "@/lib/format";

export type AllocationSlice = {
  key: string;
  label: string;
  pct: number;
  valueLabel: string;
  color: string;
};

export type AllocationItem = {
  symbol: string;
  name: string;
  valueUsd: number;
  pct: number;
  color: string;
};

const CASH_COLOR = "#475569";

/**
 * Reparto de la cartera: una barra segmentada y, debajo, la leyenda con peso y
 * valor por activo. Es data, no una tarjeta: no dibuja cáscara propia, sólo
 * separadores hairline entre filas.
 */
export function AllocationBar({
  label,
  slices,
  items,
  cashUsd = 0,
  totalUsd = 0,
  formatValue,
  lang = "es-CL",
}: {
  label?: string;
  slices?: readonly AllocationSlice[];
  items?: readonly AllocationItem[];
  cashUsd?: number;
  totalUsd?: number;
  formatValue?: (usd: number) => string;
  lang?: "es-CL" | "en";
}) {
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const normalizedSlices: AllocationSlice[] =
    slices && slices.length > 0
      ? [...slices]
      : (items ?? []).map((item) => {
          const normalizedPct = item.pct > 1 ? item.pct / 100 : item.pct;
          return {
            key: item.symbol,
            label: item.name || item.symbol,
            pct: normalizedPct,
            valueLabel: formatValue ? formatValue(item.valueUsd) : `$${item.valueUsd.toFixed(2)}`,
            color: item.color,
          };
        });

  if ((!slices || slices.length === 0) && cashUsd > 0 && totalUsd > 0) {
    const cashRatio = cashUsd / totalUsd;
    normalizedSlices.push({
      key: "USDC",
      label: lang === "en" ? "Cash (USDC)" : "Efectivo (USDC)",
      pct: cashRatio,
      valueLabel: formatValue ? formatValue(cashUsd) : `$${cashUsd.toFixed(2)}`,
      color: CASH_COLOR,
    });
  }

  if (normalizedSlices.length === 0) return null;

  const ariaHeading = label ?? (lang === "en" ? "Portfolio allocation" : "Distribución de tu cartera");
  const summary = normalizedSlices.map((slice) => `${slice.label} ${formatPortion(slice.pct)}`).join(", ");
  const activeSlice = normalizedSlices.find((slice) => slice.key === activeKey) ?? null;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div
        className="flex h-2.5 w-full gap-[3px] overflow-hidden rounded-full bg-surface-3"
        role="img"
        aria-label={`${ariaHeading}: ${summary}`}
      >
        {normalizedSlices.map((slice) => {
          const isActive = activeKey === slice.key;
          const isDimmed = activeKey !== null && !isActive;
          const pctWidth = slice.pct <= 1 ? slice.pct * 100 : slice.pct;
          // Decorativo: el resumen accesible vive en el `aria-label` del
          // contenedor y la lectura real (nombre, %, monto) está en la lista.
          return (
            <span
              key={slice.key}
              aria-hidden="true"
              onMouseEnter={() => setActiveKey(slice.key)}
              onMouseLeave={() => setActiveKey(null)}
              className={cn(
                "h-full min-w-1 transition-opacity duration-200 first:rounded-l-full last:rounded-r-full",
                isDimmed ? "opacity-40" : "opacity-100",
              )}
              style={{
                flexGrow: Math.max(pctWidth, 2),
                width: `${Math.max(pctWidth, 2)}%`,
                backgroundColor: slice.color,
              }}
            />
          );
        })}
      </div>

      <ul className="flex flex-col">
        {normalizedSlices.map((slice, index) => {
          const isActive = activeSlice?.key === slice.key;
          return (
            <li key={slice.key} className={cn("border-border", index > 0 && "border-t")}>
              <button
                type="button"
                aria-pressed={isActive}
                onMouseEnter={() => setActiveKey(slice.key)}
                onMouseLeave={() => setActiveKey(null)}
                onClick={() => setActiveKey((prev) => (prev === slice.key ? null : slice.key))}
                className={cn(
                  "-mx-2 flex min-h-11 w-[calc(100%+1rem)] items-center gap-2.5 rounded-lg px-2 py-2.5 text-left transition-colors duration-150 sm:gap-3",
                  isActive ? "bg-surface-1" : "hover:bg-surface-1/70",
                )}
              >
                <span
                  className="size-2 shrink-0 rounded-full ring-1 ring-inset ring-black/10"
                  style={{ backgroundColor: slice.color }}
                  aria-hidden="true"
                />
                {/* El nombre envuelve en vez de cortarse; el monto nunca se
                    trunca: si no cabe, cede ancho el nombre. */}
                <span className="line-clamp-2 min-w-0 flex-1 text-[13px] leading-snug font-medium text-fg">
                  {slice.label}
                </span>
                <span className="num w-10 shrink-0 text-right text-[13px] leading-tight tabular-nums text-fg-muted">
                  {formatPortion(slice.pct)}
                </span>
                <span className="num shrink-0 text-right text-[13px] leading-tight font-medium tabular-nums whitespace-nowrap text-fg">
                  {slice.valueLabel}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
