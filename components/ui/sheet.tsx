"use client";

import type { ReactNode } from "react";
import { OverlayPanel } from "@/components/ui/overlay";
import { cn } from "@/lib/cn";

/**
 * Hoja de panel: bottom sheet en móvil y panel lateral en desktop.
 *
 * `fill` deja la hoja a alto completo y permite que el contenido ancle su
 * acción al pie (barra sticky). Las hojas de navegación no lo necesitan.
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
        "absolute inset-x-0 bottom-0 max-h-[92dvh] overflow-y-auto overscroll-contain rounded-t-2xl bg-bg shadow-float animate-sheet-up",
        "px-5 pt-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]",
        "md:inset-y-0 md:right-0 md:left-auto md:h-full md:max-h-none md:w-[26rem] md:rounded-none md:rounded-l-2xl md:border-l md:border-border md:px-7 md:pt-6 md:pb-7 md:animate-sheet-side lg:w-[28rem]",
        "[&>h2]:text-[17px] [&>h2]:leading-6 [&>h2]:tracking-[-0.01em] [&>button]:top-4 [&>button]:right-4",
        fill && "flex flex-col [&>div]:flex [&>div]:flex-1 [&>div]:flex-col",
      )}
    >
      {/* Grabber propio: hairline, sólo móvil. El del OverlayPanel queda apagado. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-2 left-1/2 h-1 w-9 -translate-x-1/2 rounded-full bg-border-strong/60 md:hidden"
      />
      <span aria-hidden="true" className="-mx-5 block h-px bg-border md:-mx-7" />
      <div className={cn("pt-5", fill && "flex flex-1 flex-col [&>*]:flex-1")}>{children}</div>
    </OverlayPanel>
  );
}
