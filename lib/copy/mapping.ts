import "server-only";

import { ONDO_BY_SYMBOL } from "@/config/ondo.generated";
import { findAssetBySymbol, type CatalogAsset } from "@/lib/catalog/assets";
import { tradableBySymbol } from "@/lib/catalog/tradable";
import type { CopyFamily, CopyPosition } from "@/lib/copy/types";

/**
 * Mapeo de las posiciones del feed de Fraccion.si a mints que Maverlang puede
 * operar HOY. No inventa datos ni mints: reutiliza el catálogo real
 * (`lib/catalog/assets.ts`) y la puerta de operación (`tradableBySymbol` de
 * `lib/catalog/tradable.ts`), que ya exige `tradable` y un mint válido para su
 * emisor (forma `Xs` en xStocks, registro `config/ondo.generated.ts` en Ondo).
 *
 * Regla de oro: dos versiones del mismo subyacente (`AAPLx` de xStocks y
 * `AAPLon` de Ondo) no se mezclan. Si el catálogo tiene las dos, gana la ficha
 * que el mismo catálogo elige para la empresa (`applyListing`/M52b), que es la
 * que el usuario ve en el mercado. Para eso se consulta el símbolo xStocks y el
 * símbolo Ondo del registro oficial: `findAssetBySymbol` sin `noListing`
 * devuelve la ficha elegida de la empresa, así que ambos caminos coinciden.
 *
 * Estados:
 *   - `available`   : hay token operable (`tradableSymbol` es el símbolo real).
 *   - `review`      : está en el catálogo pero en `watch`/`hidden` (o sin estado
 *                     de seguridad): «En revisión», se puede mirar, no copiar.
 *   - `unavailable` : no se puede mapear. Cortos, acciones chilenas (familia
 *                     `broker_cl`/`afp` o moneda CLP), filas sin ticker (CUSIP
 *                     sin resolver, bonos, nombres) y tickers sin token.
 *
 * Cripto y LST (Ganar) NO entran: el feed de carteras no los trae y acá sólo se
 * resuelven acciones/ETFs tokenizados. Ninguna posición de cripto se mapea.
 *
 * `weightMaverlang` es el peso renormalizado entre las posiciones DISPONIBLES
 * (suma 100 entre ellas, 0 en las demás). El plan decide después si reparte lo
 * no disponible o lo deja en USDC; para eso usa `weightOriginal`.
 */

/** Estado de una posición del feed frente al catálogo de Maverlang. */
export type MappedStatus = "available" | "review" | "unavailable";

export interface MappedPosition {
  /** Símbolo tal como viene del feed (trim), para poder citarlo. */
  symbol: string;
  /** Símbolo operable en Maverlang (`AAPLx`, `AAPLon`…) o null. */
  tradableSymbol: string | null;
  status: MappedStatus;
  /** Motivo en español de Chile, para mostrar en la ficha/carrito. */
  reason?: string;
  /** Peso del feed, en porcentaje (0–100). Nunca se altera. */
  weightOriginal: number;
  /** Peso dentro de lo disponible (0–100, suma 100 entre las `available`). */
  weightMaverlang: number;
}

export interface MapPositionsOptions {
  /** Familia de la cartera: `broker_cl`/`afp` son acciones chilenas. */
  family?: CopyFamily;
  /** Sólo para pruebas o llamadas con caché propia. */
  deps?: { fetchImpl?: typeof fetch; now?: () => number };
}

/** Motivos visibles, en español de Chile, sin promesas ni recomendaciones. */
export const MAPPING_REASONS = {
  short: "Corto: Maverlang no vende en corto, así que esta posición no se copia.",
  chile: "Acción chilena: se puede mirar, pero no se compra en Maverlang.",
  noTicker: "Sin ticker: esta fila no se puede asociar a un token de Maverlang.",
  review: "En revisión: se puede mirar, pero todavía no se copia.",
  noToken: "No disponible en Maverlang.",
  halted: "Suspendida: no se puede operar ahora en Maverlang.",
} as const;

/** Familias cuyas posiciones son acciones chilenas (sólo para mirar). */
const CHILE_FAMILIES: readonly CopyFamily[] = ["broker_cl", "afp"];

/**
 * Ticker accionario razonable: 1–10 caracteres alfanuméricos con posible
 * sufijo de clase (`BRK.B`, `BF-B`). Deja fuera nombres con espacios, CUSIP,
 * ISIN y bonos, que no se pueden mapear.
 */
