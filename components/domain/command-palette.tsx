"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";

import { TickerLogo } from "@/components/domain/ticker-logo";
import { IconClose, IconSearch } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { useTickers } from "@/lib/hooks/queries";
import type { Ticker } from "@/lib/types";

/**
 * Buscador rápido de la plataforma (Ctrl+K / ⌘K).
 *
 * Cerrado no pinta el diálogo: sólo queda el botón flotante de acceso. El
 * catálogo sale de `useTickers` (misma caché que el mercado) y los atajos son
 * rutas fijas: el copy va en español directo, sin claves de i18n.
 */

type Shortcut = { id: string; label: string; hint: string; href: string };

const SHORTCUTS: readonly Shortcut[] = [
  { id: "cartera", label: "Cartera", hint: "Posiciones y órdenes", href: "/app/cartera" },
  { id: "billetera", label: "Billetera", hint: "Saldo y movimientos", href: "/app/billetera" },
  { id: "depositar", label: "Depositar", hint: "Cargar saldo", href: "/app/billetera/depositar" },
  { id: "enviar", label: "Enviar", hint: "Transferir saldo", href: "/app/billetera/enviar" },
];

/** Filas máximas a la vez: sin texto, 4 acciones + 4 atajos. */
const MAX_ITEMS = 8;

/** Clave de búsqueda: minúsculas y sin acentos ("acción" también encuentra "accion"). */
function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/** Coincidencia sobre símbolo, nombre y subyacente (requisito del buscador). */
function matchesTicker(ticker: Ticker, needle: string): boolean {
  return (
    normalize(ticker.symbol).includes(needle) ||
    normalize(ticker.name).includes(needle) ||
    normalize(ticker.underlying).includes(needle)
  );
}

type PaletteItem =
  | { kind: "stock"; id: string; ticker: Ticker }
  | { kind: "shortcut"; id: string; shortcut: Shortcut };

const KBD_CLASS =
  "rounded border border-border bg-surface-1 px-1.5 py-0.5 font-sans text-[10px] leading-none text-fg-muted";

function ChevronIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="size-4 shrink-0 text-fg-subtle">
      <path
        d="M6 3.5 10.5 8 6 12.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Icono genérico de ruta para los atajos fijos. */
function RouteIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" fill="none" className="size-4">
      <path
        d="M3.5 12.5v-3a3 3 0 0 1 3-3h6M10 4l2.5 2.5L10 9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CommandPalette() {
  const router = useRouter();
  const { data: tickers, isPending } = useTickers();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listId = useId();

  /** Cerrar deja el panel limpio: el próximo Ctrl+K abre en blanco. */
  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setActiveIndex(0);
  }, []);

  const openPalette = useCallback(() => {
    setQuery("");
    setActiveIndex(0);
    setOpen(true);
  }, []);

  // Ctrl+K y ⌘K en toda la ventana. Escape cierra aunque el foco ya no esté
  // en el input (por ejemplo, después de tocar el backdrop).
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (open) close();
        else openPalette();
        return;
      }
      if (open && event.key === "Escape") {
        event.preventDefault();
        close();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, close, openPalette]);

  // Autofocus real al montar el diálogo (no `autoFocus`, que roba foco al SSR).
  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  // Fondo quieto mientras el modal está abierto.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const normalizedQuery = normalize(query);

  const items = useMemo<PaletteItem[]>(() => {
    const shortcutItems: PaletteItem[] = SHORTCUTS.filter(
      (shortcut) =>
        normalizedQuery.length === 0 ||
        normalize(`${shortcut.label} ${shortcut.hint}`).includes(normalizedQuery),
    ).map((shortcut) => ({ kind: "shortcut", id: `shortcut-${shortcut.id}`, shortcut }));

    // Los atajos que coinciden reservan su sitio: el texto buscado nunca los tapa.
    const stockLimit = Math.max(MAX_ITEMS - shortcutItems.length, 1);
    const stockItems: PaletteItem[] = (tickers ?? [])
      .filter((ticker) => ticker.enabled)
      .filter((ticker) => normalizedQuery.length === 0 || matchesTicker(ticker, normalizedQuery))
      .slice(0, stockLimit)
      .map((ticker) => ({ kind: "stock", id: `stock-${ticker.symbol}`, ticker }));

    return [...stockItems, ...shortcutItems].slice(0, MAX_ITEMS);
  }, [tickers, normalizedQuery]);

  const safeIndex = items.length === 0 ? -1 : Math.min(activeIndex, items.length - 1);
  const activeItem = safeIndex >= 0 ? items[safeIndex] : undefined;

  // La fila activa siempre queda a la vista al moverse con el teclado.
  useEffect(() => {
    if (!open || safeIndex < 0) return;
    optionRefs.current[safeIndex]?.scrollIntoView({ block: "nearest" });
  }, [open, safeIndex]);

  const go = useCallback(
    (href: string) => {
      close();
      router.push(href);
    },
    [close, router],
  );

  const run = (item: PaletteItem) => {
    go(
      item.kind === "stock"
        ? `/app/accion/${encodeURIComponent(item.ticker.symbol)}`
        : item.shortcut.href,
    );
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    // Con el foco en un botón (Comprar, cerrar) manda la acción nativa del botón.
    if (event.target instanceof HTMLButtonElement) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (safeIndex >= 0) setActiveIndex((safeIndex + 1) % items.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (safeIndex >= 0) setActiveIndex((safeIndex - 1 + items.length) % items.length);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (activeItem) run(activeItem);
    }
  };

  return (
    <>
      {open ? null : (
        <button
          type="button"
          onClick={openPalette}
          aria-label="Búsqueda rápida"
          title="Búsqueda rápida (Ctrl+K)"
          className="fixed right-4 bottom-[calc(var(--app-tabs-height,0px)+1rem)] z-40 flex size-12 items-center justify-center rounded-full border border-border bg-bg text-fg shadow-float transition-colors hover:bg-surface-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg md:right-6 md:bottom-6"
        >
          <IconSearch className="size-5" />
        </button>
      )}

      {open ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[10vh] sm:pt-[12vh]">
          {/* Backdrop: botón real para cerrar con clic, fuera del orden de tabulación. */}
          <button
            type="button"
            tabIndex={-1}
            aria-label="Cerrar búsqueda"
            onClick={close}
            className="absolute inset-0 cursor-default bg-fg/30 backdrop-blur-sm"
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-label="Búsqueda rápida"
            onKeyDown={handleKeyDown}
            className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-border bg-bg shadow-float"
          >
            <div className="flex items-center gap-2.5 border-b border-border px-4">
              <IconSearch className="size-4 shrink-0 text-fg-muted" />
              <input
                ref={inputRef}
                type="text"
                role="combobox"
                aria-expanded={true}
                aria-controls={listId}
                aria-activedescendant={activeItem ? `${listId}-${activeItem.id}` : undefined}
                aria-autocomplete="list"
                aria-label="Buscar acción o ir a"
                autoComplete="off"
                spellCheck={false}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  // El índice vuelve al primer resultado con cada letra nueva.
                  setActiveIndex(0);
                }}
                placeholder="Buscar acción o ir a..."
                className="min-h-14 min-w-0 flex-1 bg-transparent text-base text-fg outline-none placeholder:text-fg-muted"
              />
              <button
                type="button"
                onClick={close}
                aria-label="Cerrar búsqueda"
                className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-surface-1 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg"
              >
                <IconClose className="size-4" />
              </button>
            </div>

            <div
              id={listId}
              role={items.length > 0 && !isPending ? "listbox" : undefined}
              aria-label="Resultados"
              className="max-h-[min(60vh,26rem)] overflow-y-auto overscroll-contain p-2"
            >
              {isPending ? (
                <p className="px-3 py-8 text-center text-sm text-fg-muted">Cargando catálogo...</p>
              ) : items.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-fg-muted">Sin resultados</p>
              ) : (
                <div className="flex flex-col gap-0.5">
                  {items.map((item, index) => {
                    const previous = items[index - 1];
                    const heading =
                      previous?.kind === item.kind
                        ? null
                        : item.kind === "stock"
                          ? "Acciones"
                          : "Ir a";
                    const isActive = index === safeIndex;
                    const optionProps = {
                      id: `${listId}-${item.id}`,
                      role: "option" as const,
                      "aria-selected": isActive,
                      tabIndex: -1,
                    };

                    return (
                      <Fragment key={item.id}>
                        {heading ? (
                          <p className="px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-fg-muted">
                            {heading}
                          </p>
                        ) : null}

                        {item.kind === "stock" ? (
                          <div
                            onMouseEnter={() => setActiveIndex(index)}
                            className={cn(
                              "flex items-stretch gap-1 rounded-2xl transition-colors",
                              isActive ? "bg-surface-2" : "hover:bg-surface-1",
                            )}
                          >
                            <button
                              ref={(node) => {
                                optionRefs.current[index] = node;
                              }}
                              type="button"
                              {...optionProps}
                              onClick={() => run(item)}
                              className="flex min-h-14 min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-2xl px-3 py-2 text-left"
                            >
                              <TickerLogo
                                symbol={item.ticker.symbol}
                                name={item.ticker.name}
                                logoUrl={item.ticker.logo}
                                size={28}
                                decorative
                              />
                              <span className="min-w-0 flex-1">
                                <span className="flex min-w-0 items-baseline gap-2">
                                  <span className="truncate text-sm font-semibold text-fg">
                                    {item.ticker.symbol}
                                  </span>
                                  <span className="truncate text-xs text-fg-muted">
                                    {item.ticker.underlying}
                                  </span>
                                </span>
                                <span className="block truncate text-xs text-fg-muted">
                                  {item.ticker.name}
                                </span>
                              </span>
                              <ChevronIcon />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                go(
                                  `/app/accion/${encodeURIComponent(item.ticker.symbol)}?operar=comprar`,
                                )
                              }
                              aria-label={`Comprar ${item.ticker.symbol}`}
                              className="my-2 mr-2 shrink-0 cursor-pointer rounded-xl border border-border bg-bg px-3 text-xs font-medium text-fg-body transition-colors hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg"
                            >
                              Comprar
                            </button>
                          </div>
                        ) : (
                          <button
                            ref={(node) => {
                              optionRefs.current[index] = node;
                            }}
                            type="button"
                            {...optionProps}
                            onMouseEnter={() => setActiveIndex(index)}
                            onClick={() => run(item)}
                            className={cn(
                              "flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-2xl px-3 py-2 text-left transition-colors",
                              isActive ? "bg-surface-2" : "hover:bg-surface-1",
                            )}
                          >
                            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-surface-1 text-fg-muted">
                              <RouteIcon />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-medium text-fg">
                                {item.shortcut.label}
                              </span>
                              <span className="block truncate text-xs text-fg-muted">
                                {item.shortcut.hint}
                              </span>
                            </span>
                            <ChevronIcon />
                          </button>
                        )}
                      </Fragment>
                    );
                  })}
                </div>
              )}
            </div>

            <div
              aria-hidden="true"
              className="flex items-center justify-between gap-3 border-t border-border px-4 py-2 text-[11px] text-fg-muted"
            >
              <span className="flex items-center gap-1.5">
                <kbd className={KBD_CLASS}>↑</kbd>
                <kbd className={KBD_CLASS}>↓</kbd>
                navegar
                <kbd className={cn(KBD_CLASS, "ml-1")}>↵</kbd>
                abrir
              </span>
              <span className="flex items-center gap-1.5">
                <kbd className={KBD_CLASS}>Esc</kbd>
                cerrar
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
