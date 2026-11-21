"use client";

import { useState } from "react";

import { ChangeBadge } from "@/components/domain/change-badge";
import { LimitOrdersPanel } from "@/components/domain/limit-orders-panel";
import { Button } from "@/components/ui/button";
import { IconCheck } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { formatClp, formatMoney, formatShares, formatUsd } from "@/lib/format";
import { useT } from "@/lib/hooks/use-t";
import { addDcaPlan, useDcaPlans, type DcaFrequency, type DcaPlan } from "@/lib/trade/limit-orders-store";
import type { Currency, PricePoint } from "@/lib/types";

const CLP_DCA_PRESETS = [25_000, 50_000, 100_000, 250_000] as const;
const USD_DCA_PRESETS = [25, 50, 100, 250] as const;
const DEFAULT_PRESET_INDEX = 1;

const FREQUENCY_OPTIONS: readonly { value: DcaFrequency; labelEs: string; labelEn: string }[] = [
  { value: "weekly", labelEs: "Semanal", labelEn: "Weekly" },
  { value: "biweekly", labelEs: "Quincenal", labelEn: "Biweekly" },
  { value: "monthly", labelEs: "Mensual", labelEn: "Monthly" },
];

function groupAmount(value: number, language: "es-CL" | "en"): string {
  return new Intl.NumberFormat(language === "en" ? "en-US" : "es-CL", { maximumFractionDigits: 0 }).format(value);
}

function sampleUniformPoints(points: readonly PricePoint[], targetCount: number): PricePoint[] {
  const count = Math.min(targetCount, points.length);
  if (count <= 0) return [];
  if (count === 1) return [points[0]];
  const result: PricePoint[] = [];
  for (let i = 0; i < count; i++) {
    const idx = Math.round((i * (points.length - 1)) / (count - 1));
    result.push(points[idx]);
  }
  return result;
}

/**
 * Simulador de Compra Recurrente (DCA): toma entre 3 y 12 compras espaciadas
 * uniformemente sobre la serie histórica disponible para mostrar costo promedio,
 * acciones acumuladas y valor estimado hoy.
 */