const TICKER_PATTERN = /^[A-Z][A-Z0-9]{0,9}(?:[.\-][A-Z][A-Z0-9]{0,2})?$/;

/**
 * Símbolo que YA viene con el sufijo de Maverlang (xStocks `x` u Ondo `on`, en
 * minúscula: `AAPLx`, `AAPLon`, `BRK.Bx`). Un ticker de EE.UU. en mayúsculas
 * (`XRX`, `ONON`) no calza con este patrón.
 */
const SUFFIXED_PATTERN = /^[A-Z0-9.\-]+(?:x|on)$/;

/** Tope de consultas simultáneas al catálogo: no se golpea Supabase con 50. */
const CATALOG_CONCURRENCY = 6;
/** Memoria corta por símbolo: dos lecturas seguidas no repiten el catálogo. */
const MEMO_TTL_MS = 60_000;
const MEMO_MAX_ENTRIES = 1_000;

interface Resolution {
  status: MappedStatus;
  tradableSymbol: string | null;
  reason?: string;
}

const memo = new Map<string, { at: number; value: Resolution }>();

function memoGet(key: string, now: number): Resolution | null {
  const hit = memo.get(key);
  if (!hit) return null;
  if (now - hit.at >= MEMO_TTL_MS) {
    memo.delete(key);
    return null;
  }
  return hit.value;
}

function memoSet(key: string, value: Resolution, now: number): void {
  if (memo.size >= MEMO_MAX_ENTRIES) memo.clear();
  memo.set(key, { at: now, value });
}

/** Sólo para pruebas: vacía la memoria corta del mapeo. */
export function __clearMappingMemoForTests(): void {
  memo.clear();
}

