import { SPY_SYMBOL, type MoverCard as MoverCardData, type TodayBoard } from "@/lib/market/movers";

/**
 * Fichas reconocibles que el carrusel muestra primero, en este orden.
 * Son símbolos xStocks de la allowlist (`config/tickers.ts`): la búsqueda del
 * catálogo ya elige una ficha por empresa y prefiere la curada (M52b), así que
 * no se mezcla un emisor Ondo (`…on`) con su xStock (`…x`).
 */
const SPOTLIGHT_PRIORITY = ["NVDAx", "GOOGLx", "AAPLx", "MSFTx", "TSLAx"] as const;

/** Si falta alguna de las anteriores, estas también son reconocibles. */
const SPOTLIGHT_SECONDARY = ["AMZNx", "METAx", "NFLXx", "AMDx"] as const;

/** Mismo tope de slides que el carrusel ya dibuja. */
export const SPOTLIGHT_LIMIT = 6;

/**
 * Ficha del carrusel. `changePct` y `spark` sólo llevan datos reales del
 * tablero del día; una ficha que viene del catálogo pero no de las listas del
 * día queda sin variación hasta que su historial real responda.
 */
export interface SpotlightCard {
  symbol: string;
  name: string;
  logoUrl: string | null;
  /** Variación real del tablero; null si no vino en las listas del día. */
  changePct: number | null;
  /** Curva real del tablero; vacía si no vino en las listas del día. */
  spark: number[];
}

/** Campos mínimos que necesita el selector desde `/api/market/search`. */
export interface SpotlightCatalogItem {
  symbol: string;
  name: string;
  logoUrl: string | null;
  enabled: boolean;
  halted: boolean;
}

function symbolKey(symbol: string): string {
  return symbol.trim().toLowerCase();
}

function boardOrder(board: TodayBoard | undefined): MoverCardData[] {
  if (!board) return [];
  const seen = new Set<string>();
  const out: MoverCardData[] = [];
  // "Más vistos" primero: son las fichas con más observaciones y liquidez,
  // las más probables de ser reconocibles. Después, el ranking del día.
  for (const card of [...board.viewed, ...board.gainers, ...board.losers]) {
    const key = symbolKey(card.symbol);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(card);
  }
  return out;
}

function fromBoard(card: MoverCardData): SpotlightCard {
  return {
    symbol: card.symbol,
    name: card.name,
    logoUrl: card.logoUrl,
    changePct: card.changePct,
    spark: card.spark,
  };
}

function fromCatalog(item: SpotlightCatalogItem): SpotlightCard {
  return {
    symbol: item.symbol,
    name: item.name,
    logoUrl: item.logoUrl,
    changePct: null,
    spark: [],
  };
}

/**
 * Prioriza las fichas reconocibles del catálogo y completa con el tablero real.
 * - Si el catálogo aún no llegó (o falló), se usa sólo el tablero: nunca se
 *   inventan nombres, precios ni variaciones.
 * - Si una ficha prioritaria no está en las listas del día, entra igual con su
 *   nombre y logo del catálogo, pero sin variación (`changePct: null`) hasta
 *   que el historial real de la ficha responda.
 * - `SPYx` se omite del carrusel porque ya vive en el chip del encabezado;
 *   sólo vuelve como último recurso si no hay ninguna otra ficha.
 */
export function buildFeaturedPool(
  board: TodayBoard | undefined,
  catalog: readonly SpotlightCatalogItem[] | undefined,
): SpotlightCard[] {
  const cards = boardOrder(board);
  const boardBySymbol = new Map(cards.map((card) => [symbolKey(card.symbol), card] as const));
  const catalogBySymbol = new Map(
    (catalog ?? [])
      .filter((item) => item.enabled && !item.halted)
      .map((item) => [symbolKey(item.symbol), item] as const),
  );

  const picked: SpotlightCard[] = [];
  const seen = new Set<string>();

  function push(card: SpotlightCard) {
    const key = symbolKey(card.symbol);
    if (!key || seen.has(key) || picked.length >= SPOTLIGHT_LIMIT) return;
    seen.add(key);
    picked.push(card);
  }

  for (const symbol of [...SPOTLIGHT_PRIORITY, ...SPOTLIGHT_SECONDARY]) {
    if (picked.length >= SPOTLIGHT_LIMIT) break;
    const key = symbolKey(symbol);
    const item = catalogBySymbol.get(key);
    if (!item) continue;
    const boardCard = boardBySymbol.get(key);
    push(boardCard ? fromBoard(boardCard) : fromCatalog(item));
  }

  for (const card of cards) {
    if (picked.length >= SPOTLIGHT_LIMIT) break;
    if (symbolKey(card.symbol) === symbolKey(SPY_SYMBOL)) continue;
    push(fromBoard(card));
  }

  // Último recurso: si el tablero sólo trae SPYx, se muestra igual.
  if (picked.length === 0) {
    for (const card of cards) push(fromBoard(card));
  }

  return picked;
}
