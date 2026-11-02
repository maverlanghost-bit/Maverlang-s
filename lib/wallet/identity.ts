import { DomainError } from "@/lib/api/result";
import { isValidSolanaAddress } from "@/lib/solana/address";

/**
 * Identidad de billetera (M66-fix).
 *
 * Dos reglas que no se negocian:
 * - Una dirección Solana se compara como texto exacto (base58 distingue
 *   mayúsculas). Nunca `toLowerCase()` ni comparaciones "case-insensitive".
 * - La vinculación real exige DOS pruebas en el mismo request: sesión de
 *   Supabase + access token de Privy firmado y vigente. El DID verificado se
 *   persiste junto a la billetera para que la asociación no sea efímera.
 */

/** Prefijo canónico del DID de Privy. */
export const PRIVY_DID_PREFIX = "did:privy:";

/** Migración que agrega `wallets.privy_user_id` y su índice único. */
export const PRIVY_BINDING_MIGRATION = "0040_wallets_privy_binding.sql";

/**
 * Exige que la dirección enviada por el cliente sea exactamente la billetera
 * verificada de la sesión. Sin billetera verificada no se opera: falla cerrado.
 *
 * El `trim` sólo elimina espacios al borde; el resto se compara carácter por
 * carácter. No se normaliza a minúsculas: en base58 `A` y `a` son distintas.
 */
export function requireSessionWalletMatch(
  sessionWallet: string | null | undefined,
  claimedAddress: string,
): string {
  const verified = sessionWallet?.trim() ?? "";
  if (verified === "") {
    throw new DomainError(
      "VALIDATION",
      "Tu cuenta no tiene una billetera Solana verificada. Vincúlala antes de continuar.",
    );
  }
  const claimed = claimedAddress?.trim() ?? "";
  if (claimed !== verified) {
    throw new DomainError(
      "VALIDATION",
      "La billetera indicada no coincide con la verificada en tu cuenta.",
    );
  }
  return verified;
}

/** Fila mínima de `public.wallets` para decidir la vinculación. */
export interface WalletBindingRow {
  userId: string;
  address: string;
  /** DID de Privy; `null` en filas antiguas o creadas antes de 0040. */
  privyUserId: string | null;
}

export type WalletBindingAction = "insert" | "update" | "move";

export interface PlanPrivyWalletBindingInput {
  userId: string;
  privyUserId: string;
  address: string;
  /** Fila que ya tiene este DID (dueño actual de la identidad Privy). */
  byPrivyUser: WalletBindingRow | null;
  /** Fila que ya tiene esta dirección exacta (sin importar mayúsculas). */
  byAddress: WalletBindingRow | null;
  /** Todas las filas del usuario (para impedir cambiar de identidad Privy). */
  userRows: readonly WalletBindingRow[];
}

/**
 * Decide cómo persistir una billetera verificada sin ambigüedad de identidad:
 * - `insert`: primera billetera y primera identidad Privy.
 * - `update`: misma fila (misma dirección, o fila antigua sin DID) que pasa a
 *   quedar ligada al DID verificado.
 * - `move`: el mismo DID cambió su dirección Solana en Privy; se actualiza la
 *   fila existente en vez de crear una segunda identidad.
 *
 * Lanza `VALIDATION` si el DID o la dirección ya pertenecen a otra cuenta, o
 * si la cuenta ya estaba ligada a un DID distinto. Nunca reasigna.
 */
export function planPrivyWalletBinding(input: PlanPrivyWalletBindingInput): WalletBindingAction {
  const privyUserId = input.privyUserId.trim();
  if (!privyUserId.startsWith(PRIVY_DID_PREFIX)) {
    throw new DomainError("UNAUTHORIZED", "La identidad de Privy no es válida.");
  }
  if (!isValidSolanaAddress(input.address)) {
    throw new DomainError("VALIDATION", "La billetera Solana no es válida.");
  }
  const address = input.address.trim();

  // Una cuenta Supabase no puede alternar entre identidades Privy: eso
  // permitiría mezclar billeteras de dos personas en la misma cuenta.
  const otherIdentity = input.userRows.find(
    (row) => row.privyUserId !== null && row.privyUserId !== privyUserId,
  );
  if (otherIdentity) {
    throw new DomainError(
      "VALIDATION",
      "Tu cuenta ya está vinculada a otra identidad de Privy. Contacta a soporte para cambiarla.",
    );
  }

  if (input.byPrivyUser) {
    if (input.byPrivyUser.userId !== input.userId) {
      throw new DomainError(
        "VALIDATION",
        "Esa identidad de Privy ya está vinculada a otra cuenta.",
      );
    }
    if (input.byAddress && input.byAddress.userId !== input.userId) {
      throw new DomainError("VALIDATION", "Esa billetera ya está vinculada a otra cuenta.");
    }
    // Comparación exacta: un cambio sólo de mayúsculas es otra dirección.
    return input.byPrivyUser.address.trim() === address ? "update" : "move";
  }

  if (input.byAddress) {
    if (input.byAddress.userId !== input.userId) {
      throw new DomainError("VALIDATION", "Esa billetera ya está vinculada a otra cuenta.");
    }
    return "update";
  }

  return "insert";
}
