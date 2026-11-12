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

/**
 * Vista previa del impacto de la orden: posición, peso en cartera y efectivo
 * resultante. Filas hairline, sin tarjetas anidadas: se lee como un estado de
 * cuenta antes de confirmar.
 */
export function TradeImpactPreview(props: TradeImpactPreviewProps) {
  const nextShares = Math.max(
    0,
    props.side === "buy" ? props.currentShares + props.deltaShares : props.currentShares - props.deltaShares,
  );
  const nextPosUsd = Math.max(
    0,
    props.side === "buy" ? props.currentValueUsd + props.orderUsd : props.currentValueUsd - props.orderUsd,
  );
  const denom = Math.max(1, props.totalPortfolioUsd, nextPosUsd);
  const currentWeightPct = Math.min(100, Math.max(0, (props.currentValueUsd / denom) * 100));
  const nextWeightPct = Math.min(100, Math.max(0, (nextPosUsd / denom) * 100));
  const nextCashUsd = Math.max(
    0,
    props.side === "buy" ? props.cashUsdc - props.orderUsd : props.cashUsdc + props.orderUsd,
  );
  const nextCashText = (() => {
    if (props.currency === "CLP" && props.rate && props.rate > 0) {
      const clp = displayPrice(nextCashUsd, "CLP", props.rate ?? undefined);
      return clp === null ? formatMoney(nextCashUsd, "USD") : formatMoney(clp, "CLP");
    }
    return formatMoney(nextCashUsd, "USD");
  })();

  return (
    <section className="min-w-0 border-t border-border pt-4">
      <p className="label">Impacto estimado en tu cartera</p>
      <dl className="mt-1">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-4 py-2.5">
          <dt className="min-w-0 text-[13px] leading-5 text-fg-muted">Posición {props.symbol}</dt>
          <dd className="num text-right text-sm leading-5 text-fg">
            {`${formatShares(props.currentShares)} → ${formatShares(nextShares)}`}
          </dd>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-4 border-t border-border/70 py-2.5">
          <dt className="min-w-0 text-[13px] leading-5 text-fg-muted">Peso en cartera</dt>
          <dd className="num text-right text-sm leading-5 text-fg">
            {`${Math.round(currentWeightPct)}% → ${Math.round(nextWeightPct)}%`}
          </dd>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-4 border-t border-fg/15 pt-3 pb-0.5">
          <dt className="min-w-0 text-[13px] leading-5 text-fg-muted">Efectivo post-orden</dt>
          <dd className="num text-right text-sm font-medium text-fg">{nextCashText}</dd>
        </div>
      </dl>
      <p className="mt-2.5 text-[11px] leading-relaxed text-fg-subtle">Jupiter Spot Router · 0% comisión</p>
    </section>
  );
}
