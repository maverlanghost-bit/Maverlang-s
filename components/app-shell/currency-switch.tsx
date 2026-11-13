"use client";

import { useRef } from "react";

import { indexFromKey } from "@/components/ui/keys";
import { cn } from "@/lib/cn";
import { useDisplayCurrency, useSetDisplayCurrency } from "@/lib/hooks/use-display-currency";
import { useT } from "@/lib/hooks/use-t";

const OPTIONS = ["USD", "CLP"] as const;

/**
 * Interruptor chico USD/CLP (M40). Con sesión guarda en la DB; sin sesión, en
 * local. `compact` sólo aprieta el relleno horizontal: el alto sigue en 44px.
 * Se comporta como un grupo de radios: una sola parada de tabulación y flechas.
 */
export function CurrencySwitch({ className, compact = false }: { className?: string; compact?: boolean }) {
  const { t } = useT();
  const currency = useDisplayCurrency();
  const setCurrency = useSetDisplayCurrency();
  const label = t.shell.currencyLabel;
  const buttons = useRef<Record<string, HTMLButtonElement | null>>({});

  function move(key: string) {
    const current = Math.max(0, OPTIONS.indexOf(currency));
    const next = indexFromKey(key, current, OPTIONS.length);
    if (next === null) return;
    const option = OPTIONS[next];
    if (!option) return;
    if (option !== currency) setCurrency(option);
    buttons.current[option]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={(event) => {
        if (indexFromKey(event.key, 0, OPTIONS.length) === null) return;
        event.preventDefault();
        move(event.key);
      }}
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border border-border-control bg-surface-1 p-0.5",
        compact && "p-[3px]",
        className,
      )}
    >
      {OPTIONS.map((option) => {
        const active = currency === option;
        return (
          <button
            key={option}
            ref={(node) => {
              buttons.current[option] = node;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={`${label}: ${option}`}
            tabIndex={active ? 0 : -1}
            onClick={() => {
              if (!active) setCurrency(option);
            }}
            className={cn(
              "min-h-11 cursor-pointer touch-manipulation rounded-full font-mono text-[12px] font-medium whitespace-nowrap uppercase tracking-[0.04em] transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-fg",
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
