"use client";

import { cn } from "@/lib/cn";
import { useDisplayCurrency, useSetDisplayCurrency } from "@/lib/hooks/use-display-currency";
import { useT } from "@/lib/hooks/use-t";

/**
 * Interruptor chico USD/CLP (M40). Con sesión guarda en la DB; sin sesión, en
 * local. `compact` sólo aprieta el relleno horizontal: el alto sigue en 44px.
 */
export function CurrencySwitch({ className, compact = false }: { className?: string; compact?: boolean }) {
  const { t } = useT();
  const currency = useDisplayCurrency();
  const setCurrency = useSetDisplayCurrency();
  const label = t.shell.currencyLabel;

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 rounded-full border border-border/70 bg-surface-1/60 p-0.5 shadow-card backdrop-blur-xl",
        compact && "p-[3px]",
        className,
      )}
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
              "rounded-full text-xs font-medium tracking-tight transition duration-140 ease-spring active:scale-[0.98]",
              "min-h-11",
              compact ? "px-2" : "px-2.5",
              active
                ? "bg-bg text-fg shadow-card ring-1 ring-border/60"
                : "text-fg-muted hover:text-fg",
            )}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}
