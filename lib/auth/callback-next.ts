import { siteOrigin } from "@/config/site";
import { safeNextPath, splitPath } from "@/lib/auth/paths";

export const CALLBACK_ERROR_PATH = "/app/ingresar?error=enlace";

/** Destino del callback. Si el canje falla, el ingreso con `error=enlace`. La recuperación vuelve a restablecer. */
export function callbackTarget(next: string | null | undefined, ok: boolean): string {
  const safe = safeNextPath(next);
  if (!ok) {
    if (safe && splitPath(safe).pathname === "/app/restablecer") return "/app/restablecer?error=expirado";
    return CALLBACK_ERROR_PATH;
  }
  return safe ?? "/app";
}

/** El correo de recuperación vuelve al callback y de ahí a elegir la contraseña. */
export function recoveryRedirectTo(): string {
  const url = new URL("/auth/callback", siteOrigin());
  url.searchParams.set("next", "/app/restablecer");
  return url.toString();
}
