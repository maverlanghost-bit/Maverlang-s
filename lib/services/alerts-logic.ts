import { CATALOG_SYMBOL } from "@/lib/catalog/symbol";

/**
 * Avisos de precio y orden de favoritas. Puro: sin red, sin base y sin
 * precios inventados. El cron y la pantalla sólo usan estas reglas.
 */

/** Tope de avisos activos por cuenta. Lo aplica el API, no la tabla. */
export const ACTIVE_ALERT_CAP = 20;

export const ACTIVE_ALERT_CAP_MESSAGE = "Puedes tener hasta 20 avisos activos.";

export type AlertDirection = "above" | "below";

export type AlertStorage = "db" | "memory";

export type FavoriteSort = "change" | "name";

export type PriceAlert = {
  id: string;
  symbol: string;
  direction: AlertDirection;
  priceUsd: number;
  active: boolean;
  triggeredAt: string | null;
  createdAt: string;
};

export type PriceAlertCronSummary = {
  ok: true;
  mode: "mock" | "live" | "unavailable";
  checked: number;
  triggered: number;
  emailed: number;
  skipped: number;
  truncated: boolean;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** `numeric(14,4)`: 10 dígitos enteros y 4 decimales. */
const MAX_ALERT_PRICE = 9_999_999_999.9999;

export function isAlertId(value: string): boolean {
  return UUID_RE.test(value);
}

/** Símbolo de catálogo, sin cambiar mayúsculas (el sufijo `x`/`on` es minúscula). */
export function normalizeAlertSymbol(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const symbol = value.trim();
  if (!CATALOG_SYMBOL.test(symbol)) return null;
  return symbol;
}

/** Precio US$ mayor que cero, redondeado a 4 decimales. null si no sirve. */
export function normalizeAlertPrice(value: number): number | null {
  if (!Number.isFinite(value) || value <= 0 || value > MAX_ALERT_PRICE) return null;
  const rounded = Math.round(value * 10_000) / 10_000;
  if (!Number.isFinite(rounded) || rounded <= 0 || rounded > MAX_ALERT_PRICE) return null;
  return rounded;
}

/**
 * Acepta `180.5` y `180,5`. Rechaza vacío, cero, varios separadores
 * y cualquier cosa que no sea un número.
 */
export function parseAlertPriceInput(raw: string): number | null {
  const trimmed = raw.trim().replace(/\s/g, "");
  if (!trimmed) return null;
  const comma = trimmed.includes(",");
  const dot = trimmed.includes(".");
  if (comma && dot) return null;
  const normalized = comma ? trimmed.replace(",", ".") : trimmed;
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  return normalizeAlertPrice(Number(normalized));
}

export function canCreateActiveAlert(activeCount: number): boolean {
  return Number.isInteger(activeCount) && activeCount >= 0 && activeCount < ACTIVE_ALERT_CAP;
}

/**
 * "Sube de / baja de": el dato del día alcanzó el nivel (incluye igualdad).
 * Sin un precio real positivo no hay cruce.
 */
export function alertMatches(direction: AlertDirection, thresholdUsd: number, observedUsd: number): boolean {
  if (!Number.isFinite(thresholdUsd) || thresholdUsd <= 0) return false;
  if (!Number.isFinite(observedUsd) || observedUsd <= 0) return false;
  if (direction === "above") return observedUsd >= thresholdUsd;
  return observedUsd <= thresholdUsd;
}

/**
 * Prefiere el último cierre real (ya en US$ por acción mostrada).
 * Si no hay cierre, usa el precio actual del token sólo cuando es real
 * (`tokenReal`). Un precio mock o de relleno no cuenta.
 */
export function pickReferencePrice(input: {
  closeUsd: number | null;
  multiplier: number | null;
  tokenUsd: number | null;
  tokenReal: boolean;
}): number | null {
  const close = positive(input.closeUsd);
  if (close != null) {
    const multiplier = positive(input.multiplier) ?? 1;
    const adjusted = close * multiplier;
    return positive(adjusted);
  }
  if (!input.tokenReal) return null;
  return positive(input.tokenUsd);
}

function positive(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  return value;
}

export type TriggerHit = { id: string; observedUsd: number };

/**
 * Avisos que cruzan el dato de hoy. Ignora inactivos, ya avisados y
 * símbolos sin precio (no se inventa un cruce).
 * `prices` va en minúsculas por símbolo.
 */
export function alertsToTrigger(
  alerts: readonly Pick<PriceAlert, "id" | "symbol" | "direction" | "priceUsd" | "active" | "triggeredAt">[],
  prices: ReadonlyMap<string, number | null>,
): TriggerHit[] {
  const hits: TriggerHit[] = [];
  for (const alert of alerts) {
    if (!alert.active || alert.triggeredAt != null) continue;
    const observed = prices.get(alert.symbol.toLowerCase()) ?? null;
    if (observed == null) continue;
    if (!alertMatches(alert.direction, alert.priceUsd, observed)) continue;
    hits.push({ id: alert.id, observedUsd: observed });
  }
  return hits;
}

export type FavoriteSortRow = {
  symbol: string;
  name: string;
  change24hPct: number | null;
};

/**
 * Cambio del día: el mayor primero. Sin dato queda al final (no se trata
 * como 0). Nombre: español, sin distinguir mayúsculas.
 */
export function sortFavoriteRows<T extends FavoriteSortRow>(rows: readonly T[], sort: FavoriteSort): T[] {
  const copy = [...rows];
  copy.sort((a, b) => {
    if (sort === "name") return compareName(a, b);
    const change = compareChange(a.change24hPct, b.change24hPct);
    return change || compareName(a, b);
  });
  return copy;
}

function compareName(a: FavoriteSortRow, b: FavoriteSortRow): number {
  const byName = a.name.localeCompare(b.name, "es", { sensitivity: "base" });
  return byName || a.symbol.localeCompare(b.symbol, "es", { sensitivity: "base" });
}

function compareChange(a: number | null, b: number | null): number {
  const aOk = a != null && Number.isFinite(a);
  const bOk = b != null && Number.isFinite(b);
  if (aOk && bOk) return (b as number) - (a as number);
  if (aOk) return -1;
  if (bOk) return 1;
  return 0;
}

export function uniqueSymbols(symbols: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const symbol of symbols) {
    const key = symbol.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(symbol.trim());
  }
  return out;
}

/** Lotes para `/api/prices` (máximo 50) y para Jupiter. */
export function chunkSymbols(symbols: readonly string[], size = 50): string[][] {
  const step = Number.isInteger(size) && size > 0 ? size : 50;
  const out: string[][] = [];
  for (let index = 0; index < symbols.length; index += step) {
    out.push(symbols.slice(index, index + step));
  }
  return out;
}

/** US$ estable para el correo (punto decimal, sin depender del locale). */
export function formatAlertUsd(value: number): string {
  const negative = value < 0;
  const rounded = Math.round(Math.abs(value) * 10_000) / 10_000;
  const fixed = rounded.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  const [whole, frac = ""] = fixed.split(".");
  const digits = (frac + "00").slice(0, Math.max(2, frac.length));
  return `${negative ? "-" : ""}US$${whole}.${digits}`;
}
