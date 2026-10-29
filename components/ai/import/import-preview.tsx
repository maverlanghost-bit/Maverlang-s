"use client";

import { useId, useState } from "react";

import { TickerField } from "@/components/ai/import/ticker-field";
import { TickerLogo } from "@/components/domain/ticker-logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { IconButton } from "@/components/ui/icon-button";
import { IconClose } from "@/components/ui/icons";
import { Input } from "@/components/ui/input";
import { fillImport, importarText, type ImportarMessages } from "@/content/i18n/extra-importar";
import { setFavorites } from "@/lib/api/client";
import { useSession } from "@/lib/auth/session-context";
import { isCatalogSymbol } from "@/lib/catalog/symbol";
import { FAVORITES_MAX } from "@/lib/favorites/merge";
import { useFavorites } from "@/lib/hooks/use-favorites";
import { useT } from "@/lib/hooks/use-t";
import { parseShareQuantity, saveExternalHoldings, type ExternalHoldingInput } from "@/lib/portfolio/external-holdings";

const FAVORITES_KEY = "a24_favorites";
const FAVORITES_EVENT = "a24-favorites";

export type ImportPreviewPosition = {
  ticker: string;
  name: string | null;
  quantity: number | null;
  matched: boolean;
};

type Row = {
  id: string;
  ticker: string;
  name: string | null;
  quantityText: string;
  matched: boolean;
  logoUrl: string | null;
  query: string;
};

/**
 * Vista previa editable. No guarda sola: los botones lo hacen.
 * "Agregar a mi cartera" es seguimiento, no una compra.
 */
