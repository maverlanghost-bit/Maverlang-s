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
 *
 * En móvil la fila no envuelve ni empuja la página: se desplaza dentro de su
 * propio carril (`overflow-x-auto`). Cada chip conserva 44 px de alto y 44 px
 * de ancho mínimo como área táctil.
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
    <nav
      aria-label="Secciones del mercado"
      className="no-scrollbar -my-1 flex min-w-0 snap-x snap-mandatory items-center gap-x-6 overflow-x-auto overscroll-x-contain py-1"
    >
      {sections.map((section) => {
        const current = section.id === active;
        return (
          <Link
            key={section.id}
            href={section.href}
            aria-current={current ? "page" : undefined}
            className={cn(
              // Mismo criterio que las chips del mercado: texto, no cápsula.
              // El activo va en tinta y subrayado; el resto en gris y oscurece
              // al pasar el puntero. 44px en móvil, 32px con puntero.
              "inline-flex min-h-11 min-w-11 shrink-0 snap-start cursor-pointer items-center justify-center text-[13px] leading-5 font-medium whitespace-nowrap transition-colors duration-150 ease-spring sm:min-h-8",
              current ? "text-fg" : "text-fg-muted hover:text-fg",
            )}
          >
            <span className={cn(current && "underline decoration-2 underline-offset-[5px]")}>{section.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
