import Link from "next/link";
import type { MouseEvent } from "react";

import { ChangeBadge } from "@/components/domain/change-badge";
import { TickerLogo } from "@/components/domain/ticker-logo";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";
import type { Suggestion } from "@/lib/market/browse";

export interface SuggestRow extends Suggestion {
  href: string;
}

/**
 * Sugerencias bajo el buscador (N20): logo, nombre, precio y variación.
 * El `onMouseDown` evita que el blur cierre la lista antes del clic.
 */
export function SearchSuggestions({
  id,
  label,
  rows,
  active,
  searching,
  emptyLabel,
  searchAllLabel,
  onHover,
  onSelect,
  onSearchAll,
}: {
  id: string;
  label: string;
  rows: readonly SuggestRow[];
  active: number;
  searching: boolean;
  emptyLabel: string;
  searchAllLabel: string;
  onHover: (index: number) => void;
  onSelect: (symbol: string) => void;
  onSearchAll: () => void;
}) {
  const keepFocus = (event: MouseEvent) => event.preventDefault();

  return (
    <div className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-xl border border-border bg-bg shadow-float">
      {searching ? (
        <div className="flex flex-col gap-1 p-2" role="status" aria-live="polite" aria-busy="true">
          {[0, 1, 2].map((key) => (
            <div key={key} className="flex items-center gap-3 rounded-lg px-2 py-2">
              <Skeleton className="size-9 shrink-0 rounded-full" />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="px-4 py-5 text-center text-sm text-fg-muted">{emptyLabel}</p>
      ) : (
        <ul role="listbox" id={id} aria-label={label} className="max-h-80 overflow-y-auto p-1">
          {rows.map((row, index) => {
            const selected = index === active;
            return (
              <li key={row.symbol} role="presentation">
                <Link
                  href={row.href}
                  role="option"
                  id={`${id}-${index}`}
                  aria-selected={selected}
                  onMouseDown={keepFocus}
                  onMouseEnter={() => onHover(index)}
                  onClick={() => onSelect(row.symbol)}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 py-2 transition duration-[140ms] ease-spring",
                    selected ? "bg-surface-3" : "hover:bg-surface-2",
                  )}
                >
                  <TickerLogo symbol={row.symbol} name={row.name} logoUrl={row.logoUrl} size={36} decorative />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-fg">{row.name}</span>
                    <span className="num block truncate text-xs text-fg-muted">
                      {row.symbol} · {row.underlying}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className="num text-sm text-fg">{formatMoney(row.price, row.currency)}</span>
                    {row.change === null ? null : <ChangeBadge value={row.change} />}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <div className="border-t border-border p-1">
        <button
          type="button"
          onMouseDown={keepFocus}
          onClick={onSearchAll}
          className="flex min-h-11 w-full cursor-pointer items-center justify-center rounded-lg px-3 text-sm font-medium text-fg transition hover:bg-surface-2"
        >
          {searchAllLabel}
        </button>
      </div>
    </div>
  );
}
