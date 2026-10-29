/**
 * Etiquetas de la barra inferior que no están en es-CL.ts ni en en.ts.
 * Misma forma en los dos idiomas. Textos cortos para cinco columnas.
 */

export interface NavExtra {
  assistant: string;
  favorites: string;
}

const esCL: NavExtra = {
  assistant: "Asistente",
  favorites: "Favoritas",
};

const en: NavExtra = {
  assistant: "Assistant",
  favorites: "Favorites",
};

export const navExtra = { esCL, en };

export function navExtraCopy(language: "es-CL" | "en"): NavExtra {
  return language === "en" ? navExtra.en : navExtra.esCL;
}
