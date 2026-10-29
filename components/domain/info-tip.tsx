"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

type Box = { top: number; left: number; width: number; maxHeight: number };

const MARGIN = 8;
const GAP = 4;
const MAX_WIDTH = 288;

function layout(button: HTMLButtonElement, wantHeight: number, align: "start" | "end"): Box {
  const rect = button.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const width = Math.min(MAX_WIDTH, Math.max(0, vw - MARGIN * 2));
  const maxLeft = Math.max(MARGIN, vw - MARGIN - width);
  const preferred = align === "start" ? rect.left : rect.right - width;
  const left = Math.min(Math.max(MARGIN, preferred), maxLeft);
  const roomBelow = vh - MARGIN - (rect.bottom + GAP);
  const roomAbove = rect.top - GAP - MARGIN;
  const want = Math.max(wantHeight, 48);
  if (want <= roomBelow || roomBelow >= roomAbove) {
    return { top: rect.bottom + GAP, left, width, maxHeight: Math.max(48, roomBelow) };
  }
  const maxHeight = Math.max(48, roomAbove);
  const used = Math.min(want, maxHeight);
  return { top: Math.max(MARGIN, rect.top - GAP - used), left, width, maxHeight };
}

function sameBox(current: Box | null, next: Box) {
  if (!current) return false;
  return (
    Math.round(current.top) === Math.round(next.top) &&
    Math.round(current.left) === Math.round(next.left) &&
    Math.round(current.width) === Math.round(next.width) &&
    Math.round(current.maxHeight) === Math.round(next.maxHeight)
  );
}

/**
 * Icono (i) de 16px con área táctil de 40px. El cuadro queda dentro de la pantalla.
 * Clic o toque lo abre. Escape, otro toque en el botón o un toque afuera lo cierra.
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
      const next = layout(button, panelRef.current?.scrollHeight ?? 120, align);
      setBox((current) => (sameBox(current, next) ? current : next));
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

    place();
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
  }, [open, align, text]);

  function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    const button = buttonRef.current;
    if (button) setBox(layout(button, 120, align));
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
            style={{ top: box.top, left: box.left, width: box.width, maxHeight: box.maxHeight }}
            className="fixed z-30 overflow-y-auto overscroll-contain rounded-xl border border-border/70 bg-surface-1 p-3 text-left text-sm leading-relaxed text-fg-body shadow-float outline-none"
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
        className="inline-flex size-10 items-center justify-center rounded-full text-fg-muted outline-none transition duration-[140ms] hover:bg-surface-2 hover:text-fg focus-visible:ring-4 focus-visible:ring-fg/20"
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
