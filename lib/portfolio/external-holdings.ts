import { isCatalogSymbol } from "@/lib/catalog/symbol";
import { isMissingSchemaError } from "@/lib/supabase/schema-error";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * Posiciones de seguimiento leídas de una foto.
 * No son tokens comprados ni saldos de la billetera.
 * Si la tabla `external_holdings` existe, se guarda en la cuenta.
 * Si no hay tabla, sesión o cliente, queda en este navegador.
 * La foto no se guarda.
 */

export const EXTERNAL_HOLDINGS_KEY = "mv_external_holdings";

export type ExternalHoldingInput = {
  ticker: string;
  name: string | null;
  quantity: number;
};

export type ExternalHolding = {
  ticker: string;
  name: string | null;
  quantity: number;
  source: "photo";
  createdAt: string;
};

export type SaveExternalResult =
  | { ok: true; where: "account" | "device"; saved: number }
  | { ok: false; reason: "empty" | "storage" };

export type KeyValueStore = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
};

type StoredRow = { ticker: string; quantity: number };

export type HoldingsBackend = {
  userId: () => Promise<string | null>;
  /** "missing" si la migración no está. "error" si la escritura falló. */
  replace: (userId: string, rows: readonly StoredRow[]) => Promise<"ok" | "missing" | "error">;
};

type DbError = { code?: string; message?: string } | null;

type HoldingsClient = {
  auth: {
    getUser: () => Promise<{ data: { user: { id: string } | null } }>;
  };
  from: (table: "external_holdings") => {
    delete: () => {
      eq: (
        column: "user_id",
        value: string,
      ) => {
        in: (column: "ticker", values: string[]) => Promise<{ error: DbError }>;
      };
    };
    insert: (rows: { user_id: string; ticker: string; quantity: number; source: "photo" }[]) => Promise<{ error: DbError }>;
    select: (columns: string) => {
      eq: (column: "user_id", value: string) => Promise<{ data: unknown; error: DbError }>;
    };
  };
};

export async function saveExternalHoldings(
  input: readonly ExternalHoldingInput[],
  deps: { store?: KeyValueStore | null; backend?: HoldingsBackend | null } = {},
): Promise<SaveExternalResult> {
  const rows = collapse(input);
  if (rows.length === 0) return { ok: false, reason: "empty" };
  const store = deps.store === undefined ? browserStore() : deps.store;
  const backend = deps.backend === undefined ? await defaultBackend() : deps.backend;
  if (backend) {
    try {
      const userId = await backend.userId();
      if (userId) {
        const outcome = await backend.replace(
          userId,
          rows.map((row) => ({ ticker: row.ticker, quantity: row.quantity })),
        );
        if (outcome === "ok") return { ok: true, where: "account", saved: rows.length };
      }
    } catch {
      // Sigue el respaldo de este dispositivo.
    }
  }
  if (!store) return { ok: false, reason: "storage" };
  try {
    writeLocal(store, rows);
  } catch {
    return { ok: false, reason: "storage" };
  }
  return { ok: true, where: "device", saved: rows.length };
}

export function readLocalExternalHoldings(store: KeyValueStore | null): ExternalHolding[] {
  if (!store) return [];
  return readLocal(store);
}

/** Acepta 1.5, 1,5 y 1.234,5. Cero o texto vacío no se guardan. */
export function parseShareQuantity(text: string): number | null {
  const trimmed = text.trim().replace(/\s/g, "");
  if (!trimmed) return null;
  const normalized =
    trimmed.includes(",") && trimmed.includes(".")
      ? trimmed.replace(/\./g, "").replace(",", ".")
      : trimmed.replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0 || value > 1_000_000_000) return null;
  return value;
}

function collapse(input: readonly ExternalHoldingInput[]): ExternalHolding[] {
  const map = new Map<string, ExternalHolding>();
  const now = new Date().toISOString();
  for (const row of input) {
    const ticker = row.ticker.trim();
    if (!isCatalogSymbol(ticker)) continue;
    if (!Number.isFinite(row.quantity) || row.quantity <= 0 || row.quantity > 1_000_000_000) continue;
    map.set(ticker, {
      ticker,
      name: cleanName(row.name),
      quantity: row.quantity,
      source: "photo",
      createdAt: now,
    });
  }
  return [...map.values()];
}

function cleanName(value: string | null): string | null {
  if (!value) return null;
  const text = value.replace(/\s+/g, " ").trim();
  return text ? text.slice(0, 80) : null;
}

function browserStore(): KeyValueStore | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function writeLocal(store: KeyValueStore, rows: readonly ExternalHolding[]) {
  const map = new Map(readLocal(store).map((item) => [item.ticker, item]));
  for (const row of rows) map.set(row.ticker, row);
  store.setItem(EXTERNAL_HOLDINGS_KEY, JSON.stringify({ v: 1, items: [...map.values()] }));
}

function readLocal(store: KeyValueStore): ExternalHolding[] {
  let raw: string | null;
  try {
    raw = store.getItem(EXTERNAL_HOLDINGS_KEY);
  } catch {
    return [];
  }
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !("items" in parsed) || !Array.isArray(parsed.items)) return [];
    const items: ExternalHolding[] = [];
    for (const item of parsed.items) {
      if (!item || typeof item !== "object") continue;
      const record = item as { ticker?: unknown; name?: unknown; quantity?: unknown; createdAt?: unknown };
      if (typeof record.ticker !== "string" || !isCatalogSymbol(record.ticker)) continue;
      if (typeof record.quantity !== "number" || !Number.isFinite(record.quantity) || record.quantity <= 0) continue;
      items.push({
        ticker: record.ticker,
        name: typeof record.name === "string" ? cleanName(record.name) : null,
        quantity: record.quantity,
        source: "photo",
        createdAt: typeof record.createdAt === "string" ? record.createdAt : new Date(0).toISOString(),
      });
    }
    return items;
  } catch {
    return [];
  }
}

async function defaultBackend(): Promise<HoldingsBackend | null> {
  const supabase = createSupabaseBrowserClient();
  if (!supabase) return null;
  const client = supabase as unknown as HoldingsClient;
  return {
    async userId() {
      try {
        const { data } = await client.auth.getUser();
        return data.user?.id ?? null;
      } catch {
        return null;
      }
    },
    async replace(userId, rows) {
      try {
        const tickers = rows.map((row) => row.ticker);
        if (tickers.length > 0) {
          const removed = await client.from("external_holdings").delete().eq("user_id", userId).in("ticker", tickers);
          if (removed.error) return isMissingSchemaError(removed.error) ? "missing" : "error";
        }
        if (rows.length === 0) return "ok";
        const inserted = await client
          .from("external_holdings")
          .insert(rows.map((row) => ({ user_id: userId, ticker: row.ticker, quantity: row.quantity, source: "photo" as const })));
        if (inserted.error) return isMissingSchemaError(inserted.error) ? "missing" : "error";
        return "ok";
      } catch {
        return "error";
      }
    },
  };
}
