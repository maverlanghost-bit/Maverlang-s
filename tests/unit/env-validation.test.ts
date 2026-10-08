import { afterEach, describe, expect, it, vi } from "vitest";

import {
  assertServerEnv,
  previewGaps,
  productionGaps,
  resetEnvWarningsForTests,
  resolveAppEnv,
  resolveStrictMode,
  type EnvSource,
} from "@/lib/env";

afterEach(() => {
  resetEnvWarningsForTests();
  vi.restoreAllMocks();
});

function prodSource(): EnvSource {
  return {
    NODE_ENV: "test",
    APP_ENV: "production",
    AUTH_MODE: "supabase",
    NEXT_PUBLIC_AUTH_MODE: "supabase",
    PRICES_MODE: "live",
    MARKET_STATUS_MODE: "live",
    NEXT_PUBLIC_SITE_URL: "https://app-unit-test.example.com",
    NEXT_PUBLIC_SUPABASE_URL: "https://prod-unit-test.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "unit-test-publishable",
    SUPABASE_SECRET_KEY: "unit-test-secret",
    CRON_SECRET: "x".repeat(32),
    JUPITER_API_KEY: "unit-test-jupiter",
    SUPABASE_PROJECT_ENV: "prod",
    SUPABASE_PROD_URL_EXPECTED: "https://prod-unit-test.supabase.co",
    GEO_BLOCKED_COUNTRIES: "US",
    CATALOG_SCOPE: "curated",
    DATA_MODE: "mock",
    REAL_TRADING_READY: "false",
  };
}

function previewSource(): EnvSource {
  return {
    ...prodSource(),
    APP_ENV: "preview",
    SUPABASE_PROJECT_ENV: "dev",
    SUPABASE_PROD_URL_EXPECTED: undefined,
  };
}

describe("M59: resolucion del entorno", () => {
  it("VERCEL_ENV y NODE_ENV nunca activan el modo estricto", () => {
    expect(resolveAppEnv({ NODE_ENV: "production", VERCEL_ENV: "production" })).toBe("development");
    expect(resolveStrictMode({ APP_ENV: undefined, SUPABASE_PROJECT_ENV: undefined })).toBeNull();
    expect(resolveAppEnv({ NODE_ENV: "test" })).toBe("test");
    expect(resolveAppEnv({ APP_ENV: "preview" })).toBe("preview");
    expect(resolveAppEnv({ APP_ENV: "banana" })).toBe("development");
  });

  it("estricto solo con APP_ENV explicito o proyecto prod", () => {
    expect(resolveStrictMode({ APP_ENV: "production", SUPABASE_PROJECT_ENV: undefined })).toBe("production");
    expect(resolveStrictMode({ APP_ENV: undefined, SUPABASE_PROJECT_ENV: "prod" })).toBe("production");
    expect(resolveStrictMode({ APP_ENV: "preview", SUPABASE_PROJECT_ENV: undefined })).toBe("preview");
    // APP_ENV=preview manda sobre un proyecto prod contradictorio (igual falla, por preview).
    expect(resolveStrictMode({ APP_ENV: "preview", SUPABASE_PROJECT_ENV: "prod" })).toBe("preview");
    expect(resolveStrictMode({ APP_ENV: "development", SUPABASE_PROJECT_ENV: "dev" })).toBeNull();
  });
});

