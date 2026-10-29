/**
 * Textos de importar una cartera desde una foto.
 * No van en es-CL.ts ni en.ts: esta parte los mantiene aparte.
 * Mismas claves en los dos idiomas.
 */

export const NOT_CONFIGURED_MESSAGE = "El asistente aún no está configurado";

export type ImportarMessages = {
  title: string;
  lead: string;
  notTokens: string;
  disclaimer: string;
  rowsLabel: string;
  quantity: string;
  remove: string;
  matched: string;
  unmatched: string;
  readAs: string;
  pickTicker: string;
  pickPlaceholder: string;
  searching: string;
  searchEmpty: string;
  searchError: string;
  change: string;
  addPortfolio: string;
  favoritesOnly: string;
  saving: string;
  savedAccount: string;
  savedFavorites: string;
  deviceNotice: string;
  nothingToSave: string;
  skipped: string;
  badQuantity: string;
  emptyTitle: string;
  emptyBody: string;
  favoritesCap: string;
  saveFailed: string;
  notConfigured: string;
  rateLimited: string;
  badImage: string;
  badOrigin: string;
  upstream: string;
  emptyPhoto: string;
  foundPhoto: string;
  foundCapped: string;
};

const disclaimer = "Solo informativo, no es una recomendación.";
const disclaimerEn = "For information only, not a recommendation.";

export const importarCopy: { esCL: ImportarMessages; en: ImportarMessages } = {
  esCL: {
    title: "Cartera de la foto",
    lead: "Revisa las cantidades.",
    notTokens: "Es un seguimiento. No son tokens comprados en Maverlang.",
    disclaimer,
    rowsLabel: "Posiciones leídas",
    quantity: "Cantidad",
    remove: "Quitar {name}",
    matched: "En el catálogo",
    unmatched: "No está en el catálogo",
    readAs: "Leímos",
    pickTicker: "Elige el activo",
    pickPlaceholder: "Busca por nombre o símbolo",
    searching: "Buscando",
    searchEmpty: "Sin coincidencias",
    searchError: "No pudimos buscar. Intenta otra vez.",
    change: "Cambiar",
    addPortfolio: "Agregar a mi cartera",
    favoritesOnly: "Solo a favoritas",
    saving: "Guardando",
    savedAccount: "Listo. Quedó en tu seguimiento.",
    savedFavorites: "Listo. Quedó en favoritas.",
    deviceNotice: "Se guarda en este dispositivo.",
    nothingToSave: "Nada para guardar. Elige el activo y la cantidad.",
    skipped: "Algunas filas no entraron.",
    badQuantity: "Ingresa una cantidad mayor que cero.",
    emptyTitle: "Sin filas",
    emptyBody: "La foto no trajo posiciones.",
    favoritesCap: "Puedes tener hasta 200 favoritas.",
    saveFailed: "No pudimos guardar en este dispositivo.",
    notConfigured: NOT_CONFIGURED_MESSAGE,
    rateLimited: "Demasiadas fotos. Espera un momento.",
    badImage: "La foto tiene que ser JPG o PNG y pesar hasta 4 MB.",
    badOrigin: "No pudimos aceptar esta solicitud.",
    upstream: "No pudimos leer la foto. Intenta otra vez.",
    emptyPhoto: "No vimos posiciones en la foto.",
    foundPhoto: "Encontramos {count}. Revísalas antes de guardar.",
    foundCapped: "Mostramos las primeras {count}. Revísalas antes de guardar.",
  },
  en: {
    title: "Portfolio from the photo",
    lead: "Check the quantities.",
    notTokens: "This is a watchlist. These are not tokens bought on Maverlang.",
    disclaimer: disclaimerEn,
    rowsLabel: "Rows read from the photo",
    quantity: "Quantity",
    remove: "Remove {name}",
    matched: "In the catalog",
    unmatched: "Not in the catalog",
    readAs: "We read",
    pickTicker: "Choose the asset",
    pickPlaceholder: "Search by name or symbol",
    searching: "Searching",
    searchEmpty: "No matches",
    searchError: "Search failed. Try again.",
    change: "Change",
    addPortfolio: "Add to my portfolio",
    favoritesOnly: "Favorites only",
    saving: "Saving",
    savedAccount: "Done. It is on your watchlist.",
    savedFavorites: "Done. Added to favorites.",
    deviceNotice: "Saved on this device.",
    nothingToSave: "Nothing to save. Choose the asset and a quantity.",
    skipped: "Some rows were left out.",
    badQuantity: "Enter a quantity greater than zero.",
    emptyTitle: "No rows",
    emptyBody: "The photo had no positions.",
    favoritesCap: "You can keep up to 200 favorites.",
    saveFailed: "We could not save it on this device.",
    notConfigured: "The assistant is not configured yet.",
    rateLimited: "Too many photos. Wait a moment.",
    badImage: "The photo must be a JPG or PNG up to 4 MB.",
    badOrigin: "We could not accept this request.",
    upstream: "We could not read the photo. Try again.",
    emptyPhoto: "We did not see positions in the photo.",
    foundPhoto: "We found {count}. Review them before saving.",
    foundCapped: "Showing the first {count}. Review them before saving.",
  },
};

export function importarText(language: "es-CL" | "en"): ImportarMessages {
  return language === "en" ? importarCopy.en : importarCopy.esCL;
}

export function fillImport(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{([a-zA-Z0-9]+)\}/g, (match, key: string) => {
    const value = vars[key];
    return value === undefined ? match : String(value);
  });
}