export function DcaSimulator({
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
  const [activePreset, setActivePreset] = useState<number>(DEFAULT_PRESET_INDEX);
  const [frequency, setFrequency] = useState<DcaFrequency>("weekly");
  const [savedPlan, setSavedPlan] = useState<DcaPlan | null>(null);
  const symbolPlans = useDcaPlans(symbol);

  const validPoints = points.filter((pt) => Number.isFinite(pt.p) && pt.p > 0);
  if (validPoints.length < 4 || !currentPriceUsd || !Number.isFinite(currentPriceUsd) || currentPriceUsd <= 0) {
    return null;
  }

  const isEn = language === "en";
  const rateValue = typeof rate === "number" && Number.isFinite(rate) && rate > 0 ? rate : null;
  const showInClp = currency === "CLP" && rateValue !== null;
  const effectiveCurrency: Currency = showInClp ? "CLP" : "USD";

  const formatAmount = (usd: number) =>
    effectiveCurrency === "CLP" && rateValue !== null ? formatClp(usd * rateValue) : formatUsd(usd);

  const presets: readonly number[] = effectiveCurrency === "CLP" ? CLP_DCA_PRESETS : USD_DCA_PRESETS;
  const presetIndex = Math.min(activePreset, presets.length - 1);
  const amountPerPeriod = presets[presetIndex];
  const contributionUsd =
    effectiveCurrency === "CLP" && rateValue !== null ? amountPerPeriod / rateValue : amountPerPeriod;

  const purchaseCount = Math.min(12, Math.max(3, validPoints.length));
  const sampledPoints = sampleUniformPoints(validPoints, purchaseCount);

  const totalInvestedUsd = contributionUsd * sampledPoints.length;
  const totalShares = sampledPoints.reduce((sum, pt) => sum + contributionUsd / pt.p, 0);
  const avgCostUsd = totalShares > 0 ? totalInvestedUsd / totalShares : 0;
  const valueTodayUsd = totalShares * currentPriceUsd;
  const pnlUsd = valueTodayUsd - totalInvestedUsd;
  const pnlPct = totalInvestedUsd > 0 ? pnlUsd / totalInvestedUsd : 0;
  const isUp = pnlUsd >= 0;

  const pnlDisplayAmount = effectiveCurrency === "CLP" && rateValue !== null ? pnlUsd * rateValue : pnlUsd;
  const pnlText = `${pnlUsd > 0 ? "+" : ""}${formatMoney(pnlDisplayAmount, effectiveCurrency)}`;

  return (
    <section aria-labelledby="dca-simulator-heading" className="flex flex-col gap-5 border-t border-border pt-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="label">{isEn ? "Recurring buy (DCA)" : "Compra recurrente (DCA)"}</p>
          <h2 id="dca-simulator-heading" className="mt-1.5 text-lg font-medium tracking-tight text-balance text-fg">
            {isEn ? `What if you bought ${name} periodically?` : `¿Y si hubieras comprado ${name} periódicamente?`}
          </h2>
          <p className="mt-1 text-[12px] leading-4 text-fg-muted">
            <span className="num font-medium text-fg-body">{symbol}</span>
            {" · "}
            {isEn
              ? `${sampledPoints.length} equal contributions across the period`
              : `${sampledPoints.length} aportes iguales a lo largo del período`}
          </p>
        </div>
        <ChangeBadge value={pnlPct} className="num shrink-0" />
      </div>

      <div>
        <p className="label">{isEn ? "Contribution per period" : "Aporte por período"}</p>
        <div
          role="group"
          aria-label={isEn ? "Choose contribution per period" : "Elige un aporte por período"}
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
                onClick={() => {
                  setActivePreset(index);
                  setSavedPlan(null);
                }}
                className={cn(
                  "num min-h-11 rounded-full border px-4 text-[13px] font-medium transition-colors duration-150 outline-none focus-visible:ring-4 focus-visible:ring-fg/20 sm:min-h-9",
                  selected
                    ? "border-transparent bg-surface-2 text-fg"
                    : "border-border-control bg-bg text-fg-muted hover:border-fg hover:text-fg",
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className="label">{isEn ? "Frequency" : "Frecuencia"}</p>
        <div
          role="group"
          aria-label={isEn ? "Choose recurring frequency" : "Elige la frecuencia"}
          className="mt-2 flex flex-wrap gap-2"
        >
          {FREQUENCY_OPTIONS.map((option) => {
            const selected = option.value === frequency;
            return (
              <button
                key={option.value}
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  setFrequency(option.value);
                  setSavedPlan(null);
                }}
                className={cn(
                  "min-h-11 rounded-full border px-4 text-[13px] font-medium transition-colors duration-150 outline-none focus-visible:ring-4 focus-visible:ring-fg/20 sm:min-h-9",
                  selected
                    ? "border-transparent bg-surface-2 text-fg"
                    : "border-border-control bg-bg text-fg-muted hover:border-fg hover:text-fg",
                )}
              >
                {isEn ? option.labelEn : option.labelEs}
              </button>
            );
          })}
        </div>
      </div>

      <div aria-live="polite" className="flex flex-col gap-4">
        <dl className="grid grid-cols-2 gap-x-8 sm:grid-cols-3">
          <div className="min-w-0 border-t border-border py-3">
            <dt className="label min-h-8 sm:min-h-0">{isEn ? "Total invested" : "Total invertido"}</dt>
            <dd className="num mt-1 text-base leading-6 font-medium text-fg">{formatAmount(totalInvestedUsd)}</dd>
          </div>
          <div className="min-w-0 border-t border-border py-3">
            <dt className="label min-h-8 sm:min-h-0">{isEn ? "Accumulated shares" : "Acciones acumuladas"}</dt>
            <dd className="num mt-1 text-base leading-6 font-medium text-fg">{formatShares(totalShares)}</dd>
          </div>
          <div className="min-w-0 border-t border-border py-3">
            <dt className="label min-h-8 sm:min-h-0">{isEn ? "Estimated value today" : "Valor hoy estimado"}</dt>
            <dd className="num mt-1 text-base leading-6 font-medium text-fg">{formatAmount(valueTodayUsd)}</dd>
          </div>
          <div className="min-w-0 border-t border-border py-3">
            <dt className="label min-h-8 sm:min-h-0">{isEn ? "Average buy cost" : "Costo promedio de compra"}</dt>
            <dd className="num mt-1 text-base leading-6 font-medium text-fg">{formatAmount(avgCostUsd)}</dd>
          </div>
          <div className="min-w-0 border-t border-border py-3">
            <dt className="label min-h-8 sm:min-h-0">{isEn ? "Current price" : "Precio actual"}</dt>
            <dd className="num mt-1 text-base leading-6 font-medium text-fg">{formatAmount(currentPriceUsd)}</dd>
          </div>
        </dl>

        <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-border pt-4">
          <span className="text-[13px] leading-5 text-fg-muted">{isEn ? "Estimated gain / loss" : "Ganancia / pérdida estimada"}</span>
          <span className={cn("num text-xl font-medium tracking-tight", isUp ? "text-up" : "text-down")}>
            {pnlText}
          </span>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <Button
            type="button"
            variant="primary"
            size="md"
            onClick={() => {
              const created = addDcaPlan({
                symbol,
                name,
                amountUsd: Number(contributionUsd.toFixed(2)),
                frequency,
              });
              setSavedPlan(created);
            }}
          >
            {isEn ? "Activate Auto-DCA plan" : "Activar plan Auto-DCA"}
          </Button>

          {savedPlan ? (
            <p
              role="status"
              aria-live="polite"
              className="inline-flex items-center gap-2 text-[13px] font-medium text-up"
            >
              <IconCheck className="size-4 shrink-0" aria-hidden="true" />
              {isEn
                ? `Auto-DCA plan activated for ${savedPlan.symbol}`
                : `Plan Auto-DCA activado para ${savedPlan.symbol}`}
            </p>
          ) : null}
        </div>

        <p className="text-[12px] leading-relaxed text-fg-muted">
          {isEn
            ? "Simulated historical calculation using evenly spaced contributions across the selected price series. Not financial advice or a promise of future returns."
            : "Cálculo histórico simulado con aportes iguales espaciados en el período mostrado. No constituye asesoría financiera ni una promesa de retorno."}
        </p>
      </div>

      {symbolPlans.length > 0 ? <LimitOrdersPanel symbol={symbol} className="pt-2" /> : null}
    </section>
  );
}
