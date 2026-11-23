"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { OverlayPanel } from "@/components/ui/overlay";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/hooks/use-t";

/** Alto de la tarjeta en reposo, como fracción de la pantalla (coincide con `h-[92dvh]`). */
const CARD_PEEK = 0.92;
/** Arrastre hacia abajo, bajo el alto de reposo, que cierra la hoja. */
const DISMISS_PX = 110;
/** Velocidad (px/ms) que cuenta como gesto rápido. */
const FLICK = 0.7;
const DESKTOP = "(min-width: 768px)";

type Drag = { y0: number; h0: number; lastY: number; lastT: number; v: number; panel: HTMLElement; moved: boolean };

/**
 * Asa de la tarjeta en celular. Arrastrar hacia arriba la lleva a pantalla
 * completa; hacia abajo la devuelve a su alto y, más allá, la cierra. Tocarla
 * (o Enter/Espacio) alterna entre los dos altos, así el gesto no es la única vía.
 */
function SheetGrip({
  expanded,
  onExpandedChange,
  onDismiss,
  dismissible,
}: {
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onDismiss: () => void;
  dismissible: boolean;
}) {
  const { language } = useT();
  const ref = useRef<HTMLButtonElement>(null);
  const drag = useRef<Drag | null>(null);
  const skipClick = useRef(false);

  function place(panel: HTMLElement, height: number) {
    const peek = window.innerHeight * CARD_PEEK;
    const max = window.innerHeight;
    if (height >= peek) {
      panel.style.height = `${Math.min(height, max)}px`;
      panel.style.transform = "";
    } else {
      panel.style.height = `${peek}px`;
      panel.style.transform = `translateY(${peek - height}px)`;
    }
  }

  function release(panel: HTMLElement) {
    // Se devuelve la transición antes de soltar los valores en línea para que
    // la tarjeta se asiente con la curva de la hoja en vez de saltar.
    panel.style.transition = "";
    void panel.offsetHeight;
    panel.style.height = "";
    panel.style.transform = "";
  }

  function onPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (window.matchMedia(DESKTOP).matches || event.button !== 0) return;
    const panel = ref.current?.closest<HTMLElement>('[role="dialog"]');
    if (!panel) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const now = performance.now();
    drag.current = { y0: event.clientY, h0: panel.getBoundingClientRect().height, lastY: event.clientY, lastT: now, v: 0, panel, moved: false };
    panel.style.transition = "none";
  }

  function onPointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    if (!d) return;
    const dy = event.clientY - d.y0;
    if (Math.abs(dy) > 4) d.moved = true;
    const now = performance.now();
    const dt = now - d.lastT;
    if (dt > 0) d.v = (event.clientY - d.lastY) / dt;
    d.lastY = event.clientY;
    d.lastT = now;
    place(d.panel, d.h0 - dy);
  }

  function onPointerEnd(event: ReactPointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!d.moved) {
      release(d.panel);
      return;
    }
    skipClick.current = true;
    const peek = window.innerHeight * CARD_PEEK;
    const height = d.h0 - (event.clientY - d.y0);
    const closing = dismissible && (height < peek - DISMISS_PX || (d.v > FLICK && height < peek + 8));
    if (closing) {
      d.panel.style.transition = "transform 200ms cubic-bezier(0.4, 0, 0.2, 1)";
      d.panel.style.transform = "translateY(100%)";
      window.setTimeout(onDismiss, 190);
      return;
    }
    const next = d.v < -FLICK ? true : d.v > FLICK ? false : height > (peek + window.innerHeight) / 2;
    onExpandedChange(next);
    release(d.panel);
  }

  return (
    <span className="-mx-5 block shrink-0 md:hidden">
      <button
        ref={ref}
        type="button"
        aria-expanded={expanded}
        aria-label={
          language === "en"
            ? expanded ? "Shrink panel" : "Expand panel"
            : expanded ? "Reducir panel" : "Expandir panel"
        }
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onClick={(event) => {
          if (skipClick.current) {
            skipClick.current = false;
            return;
          }
          // El toque no hace nada (la tarjeta se mueve arrastrando); Enter/Espacio
          // (detail 0) sí alterna los dos altos para quien no puede arrastrar.
          if (event.detail === 0) onExpandedChange(!expanded);
        }}
        className="flex h-12 w-full cursor-grab touch-none items-start justify-center pt-2.5 outline-none active:cursor-grabbing focus-visible:[&>span]:bg-fg"
      >
        <span aria-hidden className="h-1.5 w-11 rounded-full bg-surface-3 transition-colors" />
      </button>
    </span>
  );
}

