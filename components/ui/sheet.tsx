"use client";

import type { ReactNode } from "react";
import { OverlayPanel } from "@/components/ui/overlay";
import { cn } from "@/lib/cn";

/**
 * Hoja de panel: pantalla completa en móvil y panel lateral en desktop.
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
        // Móvil: pantalla completa, sin esquinas ni hueco sobre el scrim.
        "absolute inset-x-0 bottom-0 flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden bg-bg animate-sheet-up",
        "px-5 pt-[max(1rem,env(safe-area-inset-top))]",
        // Cabecera siempre visible: el título y el cierre no se van con el scroll.
        "[&>h2]:shrink-0 [&>h2]:pr-14 [&>h2]:text-lg [&>h2]:leading-6",
        // Cuerpo: único que desplaza, con el rebote contenido.
        "[&>div]:mt-0 [&>div]:min-h-0 [&>div]:flex-1 [&>div]:overflow-y-auto [&>div]:overscroll-contain [&>div]:[scrollbar-width:thin]",
        "[&>div]:-mx-5 [&>div]:border-t [&>div]:border-border [&>div]:px-5 [&>div]:pt-5",
        // Cierre evidente y táctil (44 px): botón con borde propio, no un icono flotando.
        "[&>button]:top-[max(0.75rem,env(safe-area-inset-top))] [&>button]:right-3 [&>button]:border [&>button]:border-control [&>button]:bg-bg [&>button]:text-fg",
        // Desktop: panel lateral a alto completo.
        "md:inset-y-0 md:right-0 md:left-auto md:h-full md:max-h-none md:w-[26rem] md:rounded-l-xl md:border-l md:border-border md:px-7 md:pt-5 md:animate-sheet-side lg:w-[28rem]",
        "md:[&>button]:top-5 md:[&>div]:-mx-7 md:[&>div]:px-7",
        description ? "[&>h2]:pb-1 [&>p]:pb-3" : "[&>h2]:pb-3",
        fill ? "pb-0 [&>div]:flex [&>div]:flex-col" : "pb-[max(1.5rem,env(safe-area-inset-bottom))] md:pb-7",
      )}
    >
      {children}
    </OverlayPanel>
  );
}
