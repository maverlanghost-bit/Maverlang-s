import { DomainError } from "@/lib/api/result";
import { isSupabaseAuth } from "@/lib/auth/mode";

/**
 * Política de vinculación Supabase ↔ Privy.
 *
 * La primera asociación de un DID de Privy a una cuenta Supabase sólo
 * demuestra posesión simultánea de una sesión Supabase y un token de Privy
 * vigente; no demuestra que ambas identidades sean la misma persona (TOFU).
 * Mientras no exista una prueba verificable de correspondencia, la
 * vinculación real queda cerrada.
 *
 * La regla vive en un módulo propio y se aplica tanto en la ruta
 * (`POST /api/me/wallet`) como en el servicio que persiste la billetera, para
 * que un llamador futuro no pueda saltarse el bloqueo.
 */

export const WALLET_LINKING_LOCKED_MESSAGE =
  "La vinculación de billetera está deshabilitada temporalmente. No se vinculó ni reasignó ninguna billetera.";

/** `true` cuando hay identidad Supabase (la vinculación real está bloqueada). */
export function walletLinkingLocked(): boolean {
  return isSupabaseAuth();
}

/** Falla cerrado si la identidad es Supabase. La demo en memoria sigue igual. */
export function assertWalletLinkingOpen(): void {
  if (walletLinkingLocked()) {
    throw new DomainError("REAL_DISABLED", WALLET_LINKING_LOCKED_MESSAGE);
  }
}
