import { safeNextPath } from "@/lib/auth/paths";

export const CALLBACK_ERROR_PATH = "/app/ingresar?error=enlace";

/** Destino del callback. Si el canje falla, el ingreso con `error=enlace`. */
export function callbackTarget(next: string | null | undefined, ok: boolean): string {
  if (!ok) return CALLBACK_ERROR_PATH;
  return safeNextPath(next) ?? "/app";
}
