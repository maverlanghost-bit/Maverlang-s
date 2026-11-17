"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { Sheet } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useT } from "@/lib/hooks/use-t";

const MEDIA = "(min-width: 640px)";
function subscribe(change: () => void) {
  const query = window.matchMedia(MEDIA);
  query.addEventListener("change", change);
  return () => query.removeEventListener("change", change);
}
function desktopSnapshot() { return window.matchMedia(MEDIA).matches; }
function serverSnapshot() { return false; }

export function FilterPanel({ children, activeCount = 0, title }: { children: ReactNode; activeCount?: number; title?: string }) {
  const { language } = useT();
  const [open, setOpen] = useState(false);
  const desktop = useSyncExternalStore(subscribe, desktopSnapshot, serverSnapshot);
  const label = title ?? (language === "en" ? "Filters" : "Filtros");
  const button = <button type="button" onClick={desktop ? undefined : () => setOpen(true)} aria-expanded={open} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-border-control bg-bg px-4 text-sm font-medium text-fg hover:bg-surface-1 sm:min-h-9"><svg aria-hidden="true" className="size-4" viewBox="0 0 20 20" fill="none"><path d="M3 5h14M5 10h10M8 15h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>{label}{activeCount > 0 ? <span className="num rounded-full bg-surface-2 px-1.5 text-xs">{activeCount}</span> : null}</button>;
  const content = <div className="flex flex-col gap-4">{children}<button type="button" onClick={() => setOpen(false)} className="min-h-11 rounded-full bg-fg px-4 text-sm font-medium text-bg">{language === "en" ? "View results" : "Ver resultados"}</button></div>;
  return desktop ? <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild>{button}</PopoverTrigger><PopoverContent className="w-96" aria-label={label}><h2 className="mb-4 text-sm font-medium">{label}</h2>{content}</PopoverContent></Popover> : <>{button}<Sheet open={open} onOpenChange={setOpen} title={label}>{content}</Sheet></>;
}

export { ActiveFilters } from "@/components/ui/active-filters";
