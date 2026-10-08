import "server-only";

import { ONDO_MINTS, ONDO_TICKERS } from "@/config/ondo.generated";
import { TICKERS } from "@/config/tickers";
import { DomainError } from "@/lib/api/result";
import { findAssetByMint, findAssetBySymbol } from "@/lib/catalog/assets";

/**
 * Allowlist dinámica (M54/M52b, sólo servidor). La COMPRA exige que el activo
 * esté `tradable` en el catálogo cacheado (sólo `listed`, con la transición de
 * M54 mientras no haya listados) y que el mint pertenezca a su emisor:
 * forma `Xs` para `xstocks`, registro `config/ondo.generated.ts` para `ondo`.
 * La VENTA (M54c-fix, decisión de Manu/operador) sólo exige que el símbolo
 * exista en el catálogo con cualquier estado (incluido `hidden`) o en los
 * snapshots, con mint válido para su emisor: lo que ya se tiene siempre se
 * puede vender. Lo desconocido da `MINT_NOT_ALLOWED` en ambos lados.
 * Si Supabase falla, el catálogo cae al snapshot estático
 * (`config/tickers.generated.ts`): nunca se permite un mint desconocido.
 * Un mint Ondo en `watch` no se compra aunque el cliente lo mande a mano.
 * `lib/solana/allowlist.ts` sigue existiendo para el cliente (es puro);
 * ningún archivo cliente importa este módulo.
 */

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function hasXstocksMintShape(mint: string): boolean {
  if (!mint.startsWith("Xs")) return false;
  if (mint.length < 43 || mint.length > 44) return false;
  for (const char of mint) {
    if (!BASE58.includes(char)) return false;
  }
  return true;
}

/** true si el mint es operable hoy (catálogo + emisor). Nunca "permitir todo". */
export async function isTradableMint(
  mint: string,
  deps?: { fetchImpl?: typeof fetch; now?: () => number },
): Promise<boolean> {
  // El registro Ondo manda primero: exacto por mint, sin forma `Xs`.
  if (ONDO_MINTS.has(mint)) {
    const asset = await findAssetByMint(mint, deps);
    if (!asset || asset.issuer !== "ondo") return false;
    if (!asset.tradable) return false;
    return asset.mint === mint;
  }
  if (!hasXstocksMintShape(mint)) return false;
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
  // Fila exacta, sin ficha elegida: lo pedido a mano en `watch` no se opera.
  const asset = await findAssetBySymbol(wanted, { scope: "all", noListing: true, ...deps });
  if (!asset || !asset.tradable) return null;
  // El prefijo `Xs` se exige sólo a `xstocks`; Ondo valida contra su registro.
  if (asset.issuer === "ondo") {
    if (!ONDO_MINTS.has(asset.mint)) return null;
  } else if (!hasXstocksMintShape(asset.mint)) {
    return null;
  }
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

export type TradeSide = "buy" | "sell";

/**
 * Puerta por lado (M54c-fix, un solo lugar). `buy` exige `tradable` (regla
 * actual, incluida la transición de M54). `sell` basta con que el símbolo
 * exista en el catálogo con cualquier estado (incluido `hidden`, con
 * `allowHidden`) o en los snapshots (xStocks `config/tickers.generated.ts` u
 * Ondo `config/ondo.generated.ts`), con mint válido para su emisor. Un
 * mint/símbolo desconocido da `MINT_NOT_ALLOWED` en ambos lados: nunca se
 * permite todo. Que el usuario tenga acciones suficientes se valida después,
 * en el servicio, como siempre.
 */
export async function requireOperable(
  symbol: string,
  side: TradeSide,
  deps?: { fetchImpl?: typeof fetch; now?: () => number },
): Promise<TradableAsset> {
  const wanted = symbol.trim();
  if (!wanted) throw new DomainError("MINT_NOT_ALLOWED");
  if (side === "buy") {
    const asset = await tradableBySymbol(wanted, deps);
    if (!asset) throw new DomainError("MINT_NOT_ALLOWED");
    return asset;
  }
  // Venta: la fila exacta con cualquier estado (sin ficha elegida ni filtro
  // de alcance: lo pedido a mano en `watch` o `hidden` se puede vender).
  const asset = await findAssetBySymbol(wanted, { scope: "all", allowHidden: true, noListing: true, ...deps });
  if (asset && asset.mint) {
    if (asset.issuer === "ondo") {
      if (ONDO_MINTS.has(asset.mint)) return { symbol: asset.symbol, mint: asset.mint };
    } else if (hasXstocksMintShape(asset.mint)) {
      return { symbol: asset.symbol, mint: asset.mint };
    }
    throw new DomainError("MINT_NOT_ALLOWED");
  }
  if (asset) throw new DomainError("MINT_NOT_ALLOWED");
  // Sin fila en el catálogo: snapshots estáticos (mismo criterio de emisor).
  const snapshot = TICKERS.find((ticker) => ticker.symbol.toLowerCase() === wanted.toLowerCase());
  if (snapshot && hasXstocksMintShape(snapshot.mint)) {
    return { symbol: snapshot.symbol, mint: snapshot.mint };
  }
  const ondo = ONDO_TICKERS.find((entry) => entry.symbol.toLowerCase() === wanted.toLowerCase());
  if (ondo && ONDO_MINTS.has(ondo.mint)) {
    return { symbol: ondo.symbol, mint: ondo.mint };
  }
  throw new DomainError("MINT_NOT_ALLOWED");
}
