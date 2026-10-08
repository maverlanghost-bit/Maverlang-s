import "server-only";

import { z } from "zod";

import { isOnrampModelSelectable, ONRAMP_MODELS, resolveOnrampModel } from "@/lib/onramp/model";
import { resolveCspMode } from "@/lib/security/csp";

/**
 * Env validado. Este módulo es sólo de servidor: `import "server-only"`.
 * El cliente sigue leyendo la marca y la URL en `config/site.ts`
 * (`NEXT_PUBLIC_*` inline). No importar `serverEnv` ni `publicEnv` desde componentes cliente.
 *
 * Entornos (M59): el modo estricto de producción se activa SÓLO con
 * `APP_ENV=production` explícito o con `SUPABASE_PROJECT_ENV=prod`; el de
 * preview, SÓLO con `APP_ENV=preview` explícito. `VERCEL_ENV` y `NODE_ENV`
 * son sólo etiquetas informativas y NUNCA activan el modo estricto
 * (`npm run build` siempre usa `NODE_ENV=production`). Sin esas variables
 * explícitas la app corre como demo pública/desarrollo: lo que falte de
 * producción sólo genera un `console.warn` (nombres, nunca valores).
 */

export type AppEnv = "production" | "preview" | "development" | "test";
export type StrictMode = "production" | "preview";
/** Fuente de variables: `process.env` o un registro alternativo (tests, checks). */
export type EnvSource = Record<string, string | undefined>;

const APP_ENVS = ["production", "preview", "development", "test"] as const;
const SUPABASE_PROJECT_ENVS = ["prod", "dev"] as const;

function cleanEnv(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  let text = value.replace(/\s+#.*$/, "").trim();
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    text = text.slice(1, -1).trim();
  }
  return text === "" ? undefined : text;
}

function optionalText() {
  return z.preprocess((value) => cleanEnv(value), z.string().optional());
}

function requiredText(fallback: string) {
  return z.preprocess((value) => cleanEnv(value) ?? fallback, z.string());
}

function intEnv(fallback: number, max = 100_000) {
  return z.preprocess(
    (value) => {
      const cleaned = cleanEnv(value);
      return cleaned === undefined ? fallback : cleaned;
    },
    z.coerce.number().int().nonnegative().max(max),
  );
}

function boolEnv(fallback: boolean) {
  return z.preprocess((value) => {
    const cleaned = cleanEnv(value);
    if (cleaned === undefined) return fallback;
    const normalized = cleaned.toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "yes") return true;
    if (normalized === "false" || normalized === "0" || normalized === "no") return false;
    return cleaned;
  }, z.boolean());
}

function enumEnv<const T extends readonly [string, ...string[]]>(options: T, fallback: T[number]) {
  return z.preprocess((value) => {
    const cleaned = cleanEnv(value);
    return cleaned === undefined ? fallback : cleaned;
  }, z.enum(options));
}

function urlEnv(fallback: string) {
  return z.preprocess(
    (value) => {
      const cleaned = cleanEnv(value);
      return cleaned === undefined ? fallback : cleaned;
    },
    z.string().refine((value) => {
      try {
        const url = new URL(value);
        return url.protocol === "http:" || url.protocol === "https:";
      } catch {
        return false;
      }
    }, "URL inválida"),
  );
}

function countryListEnv(fallback: string[]) {
  return z.preprocess(
    (value) => {
      const cleaned = cleanEnv(value);
      if (cleaned === undefined) return fallback;
      return cleaned
        .split(",")
        .map((part) => part.trim().toUpperCase())
        .filter((part) => part.length > 0);
    },
    z.array(z.string().length(2)).min(1),
  );
}

const dataModeEnv = () => enumEnv(["mock", "live"] as const, "mock");

/** Valor inválido o vacío → mock, para que el proceso no se caiga al arrancar. El modo efectivo está en `authMode()`. */
function authFlagEnv() {
  return z.preprocess((value) => {
    const cleaned = cleanEnv(value)?.toLowerCase();
    return cleaned === "supabase" ? "supabase" : "mock";
  }, z.enum(["mock", "supabase"] as const));
}

/** `SUPABASE_SECRET_KEY`, o el nombre viejo `SUPABASE_SERVICE_ROLE_KEY` si el nuevo no está. */
function supabaseSecretEnv(source: EnvSource) {
  return z.preprocess((value) => {
    const primary = cleanEnv(value);
    if (primary) return primary;
    return cleanEnv(source.SUPABASE_SERVICE_ROLE_KEY);
  }, z.string().optional());
}

