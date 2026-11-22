import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Autenticación del webhook del on-ramp (MON-9).
 *
 * Esquema: HMAC-SHA256 en hex sobre `${timestamp}.${rawBody}` con
 * `ONRAMP_WEBHOOK_SECRET`. Cabeceras:
 * - `x-onramp-timestamp`: segundos Unix (también se acepta en milisegundos).
 * - `x-onramp-signature`: hex del HMAC (acepta el prefijo `sha256=`).
 *
 * [VERIFICAR con el proveedor] Los nombres de cabecera y el formato exacto
 * de lo firmado son un contrato propio hasta tener la especificación de
 * Koywe / Onramper; hay que alinearlos antes de encender el depósito en pesos.
 *
 * Falla cerrado: sin secreto, sin cabeceras, firma distinta o fuera de la
 * ventana de 5 minutos → rechazo. Función pura (sin red ni env) para testear.
 */

export const ONRAMP_SIGNATURE_HEADER = "x-onramp-signature";
export const ONRAMP_TIMESTAMP_HEADER = "x-onramp-timestamp";
export const ONRAMP_WEBHOOK_WINDOW_MS = 5 * 60 * 1000;

export type OnrampWebhookReject =
  | "SECRET_MISSING"
  | "HEADERS_MISSING"
  | "TIMESTAMP_INVALID"
  | "TIMESTAMP_STALE"
  | "SIGNATURE_INVALID";

export type OnrampWebhookVerdict =
  | { ok: true; signature: string }
  | { ok: false; reason: OnrampWebhookReject };

export interface VerifyOnrampWebhookInput {
  secret: string | undefined;
  signatureHeader: string | null;
  timestampHeader: string | null;
  rawBody: string;
  nowMs?: number;
}

export function signOnrampPayload(secret: string, timestamp: string, rawBody: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");
}

function parseTimestampMs(value: string): number | null {
  if (!/^\d{1,16}$/.test(value)) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  // Menos de 1e11 → segundos (hasta el año 5138); si no, milisegundos.
  return n < 1e11 ? n * 1000 : n;
}

export function verifyOnrampWebhook(input: VerifyOnrampWebhookInput): OnrampWebhookVerdict {
  const secret = input.secret?.trim();
  if (!secret) return { ok: false, reason: "SECRET_MISSING" };
  const timestamp = input.timestampHeader?.trim() ?? "";
  const provided = (input.signatureHeader?.trim() ?? "").replace(/^sha256=/i, "").toLowerCase();
  if (!timestamp || !provided) return { ok: false, reason: "HEADERS_MISSING" };
  const tsMs = parseTimestampMs(timestamp);
  if (tsMs === null) return { ok: false, reason: "TIMESTAMP_INVALID" };
  const now = input.nowMs ?? Date.now();
  if (Math.abs(now - tsMs) > ONRAMP_WEBHOOK_WINDOW_MS) {
    return { ok: false, reason: "TIMESTAMP_STALE" };
  }
  if (!/^[0-9a-f]{64}$/.test(provided)) return { ok: false, reason: "SIGNATURE_INVALID" };
  const expected = signOnrampPayload(secret, timestamp, input.rawBody);
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(provided, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "SIGNATURE_INVALID" };
  }
  return { ok: true, signature: provided };
}

/**
 * Antirrepetición dentro de la ventana: una firma válida sólo se acepta una
 * vez por instancia. Es una segunda barrera; la idempotencia durable es por
 * referencia del proveedor en el punto donde se registra/acredita el evento
 * (`settleOnramp` devuelve `already: true` para una sesión ya liquidada).
 */
const seenSignatures = new Map<string, number>();

export function claimOnrampSignature(signature: string, nowMs: number = Date.now()): boolean {
  for (const [key, at] of seenSignatures) {
    if (nowMs - at > ONRAMP_WEBHOOK_WINDOW_MS * 2) seenSignatures.delete(key);
  }
  if (seenSignatures.has(signature)) return false;
  seenSignatures.set(signature, nowMs);
  return true;
}

/**
 * Libera una firma reclamada cuando el procesamiento falló, para que el
 * reintento del proveedor (misma firma) no quede descartado como repetido.
 */
export function releaseOnrampSignature(signature: string): void {
  seenSignatures.delete(signature);
}

/** Sólo para tests. */
export function resetOnrampSignatureCache(): void {
  seenSignatures.clear();
}
