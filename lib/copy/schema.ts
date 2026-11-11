import { z } from "zod";

import {
  isCopyFamily,
  type CopyCoverage,
  type CopyFamily,
  type CopyIndexEntry,
  type CopyPortfolio,
  type CopyPosition,
  type CopyVerification,
} from "./types";

/**
 * Validación del feed privado de Fraccion.si.
 *
 * Reglas duras:
 * - pesos 0–100 y suma 99,5–100,5, salvo `top50_of_full_book` (que exige
 *   `positions.length <= 50` e `is_complete = false` y sí permite sumar menos);
 * - se descartan las familias no permitidas; v1 no trae cortos ni filas
 *   `pending` (Fraccion las omite en el origen);
 * - un detalle con `performance` se rechaza: el gráfico se calcula con
 *   precios de Maverlang.
 */

export type FeedPayloadReason =
  | "invalid_payload"
  | "invalid_signature"
  | "example_not_allowed"
  | "family_not_allowed"
  | "verification_pending"
  | "weights_out_of_range"
  | "top50_shape"
  | "slug_mismatch";

export class FeedPayloadError extends Error {
  readonly reason: FeedPayloadReason;

  constructor(reason: FeedPayloadReason, message: string) {
    super(message);
    this.name = "FeedPayloadError";
    this.reason = reason;
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const HEX_64 = /^[0-9a-f]{64}$/i;
const VERSION_ID = /^v[0-9]+:[0-9a-f]{64}$/i;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HTTPS_URL = /^https:\/\/[^\s<>"]+$/i;

const MIN_WEIGHT_SUM = 99.5;
const MAX_WEIGHT_SUM = 100.5;
const TOP50_LIMIT = 50;

function isRealDate(value: string): boolean {
  const time = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(time)) return false;
  return new Date(time).toISOString().slice(0, 10) === value;
}

const slugSchema = z.string().trim().min(1).max(120).regex(SLUG, "Slug inválido");
const isoDateSchema = z
  .string()
  .trim()
  .regex(ISO_DATE, "Fecha YYYY-MM-DD")
  .refine(isRealDate, "Fecha inexistente");
const isoDateTimeSchema = z
  .string()
  .trim()
  .min(10)
  .max(40)
  .refine((value) => Number.isFinite(Date.parse(value)), "Fecha ISO inválida");
const hex64Schema = z.string().trim().regex(HEX_64, "sha256 inválido");
const versionIdSchema = z.string().trim().regex(VERSION_ID, "version_id inválido");
const weightSchema = z.number().min(0).max(100);

/**
 * Contrato FINAL del feed de Faro (`docs/FRACCION_FEED_FORMATO.md`, 10-nov-2026):
 * `fraccion.feed.index.v1`, `fraccion.feed.detail.v1` y `fraccion.feed.status.v1`.
 * El detalle es plano (sin `portfolio` anidado), sin `performance`, sin
 * movimientos ni `side`: v1 solo exporta largos de 13F y ETFs, sin filas
 * pendientes. Maverlang acepta además, como superconjunto, familias «solo
 * mirar» (`broker_cl`, `afp`, `thematic`) para cuando Fraccion las agregue;
 * hoy solo llegan por fixtures de desarrollo.
 */
export const FEED_INDEX_SCHEMA = "fraccion.feed.index.v1";
export const FEED_DETAIL_SCHEMA = "fraccion.feed.detail.v1";
export const FEED_STATUS_SCHEMA = "fraccion.feed.status.v1";

const familySchema = z.string().trim().min(1).max(40);
const coverageSchema = z.string().trim().min(1).max(60);
const copyableHintSchema = z.enum(["lagged_disclosure", "informational"]);

const feedPositionSchema = z.object({
  symbol: z.string().trim().min(1).max(40),
  name: z.string().trim().max(240),
  weight: weightSchema,
  currency: z.string().trim().min(1).max(8).default("USD"),
  asset_class: z.string().trim().max(40).optional(),
});

const feedDetailSchema = z.object({
  example: z.boolean().default(false),
  schema: z.literal(FEED_DETAIL_SCHEMA),
  slug: slugSchema,
  aliases: z.array(z.string().trim().min(1).max(120)).max(40).default([]),
  name: z.string().trim().min(1).max(240),
  manager: z.string().trim().max(240).nullish(),
  family: familySchema,
  source: z.string().trim().max(80).nullish(),
  country: z.string().trim().max(80).nullish(),
  as_of: isoDateSchema.nullable(),
  filed_at: isoDateSchema.nullable(),
  generated_at: isoDateTimeSchema,
  version_id: versionIdSchema,
  coverage: coverageSchema,
  is_frozen: z.boolean(),
  is_complete: z.boolean(),
  copyable_hint: copyableHintSchema,
  lag_note: z.string().trim().max(1200).nullish(),
  license: z.string().trim().max(400).nullish(),
  attribution: z.string().trim().max(600).nullish(),
  source_url: z.string().trim().max(2048).nullish(),
  position_count: z.number().int().min(0).max(10000),
  skipped_pending: z.number().int().min(0).optional(),
  positions: z.array(feedPositionSchema).min(1).max(3000),
  /** Solo para fixtures de familias «solo mirar»; el feed v1 no lo trae. */
  verification: z.string().trim().min(1).max(40).optional(),
  /** v1 no lo trae; si un día llega, se valida como texto (nunca HTML). */
  disclaimer: z.string().trim().max(4000).optional(),
});

const feedIndexEntrySchema = z.object({
  slug: slugSchema,
  aliases: z.array(z.string().trim().min(1).max(120)).max(40).default([]),
  name: z.string().trim().min(1).max(240),
  family: familySchema,
  as_of: isoDateSchema.nullable(),
  filed_at: isoDateSchema.nullable(),
  version_id: versionIdSchema,
  coverage: coverageSchema,
  is_frozen: z.boolean(),
  is_complete: z.boolean(),
  copyable_hint: copyableHintSchema,
  detail_path: z.string().trim().min(1).max(300).regex(/^portfolios\/.+\.json$/, "detail_path inválido"),
  detail_sha256: hex64Schema,
  /** Campos opcionales de Maverlang (fixtures); el feed v1 no los trae. */
  manager: z.string().trim().max(240).nullish(),
  source: z.string().trim().max(80).nullish(),
  country: z.string().trim().max(80).nullish(),
});

const feedIndexSchema = z.object({
  example: z.boolean().default(false),
  schema: z.literal(FEED_INDEX_SCHEMA),
  generated_at: isoDateTimeSchema,
  key_id: z.string().trim().min(1).max(120),
  families: z.array(familySchema).min(1).max(10),
  portfolio_count: z.number().int().min(0).max(5000),
  /**
   * Las entradas se validan una por una: una fila mala se descarta y no tumba
   * el índice completo (el índice firmado sigue siendo la fuente de verdad).
   */
  portfolios: z.array(z.unknown()).max(500),
  aliases: z.record(z.string().trim().min(1).max(120), z.string().trim().min(1).max(120)),
  signature: z.object({
    alg: z.string().trim().min(1).max(20),
    key_id: z.string().trim().min(1).max(120),
    sig: z.string().trim().min(1).max(4096),
  }),
});

const feedStatusSchema = z.object({
  example: z.boolean().default(false),
  schema: z.literal(FEED_STATUS_SCHEMA),
  generated_at: isoDateTimeSchema,
  status: z.enum(["ok", "partial", "empty"]),
  exported: z.number().int().min(0).max(10000),
  skipped: z
    .array(z.object({ slug: z.string().trim().max(120), reason: z.string().trim().max(60) }))
    .max(500)
    .default([]),
  families: z.array(familySchema).max(10).default([]),
  key_id: z.string().trim().min(1).max(120),
  index_sha256: hex64Schema,
  index_path: z.literal("index.json"),
});

type FeedIndexEntryInput = z.infer<typeof feedIndexEntrySchema>;
type FeedPositionInput = z.infer<typeof feedPositionSchema>;

export type ParseFeedOptions = {
  /** Producción: cualquier `example: true` que venga del feed remoto se rechaza. */
  rejectExample?: boolean;
};

export type ParsedFeedIndex = {
  entries: CopyIndexEntry[];
  generatedAt: string;
  /** v1 no trae estado en el índice: lo da `status.json`. */
  status: "ok" | "parcial" | null;
  example: boolean;
  keyId: string;
  /** Mapa alias → canónico del índice (D40). */
  aliases: Record<string, string>;
};

export type ParsedFeedStatus = {
  generatedAt: string;
  /** `partial` y `empty` de Fraccion se tratan como «parcial» (aviso ámbar). */
  status: "ok" | "parcial" | null;
  rawStatus: "ok" | "partial" | "empty";
  failedStages: string[];
  keyId: string;
  indexSha256: string;
};

const COVERAGES: readonly CopyCoverage[] = [
  "full_13f",
  "top50_of_full_book",
  "issuer_etf",
  "broker_recommendation",
  "equal_weight_trades",
  "editorial_model",
  "simulated_mention",
];

const VERIFICATIONS: readonly CopyVerification[] = [
  "official_filing",
  "human_reviewed",
  "editorial_model",
];

function summarizeIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 3)
    .map((issue) => `${issue.path.map(String).join(".") || "(raíz)"}: ${issue.message}`)
    .join("; ");
}

