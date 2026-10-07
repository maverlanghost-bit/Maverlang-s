/**
 * Favoritas: local (este navegador) + cuenta (Supabase). Puro y testeable.
 * El servidor valida de nuevo con zod; acá sólo se ordena y se limita.
 */

/** Máximo de favoritas por cuenta. */
export const FAVORITES_MAX = 200;

/** Normaliza un símbolo: recorta, mayúsculas, sólo letras/números/punto/guion. */
export function sanitizeFavoriteSymbol(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const symbol = value.trim().toUpperCase();
  if (symbol.length < 1 || symbol.length > 12) return null;
  if (!/^[A-Z0-9.-]+$/.test(symbol)) return null;
  return symbol;
}

/** Lista saneada, sin duplicados, cortada al máximo. */
export function sanitizeFavoriteSymbols(values: readonly unknown[]): string[] {
  const out: string[] = [];
  for (const value of values) {
    const symbol = sanitizeFavoriteSymbol(value);
    if (symbol && !out.includes(symbol)) out.push(symbol);
    if (out.length >= FAVORITES_MAX) break;
  }
  return out;
}

/**
 * Mezcla servidor + local (unión, servidor primero). Lo local que el servidor
 * no tiene se sube después con PUT; lo del servidor nunca se borra en la mezcla.
 */
export function mergeFavoriteSymbols(server: readonly unknown[], local: readonly unknown[]): string[] {
  const cleanServer = sanitizeFavoriteSymbols(server);
  const cleanLocal = sanitizeFavoriteSymbols(local);
  const merged = [...cleanServer];
  for (const symbol of cleanLocal) {
    if (!merged.includes(symbol)) merged.push(symbol);
  }
  return merged.slice(0, FAVORITES_MAX);
}

/** true si hay algo que subir al servidor. */
export function favoritesNeedUpload(server: readonly string[], merged: readonly string[]): boolean {
  if (server.length !== merged.length) return true;
  return merged.some((symbol) => !server.includes(symbol));
}
