import { DomainError } from "@/lib/api/result";
import { isSupabaseAuth } from "@/lib/auth/mode";
import { hasWalletLinkingProof } from "@/lib/wallet/linking-proof";

/**
 * Política de vinculación Supabase ↔ Privy.
 *
 * La primera asociación de un DID de Privy a una cuenta Supabase sólo
 * demuestra posesión simultánea de una sesión Supabase y un token de Privy
 * vigente; no demuestra que ambas identidades sean la misma persona (TOFU).
 * Mientras no exista una prueba verificable de correspondencia, la
 * vinculación real queda cerrada.
 *
 * T36: esa prueba ya tiene tipo (`lib/wallet/linking-proof.ts`), pero no
 * verificación. `hasWalletLinkingProof` devuelve siempre `false`, así que
 * pasar un nonce o una firma no cambia el resultado: Supabase sigue cerrado.
 *
 * La regla vive en un módulo propio y se aplica tanto en la ruta
 * (`POST /api/me/wallet`) como en el servicio que persiste la billetera, para
 * que un llamador futuro no pueda saltarse el bloqueo.
 */

export const WALLET_LINKING_LOCKED_MESSAGE =
  "La vinculación de billetera está deshabilitada temporalmente. No se vinculó ni reasignó ninguna billetera.";

/**
 * `true` cuando hay identidad Supabase y no hay prueba verificada de que sea
 * la misma persona. Hoy equivale a `isSupabaseAuth()`: la prueba no existe.
 */
export function walletLinkingLocked(proof?: unknown): boolean {
  if (!isSupabaseAuth()) return false;
  return !hasWalletLinkingProof(proof);
}

/**
 * Falla cerrado si la identidad es Supabase y no hay prueba verificada. La
 * demo en memoria sigue igual. Una prueba declarada en el cuerpo no basta:
 * sin verificación de la firma contra un nonce emitido en la sesión, es sólo
 * una afirmación del cliente.
 */
export function assertWalletLinkingOpen(proof?: unknown): void {
  if (walletLinkingLocked(proof)) {
    throw new DomainError("REAL_DISABLED", WALLET_LINKING_LOCKED_MESSAGE);
  }
}

