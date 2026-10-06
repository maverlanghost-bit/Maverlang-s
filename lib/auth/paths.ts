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

/** Destino interno bajo `/app`, sin volver a la pantalla de ingreso. */
export function safeNextPath(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.startsWith("/\\")) return null;
  if (trimmed.includes("\\") || trimmed.includes("://")) return null;

  const hash = trimmed.indexOf("#");
  const withoutHash = hash === -1 ? trimmed : trimmed.slice(0, hash);
  const query = withoutHash.indexOf("?");
  const pathname = query === -1 ? withoutHash : withoutHash.slice(0, query);
  if (pathname !== "/app" && !pathname.startsWith("/app/")) return null;
  if (pathname === "/app/ingresar" || pathname.startsWith("/app/ingresar/")) return null;
  if (pathname === "/app/registro" || pathname.startsWith("/app/registro/")) return null;
  return withoutHash;
}

export function splitPath(value: string): { pathname: string; search: string } {
  const query = value.indexOf("?");
  if (query === -1) return { pathname: value, search: "" };
  return { pathname: value.slice(0, query), search: value.slice(query) };
}
