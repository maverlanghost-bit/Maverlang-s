/**
 * Catálogo curado de criptos de Maverlang (CRIPTO_F1, K1).
 * Fuente: tabla §1.9 del encargo (medición con Jupiter Price v3, 10 nov 2026).
 *
 * - 11 sellos VERDE (tope US$ 1.000 = `MAX_ORDER_USD`) y 18 AMARILLO con su
 *   tope por token más estricto (BNB queda en 1.000 porque así lo fija la tabla).
 * - El mint es el de Solana y distingue mayúsculas y minúsculas: se copia
 *   carácter por carácter, nunca se normaliza.
 * - BTC se ofrece solo como cbBTC de Coinbase; WBTC y los tokens ROJO del CSV
 *   no existen en este catálogo.
 * - NEAR no tenía precio la noche de la medición: `decimals: null` hasta
 *   confirmarlo con metadata/swap; mientras tanto no se cotiza.
 * - Módulo puro: sin I/O, sin `server-only`, sin env. Se importa también
 *   desde componentes cliente.
 */
import { MAX_ORDER_USD } from "@/config/trade";
import type { CryptoAsset, CryptoGroup } from "@/lib/catalog/crypto-types";

export type { CryptoAsset, CryptoGroup, CryptoSeal } from "@/lib/catalog/crypto-types";

