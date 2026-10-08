import { z } from "zod";

import { MAX_ORDER_USD } from "@/config/trade";
import { API_ERROR_STATUS, DomainError, isApiErrorCode } from "@/lib/api/result";
import { CATALOG_SYMBOL } from "@/lib/catalog/symbol";
import type { ApiErrorCode } from "@/lib/types";

/**
 * Schemas de request/response de ARQUITECTURA §2.4.
 * Los tipos de dominio viven en `lib/types`. Aquí se validan en el borde HTTP.
 */

const apiErrorCodes = Object.keys(API_ERROR_STATUS) as [ApiErrorCode, ...ApiErrorCode[]];

export const apiErrorCodeSchema = z.enum(apiErrorCodes);

export const symbolSchema = z.string().trim().min(1);
/** Símbolo del catálogo en la entrada: xStocks (`AAPLx`) u Ondo (`ABNBon`). */
export const tradableSymbolSchema = z
  .string()
  .trim()
  .regex(CATALOG_SYMBOL, "Símbolo inválido.");
export const rangeSchema = z.enum(["1W", "1M", "3M", "1Y", "ALL"]);
export const sideSchema = z.enum(["buy", "sell"]);
export const currencySchema = z.enum(["CLP", "USD"]);
export const languageSchema = z.enum(["es-CL", "en"]);
export const orderStatusSchema = z.enum(["pending", "submitted", "confirmed", "failed", "expired"]);
export const activityKindSchema = z.enum([
  "buy",
  "sell",
  "deposit",
  "withdraw",
  "send",
  "receive",
  "onramp",
]);
export const categorySchema = z.enum([
  "tech",
  "etf",
  "fintech",
  "consumer",
  "finance",
  "health",
  "energy",
  "industrial",
  "commodity",
  "other",
]);
export const onrampProviderSchema = z.enum(["koywe", "onramper"]);
export const amountCurrencySchema = z.enum(["USDC", "SHARES", "CLP"]);

const isoTimeSchema = z.string().min(1);
const rawAmountSchema = z.string().regex(/^\d+$/);

export const tickerSchema = z.object({
  symbol: symbolSchema,
  underlying: z.string().min(1),
  name: z.string().min(1),
  mint: z.string().min(32),
  decimals: z.literal(8),
  issuer: z.union([z.literal("Backed (xStocks)"), z.literal("Ondo")]),
  category: categorySchema,
  logo: z.string().min(1),
  enabled: z.boolean(),
});

export const quoteSchema = z.object({
  symbol: symbolSchema,
  priceUsd: z.number().nonnegative(),
  change24hPct: z.number(),
  multiplier: z.number().positive(),
  updatedAt: isoTimeSchema,
  source: z.enum(["jupiter", "mock"]),
  reference: z.boolean().optional(),
  /** true cuando el precio es el último guardado tras un 429 o un error (M38). */
  stale: z.boolean().optional(),
  /** Precio del subyacente y liquidez del pozo (N15, sólo live). */
  marketPriceUsd: z.number().positive().optional(),
  liquidityUsd: z.number().nonnegative().optional(),
});

export const pricePointSchema = z.object({
  t: z.number().int().nonnegative(),
  p: z.number().nonnegative(),
});

export const fxRateSchema = z.object({
  pair: z.literal("USDCLP"),
  rate: z.number().positive(),
  source: z.string().min(1),
  updatedAt: isoTimeSchema,
});

export const marketStatusSchema = z.object({
  underlyingOpen: z.boolean(),
  session: z.enum(["regular", "offHours", "closed"]),
  nextChange: isoTimeSchema,
  note: z.string().optional(),
});

/** Horario real por acción (M39). `nextChangeAt` null si xStocks no lo trae. */
export const assetStatusSchema = z.object({
  mode: z.enum(["TwentyFourFive", "MarketHours", "Regular", "unknown"]),
  period: z.enum(["market", "extended", "overnight", "closed", "unknown"]),
  openNow: z.boolean(),
  nextChangeAt: isoTimeSchema.nullable(),
  halted: z.boolean(),
  minOrderUsd: z.number().nonnegative().nullable(),
  maxOrderUsd: z.number().nonnegative().nullable(),
  source: z.enum(["live", "catalog", "mock"]),
  updatedAt: isoTimeSchema,
  /** Señal de seguridad del catálogo (M54c-fix, opcional): la cartera avisa y el detalle abre la venta. */
  safetyStatus: z.enum(["listed", "watch", "hidden", "unknown"]).optional(),
  tradable: z.boolean().optional(),
  underReview: z.boolean().optional(),
});

