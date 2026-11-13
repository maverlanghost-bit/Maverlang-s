"use client";

import { cn } from "@/lib/cn";
import { useT } from "@/lib/hooks/use-t";

/** Cupos vigentes de retiro en dólares (montos fijos del producto, sin decimales). */
const WITHDRAWAL_LIMITS = [500, 500, 2000] as const;

/**
 * Límites de retiro como ficha de tres filas con hairline: cada cupo se lee
 * solo, sin una frase larga que haya que desarmar en 360 px.
 */
export function WithdrawalLimitsCard({ className }: { className?: string }) {
  const { language } = useT();
  const isEn = language === "en";
  const formatter = new Intl.NumberFormat(isEn ? "en-US" : "es-CL", { maximumFractionDigits: 0 });
  const [perTransfer, daily, monthly] = WITHDRAWAL_LIMITS.map((value) => `US$${formatter.format(value)}`);
  const rows = isEn
    ? [
        { label: "Per transfer", value: perTransfer },
        { label: "Per day", value: daily },
        { label: "Per month", value: monthly },
      ]
    : [
        { label: "Por envío", value: perTransfer },
        { label: "Por día", value: daily },
        { label: "Por mes", value: monthly },
      ];

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <p className="label">{isEn ? "Withdrawal limits" : "Límites de retiro"}</p>
      <dl className="divide-y divide-border overflow-hidden rounded-xl border border-border">
        {rows.map((row) => (
          <div key={row.label} className="flex min-h-11 items-center justify-between gap-3 px-4 py-2.5">
            <dt className="min-w-0 text-[13px] leading-snug text-fg-muted">{row.label}</dt>
            <dd className="num shrink-0 text-[15px] leading-none font-medium tabular-nums text-fg">{row.value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-[13px] leading-relaxed text-fg-muted">
        {isEn
          ? "The peso equivalent depends on the exchange rate at the moment."
          : "El equivalente en pesos depende del tipo de cambio del momento."}
      </p>
    </div>
  );
}

