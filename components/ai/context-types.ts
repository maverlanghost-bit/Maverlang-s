/**
 * Contexto del chat del asistente: tipos y helpers puros.
 *
 * Este módulo no importa React ni Next: se puede probar aislado y usar tanto en
 * cliente como en servidor. No hace llamadas de red ni lee estado global; todas
 * las cifras llegan en `ContextSnapshot` y las que no son finitas se omiten.
 */

export type ContextItem = {
  id: string;
  kind: "stock" | "index" | "portfolio";
  symbol: string;
  name: string;
};

export type ContextSnapshot = {
  totalUsd: number | null;
  positions: {
    symbol: string;
    name: string;
    valueUsd: number | null;
    weightPct: number | null;
  }[];
  prices: Record<string, number | null>;
};

/** Tope de elementos que el usuario puede adjuntar al chat. */
export const MAX_CONTEXT_ITEMS = 6;

/** Índices y ETFs destacados del selector de contexto. */
export const INDEX_SYMBOLS = ["SPYx", "QQQx", "IWMx", "VTIx", "GLDx"] as const;

/** Fila especial que adjunta el resumen completo de la cartera. */
export const PORTFOLIO_ITEM: ContextItem = {
  id: "portfolio:all",
  kind: "portfolio",
  symbol: "CARTERA",
  name: "Toda mi cartera",
};

/** Prefijo exacto de la directiva que viaja al LLM dentro del mensaje. */
const DIRECTIVE_PREFIX = "Contexto del usuario (úsalo si es relevante): ";

/** Máximo de posiciones con peso que se listan en la directiva. */
const MAX_WEIGHTED_POSITIONS = 8;

/** USD con dos decimales, locale chileno: 182.4 → "US$182,40". */
const usdFormatter = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Porcentaje ya expresado en puntos (40 → "40 %"), hasta un decimal. */
const percentFormatter = new Intl.NumberFormat("es-CL", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
});

/** Deja un texto en una sola línea para no romper el formato de la directiva. */
function singleLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** Devuelve el monto formateado o null si la cifra no sirve. */
function formatUsd(value: number | null | undefined): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return usdFormatter.format(value);
}

/** Devuelve el peso formateado como "12,5 %" o null si la cifra no sirve. */
function formatWeight(value: number | null | undefined): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return `${percentFormatter.format(value)} %`;
}

/** Símbolo (nombre) y, si hay precio real, el precio al final. */
function describeHolding(
  item: ContextItem,
  prices: Record<string, number | null> | undefined,
): string {
  const symbol = singleLine(item.symbol);
  const name = singleLine(item.name);
  const base = name.length > 0 ? `${symbol} (${name})` : symbol;
  const price = formatUsd(prices?.[item.symbol]);
  return price === null ? base : `${base} ${price}`;
}

/** Índices: sólo el símbolo, con precio real si existe. */
function describeIndex(
  item: ContextItem,
  prices: Record<string, number | null> | undefined,
): string {
  const symbol = singleLine(item.symbol);
  const price = formatUsd(prices?.[item.symbol]);
  return price === null ? symbol : `${symbol} ${price}`;
}

/** Parte "cartera: total …, posiciones …"; null si no hay ninguna cifra real. */
function describePortfolio(snapshot: ContextSnapshot | null | undefined): string | null {
  const fragments: string[] = [];

  const total = formatUsd(snapshot?.totalUsd);
  if (total !== null) fragments.push(`total ${total}`);

  const weights: string[] = [];
  for (const position of snapshot?.positions ?? []) {
    if (weights.length >= MAX_WEIGHTED_POSITIONS) break;
    const weight = formatWeight(position?.weightPct);
    if (weight === null) continue;
    const symbol = singleLine(position.symbol);
    weights.push(`${symbol} ${weight}`);
  }
  if (weights.length > 0) fragments.push(`posiciones ${weights.join(", ")}`);

  if (fragments.length === 0) return null;
  return `cartera: ${fragments.join(", ")}`;
}

/** Agrega el elemento al final si no estaba y aún hay cupo; nunca muta la lista. */
export function toggleContextItem(list: readonly ContextItem[], item: ContextItem): ContextItem[] {
  if (isInContext(list, item.id)) {
    return list.filter((entry) => entry.id !== item.id);
  }
  if (list.length >= MAX_CONTEXT_ITEMS) {
    return [...list];
  }
  return [...list, item];
}

/** Quita el elemento por id; siempre devuelve una lista nueva. */
export function removeContextItem(list: readonly ContextItem[], id: string): ContextItem[] {
  return list.filter((entry) => entry.id !== id);
}

/** Indica si el elemento ya está adjunto. */
export function isInContext(list: readonly ContextItem[], id: string): boolean {
  return list.some((entry) => entry.id === id);
}

/**
 * Directiva de una línea para el LLM, o "" si no hay nada útil que contar.
 *
 * Formato: `Contexto del usuario (úsalo si es relevante): acciones: NVDAx
 * (NVIDIA) US$182,40; índices: SPYx; cartera: total US$1.234,56, posiciones
 * NVDAx 40 %`. Sólo incluye cifras finitas: nunca imprime NaN, Infinity, null
 * ni undefined, y no lanza con snapshots incompletos.
 */
export function buildContextDirective(
  items: readonly ContextItem[],
  snapshot: ContextSnapshot,
): string {
  if (items.length === 0) return "";

  const parts: string[] = [];

  const stocks = items.filter((item) => item.kind === "stock");
  if (stocks.length > 0) {
    parts.push(
      `acciones: ${stocks.map((item) => describeHolding(item, snapshot?.prices)).join(", ")}`,
    );
  }

  const indexes = items.filter((item) => item.kind === "index");
  if (indexes.length > 0) {
    parts.push(`índices: ${indexes.map((item) => describeIndex(item, snapshot?.prices)).join(", ")}`);
  }

  if (items.some((item) => item.kind === "portfolio")) {
    const portfolio = describePortfolio(snapshot);
    if (portfolio !== null) parts.push(portfolio);
  }

  if (parts.length === 0) return "";
  return `${DIRECTIVE_PREFIX}${parts.join("; ")}`;
}
