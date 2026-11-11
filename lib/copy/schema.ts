import { z } from "zod";

import {
  isCopyFamily,
  type CopyCoverage,
  type CopyFamily,
  type CopyIndexEntry,
  type CopyMovement,
  type CopyPortfolio,
  type CopyPosition,
  type CopySide,
  type CopyTopHolding,
  type CopyVerification,
} from "./types";

/**
 * Validación del feed privado de Fraccion.si.
 *
 * Reglas duras:
 * - pesos 0–100 y suma 99,5–100,5, salvo `top50_of_full_book` (que exige
 *   `positions.length <= 50` e `is_complete = false` y sí permite sumar menos);
 * - se descartan las filas con `side = short`, las familias no permitidas y
 *   todo lo que venga con `verification = pending` (o desconocida);
 * - `performance[]` no se lee: el gráfico se calcula con precios de Maverlang.
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
const HTTP_URL = /^https?:\/\/[^\s]+$/i;

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
const httpUrlSchema = z.string().trim().max(2048).regex(HTTP_URL, "URL inválida");
const weightSchema = z.number().min(0).max(100);
const lagDaysSchema = z.number().int().min(0).max(3650);

const feedPositionSchema = z.object({
  symbol: z.string().trim().min(1).max(40),
  name: z.string().trim().min(1).max(240),
  weight: weightSchema,
  previous_weight: weightSchema.nullish(),
  side: z.string().trim().min(1).max(12).optional(),
  currency: z.string().trim().min(1).max(8).default("USD"),
  as_of: isoDateSchema.optional(),
});

const feedMovementSchema = z.object({
  type: z.string().trim().min(1).max(40),
  symbol: z.string().trim().min(1).max(40),
  tx_date: isoDateSchema.nullish(),
  published_at: isoDateSchema.nullish(),
  lag_days: lagDaysSchema.nullish(),
  weight_from: weightSchema.nullish(),
  weight_to: weightSchema.nullish(),
  source_url: httpUrlSchema.nullish(),
  verification: z.string().trim().min(1).max(40).optional(),
});

const feedPortfolioMetaSchema = z.object({
  slug: slugSchema,
  aliases: z.array(z.string().trim().min(1).max(120)).max(40).default([]),
  name: z.string().trim().min(1).max(240),
  family: z.string().trim().min(1).max(40),
  source: z.string().trim().min(1).max(80).default("unknown"),
  manager: z.string().trim().max(240).default(""),
  country: z.string().trim().max(80).default(""),
  as_of: isoDateSchema,
  filed_at: isoDateSchema.nullish(),
  published_at: isoDateSchema.nullish(),
  lag_days: lagDaysSchema.nullish(),
  lag_note: z.string().trim().max(1200).default(""),
  is_estimated: z.boolean().default(false),
  is_complete: z.boolean().default(true),
  is_frozen: z.boolean().default(false),
  coverage: z.string().trim().min(1).max(60).optional(),
  verification: z.string().trim().min(1).max(40),
  license: z.string().trim().max(400).default(""),
  attribution: z.string().trim().max(600).default(""),
  source_url: httpUrlSchema.nullish(),
});

const feedDetailSchema = z.object({
  example: z.boolean().default(false),
  provider: z.string().trim().max(60).optional(),
  legend: z.string().trim().max(120).optional(),
  generated_at: isoDateTimeSchema,
  version_id: versionIdSchema,
  portfolio: feedPortfolioMetaSchema,
  positions: z.array(feedPositionSchema).min(1).max(3000),
  movements: z.array(feedMovementSchema).max(500).default([]),
  disclaimer: z.string().trim().max(4000).default(""),
});

const feedTopHoldingSchema = z.object({
  symbol: z.string().trim().min(1).max(40),
  name: z.string().trim().max(240).default(""),
  weight: weightSchema,
});

const feedIndexEntrySchema = z.object({
  slug: slugSchema,
  aliases: z.array(z.string().trim().min(1).max(120)).max(40).default([]),
  name: z.string().trim().min(1).max(240),
  family: z.string().trim().min(1).max(40),
  source: z.string().trim().min(1).max(80).default("unknown"),
  manager: z.string().trim().max(240).default(""),
  country: z.string().trim().max(80).default(""),
  as_of: isoDateSchema,
  filed_at: isoDateSchema.nullish(),
  generated_at: isoDateTimeSchema.optional(),
  version_id: versionIdSchema,
  coverage: z.string().trim().min(1).max(60).optional(),
  is_frozen: z.boolean().default(false),
  is_estimated: z.boolean().default(false),
  is_complete: z.boolean().default(true),
  copyable_hint: z.string().trim().min(1).max(24).optional(),
  detail_path: z.string().trim().min(1).max(300),
  detail_sha256: hex64Schema,
  positions_count: z.number().int().min(0).max(10000).optional(),
  top10: z.array(feedTopHoldingSchema).max(10).default([]),
  verification: z.string().trim().min(1).max(40).optional(),
});

const feedIndexSchema = z.object({
  example: z.boolean().default(false),
  provider: z.string().trim().max(60).optional(),
  legend: z.string().trim().max(120).optional(),
  generated_at: isoDateTimeSchema,
  status: z.string().trim().min(1).max(20).optional(),
  schema_version: z.number().int().min(1).max(99).optional(),
  signature: z
    .object({
      alg: z.string().trim().min(1).max(20),
      key_id: z.string().trim().max(120).optional(),
      sig: z.string().trim().min(1).max(4096),
    })
    .optional(),
  /**
   * Las entradas se validan una por una: una fila mala se descarta y no tumba
   * el índice completo (el índice firmado sigue siendo la fuente de verdad).
   */
  portfolios: z.array(z.unknown()).max(500).default([]),
});