/**
 * Hoja de panel. En escritorio es un panel lateral.
 *
 * En celular hay dos formas:
 * - `mobile="full"` (por defecto): pantalla completa.
 * - `mobile="card"`: tarjeta desde abajo con esquinas superiores redondeadas,
 *   un poco más baja que la pantalla, con asa para llevarla a pantalla
 *   completa o cerrarla arrastrando.
 *
 * La cabecera (título y cierre) queda fija y sólo el cuerpo desplaza, así el
 * cierre siempre está a la vista y no hay dos scrolls compitiendo. `fill` deja
 * el cuerpo en columna para que la acción principal se ancle al pie (barra
 * sticky) sin duplicar el área segura del iPhone.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  fill = false,
  dismissible = true,
  mobile = "full",
  hideTitleOnMobile = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  fill?: boolean;
  dismissible?: boolean;
  mobile?: "full" | "card";
  /** Tarjeta en celular: el título queda sólo para lectores de pantalla y sin línea bajo la cabecera. */
  hideTitleOnMobile?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const card = mobile === "card";
  const close = () => {
    setExpanded(false);
    onOpenChange(false);
  };

  return (
    <OverlayPanel
      open={open}
      onClose={close}
      title={title}
      description={description}
      dismissible={dismissible}
      panelState={card ? (expanded ? "expanded" : "peek") : undefined}
      // En celular la tarjeta se cierra arrastrando hacia abajo o con la X, no tocando el fondo.
      onScrimClick={card ? () => { if (window.matchMedia(DESKTOP).matches && dismissible) close(); } : undefined}
      beforeTitle={
        card ? (
          <SheetGrip expanded={expanded} onExpandedChange={setExpanded} onDismiss={close} dismissible={dismissible} />
        ) : null
      }
      panelClassName={cn(
        // Hoja: columna con cabecera fija y un solo cuerpo desplazable.
        "absolute inset-x-0 bottom-0 flex max-h-[100dvh] flex-col overflow-hidden bg-bg animate-sheet-up",
        card
          ? [
              // Tarjeta: 92 % de la pantalla, esquinas superiores suaves y sombra de flotante.
              "h-[92dvh] rounded-t-[22px] border-t border-border px-5 pt-0 shadow-[0_-12px_40px_rgb(0_0_0/0.14)]",
              "transition-[height,border-radius] duration-[240ms] ease-[cubic-bezier(0.25,1,0.5,1)] motion-reduce:transition-none",
              "data-[state=expanded]:h-[100dvh] data-[state=expanded]:rounded-t-none data-[state=expanded]:pt-[env(safe-area-inset-top)]",
              hideTitleOnMobile
                ? [
                    // Fila superior de 48 px: asa al centro y X a la derecha; sin título ni línea.
                    "max-md:[&>h2]:sr-only max-md:[&>div]:border-t-0 max-md:[&>div]:pt-1",
                    "[&>button]:top-1 data-[state=expanded]:[&>button]:top-[calc(env(safe-area-inset-top)+0.25rem)]",
                  ]
                : "[&>button]:top-4 data-[state=expanded]:[&>button]:top-[calc(env(safe-area-inset-top)+1rem)]",
            ]
          : [
              // Móvil: pantalla completa, sin esquinas ni hueco sobre el scrim.
              "h-[100dvh] px-5 pt-[max(1rem,env(safe-area-inset-top))]",
              "[&>button]:top-[max(0.75rem,env(safe-area-inset-top))]",
            ],
        // Cabecera siempre visible: el título y el cierre no se van con el scroll.
        "[&>h2]:shrink-0 [&>h2]:pr-14 [&>h2]:text-lg [&>h2]:leading-6",
        // Cuerpo: único que desplaza, con el rebote contenido.
        "[&>div]:mt-0 [&>div]:min-h-0 [&>div]:flex-1 [&>div]:overflow-y-auto [&>div]:overscroll-contain [&>div]:[scrollbar-width:thin]",
        "[&>div]:-mx-5 [&>div]:border-t [&>div]:border-border [&>div]:px-5 [&>div]:pt-5",
        // Cierre limpio y táctil (44 px): icono sin borde, fondo suave al pasar o presionar.
        "[&>button]:right-3 [&>button]:rounded-full [&>button]:border-0 [&>button]:bg-transparent [&>button]:text-fg-body",
        "[&>button]:transition-colors [&>button:hover]:bg-surface-2 [&>button:hover]:text-fg [&>button:active]:bg-surface-3",
        // Desktop: panel lateral a alto completo.
        "md:inset-y-0 md:right-0 md:left-auto md:h-full md:max-h-none md:w-[26rem] md:rounded-l-xl md:rounded-tr-none md:border-t-0 md:border-l md:border-border md:px-7 md:pt-5 md:shadow-none md:animate-sheet-side lg:w-[28rem]",
        "md:[&>button]:top-5 md:[&>div]:-mx-7 md:[&>div]:px-7",
        description ? "[&>h2]:pb-1 [&>p]:pb-3" : "[&>h2]:pb-3",
        card && !hideTitleOnMobile && "[&>h2]:pt-1",
        fill ? "pb-0 [&>div]:flex [&>div]:flex-col" : "pb-[max(1.5rem,env(safe-area-inset-bottom))] md:pb-7",
      )}
    >
      {children}
    </OverlayPanel>
  );
}