export const marketStatusQuerySchema = z
  .object({
    symbol: tradableSymbolSchema.optional(),
  })
  .strict();

export const balanceSchema = z.object({
  mint: z.string().min(1),
  symbol: z.string().min(1),
  rawAmount: rawAmountSchema,
  uiAmount: z.number().nonnegative(),
  valueUsd: z.number().nonnegative(),
});

export const positionSchema = z.object({
  symbol: symbolSchema,
  shares: z.number().nonnegative(),
  multiplier: z.number().positive(),
  avgCostUsd: z.number().nonnegative().nullable(),
  priceUsd: z.number().nonnegative(),
  valueUsd: z.number().nonnegative(),
  pnlUsd: z.number().nullable(),
  pnlPct: z.number().nullable(),
  allocationPct: z.number(),
});

export const portfolioSchema = z.object({
  address: z.string().min(1),
  totalUsd: z.number().nonnegative(),
  cashUsdc: z.number().nonnegative(),
  positions: z.array(positionSchema),
  pnlUsd: z.number().nullable(),
  pnlPct: z.number().nullable(),
  updatedAt: isoTimeSchema,
});

export const costBreakdownSchema = z.object({
  platformFeeUsd: z.number().nonnegative(),
  platformFeeBps: z.number().int().nonnegative(),
  networkFeeSol: z.number().nonnegative(),
  tokenAccountRentSol: z.number().nonnegative(),
  priceImpactPct: z.number(),
  slippageBps: z.number().int().nonnegative(),
});

export const tradeQuoteRequestSchema = z
  .object({
    side: sideSchema,
    symbol: tradableSymbolSchema,
    amount: z.number().finite().positive(),
    amountCurrency: amountCurrencySchema,
    userPublicKey: z.string().min(32).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    // Decimales: ≤ 2 en dólares (USDC/CLP) o ≤ 8 en acciones.
    const decimals = value.amount.toString().split(".")[1]?.length ?? 0;
    const maxDecimals = value.amountCurrency === "SHARES" ? 8 : 2;
    if (decimals > maxDecimals) {
      ctx.addIssue({ code: "custom", path: ["amount"], message: "Demasiados decimales." });
    }
    // Tope de la beta en dólares (M56; M74 lo pasa a la base). CLP y
    // acciones se topan en el servicio (conversión y precio).
    if (value.amountCurrency === "USDC" && value.amount > MAX_ORDER_USD) {
      ctx.addIssue({ code: "custom", path: ["amount"], message: "El monto supera el máximo." });
    }
  });

export const tradeQuoteSchema = z.object({
  id: z.string().min(1),
  side: sideSchema,
  symbol: symbolSchema,
  inAmountUi: z.number().nonnegative(),
  outAmountUi: z.number().nonnegative(),
  pricePerShareUsd: z.number().positive(),
  costs: costBreakdownSchema,
  priceDeviationBps: z.number().int().nonnegative(),
  expiresAt: isoTimeSchema,
  route: z.enum(["jupiter", "mock"]),
});

export const tradeBuildRequestSchema = z
  .object({
    quoteId: z.string().min(1),
    userPublicKey: z.string().min(32),
  })
  .strict();

export const tradeBuildResponseSchema = z.object({
  requestId: z.string().min(1),
  transactionBase64: z.string().min(1),
  expiresAt: isoTimeSchema,
});

export const tradeSubmitRequestSchema = z
  .object({
    requestId: z.string().min(1),
    signedTransactionBase64: z.string().min(1),
  })
  .strict();

export const tradeSubmitResponseSchema = z.object({
  orderId: z.string().min(1),
  signature: z.string().nullable(),
  status: orderStatusSchema,
});

export const orderSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  side: sideSchema,
  symbol: symbolSchema,
  inAmountUi: z.number().nonnegative(),
  outAmountUi: z.number().nonnegative(),
  feeBps: z.number().int().nonnegative(),
  status: orderStatusSchema,
  signature: z.string().nullable(),
  error: z.string().optional(),
  createdAt: isoTimeSchema,
});

