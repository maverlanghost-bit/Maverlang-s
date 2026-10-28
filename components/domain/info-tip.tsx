"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

type Box = { top: number; left: number; right: number };

function measure(button: HTMLButtonElement): Box {
  const rect = button.getBoundingClientRect();
  return { top: rect.bottom + 4, left: rect.left, right: rect.right };
}

/**
 * Botón «¿Qué es esto?»: icono i y un cuadro con 1 a 3 frases.
 * Clic o toque lo abre. Escape, otro toque en el botón o un toque afuera lo cierra.
 * El cuadro va en un portal para que no lo tape la tarjeta de abajo.
 */
export function InfoTip({
  label,
  text,
  className,
  align = "end",
}: {
  label: string;
  text: string;
  className?: string;
  align?: "start" | "end";
}) {
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<Box | null>(null);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function place() {
      const button = buttonRef.current;
      if (!button) return;
      setBox(measure(button));
    }

    function close(restore: boolean) {
      setOpen(false);
      if (restore) buttonRef.current?.focus();
    }

    function onPointer(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (rootRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      close(panelRef.current?.contains(document.activeElement) === true);
    }

    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      close(true);
    }

    panelRef.current?.focus();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    const button = buttonRef.current;
    if (button) setBox(measure(button));
    setOpen(true);
  }

  const panel =
    open && box
      ? createPortal(
          <div
            ref={panelRef}
            id={panelId}
            role="dialog"
            aria-modal="false"
            tabIndex={-1}
            style={
              align === "start"
                ? { top: box.top, left: Math.max(8, Math.min(box.left, window.innerWidth - 272)) }
                : { top: box.top, right: Math.max(8, window.innerWidth - box.right) }
            }
            className="fixed z-30 w-64 max-w-[min(16rem,calc(100vw-2.5rem))] rounded-xl border border-border/70 bg-surface-1 p-3 text-left text-sm leading-relaxed text-fg-body shadow-float outline-none"
          >
            {text}
          </div>,
          document.body,
        )
      : null;

  return (
    <div ref={rootRef} className={cn("relative inline-flex", className)}>
      <button
        ref={buttonRef}
        type="button"
        className="inline-flex size-11 items-center justify-center rounded-full text-fg-muted outline-none transition duration-[140ms] hover:bg-surface-2 hover:text-fg focus-visible:ring-4 focus-visible:ring-fg/20"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-haspopup="dialog"
        aria-label={label}
        onClick={toggle}
      >
        <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
          <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 7.2V11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="8" cy="5" r="0.75" fill="currentColor" />
        </svg>
      </button>
      {panel}
    </div>
  );
}
