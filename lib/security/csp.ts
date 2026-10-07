/**
 * Política de Content Security Policy (M48). Funciones puras, sin `server-only`
 * para poder usarlas en `middleware.ts` (edge), `next.config.ts` y tests.
 *
 * Orígenes externos verificados:
 * - Supabase (REST, auth y websockets): `*.supabase.co` + origen del proyecto
 *   desde env (sin hardcodear el proyecto).
 * - Privy (`lib/auth/privy-provider.tsx` + https://docs.privy.io/security/implementation-guide/content-security-policy):
 *   `auth.privy.io`, `*.privy.io`, `*.privy.systems`, RPC `*.rpc.privy.systems`,
 *   Turnstile `challenges.cloudflare.com`.
 * - RPC de Solana del cliente (`lib/solana/connection.ts`): `NEXT_PUBLIC_SOLANA_RPC_URL`
 *   o el endpoint público del cluster (`NEXT_PUBLIC_SOLANA_CLUSTER`).
 * - Jupiter (`api.jup.ag`), mindicador y el RPC privado: sólo servidor, nunca
 *   se piden desde el navegador, así que NO van en la CSP.
 * - Vercel Web Analytics (M50): mismo origen (`/_vercel/insights/*`), cubierto por `'self'`.
 * - Enlaces a solscan.io (`trade-sheet.tsx`, `portfolio-screen.tsx`,
 *   `detail-screen.tsx`) son `<a href>`, no fetches: no necesitan CSP.
 */

export type CspMode = "enforce" | "report-only" | "off";

export function resolveCspMode(
  raw: string | undefined,
  nodeEnv: string | undefined,
): CspMode {
  const cleaned = raw?.trim().toLowerCase();
  if (cleaned === "enforce" || cleaned === "report-only" || cleaned === "off") {
    return cleaned;
  }
  return nodeEnv === "production" ? "enforce" : "report-only";
}

/** Nonce impredecible por solicitud, como indica la guía de Next 16. */
export function generateNonce(): string {
  return Buffer.from(crypto.randomUUID()).toString("base64");
}

/** Privy: API + iframes (doc oficial de CSP de Privy). */
const PRIVY_CONNECT = [
  "https://auth.privy.io",
  "https://*.privy.io",
  "https://*.privy.systems",
  "https://*.rpc.privy.systems",
];

/** Privy: iframes de auth + Turnstile (CAPTCHA que usa Privy). */
const PRIVY_FRAMES = [
  "https://auth.privy.io",
  "https://*.privy.io",
  "https://*.privy.systems",
  "https://verify.walletconnect.com",
  "https://verify.walletconnect.org",
  "https://challenges.cloudflare.com",
];

/**
 * Endpoints públicos por cluster (`clusterApiUrl` de `@solana/web3.js`).
 * Es el fallback del cliente cuando no hay `NEXT_PUBLIC_SOLANA_RPC_URL`
 * (`lib/solana/connection.ts`). Son endpoints públicos, no secretos.
 */
const CLUSTER_RPC_ORIGIN: Record<string, string> = {
  "mainnet-beta": "https://api.mainnet-beta.solana.com",
  devnet: "https://api.devnet.solana.com",
  testnet: "https://api.testnet.solana.com",
};

function cleanToken(value: string | undefined | null): string | null {
  const text = value?.trim();
  return text ? text : null;
}

function originOf(value: string | undefined | null): string | null {
  const cleaned = cleanToken(value);
  if (!cleaned) return null;
  try {
    const url = new URL(cleaned);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

function wssOf(origin: string | null): string | null {
  if (!origin) return null;
  if (origin.startsWith("https://")) return `wss://${origin.slice("https://".length)}`;
  return null;
}

/** Sólo caracteres válidos en un nonce; cualquier otra cosa se descarta. */
export function sanitizeNonce(nonce: string): string {
  return nonce.replace(/[^A-Za-z0-9\-_+/=]/g, "");
}

/** `report-uri` de una sola pieza; con espacios o `;` se ignora. */
function cleanReportUri(value: string | undefined | null): string | null {
  const cleaned = cleanToken(value);
  if (!cleaned || /[\s;]/.test(cleaned)) return null;
  return cleaned;
}

export type BuildCspInput = {
  /** Nonce ya generado para esta solicitud. */
  nonce: string;
  /** `true` en desarrollo: Next necesita `'unsafe-eval'`. Nunca en producción. */
  isDev: boolean;
  /** `NEXT_PUBLIC_SUPABASE_URL` (opcional; el comodín cubre cualquier proyecto). */
  supabaseUrl?: string | undefined | null;
  /** `NEXT_PUBLIC_SOLANA_RPC_URL` ya resuelta u origen (opcional; cae al cluster). */
  rpcUrl?: string | undefined | null;
  /** `NEXT_PUBLIC_SOLANA_CLUSTER` (opcional; default `mainnet-beta`). */
  rpcCluster?: string | undefined | null;
  /** `CSP_REPORT_URI` (opcional; M61 lo conecta a Sentry). */
  reportUri?: string | undefined | null;
};

export function buildCsp(input: BuildCspInput): string {
  const nonce = sanitizeNonce(input.nonce);
  const cluster = cleanToken(input.rpcCluster) ?? "mainnet-beta";

  const connect: string[] = [
    "'self'",
    "https://*.supabase.co",
    "wss://*.supabase.co",
    ...PRIVY_CONNECT,
  ];
  const supabaseOrigin = originOf(input.supabaseUrl);
  if (supabaseOrigin && !connect.includes(supabaseOrigin)) connect.push(supabaseOrigin);
  const supabaseWss = wssOf(supabaseOrigin);
  if (supabaseWss && !connect.includes(supabaseWss)) connect.push(supabaseWss);
  const rpcOrigin =
    originOf(input.rpcUrl) ?? CLUSTER_RPC_ORIGIN[cluster] ?? CLUSTER_RPC_ORIGIN["mainnet-beta"];
  if (rpcOrigin && !connect.includes(rpcOrigin)) connect.push(rpcOrigin);

  const script = ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", "https://challenges.cloudflare.com"];
  if (input.isDev) script.push("'unsafe-eval'");

  const directives = [
    "default-src 'self'",
    `script-src ${script.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src ${connect.join(" ")}`,
    `frame-src ${PRIVY_FRAMES.join(" ")}`,
    `child-src ${PRIVY_FRAMES.join(" ")}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ];
  if (!input.isDev) directives.push("upgrade-insecure-requests");
  const reportUri = cleanReportUri(input.reportUri);
  if (reportUri) directives.push(`report-uri ${reportUri}`);
  return directives.join("; ");
}
