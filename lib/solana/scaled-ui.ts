import { PublicKey, type Connection } from "@solana/web3.js";
import { TOKEN_2022_PROGRAM_ID, getMint, getScaledUiAmountConfig } from "@solana/spl-token";

/**
 * Multiplicador Token-2022 (Scaled UI Amount). ARQUITECTURA §6.
 * Funciones puras: importar este módulo no abre una conexión ni lee la cadena.
 * `fetchMintMultiplier` es la única que habla con el RPC, y sólo cuando se llama.
 * El helper del paquete instalado (@solana/spl-token 0.4.15) es `getScaledUiAmountConfig`.
 * No importar este módulo desde un componente cliente.
 */

/** Los tres campos que deciden el multiplicador vigente. El timestamp va en segundos unix. */
export interface ScaledMultiplierConfig {
  multiplier: number;
  newMultiplier: number;
  newMultiplierEffectiveTimestamp: number;
}

const MAX_DECIMALS = 18;

function assertMultiplier(multiplier: number): void {
  if (!Number.isFinite(multiplier) || multiplier <= 0) {
    throw new Error("multiplicador inválido");
  }
}

function assertDecimals(decimals: number): void {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > MAX_DECIMALS) {
    throw new Error("decimals fuera de rango");
  }
}

/**
 * Si `newMultiplierEffectiveTimestamp` ≤ ahora, manda `newMultiplier`.
 * Si no, manda `multiplier`. Igual que el programa Token-2022.
 */
export function getEffectiveMultiplier(config: ScaledMultiplierConfig, nowSec: number): number {
  if (!Number.isFinite(nowSec)) throw new Error("reloj inválido");
  const timestamp = config.newMultiplierEffectiveTimestamp;
  const useNew = Number.isFinite(timestamp) && timestamp <= nowSec;
  const value = useNew ? config.newMultiplier : config.multiplier;
  assertMultiplier(value);
  return value;
}

/** acciones = raw / 10^decimals × multiplicador. No mostrar el crudo. */
export function rawToShares(raw: bigint, decimals: number, multiplier: number): number {
  assertDecimals(decimals);
  assertMultiplier(multiplier);
  if (raw < BigInt(0) || raw > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("raw fuera de rango");
  }
  const scale = 10 ** decimals;
  return (Number(raw) / scale) * multiplier;
}

/** Inversa de `rawToShares`. Redondea al entero más cercano. */
export function sharesToRaw(shares: number, decimals: number, multiplier: number): bigint {
  assertDecimals(decimals);
  assertMultiplier(multiplier);
  if (!Number.isFinite(shares) || shares < 0) throw new Error("acciones fuera de rango");
  const raw = (shares / multiplier) * 10 ** decimals;
  if (!Number.isFinite(raw) || raw > Number.MAX_SAFE_INTEGER) {
    throw new Error("raw fuera de rango");
  }
  return BigInt(Math.round(raw));
}

/** precio por acción = precio por token crudo ÷ multiplicador. */
export function rawPriceToSharePrice(price: number, multiplier: number): number {
  assertMultiplier(multiplier);
  if (!Number.isFinite(price)) throw new Error("precio fuera de rango");
  return price / multiplier;
}

/**
 * Lee la extensión ScaledUiAmount del mint (Token-2022).
 * Sin extensión, el multiplicador es 1 (USDC y un mint clásico).
 * xStocks usa Token-2022: pasar `TOKEN_2022_PROGRAM_ID`.
 */
export async function fetchMintMultiplier(
  connection: Connection,
  mint: PublicKey | string,
  nowSec = Math.floor(Date.now() / 1000),
): Promise<number> {
  const address = typeof mint === "string" ? new PublicKey(mint) : mint;
  const account = await getMint(connection, address, "confirmed", TOKEN_2022_PROGRAM_ID);
  const onChain = getScaledUiAmountConfig(account);
  if (!onChain) return 1;
  return getEffectiveMultiplier(
    {
      multiplier: onChain.multiplier,
      newMultiplier: onChain.newMultiplier,
      newMultiplierEffectiveTimestamp: Number(onChain.newMultiplierEffectiveTimestamp),
    },
    nowSec,
  );
}
