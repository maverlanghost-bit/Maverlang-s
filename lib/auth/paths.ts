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
  return withoutHash;
}

export function splitPath(value: string): { pathname: string; search: string } {
  const query = value.indexOf("?");
  if (query === -1) return { pathname: value, search: "" };
  return { pathname: value.slice(0, query), search: value.slice(query) };
}
