"use client";

import { useEffect, useId, useMemo, useRef, useState, type FocusEvent } from "react";

import { IconCheck, IconChevron, IconClose } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { formatPercent } from "@/lib/format";

export interface CompareOption {
  symbol: string;
  name: string;
  group: "index" | "stock";
}

export const COMPARE_CATALOG: readonly CompareOption[] = [
  { symbol: "SPYx", name: "S&P 500", group: "index" },
  { symbol: "QQQx", name: "Nasdaq 100", group: "index" },
  { symbol: "IWMx", name: "Russell 2000", group: "index" },
  { symbol: "VTIx", name: "Total Market", group: "index" },
  { symbol: "GLDx", name: "Oro (Gold)", group: "index" },
  { symbol: "NVDAx", name: "NVIDIA", group: "stock" },
  { symbol: "AAPLx", name: "Apple", group: "stock" },
  { symbol: "MSFTx", name: "Microsoft", group: "stock" },
  { symbol: "AMZNx", name: "Amazon", group: "stock" },
  { symbol: "GOOGLx", name: "Alphabet", group: "stock" },
  { symbol: "METAx", name: "Meta", group: "stock" },
  { symbol: "TSLAx", name: "Tesla", group: "stock" },
  { symbol: "BRK.Bx", name: "Berkshire", group: "stock" },
  { symbol: "COINx", name: "Coinbase", group: "stock" },
] as const;

export const COMPARE_PALETTE = [
  "#2563eb", // Azul cobalto
  "#7c3aed", // Violeta real
  "#d97706", // Ámbar dorado
  "#0891b2", // Cian profundo
  "#db2777", // Rosa intenso
] as const;

export function compareLayerId(symbol: string): string {
  return "compare-" + symbol;
}

export interface ActiveComparisonItem {
  id: string;
  symbol: string;
  name: string;
  color: string;
  changePct: number | null;
  removable?: boolean;
  pending?: boolean;
}

export interface ChartMultiCompareProps {
  baseSymbol: string;
  selectedSymbols: readonly string[];
  onToggleSymbol: (symbol: string) => void;
  onClearAll?: () => void;
  activeItems: readonly ActiveComparisonItem[];
  highlightedId: string | null;
  onHighlightChange: (id: string | null) => void;
  maxCompare?: number;
}

const GROUP_ORDER: readonly CompareOption["group"][] = ["index", "stock"];

const GROUP_LABEL: Record<CompareOption["group"], string> = {
  index: "Índices y ETFs",
  stock: "Acciones",
};

function pctLabel(value: number | null): string {
  return value === null ? "—" : formatPercent(value);
}

function pctTone(value: number | null): string {
  if (value === null || value === 0) return "text-fg-muted";
  return value > 0 ? "text-up" : "text-down";
}

