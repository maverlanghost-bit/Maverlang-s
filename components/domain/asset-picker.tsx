"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { IconSearch } from "@/components/ui/icons";
import { searchMarket } from "@/lib/api/client";
import { CRYPTO_ASSETS } from "@/lib/catalog/crypto";
import { fold } from "@/lib/market/browse";
import { useT } from "@/lib/hooks/use-t";
import { cn } from "@/lib/cn";

export interface PickedAsset { symbol: string; name: string; kind: "stock" | "crypto" }

/** Shared asset selection for comparison and tools; selection never executes a trade. */
export function AssetPicker({ selectedSymbols, onSelect, max = 4, includeCrypto = true, label }: {
  selectedSymbols: readonly string[];
  onSelect: (asset: PickedAsset) => void;
  max?: number;
  includeCrypto?: boolean;
  label?: string;
}) {
  const { language } = useT();
  const en = language === "en";
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [needle, setNeedle] = useState("");
  const [active, setActive] = useState(0);
  const id = useId();
  useEffect(() => {
    const timer = window.setTimeout(() => setNeedle(query.trim()), 200);
    return () => window.clearTimeout(timer);
  }, [query]);
  const catalog = useQuery({
    queryKey: ["asset-picker", needle],
    queryFn: () => searchMarket({ q: needle, page: 1, pageSize: 12, scope: "listed", sort: "liquidity" }),
    enabled: open,
    staleTime: 30_000,
  });
  const results = useMemo(() => {
    if (query.trim() !== needle) return [];
    const selected = new Set(selectedSymbols.map((symbol) => symbol.toLowerCase()));
    const stocks: PickedAsset[] = (catalog.data?.items ?? []).map((item) => ({ symbol: item.symbol, name: item.name, kind: "stock" }));
    const cryptos: PickedAsset[] = includeCrypto ? CRYPTO_ASSETS
      .filter((asset) => asset.decimals !== null && (!needle || fold(`${asset.symbol} ${asset.name}`).includes(fold(needle))))
      .slice(0, 8).map((asset) => ({ symbol: asset.symbol, name: asset.name, kind: "crypto" })) : [];
    return [...stocks, ...cryptos].filter((asset) => !selected.has(asset.symbol.toLowerCase()));
  }, [catalog.data, includeCrypto, needle, query, selectedSymbols]);
  const atLimit = selectedSymbols.length >= max;
  const current = results[Math.min(active, Math.max(0, results.length - 1))];
  useEffect(() => {
    if (open && current) document.getElementById(`${id}-${current.symbol}`)?.scrollIntoView({ block: "nearest" });
  }, [open, id, current]);
  const choose = (asset: PickedAsset) => {
    if (atLimit) return;
    onSelect(asset);
    setQuery(""); setNeedle(""); setActive(0); setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" disabled={atLimit} className="inline-flex min-h-11 items-center gap-2 rounded-full border border-border-control bg-bg px-3 text-xs font-medium text-fg-muted hover:bg-surface-1 disabled:opacity-50 sm:min-h-9">
          <IconSearch />{label ?? (en ? "Add asset" : "Añadir activo")}{atLimit ? ` · ${max}/${max}` : ""}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-96 p-2" aria-label={en ? "Select asset" : "Seleccionar activo"}>
        <label className="sr-only" htmlFor={`${id}-input`}>{en ? "Search by name or symbol" : "Buscar por nombre o símbolo"}</label>
        <input
          id={`${id}-input`} type="search" role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-results`} aria-activedescendant={current ? `${id}-${current.symbol}` : undefined}
          value={query} onChange={(event) => { setQuery(event.target.value); setActive(0); }}
          placeholder={en ? "Name or symbol…" : "Nombre o símbolo…"}
          className="min-h-11 w-full rounded-md border border-border-control bg-bg px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-fg"
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setActive((index) => Math.max(0, Math.min(results.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)))); }
            if (event.key === "Enter" && current) { event.preventDefault(); choose(current); }
          }}
        />
        <p role="status" className="px-2 py-2 text-xs text-fg-muted">{catalog.isFetching || query.trim() !== needle ? (en ? "Searching…" : "Buscando…") : results.length ? (en ? `${results.length} results` : `${results.length} resultados`) : catalog.isError ? (en ? "Could not load stocks" : "No pudimos cargar las acciones") : (en ? "No results" : "Sin resultados")}</p>
        {catalog.isError ? <button type="button" onClick={() => void catalog.refetch()} className="min-h-11 px-2 text-xs underline">{en ? "Retry stocks" : "Reintentar acciones"}</button> : null}
        <ul id={`${id}-results`} role="listbox" aria-label={en ? "Assets" : "Activos"} className="max-h-[min(50dvh,20rem)] overflow-y-auto overscroll-contain">
          {results.map((asset, index) => <li key={asset.symbol} id={`${id}-${asset.symbol}`} role="option" aria-selected={asset.symbol === current?.symbol}>
            <button type="button" tabIndex={-1} onMouseEnter={() => setActive(index)} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(asset)} className={cn("flex min-h-11 w-full items-center justify-between gap-3 rounded-md px-2 text-left text-sm", asset.symbol === current?.symbol ? "bg-surface-2" : "hover:bg-surface-1")}>
              <span className="min-w-0"><span className="num font-medium text-fg">{asset.symbol}</span><span className="ml-2 text-xs text-fg-muted">{asset.name}</span></span>
              <span className="shrink-0 text-[11px] text-fg-muted">{asset.kind === "crypto" ? (en ? "Crypto" : "Cripto") : (en ? "Stock / ETF" : "Acción / ETF")}</span>
            </button>
          </li>)}
        </ul>
        <p className="border-t border-border px-2 pt-2 text-[11px] text-fg-muted">{en ? `Up to ${max} selected · ↑ ↓ Enter · Esc closes` : `Hasta ${max} seleccionados · ↑ ↓ Enter · Esc cierra`}</p>
      </PopoverContent>
    </Popover>
  );
}