export const activitySchema = z.object({
  id: z.string().min(1),
  kind: activityKindSchema,
  symbol: z.string().min(1),
  amountUi: z.number(),
  valueUsd: z.number().nullable(),
  status: orderStatusSchema,
  signature: z.string().nullable(),
  at: isoTimeSchema,
});

export const sendBuildRequestSchema = z
  .object({
    to: z.string().min(32),
    mint: z.string().min(32),
    amountUi: z.number().finite().positive(),
    userPublicKey: z.string().min(32),
  })
  .strict();

export const onrampSessionRequestSchema = z
  .object({
    amountClp: z.number().finite().positive(),
    provider: onrampProviderSchema.optional(),
    walletAddress: z.string().min(32),
  })
  .strict();

export const onrampSessionSchema = z.object({
  id: z.string().min(1),
  provider: onrampProviderSchema,
  mode: z.enum(["widget_url", "sdk"]),
  widgetUrl: z.string().min(1).optional(),
  sdkConfig: z.record(z.string(), z.unknown()).optional(),
  estimatedUsdc: z.number().nonnegative(),
  feeClp: z.number().nonnegative(),
  expiresAt: isoTimeSchema,
});

/** Cuerpo del proveedor. La firma viaja en headers; el adaptador live la verifica. */
export const onrampWebhookSchema = z.unknown();

export const onrampWebhookResponseSchema = z.object({
  ok: z.literal(true),
  estimatedUsdc: z.number().nonnegative().optional(),
  already: z.boolean().optional(),
});

export const userProfileSchema = z.object({
  id: z.string().min(1),
  email: z.string().nullable(),
  displayName: z.string().nullable(),
  country: z.string().nullable(),
  isUsPerson: z.boolean().nullable(),
  walletAddress: z.string().nullable(),
  onboardingCompleted: z.boolean(),
  language: languageSchema,
  displayCurrency: currencySchema,
  createdAt: isoTimeSchema,
  rut: z.string().nullable().default(null),
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .default(null),
  phone: z.string().nullable().default(null),
});

/** PATCH /api/me. No incluye id ni createdAt: los pone el servidor. */
export const profileUpdateSchema = z
  .object({
    email: z.string().trim().min(3).nullable().optional(),
    displayName: z.string().trim().min(1).max(80).nullable().optional(),
    country: z.string().trim().length(2).toUpperCase().nullable().optional(),
    isUsPerson: z.boolean().nullable().optional(),
    language: languageSchema.optional(),
    displayCurrency: currencySchema.optional(),
    onboardingCompleted: z.boolean().optional(),
    rut: z.string().trim().max(16).nullable().optional(),
    birthDate: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable()
      .optional(),
    phone: z.string().trim().max(20).nullable().optional(),
    // M75: declaración de no ser U.S. person. La versión la pone el servidor si falta.
    residenceCountry: z.string().trim().length(2).toUpperCase().nullable().optional(),
    nationalityCountry: z.string().trim().length(2).toUpperCase().nullable().optional(),
    usPersonDeclarationVersion: z.string().trim().min(1).max(64).optional(),
  })
  .strict();

export const consentRequestSchema = z
  .object({
    doc: z.enum(["terminos", "privacidad", "riesgos"]),
    version: z.string().min(1),
  })
  .strict();

export const consentSchema = z.object({
  userId: z.string().min(1),
  // M75: `us_person` lo escribe el trigger de 0015; el POST sigue en los tres docs.
  doc: z.enum(["terminos", "privacidad", "riesgos", "us_person"]),
  version: z.string().min(1),
  acceptedAt: isoTimeSchema,
});

export const consentsResponseSchema = z.array(consentSchema);

/** POST /api/me/deletion. Cuerpo vacío: la sesión identifica a la persona. */
export const deletionRequestSchema = z.object({}).strict();

export const deletionStatusSchema = z.object({
  requestedAt: isoTimeSchema.nullable(),
});

export const preferencesSchema = z
  .object({
    notifyOrders: z.boolean(),
    notifyDeposits: z.boolean(),
    notifyNews: z.boolean(),
    language: languageSchema,
    displayCurrency: currencySchema,
  })
  .strict();

