import type { AccountMode } from "@/lib/account/mode";
import { DEMO_WALLET_ADDRESS } from "@/lib/auth/demo-user";

/**
 * Dirección que se puede mostrar para depositar o recibir. En demo no hay
 * dirección: la billetera fija de la demo no debe recibir fondos reales.
 * En cuentas reales sólo se usa la billetera de la sesión (verificada por el
 * proveedor de autenticación) y nunca la dirección fija de la demo.
 */
export function receivableAddress(
  mode: AccountMode,
  address: string | null | undefined,
): string {
  if (mode !== "real") return "";
  const trimmed = (address ?? "").trim();
  if (trimmed === "" || trimmed === DEMO_WALLET_ADDRESS) return "";
  return trimmed;
}