export function ImportPreview({ positions }: { positions: ImportPreviewPosition[] }) {
  const { language } = useT();
  const copy = importarText(language);
  const session = useSession();
  const { symbols } = useFavorites();
  const titleId = useId();
  const noteId = useId();
  const signature = JSON.stringify(positions ?? []);
  const [seen, setSeen] = useState(signature);
  const [rows, setRows] = useState(() => toRows(positions));
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<"portfolio" | "favorites" | null>(null);
  const [invalid, setInvalid] = useState<ReadonlySet<string>>(new Set());

  if (seen !== signature) {
    setSeen(signature);
    setRows(toRows(positions));
    setMessage("");
    setInvalid(new Set());
  }

  function patch(id: string, next: Partial<Row>) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...next } : row)));
    setInvalid((current) => {
      if (!current.has(id)) return current;
      const copySet = new Set(current);
      copySet.delete(id);
      return copySet;
    });
  }

  async function addToPortfolio() {
    const prepared = prepareRows(rows);
    if (prepared.valid.length === 0) {
      setInvalid(new Set(prepared.invalidIds));
      setMessage(prepared.invalidIds.length > 0 ? copy.badQuantity : copy.nothingToSave);
      return;
    }
    setBusy("portfolio");
    setMessage(copy.saving);
    const result = await saveExternalHoldings(prepared.valid);
    setBusy(null);
    setInvalid(new Set(prepared.invalidIds));
    if (!result.ok) {
      setMessage(result.reason === "empty" ? copy.nothingToSave : copy.saveFailed);
      return;
    }
    const parts = [result.where === "device" ? `${copy.savedAccount} ${copy.deviceNotice}` : copy.savedAccount];
    if (prepared.invalidIds.length > 0) parts.push(copy.badQuantity);
    else if (prepared.skipped) parts.push(copy.skipped);
    setMessage(parts.join(" "));
  }

  async function addToFavorites() {
    const picked = rows.filter((row) => row.matched && isCatalogSymbol(row.ticker) && row.ticker.length <= 12);
    if (picked.length === 0) {
      setMessage(copy.nothingToSave);
      return;
    }
    const base = symbols ?? readFavoriteSymbols();
    const { next, capped, added } = rememberFavorites(base, picked.map((row) => row.ticker));
    if (added === 0 && !capped) {
      setMessage(copy.savedFavorites);
      return;
    }
    setBusy("favorites");
    try {
      writeFavoriteSymbols(next);
    } catch {
      setMessage(copy.saveFailed);
      setBusy(null);
      return;
    }
    if (session.status === "authenticated") {
      try {
        await setFavorites(next);
      } catch {
        // Igual que la estrella: si la cuenta no responde, quedan en este navegador.
      }
    }
    setBusy(null);
    const parts = [copy.savedFavorites];
    if (rows.some((row) => !row.matched)) parts.push(copy.skipped);
    if (capped) parts.push(copy.favoritesCap);
    setMessage(parts.join(" "));
  }

  return (
    <section aria-labelledby={titleId} className="flex w-full min-w-0 flex-col gap-3">
      <header className="flex flex-col gap-1">
        <h3 id={titleId} className="text-base font-medium text-fg">
          {copy.title}
        </h3>
        <p className="text-sm leading-relaxed text-fg-body">{copy.lead}</p>
        <p id={noteId} className="text-sm leading-relaxed text-fg-body">
          {copy.notTokens}
        </p>
        <p className="text-sm leading-relaxed text-fg-muted">{copy.disclaimer}</p>
      </header>
      {rows.length === 0 ? (
        <EmptyState title={copy.emptyTitle} description={copy.emptyBody} />
      ) : (
        <ul aria-label={copy.rowsLabel} className="flex flex-col gap-2">
          {rows.map((row) => (
            <PreviewRow
              key={row.id}
              row={row}
              copy={copy}
              busy={busy !== null}
              invalid={invalid.has(row.id)}
              onQuantity={(quantityText) => patch(row.id, { quantityText })}
              onQuery={(query) => patch(row.id, { query })}
              onPick={(item) =>
                patch(row.id, {
                  ticker: item.symbol,
                  name: item.name,
                  logoUrl: item.logoUrl,
                  matched: true,
                  query: "",
                })
              }
              onUnmatch={() => patch(row.id, { matched: false, query: row.ticker })}
              onRemove={() => setRows((current) => current.filter((item) => item.id !== row.id))}
            />
          ))}
        </ul>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          size="lg"
          className="min-h-11 w-full sm:w-auto"
          loading={busy === "portfolio"}
          disabled={busy !== null || rows.length === 0}
          aria-describedby={noteId}
          onClick={() => void addToPortfolio()}
        >
          {copy.addPortfolio}
        </Button>
        <Button
          type="button"
          size="lg"
          variant="secondary"
          className="min-h-11 w-full sm:w-auto"
          loading={busy === "favorites"}
          disabled={busy !== null || rows.length === 0}
          onClick={() => void addToFavorites()}
        >
          {copy.favoritesOnly}
        </Button>
      </div>
      <p role="status" aria-live="polite" className="min-h-5 text-sm leading-relaxed text-fg-body">
        {message}
      </p>
    </section>
  );
}

function PreviewRow({
  row,
  copy,
  busy,
  invalid,
  onQuantity,
  onQuery,
  onPick,
  onUnmatch,
  onRemove,
}: {
  row: Row;
  copy: ImportarMessages;
  busy: boolean;
  invalid: boolean;
  onQuantity: (value: string) => void;
  onQuery: (value: string) => void;
  onPick: (item: { symbol: string; name: string; logoUrl: string | null }) => void;
  onUnmatch: () => void;
  onRemove: () => void;
}) {
  const quantityId = useId();
  const label = row.name ?? row.ticker;
  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-surface-1 p-3 shadow-card motion-reduce:transition-none sm:flex-row sm:items-start">
      <div className="flex min-w-0 flex-1 gap-3">
        <TickerLogo symbol={row.ticker} name={label} logoUrl={row.logoUrl} size={36} decorative loading="lazy" sizes="36px" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-fg">{row.matched ? row.ticker : label}</p>
          {row.matched && row.name ? <p className="truncate text-sm text-fg-muted">{row.name}</p> : null}
          <Badge tone={row.matched ? "up" : "warn"} className="mt-1">
            {row.matched ? copy.matched : copy.unmatched}
          </Badge>
          {row.matched ? (
            <button
              type="button"
              className="mt-1 min-h-11 rounded-full px-1 text-sm text-fg underline-offset-2 hover:underline focus-visible:ring-4 focus-visible:ring-fg/20"
              onClick={onUnmatch}
              disabled={busy}
            >
              {copy.change}
            </button>
          ) : (
            <div className="mt-2">
              <p className="text-sm text-fg-muted">
                {copy.readAs}: {label}
              </p>
              <TickerField id={`${row.id}-pick`} query={row.query} onQuery={onQuery} onPick={onPick} disabled={busy} copy={copy} />
            </div>
          )}
        </div>
      </div>
      <div className="flex items-end gap-2 sm:w-44">
        <div className="min-w-0 flex-1">
          <label htmlFor={quantityId} className="label">
            {copy.quantity}
          </label>
          <Input
            id={quantityId}
            inputMode="decimal"
            autoComplete="off"
            value={row.quantityText}
            disabled={busy}
            aria-invalid={invalid || undefined}
            className="mt-1 font-mono tabular-nums"
            onChange={(event) => onQuantity(event.target.value)}
          />
        </div>
        <IconButton label={fillImport(copy.remove, { name: label })} size="md" disabled={busy} onClick={onRemove}>
          <IconClose />
        </IconButton>
      </div>
    </li>
  );
}

