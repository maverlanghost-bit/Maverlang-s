"use client";

import { useEffect, useId, useRef, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { IconButton } from "@/components/ui/icon-button";
import { IconClose } from "@/components/ui/icons";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

let scrollLocks = 0;
let scrollSnapshot = "";

function lockScroll() {
  scrollLocks += 1;
  if (scrollLocks === 1) {
    scrollSnapshot = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
}

function unlockScroll() {
  scrollLocks = Math.max(0, scrollLocks - 1);
  if (scrollLocks === 0) document.body.style.overflow = scrollSnapshot;
}

function subscribe() {
  return () => {};
}

function useMounted() {
  return useSyncExternalStore(subscribe, () => true, () => false);
}

function Portal({ children }: { children: ReactNode }) {
  const mounted = useMounted();
  if (!mounted) return null;
  return createPortal(children, document.body);
}

function useOverlay(open: boolean, onClose: () => void) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    function focusable() {
      if (!panel) return [];
      return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (element) => !element.hasAttribute("disabled"),
      );
    }

    const initial = focusable();
    (initial[0] ?? panel)?.focus();

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) {
        event.preventDefault();
        return;
      }
      const active = document.activeElement;
      if (event.shiftKey && (active === first || (panel && !panel.contains(active)))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    lockScroll();
    return () => {
      document.removeEventListener("keydown", onKey);
      unlockScroll();
      previous?.focus();
    };
  }, [open]);

  return panelRef;
}

export function OverlayPanel({
  open,
  onClose,
  title,
  description,
  children,
  frameClassName,
  panelClassName,
  panelStyle,
  grabber = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  frameClassName?: string;
  panelClassName?: string;
  panelStyle?: CSSProperties;
  grabber?: boolean;
}) {
  const panelRef = useOverlay(open, onClose);
  const titleId = useId();
  const descriptionId = useId();

  if (!open) return null;

  return (
    <Portal>
      <div className={cn("fixed inset-0 z-50", frameClassName)}>
        <div className="absolute inset-0 animate-fade-in bg-fg/40" onClick={onClose} aria-hidden />
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={description ? descriptionId : undefined}
          tabIndex={-1}
          style={panelStyle}
          className={cn("relative z-10 outline-none", panelClassName)}
        >
          {grabber ? <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-surface-3 md:hidden" aria-hidden /> : null}
          <h2 id={titleId} className="pr-16 text-lg font-medium text-fg">
            {title}
          </h2>
          {description ? (
            <p id={descriptionId} className="mt-1 text-sm leading-relaxed text-fg-muted">
              {description}
            </p>
          ) : null}
          <div className="mt-4">{children}</div>
          <IconButton label="Cerrar" size="md" className="absolute top-3 right-3" onClick={onClose}>
            <IconClose />
          </IconButton>
        </div>
      </div>
    </Portal>
  );
}
