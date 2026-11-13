"use client";

import { CsvExportButton } from "@/components/domain/csv-export-button";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";
import { displayPrice } from "@/lib/market/browse";
import type { Activity, Currency, Position } from "@/lib/types";

export interface PortfolioTaxSummaryCardProps {
  positions: readonly Position[];
  activities: readonly Activity[];
  currency?: Currency;
  rate?: number;
  masked?: boolean;
}

/**
 * Resumen patrimonial y cartola. Datos para respaldo contable, sin cáscara de
 * tarjeta: label, título, exportación y una grilla de cifras sobre hairlines.
 */
export function PortfolioTaxSummaryCard({
  positions,
  activities,
  currency = "USD",
  rate,
  masked = false,
}: PortfolioTaxSummaryCardProps) {
  if (positions.length === 0 && activities.length === 0) return null;

  const costBasisUsd = positions.reduce((acc, p) => acc + (p.avgCostUsd ?? p.priceUsd) * p.shares, 0);
  const unrealizedPnlUsd = positions.reduce((acc, p) => acc + (p.pnlUsd ?? 0), 0);

  const confirmedBuys = activities.filter((a) => a.kind === "buy" && a.status === "confirmed");
  const confirmedSells = activities.filter((a) => a.kind === "sell" && a.status === "confirmed");
  const buysUsd = confirmedBuys.reduce((acc, a) => acc + (a.valueUsd ?? 0), 0);
  const sellsUsd = confirmedSells.reduce((acc, a) => acc + (a.valueUsd ?? 0), 0);

  function fmt(usd: number): string {
    if (masked) return "••••";
    if (currency === "CLP" && typeof rate === "number" && rate > 0) {
      const clp = displayPrice(usd, "CLP", rate);
      return clp === null ? formatMoney(usd, "USD") : formatMoney(clp, "CLP");
    }
    return formatMoney(usd, "USD");
  }

  const stats = [
    { label: "Costo base en cartera", value: fmt(costBasisUsd), tone: "text-fg" },
    {
      label: "Resultado abierto (no realizado)",
      value: fmt(unrealizedPnlUsd),
      tone: masked || unrealizedPnlUsd === 0 ? "text-fg" : unrealizedPnlUsd > 0 ? "text-up" : "text-down",
    },
    { label: `Compras confirmadas (${confirmedBuys.length})`, value: fmt(buysUsd), tone: "text-fg" },
    { label: `Ventas confirmadas (${confirmedSells.length})`, value: fmt(sellsUsd), tone: "text-fg" },
  ];

  return (
    <section className="border-t border-border pt-8">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="label">Respaldo contable</p>
          <h2 className="mt-2 text-xl font-medium tracking-tight text-balance text-fg">
            Resumen Patrimonial y Cartola Anual
          </h2>
        </div>
        {activities.length > 0 ? <CsvExportButton rows={activities} currency={currency} fxRate={rate} /> : null}
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-5 border-t border-border pt-5 sm:grid-cols-4 sm:gap-x-6 sm:gap-y-0">
        {stats.map((stat, index) => (
          <div
            key={stat.label}
            className={cn("flex min-w-0 flex-col gap-1.5", index > 0 && "sm:border-l sm:border-border sm:pl-6")}
          >
            <dt className="label leading-snug">{stat.label}</dt>
            <dd
              className={cn(
                "num text-[13px] leading-5 font-medium tracking-tight tabular-nums sm:text-[15px]",
                stat.tone,
              )}
            >
              {stat.value}
            </dd>
          </div>
        ))}
      </dl>

      <p className="mt-5 max-w-prose text-xs leading-relaxed text-fg-muted">
        Resumen informativo de tus posiciones abiertas y órdenes ejecutadas para respaldo contable personal. No
        constituye declaración ni asesoría tributaria. [REVISIÓN ABOGADO]
      </p>
    </section>
  );
}
