"use client";

import { useMemo, useState } from "react";
import { AssetPicker } from "@/components/domain/asset-picker";
import { useT } from "@/lib/hooks/use-t";

import { IconClose } from "@/components/ui/icons";
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
  source?: string;
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

export function ChartMultiCompare({ baseSymbol, selectedSymbols, onToggleSymbol, onClearAll, activeItems, highlightedId, onHighlightChange, maxCompare = 4 }: ChartMultiCompareProps) {
  const { language } = useT();
  const en = language === "en";
  const [pickedNames, setPickedNames] = useState<Record<string, string>>({});
  const selected = useMemo(() => [baseSymbol, ...selectedSymbols], [baseSymbol, selectedSymbols]);
  const hasComparisons = selectedSymbols.length > 0;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <AssetPicker
          label={en ? "Compare" : "Comparar"}
          selectedSymbols={selected}
          max={maxCompare + 1}
          includeCrypto={false}
          onSelect={(asset) => {
            setPickedNames((previous) => ({ ...previous, [asset.symbol]: asset.name }));
            onToggleSymbol(asset.symbol);
          }}
        />
        {hasComparisons && onClearAll ? <button type="button" onClick={onClearAll} className="min-h-11 px-2 text-xs text-fg-muted underline sm:min-h-9">{en ? "Clear" : "Limpiar"}</button> : null}
      </div>
      {hasComparisons ? <div role="list" aria-label={en ? "Chart series" : "Series del gráfico"} className="flex max-w-full flex-wrap gap-1.5">
        {activeItems.map((item) => <div
          key={item.id} role="listitem" tabIndex={0} aria-busy={item.pending || undefined}
          onMouseEnter={() => onHighlightChange(item.id)} onMouseLeave={() => onHighlightChange(null)}
          onFocus={() => onHighlightChange(item.id)} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) onHighlightChange(null); }}
          onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onHighlightChange(highlightedId === item.id ? null : item.id); } }}
          className={cn("inline-flex min-h-11 max-w-full items-center gap-2 rounded-full border border-border bg-bg pl-3 text-xs outline-none focus-visible:ring-2 focus-visible:ring-fg sm:min-h-9", highlightedId !== null && highlightedId !== item.id && "opacity-45", !item.removable && "pr-3")}
        >
          <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ background: item.color }} />
          <span className="font-medium">{item.symbol}</span>
          {item.source ? <span className="text-[11px] text-fg-muted">{item.source === "closes" ? (en ? "Underlying" : "Subyacente") : item.source === "ticks" ? "Token" : "Demo"}</span> : null}
          <span className="hidden max-w-28 truncate text-fg-muted sm:inline">{pickedNames[item.symbol] ?? item.name}</span>
          <span className="num text-fg-muted">{item.changePct === null ? "—" : formatPercent(item.changePct)}</span>
          {item.removable ? <button type="button" onClick={() => onToggleSymbol(item.symbol)} aria-label={
            (en ? "Remove " : "Quitar ") + item.symbol
          } className="inline-flex size-11 items-center justify-center rounded-full text-fg-muted hover:bg-surface-1 sm:size-9"><IconClose className="size-3" /></button> : null}
        </div>)}
      </div> : null}
      <p role="status" className="sr-only">{selectedSymbols.length} {en ? "compared assets" : "activos comparados"}</p>
    </div>
  );
}
