"use client";

import { formatMoney, formatShares } from "@/lib/format";
import { displayPrice } from "@/lib/market/browse";

export interface TradeImpactPreviewProps {
  side: "buy" | "sell";
  symbol: string;
  currentShares: number;
  deltaShares: number;
  currentValueUsd: number;
  orderUsd: number;
  totalPortfolioUsd: number;
  cashUsdc: number;
  currency?: "USD" | "CLP";
  rate?: number | null;
}

/** Vista previa del impacto de la orden: posición, peso en cartera y efectivo resultante. */
export function TradeImpactPreview(props: TradeImpactPreviewProps) {
  const nextShares = Math.max(
    0,
    props.side === "buy" ? props.currentShares + props.deltaShares : props.currentShares - props.deltaShares
  );
  const nextPosUsd = Math.max(
    0,
    props.side === "buy" ? props.currentValueUsd + props.orderUsd : props.currentValueUsd - props.orderUsd
  );
  const denom = Math.max(1, props.totalPortfolioUsd, nextPosUsd);
  const currentWeightPct = Math.min(100, Math.max(0, (props.currentValueUsd / denom) * 100));
  const nextWeightPct = Math.min(100, Math.max(0, (nextPosUsd / denom) * 100));
  const nextCashUsd = Math.max(
    0,
    props.side === "buy" ? props.cashUsdc - props.orderUsd : props.cashUsdc + props.orderUsd
  );
  const nextCashText = (() => {
    if (props.currency === "CLP" && props.rate && props.rate > 0) {
      const clp = displayPrice(nextCashUsd, "CLP", props.rate ?? undefined);
      return clp === null ? formatMoney(nextCashUsd, "USD") : formatMoney(clp, "CLP");
    }
    return formatMoney(nextCashUsd, "USD");
  })();

  return (
    <div className="rounded-2xl border border-border/70 bg-surface-1/65 p-3.5 text-xs tabular-nums">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold text-fg">Impacto estimado en tu cartera</span>
        <span className="rounded-full border border-brand/25 bg-brand-soft/50 px-2.5 py-0.5 text-[11px] font-medium text-brand">
          Jupiter Spot Router · 0% comisión
        </span>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="rounded-xl border border-border/60 bg-surface-1/70 px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-fg-muted">Posición {props.symbol}</p>
          <p className="mt-0.5 font-medium text-fg">
            {`${formatShares(props.currentShares)} → ${formatShares(nextShares)}`}
          </p>
        </div>
        <div className="rounded-xl border border-border/60 bg-surface-1/70 px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-fg-muted">Peso en cartera</p>
          <p className="mt-0.5 font-medium text-fg">
            {`${Math.round(currentWeightPct)}% → ${Math.round(nextWeightPct)}%`}
          </p>
        </div>
        <div className="rounded-xl border border-border/60 bg-surface-1/70 px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-fg-muted">Efectivo post-orden</p>
          <p className="mt-0.5 font-medium text-fg">{nextCashText}</p>
        </div>
      </div>
    </div>
  );
}
