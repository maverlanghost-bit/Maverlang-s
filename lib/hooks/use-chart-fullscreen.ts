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
    focusable()[0]?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const nested = event.target instanceof Element ? event.target.closest('[role="dialog"]') : null;
      if (nested && nested !== root) return;
      if (event.key === "Escape") { event.preventDefault(); close(); }
      if (event.key !== "Tab") return;
      const items = focusable();
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    const changed = () => { if (!document.fullscreenElement) setExpanded(false); };
    window.addEventListener("keydown", key);
    document.addEventListener("fullscreenchange", changed);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener("keydown", key);
      document.removeEventListener("fullscreenchange", changed);
      previous?.focus();
    };
  }, [expanded, close]);
  return { ref, expanded, toggle };
}
