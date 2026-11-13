/**
 * Comparación de dos versiones de una misma cartera (F1: sólo avisa).
 *
 * Se compara el peso declarado de cada posición, en puntos porcentuales. Un
 * cambio de 2 puntos o menos es ruido de redondeo del feed (o un ajuste menor
 * de la declaración) y NO cuenta: el umbral es "más de 2 puntos", como quedó
 * cerrado. Las posiciones nuevas o eliminadas cuentan sólo si pesan más de 2
 * puntos; las migas de una 13F (0,1 %, 0,4 %) no disparan el aviso.
 *
 * Con `changed: true` la lista de «Mis copias» muestra «La cartera cambió» y
 * ofrece «Revisar ajuste», que arma un plan nuevo. F1 NUNCA ejecuta sola.
 */

/** Umbral en puntos porcentuales: estrictamente mayor que esto es un cambio. */
export const COPY_WEIGHT_CHANGE_PCT = 2;

/** Un movimiento de peso entre dos versiones. `null` = no estaba. */
export interface CopyWeightMove {
  symbol: string;
  from: number | null;
  to: number | null;
  /** `to - from` en puntos (con `null` cuenta como 0). */
  deltaPct: number;
}

export interface CopyVersionDiff {
  /** true si hay al menos un alta, baja o movimiento sobre el umbral. */
  changed: boolean;
  /** Posiciones que aparecen en la versión actual. */
  adds: CopyWeightMove[];
  /** Posiciones que ya no están en la versión actual. */
  removes: CopyWeightMove[];
  /** Posiciones que siguen y cambiaron de peso más de 2 puntos. */
  moves: CopyWeightMove[];
}

/** Pesos por símbolo, o cualquier lista con `{ symbol, weight }`. */
export type CopyWeightEntry = {
  symbol: string;
  weight?: number;
  /** Alternativa a `weight` (p. ej. `MappedPosition`). */
  weightOriginal?: number;
};

export type CopyWeightInput = Readonly<Record<string, number>> | readonly CopyWeightEntry[];

function cleanWeight(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return parsed;
}

function cleanSymbol(value: unknown): string {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Normaliza la entrada a un mapa símbolo → peso. Ignora símbolos vacíos y
 * pesos no finitos o ≤ 0. Los símbolos se comparan sin mayúsculas ni espacios.
 */
export function toWeightMap(input: CopyWeightInput): Map<string, number> {
  const map = new Map<string, number>();
  if (Array.isArray(input)) {
    for (const entry of input as readonly CopyWeightEntry[]) {
      const symbol = cleanSymbol(entry?.symbol);
      if (symbol === "") continue;
      const weight = cleanWeight(entry?.weight ?? entry?.weightOriginal);
      if (weight <= 0) continue;
      map.set(symbol, (map.get(symbol) ?? 0) + weight);
    }
    return map;
  }
  const record = input as Readonly<Record<string, unknown>>;
  for (const [rawSymbol, rawWeight] of Object.entries(record)) {
    const symbol = cleanSymbol(rawSymbol);
    if (symbol === "") continue;
    const weight = cleanWeight(rawWeight);
    if (weight <= 0) continue;
    map.set(symbol, weight);
  }
  return map;
}

function byDelta(left: CopyWeightMove, right: CopyWeightMove): number {
  return Math.abs(right.deltaPct) - Math.abs(left.deltaPct) || left.symbol.localeCompare(right.symbol);
}

/**
 * Compara la versión anterior con la actual. `prevWeights` puede ser el mapa
 * guardado al copiar (`Record<symbol, weight>`) y `current` las posiciones
 * actuales del feed. El umbral se puede bajar en pruebas, nunca subir por
 * encima de lo acordado desde la UI.
 */
export function diffVersions(
  prevWeights: CopyWeightInput,
  current: CopyWeightInput,
  thresholdPct: number = COPY_WEIGHT_CHANGE_PCT,
): CopyVersionDiff {
  const limit =
    Number.isFinite(thresholdPct) && thresholdPct >= 0 ? thresholdPct : COPY_WEIGHT_CHANGE_PCT;
  const before = toWeightMap(prevWeights);
  const after = toWeightMap(current);

  const adds: CopyWeightMove[] = [];
  const removes: CopyWeightMove[] = [];
  const moves: CopyWeightMove[] = [];

  const symbols = new Set<string>([...before.keys(), ...after.keys()]);
  for (const symbol of symbols) {
    const from = before.get(symbol) ?? null;
    const to = after.get(symbol) ?? null;
    if (from === null && to !== null) {
      if (to > limit) adds.push({ symbol, from: null, to: round(to), deltaPct: round(to) });
      continue;
    }
    if (from !== null && to === null) {
      if (from > limit) removes.push({ symbol, from: round(from), to: null, deltaPct: round(-from) });
      continue;
    }
    if (from === null || to === null) continue;
    const delta = to - from;
    if (Math.abs(delta) > limit) {
      moves.push({ symbol, from: round(from), to: round(to), deltaPct: round(delta) });
    }
  }

  adds.sort(byDelta);
  removes.sort(byDelta);
  moves.sort(byDelta);

  return { changed: adds.length + removes.length + moves.length > 0, adds, removes, moves };
}
