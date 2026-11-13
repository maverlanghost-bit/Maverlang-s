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
 *
 * Subrayado hairline en vez de píldoras: la fila envuelve en móvil (nada de
 * scroll horizontal) y cada pestaña mantiene 44 px de alto táctil.
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
      className="flex min-w-0 flex-wrap items-center gap-x-4 border-b border-border sm:gap-x-6"
    >
      {items.map((item) => {
        const current = item.value === active;
        return (
          <Link
            key={item.value}
            href={item.href}
            aria-current={current ? "true" : undefined}
            className={cn(
              "-mb-px inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 border-b-2 px-1 pt-1 pb-2.5 text-[13px] font-medium whitespace-nowrap transition-colors duration-150 ease-spring",
              current
                ? "border-fg text-fg"
                : "border-transparent text-fg-muted hover:border-border-strong hover:text-fg",
            )}
          >
            {item.label}
            <span
              className={cn(
                "num text-[13px] tabular-nums",
                current ? "text-fg-muted" : "text-fg-subtle",
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
