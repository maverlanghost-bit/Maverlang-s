"use client";

import type { ReactNode } from "react";
import { OverlayPanel } from "@/components/ui/overlay";

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
      frameClassName="flex items-center justify-center p-4 sm:p-6"
      panelClassName="max-h-[85dvh] w-full max-w-md overflow-y-auto overscroll-contain [scrollbar-width:thin] rounded-xl bg-bg p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-float animate-pop-in sm:p-6"
    >
      {children}
    </OverlayPanel>
  );
}
