import { logoPathFor, safeLogoFileName } from "@/lib/catalog/xstocks";

/** Sufijo de catálogo: `x` de xStocks o `on` de Ondo. */
const CATALOG_SUFFIX = /(?:on|x)$/i;

/**
 * Ruta local si el archivo ya está en `public/logos`. Si no, null: la
 * interfaz muestra el monograma. No se inventa un logo ni se enlaza uno externo.
 */
export function logoPathIfPresent(underlying: string, files: ReadonlySet<string>): string | null {
  const trimmed = underlying.trim();
  if (!trimmed) return null;
  const file = safeLogoFileName(trimmed);
  if (!files.has(file)) return null;
  return logoPathFor(trimmed);
}

/**
 * Ruta del logo a partir del símbolo (`AALon` → `/logos/aal.png`,
 * `BRK.Bx` → `/logos/brk-b.png`). No mira el disco: si el archivo falta,
 * el componente vuelve al monograma.
 */
export function logoPathFromSymbol(symbol: string): string | null {
  const trimmed = symbol.trim();
  if (!CATALOG_SUFFIX.test(trimmed)) return null;
  const underlying = trimmed.replace(CATALOG_SUFFIX, "");
  if (!underlying) return null;
  return logoPathFor(underlying);
}