/**
 * Logos de empresas en la UI (M45). `on` (default, visibles como hoy) |
 * `off` (monogramas). Cualquier otro valor o ausencia cae a `on`: nunca
 * rompe el arranque por una variable mal escrita.
 */
function companyLogosEnv() {
  return z.preprocess((value) => {
    const cleaned = cleanEnv(value)?.toLowerCase();
    return cleaned === "off" ? "off" : "on";
  }, z.enum(["on", "off"] as const));
}

/**
 * `APP_ENV` explícito (M59). Sólo vale si es uno de los cuatro conocidos;
 * cualquier otro valor o la ausencia se parsea como `undefined` (el modo
 * efectivo lo resuelve `resolveAppEnv`). Nunca rompe el arranque.
 */
function appEnvField() {
  return z.preprocess((value) => {
    const cleaned = cleanEnv(value)?.toLowerCase();
    return (APP_ENVS as readonly string[]).includes(cleaned ?? "") ? cleaned : undefined;
  }, z.enum(APP_ENVS).optional());
}

/** Proyecto Supabase al que apunta este despliegue: `dev` o `prod`. Otro valor o ausencia → `undefined`. */
function supabaseProjectEnvField() {
  return z.preprocess((value) => {
    const cleaned = cleanEnv(value)?.toLowerCase();
    return (SUPABASE_PROJECT_ENVS as readonly string[]).includes(cleaned ?? "") ? cleaned : undefined;
  }, z.enum(SUPABASE_PROJECT_ENVS).optional());
}

