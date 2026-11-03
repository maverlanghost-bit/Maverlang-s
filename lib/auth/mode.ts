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

/** Señales de entorno que deciden si la autenticación debe fallar cerrado. */
export type AuthEnvSignals = {
  nodeEnv?: string | undefined;
  vercelEnv?: string | undefined;
  appEnv?: string | undefined;
  /** `ALLOW_MOCK_AUTH`. Sólo un `true` explícito acepta la demo en producción. */
  allowMockAuth?: boolean | undefined;
};

export type AuthModeInput = {
  /** `AUTH_MODE` en servidor. `NEXT_PUBLIC_AUTH_MODE` en cliente. */
  flag?: string | undefined;
  supabaseUrl?: string | undefined;
  publishableKey?: string | undefined;
} & AuthEnvSignals;

const FALLBACK_WARN =
  "AUTH_MODE=supabase sin URL o clave pública de Supabase. La sesión queda en mock.";

const MISMATCH_WARN =
  "AUTH_MODE y NEXT_PUBLIC_AUTH_MODE no coinciden. El servidor usa AUTH_MODE y el cliente el público.";

const INVALID_FLAG_WARN =
  "[auth] Valor desconocido en AUTH_MODE/NEXT_PUBLIC_AUTH_MODE. Fuera de producción se usa mock.";

/**
 * Auditoría A-01: un flag mal escrito (`supabse`) no puede degradar a demo en
 * producción sin que nadie se entere. Los mensajes nombran variables, nunca valores.
 */
const INVALID_FLAG_ERROR =
  "[auth] Valor desconocido en AUTH_MODE/NEXT_PUBLIC_AUTH_MODE en producción. Sólo valen mock o supabase.";

const MISSING_CONFIG_ERROR =
  "[auth] AUTH_MODE=supabase en producción sin NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. No se degrada a mock.";

const MOCK_FORBIDDEN_ERROR =
  "[auth] Modo mock en producción: se niega a servir la demo. Configura AUTH_MODE=supabase con URL y clave pública, o ALLOW_MOCK_AUTH=true para aceptar la demo de forma explícita.";

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

/**
 * Producción para la autenticación (A-01). A diferencia del modo estricto de
 * `lib/env.ts` (que ignora `NODE_ENV` porque `next build` siempre lo pone),
 * aquí cualquier señal de producción alcanza: el peor caso es negarse a
 * arrancar en un build local, nunca servir la demo en un deploy real.
 * Las señales que no se pasan se leen de `process.env` (el gate y los
 * servicios no tienen por qué repetirlas).
 */
export function isProductionAuthRuntime(env: AuthEnvSignals = {}): boolean {
  const signals = [
    env.nodeEnv ?? process.env.NODE_ENV,
    env.vercelEnv ?? process.env.VERCEL_ENV,
    env.appEnv ?? process.env.APP_ENV,
  ];
  return signals.some((value) => value?.trim().toLowerCase() === "production");
}

/** `ALLOW_MOCK_AUTH`: `true`/`1`/`yes`. Cualquier otro valor (o ausencia) es `false`. */
export function allowMockAuthFromEnv(
  source: Record<string, string | undefined> = process.env,
): boolean {
  const raw = source.ALLOW_MOCK_AUTH?.trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes";
}

/**
 * ¿Se acepta la sesión demo? Fuera de producción siempre; en producción sólo
 * con `ALLOW_MOCK_AUTH=true` explícito. Es la misma regla para `authMode()`,
 * el gate y los servicios: una sola fuente de verdad.
 */
export function isMockAuthAllowed(env: AuthEnvSignals = {}): boolean {
  if (!isProductionAuthRuntime(env)) return true;
  if (env.allowMockAuth !== undefined) return env.allowMockAuth === true;
  return allowMockAuthFromEnv();
}

/** Falla cerrado si el mock no está permitido. `context` nombra al llamador. */
export function assertMockAuthAllowed(context: string): void {
  if (isMockAuthAllowed()) return;
  throw new Error(
    `[auth] ${context}: modo mock en producción sin ALLOW_MOCK_AUTH=true. Se niega a servir la demo.`,
  );
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
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV,
    appEnv: process.env.APP_ENV,
    allowMockAuth: allowMockAuthFromEnv(),
  };
}

/**
 * Modo efectivo de autenticación (A-01, falla cerrado).
 *
 * - Flag desconocido: lanza en producción; fuera de producción avisa y usa mock.
 * - Flag `supabase` sin URL o clave: lanza en producción (aunque
 *   `ALLOW_MOCK_AUTH=true`, porque se pidió Supabase explícitamente); fuera de
 *   producción avisa una vez y usa mock.
 * - Mock (flag `mock`, vacío o ausente): lanza en producción salvo
 *   `ALLOW_MOCK_AUTH=true`.
 *
 * En el navegador no se lanza: la cookie demo no autoriza nada por sí sola
 * (el gate y los servicios la validan en el servidor) y `ALLOW_MOCK_AUTH` no es
 * una variable `NEXT_PUBLIC_*`, así que el bundle no puede leerla. Sin esta
 * excepción, una demo de producción explícita rompería el login en el cliente.
 */
export function authMode(input?: AuthModeInput): AuthModeName {
  const resolved = input ?? readDefaultAuthModeInput();
  const production = isProductionAuthRuntime(resolved);
  const onServer = typeof window === "undefined";
  const failClosed = production && onServer;
  const mockAllowed = isMockAuthAllowed(resolved);

  const flag = resolved.flag?.trim().toLowerCase() ?? "";

  if (flag !== "" && flag !== "mock" && flag !== "supabase") {
    if (failClosed) throw new Error(INVALID_FLAG_ERROR);
    warnAuthOnce(INVALID_FLAG_WARN);
    return "mock";
  }

  if (flag === "supabase") {
    const config = readSupabasePublicConfig({
      url: resolved.supabaseUrl,
      publishableKey: resolved.publishableKey,
    });
    if (!config) {
      // Un `AUTH_MODE=supabase` roto en producción no se convierte en demo,
      // ni siquiera con ALLOW_MOCK_AUTH=true: la intención era Supabase.
      if (failClosed) throw new Error(MISSING_CONFIG_ERROR);
      warnAuthOnce(FALLBACK_WARN);
      return "mock";
    }
    return "supabase";
  }

  if (failClosed && !mockAllowed) throw new Error(MOCK_FORBIDDEN_ERROR);
  return "mock";
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
