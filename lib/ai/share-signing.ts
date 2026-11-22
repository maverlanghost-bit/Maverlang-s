import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { serverEnv } from "@/lib/env";

/**
 * Firmas HMAC-SHA256 para lo que el servidor emite y luego se vuelve público:
 * respuestas del asistente (chats compartidos) y el porcentaje de la tarjeta.
 * El secreto es `SHARE_SIGNING_SECRET`; sólo fuera de producción hay un valor
 * de desarrollo para que los tests y el modo local funcionen sin configurar.
 */

const DEV_FALLBACK_SECRET = "dev-only-share-signing-secret-do-not-use-in-production";

function readSecret(): string | null {
  const configured = (serverEnv.SHARE_SIGNING_SECRET ?? "").trim();
  if (configured.length >= 32) return configured;
  if (process.env.NODE_ENV === "production") return null;
  return DEV_FALLBACK_SECRET;
}

/** `true` si hay un secreto utilizable (siempre fuera de producción). */
export function shareSigningAvailable(): boolean {
  return readSecret() !== null;
}

function hmac(message: string): string | null {
  const secret = readSecret();
  if (!secret) return null;
  return createHmac("sha256", secret).update(message).digest("base64url");
}

function equalSig(expected: string, received: unknown): boolean {
  if (typeof received !== "string" || received.length === 0 || received.length > 128) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** El texto firmado es siempre el recortado: es lo que guarda el cliente y valida zod. */
function textDigest(text: string): string {
  return createHash("sha256").update(text.trim()).digest("hex");
}

export function signAssistantReply(userId: string, text: string): string | null {
  return hmac(`ai-reply:v1:${userId}:${textDigest(text)}`);
}

export function verifyAssistantReply(userId: string, text: string, sig: unknown): boolean {
  const expected = signAssistantReply(userId, text);
  return expected !== null && equalSig(expected, sig);
}

/** `pct` ya acotado a un decimal (`parseSharePct`); se firma su forma canónica. */
export function signShareCard(id: string, pct: number): string | null {
  return hmac(`card:v1:${id}:${pct}`);
}

export function verifyShareCard(id: string, pct: number, sig: unknown): boolean {
  const expected = signShareCard(id, pct);
  return expected !== null && equalSig(expected, sig);
}
