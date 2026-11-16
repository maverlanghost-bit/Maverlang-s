"use client";

import { useCallback, useState, useSyncExternalStore, type ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet } from "@/components/ui/sheet";
import { useT } from "@/lib/hooks/use-t";

const QUERY = "(min-width: 640px)";
function subscribe(change: () => void) {
  const query = window.matchMedia(QUERY);
  query.addEventListener("change", change);
  return () => query.removeEventListener("change", change);
}
function desktopSnapshot() { return window.matchMedia(QUERY).matches; }
function serverSnapshot() { return false; }

export function ChartTools({ children }: { children: ReactNode }) {
  const { language } = useT();
  const [open, setOpen] = useState(false);
  const desktop = useSyncExternalStore(subscribe, desktopSnapshot, serverSnapshot);
  const title = language === "en" ? "Chart tools" : "Herramientas del gráfico";
  const button = (
    <button
      type="button"
      aria-label={title}
      aria-expanded={open}
      onClick={desktop ? undefined : () => setOpen(true)}
      className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full border border-border-control bg-bg px-3 text-xs font-medium text-fg hover:bg-surface-1 sm:h-9"
    >
      <svg aria-hidden="true" className="size-4" viewBox="0 0 20 20" fill="none"><path d="M3 5h14M3 10h14M3 15h14M7 3v4m6 1v4m-6 1v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
      {language === "en" ? "Tools" : "Herramientas"}
    </button>
  );
  const portalContainer = useCallback(() => typeof document === "undefined" ? null : document.fullscreenElement as HTMLElement | null, []);
  if (!desktop) {
    return <>{button}<Sheet open={open} onOpenChange={setOpen} title={title}>{children}</Sheet></>;
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{button}</PopoverTrigger>
      <PopoverContent container={open ? portalContainer() : null} aria-label={title}>
        <h2 className="mb-4 text-sm font-medium">{title}</h2>
        {children}
      </PopoverContent>
    </Popover>
  );
}
