/**
 * AUTH-5: opciones de las cookies de sesión de Supabase para todos los
 * clientes (servidor, middleware, callback y navegador).
 *
 * - `secure` en producción: la cookie nunca viaja por http.
 * - `sameSite: "lax"`: no se envía en POST cross-site (frena CSRF) pero sí al
 *   volver del enlace del correo.
 * - `path: "/"`.
 * - `httpOnly` queda en `false` a propósito: el cliente de navegador
 *   (`createBrowserClient`, usado en `lib/auth/supabase-provider.tsx` para
 *   `onAuthStateChange`, `signOut` y el refresco) lee y escribe la cookie desde
 *   JS. Con `httpOnly: true` el navegador no podría leerla y la sesión de la
 *   UI se rompería. La mitigación frente a XSS es la CSP con nonce (M48).
 * - `maxAge` no se fija: queda el default de @supabase/ssr (400 días, tope del
 *   navegador). La vida real de la sesión la limitan en el servidor los
 *   ajustes de Auth de Supabase (time-box e inactividad; ver handoff), no la
 *   cookie.
 */
export function supabaseCookieOptions(): { path: string; sameSite: "lax"; secure: boolean } {
  return { path: "/", sameSite: "lax", secure: process.env.NODE_ENV === "production" };
}