/** GET/PUT /api/me/favorites. Símbolos saneados (mayúsculas, máx. 12) y tope por cuenta. */
export const favoritesRequestSchema = z
  .object({
    symbols: z.array(z.string().trim().min(1).max(12)).max(200),
  })
  .strict();

export const favoritesResponseSchema = z.array(z.string().trim().min(1).max(12)).max(200);

export const geoResponseSchema = z.object({
  country: z.string().min(2),
  blocked: z.boolean(),
});

export const pricesQuerySchema = z
  .object({
    symbols: z
      .string()
      .optional()
      .transform((value) =>
        (value ?? "")
          .split(",")
          .map((part) => part.trim())
          .filter((part) => part.length > 0),
      )
      .refine((list) => list.length <= 50, "Como máximo 50 símbolos por llamada.")
      .refine((list) => list.every((symbol) => CATALOG_SYMBOL.test(symbol)), {
        message: "Símbolo inválido.",
      }),
  })
  .strict();

export const historyParamsSchema = z
  .object({
    symbol: tradableSymbolSchema,
  })
  .strict();

export const historyQuerySchema = z
  .object({
    range: rangeSchema.default("1M"),
  })
  .strict();

export const tradeStatusQuerySchema = z
  .object({
    id: z.string().min(1),
  })
  .strict();

  /** Búsqueda del mercado (M38). `pageSize` máximo 50; `scope` lo topa CATALOG_SCOPE (M54: default `listed`). */
export const marketSearchCategorySchema = z.enum([
  "all",
  "tech",
  "etf",
  "fintech",
  "consumer",
  "finance",
  "health",
  "energy",
  "industrial",
  "commodity",
  "other",
]);

export const marketSearchSortSchema = z.enum(["liquidity", "name"]);
export const marketSearchScopeSchema = z.enum(["curated", "listed", "all"]);

export const marketSearchQuerySchema = z
  .object({
    q: z.string().trim().max(64).optional().default(""),
    category: marketSearchCategorySchema.optional().default("all"),
    page: z.coerce.number().int().min(1).max(1000).optional().default(1),
    pageSize: z.coerce.number().int().min(1).max(50).optional().default(20),
    sort: marketSearchSortSchema.optional().default("liquidity"),
    scope: marketSearchScopeSchema.optional().default("listed"),
  })
  .strict();

export const marketSearchItemSchema = z.object({
  symbol: symbolSchema,
  name: z.string().min(1),
  underlying: z.string().min(1),
  category: categorySchema,
  mint: z.string(),
  /** Ruta local (`/logos/…`) o null (monograma). Nunca hotlinking. */
  logoUrl: z.string().min(1).nullable(),
  enabled: z.boolean(),
  halted: z.boolean(),
  liquidityUsd: z.number().nullable(),
  /** true cuando la liquidez es menor a US$10.000. */
  lowLiquidity: z.boolean(),
  curated: z.boolean(),
  /** Punto de estado de la lista (M39, desde el catálogo, sin pedir la API por fila). */
  openNow: z.boolean().nullable().optional(),
  period: z.string().min(1).nullable().optional(),
  mode: z.string().min(1).nullable().optional(),
  nextChangeAt: z.string().min(1).nullable().optional(),
  /** true cuando el estado de seguridad permite operar (M54: sólo `listed`, con transición mientras no haya listados). */
  tradable: z.boolean(),
  /** true cuando está en `watch`: se muestra con el chip "En revisión" y no se puede operar. */
  underReview: z.boolean(),
});

export const marketSearchResponseSchema = z.object({
  items: z.array(marketSearchItemSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1).max(50),
  hasMore: z.boolean(),
});

export const apiErrorSchema = z.object({
  code: apiErrorCodeSchema,
  message: z.string(),
});

/** POST /api/demo/reset. Cuerpo vacío: la sesión identifica la cuenta. */
export const demoResetRequestSchema = z.object({}).strict();

/** POST /api/waitlist. La trampa `website` llena se responde 200 sin guardar. */
export const waitlistRequestSchema = z
  .object({
    email: z
      .string()
      .trim()
      .min(1, "Revisa el correo e inténtalo de nuevo.")
      .max(254, "Revisa el correo e inténtalo de nuevo.")
      .refine((value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), {
        message: "Revisa el correo e inténtalo de nuevo.",
      }),
    consent: z.boolean().refine((value) => value === true, {
      message: "Acepta que te contactemos para avisarte del lanzamiento.",
    }),
    website: z.string().max(1000).optional().default(""),
    source: z.enum(["landing", "cuenta_real"]).optional().default("landing"),
  })
  .strict();