export const CRYPTO_ASSETS: CryptoAsset[] = [
  // ── Sello VERDE · tope US$ 1.000 (MAX_ORDER_USD) ─────────────────────────
  {
    symbol: "BTC",
    name: "Bitcoin",
    mint: "cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij",
    decimals: 8,
    seal: "VERDE",
    group: "crypto",
    originLabel: "cbBTC (Coinbase)",
    maxOrderUsd: MAX_ORDER_USD,
  },
  {
    symbol: "SOL",
    name: "Solana",
    mint: "So11111111111111111111111111111111111111112",
    decimals: 9,
    seal: "VERDE",
    group: "crypto",
    originLabel: "SOL nativo",
    maxOrderUsd: MAX_ORDER_USD,
  },
  {
    symbol: "XRP",
    name: "XRP",
    mint: "6UpQcMAb5xMzxc7ZfPaVMgx3KqsvKZdT5U718BzD5We2",
    decimals: 6,
    seal: "VERDE",
    group: "crypto",
    originLabel: "wXRP (Hex Trust)",
    maxOrderUsd: MAX_ORDER_USD,
  },
  {
    symbol: "USDT",
    name: "Tether",
    mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
    decimals: 6,
    seal: "VERDE",
    group: "dollar",
    originLabel: "USDT nativo (Tether)",
    maxOrderUsd: MAX_ORDER_USD,
  },
  {
    symbol: "USDS",
    name: "USDS",
    mint: "USDSwr9ApdHk5bvJKMjzff41FfuX8bSxdKcR81vTwcA",
    decimals: 6,
    seal: "VERDE",
    group: "dollar",
    originLabel: "USDS (Sky)",
    maxOrderUsd: MAX_ORDER_USD,
  },
  {
    symbol: "USDe",
    name: "Ethena USDe",
    mint: "DEkqHyPN7GMRJ5cArtQFAWefqbZb33Hyf6s5iCwjEonT",
    decimals: 9,
    seal: "VERDE",
    group: "dollar",
    originLabel: "USDe (Ethena)",
    maxOrderUsd: MAX_ORDER_USD,
  },
  {
    symbol: "USD1",
    name: "USD1",
    mint: "USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB",
    decimals: 6,
    seal: "VERDE",
    group: "dollar",
    originLabel: "USD1 (World Liberty)",
    maxOrderUsd: MAX_ORDER_USD,
  },
  {
    symbol: "PYUSD",
    name: "PayPal USD",
    mint: "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo",
    decimals: 6,
    seal: "VERDE",
    group: "dollar",
    originLabel: "PYUSD nativo (Paxos)",
    maxOrderUsd: MAX_ORDER_USD,
  },
  {
    symbol: "USDG",
    name: "Global Dollar",
    mint: "2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH",
    decimals: 6,
    seal: "VERDE",
    group: "dollar",
    originLabel: "USDG nativo (Paxos)",
    maxOrderUsd: MAX_ORDER_USD,
  },
  {
    symbol: "XAUt0",
    name: "Tether Gold",
    mint: "AymATz4TCL9sWNEEV9Kvyz45CHVhDZ6kUgjTJPzLpU9P",
    decimals: 6,
    seal: "VERDE",
    group: "gold",
    originLabel: "XAUt0 (Tether, LayerZero)",
    maxOrderUsd: MAX_ORDER_USD,
  },
  {
    symbol: "USDY",
    name: "Ondo USD Yield",
    mint: "A1KLoBrKBde8Ty9qtNQUtq3C2ortoC3u7twggz7sEto6",
    decimals: 6,
    seal: "VERDE",
    group: "dollar",
    originLabel: "USDY (Ondo)",
    maxOrderUsd: MAX_ORDER_USD,
  },

  // ── Sello AMARILLO · tope por token de la tabla §1.9 ─────────────────────
  {
    symbol: "ETH",
    name: "Ethereum",
    mint: "7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs",
    decimals: 8,
    seal: "AMARILLO",
    group: "crypto",
    originLabel: "WETH Portal (Wormhole)",
    maxOrderUsd: 500,
  },
  {
    symbol: "BNB",
    name: "BNB",
    mint: "9gP2kCy3wA1ctvYWQk75guqXuHfrEomqydHLtcTCqiLa",
    decimals: 8,
    seal: "AMARILLO",
    group: "crypto",
    originLabel: "BNB Portal (Wormhole)",
    maxOrderUsd: 1000,
  },
  {
    symbol: "TRX",
    name: "TRON",
    mint: "GbbesPbaYh5uiAZSYNXTc7w9jty1rpg3P9L4JeN4LkKc",
    decimals: 6,
    seal: "AMARILLO",
    group: "crypto",
    originLabel: "TRX en Solana (emisor no confirmado de forma independiente)",
    maxOrderUsd: 500,
  },
  {
    symbol: "ZEC",
    name: "Zcash",
    mint: "A7bdiYdS5GjqGFtxf17ppRHtDKPkkRqbKtR27dxvQXaS",
    decimals: 8,
    seal: "AMARILLO",
    group: "crypto",
    originLabel: "ZEC (NEAR OmniBridge)",
    maxOrderUsd: 500,
  },
  {
    symbol: "HYPE",
    name: "Hyperliquid",
    mint: "98sMhvDwXj1RQi5c5Mndm3vPe9cBqPrbLaufMXFNMh5g",
    decimals: 9,
    seal: "AMARILLO",
    group: "crypto",
    originLabel: "HYPE (Sunrise/Wormhole NTT)",
    maxOrderUsd: 500,
  },
  {
    symbol: "DOGE",
    name: "Dogecoin",
    mint: "DoGEV7LASBkQbibMc5k5vKnTZoMg423GpJ5QtJEGfm7R",
    decimals: 8,
    seal: "AMARILLO",
    group: "crypto",
    originLabel: "DOGE (Sunrise/Wormhole)",
    maxOrderUsd: 500,
  },
  {
    symbol: "LINK",
    name: "Chainlink",
    mint: "LinkhB3afbBKb2EQQu7s7umdZceV3wcvAUJhQAfQ23L",
    decimals: 9,
    seal: "AMARILLO",
    group: "crypto",
    originLabel: "LINK (listado en CoinGecko; CCIP)",
    maxOrderUsd: 100,
  },
  {
    symbol: "NEAR",
    name: "NEAR Protocol",
    mint: "3ZLekZYq2qkZiSpnSvabjit34tUkjSwD5JFuW9as9wBG",
    decimals: null,
    seal: "AMARILLO",
    group: "crypto",
    originLabel: "wNEAR (emisor/puente no confirmado)",
    maxOrderUsd: 500,
  },
  {
    symbol: "UNI",
    name: "Uniswap",
    mint: "uniHfuPhEQSrtpzXpJZDCSq53yaejKKpNhFUiKoHKHV",
    decimals: 8,
    seal: "AMARILLO",
    group: "crypto",
    originLabel: "UNI (Sunrise/Wormhole NTT)",
    maxOrderUsd: 100,
  },
  {
    symbol: "LTC",
    name: "Litecoin",
    mint: "cbLTC4T5NpzSUtQ7ekgEMZGaUPVJY1ko6BUikqa4gGf",
    decimals: 8,
    seal: "AMARILLO",
    group: "crypto",
    originLabel: "cbLTC (Coinbase)",
    maxOrderUsd: 500,
  },
  {
    symbol: "AVAX",
    name: "Avalanche",
    mint: "avaxGHCq3T7hoxd73oY2KY9hJSTaeMibXvHy5KNzh5D",
    decimals: 9,
    seal: "AMARILLO",
    group: "crypto",
    originLabel: "AVAX (Sunrise/Wormhole NTT)",
    maxOrderUsd: 100,
  },
  {
    symbol: "SUI",
    name: "Sui",
    mint: "suifhC9gU1VbJAPYPTBkHJyyyStKGLLYPVDTmPoqbvA",
    decimals: 8,
    seal: "AMARILLO",
    group: "crypto",
    originLabel: "SUI (Sunrise/Wormhole NTT)",
    maxOrderUsd: 500,
  },
  {
    symbol: "TAO",
    name: "Bittensor",
    mint: "taoC6xyv2v8tDLcev4uaGUgV4vdQsWJrGft2kcBRrBY",
    decimals: 9,
    seal: "AMARILLO",
    group: "crypto",
    originLabel: "TAO (Sunrise/LayerZero)",
    maxOrderUsd: 500,
  },
  {
    symbol: "PEPE",
    name: "Pepe",
    mint: "PEPEqnuuCDbBC89p1u9vpnP1KQ2oj1xTcQBsjt9X55m",
    decimals: 4,
    seal: "AMARILLO",
    group: "crypto",
    originLabel: "PEPE (Sunrise)",
    maxOrderUsd: 500,
  },
  {
    symbol: "ENA",
    name: "Ethena",
    mint: "72QvBVwpxqmheEPfaCwWSWqEFsUy3rhWt6JhQBMNTwD1",
    decimals: 9,
    seal: "AMARILLO",
    group: "crypto",
    originLabel: "ENA (Ethena vía LayerZero/Sunrise)",
    maxOrderUsd: 100,
  },
  {
    symbol: "AAVE",
    name: "Aave",
    mint: "AavE1kKKnesPw4MuRJmJ9jZs9QzEE8CPxQ3ViczUDfc1",
    decimals: 8,
    seal: "AMARILLO",
    group: "crypto",
    originLabel: "AAVE (Sunrise/Wormhole NTT)",
    maxOrderUsd: 100,
  },
  {
    symbol: "PAXG",
    name: "PAX Gold",
    mint: "5GgRAEmv8ZxF2PR5hY72Qs5x1bnQ6UK2RbTPoqJ3wSwW",
    decimals: 6,
    seal: "AMARILLO",
    group: "gold",
    originLabel: "PAXG (emisor no confirmado)",
    maxOrderUsd: 500,
  },
  {
    symbol: "ONDO",
    name: "Ondo",
    mint: "ondohH8Vssxiqcy5u6Efi4AYN17KZrzQtv2a91dnrgW",
    decimals: 8,
    seal: "AMARILLO",
    group: "crypto",
    originLabel: "ONDO (emisor no confirmado)",
    maxOrderUsd: 500,
  },
];

