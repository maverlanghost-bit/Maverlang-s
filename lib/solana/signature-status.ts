/**
 * Estado de una firma de Solana → estado de nuestra orden.
 * PURO: recibe lo que devuelve `getSignatureStatuses` del RPC y decide
 * `submitted` / `confirmed` / `failed`. No toca la red. Lo consume
 * `trade.live.status()` para confirmar en cadena una orden ya enviada.
 *
 * Regla de Solana: una firma está `processed` → `confirmed` → `finalized`.
 * Hasta `finalized` puede revertirse, pero para efectos del usuario una tx
 * `confirmed` ya es dinero asentado. Un `err` no-nulo SIEMPRE es `failed`,
 * sin importar el nivel de confirmación (la tx se ejecutó y falló).
 */

export interface SignatureStatusLike {
  confirmationStatus?: "processed" | "confirmed" | "finalized" | null;
  slot?: number | null;
  confirmations?: number | null;
  err?: unknown;
}

export interface ConfirmationDecision {
  status: "submitted" | "confirmed" | "failed";
  slot: number | null;
  confirmations: number | null;
}

/**
 * Nivel de confirmación → estado de orden. `err` no-nulo gana sobre todo:
 * si la transacción falló on-chain, la orden es `failed` aunque el RPC
 * reporte un nivel de confirmación alto.
 */
export function confirmationToOrderStatus(
  confirmationStatus: SignatureStatusLike["confirmationStatus"],
  err?: unknown,
): "submitted" | "confirmed" | "failed" {
  if (err !== null && err !== undefined) return "failed";
  if (confirmationStatus === "confirmed" || confirmationStatus === "finalized") return "confirmed";
  // null (aún no aterrizó) o "processed" (puede revertirse): sigue pendiente.
  return "submitted";
}

/** Empaqueta el status del RPC en la decisión completa para la orden. */
export function signatureStatusToOrder(status: SignatureStatusLike | null): ConfirmationDecision {
  if (!status) {
    return { status: "submitted", slot: null, confirmations: null };
  }
  return {
    status: confirmationToOrderStatus(status.confirmationStatus, status.err),
    slot: typeof status.slot === "number" ? status.slot : null,
    confirmations: typeof status.confirmations === "number" ? status.confirmations : null,
  };
}
