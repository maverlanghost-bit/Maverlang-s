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
    <div className="mt-4 rounded-2xl border border-border/70 bg-surface-1/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <p className="text-xs font-semibold tracking-wider text-fg-muted uppercase">
          Termómetro del período ({rangeLabel})
        </p>
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className="num inline-flex items-center rounded-full border border-up/25 bg-up/10 px-2 py-0.5 font-medium text-up">
            Amplitud +{spreadText}%
          </span>
          <span className="num text-fg-muted">Posición {positionText}% del rango</span>
        </div>
      </div>

      <div
        className="relative mt-3 h-2.5"
        role="img"
        aria-label={`Rango del período: mínimo ${lowText}, actual ${currentText}, máximo ${highText}. Posición ${positionText}% del rango.`}
      >
        <div className="h-full w-full overflow-hidden rounded-full bg-surface-3">
          <div
            aria-hidden="true"
            className="h-full rounded-full bg-gradient-to-r from-down/70 via-warn/80 to-up transition-[width] duration-500 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span
          aria-hidden="true"
          className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-fg shadow-xs ring-1 ring-border/70"
          style={{ left: `${pct}%` }}
        />
      </div>

      <div className="mt-2.5 grid grid-cols-3 gap-2 text-[11px]">
        <p className="num truncate text-left text-fg-muted">
          Mín: <span className="font-medium text-fg">{lowText}</span>
        </p>
        <p className="num truncate text-center text-fg-muted">
          Actual: <span className="font-semibold text-fg">{currentText}</span>
        </p>
        <p className="num truncate text-right text-fg-muted">
          Máx: <span className="font-medium text-fg">{highText}</span>
        </p>
      </div>
    </div>
  );
}
