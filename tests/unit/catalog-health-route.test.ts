import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/catalog/monitor", () => ({
  runSafetyBatch: async () => ({ checked: 2, changed: 1, remaining: 0 }),
}));

const SECRET = "test-cron-secret-m55";

function get(pathname: string, token?: string): Request {
  const headers: Record<string, string> = {};
  if (token !== undefined) headers.authorization = `Bearer ${token}`;
  return new Request(`https://maverlang.test${pathname}`, { headers });
}

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", SECRET);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("M55: GET /api/cron/catalog-health", () => {
  // La primera importación de la ruta es pesada: se le da margen.
  it(
    "sin token → 401",
    async () => {
    const { GET } = await import("@/app/api/cron/catalog-health/route");
    const response = await GET(get("/api/cron/catalog-health"));
    expect(response.status).toBe(401);
    const payload = (await response.json()) as { ok: boolean; error?: { code: string } };
    expect(payload.error?.code).toBe("UNAUTHORIZED");
    },
    30_000,
  );

  it("con token incorrecto → 401", async () => {
    const { GET } = await import("@/app/api/cron/catalog-health/route");
    const response = await GET(get("/api/cron/catalog-health", "otro-token"));
    expect(response.status).toBe(401);
  });

  it("con el token correcto → 200 con { checked, changed, remaining } sin cache", async () => {
    const { GET } = await import("@/app/api/cron/catalog-health/route");
    const response = await GET(get("/api/cron/catalog-health?limit=2", SECRET));
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      ok: boolean;
      data?: { checked: number; changed: number; remaining: number };
    };
    expect(payload.data).toEqual({ checked: 2, changed: 1, remaining: 0 });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("sin CRON_SECRET → 503 cron deshabilitado", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const { GET } = await import("@/app/api/cron/catalog-health/route");
    const response = await GET(get("/api/cron/catalog-health", SECRET));
    expect(response.status).toBe(503);
    const payload = (await response.json()) as { ok: boolean; error?: { message: string } };
    expect(payload.error?.message ?? "").toMatch(/deshabilitado/i);
  });
});
