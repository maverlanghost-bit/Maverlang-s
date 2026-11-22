import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.doUnmock("@/lib/env");
});

async function load(secret: string | undefined) {
  vi.resetModules();
  vi.doMock("@/lib/env", () => ({ serverEnv: { DEMO_TOKEN_SECRET: secret } }));
  return import("@/lib/services/demo-token-secret");
}

describe("MON-11: secreto de los tokens demo", () => {
  it("usa DEMO_TOKEN_SECRET cuando existe", async () => {
    const mod = await load("x".repeat(40));
    expect(mod.demoHmacSecret()).toBe("x".repeat(40));
  });

  it("en desarrollo sin secreto usa el fallback sólo-dev", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const mod = await load(undefined);
    expect(mod.demoHmacSecret()).toContain("dev-only");
  });

  it("en producción sin secreto falla cerrado", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const mod = await load(undefined);
    expect(() => mod.demoHmacSecret()).toThrow();
  });
});
