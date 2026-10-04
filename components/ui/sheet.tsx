"use client";

import type { ReactNode } from "react";
import { OverlayPanel } from "@/components/ui/overlay";

export function Sheet({
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
      grabber
      panelStyle={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
      panelClassName="absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto overscroll-contain rounded-t-3xl bg-bg p-5 shadow-float animate-sheet-up md:inset-y-0 md:right-0 md:left-auto md:h-full md:max-h-none md:w-96 md:rounded-none md:rounded-l-3xl md:animate-sheet-side"
    >
      {children}
    </OverlayPanel>
  );
}
