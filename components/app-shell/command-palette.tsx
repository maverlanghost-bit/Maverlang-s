"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { TICKERS } from "@/config/tickers";
import { TickerLogo } from "@/components/domain/ticker-logo";
import { IconButton } from "@/components/ui/icon-button";
import { IconClose, IconSearch } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { useT } from "@/lib/hooks/use-t";

export function openCommandPalette() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("maverlang:open-command-palette"));
  }
}

interface QuickCommand {
  id: string;
  label: string;
  hint: string;
  href: string;
}

const QUICK_COMMANDS: QuickCommand[] = [
  { id: "market", label: "Ir a Mercado", hint: "Catálogo de acciones 24/7", href: "/app" },
  { id: "portfolio", label: "Ir a Cartera e Historial", hint: "Posiciones y órdenes", href: "/app/cartera" },
  { id: "ai", label: "Preguntar a Maverlang AI", hint: "Asistente financiero inteligente", href: "/app/asistente" },
  { id: "wallet", label: "Ir a Billetera", hint: "Saldo USDC, depósitos y retiros", href: "/app/billetera" },
  { id: "settings", label: "Ajustes de moneda e idioma", hint: "USD / CLP y preferencias", href: "/app/ajustes" },
];

const KBD =
  "inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-surface-1 px-1 font-mono text-[10px] leading-none text-fg-muted";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

function subscribe() {
  return () => {};
}

function useMounted() {
  return useSyncExternalStore(subscribe, () => true, () => false);
}

/**
 * Paleta de comandos (⌘K / Ctrl+K). En móvil es el menú del shell: ocupa el
 * ancho útil, nunca pasa del alto visible y sólo desplaza su lista. Mientras
 * está abierta el foco no se escapa del panel, Escape cierra desde cualquier
 * punto y al cerrar se devuelve el foco al control que la abrió.
 */

