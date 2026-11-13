"use client";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/hooks/use-t";

/** Cupos vigentes de retiro en dólares (montos fijos del producto, sin decimales). */
const WITHDRAWAL_LIMITS = [
  { key: "perTransfer", amountUsd: 500 },
  { key: "daily", amountUsd: 500 },
  { key: "monthly", amountUsd: 2000 },
] as const;

type LimitKey = (typeof WITHDRAWAL_LIMITS)[number]["key"];

const amountFormatter = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });

/**
 * Recordatorio compacto de los límites de retiro, para mostrar dentro del flujo
 * de envío. Sólo informa: no calcula cupo consumido ni bloquea el formulario.
 */
export function WithdrawalLimitsCard({ className }: { className?: string }) {
  const { language } = useT();
  const isEn = language === "en";

  const labels: Record<LimitKey, string> = {
    perTransfer: isEn ? "Max. per transfer" : "Máx. por envío",
    daily: isEn ? "Daily allowance" : "Cupo diario",
    monthly: isEn ? "Monthly allowance" : "Cupo mensual",
  };

  return (
    <Card className={cn("flex flex-col gap-3 p-4 md:p-5", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-medium text-fg">{isEn ? "Withdrawal limits" : "Límites de retiro"}</h2>
        <span className="label-xs">US$</span>
      </div>

      <dl className="flex flex-col divide-y divide-border text-sm">
        {WITHDRAWAL_LIMITS.map((limit) => (
          <div key={limit.key} className="flex items-baseline justify-between gap-3 py-1.5">
            <dt className="text-fg-muted">{labels[limit.key]}</dt>
            <dd className="num font-medium tabular-nums text-fg">{amountFormatter.format(limit.amountUsd)}</dd>
          </div>
        ))}
      </dl>

      <p className="text-pretty text-xs leading-relaxed text-fg-muted">
        {isEn
          ? "Caps apply to transfers from your wallet. Amounts in dollars; the peso equivalent depends on the exchange rate at the time."
          : "Los cupos aplican a envíos desde tu billetera. Montos en dólares; el equivalente en pesos depende del tipo de cambio del momento."}
      </p>
    </Card>
  );
}
