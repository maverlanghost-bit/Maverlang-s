/**
 * Verificación del correo de Supabase Auth (puro, sin red).
 *
 * `confirmed_at` NO sirve para decidir si el correo está verificado: Supabase
 * lo escribe cuando la cuenta se confirma por CUALQUIER método, incluido un
 * teléfono. La única marca que prueba que el correo se confirmó es
 * `email_confirmed_at`.
 *
 * El depósito de USDC acredita dinero, así que todos sus lectores (sesión de
 * la API, Server Component de la pantalla y barrido del cron) usan esta
 * función: una cuenta confirmada sólo por teléfono no entra.
 */
export interface EmailConfirmationLike {
  /** Marca de verificación del CORREO. `null`/ausente = no verificado. */
  email_confirmed_at?: string | null;
  /**
   * Presente en Supabase Auth, pero puede ser confirmación por teléfono u otro
   * método: NO se usa para habilitar depósitos.
   */
  confirmed_at?: string | null;
}

/** `true` sólo si Auth confirma el correo en `email_confirmed_at`. */
export function hasConfirmedEmail(user: EmailConfirmationLike | null | undefined): boolean {
  const confirmed = user?.email_confirmed_at;
  return typeof confirmed === "string" && confirmed.trim() !== "";
}