export function CommandPalette() {
  const router = useRouter();
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const mounted = useMounted();

  const normalizedQuery = query.trim().toLowerCase();

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);

  const matchingStocks = useMemo(() => {
    const enabled = TICKERS.filter((item) => item.enabled);
    if (!normalizedQuery) return enabled.slice(0, 6);
    return enabled
      .filter(
        (item) =>
          item.symbol.toLowerCase().includes(normalizedQuery) ||
          item.name.toLowerCase().includes(normalizedQuery) ||
          item.category.toLowerCase().includes(normalizedQuery),
      )
      .slice(0, 6);
  }, [normalizedQuery]);

  const matchingCommands = useMemo(() => {
    if (!normalizedQuery) return QUICK_COMMANDS;
    return QUICK_COMMANDS.filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(normalizedQuery) || cmd.hint.toLowerCase().includes(normalizedQuery),
    );
  }, [normalizedQuery]);

  const totalItems = matchingStocks.length + matchingCommands.length;
  const selectedIndex = totalItems === 0 ? 0 : Math.min(activeIndex, totalItems - 1);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setQuery("");
        setActiveIndex(0);
        setOpen((prev) => !prev);
      }
    };
    const onOpenEvent = () => {
      setQuery("");
      setActiveIndex(0);
      setOpen(true);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("maverlang:open-command-palette", onOpenEvent);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("maverlang:open-command-palette", onOpenEvent);
    };
  }, []);

  /** Foco al buscador al abrir; al cerrar, de vuelta al control que abrió. */
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const id = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => {
      window.cancelAnimationFrame(id);
      previous?.focus();
    };
  }, [open]);

  /**
   * La página no scrollea detrás del modal. Se compensa el ancho de la barra
   * de scroll para que el contenido no salte ni al abrir ni al cerrar.
   */
  useEffect(() => {
    if (!open) return;
    const body = document.body;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    const overflow = body.style.overflow;
    const paddingRight = body.style.paddingRight;
    body.style.overflow = "hidden";
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
    return () => {
      body.style.overflow = overflow;
      body.style.paddingRight = paddingRight;
    };
  }, [open]);

  /** Escape cierra aunque el foco se haya ido del campo; Tab no se escapa del panel. */
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) return;
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !panel.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  /** La fila activa por teclado siempre queda a la vista dentro de la lista. */
  useEffect(() => {
    if (!open || totalItems === 0) return;
    document.getElementById(`${listId}-${selectedIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [open, listId, selectedIndex, totalItems]);

  if (!mounted || !open) return null;

  const selectByIndex = (index: number) => {
    if (index < matchingStocks.length) {
      const stock = matchingStocks[index];
      if (stock) {
        close();
        router.push(`/app/accion/${stock.symbol}`);
      }
      return;
    }
    const cmd = matchingCommands[index - matchingStocks.length];
    if (cmd) {
      close();
      router.push(cmd.href);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex(totalItems > 0 ? (selectedIndex + 1) % totalItems : 0);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex(totalItems > 0 ? (selectedIndex - 1 + totalItems) % totalItems : 0);
      return;
    }
    if (e.key === "Home") {
      e.preventDefault();
      setActiveIndex(0);
      return;
    }
    if (e.key === "End") {
      e.preventDefault();
      setActiveIndex(Math.max(0, totalItems - 1));
      return;
    }
    if (e.key === "Enter" && totalItems > 0) {
      e.preventDefault();
      selectByIndex(selectedIndex);
    }
  };

  const rowBase =
    "flex min-h-11 w-full cursor-pointer touch-manipulation items-center gap-3 rounded-lg px-2.5 text-left transition-colors duration-100";
  const rowState = (selected: boolean) => (selected ? "bg-surface-2 text-fg" : "text-fg-body hover:bg-surface-1");

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Buscador rápido y comandos"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      onKeyDown={handleKeyDown}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-hidden overscroll-contain bg-fg/25 px-3 pt-[max(0.75rem,8vh)] pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-[2px] sm:px-4 sm:pt-[max(1rem,12vh)]"
    >
      <div
        ref={panelRef}
        className="flex max-h-full w-full max-w-xl flex-col overflow-hidden rounded-xl border border-border bg-bg shadow-float"
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 transition-colors focus-within:border-fg sm:gap-3 sm:px-4">
          <IconSearch className="size-4 shrink-0 text-fg-muted" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            data-bare-input=""
            role="combobox"
            aria-label="Buscar acciones o secciones"
            aria-expanded
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={totalItems > 0 ? `${listId}-${selectedIndex}` : undefined}
            placeholder="Buscar acción o sección"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="go"
            className="h-14 min-w-0 flex-1 bg-transparent text-base text-fg placeholder:text-fg-muted outline-none"
          />
          <kbd aria-hidden className={cn(KBD, "hidden sm:inline-flex")}>
            esc
          </kbd>
          <IconButton label="Cerrar" size="sm" onClick={close} className="-mr-1">
            <IconClose />
          </IconButton>
        </div>

        <div
          id={listId}
          role="listbox"
          aria-label="Resultados"
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1 [scrollbar-width:thin] sm:p-1.5"
        >
          {matchingStocks.length > 0 ? (
            <div role="group" aria-label="Acciones tokenizadas" className="pb-1">
              <p className="px-2.5 pt-2 pb-1 font-mono text-[11px] uppercase tracking-[0.08em] text-fg-muted">
                Acciones tokenizadas
              </p>
              <ul role="presentation" className="flex flex-col gap-px">
                {matchingStocks.map((stock, idx) => {
                  const isSelected = idx === selectedIndex;
                  return (
                    <li key={stock.symbol} role="presentation">
                      <button
                        type="button"
                        role="option"
                        id={`${listId}-${idx}`}
                        aria-selected={isSelected}
                        onMouseEnter={() => setActiveIndex(idx)}
                        onClick={() => {
                          close();
                          router.push(`/app/accion/${stock.symbol}`);
                        }}
                        className={cn(rowBase, rowState(isSelected))}
                      >
                        <TickerLogo symbol={stock.symbol} size={28} />
                        <span className="min-w-0 flex-1">
                          <span className="flex min-w-0 items-baseline gap-2">
                            <span className="shrink-0 font-mono text-[12px] font-medium uppercase tracking-[0.03em] text-fg">
                              {stock.symbol}
                            </span>
                            <span className="truncate text-[13px] text-fg-muted">{stock.name}</span>
                          </span>
                        </span>
                        <span className="hidden shrink-0 text-[11px] text-fg-subtle sm:block">
                          {t.market[stock.category]}
                        </span>
                        <span
                          aria-hidden
                          className={cn(
                            "w-4 shrink-0 text-center text-fg-muted transition-opacity duration-100",
                            isSelected ? "opacity-100" : "opacity-0",
                          )}
                        >
                          <svg viewBox="0 0 16 16" fill="none" className="inline size-3.5">
                            <path
                              d="M6.5 4l4 4-4 4"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          {matchingCommands.length > 0 ? (
            <div role="group" aria-label="Accesos rápidos" className="pb-1">
              <p className="px-2.5 pt-2 pb-1 font-mono text-[11px] uppercase tracking-[0.08em] text-fg-muted">
                Ir a
              </p>
              <ul role="presentation" className="flex flex-col gap-px">
                {matchingCommands.map((cmd, cmdIdx) => {
                  const index = matchingStocks.length + cmdIdx;
                  const isSelected = index === selectedIndex;
                  return (
                    <li key={cmd.id} role="presentation">
                      <button
                        type="button"
                        role="option"
                        id={`${listId}-${index}`}
                        aria-selected={isSelected}
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => {
                          close();
                          router.push(cmd.href);
                        }}
                        className={cn(rowBase, rowState(isSelected))}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium text-fg">{cmd.label}</span>
                          <span className="block truncate text-[13px] text-fg-muted">{cmd.hint}</span>
                        </span>
                        <span
                          aria-hidden
                          className={cn(
                            "w-4 shrink-0 text-center text-fg-muted transition-opacity duration-100",
                            isSelected ? "opacity-100" : "opacity-0",
                          )}
                        >
                          <svg viewBox="0 0 16 16" fill="none" className="inline size-3.5">
                            <path
                              d="M6.5 4l4 4-4 4"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          {totalItems === 0 ? (
            <div className="flex flex-col items-center gap-2.5 px-6 py-12 text-center">
              <IconSearch className="size-5 text-fg-muted" />
              <p className="text-sm text-fg-muted">No encontramos acciones ni secciones para «{query}».</p>
            </div>
          ) : null}
        </div>

        <div className="hidden shrink-0 items-center gap-4 border-t border-border px-4 py-2.5 text-[11px] text-fg-muted sm:flex">
          <span className="flex items-center gap-1.5">
            <kbd className={KBD}>↑</kbd>
            <kbd className={KBD}>↓</kbd>
            navegar
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className={KBD}>↵</kbd>
            abrir
          </span>
          <span className="ml-auto flex items-center gap-1.5">
            <kbd className={KBD}>ctrl</kbd>
            <kbd className={KBD}>K</kbd>
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