const feedStatusSchema = z.object({
  example: z.boolean().default(false),
  provider: z.string().trim().max(60).optional(),
  generated_at: isoDateTimeSchema,
  status: z.string().trim().min(1).max(20),
  pipeline_started_at: isoDateTimeSchema.nullish(),
  pipeline_finished_at: isoDateTimeSchema.nullish(),
  failed_stages: z.array(z.string().trim().max(60)).max(50).default([]),
  exported_count: z.number().int().min(0).max(10000).optional(),
  skipped: z
    .array(
      z.object({
        slug: z.string().trim().max(120),
        reason: z.string().trim().max(300).default(""),
      }),
    )
    .max(200)
    .default([]),
});

type FeedIndexEntryInput = z.infer<typeof feedIndexEntrySchema>;
type FeedPositionInput = z.infer<typeof feedPositionSchema>;
type FeedMovementInput = z.infer<typeof feedMovementSchema>;

export type ParseFeedOptions = {
  /** Producción: cualquier `example: true` que venga del feed remoto se rechaza. */
  rejectExample?: boolean;
};

export type ParsedFeedIndex = {
  entries: CopyIndexEntry[];
  generatedAt: string;
  status: "ok" | "parcial" | null;
  example: boolean;
};

export type ParsedFeedStatus = {
  generatedAt: string;
  status: "ok" | "parcial" | null;
  failedStages: string[];
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

function normalizeSide(value: string | undefined): CopySide | null {
  const side = (value ?? "long").trim().toLowerCase();
  if (side === "long") return "long";
  if (side === "short") return "short";
  return null;
}

function normalizeStatus(value: string | undefined): "ok" | "parcial" | null {
  const status = (value ?? "").trim().toLowerCase();
  if (status === "ok") return "ok";
  if (status === "parcial") return "parcial";
  return null;
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
  if (entry.verification !== undefined && normalizeVerification(entry.verification) === null) {
    return null;
  }
  if (!isRelativeFeedPath(entry.detail_path)) return null;

  const hint = (entry.copyable_hint ?? "").trim().toLowerCase() === "informational" ? "informational" : "copy";
  const top10: CopyTopHolding[] = entry.top10.slice(0, 10).map((holding) => ({
    symbol: holding.symbol,
    name: holding.name,
    weight: roundWeight(holding.weight),
  }));

  return {
    slug: entry.slug,
    aliases: entry.aliases,
    name: entry.name,
    family,
    source: entry.source,
    manager: entry.manager,
    country: entry.country,
    asOf: entry.as_of,
    filedAt: entry.filed_at ?? null,
    generatedAt: entry.generated_at ?? null,
    versionId: entry.version_id,
    coverage: normalizeCoverage(entry.coverage),
    isFrozen: entry.is_frozen,
    isEstimated: entry.is_estimated,
    isComplete: entry.is_complete,
    copyableHint: entry.is_frozen ? "informational" : hint,
    detailPath: entry.detail_path,
    detailSha256: entry.detail_sha256.toLowerCase(),
    positionsCount: entry.positions_count ?? null,
    top10,
  };
}

function normalizePosition(position: FeedPositionInput, fallbackAsOf: string): CopyPosition | null {
  const side = normalizeSide(position.side);
  if (side !== "long") return null;
  return {
    symbol: position.symbol,
    name: position.name,
    weight: roundWeight(position.weight),
    previousWeight: position.previous_weight == null ? null : roundWeight(position.previous_weight),
    side,
    currency: position.currency.toUpperCase(),
    asOf: position.as_of ?? fallbackAsOf,
  };
}

function normalizeMovement(
  movement: FeedMovementInput,
  portfolioVerification: CopyVerification,
): CopyMovement | null {
  const verification =
    movement.verification === undefined
      ? portfolioVerification
      : normalizeVerification(movement.verification);
  if (!verification) return null;
  return {
    type: movement.type,
    symbol: movement.symbol,
    txDate: movement.tx_date ?? null,
    publishedAt: movement.published_at ?? null,
    lagDays: movement.lag_days ?? null,
    weightFrom: movement.weight_from == null ? null : roundWeight(movement.weight_from),
    weightTo: movement.weight_to == null ? null : roundWeight(movement.weight_to),
    sourceUrl: movement.source_url ?? null,
    verification,
  };
}

/** Valida el índice firmado y descarta las entradas que no corresponden a V1. */
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

  return {
    entries,
    generatedAt: value.generated_at,
    status: normalizeStatus(value.status),
    example: value.example,
  };
}

