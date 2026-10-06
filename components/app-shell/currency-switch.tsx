"use client";

import { cn } from "@/lib/cn";
import { useDisplayCurrency, useSetDisplayCurrency } from "@/lib/hooks/use-display-currency";
import { useT } from "@/lib/hooks/use-t";

/** Interruptor chico USD/CLP (M40). Con sesión guarda en la DB; sin sesión, en local. */
export function CurrencySwitch({ className }: { className?: string }) {
  const { t } = useT();
  const currency = useDisplayCurrency();
  const setCurrency = useSetDisplayCurrency();
  const label = t.shell.currencyLabel;

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn("inline-flex items-center gap-0.5 rounded-full border border-border bg-surface-1 p-0.5", className)}
    >
      {(["USD", "CLP"] as const).map((option) => {
        const active = currency === option;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={`${label}: ${option}`}
            onClick={() => {
              if (!active) setCurrency(option);
            }}
            className={cn(
              "min-h-8 rounded-full px-2.5 text-xs font-medium transition duration-140 ease-spring active:scale-[0.98]",
              active ? "bg-surface-3 text-fg" : "text-fg-muted hover:text-fg",
            )}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}
