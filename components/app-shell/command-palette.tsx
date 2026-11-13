"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TICKERS } from "@/config/tickers";
import { TickerLogo } from "@/components/domain/ticker-logo";
import { IconSearch } from "@/components/ui/icons";
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

export function CommandPalette() {
  const router = useRouter();
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  const normalizedQuery = query.trim().toLowerCase();

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

  useEffect(() => {
    if (!open) return;
    const id = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  /** La página no scrollea detrás del modal. */
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open) return null;

  const close = () => {
    setOpen(false);
    setQuery("");
  };

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
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
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
    "flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-lg px-2.5 text-left transition-colors duration-100";
  const rowState = (selected: boolean) => (selected ? "bg-surface-2 text-fg" : "text-fg-body hover:bg-surface-1");

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Buscador rápido y comandos"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      onKeyDown={handleKeyDown}
      className="fixed inset-0 z-50 flex items-start justify-center overflow-hidden bg-fg/25 px-4 pt-[max(0.75rem,12vh)] pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-[2px]"
    >
      <div className="flex max-h-[calc(100dvh-12vh-1.5rem-env(safe-area-inset-bottom))] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-border bg-bg shadow-[0_24px_60px_-20px_rgba(10,10,10,0.38),0_2px_6px_rgba(10,10,10,0.04)]">
        <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 transition-colors focus-within:border-fg">
          <IconSearch className="size-4 shrink-0 text-fg-subtle" />
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
            aria-expanded
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={totalItems > 0 ? `${listId}-${selectedIndex}` : undefined}
            placeholder="Buscar acción (AAPLx, NVDAx…) o una sección"
            className="h-14 min-w-0 flex-1 bg-transparent text-[15px] text-fg placeholder:text-fg-subtle outline-none"
          />
          <button
            type="button"
            onClick={close}
            aria-label="Cerrar"
            className="shrink-0 cursor-pointer rounded-md border border-border px-1.5 py-1 font-mono text-[10px] uppercase tracking-wide text-fg-subtle transition-colors hover:border-border-strong hover:text-fg"
          >
            esc
          </button>
        </div>

        <div id={listId} role="listbox" aria-label="Resultados" className="min-h-0 max-h-[min(60vh,32rem)] flex-1 overflow-y-auto overscroll-contain p-1.5">
          {matchingStocks.length > 0 ? (
            <div role="group" aria-label="Acciones tokenizadas" className="pb-1">
              <p className="px-2.5 pb-1 pt-2 font-mono text-[10px] uppercase tracking-[0.08em] text-fg-subtle">
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
                            "w-4 shrink-0 text-center text-fg-subtle transition-opacity duration-100",
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
              <p className="px-2.5 pb-1 pt-2 font-mono text-[10px] uppercase tracking-[0.08em] text-fg-subtle">
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
                          <span className="block truncate text-[11px] text-fg-subtle">{cmd.hint}</span>
                        </span>
                        <span
                          aria-hidden
                          className={cn(
                            "w-4 shrink-0 text-center text-fg-subtle transition-opacity duration-100",
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
              <IconSearch className="size-5 text-fg-subtle" />
              <p className="text-sm text-fg-muted">No encontramos acciones ni secciones para «{query}».</p>
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-4 border-t border-border px-4 py-2.5 text-[11px] text-fg-subtle">
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
    </div>
  );
}
