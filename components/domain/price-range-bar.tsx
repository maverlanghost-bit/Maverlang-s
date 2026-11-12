"use client";

import { cn } from "@/lib/cn";
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
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="label">Termómetro del período ({rangeLabel})</p>
        <p className="num text-[12px] leading-4 text-fg-muted">
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
          className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-fg ring-2 ring-bg"
          style={{ left: `${pct}%` }}
        />
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2">
        {(
          [
            { key: "low", label: "Mín", value: lowText, align: "text-left", strong: false },
            { key: "current", label: "Actual", value: currentText, align: "text-center", strong: true },
            { key: "high", label: "Máx", value: highText, align: "text-right", strong: false },
          ] as const
        ).map((item) => (
          <div key={item.key} className={cn("min-w-0", item.align)}>
            <dt className="font-mono text-[12px] leading-4 font-medium tracking-[0.045em] text-fg-muted uppercase">
              {item.label}
            </dt>
            <dd
              className={cn(
                "num mt-0.5 truncate text-[13px] leading-5",
                item.strong ? "font-medium text-fg" : "text-fg-body",
              )}
            >
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
