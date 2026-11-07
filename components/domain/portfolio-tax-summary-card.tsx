"use client";

import { Card } from "@/components/ui/card";
import { CsvExportButton } from "@/components/domain/csv-export-button";
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

  return (
    <Card className="p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-border/70 bg-surface-1 px-2.5 py-0.5 text-[11px] font-medium text-fg-muted">
            Control Patrimonial y Cartola
          </span>
          <h2 className="text-lg font-semibold tracking-tight text-fg">Resumen Patrimonial y Cartola Anual</h2>
        </div>
        {activities.length > 0 ? <CsvExportButton rows={activities} currency={currency} fxRate={rate} /> : null}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 tabular-nums lg:grid-cols-4">
        <div className="rounded-xl border border-border/70 bg-surface-1/70 px-3 py-2.5">
          <p className="text-[11px] uppercase tracking-wide text-fg-muted">Costo base en cartera</p>
          <p className="mt-1 font-medium text-fg">{fmt(costBasisUsd)}</p>
        </div>
        <div className="rounded-xl border border-border/70 bg-surface-1/70 px-3 py-2.5">
          <p className="text-[11px] uppercase tracking-wide text-fg-muted">Resultado abierto (no realizado)</p>
          <p className="mt-1 font-medium text-fg">{fmt(unrealizedPnlUsd)}</p>
        </div>
        <div className="rounded-xl border border-border/70 bg-surface-1/70 px-3 py-2.5">
          <p className="text-[11px] uppercase tracking-wide text-fg-muted">{`Compras confirmadas (${confirmedBuys.length})`}</p>
          <p className="mt-1 font-medium text-fg">{fmt(buysUsd)}</p>
        </div>
        <div className="rounded-xl border border-border/70 bg-surface-1/70 px-3 py-2.5">
          <p className="text-[11px] uppercase tracking-wide text-fg-muted">{`Ventas confirmadas (${confirmedSells.length})`}</p>
          <p className="mt-1 font-medium text-fg">{fmt(sellsUsd)}</p>
        </div>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-fg-muted">
        Resumen informativo de tus posiciones abiertas y órdenes ejecutadas para respaldo contable personal. No
        constituye declaración ni asesoría tributaria. [REVISIÓN ABOGADO]
      </p>
    </Card>
  );
}
