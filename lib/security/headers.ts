/**
 * Cabeceras estáticas de seguridad (M48). Funciones puras, sin `server-only`:
 * las usan `next.config.ts` (`headers()`, cubre también `/api/*`) y
 * `middleware.ts` (respuestas de páginas y redirects).
 *
 * `Strict-Transport-Security` sólo en producción. `X-Frame-Options: DENY`
 * convive con `frame-ancestors 'none'` de la CSP. `Permissions-Policy` deja
 * todo cerrado: si el KYC (M76) necesita cámara, se abre ahí.
 * `Cross-Origin-Opener-Policy: same-origin-allow-popups` porque Privy y
 * Google usan popups. B-01: se suman `Cross-Origin-Resource-Policy:
 * same-origin` (otro origen no puede incrustar nuestros recursos),
 * `X-DNS-Prefetch-Control: off` (sin prefetch de hosts que delatan navegación)
 * y `X-Permitted-Cross-Domain-Policies: none` (sin políticas de dominios
 * cruzados para Flash/PDF). No se activa COEP: `require-corp` rompería las
 * imágenes y iframes de terceros (Privy, Turnstile, logos del catálogo).
 */

export type SecurityHeader = { key: string; value: string };

/** Cabeceras con el mismo valor en dev y en prod, en el orden que se emiten. */
const BASE_HEADERS: readonly SecurityHeader[] = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
];

/**
 * B-01: las respuestas de `/api/*` no pasan por `middleware.ts` (matcher), así
 * que `next.config.ts` las emite explícitamente con esta regla. `/(.*)` ya las
 * cubre; la regla dedicada sobrevive a un cambio futuro del matcher.
 */
const API_HEADER_KEYS = new Set([
  "X-Content-Type-Options",
  "Cross-Origin-Resource-Policy",
  "X-DNS-Prefetch-Control",
  "X-Permitted-Cross-Domain-Policies",
]);

export function buildStaticHeaders(opts: { isProd: boolean }): SecurityHeader[] {
  const headers: SecurityHeader[] = BASE_HEADERS.map((header) => ({ ...header }));
  if (opts.isProd) {
    headers.unshift({
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains; preload",
    });
  }
  return headers;
}

export function buildApiHeaders(): SecurityHeader[] {
  return BASE_HEADERS.filter((header) => API_HEADER_KEYS.has(header.key)).map((header) => ({
    ...header,
  }));
}

export function applyStaticHeaders(
  target: { set: (key: string, value: string) => void },
  opts: { isProd: boolean },
): void {
  for (const header of buildStaticHeaders(opts)) {
    target.set(header.key, header.value);
  }
}
