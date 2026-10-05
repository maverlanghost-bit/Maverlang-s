import { PublicKey, type TransactionInstruction } from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";

import { USDC_MINT } from "@/config/tickers";

/**
 * Comisión propia en USDC (ARQUITECTURA §6). USDC es el token clásico, 6 decimales,
 * mint `USDC_MINT`. No es Token-2022.
 * Puras: no leen el env ni la cadena. Armarlas en el servidor, dentro de la tx de Jupiter.
 * No importar este módulo desde un componente cliente.
 */

const BPS_MAX = 10_000;

export interface FeeTransferInput {
  /** Dueño de la cuenta USDC que paga. No es el ATA: se deriva aquí. */
  from: PublicKey | string;
  /** Dueño que recibe la comisión (`FEE_WALLET`). Puede ser una PDA. */
  feeWallet: PublicKey | string;
  /** Monto crudo de USDC (6 decimales). */
  amount: bigint;
  /** Quien paga la renta del ATA. Por defecto, `from`. */
  payer?: PublicKey | string;
}

function asPublicKey(value: PublicKey | string): PublicKey {
  if (value instanceof PublicKey) return value;
  return new PublicKey(value);
}

/**
 * Comisión = monto × bps / 10_000, truncada. `bps === 0` → null (no se agrega instrucción).
 * Si el monto es chico, puede devolver 0n: el llamador no arma una transferencia de cero.
 */
export function computeFee(amountUsdcRaw: bigint, bps: number): bigint | null {
  if (amountUsdcRaw < BigInt(0)) throw new Error("monto negativo");
  if (!Number.isInteger(bps) || bps < 0 || bps > BPS_MAX) {
    throw new Error("bps fuera de rango");
  }
  if (bps === 0) return null;
  return (amountUsdcRaw * BigInt(bps)) / BigInt(BPS_MAX);
}

/**
 * ATA idempotente del cobrador y transferencia USDC desde el ATA de `from`.
 * La creación no falla si el ATA ya existe. El ATA de origen tiene que existir:
 * quien paga ya tiene USDC.
 */
export function buildFeeTransferIx(input: FeeTransferInput): TransactionInstruction[] {
  if (input.amount <= BigInt(0)) throw new Error("la comisión tiene que ser mayor que cero");
  const from = asPublicKey(input.from);
  const feeWallet = asPublicKey(input.feeWallet);
  const payer = input.payer ? asPublicKey(input.payer) : from;
  const mint = new PublicKey(USDC_MINT);
  const source = getAssociatedTokenAddressSync(mint, from, false);
  const destination = getAssociatedTokenAddressSync(mint, feeWallet, true);
  return [
    createAssociatedTokenAccountIdempotentInstruction(payer, destination, feeWallet, mint),
    createTransferInstruction(source, destination, from, input.amount),
  ];
}
