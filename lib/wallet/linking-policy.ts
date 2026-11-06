import { DomainError } from "@/lib/api/result";
import { isSupabaseAuth } from "@/lib/auth/mode";
import { isWellFormedWalletLinkingProof } from "@/lib/wallet/linking-proof";

/**
 * Política de vinculación Supabase ↔ Privy.
 *
 * Regla: con identidad Supabase, vincular exige una prueba declarada
 * (`{ nonce, signature }`) y, después, la verificación real en servidor:
 * token de Privy ES256, billetera de la API de Privy, consumo atómico del
 * nonce y firma ed25519. Sin prueba no se intenta nada; con una prueba mal
 * formada tampoco. Una prueba bien formada NO autoriza por sí sola: sólo abre
 * la puerta a la verificación. No existe camino sin firma.
 *
 * La demo en memoria (`AUTH_MODE=mock`) no usa este flujo: su billetera es
 * determinista y no representa fondos reales.
 */

export const WALLET_LINKING_LOCKED_MESSAGE =
  "La vinculación de billetera exige una prueba firmada de tu billetera. No se vinculó ni reasignó ninguna billetera.";

/**
 * `true` cuando hay identidad Supabase y no llegó una prueba con la forma
 * correcta. La verificación criptográfica no se hace aquí.
 */
export function walletLinkingLocked(proof?: unknown): boolean {
  if (!isSupabaseAuth()) return false;
  return !isWellFormedWalletLinkingProof(proof);
}

/**
 * Falla cerrado si la identidad es Supabase y falta la prueba declarada. La
 * ruta llama a esta guardia antes de tocar servicios; el servicio la repite
 * para que un llamador futuro no pueda saltarse el requisito.
 */
export function assertWalletLinkingOpen(proof?: unknown): void {
  if (walletLinkingLocked(proof)) {
    throw new DomainError("REAL_DISABLED", WALLET_LINKING_LOCKED_MESSAGE);
  }
}

