import type { ApiErrorCode, ApiResult } from "@/lib/types";

export type { ApiErrorCode, ApiResult };

/** Código de dominio → HTTP. Lo usan los route handlers (T07). */
export const API_ERROR_STATUS = {
  UNAUTHORIZED: 401,
  FORBIDDEN_REGION: 403,
  VALIDATION: 400,
  NOT_FOUND: 404,
  QUOTE_EXPIRED: 409,
  PRICE_DEVIATION: 409,
  INSUFFICIENT_FUNDS: 422,
  MINT_NOT_ALLOWED: 400,
  RATE_LIMITED: 429,
  UPSTREAM: 502,
  INTERNAL: 500,
} as const satisfies Record<ApiErrorCode, number>;

const ERROR_MESSAGE: Record<ApiErrorCode, string> = {
  UNAUTHORIZED: "Necesitas iniciar sesión.",
  FORBIDDEN_REGION: "El servicio no está disponible en tu país.",
  VALIDATION: "Los datos no son válidos.",
  NOT_FOUND: "No encontramos eso.",
  QUOTE_EXPIRED: "La cotización venció. Pide una nueva.",
  PRICE_DEVIATION: "El precio se movió más de lo permitido.",
  INSUFFICIENT_FUNDS: "No tienes saldo suficiente.",
  MINT_NOT_ALLOWED: "Ese activo no está permitido.",
  RATE_LIMITED: "Demasiadas solicitudes. Intenta de nuevo en unos segundos.",
  UPSTREAM: "El proveedor no respondió.",
  INTERNAL: "Error interno.",
};

export function errorMessage(code: ApiErrorCode): string {
  return ERROR_MESSAGE[code];
}

export function isApiErrorCode(value: unknown): value is ApiErrorCode {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(API_ERROR_STATUS, value);
}

export function httpStatusFor(code: ApiErrorCode): number {
  return API_ERROR_STATUS[code];
}

export function ok<T>(data: T): ApiResult<T> {
  return { ok: true, data };
}

export function fail(code: ApiErrorCode, message = errorMessage(code)): ApiResult<never> {
  return { ok: false, error: { code, message } };
}

export function resultStatus<T>(result: ApiResult<T>): number {
  return result.ok ? 200 : httpStatusFor(result.error.code);
}

export class DomainError extends Error {
  readonly code: ApiErrorCode;

  constructor(code: ApiErrorCode, message = errorMessage(code)) {
    super(message);
    this.name = "DomainError";
    this.code = code;
  }
}

export function failFrom(error: unknown): ApiResult<never> {
  if (error instanceof DomainError) return fail(error.code, error.message);
  return fail("INTERNAL");
}
