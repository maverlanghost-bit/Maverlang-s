"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** Keeps the same canvas mounted while expanding; handles focus and browser Escape. */
export function useChartFullscreen() {
  const ref = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const close = useCallback(() => {
    setExpanded(false);
    if (document.fullscreenElement === ref.current) void document.exitFullscreen().catch(() => {});
  }, []);
  const toggle = useCallback(() => {
    if (expanded) { close(); return; }
    setExpanded(true);
    void ref.current?.requestFullscreen?.().catch(() => {});
  }, [expanded, close]);
  useEffect(() => {
    if (!expanded) return;
    const root = ref.current;
    if (!root) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () => [...root.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),[tabindex="0"]')].filter((element) => element.getClientRects().length > 0);
    const nestedOverlay = (target: EventTarget | null) => {
      const nested = target instanceof Element ? target.closest('[role="dialog"],[role="menu"],[role="listbox"]') : null;
      if (nested && nested !== root) return true;
      // A portal can receive Escape before focus enters its content. Observe
      // visible content as well, without taking over its dismissal handler.
      return [...root.querySelectorAll<HTMLElement>('[role="dialog"],[role="menu"],[role="listbox"]')]
        .some((element) => element !== root && element.getClientRects().length > 0);
    };
    let nestedEscapeAt = Number.NEGATIVE_INFINITY;
    const capture = (event: KeyboardEvent) => {
      if (event.key === "Escape" && nestedOverlay(event.target)) nestedEscapeAt = performance.now();
    };
    focusable()[0]?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (nestedOverlay(event.target) || (event.key === "Escape" && performance.now() - nestedEscapeAt < 500)) return;
      if (event.key === "Escape") { event.preventDefault(); close(); }
      if (event.key !== "Tab") return;
      const items = focusable();
      const first = items[0];
      const last = items[items.length - 1];
      if (!root.contains(document.activeElement)) { event.preventDefault(); first?.focus(); }
      else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    const changed = () => {
      // Browsers may leave native fullscreen on Escape even when an inner
      // overlay consumes it. Preserve the app's expanded view in that case.
      if (!document.fullscreenElement && performance.now() - nestedEscapeAt >= 500) setExpanded(false);
    };
    window.addEventListener("keydown", capture, true);
    window.addEventListener("keydown", key);
    document.addEventListener("fullscreenchange", changed);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", capture, true);
      window.removeEventListener("keydown", key);
      document.removeEventListener("fullscreenchange", changed);
      previous?.focus();
    };
  }, [expanded, close]);
  return { ref, expanded, toggle };
}