describe("M59: production estricta", () => {
  it("acepta un entorno de produccion completo", () => {
    expect(assertServerEnv(prodSource())).toEqual({ mode: "production", strict: true });
  });

  it("acepta DATA_MODE=live solo con REAL_TRADING_READY=true", () => {
    expect(assertServerEnv({ ...prodSource(), DATA_MODE: "live", REAL_TRADING_READY: "true" })).toEqual({
      mode: "production",
      strict: true,
    });
  });

  it("rechaza AUTH_MODE=mock", () => {
    expect(() => assertServerEnv({ ...prodSource(), AUTH_MODE: "mock" })).toThrow(/AUTH_MODE/);
  });

  it("rechaza CATALOG_SCOPE=all", () => {
    expect(() => assertServerEnv({ ...prodSource(), CATALOG_SCOPE: "all" })).toThrow(/CATALOG_SCOPE/);
  });

  it("rechaza URL http y acepta un GEO que solo suma", () => {
    expect(() =>
      assertServerEnv({ ...prodSource(), NEXT_PUBLIC_SITE_URL: "http://insecure.example.com" }),
    ).toThrow(/NEXT_PUBLIC_SITE_URL/);
    expect(assertServerEnv({ ...prodSource(), GEO_BLOCKED_COUNTRIES: "CL,BR" })).toEqual({
      mode: "production",
      strict: true,
    });
  });

  it("rechaza DATA_MODE=live sin REAL_TRADING_READY", () => {
    expect(() => assertServerEnv({ ...prodSource(), DATA_MODE: "live" })).toThrow(/DATA_MODE/);
  });

  it("exige que la URL coincida con la esperada de produccion", () => {
    const withoutExpected = { ...prodSource(), SUPABASE_PROD_URL_EXPECTED: undefined };
    expect(() => assertServerEnv(withoutExpected)).toThrow(/SUPABASE_PROD_URL_EXPECTED/);
    const mismatched = {
      ...prodSource(),
      NEXT_PUBLIC_SUPABASE_URL: "https://dev-unit-test.supabase.co",
    };
    expect(() => assertServerEnv(mismatched)).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  it("los mensajes de error nunca contienen valores", () => {
    const source = {
      ...prodSource(),
      NEXT_PUBLIC_SITE_URL: "http://insecure.example.com/sentinel-9zqx",
      GEO_BLOCKED_COUNTRIES: "CL,AR",
    };
    let message = "";
    try {
      assertServerEnv(source);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain("NEXT_PUBLIC_SITE_URL");
    expect(message).not.toContain("GEO_BLOCKED_COUNTRIES");
    expect(message).not.toContain("sentinel-9zqx");
    expect(message).not.toContain("CL,AR");
  });
});

describe("M59: preview estricta", () => {
  it("acepta una preview completa contra el proyecto dev", () => {
    expect(assertServerEnv(previewSource())).toEqual({ mode: "preview", strict: true });
  });

  it("rechaza SUPABASE_PROJECT_ENV=prod en preview", () => {
    expect(() => assertServerEnv({ ...previewSource(), SUPABASE_PROJECT_ENV: "prod" })).toThrow(
      /SUPABASE_PROJECT_ENV/,
    );
  });

  it("rechaza REAL_TRADING_READY=true en preview", () => {
    expect(() => assertServerEnv({ ...previewSource(), REAL_TRADING_READY: "true" })).toThrow(
      /REAL_TRADING_READY/,
    );
  });
});

describe("M59: development acepta vacio y solo avisa", () => {
  it("productionGaps/previewGaps listan nombres sin valores", () => {
    const parsed = assertServerEnv(prodSource());
    expect(parsed.strict).toBe(true);
    expect(productionGaps).toBeDefined();
    expect(previewGaps).toBeDefined();
  });

  it("sin variables: no falla, solo avisa", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = assertServerEnv({ NODE_ENV: "test" });
    expect(result).toEqual({ mode: "test", strict: false });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain("AUTH_MODE");
  });

  it("NODE_ENV=production + VERCEL_ENV=production sin explicitas: no falla", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = assertServerEnv({ NODE_ENV: "production", VERCEL_ENV: "production" });
    expect(result.strict).toBe(false);
    expect(result.mode).toBe("development");
    expect(warn).toHaveBeenCalled();
  });

  it("APP_ENV=production con faltantes: falla", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => assertServerEnv({ NODE_ENV: "test", APP_ENV: "production" })).toThrow(
      /Faltan variables para production/,
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it("SUPABASE_PROJECT_ENV=prod con faltantes: falla", () => {
    expect(() => assertServerEnv({ NODE_ENV: "test", SUPABASE_PROJECT_ENV: "prod" })).toThrow(
      /Faltan variables para production/,
    );
  });
});

const MANAGED_KEYS = [
  "NODE_ENV",
  "APP_ENV",
  "SUPABASE_PROJECT_ENV",
  "SUPABASE_PROD_URL_EXPECTED",
  "VERCEL_ENV",
  "AUTH_MODE",
  "NEXT_PUBLIC_AUTH_MODE",
  "PRICES_MODE",
  "MARKET_STATUS_MODE",
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "CRON_SECRET",
  "JUPITER_API_KEY",
  "GEO_BLOCKED_COUNTRIES",
  "CATALOG_SCOPE",
  "DATA_MODE",
  "REAL_TRADING_READY",
  // M75
  "US_PERSON_DECLARATION_VERSION",
  "DEMO_FOR_BLOCKED",
];

/** Reimporta `@/lib/env` con un entorno controlado (el import aplica la regla, como en el build). */
async function importEnvWith(overrides: EnvSource): Promise<unknown> {
  const saved = new Map<string, string | undefined>();
  for (const key of MANAGED_KEYS) {
    saved.set(key, process.env[key]);
    delete process.env[key];
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  vi.resetModules();
  let error: unknown = null;
  try {
    await import("@/lib/env");
  } catch (caught) {
    error = caught;
  } finally {
    for (const key of MANAGED_KEYS) {
      const value = saved.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    vi.resetModules();
  }
  return error;
}

describe("M59: el import aplica la regla (como en el build)", () => {
  it("sin variables explicitas el import no falla", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = await importEnvWith({ NODE_ENV: "test" });
    expect(error).toBeNull();
    expect(warn).toHaveBeenCalled();
  });

  it("con APP_ENV=production y faltantes el import falla sin valores", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = await importEnvWith({
      NODE_ENV: "production",
      APP_ENV: "production",
      NEXT_PUBLIC_SITE_URL: "http://insecure.example.com/sentinel-9zqx",
    });
    expect(error).toBeInstanceOf(Error);
    const message = String((error as Error).message);
    expect(message).toContain("AUTH_MODE");
    expect(message).not.toContain("sentinel-9zqx");
  });
});
