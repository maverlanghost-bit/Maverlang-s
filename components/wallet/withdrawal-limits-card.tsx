"use client";

import { cn } from "@/lib/cn";
import { useT } from "@/lib/hooks/use-t";

/** Cupos vigentes de retiro en dólares (montos fijos del producto, sin decimales). */
const WITHDRAWAL_LIMITS = [500, 500, 2000] as const;

function Amount({ children }: { children: string }) {
  return <span className="font-medium text-fg tabular-nums">{children}</span>;
}

/**
 * Recordatorio de los límites de retiro en una sola frase, para mostrar dentro
 * del flujo de envío. Sólo informa: no calcula cupo consumido ni bloquea el
 * formulario.
 */
export function WithdrawalLimitsCard({ className }: { className?: string }) {
  const { language } = useT();
  const isEn = language === "en";
  const formatter = new Intl.NumberFormat(isEn ? "en-US" : "es-CL", { maximumFractionDigits: 0 });
  const [perTransfer, daily, monthly] = WITHDRAWAL_LIMITS.map((value) => `US$${formatter.format(value)}`);

  return (
    <div className={cn("flex flex-col gap-1.5 rounded-xl bg-surface-1 px-4 py-3.5", className)}>
      <p className="label">{isEn ? "Withdrawal limits" : "Límites de retiro"}</p>
      <p className="text-pretty text-[13px] leading-relaxed text-fg-body">
        {isEn ? (
          <>
            Up to <Amount>{perTransfer}</Amount> per transfer, <Amount>{daily}</Amount> per day and{" "}
            <Amount>{monthly}</Amount> per month. The peso equivalent depends on the exchange rate at the moment.
          </>
        ) : (
          <>
            Hasta <Amount>{perTransfer}</Amount> por envío, <Amount>{daily}</Amount> al día y <Amount>{monthly}</Amount>{" "}
            al mes. El equivalente en pesos depende del tipo de cambio del momento.
          </>
        )}
      </p>
    </div>
  );
}