function roundWeight(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeFamily(value: string): CopyFamily | null {
  const family = value.trim().toLowerCase();
  return isCopyFamily(family) ? family : null;
}

function normalizeVerification(value: string | undefined): CopyVerification | null {
  if (value === undefined) return null;
  const verification = value.trim().toLowerCase();
  return VERIFICATIONS.includes(verification as CopyVerification)
    ? (verification as CopyVerification)
    : null;
}

function normalizeCoverage(value: string | undefined): CopyCoverage {
  const coverage = (value ?? "").trim().toLowerCase();
  return COVERAGES.includes(coverage as CopyCoverage) ? (coverage as CopyCoverage) : "other";
}

function normalizeStatus(value: string | undefined): "ok" | "parcial" | null {
  const status = (value ?? "").trim().toLowerCase();
  if (status === "ok") return "ok";
  if (status === "partial" || status === "parcial" || status === "empty") return "parcial";
  return null;
}

/** `lagged_disclosure` = se puede intentar copiar; `informational` = solo mirar. */
function normalizeHint(value: "lagged_disclosure" | "informational", isFrozen: boolean): CopyIndexEntry["copyableHint"] {
  if (isFrozen || value === "informational") return "informational";
  return "copy";
}

/** Verificación implícita en v1: Fraccion no exporta filas `pending`. */
function defaultVerification(raw: string | undefined): CopyVerification | null {
  if (raw === undefined) return "official_filing";
  return normalizeVerification(raw);
}

/** Ruta relativa dentro del host del feed: sin esquema, sin `..`, sin absolutas. */
export function isRelativeFeedPath(value: string): boolean {
  const path = value.trim();
  if (!path || path.length > 300) return false;
  if (path.startsWith("/") || path.startsWith("\\")) return false;
  if (path.includes("\\") || path.includes("://")) return false;
  return !path.split("/").includes("..");
}

function normalizeIndexEntry(entry: FeedIndexEntryInput): CopyIndexEntry | null {
  const family = normalizeFamily(entry.family);
  if (!family) return null;
  if (!entry.as_of) return null;
  if (!isRelativeFeedPath(entry.detail_path)) return null;

  return {
    slug: entry.slug,
    aliases: entry.aliases,
    name: entry.name,
    family,
    source: entry.source ?? "",
    manager: entry.manager ?? "",
    country: entry.country ?? "",
    asOf: entry.as_of,
    filedAt: entry.filed_at ?? null,
    generatedAt: null,
    versionId: entry.version_id,
    coverage: normalizeCoverage(entry.coverage),
    isFrozen: entry.is_frozen,
    isEstimated: false,
    isComplete: entry.is_complete,
    copyableHint: normalizeHint(entry.copyable_hint, entry.is_frozen),
    detailPath: entry.detail_path,
    detailSha256: entry.detail_sha256.toLowerCase(),
    positionsCount: null,
    // v1 no trae top 10 en el índice: la composición vive solo en el detalle.
    top10: [],
  };
}

function normalizePosition(position: FeedPositionInput, asOf: string): CopyPosition {
  return {
    symbol: position.symbol,
    name: position.name || position.symbol,
    weight: roundWeight(position.weight),
    // v1 no exporta el peso anterior: los cambios se calculan contra la
    // versión copiada (`copy_follows`), no contra el feed.
    previousWeight: null,
    // v1 solo exporta largos (sin cortos).
    side: "long",
    currency: position.currency.toUpperCase(),
    asOf,
  };
}

/** Valida el índice firmado (v1) y descarta las entradas que no corresponden a V1. */
export function parseFeedIndex(raw: unknown, options: ParseFeedOptions = {}): ParsedFeedIndex {
  const parsed = feedIndexSchema.safeParse(raw);
  if (!parsed.success) {
    throw new FeedPayloadError("invalid_payload", `Índice del feed inválido: ${summarizeIssues(parsed.error)}`);
  }
  const value = parsed.data;
  if (options.rejectExample === true && value.example) {
    throw new FeedPayloadError(
      "example_not_allowed",
      "El feed remoto trae datos de ejemplo (example: true)",
    );
  }
  if (value.signature.key_id !== value.key_id) {
    throw new FeedPayloadError("invalid_signature", "key_id del índice y de la firma no coinciden");
  }

  const entries: CopyIndexEntry[] = [];
  const seen = new Set<string>();
  for (const rawEntry of value.portfolios) {
    const parsedEntry = feedIndexEntrySchema.safeParse(rawEntry);
    if (!parsedEntry.success) continue;
    const normalized = normalizeIndexEntry(parsedEntry.data);
    if (!normalized || seen.has(normalized.slug)) continue;
    seen.add(normalized.slug);
    entries.push(normalized);
  }

  // Alias del índice: solo hacia canónicos presentes; nunca un alias propio.
  const aliases: Record<string, string> = {};
  for (const [alias, target] of Object.entries(value.aliases)) {
    if (SLUG.test(alias) && seen.has(target) && !seen.has(alias)) aliases[alias] = target;
  }

  return {
    entries,
    generatedAt: value.generated_at,
    status: null,
    example: value.example,
    keyId: value.key_id,
    aliases,
  };
}

/** Valida el detalle (v1) de un portafolio y aplica las reglas de pesos y de V1. */
export function parseFeedDetail(
  raw: unknown,
  expectedSlug: string,
  options: ParseFeedOptions = {},
): CopyPortfolio {
  if (raw && typeof raw === "object" && "performance" in (raw as Record<string, unknown>)) {
    throw new FeedPayloadError("invalid_payload", "El detalle v1 no puede traer performance");
  }
  const parsed = feedDetailSchema.safeParse(raw);
  if (!parsed.success) {
    throw new FeedPayloadError("invalid_payload", `Detalle del feed inválido: ${summarizeIssues(parsed.error)}`);
  }
  const value = parsed.data;
  if (options.rejectExample === true && value.example) {
    throw new FeedPayloadError(
      "example_not_allowed",
      "El detalle remoto trae datos de ejemplo (example: true)",
    );
  }
  if (value.slug !== expectedSlug) {
    throw new FeedPayloadError("slug_mismatch", `El detalle es de ${value.slug}, no de ${expectedSlug}`);
  }
  const family = normalizeFamily(value.family);
  if (!family) {
    throw new FeedPayloadError("family_not_allowed", `Familia no permitida: ${value.family}`);
  }
  const verification = defaultVerification(value.verification);
  if (!verification) {
    throw new FeedPayloadError("verification_pending", `Verificación no admitida: ${value.verification}`);
  }
  if (!value.as_of) {
    throw new FeedPayloadError("invalid_payload", "El detalle no trae as_of");
  }
  const asOf = value.as_of;
  const coverage = normalizeCoverage(value.coverage);

  const positions = value.positions.map((position) => normalizePosition(position, asOf));
  if (value.position_count !== positions.length) {
    throw new FeedPayloadError("invalid_payload", "position_count no coincide con las posiciones");
  }

  const totalWeight = roundWeight(positions.reduce((sum, position) => sum + position.weight, 0));
  if (coverage === "top50_of_full_book") {
    if (positions.length > TOP50_LIMIT || value.is_complete) {
      throw new FeedPayloadError(
        "top50_shape",
        "top50_of_full_book exige 50 posiciones o menos e is_complete = false",
      );
    }
    if (totalWeight > MAX_WEIGHT_SUM) {
      throw new FeedPayloadError("weights_out_of_range", `Los pesos suman ${totalWeight}`);
    }
  } else if (totalWeight < MIN_WEIGHT_SUM || totalWeight > MAX_WEIGHT_SUM) {
    throw new FeedPayloadError(
      "weights_out_of_range",
      `Los pesos suman ${totalWeight}; se espera entre ${MIN_WEIGHT_SUM} y ${MAX_WEIGHT_SUM}`,
    );
  }

  // Solo enlaces https (anti-SSRF/XSS): se muestran como texto/enlace, nunca se siguen.
  const sourceUrl = value.source_url && HTTPS_URL.test(value.source_url) ? value.source_url : null;

  return {
    versionId: value.version_id,
    generatedAt: value.generated_at,
    portfolio: {
      slug: value.slug,
      aliases: value.aliases,
      name: value.name,
      family,
      source: value.source ?? "",
      manager: value.manager ?? "",
      country: value.country ?? "",
      asOf,
      filedAt: value.filed_at ?? null,
      publishedAt: value.filed_at ?? null,
      lagDays: null,
      lagNote: value.lag_note ?? "",
      isEstimated: false,
      isComplete: value.is_complete,
      isFrozen: value.is_frozen,
      coverage,
      verification,
      license: value.license ?? "",
      attribution: value.attribution ?? "",
      sourceUrl,
    },
    positions,
    // v1 no exporta movimientos: «Mis copias» compara versiones con `diff.ts`.
    movements: [],
    disclaimer: value.disclaimer ?? "",
    example: value.example,
  };
}

/** Estado del pipeline (`status.json`). Un valor desconocido no se da por `ok`. */
export function parseFeedStatus(raw: unknown): ParsedFeedStatus {
  const parsed = feedStatusSchema.safeParse(raw);
  if (!parsed.success) {
    throw new FeedPayloadError("invalid_payload", `status.json inválido: ${summarizeIssues(parsed.error)}`);
  }
  return {
    generatedAt: parsed.data.generated_at,
    status: normalizeStatus(parsed.data.status),
    rawStatus: parsed.data.status,
    failedStages: parsed.data.skipped.map((item) => `${item.slug}:${item.reason}`),
    keyId: parsed.data.key_id,
    indexSha256: parsed.data.index_sha256.toLowerCase(),
  };
}