/** Valida el detalle de un portafolio y aplica las reglas de pesos y de V1. */
export function parseFeedDetail(
  raw: unknown,
  expectedSlug: string,
  options: ParseFeedOptions = {},
): CopyPortfolio {
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

  const meta = value.portfolio;
  if (meta.slug !== expectedSlug) {
    throw new FeedPayloadError("slug_mismatch", `El detalle es de ${meta.slug}, no de ${expectedSlug}`);
  }
  const family = normalizeFamily(meta.family);
  if (!family) {
    throw new FeedPayloadError("family_not_allowed", `Familia no permitida: ${meta.family}`);
  }
  const verification = normalizeVerification(meta.verification);
  if (!verification) {
    throw new FeedPayloadError(
      "verification_pending",
      `Verificación no admitida: ${meta.verification}`,
    );
  }
  const coverage = normalizeCoverage(meta.coverage);

  const positions: CopyPosition[] = [];
  for (const position of value.positions) {
    const normalized = normalizePosition(position, meta.as_of);
    if (normalized) positions.push(normalized);
  }
  if (positions.length === 0) {
    throw new FeedPayloadError("weights_out_of_range", "El portafolio no tiene posiciones largas");
  }

  const totalWeight = roundWeight(positions.reduce((sum, position) => sum + position.weight, 0));
  if (coverage === "top50_of_full_book") {
    if (positions.length > TOP50_LIMIT || meta.is_complete) {
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

  const movements: CopyMovement[] = [];
  for (const movement of value.movements) {
    const normalized = normalizeMovement(movement, verification);
    if (normalized) movements.push(normalized);
  }

  return {
    versionId: value.version_id,
    generatedAt: value.generated_at,
    portfolio: {
      slug: meta.slug,
      aliases: meta.aliases,
      name: meta.name,
      family,
      source: meta.source,
      manager: meta.manager,
      country: meta.country,
      asOf: meta.as_of,
      filedAt: meta.filed_at ?? null,
      publishedAt: meta.published_at ?? null,
      lagDays: meta.lag_days ?? null,
      lagNote: meta.lag_note,
      isEstimated: meta.is_estimated,
      isComplete: meta.is_complete,
      isFrozen: meta.is_frozen,
      coverage,
      verification,
      license: meta.license,
      attribution: meta.attribution,
      sourceUrl: meta.source_url ?? null,
    },
    positions,
    movements,
    disclaimer: value.disclaimer,
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
    failedStages: parsed.data.failed_stages,
  };
}
