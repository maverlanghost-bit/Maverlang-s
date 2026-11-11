import "server-only";

import { createHash, createPublicKey, timingSafeEqual, verify, type KeyObject } from "node:crypto";

/**
 * Verificación Ed25519 del feed de Fraccion.si, con `node:crypto` y sin
 * dependencias nuevas.
 *
 * Se firman los bytes UTF-8 del JSON canónico del índice (claves ordenadas) con
 * el campo `signature` omitido. El índice trae el `detail_sha256` de cada
 * portafolio, así que verificar el índice basta para detectar un detalle
 * cambiado o a medias.
 *
 * No genera claves ni las guarda: la pública llega por variable de entorno.
 */

export type FeedIndexSignature = {
  alg: string;
  keyId: string | null;
  sig: string;
};

export type FeedSignatureCheck =
  | { ok: true; keyId: string | null }
  | { ok: false; reason: "no_signature" | "no_key" | "key_id_mismatch" | "bad_alg" | "bad_signature" };

const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");
const HEX_64 = /^[0-9a-f]{64}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (isRecord(value)) {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      const entry = value[key];
      if (entry === undefined) continue;
      sorted[key] = sortValue(entry);
    }
    return sorted;
  }
  return value;
}

/** JSON canónico: claves ordenadas, sin espacios, `undefined` omitido. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

/** Copia del índice sin el campo `signature` (lo que se firma). */
export function withoutSignature(index: unknown): unknown {
  if (!isRecord(index)) return index;
  const copy: Record<string, unknown> = { ...index };
  delete copy.signature;
  return copy;
}

/** Bytes UTF-8 que se firman: el índice canónico sin `signature`. */
export function canonicalIndexPayload(index: unknown): Buffer {
  return Buffer.from(canonicalJson(withoutSignature(index)), "utf8");
}

/**
 * Variante con `signature: null` incluido. El export de Fraccion puede firmar
 * el índice con la clave omitida o en null; se aceptan las dos formas.
 */
function canonicalIndexPayloadWithNullSignature(index: unknown): Buffer | null {
  if (!isRecord(index)) return null;
  return Buffer.from(canonicalJson({ ...index, signature: null }), "utf8");
}

export function sha256Hex(input: string | Uint8Array): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * Acepta la clave pública en SPKI/PEM o como 32 bytes crudos en base64.
 * Devuelve `null` si no se puede construir: nunca se inventa una clave.
 */
export function loadEd25519PublicKey(raw: string): KeyObject | null {
  const value = raw.trim();
  if (!value) return null;
  const pem = value.replace(/\\n/g, "\n");

  try {
    if (pem.includes("-----BEGIN")) {
      return createPublicKey({ key: pem, format: "pem" });
    }
    const bytes = Buffer.from(pem, "base64");
    if (bytes.length === 32) {
      return createPublicKey({
        key: Buffer.concat([ED25519_SPKI_PREFIX, bytes]),
        format: "der",
        type: "spki",
      });
    }
    if (bytes.length > 0) {
      return createPublicKey({ key: bytes, format: "der", type: "spki" });
    }
  } catch {
    // Se intenta el otro formato abajo.
  }

  try {
    return createPublicKey({ key: pem, format: "pem" });
  } catch {
    return null;
  }
}

/** Ed25519 sin prehash: `verify(null, data, publicKey, signature)`. */
export function verifyEd25519(
  payload: string | Uint8Array,
  signatureBase64: string,
  publicKeyRaw: string,
): boolean {
  const key = loadEd25519PublicKey(publicKeyRaw);
  if (!key) return false;
  const signature = Buffer.from(signatureBase64.trim(), "base64");
  if (signature.length !== 64) return false;
  try {
    return verify(null, typeof payload === "string" ? Buffer.from(payload, "utf8") : payload, key, signature);
  } catch {
    return false;
  }
}

/** Firma declarada en el índice, o `null` si falta o está mal formada. */
export function readIndexSignature(index: unknown): FeedIndexSignature | null {
  if (!isRecord(index)) return null;
  const signature = index.signature;
  if (!isRecord(signature)) return null;
  const sig = typeof signature.sig === "string" ? signature.sig.trim() : "";
  if (!sig) return null;
  const alg = typeof signature.alg === "string" && signature.alg.trim() !== "" ? signature.alg.trim() : "Ed25519";
  const rawKeyId = typeof signature.key_id === "string" ? signature.key_id.trim() : "";
  return { alg, keyId: rawKeyId === "" ? null : rawKeyId, sig };
}

/**
 * Verifica el índice completo. Si `expectedKeyId` viene con valor, el `key_id`
 * del índice debe coincidir exactamente (permite rotar claves sin ambigüedad).
 */
export function verifyFeedIndexSignature(
  index: unknown,
  publicKeyRaw: string,
  expectedKeyId?: string | null,
): FeedSignatureCheck {
  const signature = readIndexSignature(index);
  if (!signature) return { ok: false, reason: "no_signature" };
  if (!publicKeyRaw.trim()) return { ok: false, reason: "no_key" };
  if (signature.alg.toLowerCase() !== "ed25519") return { ok: false, reason: "bad_alg" };
  const expected = expectedKeyId?.trim() ?? "";
  if (expected !== "") {
    if (!signature.keyId || signature.keyId !== expected) return { ok: false, reason: "key_id_mismatch" };
  }
  const payloads: Buffer[] = [canonicalIndexPayload(index)];
  const withNullSignature = canonicalIndexPayloadWithNullSignature(index);
  if (withNullSignature) payloads.push(withNullSignature);
  if (!payloads.some((payload) => verifyEd25519(payload, signature.sig, publicKeyRaw))) {
    return { ok: false, reason: "bad_signature" };
  }
  return { ok: true, keyId: signature.keyId };
}

/** Compara el sha256 de un archivo con el que declara el índice firmado. */
export function digestMatches(bytes: Uint8Array, expectedHex: string): boolean {
  const expected = expectedHex.trim().toLowerCase();
  if (!HEX_64.test(expected)) return false;
  const actual = sha256Hex(bytes);
  return timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
}