export function ChartMultiCompare({
  baseSymbol,
  selectedSymbols,
  onToggleSymbol,
  onClearAll,
  activeItems,
  highlightedId,
  onHighlightChange,
  maxCompare = 4,
}: ChartMultiCompareProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  const max = Math.max(1, Math.floor(maxCompare));
  const comparedCount = selectedSymbols.length;
  const hasComparisons = comparedCount > 0;
  const atCap = comparedCount >= max;

  const groups = useMemo(() => {
    const base = baseSymbol.trim().toLowerCase();
    return GROUP_ORDER.map((group) => ({
      group,
      label: GROUP_LABEL[group],
      options: COMPARE_CATALOG.filter(
        (option) => option.group === group && option.symbol.toLowerCase() !== base,
      ),
    })).filter((entry) => entry.options.length > 0);
  }, [baseSymbol]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      const root = rootRef.current;
      if (root && event.target instanceof Node && !root.contains(event.target)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function handlePillBlur(event: FocusEvent<HTMLDivElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    onHighlightChange(null);
  }

  function removeItem(item: ActiveComparisonItem) {
    if (highlightedId === item.id) onHighlightChange(null);
    onToggleSymbol(item.symbol);
  }

  const statusText =
    comparedCount === 0
      ? "Sin activos comparados"
      : comparedCount === 1
        ? "1 activo comparado"
        : `${comparedCount} activos comparados`;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <div ref={rootRef} className="relative">
          <button
            ref={triggerRef}
            type="button"
            aria-expanded={open}
            aria-controls={open ? panelId : undefined}
            aria-haspopup="dialog"
            aria-label={
              hasComparisons
                ? `Comparar activos, ${comparedCount} ${comparedCount === 1 ? "comparado" : "comparados"}`
                : "Comparar activos"
            }
            onClick={() => setOpen((value) => !value)}
            className={cn(
              "inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium tracking-tight outline-none transition-colors duration-150 sm:h-8 sm:text-xs",
              "focus-visible:ring-2 focus-visible:ring-fg/20",
              open
                ? "border-border-control bg-bg text-fg"
                : "border-border-control bg-bg text-fg-muted hover:text-fg",
            )}
          >
            <svg viewBox="0 0 16 16" fill="none" className="size-3.5 shrink-0" aria-hidden="true">
              <path
                d="M2.5 4.5h8M2.5 8h8M2.5 11.5h5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <path
                d="M12 9.5v4M10 11.5h4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
            <span>Comparar</span>
            {hasComparisons ? (
              <span className="num text-xs font-medium text-fg-muted">
                ({comparedCount})
              </span>
            ) : null}
            <IconChevron
              className={cn(
                "size-3 shrink-0 text-fg-muted transition-transform duration-150",
                open && "rotate-180",
              )}
            />
          </button>

          {open ? (
            <div
              id={panelId}
              role="dialog"
              aria-modal="false"
              aria-label="Agregar activos para comparar"
              className="absolute top-full left-0 z-30 mt-1.5 max-h-[min(22rem,60vh)] w-[min(24rem,calc(100vw_-_4rem))] overflow-y-auto overscroll-contain rounded-xl border border-border bg-bg p-2 shadow-float"
            >
              {groups.map((entry) => (
                <section key={entry.group} aria-label={entry.label} className="py-1">
                  <p className="px-2 pb-1 text-xs font-medium tracking-wide text-fg-muted uppercase">
                    {entry.label}
                  </p>
                  <ul className="grid grid-cols-1 gap-0.5 sm:grid-cols-2">
                    {entry.options.map((option) => {
                      const selected = selectedSymbols.includes(option.symbol);
                      const locked = !selected && atCap;
                      const colorIndex = selectedSymbols.indexOf(option.symbol);
                      const dotColor = COMPARE_PALETTE[colorIndex % COMPARE_PALETTE.length];

                      return (
                        <li key={option.symbol}>
                          <button
                            type="button"
                            aria-pressed={selected}
                            disabled={locked}
                            onClick={() => onToggleSymbol(option.symbol)}
                            className={cn(
                              "flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-left text-[13px] outline-none transition-colors duration-150",
                              "hover:bg-surface-1 focus-visible:ring-2 focus-visible:ring-fg/20",
                              "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent",
                              selected ? "text-fg" : "text-fg-body",
                            )}
                          >
                            <span
                              aria-hidden="true"
                              className={cn(
                                "flex size-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors duration-150",
                                selected
                                  ? "border-fg bg-fg text-bg"
                                  : "border-border-strong bg-white",
                              )}
                            >
                              {selected ? <IconCheck className="size-3" /> : null}
                            </span>
                            <span className="w-[3.25rem] shrink-0 font-medium tracking-tight tabular-nums">
                              {option.symbol}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-fg-muted">
                              {option.name}
                            </span>
                            {selected ? (
                              <span
                                aria-hidden="true"
                                className="ml-auto size-2 shrink-0 rounded-full"
                                style={{ background: dotColor }}
                              />
                            ) : null}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
              {atCap ? (
                <p className="mt-1 border-t border-border/60 px-2 pt-2 text-xs leading-snug text-fg-muted">
                  Máximo {max} activos comparados a la vez.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        {hasComparisons ? (
          <p className="min-w-0 flex-1 text-xs leading-snug text-fg-muted">
            Toca o pasa el cursor sobre un activo para enfocar su curva
          </p>
        ) : null}

        {hasComparisons && onClearAll ? (
          <button
            type="button"
            onClick={onClearAll}
            aria-label="Limpiar comparación"
            className="inline-flex min-h-11 shrink-0 items-center rounded-full px-2 text-xs font-medium text-fg-muted underline-offset-2 outline-none transition-colors duration-150 hover:text-fg hover:underline focus-visible:ring-2 focus-visible:ring-fg/20"
          >
            Limpiar
          </button>
        ) : null}
      </div>

      {hasComparisons && activeItems.length > 0 ? (
        <div
          role="list"
          aria-label="Series del gráfico"
          className="flex max-w-full flex-nowrap items-center gap-1.5 overflow-x-auto -my-1 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:my-0 sm:flex-wrap sm:overflow-visible sm:py-0"
        >
          {activeItems.map((item) => {
            const focused = highlightedId === item.id;
            const dimmed = highlightedId !== null && !focused;

            return (
              <div
                key={item.id}
                role="listitem"
                tabIndex={0}
                aria-busy={item.pending || undefined}
                onMouseEnter={() => onHighlightChange(item.id)}
                onMouseLeave={() => onHighlightChange(null)}
                onFocus={() => onHighlightChange(item.id)}
                onBlur={handlePillBlur}
                onClick={(event) => {
                  // En pantallas táctiles no hay hover: tocar la píldora enfoca su curva y volver a tocarla suelta el foco.
                  if (event.target instanceof Element && event.target.closest("button")) return;
                  onHighlightChange(highlightedId === item.id ? null : item.id);
                }}
                className={cn(
                  "inline-flex min-h-11 max-w-full min-w-0 shrink-0 cursor-pointer items-center gap-2 rounded-full border bg-bg px-3 text-xs outline-none transition-colors duration-150 sm:min-h-8 sm:px-2.5",
                  "focus-visible:ring-2 focus-visible:ring-fg/30",
                  focused
                    ? "border-fg/40"
                    : "border-border hover:border-fg/30 hover:bg-surface-1",
                  dimmed && "opacity-50",
                )}
              >
                <span
                  aria-hidden="true"
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: item.color }}
                />
                <span className="font-medium tracking-tight text-fg">{item.symbol}</span>
                <span className="max-w-[8.5rem] truncate text-fg-muted">{item.name}</span>
                <span
                  className={cn(
                    "num text-xs font-medium",
                    pctTone(item.changePct),
                    item.pending && "animate-pulse",
                  )}
                >
                  {pctLabel(item.changePct)}
                </span>
                {item.removable ? (
                  <button
                    type="button"
                    onClick={() => removeItem(item)}
                    aria-label={`Quitar ${item.symbol} de la comparación`}
                    className="-mr-1 ml-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full text-fg-muted outline-none transition-colors duration-150 hover:bg-surface-2 hover:text-fg focus-visible:ring-2 focus-visible:ring-fg/30"
                  >
                    <IconClose className="size-3" />
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      <p role="status" className="sr-only">
        {statusText}
      </p>
    </div>
  );
}
