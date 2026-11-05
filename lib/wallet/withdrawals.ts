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
 *
 * Auditoría D-01: esta función NO es la compuerta de seguridad. La ruta de
 * retiro que se construya (D-02) tiene que llamar `assertRealExecutionLocked()`
 * y `assertRealWithdrawalsEnabled()` ANTES de llegar acá, igual que
 * `app/api/wallet/send/build/route.ts`. Acá sólo viven la validación y el
 * tope por operación (`assertSendWithinOperationLimit`).
 */

import { randomUUID } from "node:crypto";

import { TICKERS, USDC_MINT } from "@/config/tickers";
import { DomainError } from "@/lib/api/result";
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
  /**
   * Billetera verificada de la sesión. Si se informa, la billetera de origen
   * tiene que ser exactamente ésta (base58 distingue mayúsculas). Una cuenta
   * sin billetera verificada no puede retirar.
   */
  sessionWalletAddress?: string | null;
  /** Override opcional para tests; por defecto lee `REAL_TRADING_READY`. */
  realTradingEnabled?: boolean;
  /**
   * Clave de idempotencia del cliente (T41). Si viene, la `reference` se
   * deriva de forma determinista (`withdraw:<origen>:<mint>:<clave>`): un
   * reintento del mismo retiro produce la MISMA referencia, y
   * `wallet_movements.reference` es UNIQUE, así que el libro no puede
   * descontar dos veces. Sin clave se conserva el UUID por llamada para que
   * dos retiros iguales no colisionen.
   */
  requestId?: string;
}

/** Mismo alfabeto que los `requestId` que ya usa el cliente. */
const IDEMPOTENCY_KEY = /^[A-Za-z0-9._:-]{8,128}$/;

/** `true` si el texto puede usarse como clave de idempotencia. */
export function isIdempotencyKey(value: string): boolean {
  return IDEMPOTENCY_KEY.test(value);
}

function isRealTradingEnabled(override?: boolean): boolean {
  if (typeof override === "boolean") return override;
  const raw = (process.env.REAL_TRADING_READY ?? "").trim().toLowerCase();
  if (raw === "true" || raw === "1") return true;
  if (raw === "false" || raw === "0") return false;
  return Boolean(serverEnv.REAL_TRADING_READY);
}

/**
 * Tope de salida por operación (auditoría D-01), en dólares.
 *
 * El único camino de salida implementado (`POST /api/wallet/send/build`)
 * armaba transferencias sin ningún tope. Un tope diario/mensual necesita el
 * libro de retiros que todavía no existe (D-02): sumarlo sobre `orders` sería
 * contar operaciones de trading, no salidas. Por eso el control que se puede
 * sostener hoy es el tope por operación, y el monto se valora contra el precio
 * vivo (USDC = 1:1); sin precio no hay notional y la salida se rechaza.
 *
 * `WITHDRAWALS_MAX_USD_PER_OPERATION` puede BAJAR el tope, nunca subirlo.
 */
export const WITHDRAWAL_MAX_USD_PER_OPERATION = 500;

/** Tope vigente por operación. `env` sólo puede reducirlo. */
export function withdrawalMaxUsdPerOperation(): number {
  const raw = (process.env.WITHDRAWALS_MAX_USD_PER_OPERATION ?? "").trim();
  const parsed = Number(raw);
  if (!raw || !Number.isFinite(parsed) || parsed <= 0) return WITHDRAWAL_MAX_USD_PER_OPERATION;
  return Math.min(parsed, WITHDRAWAL_MAX_USD_PER_OPERATION);
}

/**
 * Notional en dólares de una salida. USDC es 1:1; una acción se valora con su
 * precio vivo. Sin precio válido devuelve `null` (no se asume 0: eso saltaría
 * el tope).
 */
export function sendNotionalUsd(input: {
  mint: string;
  amountUi: number;
  priceUsd?: number | null;
}): number | null {
  const amount = input.amountUi;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) return null;
  if (input.mint === USDC_MINT) return amount;
  const price = input.priceUsd;
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) return null;
  return amount * price;
}

/**
 * Rechaza una salida que supere el tope por operación. `null` = no se pudo
 * valorar: también se rechaza (fail closed).
 */
export function assertSendWithinOperationLimit(notionalUsd: number | null): void {
  const cap = withdrawalMaxUsdPerOperation();
  if (notionalUsd === null) {
    throw new DomainError(
      "UPSTREAM",
      "No pudimos valorar la salida. No se armó ninguna transacción.",
    );
  }
  if (!Number.isFinite(notionalUsd) || notionalUsd <= 0) {
    throw new DomainError("VALIDATION", "El monto de la salida no es válido.");
  }
  if (notionalUsd > cap) {
    throw new DomainError(
      "LIMIT_ORDER",
      `El tope por salida es US$${Number(cap.toFixed(2))}. Divide el envío en partes.`,
    );
  }
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
  // 1b. Clave de idempotencia (T41): si viene malformada se rechaza en vez de
  //     ignorarla en silencio (el cliente creería que su reintento deduplica).
  const requestId = (params.requestId ?? "").trim();
  if (requestId !== "" && !isIdempotencyKey(requestId)) {
    return {
      ok: false,
      code: "VALIDATION",
      status: 400,
      message: "La clave de idempotencia no es válida.",
    };
  }
  // 2. Direcciones válidas en Solana (base58, 32 bytes).
  if (!isValidSolanaAddress(destination)) {
    return { ok: false, code: "VALIDATION", status: 400, message: "La dirección de destino no es válida." };
  }
  if (!isValidSolanaAddress(source)) {
    return { ok: false, code: "VALIDATION", status: 400, message: "La billetera de origen no es válida." };
  }
  // 2b. Si el llamador tiene la billetera verificada de la sesión, el origen
  //     tiene que ser exactamente ésa. Sin billetera verificada no se retira.
  if (params.sessionWalletAddress !== undefined) {
    const verified = params.sessionWalletAddress?.trim() ?? "";
    if (verified === "") {
      return {
        ok: false,
        code: "VALIDATION",
        status: 400,
        message: "Tu cuenta no tiene una billetera Solana verificada. Vincúlala antes de retirar.",
      };
    }
    if (source !== verified) {
      return {
        ok: false,
        code: "VALIDATION",
        status: 400,
        message: "La billetera de origen no coincide con la verificada en tu cuenta.",
      };
    }
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
  // 5. Monto: positivo, finito y dentro del saldo disponible. Un saldo
  //    ilegible (NaN/Infinity/negativo) no se interpreta como "sin tope":
  //    se rechaza cerrado.
  const available = params.availableBalanceUi;
  if (typeof available !== "number" || !Number.isFinite(available) || available < 0) {
    return { ok: false, code: "VALIDATION", status: 400, message: "No pudimos leer tu saldo disponible." };
  }
  const amount = params.amountUi;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    return { ok: false, code: "VALIDATION", status: 400, message: "Ingresa un monto válido." };
  }
  if (amount > available + 1e-12) {
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
      // T41: con clave de idempotencia la referencia es determinista, así que
      // un reintento del mismo retiro choca con la UNIQUE de
      // `wallet_movements.reference` en vez de abrir una segunda salida en el
      // libro. Sin clave: identificador único por llamada, para que dos
      // retiros iguales en el mismo milisegundo no colisionen.
      reference: requestId
        ? `withdraw:${source}:${mint}:${requestId}`
        : `withdraw:${mint}:${amount}:${randomUUID()}`,
    },
  };
}

