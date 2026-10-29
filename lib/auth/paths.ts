/**
 * Mercado (`/app`), el detalle (`/app/accion/[ticker]`) y Ajustes (`/app/ajustes`).
 * Cartera, billetera, perfil y el resto de `/app` piden sesión.
 */
export function isPublicAppPath(pathname: string): boolean {
  if (pathname === "/app" || pathname === "/app/accion" || pathname.startsWith("/app/accion/")) return true;
  return pathname === "/app/ajustes" || pathname.startsWith("/app/ajustes/");
}

function isPath(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function isIngresarPath(pathname: string): boolean {
  return isPath(pathname, "/app/ingresar");
}

export function isRegistroPath(pathname: string): boolean {
  return isPath(pathname, "/app/registro");
}

/** Recuperar y restablecer. Siguen abiertas con o sin sesión. */
export function isPasswordFlowPath(pathname: string): boolean {
  return isPath(pathname, "/app/recuperar") || isPath(pathname, "/app/restablecer");
}

/** Ingreso, alta, recuperar y restablecer. No piden sesión. */
export function isCredentialPath(pathname: string): boolean {
  return isIngresarPath(pathname) || isRegistroPath(pathname) || isPasswordFlowPath(pathname);
}

/** Vuelta al detalle, con `?operar` si la persona llegó a comprar o vender. */
export function detailReturnPath(symbol: string, operar: "comprar" | "vender" | null): string {
  const path = `/app/accion/${encodeURIComponent(symbol)}`;
  const withOperar = operar ? `${path}?operar=${operar}` : path;
  return safeNextPath(withOperar) ?? path;
}

/** El gate lo pone al rebotar desde onboarding para que el ingreso no vuelva a salir. */
export const AUTH_STAY_PARAM = "stay";

const RETURN_KEYS = ["next", "redirect", "returnTo"] as const;
const MAX_RETURN_DEPTH = 5;

/** Ingreso, alta y onboarding no pueden ser el destino de vuelta. */
function isAuthReturnPath(pathname: string): boolean {
  return isIngresarPath(pathname) || isRegistroPath(pathname) || isOnboardingPath(pathname);
}

export function isOnboardingPath(pathname: string): boolean {
  return isPath(pathname, "/app/onboarding");
}

/** El ingreso no distingue modo: los dos llamados llevan `next`. */
export function ingresarPath(next: string): string {
  const safe = safeNextPath(next) ?? "/app";
  const params = new URLSearchParams();
  params.set("next", safe);
  return `/app/ingresar?${params.toString()}`;
}

/** Alta de cuenta. Conserva `next` para volver a la misma acción. */
export function registroPath(next: string): string {
  const safe = safeNextPath(next) ?? "/app";
  const params = new URLSearchParams();
  params.set("next", safe);
  return `/app/registro?${params.toString()}`;
}

/** Tras la sesión, el registro conserva `next` para volver a la misma acción. */
export function onboardingPath(next: string): string {
  const safe = safeNextPath(next) ?? "/app";
  const params = new URLSearchParams();
  if (safe !== "/app") params.set("next", safe);
  const search = params.toString();
  return search ? `/app/onboarding?${search}` : "/app/onboarding";
}

/** Pantalla corta de aceptación legal (M43): mismo patrón que el onboarding. */
export function aceptarPath(next: string): string {
  const safe = safeNextPath(next) ?? "/app";
  const params = new URLSearchParams();
  if (safe !== "/app") params.set("next", safe);
  const search = params.toString();
  return search ? `/app/aceptar?${search}` : "/app/aceptar";
}

function pathOnly(value: string): string {
  const hash = value.indexOf("#");
  const withoutHash = hash === -1 ? value : value.slice(0, hash);
  const query = withoutHash.indexOf("?");
  return query === -1 ? withoutHash : withoutHash.slice(0, query);
}

function decodeReturn(value: string): string | null {
  if (!value.includes("%")) return value;
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

/**
 * Destino interno bajo `/app`.
 * Ingreso, registro y onboarding no valen como vuelta: se desanida
 * `next`, `redirect` o `returnTo` hasta una ruta de la app.
 * Un enlace externo, `//` o un anidado que no termina se descarta.
 */
export function safeNextPath(value: string | null | undefined, depth = 0): string | null {
  if (!value || depth > MAX_RETURN_DEPTH) return null;
  let trimmed = value.trim();
  if (!trimmed.startsWith("/")) {
    const decoded = decodeReturn(trimmed);
    if (!decoded || decoded === trimmed || !decoded.startsWith("/")) return null;
    trimmed = decoded;
  }
  if (trimmed.startsWith("//") || trimmed.startsWith("/\\")) return null;

  const hash = trimmed.indexOf("#");
  const withoutHash = hash === -1 ? trimmed : trimmed.slice(0, hash);
  const query = withoutHash.indexOf("?");
  const pathname = query === -1 ? withoutHash : withoutHash.slice(0, query);
  const search = query === -1 ? "" : withoutHash.slice(query + 1);
  if (pathname.includes("\\") || pathname.includes("://") || pathname.split("/").includes("..")) return null;
  if (pathname !== "/app" && !pathname.startsWith("/app/")) return null;

  if (!isAuthReturnPath(pathname)) {
    if (!search) return withoutHash;
    const params = new URLSearchParams(search);
    let changed = false;
    for (const key of RETURN_KEYS) {
      const nested = params.get(key);
      if (!nested) continue;
      const inner = safeNextPath(nested, depth + 1);
      const nestedPath = pathOnly(nested);
      // Una vuelta que apunta al ingreso o al onboarding se reemplaza por la ruta real.
      if (nestedPath && isAuthReturnPath(nestedPath)) {
        if (inner) params.set(key, inner);
        else params.delete(key);
        changed = true;
        continue;
      }
      if (inner) continue;
      params.delete(key);
      changed = true;
    }
    if (!changed) return withoutHash;
    const rest = params.toString();
    return rest ? `${pathname}?${rest}` : pathname;
  }

  const params = new URLSearchParams(search);
  for (const key of RETURN_KEYS) {
    const nested = params.get(key);
    if (!nested) continue;
    const inner = safeNextPath(nested, depth + 1);
    if (inner) return inner;
  }
  return null;
}

export function splitPath(value: string): { pathname: string; search: string } {
  const query = value.indexOf("?");
  if (query === -1) return { pathname: value, search: "" };
  return { pathname: value.slice(0, query), search: value.slice(query) };
}
