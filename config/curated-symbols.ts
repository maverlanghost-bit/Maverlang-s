import curated from "@/data/curated-symbols.json";

export type CatalogCategory =
  | "tech"
  | "consumer"
  | "etf"
  | "fintech"
  | "finance"
  | "health"
  | "energy"
  | "industrial"
  | "commodity";

export interface CuratedEntry {
  symbol: string;
  category: CatalogCategory;
}

const VALID: ReadonlySet<string> = new Set([
  "tech",
  "consumer",
  "etf",
  "fintech",
  "finance",
  "health",
  "energy",
  "industrial",
  "commodity",
]);

function isEntry(value: unknown): value is CuratedEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.symbol === "string" &&
    entry.symbol.length > 0 &&
    typeof entry.category === "string" &&
    VALID.has(entry.category)
  );
}

/** Lista curada (50 símbolos). La fuente real es data/curated-symbols.json. */
export const CURATED_SYMBOLS: readonly CuratedEntry[] = (
  (curated as { symbols?: unknown }).symbols as unknown[]
).filter(isEntry);

/** Categoría por símbolo, ej. "AAPLx" -> "tech". */
export const CURATED_CATEGORY: ReadonlyMap<string, CatalogCategory> = new Map(
  CURATED_SYMBOLS.map((entry) => [entry.symbol, entry.category]),
);

export function isCuratedSymbol(symbol: string): boolean {
  return CURATED_CATEGORY.has(symbol);
}