/** Peso válido: finito y no negativo. Lo raro cae a 0 y no afecta la cobertura. */
function normalWeight(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return parsed;
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function sumWeights(rows: readonly Pick<MappedPosition, "weightOriginal">[]): number {
  return rows.reduce((sum, row) => sum + row.weightOriginal, 0);
}

/**
 * Candidatos a buscar en el catálogo. xStocks usa `<TICKER>x`; Ondo usa el
 * símbolo EXACTO del registro oficial (`ONDO_BY_SYMBOL`), que además es la
 * única fuente de sus mints: un ticker fuera del registro no puede ser Ondo.
 */
function candidatesFor(base: string): string[] {
  const candidates = [`${base}x`];
  const ondo = ONDO_BY_SYMBOL.get(`${base}on`.toLowerCase());
  if (ondo) candidates.push(ondo.symbol);
  return candidates;
}

/** Separa un símbolo del feed en subyacente + posible sufijo ya resuelto. */
function splitSymbol(raw: string): { base: string; exact: string | null } {
  if (SUFFIXED_PATTERN.test(raw)) return { base: "", exact: raw };
  return { base: raw.toUpperCase(), exact: null };
}

async function mapWithLimit<T, R>(
  items: readonly T[],
  limit: number,
  run: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  const workers = Math.max(1, Math.min(limit, items.length));
  let next = 0;
  await Promise.all(
    Array.from({ length: workers }, async () => {
      for (;;) {
        const index = next;
        next += 1;
        if (index >= items.length) return;
        out[index] = await run(items[index], index);
      }
    }),
  );
  return out;
}

/**
 * Ficha encontrada en el catálogo: se confirma con `tradableBySymbol` (la
 * misma puerta que usa la compra) y, si no es operable, se distingue «en
 * revisión» de «no disponible» con el estado de seguridad real.
 */
async function resolveCatalogAsset(
  asset: CatalogAsset,
  deps?: MapPositionsOptions["deps"],
): Promise<Resolution> {
  const operable = await tradableBySymbol(asset.symbol, deps);
  if (operable) return { status: "available", tradableSymbol: operable.symbol };
  if (
    asset.safetyStatus === "watch" ||
    asset.safetyStatus === "hidden" ||
    asset.safetyStatus === "unknown" ||
    asset.underReview
  ) {
    return { status: "review", tradableSymbol: null, reason: MAPPING_REASONS.review };
  }
  if (asset.halted) {
    return { status: "unavailable", tradableSymbol: null, reason: MAPPING_REASONS.halted };
  }
  return { status: "unavailable", tradableSymbol: null, reason: MAPPING_REASONS.noToken };
}

async function resolveSymbol(
  base: string,
  exact: string | null,
  deps?: MapPositionsOptions["deps"],
): Promise<Resolution> {
  const key = exact ?? base;
  const useMemo = !deps;
  const now = deps?.now?.() ?? Date.now();
  if (useMemo) {
    const hit = memoGet(key, now);
    if (hit) return hit;
  }
  const candidates = exact ? [exact] : candidatesFor(base);
  const chosenRows = await Promise.all(
    candidates.map((symbol) => findAssetBySymbol(symbol, { scope: "all", ...(deps ?? {}) })),
  );
  const chosen = chosenRows.find((row): row is CatalogAsset => row !== null) ?? null;
  let resolution: Resolution;
  if (chosen) {
    resolution = await resolveCatalogAsset(chosen, deps);
  } else {
    // Segunda pasada: ¿existe la fila pero está `hidden` o sin estado visible?
    // Entonces es «En revisión»; si no existe en absoluto, no hay token.
    const hiddenRows = await Promise.all(
      candidates.map((symbol) =>
        findAssetBySymbol(symbol, { scope: "all", allowHidden: true, ...(deps ?? {}) }),
      ),
    );
    resolution = hiddenRows.some((row) => row !== null)
      ? { status: "review", tradableSymbol: null, reason: MAPPING_REASONS.review }
      : { status: "unavailable", tradableSymbol: null, reason: MAPPING_REASONS.noToken };
  }
  if (useMemo) memoSet(key, resolution, now);
  return resolution;
}

/**
 * Mapea las posiciones del feed (en el mismo orden) a mints operables.
 * `mapPositions(positions)` es la firma del contrato; `options.family` sólo
 * mejora el motivo de las carteras chilenas.
 */
export async function mapPositions(
  positions: readonly CopyPosition[],
  options: MapPositionsOptions = {},
): Promise<MappedPosition[]> {
  const family = options.family;
  const deps = options.deps;
  const chileFamily = family !== undefined && CHILE_FAMILIES.includes(family);

  const rows = await mapWithLimit(
    positions,
    CATALOG_CONCURRENCY,
    async (position): Promise<MappedPosition> => {
      const rawSymbol = typeof position.symbol === "string" ? position.symbol.trim() : "";
      const weightOriginal = normalWeight(position.weight);
      const base = { symbol: rawSymbol, weightOriginal, weightMaverlang: 0 } as const;

      if (position.side === "short") {
        return { ...base, tradableSymbol: null, status: "unavailable", reason: MAPPING_REASONS.short };
      }
      if (chileFamily || position.currency === "CLP") {
        return { ...base, tradableSymbol: null, status: "unavailable", reason: MAPPING_REASONS.chile };
      }
      if (!TICKER_PATTERN.test(rawSymbol.toUpperCase())) {
        return { ...base, tradableSymbol: null, status: "unavailable", reason: MAPPING_REASONS.noTicker };
      }

      const { base: normalizedBase, exact } = splitSymbol(rawSymbol);
      const resolution = await resolveSymbol(normalizedBase, exact, deps);
      return { ...base, ...resolution };
    },
  );

  const availableWeight = rows.reduce(
    (sum, row) => (row.status === "available" ? sum + row.weightOriginal : sum),
    0,
  );
  return rows.map((row) => {
    if (row.status !== "available" || availableWeight <= 0) return { ...row, weightMaverlang: 0 };
    return { ...row, weightMaverlang: round((row.weightOriginal / availableWeight) * 100, 4) };
  });
}

/**
 * Cobertura de la cartera en Maverlang, 0–100: porcentaje del peso DECLARADO
 * por el feed que sí se puede comprar. Se mide contra lo declarado (no contra
 * 100) porque un `top50_of_full_book` declara sólo el recorte que conoce; la
 * ficha lo explica con su chip «Top 50 del libro».
 */
export function coverageOf(
  mapped: readonly Pick<MappedPosition, "status" | "weightOriginal">[],
): number {
  let declared = 0;
  let available = 0;
  for (const row of mapped) {
    if (!Number.isFinite(row.weightOriginal) || row.weightOriginal <= 0) continue;
    declared += row.weightOriginal;
    if (row.status === "available") available += row.weightOriginal;
  }
  if (declared <= 0) return 0;
  return round(Math.min(100, (available / declared) * 100), 1);
}

/** Sólo para el plan: peso declarado total de una lista ya mapeada. */
export function declaredWeightOf(
  mapped: readonly Pick<MappedPosition, "weightOriginal">[],
): number {
  return sumWeights(mapped);
}
