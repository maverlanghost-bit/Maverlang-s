"use client";

/**
 * Mantiene la API pública `openCommandPalette()` y el componente `CommandPalette`
 * por compatibilidad con llamadores existentes; la UI unificada vive en
 * `StockSearchRoot` (`components/app-shell/stock-search.tsx`) para que nunca
 * se abran dos modales ni se dupliquen atajos ⌘K / Ctrl+K.
 */
export function openCommandPalette() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("maverlang:open-command-palette"));
  }
}

export function CommandPalette() {
  return null;
}
