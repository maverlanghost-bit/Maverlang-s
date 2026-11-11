import "server-only";

import { z } from "zod";

import { copyAccessResponseOf, requireCopyAccess } from "@/lib/copy/access";
import { COPY_FEATURE_DISABLED_MESSAGE } from "@/lib/copy/flags";

/**
 * Borde HTTP de `/api/copy/*` (S5): cuerpos, query, params, el payload firmado
 * del plan y las respuestas de error propias (402 `COPY_SUBSCRIPTION_REQUIRED`
 * y 403/404 `FEATURE_DISABLED`).
 *
 * Reglas que repiten todas las rutas:
 * - el cliente NUNCA manda pesos ni símbolos operables: salen del portafolio
 *   en caché (`lib/copy/feed.ts`) y del mapeo (`lib/copy/mapping.ts`);
 * - el único dato de confianza del carrito es `planId`, que viaja firmado;
 * - con la sección apagada no se sirve ni un metadato (404 sin datos).
 */

/** Familias del feed (S1). `COPYABLE_FAMILIES` decide cuáles se pueden copiar. */
export const copyFamilySchema = z.enum(["13f", "etf", "broker_cl", "afp", "thematic"]);

/** Cuenta con la que se paga la mezcla. `real` exige el doble candado de `flags.ts`. */
export const copyAccountSchema = z.enum(["demo", "real"]);

/** Máximo de carteras seguidas por usuario (§1.12). */
export const COPY_FOLLOW_MAX = 10;

/** Slug canónico del feed. Los alias se resuelven con `lib/copy/slugs.ts`. */
export const copySlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug inválido.");

/** GET /api/copy/portfolios?family=13f */
export const copyPortfoliosQuerySchema = z.object({ family: copyFamilySchema.optional() }).strict();

/** GET /api/copy/portfolios/[slug] */
export const copyPortfolioParamsSchema = z.object({ slug: copySlugSchema }).strict();

/** POST /api/copy/plan (§1.11): sólo el monto, la versión y la cuenta. */
export const copyPlanRequestSchema = z
  .object({
    slug: copySlugSchema,
    versionId: z.string().trim().min(1).max(128),
    totalUsd: z.number().finite().positive().max(1_000_000),
    account: copyAccountSchema,
    /** `true` (por defecto): lo no comprable se reparte, opción principal del carrito. */
    spreadUnavailable: z.boolean().optional().default(true),
  })
  .strict();

/** Una pierna del plan: la calcula el servidor, nunca llega del cliente. */
export const copyPlanLegSchema = z.object({
  symbol: z.string().trim().min(1).max(16),
  usd: z.number().finite().positive(),
  weightOriginal: z.number().min(0).max(100),
  weightMaverlang: z.number().min(0).max(100),
});

/**
 * Payload firmado por `lib/copy/plan-token.ts` (S2): es exactamente el
 * `CopyPlanPayloadInput` que se firma, más `planId`/`sub`/`iat`/`exp`, que se
 * ignoran al validar (el esquema no es estricto). Sin `unavailableUsd` ni
 * fechas ISO: el token usa `iat`/`exp` numéricos.
 */
export const copyPlanTokenPayloadSchema = z.object({
  slug: z.string().trim().min(1).max(64),
  versionId: z.string().trim().min(1).max(128),
  account: copyAccountSchema,
  totalUsd: z.number().finite().positive(),
  spreadUnavailable: z.boolean(),
  coveragePct: z.number().min(0).max(100),
  maxLegs: z.number().int().positive().max(25),
  warnings: z.array(z.string().max(500)).max(50).optional(),
  legs: z.array(copyPlanLegSchema).max(25),
});

export type CopyPlanTokenPayload = z.infer<typeof copyPlanTokenPayloadSchema>;

/** POST /api/copy/demo-mix: la mezcla ya armada, sin pesos del cliente. */
export const copyDemoMixRequestSchema = z
  .object({ planId: z.string().trim().min(20).max(8192) })
  .strict();

/** POST /api/copy/follow */
export const copyFollowRequestSchema = z
  .object({
    slug: copySlugSchema,
    account: copyAccountSchema.optional(),
    notify: z.boolean().optional(),
  })
  .strict();

/** DELETE /api/copy/follow?slug=… */
export const copyFollowDeleteQuerySchema = z.object({ slug: copySlugSchema }).strict();

/** Fila de `copy_follows` (0053) tal como la devuelve la API. */
export const copyFollowRowSchema = z.object({
  slug: z.string().min(1),
  versionId: z.string().min(1),
  /** Pesos originales usados al seguir, para el aviso «La cartera cambió». */
  weights: z.record(z.string(), z.number()).nullable(),
  account: copyAccountSchema,
  notify: z.boolean(),
  createdAt: z.string(),
});

export type CopyFollowRow = z.infer<typeof copyFollowRowSchema>;

export const copyFollowsResponseSchema = z.object({
  follows: z.array(copyFollowRowSchema),
  max: z.number().int().positive(),
  /** `false` si la tabla todavía no existe (migración 0053 sin aplicar). */
  available: z.boolean(),
});

/** `POST /api/copy/fraccion-pro`: sólo el comprobante firmado que emite Fraccion. */
export const copyFraccionProRequestSchema = z
  .object({ token: z.string().trim().min(16).max(4096) })
  .strict();

/** Código propio de estas rutas (§3 del encargo). */
export type CopyErrorCode = "FEATURE_DISABLED";

/** `{ok:false,error:{code,message}}`, sin caché compartida y sin detalle interno. */
export function copyErrorResponse(code: CopyErrorCode, message: string, status: number): Response {
  return Response.json(
    { ok: false, error: { code, message } },
    {
      status,
      headers: {
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    },
  );
}

/**
 * `FEATURE_DISABLED`: 404 cuando la sección está apagada (sin datos), 403
 * cuando la función existe pero esta cuenta o este dato no puede usarla, y 503
 * cuando falta configuración de servidor (el secreto del plan, la tabla).
 */
export function copyFeatureDisabled(
  message: string = COPY_FEATURE_DISABLED_MESSAGE,
  status: 403 | 404 | 503 = 404,
): Response {
  return copyErrorResponse("FEATURE_DISABLED", message, status);
}

/**
 * Paywall en el servidor (§1.10): `null` si hay acceso; si no, la 402
 * `COPY_SUBSCRIPTION_REQUIRED` ya armada. `write` (armar plan, mezcla demo,
 * seguir una cartera) rechaza `past_due`, que en la gracia solo puede leer.
 * Cualquier otro error se propaga: la ruta falla como siempre.
 */
export async function copyAccessDenied(
  userId: string,
  mode: "read" | "write" = "write",
): Promise<Response | null> {
  try {
    await requireCopyAccess(userId, mode);
    return null;
  } catch (error) {
    const response = copyAccessResponseOf(error);
    if (response) return response;
    throw error;
  }
}
