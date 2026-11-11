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
              // Misma píldora que los chips del mercado; el contorno inactivo
              // usa `border-control` (3,74:1) para no parecer deshabilitado.
              "inline-flex min-h-11 shrink-0 items-center justify-center rounded-full border px-3.5 text-[13px] font-medium whitespace-nowrap transition-colors duration-150 ease-spring active:scale-[0.98]",
              current
                ? "border-fg bg-fg text-bg shadow-xs"
                : "border-border-control bg-bg text-fg hover:bg-surface-1",
            )}
          >
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}
