import { isBrowseBlocked, normalizeRegion } from "@/config/compliance";
import { ONBOARDING_DONE } from "@/lib/auth/cookies";
import { isMockAuthAllowed } from "@/lib/auth/mode";
import {
  AUTH_STAY_PARAM,
  isCredentialPath,
  isIngresarPath,
  isMfaVerifyPath,
  isOnboardingPath,
  isPasswordFlowPath,
  isPublicAppPath,
  isRegistroPath,
  MFA_VERIFY_PATH,
  safeNextPath,
  splitPath,
} from "@/lib/auth/paths";

const COUNTRY = /^[A-Z]{2}$/;

export type GateInput = {
  pathname: string;
  search: string;
  countryHeader: string | null;
  countryQuery: string | null;
  /** `?country=` sólo fuera de production. */
  nodeEnv: string | undefined;
  blockedCountries: readonly string[];
  mockSession: string | null;
  onboarding: string | null;
  privyToken: string | null;
  usePrivy: boolean;
  /** Región de Vercel (`x-vercel-ip-country-region`) o `?region=` fuera de production. */
  regionHeader?: string | null;
  regionQuery?: string | null;
  /**
   * M75: default false. Si es true, una IP de un país bloqueado igual puede
   * usar las rutas de la demo: el geobloqueo de operación no redirige.
   * Los sancionados y las regiones siguen sin poder navegar. La cotización
   * real no mira este flag (M70).
   */
  demoForBlocked?: boolean;
  /** Si es true, manda Supabase: no cuentan la cookie mock ni `privy-token`. */
  useSupabase: boolean;
  /**
   * A-01: `ALLOW_MOCK_AUTH`. Sin esto (o fuera de producción) la cookie
   * `a24_mock_session` no cuenta como sesión. Si no se informa se lee del
   * entorno en `hasAuthSession`.
   */
  allowMockAuth?: boolean;
  /** Sesión verificada con `getClaims` (o `getUser`). No es la cookie en crudo. */
  supabaseSession: boolean;
  /** En supabase, sale de `user_metadata` del JWT. La cookie `a24_onb` no cuenta. */
  supabaseOnboarded: boolean;
  /**
   * M43: aceptación mínima para la demo (`terms_version` + `privacy_version`,
   * o perfil completo antiguo). Si no se informa, vale `supabaseOnboarded`.
   */
  supabaseDemoReady?: boolean;
  /**
   * MFA (auditoría 2026-11): sesión `aal1` con factor TOTP verificado.
   * Fail-closed: en modo Supabase, si no se informa se considera pendiente.
   * El middleware lo calcula con los claims y `getUser`; los tests lo fijan.
   */
  supabaseMfaRequired?: boolean;
};

export type GateDecision =
  | { kind: "next" }
  | { kind: "redirect"; pathname: string; search: string };

const NEXT: GateDecision = { kind: "next" };

export function blockedCountryList(raw: string | undefined): string[] {
  if (!raw?.trim()) return ["US"];
  const list = raw
    .split(",")
    .map((part) => part.trim().toUpperCase())
    .filter((part) => COUNTRY.test(part));
  return list.length > 0 ? list : ["US"];
}

export function isSkippedPath(pathname: string): boolean {
  return (
    pathname === "/api" ||
    pathname.startsWith("/api/") ||
    pathname === "/_next" ||
    pathname.startsWith("/_next/") ||
    /\.(?:png|jpe?g|gif|webp|svg|ico|txt|xml|woff2?|map|css|js)$/i.test(pathname)
  );
}

/** El canje del correo (`/auth/callback`) no pasa por geobloqueo ni por la sesión. */
export function isAuthPath(pathname: string): boolean {
  return pathname === "/auth" || pathname.startsWith("/auth/");
}

export function resolveCountry(input: Pick<GateInput, "countryHeader" | "countryQuery" | "nodeEnv">): string | null {
  if (input.nodeEnv !== "production") {
    const query = input.countryQuery?.trim().toUpperCase() ?? "";
    if (COUNTRY.test(query)) return query;
  }
  const header = input.countryHeader?.trim().toUpperCase() ?? "";
  return COUNTRY.test(header) ? header : null;
}

/** `UA-43` a partir del país y del header. `?region=` sólo fuera de production. */
export function resolveRegion(
  input: Pick<GateInput, "countryHeader" | "countryQuery" | "regionHeader" | "regionQuery" | "nodeEnv">,
): string | null {
  const country = resolveCountry(input);
  const fromQuery = input.nodeEnv !== "production" ? (input.regionQuery?.trim() ?? "") : "";
  const raw = fromQuery || input.regionHeader?.trim() || "";
  return normalizeRegion(country, raw || null);
}