function toRows(positions: readonly ImportPreviewPosition[] | null | undefined): Row[] {
  return (positions ?? []).map((position, index) => {
    const ticker = (position.ticker ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
    const name = position.name ? position.name.replace(/\s+/g, " ").trim().slice(0, 80) : null;
    return {
      id: `${index}-${ticker}-${name ?? ""}`,
      ticker,
      name,
      quantityText: position.quantity == null || !Number.isFinite(position.quantity) ? "" : String(position.quantity),
      matched: position.matched === true && isCatalogSymbol(ticker),
      logoUrl: null,
      query: position.matched ? "" : ticker || name || "",
    };
  });
}

function prepareRows(rows: readonly Row[]): { valid: ExternalHoldingInput[]; invalidIds: string[]; skipped: boolean } {
  const valid: ExternalHoldingInput[] = [];
  const invalidIds: string[] = [];
  let skipped = false;
  for (const row of rows) {
    if (!row.matched || !isCatalogSymbol(row.ticker)) {
      skipped = true;
      continue;
    }
    const quantity = parseShareQuantity(row.quantityText);
    if (quantity == null) {
      invalidIds.push(row.id);
      skipped = true;
      continue;
    }
    valid.push({ ticker: row.ticker, name: row.name, quantity });
  }
  return { valid, invalidIds, skipped };
}

function rememberFavorites(
  current: readonly string[],
  incoming: readonly string[],
): { next: string[]; capped: boolean; added: number } {
  const next = [...current];
  let capped = false;
  let added = 0;
  for (const symbol of incoming) {
    if (!isCatalogSymbol(symbol) || symbol.length > 12 || next.includes(symbol)) continue;
    if (next.length >= FAVORITES_MAX) {
      capped = true;
      break;
    }
    next.push(symbol);
    added += 1;
  }
  return { next, capped, added };
}

function readFavoriteSymbols(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(FAVORITES_KEY);
    if (!raw) return [];
    const value: unknown = JSON.parse(raw);
    const list = Array.isArray(value)
      ? value
      : value && typeof value === "object" && Array.isArray((value as { symbols?: unknown }).symbols)
        ? (value as { symbols: unknown[] }).symbols
        : null;
    if (!list) return [];
    const symbols: string[] = [];
    for (const item of list) {
      if (typeof item === "string" && item.length > 0 && !symbols.includes(item)) symbols.push(item);
    }
    return symbols;
  } catch {
    return [];
  }
}

/** Misma clave, mismo evento y el mismo PUT que `useFavorites`, en un solo envío. */
function writeFavoriteSymbols(symbols: readonly string[]) {
  const payload = JSON.stringify({ v: 1, symbols });
  window.localStorage.setItem(FAVORITES_KEY, payload);
  window.dispatchEvent(new Event(FAVORITES_EVENT));
}
