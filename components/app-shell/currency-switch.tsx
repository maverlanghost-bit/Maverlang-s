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
        "inline-flex shrink-0 items-center rounded-full border border-border-control bg-surface-1 p-0.5",
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
              "min-h-11 cursor-pointer rounded-full font-mono text-[12px] font-medium whitespace-nowrap uppercase tracking-[0.04em] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-fg",
              compact ? "px-2" : "px-2.5",
              active
                ? "bg-bg text-fg shadow-raised ring-1 ring-border"
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