const publicSchema = z.object({
  NEXT_PUBLIC_DATA_MODE: dataModeEnv(),
  NEXT_PUBLIC_AUTH_MODE: authFlagEnv(),
  NEXT_PUBLIC_BRAND_NAME: requiredText("Maverlang Stocks"),
  NEXT_PUBLIC_SITE_URL: urlEnv("http://localhost:3000"),
  NEXT_PUBLIC_SUPPORT_EMAIL: requiredText(""),
  NEXT_PUBLIC_PRIVY_APP_ID: optionalText(),
  NEXT_PUBLIC_SOLANA_CLUSTER: enumEnv(["mainnet-beta", "devnet", "testnet"] as const, "mainnet-beta"),
  NEXT_PUBLIC_SOLANA_RPC_URL: optionalText(),
  NEXT_PUBLIC_SUPABASE_URL: optionalText(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: optionalText(),
  /** Logos de empresas visibles (`on`) o monogramas (`off`). Default `on`. */
  NEXT_PUBLIC_COMPANY_LOGOS: companyLogosEnv(),
});

function buildServerSchema(source: EnvSource) {
  return publicSchema.extend({
    DATA_MODE: dataModeEnv(),
    /** mock | supabase. El modo efectivo exige además URL y clave pública (`authMode`). */
    AUTH_MODE: authFlagEnv(),
    /**
     * Precio actual y dólar. Si la variable no existe, queda `mock` (tests y CI): no llama a Jupiter, al RPC ni a mindicador.
     * Con `live`, el historial de referencia se reescala al spot y el dólar sale de `FX_SOURCE_URL`.
     */
    PRICES_MODE: dataModeEnv(),
    PRIVY_APP_SECRET: optionalText(),
    SOLANA_RPC_URL: optionalText(),
    JUPITER_BASE_URL: urlEnv("https://api.jup.ag"),
    JUPITER_API_KEY: optionalText(),
    FEE_BPS: intEnv(0, 10_000),
    FEE_WALLET: optionalText(),
    PRICE_DEVIATION_MAX_BPS: intEnv(150, 10_000),
    DEFAULT_SLIPPAGE_BPS: intEnv(50, 10_000),
    SPONSOR_ENABLED: boolEnv(false),
    SUPABASE_SECRET_KEY: supabaseSecretEnv(source),
    ONRAMP_PROVIDER: enumEnv(["koywe", "onramper"] as const, "koywe"),
    /**
     * Modelo del on-ramp (M58). `widget` (default, widget directo de M80) |
     * `api` (comercio por API: cotización + deal con PAYIN a la cuenta de
     * Maverlang; descartado, sólo desarrollo — el adaptador queda para M75).
     * `api` con `NODE_ENV=production` hace fallar el arranque (refine abajo).
     */
    ONRAMP_MODEL: z.preprocess((value) => resolveOnrampModel(cleanEnv(value)), z.enum(ONRAMP_MODELS)),
    KOYWE_CLIENT_ID: optionalText(),
    KOYWE_SECRET: optionalText(),
    KOYWE_WEBHOOK_SECRET: optionalText(),
    ONRAMPER_API_KEY: optionalText(),
    FX_SOURCE_URL: urlEnv("https://mindicador.cl/api/dolar"),
    /** Respaldo público sin clave (open.er-api.com). Opcional; se usa si mindicador falla. */
    FX_FALLBACK_URL: urlEnv("https://open.er-api.com/v6/latest/USD"),
    GEO_BLOCKED_COUNTRIES: countryListEnv(["US"]),
    TERMS_VERSION: requiredText("2026-10-draft"),
    PRIVACY_VERSION: requiredText("2026-10-draft"),
    RISKS_VERSION: requiredText("2026-10-draft"),
    /**
     * Alcance del catálogo: `curated` (50 símbolos) o `all` (tabla Supabase completa).
     * Es el máximo permitido: con `curated`, los pedidos de `all` se ignoran.
     */
    CATALOG_SCOPE: enumEnv(["curated", "all"] as const, "curated"),
    /**
     * Horario real por acción (M39). `live` consulta xStocks (assets + system/status)
     * con timeout 2,5 s y cache 60 s por símbolo; si falla usa el catálogo y si no,
     * el mock. También se activa con `PRICES_MODE=live`. En mock/tests sigue el mock.
     */
    MARKET_STATUS_MODE: enumEnv(["mock", "live"] as const, "mock"),
    /**
     * Cabeceras de seguridad (M48). `enforce` | `report-only` | `off`.
     * Sin variable: `enforce` en producción, `report-only` en desarrollo.
     * Si la demo publicada se rompe por la CSP, poner `CSP_MODE=report-only`
     * en Vercel (Settings → Environment Variables) y redeployar, sin código.
     */
    CSP_MODE: z.preprocess(
      (value) => resolveCspMode(cleanEnv(value), source.NODE_ENV),
      z.enum(["enforce", "report-only", "off"] as const),
    ),
    /** Endpoint propio para informes de violación de CSP (opcional; M61 lo conecta a Sentry). */
    CSP_REPORT_URI: optionalText(),
    /**
     * Límite de solicitudes (M49). Upstash en producción (global entre
     * instancias), memoria en local o tests. `auto` (default) usa Upstash
     * si hay URL y token, y si no, memoria con un aviso en producción.
     */
    RATE_LIMIT_BACKEND: enumEnv(["memory", "upstash", "auto"] as const, "auto"),
    /** Redis de Upstash (gratis, global). Sólo servidor, sin valores en el repo. */
    UPSTASH_REDIS_REST_URL: optionalText(),
    UPSTASH_REDIS_REST_TOKEN: optionalText(),
    /**
     * Techo bajo para la búsqueda, sólo en desarrollo (M49): `RATE_LIMIT_TEST_SEARCH=5`
     * hace que la sexta búsqueda en 1 min dé 429. En producción se ignora.
     */
    RATE_LIMIT_TEST_SEARCH: z.preprocess((value) => {
      const cleaned = cleanEnv(value);
      if (cleaned === undefined) return undefined;
      const parsed = Number(cleaned);
      return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
    }, z.number().int().positive().optional()),
    /**
     * Dinero real (M46). Default `false`: las rutas de dinero real responden
     * 503 `REAL_DISABLED` sin tocar servicios externos; la demo sigue igual.
     * Sólo `true` explícito la enciende (M74 la cablea).
     */
    REAL_TRADING_READY: boolEnv(false),
    /**
     * Token de los crons internos (M46; la ruta de sync llega en M50).
     * Se compara en tiempo constante (`requireCronSecret`). Sólo servidor.
     */
    CRON_SECRET: optionalText(),
    /** Clave de Sentry para subir sourcemaps (M61). Sólo servidor, nunca `NEXT_PUBLIC_*`. */
    SENTRY_AUTH_TOKEN: optionalText(),
    /** Clave de Resend para correos (M51). Sólo servidor. */
    RESEND_API_KEY: optionalText(),
    /** Clave del RPC privado (Helius/Triton). Sólo servidor. */
    HELIUS_API_KEY: optionalText(),
    /**
     * Entorno explícito (M59). `production` activa el modo estricto (falla el
     * build/arranque si falta algo); `preview`, el estricto de preview;
     * `development`/`test` son lenientes. Ausente o inválido → `undefined`
     * (el modo efectivo lo resuelve `resolveAppEnv`). `APP_ENV=production`
     * se agrega en Vercel recién en M60, nunca antes.
     */
    APP_ENV: appEnvField(),
    /**
     * Proyecto Supabase al que apunta este despliegue (M59): `dev` o `prod`.
     * `prod` activa el modo estricto de producción aunque no haya `APP_ENV`.
     * Preview exige `dev` (un preview nunca toca la base de producción).
     */
    SUPABASE_PROJECT_ENV: supabaseProjectEnvField(),
    /**
     * URL del proyecto Supabase de producción (M59). Sólo existe en
     * producción: si `SUPABASE_PROJECT_ENV=prod`, la URL pública debe
     * coincidir con esta (detecta si alguien pegó la URL de desarrollo).
     */
    SUPABASE_PROD_URL_EXPECTED: optionalText(),
    /**
     * Etiqueta que pone Vercel (`production` | `preview` | `development`).
     * Sólo informativa (avisos): NUNCA activa el modo estricto.
     */
    VERCEL_ENV: optionalText(),
  }).superRefine((env, ctx) => {
    /**
     * Guardias de producción (M58): el modelo `api` del on-ramp (descartado)
     * no se puede elegir con `NODE_ENV=production`. Con el default (`widget`)
     * o fuera de producción no cambia nada.
     */
    if (!isOnrampModelSelectable(env.ONRAMP_MODEL, source.NODE_ENV)) {
      ctx.addIssue({
        code: "custom",
        message: "ONRAMP_MODEL=api está descartado: en producción sólo vale widget (M80, modelo directo).",
      });
    }
  });
}

// `serverSchema` queda como const (además del builder con fuente) para el
// chequeo estático de `tests/unit/no-secrets-in-client.test.ts`, que ubica
// el bloque público entre `const publicSchema` y `const serverSchema`.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const serverSchema = buildServerSchema(process.env);

export type PublicEnv = z.infer<typeof publicSchema>;
export type ServerEnv = z.infer<typeof serverSchema>;
export type DataMode = ServerEnv["DATA_MODE"];

function parseServerEnv(source: EnvSource): ServerEnv {
  return buildServerSchema(source).parse(source);
}

/**
 * Modo efectivo (M59). Gana el `APP_ENV` explícito si es válido; si no,
 * `test` con `NODE_ENV=test` y `development` en el resto (incluido
 * `NODE_ENV=production` sin `APP_ENV`: la demo pública). `VERCEL_ENV`
 * nunca decide: es sólo una etiqueta informativa.
 */
export function resolveAppEnv(source: EnvSource = process.env): AppEnv {
  const raw = source.APP_ENV;
  const cleaned = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if ((APP_ENVS as readonly string[]).includes(cleaned)) return cleaned as AppEnv;
  return source.NODE_ENV === "test" ? "test" : "development";
}

/**
 * Modo estricto (M59): `preview` sólo con `APP_ENV=preview` explícito;
 * `production` con `APP_ENV=production` explícito o con
 * `SUPABASE_PROJECT_ENV=prod`. Todo lo demás (incluido
 * `VERCEL_ENV=production` o `NODE_ENV=production` solos) es `null`
 * (demo pública/desarrollo: avisos, nunca error).
 */
export function resolveStrictMode(
  env: Pick<ServerEnv, "APP_ENV" | "SUPABASE_PROJECT_ENV">,
): StrictMode | null {
  if (env.APP_ENV === "preview") return "preview";
  if (env.APP_ENV === "production" || env.SUPABASE_PROJECT_ENV === "prod") return "production";
  return null;
}

function isHttpsUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function isHttpUrl(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

function normalizeUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function baseStrictGaps(env: ServerEnv): string[] {
  const gaps: string[] = [];
  if (env.AUTH_MODE !== "supabase") gaps.push("AUTH_MODE");
  if (env.NEXT_PUBLIC_AUTH_MODE !== "supabase") gaps.push("NEXT_PUBLIC_AUTH_MODE");
  if (env.PRICES_MODE !== "live") gaps.push("PRICES_MODE");
  if (env.MARKET_STATUS_MODE !== "live") gaps.push("MARKET_STATUS_MODE");
  if (!isHttpsUrl(env.NEXT_PUBLIC_SITE_URL)) gaps.push("NEXT_PUBLIC_SITE_URL");
  if (!isHttpUrl(env.NEXT_PUBLIC_SUPABASE_URL)) gaps.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) gaps.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  if (!env.SUPABASE_SECRET_KEY) gaps.push("SUPABASE_SECRET_KEY");
  if (!env.CRON_SECRET || env.CRON_SECRET.length < 32) gaps.push("CRON_SECRET");
  if (!env.JUPITER_API_KEY) gaps.push("JUPITER_API_KEY");
  if (!env.GEO_BLOCKED_COUNTRIES.includes("US")) gaps.push("GEO_BLOCKED_COUNTRIES");
  if (env.CATALOG_SCOPE === "all") gaps.push("CATALOG_SCOPE");
  // DATA_MODE=live sólo si REAL_TRADING_READY=true (lo enciende M90);
  // hasta entonces la cuenta Real sigue en "Próximamente" con DATA_MODE=mock.
  if (env.DATA_MODE === "live" && env.REAL_TRADING_READY !== true) gaps.push("DATA_MODE");
  return gaps;
}

/** Nombres (nunca valores) de lo que le falta al env para producción estricta. */
export function productionGaps(env: ServerEnv): string[] {
  const gaps = baseStrictGaps(env);
  if (env.SUPABASE_PROJECT_ENV !== "prod") {
    gaps.push("SUPABASE_PROJECT_ENV");
  } else {
    const expected = env.SUPABASE_PROD_URL_EXPECTED?.trim();
    if (!expected) {
      gaps.push("SUPABASE_PROD_URL_EXPECTED");
    } else if (
      !env.NEXT_PUBLIC_SUPABASE_URL ||
      normalizeUrl(env.NEXT_PUBLIC_SUPABASE_URL) !== normalizeUrl(expected)
    ) {
      if (!gaps.includes("NEXT_PUBLIC_SUPABASE_URL")) gaps.push("NEXT_PUBLIC_SUPABASE_URL");
    }
  }
  return gaps;
}

/** Nombres (nunca valores) de lo que le falta al env para preview estricta. */
export function previewGaps(env: ServerEnv): string[] {
  const gaps = baseStrictGaps(env);
  // Un preview nunca toca la base de producción (M59).
  if (env.SUPABASE_PROJECT_ENV !== "dev") gaps.push("SUPABASE_PROJECT_ENV");
  if (env.REAL_TRADING_READY !== false) gaps.push("REAL_TRADING_READY");
  return gaps;
}

let warnedGapsKey: string | null = null;

/** Aviso único (nombres, nunca valores) cuando en modo leniente faltan variables de producción. */
function warnProductionGaps(env: ServerEnv, vercelEnv: string | undefined): void {
  const gaps = productionGaps(env);
  if (gaps.length === 0) return;
  const key = gaps.join(",");
  if (warnedGapsKey === key) return;
  warnedGapsKey = key;
  const label = vercelEnv?.trim() ? ` (VERCEL_ENV=${vercelEnv.trim()})` : "";
  console.warn(
    `[env] Aviso${label}: faltan variables de producción: ${gaps.join(", ")}. La app sigue en modo demo/desarrollo.`,
  );
}

/** Reinicia el aviso único (sólo tests). */
export function resetEnvWarningsForTests(): void {
  warnedGapsKey = null;
}

/**
 * Valida el entorno del servidor (M59). En modo estricto con faltantes
 * hace `throw` con los nombres (nunca los valores); en modo leniente sólo
 * avisa una vez por `console.warn`. La llama `instrumentation.ts` al
 * arrancar; el `import` de este módulo ya aplica la misma regla, así un
 * `next build` con `APP_ENV=production` incompleto también falla.
 */
export function assertServerEnv(source: EnvSource = process.env): {
  mode: AppEnv | StrictMode;
  strict: boolean;
} {
  const parsed = parseServerEnv(source);
  const strict = resolveStrictMode(parsed);
  if (strict === "production") {
    const gaps = productionGaps(parsed);
    if (gaps.length > 0) {
      throw new Error(`[env] Faltan variables para production: ${gaps.join(", ")}`);
    }
    return { mode: strict, strict: true };
  }
  if (strict === "preview") {
    const gaps = previewGaps(parsed);
    if (gaps.length > 0) {
      throw new Error(`[env] Faltan variables para preview: ${gaps.join(", ")}`);
    }
    return { mode: strict, strict: true };
  }
  warnProductionGaps(parsed, source.VERCEL_ENV);
  return { mode: resolveAppEnv(source), strict: false };
}

export const publicEnv: PublicEnv = publicSchema.parse(process.env);
export const serverEnv: ServerEnv = parseServerEnv(process.env);
/** Etiqueta del entorno efectivo (informativa; no activa el modo estricto). */
export const appEnv: AppEnv = resolveAppEnv(process.env);

const strictAtBoot = resolveStrictMode(serverEnv);
if (strictAtBoot === "production") {
  const gaps = productionGaps(serverEnv);
  if (gaps.length > 0) {
    throw new Error(`[env] Faltan variables para production: ${gaps.join(", ")}`);
  }
} else if (strictAtBoot === "preview") {
  const gaps = previewGaps(serverEnv);
  if (gaps.length > 0) {
    throw new Error(`[env] Faltan variables para preview: ${gaps.join(", ")}`);
  }
} else {
  warnProductionGaps(serverEnv, process.env.VERCEL_ENV);
}
