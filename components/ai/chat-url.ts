/**
 * URL canónica del asistente: cada chat tiene su propia ruta
 * (`/app/asistente/c/<id>`), así el enlace se puede compartir y recargar sin
 * remontar la pantalla. Módulo puro y seguro en servidor.
 */
export const CHAT_ID_PATTERN = /^[A-Za-z0-9_-]{6,64}$/;

const CHAT_BASE_PATH = "/app/asistente";
const CHAT_SEGMENT = "/c";

/** Sólo ids con forma segura: sin barras, sin espacios y sin caracteres raros. */
export function isValidChatId(id: unknown): boolean {
  return typeof id === "string" && CHAT_ID_PATTERN.test(id);
}

/** Ruta del chat; sin id válido cae en la vista general del asistente. */
export function chatPath(id: string | null | undefined): string {
  if (typeof id !== "string" || !isValidChatId(id)) return CHAT_BASE_PATH;
  return `${CHAT_BASE_PATH}${CHAT_SEGMENT}/${encodeURIComponent(id)}`;
}

/**
 * Lee el id desde el pathname. Tolera barra final, query string y hash.
 * Cualquier otra variante (sin id, id inválido, rutas anidadas) devuelve null.
 */
export function parseChatPath(pathname: string): { chatId: string | null } {
  if (typeof pathname !== "string") return { chatId: null };
  const path = pathname.split(/[?#]/)[0] ?? "";
  if (path === CHAT_BASE_PATH || path === `${CHAT_BASE_PATH}/`) return { chatId: null };
  const prefix = `${CHAT_BASE_PATH}${CHAT_SEGMENT}/`;
  if (!path.startsWith(prefix)) return { chatId: null };
  const rest = path.slice(prefix.length).replace(/\/$/, "");
  if (!rest || rest.includes("/")) return { chatId: null };
  let decoded: string;
  try {
    decoded = decodeURIComponent(rest);
  } catch {
    return { chatId: null };
  }
  return isValidChatId(decoded) ? { chatId: decoded } : { chatId: null };
}

/**
 * Actualiza la URL en el historial sin recargar ni perder el `state`.
 * Si la ruta ya coincide, no toca nada para no remontar la vista.
 */
export function replaceChatUrl(id: string | null): void {
  if (typeof window === "undefined") return;
  try {
    const path = chatPath(id);
    if (window.location.pathname === path) return;
    window.history.replaceState(window.history.state, "", path);
  } catch {
    // Sin historial disponible: la vista sigue funcionando sin cambiar la URL.
  }
}
