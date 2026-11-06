"use client";

import { Badge } from "@/components/ui/badge";
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
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-fg-muted"
          >
            <svg viewBox="0 0 16 16" fill="none" className="size-3.5" stroke="currentColor" strokeWidth="1.4">
              <path d="M8 1.8 13 3.6v4.1c0 2.9-2 5.1-5 6.5-3-1.4-5-3.6-5-6.5V3.6L8 1.8Z" strokeLinejoin="round" />
              <path d="m5.9 7.9 1.5 1.5 2.8-2.9" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <h2 className="text-sm font-semibold tracking-tight text-fg">
            {isEn ? "Withdrawal limits" : "Límites de retiro"}
          </h2>
        </div>
        <Badge tone="neutral">US$</Badge>
      </div>

      <dl className="flex flex-col gap-1.5 text-sm">
        {WITHDRAWAL_LIMITS.map((limit) => (
          <div
            key={limit.key}
            className="flex items-baseline justify-between gap-3 rounded-xl bg-surface-2/60 px-3 py-1.5"
          >
            <dt className="text-fg-muted">{labels[limit.key]}</dt>
            <dd className="num font-semibold tabular-nums text-fg">
              US$ {amountFormatter.format(limit.amountUsd)}
            </dd>
          </div>
        ))}
      </dl>

      <p className="text-balance text-xs leading-relaxed text-fg-muted">
        {isEn
          ? "Caps apply to transfers from your wallet. Amounts in dollars; the peso equivalent depends on the exchange rate at the time."
          : "Los cupos aplican a envíos desde tu billetera. Montos en dólares; el equivalente en pesos depende del tipo de cambio del momento."}
      </p>
    </Card>
  );
}
