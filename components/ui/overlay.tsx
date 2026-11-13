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
let paddingSnapshot = "";

function lockScroll() {
  scrollLocks += 1;
  if (scrollLocks !== 1) return;
  // Sin compensar la barra, `overflow: hidden` corre el layout ~15 px al abrir.
  const scrollbar = window.innerWidth - document.documentElement.clientWidth;
  scrollSnapshot = document.body.style.overflow;
  paddingSnapshot = document.body.style.paddingRight;
  document.body.style.overflow = "hidden";
  if (scrollbar > 0) document.body.style.paddingRight = `${scrollbar}px`;
}

function unlockScroll() {
  scrollLocks = Math.max(0, scrollLocks - 1);
  if (scrollLocks !== 0) return;
  document.body.style.overflow = scrollSnapshot;
  document.body.style.paddingRight = paddingSnapshot;
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

/**
 * Un control dentro de `[hidden]`, `[inert]` o `aria-hidden` no recibe foco
 * (paneles de pestañas cerrados, acciones ocultas en móvil). Sin este filtro
 * el primer Tab podía caer en un elemento invisible y el foco se perdía.
 */
function isFocusable(element: HTMLElement): boolean {
  if (element.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
  const style = window.getComputedStyle(element);
  return (
    style.display !== "none" && style.visibility !== "hidden" && element.getClientRects().length > 0
  );
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
        (element) => !element.hasAttribute("disabled") && isFocusable(element),
      );
    }

    const initial = focusable();
    let autoFocused: HTMLElement | null = initial[0] ?? panel;
    autoFocused?.focus();

    // Si al abrir el contenido todavía carga (p. ej. un esqueleto), el foco cae
    // en el cierre o en el panel. Cuando llega el contenido real, se mueve al
    // primer control, sólo mientras la persona no haya tocado nada.
    const observer =
      panel && typeof MutationObserver !== "undefined"
        ? new MutationObserver(() => {
            if (!autoFocused || document.activeElement !== autoFocused) {
              stopFollowing();
              return;
            }
            const first = focusable()[0];
            if (first && first !== autoFocused) {
              autoFocused = first;
              first.focus();
            }
          })
        : null;
    function stopFollowing() {
      observer?.disconnect();
      autoFocused = null;
      document.removeEventListener("keydown", stopFollowing, true);
      document.removeEventListener("pointerdown", stopFollowing, true);
    }
    if (observer && panel) {
      observer.observe(panel, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled", "hidden"] });
      document.addEventListener("keydown", stopFollowing, true);
      document.addEventListener("pointerdown", stopFollowing, true);
    }

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
      stopFollowing();
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
        <div
          className="absolute inset-0 animate-fade-in touch-none bg-fg/50"
          onClick={onClose}
          aria-hidden
        />
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
          <h2 id={titleId} className="pr-16 text-lg font-medium text-balance text-fg">
            {title}
          </h2>
          {description ? (
            <p id={descriptionId} className="mt-1 text-pretty text-sm leading-relaxed text-fg-muted">
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
