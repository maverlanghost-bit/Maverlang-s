import "server-only";

import { DomainError } from "@/lib/api/result";
import { findAssetByMint, findAssetBySymbol } from "@/lib/catalog/assets";

/**
 * Allowlist dinámica (M54, sólo servidor). Operar exige que el activo esté
 * `tradable` en el catálogo cacheado (sólo `listed`, con la transición de
 * M54 mientras no haya listados) y que el mint tenga forma de xStocks.
 * Si Supabase falla, el catálogo cae al snapshot estático
 * (`config/tickers.generated.ts`): nunca se permite un mint desconocido.
 * `lib/solana/allowlist.ts` sigue existiendo para el cliente (es puro);
 * ningún archivo cliente importa este módulo.
 */

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function hasMintShape(mint: string): boolean {
  if (!mint.startsWith("Xs")) return false;
  if (mint.length < 43 || mint.length > 44) return false;
  for (const char of mint) {
    if (!BASE58.includes(char)) return false;
  }
  return true;
}

/** true si el mint es operable hoy (catálogo + forma). Nunca "permitir todo". */
export async function isTradableMint(
  mint: string,
  deps?: { fetchImpl?: typeof fetch; now?: () => number },
): Promise<boolean> {
  if (!hasMintShape(mint)) return false;
  const asset = await findAssetByMint(mint, deps);
  if (!asset || !asset.tradable) return false;
  return asset.mint === mint;
}

export interface TradableAsset {
  symbol: string;
  mint: string;
}

/** Activo operable por símbolo, o null si no se puede operar (watch/hidden/desconocido). */
export async function tradableBySymbol(
  symbol: string,
  deps?: { fetchImpl?: typeof fetch; now?: () => number },
): Promise<TradableAsset | null> {
  const wanted = symbol.trim();
  if (!wanted) return null;
  const asset = await findAssetBySymbol(wanted, { scope: "all", ...deps });
  if (!asset || !asset.tradable) return null;
  if (!hasMintShape(asset.mint)) return null;
  return { symbol: asset.symbol, mint: asset.mint };
}

/** Símbolo canónico operable. Lo desconocido o no operable → `MINT_NOT_ALLOWED`. */
export async function requireTradableSymbol(
  symbol: string,
  deps?: { fetchImpl?: typeof fetch; now?: () => number },
): Promise<string> {
  const asset = await tradableBySymbol(symbol, deps);
  if (!asset) throw new DomainError("MINT_NOT_ALLOWED");
  return asset.symbol;
}
