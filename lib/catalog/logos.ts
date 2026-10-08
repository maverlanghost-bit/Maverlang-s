import { logoPathFor, safeLogoFileName } from "@/lib/catalog/xstocks";

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
