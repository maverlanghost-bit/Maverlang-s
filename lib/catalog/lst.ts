/**
 * Catálogo de Ganar (CRIPTO_F1, K2): 6 LST de Solana + USDY como opción de
 * dólares. Fuente: tablas §1.8 y §1.10 del encargo.
 *
 * - Comprar "staking" acá es un swap a un token de staking (o a USDY) por
 *   Jupiter, asentado en la demo. No es un depósito custodiado.
 * - `apySource` solo documenta de dónde se lee el APY; el valor NUNCA se
 *   hardcodea. JupSOL, INF y dSOL quedan "sin dato" mientras no haya fuente
 *   oficial sin clave (`"none"`).
 * - USDY repite el mint VERDE de `lib/catalog/crypto.ts`, pero en Ganar se
 *   ofrece como opción de dólares, con aviso para personas de EE.UU.
 * - El mint de dSOL es el oficial `Dso1bDe…gnPQ` (no el que termina en `7DkC`).
 * - Módulo puro: sin I/O, sin `server-only`, sin env.
 */
export interface LstAsset {
  /** Símbolo canónico (JitoSOL, mSOL, dSOL, USDY…). */
  symbol: string;
  name: string;
  /** Mint exacto en Solana (base58, distingue mayúsculas y minúsculas). */
  mint: string;
  decimals: number;
  /** Emisor o protocolo de staking (Jito, Marinade, Drift…). */
  issuerName: string;
  /** Unidad del rendimiento: SOL para LST, USD para USDY. */
  yieldUnit: "SOL" | "USD";
  /** Fuente oficial del APY; `"none"` = se muestra "sin dato". */
  apySource: "jito" | "marinade7d" | "blaze" | "none";
  /** true si el producto no está disponible para personas de EE.UU. */
  usPersonBlocked?: boolean;
}

/**
 * Los 6 LST de §1.10. `decimals` siempre 9 y `yieldUnit` "SOL": el
 * rendimiento está en SOL, no en dólares.
 */
export const LST_ASSETS: LstAsset[] = [
  {
    symbol: "JitoSOL",
    name: "Jito Staked SOL",
    mint: "J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn",
    decimals: 9,
    issuerName: "Jito",
    yieldUnit: "SOL",
    apySource: "jito",
  },
  {
    symbol: "JupSOL",
    name: "Jupiter Staked SOL",
    mint: "jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v",
    decimals: 9,
    issuerName: "Jupiter",
    yieldUnit: "SOL",
    apySource: "none",
  },
  {
    symbol: "mSOL",
    name: "Marinade mSOL",
    mint: "mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So",
    decimals: 9,
    issuerName: "Marinade",
    yieldUnit: "SOL",
    apySource: "marinade7d",
  },
  {
    symbol: "INF",
    name: "Sanctum Infinity",
    mint: "5oVNBeEEQvYi1cX3ir8Dx5n1P7pdxydbGF2X4TxVusJm",
    decimals: 9,
    issuerName: "Sanctum",
    yieldUnit: "SOL",
    apySource: "none",
  },
  {
    symbol: "dSOL",
    name: "Drift Staked SOL",
    mint: "Dso1bDeDjCQxTrWHqUUi63oBvV7Mdm6WaobLbQ7gnPQ",
    decimals: 9,
    issuerName: "Drift",
    yieldUnit: "SOL",
    apySource: "none",
  },
  {
    symbol: "bSOL",
    name: "BlazeStake SOL",
    mint: "bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1",
    decimals: 9,
    issuerName: "Blaze",
    yieldUnit: "SOL",
    apySource: "blaze",
  },
];

/**
 * USDY en Ganar: opción de dólares (bono tokenizado de Ondo), mismo mint que
 * el catálogo Cripto. No disponible para personas de EE.UU. y sin APY
 * hardcodeado: la UI muestra "sin dato" salvo que haya fuente oficial.
 */
export const USDY_EARN_ASSET: LstAsset = {
  symbol: "USDY",
  name: "Ondo USD Yield",
  mint: "A1KLoBrKBde8Ty9qtNQUtq3C2ortoC3u7twggz7sEto6",
  decimals: 6,
  issuerName: "Ondo",
  yieldUnit: "USD",
  apySource: "none",
  usPersonBlocked: true,
};

/** Todo lo que se puede comprar en Ganar, en orden de pantalla. */
export const EARN_ASSETS: LstAsset[] = [...LST_ASSETS, USDY_EARN_ASSET];

/**
 * Mapas de Ganar. Incluyen USDY para que la sección resuelva la opción de
 * dólares con una sola búsqueda; `isLstSymbol` / `isLstMint` distinguen el LST
 * puro y `isEarnSymbol` cubre ambos.
 */
export const lstBySymbol: Map<string, LstAsset> = new Map<string, LstAsset>(
  EARN_ASSETS.map((asset): [string, LstAsset] => [asset.symbol, asset]),
);

export const lstByMint: Map<string, LstAsset> = new Map<string, LstAsset>(
  EARN_ASSETS.map((asset): [string, LstAsset] => [asset.mint, asset]),
);

/** Búsqueda por símbolo sin distinguir mayúsculas (JitoSOL, jitosol, dSOL…). */
const byLowerSymbol = new Map<string, LstAsset>(
  EARN_ASSETS.map((asset): [string, LstAsset] => [asset.symbol.toLowerCase(), asset]),
);

const LST_SYMBOLS = new Set(LST_ASSETS.map((asset) => asset.symbol));

/** Activo de Ganar por símbolo, tolerante a mayúsculas/minúsculas. */
export function findEarnBySymbol(symbol: string): LstAsset | null {
  return byLowerSymbol.get(symbol.trim().toLowerCase()) ?? null;
}

/** true solo para los 6 LST (USDY no es un LST). */
export function isLstSymbol(symbol: string): boolean {
  const asset = findEarnBySymbol(symbol);
  return asset !== null && LST_SYMBOLS.has(asset.symbol);
}

/** El mint se compara exacto: base58 distingue mayúsculas y minúsculas. */
export function isLstMint(mint: string): boolean {
  const asset = lstByMint.get(mint.trim());
  return asset !== undefined && LST_SYMBOLS.has(asset.symbol);
}

/** true para un LST o para USDY: lo que se compra/vende desde Ganar. */
export function isEarnSymbol(symbol: string): boolean {
  return findEarnBySymbol(symbol) !== null;
}
