"use client";

import type { ReactNode } from "react";
import { OverlayPanel } from "@/components/ui/overlay";

/**
 * Diálogo de confirmación. En móvil se apoya arriba del borde inferior con
 * 12 px de margen (zona del pulgar) y su cabecera queda fija: sólo el cuerpo
 * desplaza, así el título y el cierre de 44 px nunca se van con el scroll.
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <OverlayPanel
      open={open}
      onClose={() => onOpenChange(false)}
      title={title}
      description={description}
      frameClassName="flex items-end justify-center p-3 sm:items-center sm:p-6"
      panelClassName="flex max-h-[88dvh] w-full max-w-md flex-col overflow-hidden rounded-xl bg-bg p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-float animate-pop-in sm:max-h-[85dvh] sm:p-6 [&>h2]:shrink-0 [&>p]:shrink-0 [&>div]:min-h-0 [&>div]:flex-1 [&>div]:overflow-y-auto [&>div]:overscroll-contain [&>div]:[scrollbar-width:thin] [&>div]:-mx-5 [&>div]:px-5 sm:[&>div]:-mx-6 sm:[&>div]:px-6"
    >
      {children}
    </OverlayPanel>
  );
}
