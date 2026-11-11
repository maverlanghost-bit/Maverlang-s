import Link from "next/link";

import { cn } from "@/lib/cn";
import type { CopyFamily } from "@/lib/copy/types";

export const COPY_FAMILY_LABELS: Record<CopyFamily, string> = {
  "13f": "13F",
  etf: "ETF",
  broker_cl: "Corredoras CL",
  afp: "AFP",
  thematic: "Temáticas",
};

export type FamilyTabItem = {
  value: CopyFamily | "all";
  label: string;
  count: number;
  href: string;
};

/**
 * Tabs por familia como navegación con `searchParams` (sin estado de cliente):
 * cada pestaña es un enlace que conserva la búsqueda y el orden actuales.
 */
export function FamilyTabs({
  items,
  active,
}: {
  items: readonly FamilyTabItem[];
  active: CopyFamily | "all";
}) {
  return (
    <nav
      aria-label="Familias de carteras"
      className="-mx-1 flex min-w-0 items-center gap-2 overflow-x-auto scroll-px-4 px-1 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {items.map((item) => {
        const current = item.value === active;
        return (
          <Link
            key={item.value}
            href={item.href}
            aria-current={current ? "true" : undefined}
            className={cn(
              "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] font-medium whitespace-nowrap transition-colors duration-150 ease-spring active:scale-[0.98]",
              current
                ? "border-fg bg-fg text-bg shadow-xs"
                : "border-border-control bg-bg text-fg hover:bg-surface-1",
            )}
          >
            {item.label}
            <span
              className={cn(
                "font-mono text-[11px] tabular-nums",
                current ? "text-bg/70" : "text-fg-muted",
              )}
            >
              {item.count}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
