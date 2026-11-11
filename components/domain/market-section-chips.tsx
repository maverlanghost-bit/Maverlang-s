import Link from "next/link";

import { cn } from "@/lib/cn";

type MarketSectionId = "stocks" | "crypto" | "earn";

const SECTIONS: readonly { id: MarketSectionId; href: string; label: string }[] = [
  { id: "stocks", href: "/app", label: "Acciones" },
  { id: "crypto", href: "/app/cripto", label: "Cripto" },
  { id: "earn", href: "/app/ganar", label: "Ganar" },
];

/**
 * Chips de sección del mercado: navegación entre páginas, no un filtro.
 * Se montan sólo arriba de la portada (`MarketScreen`); la barra inferior
 * sigue con sus cinco pestañas y Mercado activo en las tres secciones.
 */
export function MarketSectionChips({ active }: { active: MarketSectionId }) {
  return (
    <nav aria-label="Secciones del mercado" className="flex min-w-0 flex-wrap items-center gap-2">
      {SECTIONS.map((section) => {
        const current = section.id === active;
        return (
          <Link
            key={section.id}
            href={section.href}
            aria-current={current ? "page" : undefined}
            className={cn(
              // Misma píldora que los chips del mercado: táctil y con foco visible.
              "inline-flex min-h-11 shrink-0 items-center justify-center rounded-full px-3.5 text-[13px] font-medium whitespace-nowrap outline-none transition-all duration-150 ease-spring focus-visible:ring-4 focus-visible:ring-fg/20 active:scale-[0.98]",
              current
                ? "bg-fg text-bg shadow-xs"
                : "bg-surface-1/80 text-fg-muted hover:bg-surface-2 hover:text-fg",
            )}
          >
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}
