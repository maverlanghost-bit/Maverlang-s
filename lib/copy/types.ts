/**
 * «Copiar carteras», con tecnología de Fraccion.si.
 *
 * Tipos y constantes compartidos entre el servidor y la UI. Este módulo no
 * importa `server-only`: lo consumen también componentes de cliente (sólo
 * tipos y valores planos). Nunca contiene datos reales ni promesas.
 */

/** Familias que Maverlang muestra en V1. */
export type CopyFamily = "13f" | "etf" | "broker_cl" | "afp" | "thematic";

/** Familias copiables en V1 (decisión de Manu: 13F y ETFs). */
export type CopyableFamily = "13f" | "etf";

/** Familias que el feed puede traer y Maverlang descarta por completo. */
export type ExcludedFamily = "political_us" | "signal";

export const COPY_FAMILIES: readonly CopyFamily[] = ["13f", "etf", "broker_cl", "afp", "thematic"];
export const COPYABLE_FAMILIES: readonly CopyFamily[] = ["13f", "etf"];
export const EXCLUDED_FAMILIES: readonly ExcludedFamily[] = ["political_us", "signal"];

export function isCopyFamily(value: string): value is CopyFamily {
  return COPY_FAMILIES.includes(value as CopyFamily);
}

export function isCopyableFamily(family: CopyFamily): family is CopyableFamily {
  return COPYABLE_FAMILIES.includes(family);
}

/** Calidad del dato que declara Fraccion.si. `other` = valor nuevo, sin interpretar. */
export type CopyCoverage =
  | "full_13f"
  | "top50_of_full_book"
  | "issuer_etf"
  | "broker_recommendation"
  | "equal_weight_trades"
  | "editorial_model"
  | "simulated_mention"
  | "other";

/** Sólo estas verificaciones entran al feed; `pending` se descarta. */
export type CopyVerification = "official_filing" | "human_reviewed" | "editorial_model";

export type CopySide = "long" | "short";

/** Pista de producto del índice: `informational` = sólo mirar. */
export type CopyCopyableHint = "copy" | "informational";

export type CopyPosition = {
  symbol: string;
  name: string;
  /** Peso 0–100 sobre el libro que declare `coverage` (no sobre el recorte). */
  weight: number;
  previousWeight: number | null;
  side: CopySide;
  currency: string;
  /** YYYY-MM-DD */
  asOf: string;
};

export type CopyMovement = {
  type: string;
  symbol: string;
  txDate: string | null;
  publishedAt: string | null;
  lagDays: number | null;
  weightFrom: number | null;
  weightTo: number | null;
  sourceUrl: string | null;
  verification: CopyVerification;
};

export type CopyPortfolioMeta = {
  slug: string;
  aliases: string[];
  name: string;
  family: CopyFamily;
  source: string;
  manager: string;
  country: string;
  /** Fecha del dato (YYYY-MM-DD). Distinta de filedAt/publishedAt. */
  asOf: string;
  filedAt: string | null;
  publishedAt: string | null;
  lagDays: number | null;
  lagNote: string;
  isEstimated: boolean;
  isComplete: boolean;
  isFrozen: boolean;
  coverage: CopyCoverage;
  verification: CopyVerification;
  license: string;
  attribution: string;
  sourceUrl: string | null;
};

/** Detalle validado de un portafolio del feed. */
export type CopyPortfolio = {
  versionId: string;
  generatedAt: string;
  portfolio: CopyPortfolioMeta;
  positions: CopyPosition[];
  movements: CopyMovement[];
  disclaimer: string;
  example: boolean;
};

export type CopyTopHolding = {
  symbol: string;
  name: string;
  weight: number;
};

/** Entrada del índice firmado (metadatos; la composición va en el detalle). */
export type CopyIndexEntry = {
  slug: string;
  aliases: string[];
  name: string;
  family: CopyFamily;
  source: string;
  manager: string;
  country: string;
  asOf: string;
  filedAt: string | null;
  generatedAt: string | null;
  versionId: string;
  coverage: CopyCoverage;
  isFrozen: boolean;
  isEstimated: boolean;
  isComplete: boolean;
  copyableHint: CopyCopyableHint;
  detailPath: string;
  detailSha256: string;
  positionsCount: number | null;
  top10: CopyTopHolding[];
};

/**
 * Frescura del feed.
 * - `fresh`: menos de 36 h y pipeline `ok`.
 * - `stale`: 36 h a 7 días, o pipeline `parcial`. Se avisa y se puede copiar.
 * - `expired`: más de 7 días. La información se ve; copiar se apaga.
 * - `invalid`: la firma no valida. La información se ve; copiar se apaga.
 * - `none`: nunca hubo feed (o no está configurado).
 */
export type FeedHealthState = "fresh" | "stale" | "expired" | "none" | "invalid";

/**
 * `source` agrega `"none"` al contrato original para el caso «nunca hubo feed»:
 * `snapshot` siempre significa que hay una copia guardada.
 */
export type FeedHealth = {
  state: FeedHealthState;
  generatedAt: string | null;
  status: "ok" | "parcial" | null;
  source: "remote" | "snapshot" | "fixtures" | "none";
};

/** Etiqueta de la caché de datos de Next y del ping de Fraccion.si. */
export const COPY_FEED_TAG = "fraccion-feed";
