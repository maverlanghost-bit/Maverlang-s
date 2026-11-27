/** Id del panel que hace scroll en escritorio (lg+) dentro de `ShellFrame`. */
export const APP_SCROLL_ID = "app-scroll";

type Scroller = { get top(): number; to(top: number): void };

/**
 * Contenedor de scroll vigente: en lg+ con sesión es el panel `#app-scroll`;
 * en celular, y en el modo invitado, sigue siendo la ventana.
 */
export function getAppScroller(): Scroller {
  const panel = typeof document === "undefined" ? null : document.getElementById(APP_SCROLL_ID);
  if (panel && panel.scrollHeight > 0 && window.matchMedia("(min-width: 1024px)").matches) {
    return { get top() { return panel.scrollTop; }, to: (top) => { panel.scrollTop = top; } };
  }
  return { get top() { return window.scrollY; }, to: (top) => window.scrollTo(0, top) };
}
