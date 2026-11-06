"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { formatClp, formatMoney, formatPercent, formatShares, formatUsd } from "@/lib/format";
import { useT } from "@/lib/hooks/use-t";
import type { Currency, PricePoint } from "@/lib/types";

const CLP_PRESETS = [50_000, 100_000, 500_000, 1_000_000] as const;
const USD_PRESETS = [50, 100, 500, 1_000] as const;
const DEFAULT_PRESET = 1;

/** Separador de miles según idioma, sin decimales (para los chips de monto). */
function groupAmount(value: number, language: "es-CL" | "en"): string {
  return new Intl.NumberFormat(language === "en" ? "en-US" : "es-CL", { maximumFractionDigits: 0 }).format(value);
}

/**
 * Simulador "¿y si hubieras invertido?": toma el precio del inicio del período
 * y el precio actual para mostrar acciones, valor hoy y rendimiento.
 * No es una proyección ni una promesa de rentabilidad.
 */
export function WhatIfCalculator({
  symbol,
  name,
  points,
  currentPriceUsd,
  currency,
  rate,
}: {
  symbol: string;
  name: string;
  points: readonly PricePoint[];
  currentPriceUsd: number | null;
  currency: Currency;
  rate: number | undefined;
}) {
  const { language } = useT();
  const [activePreset, setActivePreset] = useState<number>(DEFAULT_PRESET);

  if (points.length < 2 || !currentPriceUsd) return null;

  const startPoint = points[0];
  const startPrice = startPoint.p;
  if (!Number.isFinite(startPrice) || startPrice <= 0) return null;

  const isEn = language === "en";
  const rateValue = typeof rate === "number" && Number.isFinite(rate) && rate > 0 ? rate : null;
  // Sin tipo de cambio disponible no se inventa una conversión: se muestra en US$.
  const showInClp = currency === "CLP" && rateValue !== null;
  const effectiveCurrency: Currency = showInClp ? "CLP" : "USD";

  const formatAmount = (usd: number) =>
    effectiveCurrency === "CLP" && rateValue !== null ? formatClp(usd * rateValue) : formatUsd(usd);

  const presets: readonly number[] = effectiveCurrency === "CLP" ? CLP_PRESETS : USD_PRESETS;
  const presetIndex = Math.min(activePreset, presets.length - 1);
  const amount = presets[presetIndex];
  const amountUsd = effectiveCurrency === "CLP" && rateValue !== null ? amount / rateValue : amount;

  const shares = amountUsd / startPrice;
  const valueTodayUsd = shares * currentPriceUsd;
  const pnlUsd = valueTodayUsd - amountUsd;
  const pnlPct = amountUsd > 0 ? pnlUsd / amountUsd : 0;
  const isUp = pnlUsd >= 0;

  const pnlAmount = effectiveCurrency === "CLP" && rateValue !== null ? pnlUsd * rateValue : pnlUsd;
  const pnlText = `${pnlUsd > 0 ? "+" : ""}${formatMoney(pnlAmount, effectiveCurrency)}`;

  const startTime = startPoint.t;
  const sinceLabel = Number.isFinite(startTime)
    ? new Intl.DateTimeFormat(isEn ? "en-US" : "es-CL", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "America/Santiago",
      }).format(new Date(startTime))
    : null;

  return (
    <Card className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-wider text-fg-muted uppercase">
            {isEn ? "What if" : "Simulador"}
          </p>
          <h2 className="mt-1 text-balance text-lg font-semibold tracking-tight text-fg">
            {isEn ? `What if you had invested in ${name}?` : `¿Y si hubieras invertido en ${name}?`}
          </h2>
          <p className="mt-1 text-xs text-fg-muted">
            <span className="num font-medium text-fg-body">{symbol}</span>
            {sinceLabel ? (
              <>
                {" · "}
                {isEn ? `since ${sinceLabel}` : `desde el ${sinceLabel}`}
              </>
            ) : null}
          </p>
        </div>
        <Badge tone={isUp ? "up" : "down"} className="num shrink-0">
          {formatPercent(pnlPct)}
        </Badge>
      </div>

      <div>
        <p className="text-xs font-medium text-fg-muted">{isEn ? "Initial amount" : "Monto inicial"}</p>
        <div
          role="group"
          aria-label={isEn ? "Choose an initial amount" : "Elige un monto inicial"}
          className="mt-2 flex flex-wrap gap-2"
        >
          {presets.map((preset, index) => {
            const selected = index === presetIndex;
            const label = effectiveCurrency === "CLP" ? formatClp(preset) : `US$${groupAmount(preset, language)}`;
            return (
              <button
                key={preset}
                type="button"
                aria-pressed={selected}
                onClick={() => setActivePreset(index)}
                className={cn(
                  "num min-h-9 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all duration-150 outline-none focus-visible:ring-4 focus-visible:ring-fg/20",
                  selected
                    ? "border-fg/25 bg-surface-3 text-fg"
                    : "border-border bg-bg text-fg-muted hover:border-border-strong hover:text-fg",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
        {currency === "CLP" && !showInClp ? (
          <p className="mt-2 text-[11px] text-fg-muted">
            {isEn
              ? "Exchange rate unavailable right now: amounts shown in US$."
              : "Sin tipo de cambio disponible ahora: los montos se muestran en US$."}
          </p>
        ) : null}
      </div>

      <div aria-live="polite" className="flex flex-col gap-3">
        <dl className="grid grid-cols-2 gap-3 rounded-xl border border-border/70 bg-surface-2/55 p-4 sm:grid-cols-3">
          <div className="min-w-0">
            <dt className="text-[11px] font-medium text-fg-muted">{isEn ? "Invested" : "Invertido"}</dt>
            <dd className="num mt-0.5 text-sm font-semibold text-fg">{formatAmount(amountUsd)}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[11px] font-medium text-fg-muted">{isEn ? "Value today" : "Valor hoy"}</dt>
            <dd className="num mt-0.5 text-sm font-semibold text-fg">{formatAmount(valueTodayUsd)}</dd>
          </div>
          <div className="col-span-2 min-w-0 sm:col-span-1">
            <dt className="text-[11px] font-medium text-fg-muted">{isEn ? "Shares bought" : "Acciones compradas"}</dt>
            <dd className="num mt-0.5 text-sm font-semibold text-fg">{formatShares(shares)}</dd>
          </div>
        </dl>

        <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-xl border border-border/70 bg-bg/60 px-4 py-3">
          <span className="text-xs font-medium text-fg-muted">{isEn ? "Gain / loss" : "Ganancia / pérdida"}</span>
          <span className={cn("num text-base font-semibold", isUp ? "text-up" : "text-down")}>{pnlText}</span>
        </div>
      </div>

      <p className="num text-[11px] leading-4 text-fg-muted">
        {isEn ? "Entry" : "Entrada"} {formatUsd(startPrice)}
        {" · "}
        {isEn ? "Today" : "Hoy"} {formatUsd(currentPriceUsd)}
      </p>

      <p className="border-t border-border pt-3 text-[11px] leading-4 text-pretty text-fg-muted">
        {isEn
          ? "Past returns do not guarantee future results. Simulation based on the token price at the start of the period and the current price; fees and taxes are not included."
          : "Los rendimientos pasados no aseguran resultados futuros. Simulación con el precio del token al inicio del período y el precio actual; no incluye comisiones ni impuestos."}
      </p>
    </Card>
  );
}