export function apiResultSchema<T extends z.ZodType>(data: T) {
  return z.discriminatedUnion("ok", [
    z.object({ ok: z.literal(true), data }),
    z.object({ ok: z.literal(false), error: apiErrorSchema, requestId: z.string().optional() }),
  ]);
}

export const tickersResponseSchema = z.array(tickerSchema);
export const quotesResponseSchema = z.array(quoteSchema);
export const historyResponseSchema = z.array(pricePointSchema);
export const balancesResponseSchema = z.array(balanceSchema);
export const activityResponseSchema = z.array(activitySchema);

/** Catálogo §2.4. T07 engancha cada route handler aquí. */
export const apiContracts = {
  "GET /api/tickers": { response: tickersResponseSchema },
  "GET /api/market/search": { query: marketSearchQuerySchema, response: marketSearchResponseSchema },
  "GET /api/prices": { query: pricesQuerySchema, response: quotesResponseSchema },
  "GET /api/tickers/[symbol]/history": {
    params: historyParamsSchema,
    query: historyQuerySchema,
    response: historyResponseSchema,
  },
  "GET /api/fx/usdclp": { response: fxRateSchema },
  "GET /api/market/status": { query: marketStatusQuerySchema, response: marketStatusSchema },
  "POST /api/trade/quote": { body: tradeQuoteRequestSchema, response: tradeQuoteSchema },
  "POST /api/trade/build": { body: tradeBuildRequestSchema, response: tradeBuildResponseSchema },
  "POST /api/trade/submit": { body: tradeSubmitRequestSchema, response: tradeSubmitResponseSchema },
  "GET /api/trade/status": { query: tradeStatusQuerySchema, response: orderSchema },
  "GET /api/portfolio": { response: portfolioSchema },
  "GET /api/wallet/balances": { response: balancesResponseSchema },
  "GET /api/wallet/activity": { response: activityResponseSchema },
  "POST /api/wallet/send/build": { body: sendBuildRequestSchema, response: tradeBuildResponseSchema },
  "POST /api/onramp/session": { body: onrampSessionRequestSchema, response: onrampSessionSchema },
  "POST /api/onramp/webhook": { body: onrampWebhookSchema, response: onrampWebhookResponseSchema },
  "GET /api/me": { response: userProfileSchema },
  "PATCH /api/me": { body: profileUpdateSchema, response: userProfileSchema },
  "POST /api/me/consents": { body: consentRequestSchema, response: consentSchema },
  "GET /api/me/consents": { response: consentsResponseSchema },
  "GET /api/me/deletion": { response: deletionStatusSchema },
  "POST /api/me/deletion": { body: deletionRequestSchema, response: deletionStatusSchema },
  "GET /api/me/preferences": { response: preferencesSchema },
  "PUT /api/me/preferences": { body: preferencesSchema, response: preferencesSchema },
  "GET /api/me/favorites": { response: favoritesResponseSchema },
  "PUT /api/me/favorites": { body: favoritesRequestSchema, response: favoritesResponseSchema },
  "GET /api/geo": { response: geoResponseSchema },
  "POST /api/waitlist": { body: waitlistRequestSchema },
  "POST /api/demo/reset": { body: demoResetRequestSchema },
} as const;

export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;
export type ConsentRequest = z.infer<typeof consentRequestSchema>;
export type FavoritesRequest = z.infer<typeof favoritesRequestSchema>;
export type DeletionStatus = z.infer<typeof deletionStatusSchema>;
export type GeoStatus = z.infer<typeof geoResponseSchema>;

export function zodErrorMessage(error: z.ZodError): string {
  if (error.issues.length === 0) return "Los datos no son válidos.";
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
      return `${path}${issue.message}`;
    })
    .join("; ");
}

export function parseContract<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new DomainError("VALIDATION", zodErrorMessage(parsed.error));
  return parsed.data;
}

export function parseMockErrorCode(value: unknown): ApiErrorCode | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  if (!isApiErrorCode(value)) {
    throw new DomainError("VALIDATION", "mockError no es un código de error conocido.");
  }
  return value;
}
