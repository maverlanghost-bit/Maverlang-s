/**
 * Prueba de posesión de billetera (paso 2 del piloto de depósitos).
 *
 * El cliente NO elige la dirección ni el DID: el servidor los deriva del
 * token de Privy y del usuario de Supabase. El cliente sólo aporta el nonce
 * que el servidor le emitió y la firma ed25519 del mensaje exacto.
 *
 * Este módulo comprueba la FORMA (nonce y firma con pinta de base58). No
 * verifica criptografía ni consume el nonce: eso ocurre en el servidor, en
 * `lib/wallet/link-challenge.ts` y `lib/wallet/link-challenge-store.ts`.
 * Una prueba bien formada no habilita nada por sí sola; sólo permite intentar
 * la verificación real.
 */

export interface WalletLinkingProof {
  /** Nonce emitido por el servidor (base64url de 32 bytes). */
  nonce: string;
  /** Firma ed25519 del mensaje, en base58 (64 bytes → 86-88 caracteres). */
  signature: string;
}

const NONCE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const BASE58_SIGNATURE_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{86,88}$/;

/** Comprueba sólo la forma. No valida la firma ni su contenido. */
export function isWellFormedWalletLinkingProof(value: unknown): value is WalletLinkingProof {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<Record<keyof WalletLinkingProof, unknown>>;
  return (
    typeof candidate.nonce === "string" &&
    NONCE_PATTERN.test(candidate.nonce) &&
    typeof candidate.signature === "string" &&
    BASE58_SIGNATURE_PATTERN.test(candidate.signature)
  );
}

/**
 * Alias histórico: responde si la prueba está declarada con la forma
 * correcta. NO significa "verificada": la verificación es asíncrona (consume
 * el nonce y comprueba ed25519) y vive en el servicio de billetera.
 */
export function hasWalletLinkingProof(proof?: unknown): boolean {
  return isWellFormedWalletLinkingProof(proof);
}
