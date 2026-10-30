"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { TICKERS } from "@/config/tickers";
import { TickerLogo } from "@/components/domain/ticker-logo";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/cn";

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

export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const normalizedQuery = query.trim().toLowerCase();

  const matchingStocks = useMemo(() => {
    const enabled = TICKERS.filter((t) => t.enabled);
    if (!normalizedQuery) return enabled.slice(0, 6);
    return enabled
      .filter(
        (t) =>
          t.symbol.toLowerCase().includes(normalizedQuery) ||
          t.name.toLowerCase().includes(normalizedQuery) ||
          t.category.toLowerCase().includes(normalizedQuery),
      )
      .slice(0, 6);
  }, [normalizedQuery]);

  const matchingCommands = useMemo(() => {
    if (!normalizedQuery) return QUICK_COMMANDS;
    return QUICK_COMMANDS.filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(normalizedQuery) ||
        cmd.hint.toLowerCase().includes(normalizedQuery),
    );
  }, [normalizedQuery]);

  const totalItems = matchingStocks.length + matchingCommands.length;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    const onOpenEvent = () => {
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
    setQuery("");
    setActiveIndex(0);
    const id = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(id);
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
      setActiveIndex((prev) => (totalItems > 0 ? (prev + 1) % totalItems : 0));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => (totalItems > 0 ? (prev - 1 + totalItems) % totalItems : 0));
      return;
    }
    if (e.key === "Enter" && totalItems > 0) {
      e.preventDefault();
      selectByIndex(activeIndex);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Buscador rápido y comandos"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      onKeyDown={handleKeyDown}
      className="fixed inset-0 z-50 bg-fg/25 backdrop-blur-sm flex items-start justify-center pt-[12vh] px-4"
    >
      <div className="w-full max-w-lg overflow-hidden rounded-[24px] border border-white/70 bg-white/88 backdrop-blur-2xl backdrop-saturate-180 shadow-[0_24px_64px_-16px_rgba(12,15,20,0.22),inset_0_1px_0_rgba(255,255,255,0.9)]">
        <div className="flex items-center gap-3 border-b border-border/70 px-4 py-3.5">
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            fill="none"
            className="size-5 shrink-0 text-fg-muted"
          >
            <circle cx="9" cy="9" r="5.75" stroke="currentColor" strokeWidth="1.6" />
            <path d="M13.5 13.5L17 17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            placeholder="Buscar acción (AAPLx, NVDAx...) o ir a sección..."
            className="min-w-0 flex-1 bg-transparent text-sm text-fg placeholder:text-fg-muted outline-none"
          />
          <button
            type="button"
            onClick={close}
            className="shrink-0 cursor-pointer rounded-full border border-border/80 bg-surface-1/80 px-2.5 py-1 text-[11px] font-medium tracking-wide text-fg-muted transition hover:bg-surface-2 hover:text-fg"
          >
            ESC
          </button>
        </div>

        <div className="max-h-[62vh] overflow-y-auto p-2">
          {matchingStocks.length > 0 ? (
            <div className="py-1">
              <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-fg-muted">
                Acciones tokenizadas
              </p>
              <ul className="flex flex-col gap-0.5">
                {matchingStocks.map((t, idx) => {
                  const isSelected = idx === activeIndex;
                  return (
                    <li key={t.symbol}>
                      <button
                        type="button"
                        onMouseEnter={() => setActiveIndex(idx)}
                        onClick={() => {
                          close();
                          router.push(`/app/accion/${t.symbol}`);
                        }}
                        className={cn(
                          "flex w-full cursor-pointer items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition duration-150",
                          isSelected ? "bg-fg/[0.07] text-fg" : "text-fg-body hover:bg-fg/[0.04]",
                        )}
                      >
                        <TickerLogo symbol={t.symbol} size={32} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-fg">{t.symbol}</span>
                          <span className="block truncate text-xs text-fg-muted">{t.name}</span>
                        </span>
                        <Badge tone="neutral" className="shrink-0 text-[11px]">
                          {t.category}
                        </Badge>
                        <svg
                          aria-hidden="true"
                          viewBox="0 0 16 16"
                          fill="none"
                          className="size-4 shrink-0 text-fg-muted"
                        >
                          <path
                            d="M6 3.5L10.5 8L6 12.5"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          {matchingCommands.length > 0 ? (
            <div className="py-1">
              <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-fg-muted">
                Accesos rápidos
              </p>
              <ul className="flex flex-col gap-0.5">
                {matchingCommands.map((cmd, cmdIdx) => {
                  const index = matchingStocks.length + cmdIdx;
                  const isSelected = index === activeIndex;
                  return (
                    <li key={cmd.id}>
                      <button
                        type="button"
                        onMouseEnter={() => setActiveIndex(index)}
                        onClick={() => {
                          close();
                          router.push(cmd.href);
                        }}
                        className={cn(
                          "flex w-full cursor-pointer items-center justify-between gap-3 rounded-2xl px-3 py-2.5 text-left transition duration-150",
                          isSelected ? "bg-fg/[0.07] text-fg" : "text-fg-body hover:bg-fg/[0.04]",
                        )}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-fg">{cmd.label}</span>
                          <span className="block truncate text-xs text-fg-muted">{cmd.hint}</span>
                        </span>
                        <svg
                          aria-hidden="true"
                          viewBox="0 0 16 16"
                          fill="none"
                          className="size-4 shrink-0 text-fg-muted"
                        >
                          <path
                            d="M6 3.5L10.5 8L6 12.5"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          {totalItems === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-fg-muted">
              No encontramos acciones ni secciones para «{query}».
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
