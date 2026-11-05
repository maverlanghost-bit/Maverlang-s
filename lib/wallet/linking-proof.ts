/**
 * Prueba de correspondencia Supabase ↔ Privy (T36).
 *
 * El bloqueo TOFU de `lib/wallet/linking-policy.ts` existe porque tener a la
 * vez una sesión Supabase y un access token de Privy sólo demuestra posesión
 * simultánea, no que ambas identidades sean la misma persona. La única prueba
 * que podría levantar ese bloqueo es distinta de las que ya existen: el usuario
 * firma con su billetera un nonce que el servidor mostró **dentro de su sesión
 * Supabase**. Así la firma queda atada a la sesión, no sólo al token de Privy.
 *
 * Este módulo define el tipo y la forma del mensaje, y nada más. La
 * verificación criptográfica **no está implementada**: `hasWalletLinkingProof`
 * devuelve siempre `false`. No se verifica ninguna firma, no se llama a Privy
 * ni a Solana y no se guarda ningún secreto. Tampoco se emite ni se persiste el
 * nonce: emitirlo y verificarlo es el cambio posterior que revisará el bloqueo.
 */

/** Único tipo de prueba aceptado como candidato a levantar el bloqueo. */
export const WALLET_LINKING_PROOF_KIND = "wallet_nonce_signature" as const;

/**
 * Prueba declarada por el cliente. Todos los campos son texto exacto:
 * - `nonce`: el que el servidor mostró en la sesión Supabase (aún no se emite).
 * - `address`: billetera Solana que firmó, en base58 (distingue mayúsculas).
 * - `signature`: firma serializada en base58.
 */
export interface WalletLinkingProof {
  kind: typeof WALLET_LINKING_PROOF_KIND;
  nonce: string;
  address: string;
  signature: string;
}

/**
 * Mensaje exacto que el usuario firmaría. Determinista y sin marcas de tiempo:
 * el nonce ya es único y la vigencia la decidiría el emisor del nonce, no este
 * texto. Sirve para documentar el formato; nada lo firma todavía.
 */
export function walletLinkingProofMessage(nonce: string): string {
  return `Maverlang: vincula esta billetera a tu cuenta.\nNonce: ${nonce.trim()}`;
}

/** Comprueba sólo la forma del objeto. No valida la firma ni su contenido. */
export function isWellFormedWalletLinkingProof(value: unknown): value is WalletLinkingProof {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<Record<keyof WalletLinkingProof, unknown>>;
  return (
    candidate.kind === WALLET_LINKING_PROOF_KIND &&
    typeof candidate.nonce === "string" &&
    candidate.nonce.trim() !== "" &&
    typeof candidate.address === "string" &&
    candidate.address.trim() !== "" &&
    typeof candidate.signature === "string" &&
    candidate.signature.trim() !== ""
  );
}

/**
 * ¿Hay una prueba de correspondencia verificada?
 *
 * Siempre `false`, a propósito. Sin verificación de la firma contra el nonce
 * emitido en la sesión, un objeto bien formado es sólo una afirmación del
 * cliente: aceptarlo reabriría exactamente el TOFU que el bloqueo cierra. La
 * firma se revisará en un cambio posterior; hasta entonces esta función no
 * puede devolver `true`, ni siquiera con una prueba completa.
 */
export function hasWalletLinkingProof(proof?: unknown): boolean {
  // La forma se puede mirar sin criptografía; su resultado no habilita nada.
  void isWellFormedWalletLinkingProof(proof);
  return false;
}
