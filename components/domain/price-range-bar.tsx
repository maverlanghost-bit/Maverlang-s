"use client";

import { formatMoney } from "@/lib/format";
import { displayPrice } from "@/lib/market/browse";
import type { Currency } from "@/lib/types";

export interface PriceRangeBarProps {
  lowUsd: number | null | undefined;
  highUsd: number | null | undefined;
  currentUsd: number | null | undefined;
  rangeLabel: string;
  currency?: "USD" | "CLP";
  rate?: number;
}

export function PriceRangeBar({
  lowUsd,
  highUsd,
  currentUsd,
  rangeLabel,
  currency = "USD",
  rate,
}: PriceRangeBarProps) {
  if (
    lowUsd == null ||
    highUsd == null ||
    currentUsd == null ||
    !Number.isFinite(lowUsd) ||
    !Number.isFinite(highUsd) ||
    !Number.isFinite(currentUsd) ||
    highUsd <= lowUsd
  ) {
    return null;
  }

  const pct = Math.min(100, Math.max(0, ((currentUsd - lowUsd) / (highUsd - lowUsd)) * 100));
  const spreadPct = ((highUsd - lowUsd) / lowUsd) * 100;

  const displayCurrency: Currency = currency;

  const money = (usd: number): string => {
    const shown = displayPrice(usd, displayCurrency, rate);
    return shown === null ? formatMoney(usd, "USD") : formatMoney(shown, displayCurrency);
  };

  const lowText = money(lowUsd);
  const highText = money(highUsd);
  const currentText = money(currentUsd);
  const spreadText = Number.isFinite(spreadPct)
    ? spreadPct.toFixed(2).replace(".", ",")
    : "—";
  const positionText = Math.round(pct);

  return (
    <div className="mt-5 border-t border-border pt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="label">Termómetro del período ({rangeLabel})</p>
        <p className="num text-xs leading-4 text-fg-muted">
          Amplitud +{spreadText}% · Posición {positionText}% del rango
        </p>
      </div>

      <div
        className="relative mt-3 h-1.5"
        role="img"
        aria-label={`Rango del período: mínimo ${lowText}, actual ${currentText}, máximo ${highText}. Posición ${positionText}% del rango.`}
      >
        <div className="h-full w-full overflow-hidden rounded-full bg-surface-3">
          <div
            aria-hidden="true"
            className="h-full rounded-full bg-fg/25 transition-[width] duration-500 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span
          aria-hidden="true"
          className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-bg bg-fg ring-1 ring-border"
          style={{ left: `${pct}%` }}
        />
      </div>

      <div className="num mt-2.5 grid grid-cols-3 gap-2 text-xs leading-4 text-fg-muted">
        <p className="truncate text-left">
          Mín: <span className="text-fg">{lowText}</span>
        </p>
        <p className="truncate text-center">
          Actual: <span className="font-medium text-fg">{currentText}</span>
        </p>
        <p className="truncate text-right">
          Máx: <span className="text-fg">{highText}</span>
        </p>
      </div>
    </div>
  );
}
