"use client";

import type { ReactNode } from "react";
import { OverlayPanel } from "@/components/ui/overlay";
import { cn } from "@/lib/cn";

/**
 * Hoja de panel: bottom sheet en móvil y panel lateral en desktop.
 *
 * La cabecera (título y cierre) queda fija y sólo el cuerpo desplaza, así el
 * cierre siempre está a la vista y no hay dos scrolls compitiendo. `fill` deja
 * el cuerpo en columna para que la acción principal se ancle al pie (barra
 * sticky) sin duplicar el área segura del iPhone.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  fill = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  fill?: boolean;
}) {
  return (
    <OverlayPanel
      open={open}
      onClose={() => onOpenChange(false)}
      title={title}
      description={description}
      panelClassName={cn(
        // Hoja: columna con cabecera fija y un solo cuerpo desplazable.
        "absolute inset-x-0 bottom-0 flex max-h-[92dvh] flex-col overflow-hidden rounded-t-xl bg-bg shadow-card animate-sheet-up",
        "px-5 pt-4",
        // Cabecera siempre visible: el título y el cierre no se van con el scroll.
        "[&>h2]:shrink-0 [&>h2]:pr-14 [&>h2]:text-[17px] [&>h2]:leading-6 [&>h2]:tracking-[-0.01em]",
        // Cuerpo: único que desplaza, con el rebote contenido.
        "[&>div]:mt-0 [&>div]:min-h-0 [&>div]:flex-1 [&>div]:overflow-y-auto [&>div]:overscroll-contain [&>div]:[scrollbar-width:thin]",
        "[&>div]:-mx-5 [&>div]:border-t [&>div]:border-border [&>div]:px-5 [&>div]:pt-5",
        // Cierre evidente: botón con borde propio, no un icono flotando sobre el contenido.
        "[&>button]:top-3 [&>button]:right-3 [&>button]:border [&>button]:border-border [&>button]:text-fg-muted",
        // Desktop: panel lateral a alto completo.
        "md:inset-y-0 md:right-0 md:left-auto md:h-full md:max-h-none md:w-[26rem] md:rounded-none md:rounded-l-xl md:border-l md:border-border md:px-7 md:pt-5 md:animate-sheet-side lg:w-[28rem]",
        "md:[&>div]:-mx-7 md:[&>div]:px-7",
        description ? "[&>h2]:pb-1 [&>p]:pb-3" : "[&>h2]:pb-3",
        fill ? "pb-0 [&>div]:flex [&>div]:flex-col" : "pb-[max(1.5rem,env(safe-area-inset-bottom))] md:pb-7",
      )}
    >
      {/* Grabber propio: hairline, sólo móvil. El del OverlayPanel queda apagado. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-2 left-1/2 h-1 w-9 -translate-x-1/2 rounded-full bg-border-strong/60 md:hidden"
      />
      {children}
    </OverlayPanel>
  );
}
