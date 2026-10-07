/**
 * Cabeceras estáticas de seguridad (M48). Funciones puras, sin `server-only`:
 * las usan `next.config.ts` (`headers()`, cubre también `/api/*`) y
 * `middleware.ts` (respuestas de páginas y redirects).
 *
 * `Strict-Transport-Security` sólo en producción. `X-Frame-Options: DENY`
 * convive con `frame-ancestors 'none'` de la CSP. `Permissions-Policy` deja
 * todo cerrado: si el KYC (M76) necesita cámara, se abre ahí.
 * `Cross-Origin-Opener-Policy: same-origin-allow-popups` porque Privy y
 * Google usan popups.
 */

export type SecurityHeader = { key: string; value: string };

export function buildStaticHeaders(opts: { isProd: boolean }): SecurityHeader[] {
  const headers: SecurityHeader[] = [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  ];
  if (opts.isProd) {
    headers.unshift({
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains; preload",
    });
  }
  return headers;
}

export function applyStaticHeaders(
  target: { set: (key: string, value: string) => void },
  opts: { isProd: boolean },
): void {
  for (const header of buildStaticHeaders(opts)) {
    target.set(header.key, header.value);
  }
}
