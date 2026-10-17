import "server-only";

/**
 * M79: validación y preparación de retiros cripto.
 *
 * `validateAndPrepareWithdrawal` es la única puerta de los retiros:
 * revisa TODO antes de armar la transacción. Falla cerrado: sin dinero
 * real (`REAL_TRADING_READY=false`), nada pasa. Los códigos de rechazo
 * reutilizan los existentes de `lib/api/result.ts` (mismos mensajes y
 * estados HTTP que ya conoce el cliente), con `SELF_TRANSFER_NOT_ALLOWED`
 * como único código nuevo de dominio.
 */

import { TICKERS, USDC_MINT } from "@/config/tickers";
import { serverEnv } from "@/lib/env";
import { isValidSolanaAddress } from "@/lib/solana/address";

/** Código nuevo de dominio (M79): retiro hacia la propia cuenta. */
export const SELF_TRANSFER_NOT_ALLOWED: WithdrawalErrorCode = "SELF_TRANSFER_NOT_ALLOWED";

export type WithdrawalErrorCode =
  | "REAL_DISABLED"
  | "VALIDATION"
  | "SELF_TRANSFER_NOT_ALLOWED"
  | "ASSET_NOT_ALLOWED"
  | "INSUFFICIENT_FUNDS";

export type PrepareWithdrawalResult =
  | { ok: true; preparation: WithdrawalPreparation }
  | { ok: false; code: WithdrawalErrorCode; status: number; message: string };

/** Estado HTTP del resultado de preparar un retiro. */
export const WITHDRAWAL_ERROR_STATUS: Record<WithdrawalErrorCode, number> = {
  REAL_DISABLED: 503,
  VALIDATION: 400,
  SELF_TRANSFER_NOT_ALLOWED: 400,
  ASSET_NOT_ALLOWED: 400,
  INSUFFICIENT_FUNDS: 400,
};

/** Mint permitido para retiro: USDC o un activo habilitado del catálogo. */
export function isWithdrawableMint(mint: string): boolean {
  return mint === USDC_MINT || TICKERS.some((t) => t.enabled && t.mint === mint);
}

export interface WithdrawalPreparation {
  destinationAddress: string;
  sourceAddress: string;
  mint: string;
  amountUi: number;
  /** Fee de red (SOL). No es comisión de la plataforma (ARQUITECTURA §6). */
  networkFeeSol: number;
  /** Rent si el destino no tiene cuenta del token. 0 si ya la tiene. */
  tokenAccountRentSol: number;
  reference: string;
}

export interface PrepareWithdrawalParams {
  destinationAddress: string;
  sourceAddress: string;
  /** Mint del activo a retirar: USDC o un mint del catálogo (`TICKERS`). */
  mint: string;
  amountUi: number;
  /** Saldo disponible del activo en la cuenta del usuario (UI). */
  availableBalanceUi: number;
  /** Override opcional para tests; por defecto lee `REAL_TRADING_READY`. */
  realTradingEnabled?: boolean;
}

function isRealTradingEnabled(override?: boolean): boolean {
  if (typeof override === "boolean") return override;
  const raw = (process.env.REAL_TRADING_READY ?? "").trim().toLowerCase();
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  return Boolean(serverEnv.REAL_TRADING_READY);
}

/**
 * Validación + preparación pura de un retiro (sin red ni base): el motor
 * que envía la transacción consume el `WithdrawalPreparation` resultante.
 * Devuelve `ok: false` con `code`/`status` para que la ruta mapee a HTTP
 * sin repetir lógica.
 */
export function validateAndPrepareWithdrawal(params: PrepareWithdrawalParams): PrepareWithdrawalResult {
  // 1. Dinero real apagado → nada pasa (M46/M74). REAL_DISABLED es 503.
  if (!isRealTradingEnabled(params.realTradingEnabled)) {
    return { ok: false, code: "REAL_DISABLED", status: 503, message: "El dinero real todavía no está disponible." };
  }
  const destination = params.destinationAddress?.trim() ?? "";
  const source = params.sourceAddress?.trim() ?? "";
  // 2. Direcciones válidas en Solana (base58, 32 bytes).
  if (!isValidSolanaAddress(destination)) {
    return { ok: false, code: "VALIDATION", status: 400, message: "La dirección de destino no es válida." };
  }
  if (!isValidSolanaAddress(source)) {
    return { ok: false, code: "VALIDATION", status: 400, message: "La billetera de origen no es válida." };
  }
  // 3. Prohibido auto-enviarse: el retiro sale de la app, no da vueltas.
  if (destination === source) {
    return { ok: false, code: SELF_TRANSFER_NOT_ALLOWED, status: 400, message: "No puedes enviarte a ti mismo." };
  }
  // 4. Activo permitido: USDC o mint activo del catálogo.
  const mint = params.mint?.trim() ?? "";
  if (!isWithdrawableMint(mint)) {
    return { ok: false, code: "ASSET_NOT_ALLOWED", status: 400, message: "Ese activo no está permitido." };
  }
  // 5. Monto: positivo, finito y dentro del saldo disponible.
  const amount = params.amountUi;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    return { ok: false, code: "VALIDATION", status: 400, message: "Ingresa un monto válido." };
  }
  if (amount > params.availableBalanceUi + 1e-12) {
    return { ok: false, code: "INSUFFICIENT_FUNDS", status: 400, message: "No tienes saldo suficiente." };
  }
  return {
    ok: true,
    preparation: {
      destinationAddress: destination,
      sourceAddress: source,
      mint,
      amountUi: amount,
      networkFeeSol: 0.000005,
      tokenAccountRentSol: 0.0016,
      reference: `withdraw:${mint}:${amount}:${Date.now()}`,
    },
  };
}

