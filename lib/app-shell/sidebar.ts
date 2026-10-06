/** Preferencia de ancho del sidebar de escritorio (>= lg). Cookie para renderizar sin flash. */

export const SIDEBAR_COOKIE = "mv_sidebar";

export const SIDEBAR_MAX_AGE = 31536000; // 1 año

export type SidebarState = "collapsed" | "expanded";

/** Ausente o inválido -> expandido (como hoy). */
export function parseSidebarState(value: unknown): SidebarState {
  return value === "collapsed" ? "collapsed" : "expanded";
}

export function serializeSidebarCookie(state: SidebarState): string {
  return `${SIDEBAR_COOKIE}=${state}; path=/; max-age=${SIDEBAR_MAX_AGE}; SameSite=Lax`;
}

const SIDEBAR_INTERACTIVE_SELECTOR = "a, button, input, textarea, select, [contenteditable]";

type ClosestLike = {
  closest: (selector: string) => unknown;
};

/**
 * Clic en el fondo del sidebar (no sobre links/botones/inputs) alterna el estado.
 * Recibe el target del evento; no captura clics de hijos interactivos.
 */
export function shouldToggleSidebarClick(target: ClosestLike | null | undefined): boolean {
  if (!target || typeof target.closest !== "function") return true;
  return target.closest(SIDEBAR_INTERACTIVE_SELECTOR) == null;
}

type FocusLike = {
  tagName?: string;
  isContentEditable?: boolean;
};

/** El atajo Ctrl/Cmd+B no actúa dentro de campos editables. */
export function shouldIgnoreSidebarShortcut(target: FocusLike | null | undefined): boolean {
  if (!target) return false;
  if (target.isContentEditable === true) return true;
  const tag = typeof target.tagName === "string" ? target.tagName.toUpperCase() : "";
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}
