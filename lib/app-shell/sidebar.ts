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

/** Ancho elegido arrastrando el borde. Cookie aparte para no mezclarlo con el colapso. */
export const SIDEBAR_WIDTH_COOKIE = "mv_sidebar_w";

export const SIDEBAR_COLLAPSED_WIDTH = 68;
export const SIDEBAR_DEFAULT_WIDTH = 200;
export const SIDEBAR_MIN_WIDTH = 176;
export const SIDEBAR_MAX_WIDTH = 320;
/** Arrastrar por debajo de este ancho colapsa la barra al riel de íconos. */
export const SIDEBAR_COLLAPSE_THRESHOLD = 150;
export const SIDEBAR_KEY_STEP = 16;

export function clampSidebarWidth(value: number): number {
  if (!Number.isFinite(value)) return SIDEBAR_DEFAULT_WIDTH;
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(value)));
}

/** Ausente o inválido -> ancho por defecto; fuera de rango se acota. */
export function parseSidebarWidth(value: unknown): number {
  if (typeof value !== "string" || !/^\d{1,4}$/.test(value)) return SIDEBAR_DEFAULT_WIDTH;
  return clampSidebarWidth(Number(value));
}

export function serializeSidebarWidthCookie(width: number): string {
  return `${SIDEBAR_WIDTH_COOKIE}=${clampSidebarWidth(width)}; path=/; max-age=${SIDEBAR_MAX_AGE}; SameSite=Lax`;
}

const SIDEBAR_INTERACTIVE_SELECTOR =
  "a, button, input, textarea, select, [contenteditable], [role='menu'], [data-sidebar-static]";

type ClosestLike = {
  closest: (selector: string) => unknown;
};

/**
 * Clic en el fondo vacío del sidebar (no sobre controles, menús ni superficies estáticas)
 * alterna el estado. Recibe el target del evento; no captura clics de hijos interactivos.
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
