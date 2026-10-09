import { PublicKey, type Connection } from "@solana/web3.js";

/**
 * Multiplicador Token-2022 (Scaled UI Amount). ARQUITECTURA §6.
 * Funciones puras: importar este módulo no abre una conexión ni lee la cadena.
 * `fetchMintMultiplier` es la única que habla con el RPC, y sólo cuando se llama.
 *
 * OJO con la lectura on-chain: `getScaledUiAmountConfig` de @solana/spl-token
 * revienta contra el RPC con "Do not know how to serialize a BigInt" (web3.js
 * 1.99 / bigint-buffer). Por eso leemos la extensión por `getParsedAccountInfo`,
 * que devuelve los campos como strings, y la interpretamos con
 * `parseScaledUiAmountConfig`. No importar este módulo desde un componente cliente.
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

/** Forma cruda de la extensión `scaledUiAmountConfig` tal como la trae el RPC. */
export interface ScaledUiAmountConfigLike {
  multiplier?: string | number;
  newMultiplier?: string | number;
  newMultiplierEffectiveTimestamp?: string | number;
}

function toFinite(value: string | number | undefined): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

/**
 * Interpreta la extensión `scaledUiAmountConfig` (strings del RPC) con el mismo
 * criterio del programa Token-2022: si `newMultiplierEffectiveTimestamp` ≤ ahora,
 * manda `newMultiplier`; si no, `multiplier`. Pura. Fallback seguro a 1 ante
 * datos vacíos, inválidos o un multiplicador no positivo.
 */
export function parseScaledUiAmountConfig(
  state: ScaledUiAmountConfigLike | null | undefined,
  nowSec: number,
): number {
  if (!state) return 1;
  const multiplier = toFinite(state.multiplier) ?? 1;
  const newMultiplier = toFinite(state.newMultiplier) ?? multiplier;
  const timestamp = toFinite(state.newMultiplierEffectiveTimestamp);
  const useNew = timestamp !== null && Number.isFinite(timestamp) && timestamp <= nowSec;
  const value = useNew ? newMultiplier : multiplier;
  return Number.isFinite(value) && value > 0 ? value : 1;
}

/** Forma de la cuenta parseada de un mint Token-2022 (subconjunto que usamos). */
interface ParsedMintInfo {
  info?: {
    extensions?: Array<{ extension?: string; state?: ScaledUiAmountConfigLike }>;
  };
}

/**
 * Lee la extensión ScaledUiAmount del mint (Token-2022) por `getParsedAccountInfo`.
 * Sin extensión, o si la lectura falla, el multiplicador es 1 (USDC y un mint
 * clásico). xStocks usa Token-2022: pasar `TOKEN_2022_PROGRAM_ID` no hace falta
 * aquí porque `getParsedAccountInfo` resuelve el owner del RPC.
 */
export async function fetchMintMultiplier(
  connection: Connection,
  mint: PublicKey | string,
  nowSec = Math.floor(Date.now() / 1000),
): Promise<number> {
  const address = typeof mint === "string" ? new PublicKey(mint) : mint;
  const parsed = await connection.getParsedAccountInfo(address, "confirmed");
  const data = parsed.value?.data;
  // Datos parseados llegan como { program, parsed: { info: { extensions } } }.
  // Si vienen como Buffer o string (cuenta no parseable), fallback a 1.
  if (!data || typeof data !== "object" || Buffer.isBuffer(data)) return 1;
  const parsedData = (data as { parsed?: ParsedMintInfo }).parsed;
  const extensions = parsedData?.info?.extensions ?? [];
  const scaled = extensions.find((ext) => ext.extension === "scaledUiAmountConfig");
  if (!scaled) return 1;
  return parseScaledUiAmountConfig(scaled.state, nowSec);
}
