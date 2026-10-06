import { readSupabasePublicConfig } from "@/lib/supabase/config";

/**
 * Privy sólo si el modo público es `live` y hay app id.
 * En mock, o sin `NEXT_PUBLIC_PRIVY_APP_ID`, no se monta el SDK.
 * Si el modo efectivo es Supabase, Privy no manda.
 */
export function shouldUsePrivy(
  env: { dataMode?: string | undefined; privyAppId?: string | undefined } = {
    dataMode: process.env.NEXT_PUBLIC_DATA_MODE,
    privyAppId: process.env.NEXT_PUBLIC_PRIVY_APP_ID,
  },
): boolean {
  const mode = env.dataMode?.trim() || "mock";
  const appId = env.privyAppId?.trim() ?? "";
  return mode === "live" && appId.length > 0;
}

export function privyAppId(): string | null {
  const id = process.env.NEXT_PUBLIC_PRIVY_APP_ID?.trim();
  return id ? id : null;
}

export type AuthModeName = "mock" | "supabase";

export type AuthModeInput = {
  /** `AUTH_MODE` en servidor. `NEXT_PUBLIC_AUTH_MODE` en cliente. */
  flag?: string | undefined;
  supabaseUrl?: string | undefined;
  publishableKey?: string | undefined;
};

const FALLBACK_WARN =
  "AUTH_MODE=supabase sin URL o clave pública de Supabase. La sesión queda en mock.";

const MISMATCH_WARN =
  "AUTH_MODE y NEXT_PUBLIC_AUTH_MODE no coinciden. El servidor usa AUTH_MODE y el cliente el público.";

const warnings = new Set<string>();

export function warnAuthOnce(message: string): void {
  if (warnings.has(message)) return;
  warnings.add(message);
  console.warn(message);
}

/** Sólo para tests. */
export function resetAuthModeWarningsForTests(): void {
  warnings.clear();
}

/** El flag de servidor gana. Si está vacío, se usa el público. Si no hay ninguno, mock. */
export function pickAuthFlag(serverFlag: string | undefined, publicFlag: string | undefined): string {
  const server = serverFlag?.trim();
  if (server) return server;
  const pub = publicFlag?.trim();
  return pub || "mock";
}

function readDefaultAuthModeInput(): AuthModeInput {
  const serverFlag = process.env.AUTH_MODE;
  const publicFlag = process.env.NEXT_PUBLIC_AUTH_MODE;
  const server = serverFlag?.trim().toLowerCase() ?? "";
  const pub = publicFlag?.trim().toLowerCase() || "mock";
  if (server && server !== pub) warnAuthOnce(MISMATCH_WARN);
  return {
    flag: pickAuthFlag(serverFlag, publicFlag),
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };
}

/**
 * Supabase sólo si el flag dice `supabase` y hay URL http(s) más clave pública.
 * Si falta algo, mock, con un aviso una sola vez. La app no se cae.
 */
export function authMode(input?: AuthModeInput): AuthModeName {
  const resolved = input ?? readDefaultAuthModeInput();
  const flag = resolved.flag?.trim().toLowerCase() || "mock";
  if (flag !== "supabase") return "mock";
  const config = readSupabasePublicConfig({
    url: resolved.supabaseUrl,
    publishableKey: resolved.publishableKey,
  });
  if (!config) {
    warnAuthOnce(FALLBACK_WARN);
    return "mock";
  }
  return "supabase";
}

export function isSupabaseAuth(input?: AuthModeInput): boolean {
  return authMode(input) === "supabase";
}

/** Variables públicas, las mismas en el SSR del cliente y en el navegador. */
export function clientAuthModeInput(): AuthModeInput {
  return {
    flag: process.env.NEXT_PUBLIC_AUTH_MODE,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };
}
