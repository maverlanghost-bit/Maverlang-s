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

const CASH_COLOR = "#64748b";

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
  const activeSlice = normalizedSlices.find((slice) => slice.key === activeKey) ?? normalizedSlices[0];

  return (
    <div className="rounded-2xl border border-border/80 bg-bg-elevated/90 p-4 shadow-[0_10px_30px_-16px_rgba(12,15,20,0.08)]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold tracking-wider text-fg-muted uppercase">
          {lang === "en" ? "Portfolio allocation" : "Distribución de tu cartera"}
        </p>
        {activeSlice ? (
          <p className="text-[12px] font-medium tabular-nums text-fg-muted">
            <span className="font-semibold text-fg">{activeSlice.label}</span>
            {" · "}
            <span>{formatPortion(activeSlice.pct)}</span>
            {" · "}
            <span className="text-fg">{activeSlice.valueLabel}</span>
          </p>
        ) : null}
      </div>

      <div
        className="flex h-3.5 w-full gap-0.5 overflow-hidden rounded-full bg-surface-3 p-0.5"
        role="img"
        aria-label={`${ariaHeading}: ${summary}`}
      >
        {normalizedSlices.map((slice) => {
          const isActive = activeKey === slice.key;
          const isDimmed = activeKey !== null && !isActive;
          const pctWidth = slice.pct <= 1 ? slice.pct * 100 : slice.pct;
          return (
            <button
              key={slice.key}
              type="button"
              tabIndex={-1}
              aria-hidden="true"
              onMouseEnter={() => setActiveKey(slice.key)}
              onMouseLeave={() => setActiveKey(null)}
              onClick={() => setActiveKey((prev) => (prev === slice.key ? null : slice.key))}
              className={cn(
                "h-full min-w-1 first:rounded-l-full last:rounded-r-full transition-all duration-200 hover:opacity-95",
                isDimmed ? "opacity-45" : "opacity-100",
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

      <ul className="flex flex-wrap gap-1.5 pt-3">
        {normalizedSlices.map((slice) => {
          const isActive = activeKey === slice.key;
          return (
            <li key={slice.key}>
              <button
                type="button"
                onMouseEnter={() => setActiveKey(slice.key)}
                onMouseLeave={() => setActiveKey(null)}
                onClick={() => setActiveKey((prev) => (prev === slice.key ? null : slice.key))}
                className={cn(
                  "inline-flex min-h-9 items-center gap-2 rounded-full border px-3 py-1 text-xs transition-all duration-200 outline-none focus-visible:ring-4 focus-visible:ring-fg/20",
                  isActive
                    ? "border-brand/50 bg-brand-soft/60 text-fg shadow-xs"
                    : "border-border/75 bg-bg/80 text-fg hover:border-border-strong hover:bg-surface-2/70",
                )}
              >
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: slice.color }}
                  aria-hidden="true"
                />
                <span className="max-w-36 truncate font-medium text-fg">{slice.label}</span>
                <span className="num font-semibold tabular-nums text-fg-muted">{formatPortion(slice.pct)}</span>
                <span className="num tabular-nums text-fg">{slice.valueLabel}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
