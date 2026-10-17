/**
 * M73: traducción de errores de Solana/Jupiter a mensajes humanos en
 * español de Chile, con código de dominio, categoría y si vale la pena
 * reintentar. PURO: sin red, sin env, sin `server-only`; lo consumen la
 * conciliación (M72), la API de trading y la UI.
 *
 * Seguridad: `userMessage` SIEMPRE es uno de los textos fijos de este
 * módulo; nunca se interpola el error crudo (que puede traer URLs de RPC
 * con API keys, tokens o stacktraces). Para loguear el detalle técnico
 * existe `redactRpcSecrets`, que tapa claves y colapsa el stack.
 */

export type SolanaErrorCategory =
  | "slippage"
  | "insufficient_funds"
  | "insufficient_gas"
  | "expired_blockhash"
  | "user_rejected"
  | "account_not_found"
  | "rpc_timeout"
  | "unknown";

export interface TranslatedSolanaError {
  code: string;
  userMessage: string;
  retryable: boolean;
  category: SolanaErrorCategory;
}

/** Códigos que puede devolver `translateSolanaError`. */
export type SolanaErrorCode =
  | "SLIPPAGE_EXCEEDED"
  | "INSUFFICIENT_FUNDS"
  | "INSUFFICIENT_SOL_GAS"
  | "BLOCKHASH_EXPIRED"
  | "USER_REJECTED"
  | "TOKEN_ACCOUNT_ERROR"
  | "RPC_UNAVAILABLE"
  | "UNKNOWN";

const MESSAGES: Record<SolanaErrorCode, { message: string; retryable: boolean; category: SolanaErrorCategory }> = {
  SLIPPAGE_EXCEEDED: {
    message: "El precio se movió más de lo permitido al ejecutar la orden. Vuelve a cotizar e inténtalo de nuevo.",
    retryable: true,
    category: "slippage",
  },
  INSUFFICIENT_FUNDS: {
    message: "No tienes saldo suficiente del activo que quieres usar. Revisa tu saldo disponible o ajusta el monto.",
    retryable: false,
    category: "insufficient_funds",
  },
  INSUFFICIENT_SOL_GAS: {
    message:
      "No te alcanza el SOL para pagar la comisión de la red. Compra un poco de SOL con tu saldo en dólares (USDC) y vuelve a intentarlo.",
    retryable: true,
    category: "insufficient_gas",
  },
  BLOCKHASH_EXPIRED: {
    message: "La orden tardó demasiado en confirmarse y venció. Tus fondos no se movieron: vuelve a cotizar e inténtalo de nuevo.",
    retryable: true,
    category: "expired_blockhash",
  },
  USER_REJECTED: {
    message: "Cancelaste la operación en tu billetera. No se cobró nada: puedes reintentarla cuando quieras.",
    retryable: true,
    category: "user_rejected",
  },
  TOKEN_ACCOUNT_ERROR: {
    message: "Hubo un problema con la cuenta del activo en la red. Reinténtalo en unos minutos y, si sigue fallando, escríbenos.",
    retryable: false,
    category: "account_not_found",
  },
  RPC_UNAVAILABLE: {
    message: "La red de Solana no está respondiendo bien en este momento. Espera unos segundos e inténtalo de nuevo.",
    retryable: true,
    category: "rpc_timeout",
  },
  UNKNOWN: {
    message: "La operación no se completó. Revisa el estado de la orden en unos minutos antes de reintentar.",
    retryable: false,
    category: "unknown",
  },
};

/**
 * Extrae texto del error crudo. Acepta `Error`, strings, objetos de
 * Jupiter (`errorCode`, `error`, `message`) y el `err` de
 * `getSignatureStatuses` (que llega como objeto arbitrario). Nunca lanza.
 */
function errorText(rawError: unknown): string {
  if (rawError === null || rawError === undefined) return "";
  if (typeof rawError === "string") return rawError;
  if (rawError instanceof Error) return `${rawError.name} ${rawError.message}`;
  if (typeof rawError === "object") {
    const record = rawError as Record<string, unknown>;
    for (const key of ["message", "error", "errorMessage", "instructionError", "logs", "err"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim() !== "") return value;
    }
    try {
      return JSON.stringify(rawError);
    } catch {
      return String(rawError);
    }
  }
  return String(rawError);
}

/*
 * Orden de los chequeos = precedencia. Si un texto cae en varias clases
 * gana la primera: un "0x1771" jamás se lee como "0x1", y una falta de
 * lamports para la comisión (gas) no se reporta como saldo del token.
 */
const MATCHERS: { code: SolanaErrorCode; regex: RegExp }[] = [
  {
    code: "USER_REJECTED",
    regex:
      /user rejected|user declined|user did not approve|rejected by user|wallet rejected|request declined/,
  },
  // 0x1771 = 6001: el slippage excedido de Jupiter llega como cualquiera de estos.
  { code: "SLIPPAGE_EXCEEDED", regex: /0x1771|\b6001\b|slippage/ },
  {
    code: "BLOCKHASH_EXPIRED",
    regex:
      /blockhash not found|blockheight exceeded|blockheightexceeded|blockhash.{0,20}expired|expired.{0,20}blockhash|transactionexpired/,
  },
  {
    code: "TOKEN_ACCOUNT_ERROR",
    regex: /0xbc4|accountnotfound|account not found|invalidaccountdata|invalid account data/,
  },
  {
    code: "INSUFFICIENT_SOL_GAS",
    regex:
      /insufficient lamports|insufficient_lamports|not enough lamports|insufficient (?:lamports|funds) for (?:fees|rent)|failed to pay fees|not enough sol|insufficient sol/,
  },
  { code: "INSUFFICIENT_FUNDS", regex: /insufficient funds|insufficientfunds|not enough funds|0x1\b/ },
  {
    code: "RPC_UNAVAILABLE",
    regex:
      /\b429\b|\b502\b|\b503\b|timeout|timed out|rate limit|too many requests|service unavailable|bad gateway|econnrefused|enotfound|eai_again|fetch failed|network error|socket hang up/,
  },
];

export function translateSolanaError(rawError: unknown): TranslatedSolanaError {
  const text = errorText(rawError).toLowerCase();
  if (text) {
    for (const matcher of MATCHERS) {
      if (matcher.regex.test(text)) {
        const known = MESSAGES[matcher.code];
        return { code: matcher.code, userMessage: known.message, retryable: known.retryable, category: known.category };
      }
    }
  }
  const fallback = MESSAGES.UNKNOWN;
  return { code: "UNKNOWN", userMessage: fallback.message, retryable: fallback.retryable, category: "unknown" };
}

/**
 * Sanitizador para LOGS del servidor (M73): tapa API keys y tokens en
 * URLs, JWTs y claves con prefijo, y colapsa los stacktraces. Nunca se
 * usa para armar el `userMessage` (que es texto fijo), sólo para no
 * filtrar secretos en `console.error` o el log de la plataforma.
 */
export function redactRpcSecrets(text: string): string {
  return text
    .replace(/([?&](?:api[-_]?key|apikey|token|secret|access_token|key)=)[^\s&]+/gi, "$1[REDACTADO]")
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "[REDACTADO]")
    .replace(/\b(?:sb_secret_|sk_live_|re_|xox[baprs]-)[A-Za-z0-9_-]{8,}\b/g, "[REDACTADO]")
    .replace(/^\s*at\s+.*$/gm, "[stack]")
    .trim();
}
