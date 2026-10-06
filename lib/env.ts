import "server-only";

import { z } from "zod";

/**
 * Env validado. Este módulo es sólo de servidor: `import "server-only"`.
 * El cliente sigue leyendo la marca y la URL en `config/site.ts`
 * (`NEXT_PUBLIC_*` inline). No importar `serverEnv` ni `publicEnv` desde componentes cliente.
 */

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
function supabaseSecretEnv() {
  return z.preprocess((value) => {
    const primary = cleanEnv(value);
    if (primary) return primary;
    return cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);
  }, z.string().optional());
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
});

const serverSchema = publicSchema.extend({
  DATA_MODE: dataModeEnv(),
  /** mock | supabase. El modo efectivo exige además URL y clave pública (`authMode`). */
  AUTH_MODE: authFlagEnv(),
  /** Precio actual. Si la variable no existe, queda `mock` (tests y CI): no llama a Jupiter ni al RPC. El historial no usa este flag. */
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
  SUPABASE_SECRET_KEY: supabaseSecretEnv(),
  ONRAMP_PROVIDER: enumEnv(["koywe", "onramper"] as const, "koywe"),
  KOYWE_CLIENT_ID: optionalText(),
  KOYWE_SECRET: optionalText(),
  KOYWE_WEBHOOK_SECRET: optionalText(),
  ONRAMPER_API_KEY: optionalText(),
  FX_SOURCE_URL: urlEnv("https://mindicador.cl/api/dolar"),
  GEO_BLOCKED_COUNTRIES: countryListEnv(["US"]),
  TERMS_VERSION: requiredText("2026-10-draft"),
  PRIVACY_VERSION: requiredText("2026-10-draft"),
  RISKS_VERSION: requiredText("2026-10-draft"),
});

export type PublicEnv = z.infer<typeof publicSchema>;
export type ServerEnv = z.infer<typeof serverSchema>;
export type DataMode = ServerEnv["DATA_MODE"];

export const publicEnv: PublicEnv = publicSchema.parse(process.env);
export const serverEnv: ServerEnv = serverSchema.parse(process.env);
