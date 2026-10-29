"use client";

import { useEffect, useId, useState, type KeyboardEvent } from "react";

import { TickerLogo } from "@/components/domain/ticker-logo";
import { Input } from "@/components/ui/input";
import type { ImportarMessages } from "@/content/i18n/extra-importar";
import { searchMarket, type MarketSearchItem } from "@/lib/api/client";
import { isCatalogSymbol } from "@/lib/catalog/symbol";

export function TickerField({
  id,
  query,
  onQuery,
  onPick,
  disabled,
  copy,
}: {
  id: string;
  query: string;
  onQuery: (value: string) => void;
  onPick: (item: { symbol: string; name: string; logoUrl: string | null }) => void;
  disabled: boolean;
  copy: ImportarMessages;
}) {
  const listId = useId();
  const trimmed = query.trim();
  const [debounced, setDebounced] = useState(trimmed);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pack, setPack] = useState<{ q: string; items: MarketSearchItem[]; failed: boolean } | null>(null);

  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(trimmed), trimmed ? 250 : 0);
    return () => window.clearTimeout(handle);
  }, [trimmed]);

  useEffect(() => {
    if (debounced.length < 1) return;
    let cancelled = false;
    searchMarket({ q: debounced, page: 1, pageSize: 8, sort: "name" })
      .then((result) => {
        if (cancelled) return;
        setPack({ q: debounced, items: result.items, failed: false });
        setActive(0);
        setOpen(true);
      })
      .catch(() => {
        if (cancelled) return;
        setPack({ q: debounced, items: [], failed: true });
        setOpen(true);
      });
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  const readyPack = pack !== null && pack.q === trimmed ? pack : null;
  const results = readyPack && !readyPack.failed ? readyPack.items : [];
  const failed = readyPack?.failed === true;
  const pending = trimmed.length > 0 && readyPack === null;
  const shown = trimmed.length > 0 && (pending || (open && readyPack !== null));

  function choose(item: MarketSearchItem) {
    if (!isCatalogSymbol(item.symbol)) return;
    onPick({ symbol: item.symbol, name: item.name, logoUrl: item.logoUrl });
    setOpen(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (results.length === 0) return;
      setOpen(true);
      setActive((current) => Math.min(current + 1, results.length - 1));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((current) => Math.max(current - 1, 0));
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const item = results[active];
      if (item) choose(item);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    }
  }

  const activeId = results[active] ? `${listId}-opt-${active}` : undefined;

  return (
    <div className="relative min-w-0">
      <label htmlFor={id} className="label">
        {copy.pickTicker}
      </label>
      <Input
        id={id}
        role="combobox"
        value={query}
        disabled={disabled}
        placeholder={copy.pickPlaceholder}
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        aria-autocomplete="list"
        aria-expanded={shown}
        aria-controls={listId}
        aria-activedescendant={shown ? activeId : undefined}
        aria-busy={pending || undefined}
        className="mt-1"
        onChange={(event) => onQuery(event.target.value)}
        onFocus={() => {
          if (readyPack !== null) setOpen(true);
        }}
        onKeyDown={onKeyDown}
      />
      {shown ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={copy.pickTicker}
          className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-border bg-bg p-1 shadow-card motion-reduce:transition-none"
        >
          {pending ? <li className="px-3 py-2 text-sm text-fg-muted">{copy.searching}</li> : null}
          {failed ? <li className="px-3 py-2 text-sm text-fg-body">{copy.searchError}</li> : null}
          {!pending && !failed && results.length === 0 ? (
            <li className="px-3 py-2 text-sm text-fg-muted">{copy.searchEmpty}</li>
          ) : null}
          {results.map((item, index) => (
            <li key={item.symbol} role="presentation">
              <button
                type="button"
                id={`${listId}-opt-${index}`}
                role="option"
                aria-selected={index === active}
                className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-left focus-visible:ring-4 focus-visible:ring-fg/20 aria-selected:bg-surface-2"
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => choose(item)}
                onMouseEnter={() => setActive(index)}
              >
                <TickerLogo
                  symbol={item.symbol}
                  name={item.name}
                  logoUrl={item.logoUrl}
                  size={28}
                  decorative
                  loading="lazy"
                  sizes="28px"
                />
                <span className="font-medium text-fg">{item.symbol}</span>
                <span className="truncate text-sm text-fg-muted">{item.name}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
