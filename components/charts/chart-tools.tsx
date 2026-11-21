"use client";

import { useCallback, useId, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/hooks/use-t";

export type ChartStyle = "area" | "line" | "candles";

export function ChartToolGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <fieldset className="min-w-0 rounded-xl border border-border px-3 pt-1 pb-3">
      <legend className="px-1.5 text-xs font-medium text-fg-muted">{label}</legend>
      {children}
    </fieldset>
  );
}

export function ChartToolButton({
  children, pressed, onClick, disabled, describedBy, label,
}: {
  children: ReactNode;
  pressed: boolean;
  onClick: () => void;
  disabled?: boolean;
  describedBy?: string;
  label?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={label}
      aria-describedby={describedBy}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "min-h-11 rounded-lg border border-border px-3 text-xs font-medium hover:bg-surface-1 disabled:cursor-not-allowed disabled:opacity-45 sm:min-h-9",
        pressed && "border-fg bg-fg text-bg hover:bg-fg",
      )}
    >
      {children}
    </button>
  );
}

export function ChartStylePicker({
  value, onChange, candlesAvailable, candleHint,
}: {
  value: ChartStyle;
  onChange: (value: ChartStyle) => void;
  candlesAvailable: boolean;
  candleHint: string;
}) {
  const { language } = useT();
  const hintId = useId();
  const en = language === "en";
  const options = [
    { value: "area", label: en ? "Area" : "Área" },
    { value: "line", label: en ? "Line" : "Línea" },
    { value: "candles", label: en ? "Candles" : "Velas" },
  ] as const;

  return (
    <ChartToolGroup label={en ? "Chart style" : "Estilo del gráfico"}>
      <div className="grid grid-cols-3 gap-1.5">
        {options.map((option) => (
          <ChartToolButton
            key={option.value}
            pressed={value === option.value}
            disabled={option.value === "candles" && !candlesAvailable}
            describedBy={option.value === "candles" && !candlesAvailable ? hintId : undefined}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </ChartToolButton>
        ))}
      </div>
      {!candlesAvailable ? <p id={hintId} className="mt-2 text-xs text-fg-muted">{candleHint}</p> : null}
    </ChartToolGroup>
  );
}

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
  const headingRef = useRef<HTMLHeadingElement>(null);
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
      <PopoverContent
        container={open ? portalContainer() : null}
        aria-label={title}
        className="flex w-[22rem] flex-col overflow-hidden p-0"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          headingRef.current?.focus({ preventScroll: true });
        }}
      >
        <h2 ref={headingRef} tabIndex={-1} className="shrink-0 border-b border-border px-4 py-3 text-sm font-medium outline-none">{title}</h2>
        <div className="min-h-0 overflow-y-auto overscroll-contain p-4">{children}</div>
      </PopoverContent>
    </Popover>
  );
}