/** Portada, ayuda, legal y el mercado público (`/app` y el detalle). */
function isNavigatePath(pathname: string): boolean {
  if (pathname === "/bloqueado") return true;
  if (pathname === "/app" || pathname === "/app/accion" || pathname.startsWith("/app/accion/")) return true;
  return pathname !== "/app" && !pathname.startsWith("/app/");
}

function blockedRedirect(): GateDecision {
  return { kind: "redirect", pathname: "/bloqueado", search: "?motivo=ubicacion" };
}

function present(value: string | null): boolean {
  return value !== null && value.length > 0;
}

/** Argumentos de sesión que usa el gate; las señales de producción son opcionales. */
export type AuthSessionInput = {
  useSupabase: boolean;
  supabaseSession: boolean;
  usePrivy: boolean;
  privyToken: string | null;
  mockSession: string | null;
  nodeEnv?: string | undefined;
  allowMockAuth?: boolean | undefined;
};

/** Misma regla que el middleware. Supabase manda si el modo es ese; si no, Privy o la cookie mock. */
export function hasAuthSession(input: AuthSessionInput): boolean {
  if (input.useSupabase) return input.supabaseSession;
  if (input.usePrivy) return present(input.privyToken);
  if (!present(input.mockSession)) return false;
  // A-01: en producción la cookie demo no autentica salvo ALLOW_MOCK_AUTH=true.
  // `authMode()` ya lanza antes en ese caso; esta comprobación cubre cualquier
  // llamada que llegue al gate sin pasar por el modo efectivo.
  return isMockAuthAllowed({ nodeEnv: input.nodeEnv, allowMockAuth: input.allowMockAuth });
}

function isAppPath(pathname: string): boolean {
  return pathname === "/app" || pathname.startsWith("/app/");
}

function isAceptarPath(pathname: string): boolean {
  return pathname === "/app/aceptar" || pathname.startsWith("/app/aceptar/");
}

/**
 * Rutas que exigen haber pasado el TOTP cuando hay un factor verificado.
 * Quedan abiertas la verificación, la recuperación de contraseña y las rutas
 * públicas del mercado/ajustes. El ingreso y el registro con sesión también
 * esperan: no aportan nada a una sesión `aal1` pendiente.
 */
export function requiresMfaStepPath(pathname: string): boolean {
  if (!isAppPath(pathname)) return false;
  if (isMfaVerifyPath(pathname)) return false;
  if (isPublicAppPath(pathname)) return false;
  if (isPasswordFlowPath(pathname)) return false;
  return true;
}

function redirectTo(path: string): GateDecision {
  const target = splitPath(path);
  return { kind: "redirect", pathname: target.pathname, search: target.search };
}

function mfaRedirect(pathname: string, search: string): GateDecision {
  const params = new URLSearchParams();
  params.set("next", safeNextPath(`${pathname}${search}`) ?? "/app");
  return { kind: "redirect", pathname: MFA_VERIFY_PATH, search: `?${params.toString()}` };
}

function loginRedirect(pathname: string, search: string): GateDecision {
  const params = new URLSearchParams();
  const here = search ? `${pathname}${search}` : pathname;
  // No envolver la URL completa: onboarding/ingresar se desanidan en safeNextPath.
  params.set("next", safeNextPath(here) ?? "/app");
  // El cliente, si ya se cree con sesión, no debe volver a empujar onboarding.
  if (isOnboardingPath(pathname)) params.set(AUTH_STAY_PARAM, "1");
  return { kind: "redirect", pathname: "/app/ingresar", search: `?${params.toString()}` };
}

function onboardingRedirect(pathname: string, search: string): GateDecision {
  const current = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const next = safeNextPath(current.get("next")) ?? safeNextPath(`${pathname}${search}`);
  if (!next || isOnboardingPath(splitPath(next).pathname)) {
    return { kind: "redirect", pathname: "/app/onboarding", search: "" };
  }
  const params = new URLSearchParams();
  params.set("next", next);
  return { kind: "redirect", pathname: "/app/onboarding", search: `?${params.toString()}` };
}

