/**
 * Slugs canónicos y alias de «Copiar carteras».
 *
 * Sólo se publican slugs canónicos (13F siempre `*-13f`); un alias nunca se
 * guarda ni se copia: la ficha redirige 308 al canónico. Los demos ocultos que
 * apuntan a familias excluidas (políticos, menciones, Cramer) devuelven `null`
 * para que la ruta responda 404.
 *
 * Módulo sin `server-only`: lo usan server components y utilidades de UI.
 */

/** Alias conocido → slug canónico. */
const ALIASES: Readonly<Record<string, string>> = {
  "berkshire-hathaway": "berkshire-hathaway-13f",
  "scion-asset-management": "scion-13f",
  "pershing-square": "pershing-square-13f",
  "appaloosa-lp": "appaloosa-13f",
  "tiger-global": "tiger-global-13f",
  "coatue-management": "coatue-13f",
  "duquesne-family-office": "duquesne-13f",
  "tci-fund": "tci-13f",
  "pif-saudi": "pif-13f",
  "softbank-vision": "softbank-13f",
  "mubadala-sovereign": "mubadala-13f",
  "renaissance-institutional": "renaissance-13f",
  "bridgewater-all-weather": "bridgewater-13f",
  "afp-multifondos": "afp-modelo-acciones-cl",
  "afp-consenso-chile": "afp-modelo-acciones-cl",
};

/** Slugs canónicos de 13F que se exportan (el feed sólo trae estos). */
const CANONICAL_13F: readonly string[] = [
  "berkshire-hathaway-13f",
  "scion-13f",
  "pershing-square-13f",
  "appaloosa-13f",
  "tiger-global-13f",
  "coatue-13f",
  "duquesne-13f",
  "third-point-13f",
  "baupost-13f",
  "viking-global-13f",
  "tci-13f",
  "pif-13f",
  "cevian-13f",
  "egerton-13f",
  "softbank-13f",
  "sb-advisers-13f",
  "mubadala-13f",
  "lansdowne-13f",
  "renaissance-13f",
  "bridgewater-13f",
  "soros-13f",
  "dme-greenlight-13f",
  "ako-13f",
  "hhlr-13f",
  "temasek-13f",
  "norges-bank-13f",
  "snb-13f",
  "gates-foundation-13f",
  "icahn-13f",
];

/** ETFs de emisor canónicos. */
const CANONICAL_ETF: readonly string[] = [
  "arkk",
  "arkg",
  "arkw",
  "arkq",
  "arkf",
  "copx",
  "lit",
  "bug",
  "hero",
  "ech",
  "eww",
  "ewz",
  "ibit",
  "smh",
];

/** Corredoras chilenas (sólo para mirar; la composición es abierta en el muro). */
const CANONICAL_BROKER_CL: readonly string[] = [
  "renta4-moderada",
  "renta4-moderada-ampliada",
  "btg-cartera-recomendada",
  "bice-acciones-destacadas",
  "mbi-acciones-recomendadas",
  "consenso-corredoras-cl",
];

/** AFP y temáticas: sólo para mirar. El feed decide si existen. */
const CANONICAL_OTHER: readonly string[] = [
  "afp-modelo-acciones-cl",
  "radar-ia",
  "ai-world-war",
];

const HIDDEN_DEMO_SLUGS: readonly string[] = [
  "elon-doge-tracker",
  "trump-truth-signals",
  "inverse-cramer",
];

/** Destinos de esos demos: familias excluidas, así que tampoco existen. */
const EXCLUDED_SLUGS: readonly string[] = ["musk-dice", "trump-dice", "inverse-cramer-real"];

export const CANONICAL_SLUGS: readonly string[] = [
  ...CANONICAL_13F,
  ...CANONICAL_ETF,
  ...CANONICAL_BROKER_CL,
  ...CANONICAL_OTHER,
];

export const PORTFOLIO_ALIASES: Readonly<Record<string, string>> = ALIASES;

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_SLUG_LENGTH = 120;

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function isKnown(list: readonly string[], slug: string): boolean {
  return list.includes(slug);
}

/** Lectura segura: `constructor` y otras claves heredadas no son alias. */
function aliasFor(slug: string): string | null {
  if (!Object.prototype.hasOwnProperty.call(ALIASES, slug)) return null;
  const canonical = ALIASES[slug];
  return typeof canonical === "string" ? canonical : null;
}

/**
 * Devuelve el slug canónico de un slug o alias, o `null` si la ruta debe 404.
 * Un slug canónico desconocido pasa tal cual: la existencia la decide el feed.
 */
export function canonicalSlug(slugOrAlias: string | null | undefined): string | null {
  if (typeof slugOrAlias !== "string") return null;
  const slug = normalize(slugOrAlias);
  if (!slug || slug.length > MAX_SLUG_LENGTH) return null;
  if (!SLUG_PATTERN.test(slug)) return null;
  if (isKnown(HIDDEN_DEMO_SLUGS, slug) || isKnown(EXCLUDED_SLUGS, slug)) return null;
  return aliasFor(slug) ?? slug;
}

/** `true` sólo para los alias de respaldo (los demos ocultos no son alias). */
export function isAlias(slug: string | null | undefined): boolean {
  if (typeof slug !== "string") return false;
  const value = normalize(slug);
  if (!value) return false;
  return Object.prototype.hasOwnProperty.call(ALIASES, value);
}
