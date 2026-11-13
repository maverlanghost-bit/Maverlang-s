import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Escape del e2e para el control de solicitudes: sólo con el opt-in de prueba
 * explícito y nunca en Vercel ni con APP_ENV=production. Producción real sigue
 * fallando cerrado con las políticas sensibles en memoria.
 */

const POLICY = { limit: 5, windowMs: 60_000 };

async function load() {
  vi.resetModules();
  return import("@/lib/security/rate-limit");
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("RATE_LIMIT_BACKEND", "memory");
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
  vi.stubEnv("E2E_RATE_LIMIT_MEMORY", "");
  vi.stubEnv("VERCEL", "");
  vi.stubEnv("APP_ENV", "");
  vi.stubEnv("E2E_RATE_LIMIT_SCALE", "");
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("rate-limit: escape del e2e", () => {
  it("producción en memoria sin el opt-in sigue fallando cerrado", async () => {
    const rl = await load();
    expect(rl.e2eMemoryRateLimitAllowed()).toBe(false);
    const result = await rl.limit("k-prod", POLICY, "trade");
    expect(result.ok).toBe(false);
    expect(result.unavailable).toBe(true);
  });

  it("con E2E_RATE_LIMIT_MEMORY=true (fuera de Vercel) usa la ventana en memoria", async () => {
    vi.stubEnv("E2E_RATE_LIMIT_MEMORY", "true");
    const rl = await load();
    expect(rl.e2eMemoryRateLimitAllowed()).toBe(true);
    for (let index = 0; index < POLICY.limit; index += 1) {
      expect((await rl.limit("k-e2e", POLICY, "trade")).ok).toBe(true);
    }
    const blocked = await rl.limit("k-e2e", POLICY, "trade");
    expect(blocked.ok).toBe(false);
    expect(blocked.unavailable).toBeFalsy();
  });

  it("en Vercel el opt-in se ignora y se falla cerrado", async () => {
    vi.stubEnv("E2E_RATE_LIMIT_MEMORY", "true");
    vi.stubEnv("VERCEL", "1");
    const rl = await load();
    expect(rl.e2eMemoryRateLimitAllowed()).toBe(false);
    expect((await rl.limit("k-vercel", POLICY, "trade")).unavailable).toBe(true);
  });

  it("con APP_ENV=production el opt-in se ignora y se falla cerrado", async () => {
    vi.stubEnv("E2E_RATE_LIMIT_MEMORY", "true");
    vi.stubEnv("APP_ENV", "production");
    const rl = await load();
    expect(rl.e2eMemoryRateLimitAllowed()).toBe(false);
    expect((await rl.limit("k-appenv", POLICY, "trade")).unavailable).toBe(true);
  });

  it("E2E_RATE_LIMIT_SCALE sólo multiplica cupos con el opt-in del e2e", async () => {
    vi.stubEnv("E2E_RATE_LIMIT_SCALE", "50");
    let rl = await load();
    expect(rl.e2eRateLimitScale()).toBe(1);
    expect(rl.resolvePolicy("demoReset").limit).toBe(rl.RATE_LIMIT_POLICIES.demoReset.limit);

    vi.stubEnv("E2E_RATE_LIMIT_MEMORY", "true");
    rl = await load();
    expect(rl.e2eRateLimitScale()).toBe(50);
    expect(rl.resolvePolicy("demoReset").limit).toBe(rl.RATE_LIMIT_POLICIES.demoReset.limit * 50);

    vi.stubEnv("VERCEL", "1");
    rl = await load();
    expect(rl.e2eRateLimitScale()).toBe(1);
    expect(rl.resolvePolicy("demoReset").limit).toBe(rl.RATE_LIMIT_POLICIES.demoReset.limit);

    vi.stubEnv("VERCEL", "");
    vi.stubEnv("E2E_RATE_LIMIT_SCALE", "100000");
    rl = await load();
    expect(rl.e2eRateLimitScale()).toBe(1);
  });

  it("sólo un \"true\" explícito activa el escape", async () => {
    vi.stubEnv("E2E_RATE_LIMIT_MEMORY", "1");
    const rl = await load();
    expect(rl.e2eMemoryRateLimitAllowed()).toBe(false);
  });
});