/** M43: cuentas a medias (con sesión pero sin aceptación) van a la pantalla corta. */
function aceptarRedirect(pathname: string, search: string): GateDecision {
  const current = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const next = safeNextPath(current.get("next")) ?? safeNextPath(`${pathname}${search}`);
  const nextPath = next ? splitPath(next).pathname : "";
  if (
    !next ||
    isAceptarPath(nextPath) ||
    isIngresarPath(nextPath) ||
    isRegistroPath(nextPath) ||
    isOnboardingPath(nextPath)
  ) {
    return { kind: "redirect", pathname: "/app/aceptar", search: "" };
  }
  const params = new URLSearchParams();
  params.set("next", next);
  return { kind: "redirect", pathname: "/app/aceptar", search: `?${params.toString()}` };
}

export function decideGate(input: GateInput): GateDecision {
  if (isSkippedPath(input.pathname)) return NEXT;
  if (isAuthPath(input.pathname)) return NEXT;

  // M57b: el TOTP queda fuera del geobloqueo para poder subir de aal1 a aal2.
  // M57: /admin ni siquiera entra acá (el middleware lo deja pasar antes).
  if (!isMfaVerifyPath(input.pathname) && input.pathname !== "/bloqueado") {
    const country = resolveCountry(input);
    const region = resolveRegion(input);
    if (isBrowseBlocked(country, region)) return blockedRedirect();
    const operateBlocked = country !== null && input.blockedCountries.includes(country);
    if (operateBlocked && !isNavigatePath(input.pathname) && !input.demoForBlocked) {
      return blockedRedirect();
    }
  }

  if (!isAppPath(input.pathname)) return NEXT;

  const hasSession = hasAuthSession(input);
  const onboarded = input.useSupabase ? input.supabaseOnboarded : input.onboarding === ONBOARDING_DONE;
  const isPublic = isPublicAppPath(input.pathname);

  if (!hasSession) {
    if (isCredentialPath(input.pathname) || isPublic) return NEXT;
    return loginRedirect(input.pathname, input.search);
  }

  // Auditoría 2026-11: una sesión `aal1` con TOTP verificado no entra a rutas
  // privadas hasta confirmar el código. Fail-closed si el middleware no pudo
  // leer el nivel (se informa `undefined`).
  const mfaRequired = input.useSupabase && (input.supabaseMfaRequired ?? true);
  if (mfaRequired && requiresMfaStepPath(input.pathname)) {
    return mfaRedirect(input.pathname, input.search);
  }

  // M43: en supabase manda la aceptación mínima (demoReady), no el perfil completo.
  // Con demoReady se entra a todo /app; sin aceptación se va a /app/aceptar.
  // `/app/onboarding` ya no es destino automático: sigue accesible directo.
  if (input.useSupabase) {
    const demoReady = input.supabaseDemoReady ?? input.supabaseOnboarded;
    if (!demoReady) {
      if (isAceptarPath(input.pathname) || isPublic || isPasswordFlowPath(input.pathname) || isMfaVerifyPath(input.pathname)) {
        return NEXT;
      }
      return aceptarRedirect(input.pathname, input.search);
    }
    if (isMfaVerifyPath(input.pathname)) return NEXT;
    if (isAceptarPath(input.pathname) || isIngresarPath(input.pathname) || isRegistroPath(input.pathname)) {
      const params = new URLSearchParams(input.search.startsWith("?") ? input.search.slice(1) : input.search);
      const next = safeNextPath(params.get("next"));
      const nextPath = next ? splitPath(next).pathname : "";
      if (!next || isIngresarPath(nextPath) || isRegistroPath(nextPath) || isOnboardingPath(nextPath) || isAceptarPath(nextPath)) {
        return redirectTo("/app");
      }
      return redirectTo(next);
    }
    return NEXT;
  }

  if (!onboarded) {
    if (isOnboardingPath(input.pathname) || isPublic || isPasswordFlowPath(input.pathname)) return NEXT;
    return onboardingRedirect(input.pathname, input.search);
  }

  if (isIngresarPath(input.pathname) || isRegistroPath(input.pathname) || (input.useSupabase && isOnboardingPath(input.pathname))) {
    const params = new URLSearchParams(input.search.startsWith("?") ? input.search.slice(1) : input.search);
    const next = safeNextPath(params.get("next"));
    const nextPath = next ? splitPath(next).pathname : "";
    if (!next || isIngresarPath(nextPath) || isRegistroPath(nextPath) || isOnboardingPath(nextPath)) {
      return redirectTo("/app");
    }
    return redirectTo(next);
  }

  return NEXT;
}