/** Búsqueda por símbolo sin distinguir mayúsculas (BTC, usde, xaut0…). */
const byLowerSymbol = new Map<string, CryptoAsset>(
  CRYPTO_ASSETS.map((asset): [string, CryptoAsset] => [asset.symbol.toLowerCase(), asset]),
);

export const cryptoBySymbol: Map<string, CryptoAsset> = new Map<string, CryptoAsset>(
  CRYPTO_ASSETS.map((asset): [string, CryptoAsset] => [asset.symbol, asset]),
);

export const cryptoByMint: Map<string, CryptoAsset> = new Map<string, CryptoAsset>(
  CRYPTO_ASSETS.map((asset): [string, CryptoAsset] => [asset.mint, asset]),
);

/** Activo por símbolo, tolerante a mayúsculas/minúsculas; `null` si no existe. */
export function findCryptoBySymbol(symbol: string): CryptoAsset | null {
  return byLowerSymbol.get(symbol.trim().toLowerCase()) ?? null;
}

export function isCryptoSymbol(symbol: string): boolean {
  return findCryptoBySymbol(symbol) !== null;
}

/** El mint se compara exacto: base58 distingue mayúsculas y minúsculas. */
export function isCryptoMint(mint: string): boolean {
  return cryptoByMint.has(mint.trim());
}

/** Tope por orden en USD de ese símbolo, o `null` si no está en el catálogo. */
export function maxOrderUsdFor(symbol: string): number | null {
  return findCryptoBySymbol(symbol)?.maxOrderUsd ?? null;
}

/** Grupo de la lista (cripto, dólares u oro), o `null` si no está en el catálogo. */
export function cryptoGroupOf(symbol: string): CryptoGroup | null {
  return findCryptoBySymbol(symbol)?.group ?? null;
}
