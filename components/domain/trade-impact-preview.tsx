"use client";

import type { ReactNode } from "react";

import { cn } from "@/lib/cn";
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

/** Fila del estado de cuenta: rótulo a la izquierda, cifra mono a la derecha. */
function ImpactRow({
  label,
  children,
  emphasis = false,
  divider = true,
}: {
  label: string;
  children: ReactNode;
  emphasis?: boolean;
  divider?: boolean;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-6 py-[0.6875rem]",
        divider && (emphasis ? "mt-1 border-t border-fg/25 pt-3.5" : "border-t border-border"),
      )}
    >
      <dt className="min-w-0 text-[13px] leading-5 text-fg-muted">{label}</dt>
      <dd
        className={cn(
          "num text-right leading-5 text-fg",
          emphasis ? "text-[15px] font-medium" : "text-[13px]",
        )}
      >
        {children}
      </dd>
    </div>
  );
}

/** `antes → después`, con el valor resultante en primer plano. */
function Delta({ from, to }: { from: string; to: string }) {
  return (
    <>
      <span className="text-fg-muted">{from}</span>
      <span aria-hidden="true" className="mx-1.5 text-fg-muted">
        →
      </span>
      <span className="font-medium text-fg">{to}</span>
    </>
  );
}

/**
 * Vista previa del impacto de la orden: posición, peso en cartera y efectivo
 * resultante. Se lee como el cierre de un estado de cuenta antes de confirmar.
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
    <section className="min-w-0">
      <p className="label">Impacto estimado en tu cartera</p>
      <dl className="mt-1 border-t border-border">
        <ImpactRow label={`Posición ${props.symbol}`} divider={false}>
          <Delta from={formatShares(props.currentShares)} to={formatShares(nextShares)} />
        </ImpactRow>
        <ImpactRow label="Peso en cartera">
          <Delta from={`${Math.round(currentWeightPct)}%`} to={`${Math.round(nextWeightPct)}%`} />
        </ImpactRow>
        <ImpactRow label="Efectivo post-orden" emphasis>
          {nextCashText}
        </ImpactRow>
      </dl>
      <p className="mt-3 text-[12px] leading-relaxed text-fg-muted">Jupiter Spot Router · 0% comisión</p>
    </section>
  );
}
