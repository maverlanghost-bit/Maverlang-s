/**
 * Símbolo del catálogo en la entrada HTTP.
 * xStocks termina en `x` (`AAPLx`, `BRK.Bx`). Ondo termina en `on` (`ABNBon`).
 * No dice que se pueda comprar: eso lo decide el estado de seguridad.
 */
export const CATALOG_SYMBOL = /^[A-Za-z0-9.]{1,12}(?:x|on)$/;

export function isCatalogSymbol(symbol: string): boolean {
  return CATALOG_SYMBOL.test(symbol);
}
