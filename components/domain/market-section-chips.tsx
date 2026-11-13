import Link from "next/link";

import { cn } from "@/lib/cn";

type MarketSectionId = "stocks" | "crypto" | "earn" | "copy";

type MarketSection = { id: MarketSectionId; href: string; label: string };

const SECTIONS: readonly MarketSection[] = [
  { id: "stocks", href: "/app", label: "Acciones" },
  { id: "crypto", href: "/app/cripto", label: "Cripto" },
  { id: "earn", href: "/app/ganar", label: "Ganar" },
];

/** Chip de «Copiar carteras»: no es una pestaña nueva, vive dentro de Mercado. */
const COPY_SECTION: MarketSection = { id: "copy", href: "/app/copiar", label: "Copiar" };

/**
 * Chips de sección del mercado: navegación entre páginas, no un filtro.
 * Se montan sólo arriba de la portada (`MarketScreen`); la barra inferior
 * sigue con sus cinco pestañas y Mercado activo en las secciones.
 *
 * `showCopy` lo decide el servidor con `isCopyEnabled()`: con la sección
 * apagada el chip no aparece (ni se puede llegar por el menú). Con la sección
 * encendida, `/app/copiar/**` queda activo dentro de Mercado.
 */
export function MarketSectionChips({
  active,
  showCopy = false,
}: {
  active: MarketSectionId;
  showCopy?: boolean;
}) {
  const sections: readonly MarketSection[] = showCopy ? [...SECTIONS, COPY_SECTION] : SECTIONS;
  return (
    <nav aria-label="Secciones del mercado" className="flex min-w-0 flex-wrap items-center gap-2">
      {sections.map((section) => {
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
