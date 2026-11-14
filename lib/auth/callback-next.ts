import { siteOrigin } from "@/config/site";
import { safeNextPath, splitPath } from "@/lib/auth/paths";

/**
 * Origen al que vuelven los correos de Supabase (recuperación y confirmación).
 * En el navegador manda el origen actual: el flujo PKCE guarda el verificador
 * en una cookie de ESTE dominio, y si el correo vuelve a otro dominio
 * (p. ej. maverlang.com pidiendo desde maverlang.vercel.app) el canje falla.
 * Fuera del navegador, el sitio configurado.
 */
export function authRedirectOrigin(): string {
  if (typeof window !== "undefined") {
    const origin = window.location?.origin;
    if (typeof origin === "string" && /^https?:\/\//.test(origin)) return origin;
  }
  return siteOrigin();
}

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
  const url = new URL("/auth/callback", authRedirectOrigin());
  url.searchParams.set("next", "/app/restablecer");
  return url.toString();
}
