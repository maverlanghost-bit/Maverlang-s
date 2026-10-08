import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ROOT = path.resolve(__dirname, "..", "..");

vi.mock("@/lib/services", () => ({
  getServices: () => ({
    auth: {
      getSession: async () => ({ userId: "u-test", walletAddress: null }),
    },
  }),
}));

function collectRoutes(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectRoutes(full, out);
      continue;
    }
    if (entry === "route.ts") out.push(full);
  }
  return out;
}

const SITE = "https://maverlang.test";
const SUPABASE_URL = "https://example.supabase.co";

function post(pathname: string, body: unknown, cookie?: string): Request {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    origin: SITE,
  };
  if (cookie) headers.cookie = cookie;
  return new Request(`${SITE}${pathname}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

async function errorPayload(response: Response) {
  return (await response.json()) as {
    ok: boolean;
    error?: { code: string; message: string };
  };
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", SITE);
  vi.stubEnv("AUTH_MODE", "supabase");
  vi.stubEnv("NEXT_PUBLIC_AUTH_MODE", "supabase");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-test");
  vi.stubEnv("REAL_TRADING_READY", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("M46: dinero real apagado (503 REAL_DISABLED)", () => {
  it("las 6 rutas de dinero real nombran el guardián", () => {
    const expected = [
      "app/api/trade/build/route.ts",
      "app/api/trade/submit/route.ts",
      "app/api/trade/status/route.ts",
      "app/api/wallet/send/build/route.ts",
      "app/api/onramp/session/route.ts",
      "app/api/onramp/webhook/route.ts",
    ];
    for (const rel of expected) {
      const source = readFileSync(path.join(ROOT, rel), "utf8");
      expect(source, `${rel} sin guardián`).toContain("assertRealTradingEnabled");
    }
    const files = collectRoutes(path.join(ROOT, "app", "api"));
    expect(files.length).toBeGreaterThan(20);
  });

  it("POST /api/trade/build con cuenta real → 503 REAL_DISABLED", async () => {
    const { POST } = await import("@/app/api/trade/build/route");
    const response = await POST(post("/api/trade/build", { quoteId: "q", userPublicKey: "x".repeat(32) }, "mv_account=real"));
    expect(response.status).toBe(503);
    expect((await errorPayload(response)).error?.code).toBe("REAL_DISABLED");
  });

  it("POST /api/trade/submit con cuenta real → 503 REAL_DISABLED", async () => {
    const { POST } = await import("@/app/api/trade/submit/route");
    const response = await POST(
      post("/api/trade/submit", { requestId: "r", signedTransactionBase64: "zz" }, "mv_account=real"),
    );
    expect(response.status).toBe(503);
    expect((await errorPayload(response)).error?.code).toBe("REAL_DISABLED");
  });

  it("GET /api/trade/status con cuenta real → 503 REAL_DISABLED", async () => {
    const { GET } = await import("@/app/api/trade/status/route");
    const req = new Request(`${SITE}/api/trade/status?id=orden-1`, {
      headers: { cookie: "mv_account=real" },
    });
    const response = await GET(req);
    expect(response.status).toBe(503);
    expect((await errorPayload(response)).error?.code).toBe("REAL_DISABLED");
  });

  it("POST /api/wallet/send/build → 503 REAL_DISABLED siempre", async () => {
    const { POST } = await import("@/app/api/wallet/send/build/route");
    const response = await POST(
      post("/api/wallet/send/build", {
        to: "x".repeat(32),
        mint: "y".repeat(32),
        amountUi: 1,
        userPublicKey: "z".repeat(32),
      }),
    );
    expect(response.status).toBe(503);
    expect((await errorPayload(response)).error?.code).toBe("REAL_DISABLED");
  });

  it("POST /api/onramp/session → 503 REAL_DISABLED siempre", async () => {
    const { POST } = await import("@/app/api/onramp/session/route");
    const response = await POST(
      post("/api/onramp/session", { amountClp: 10000, walletAddress: "w".repeat(32) }),
    );
    expect(response.status).toBe(503);
    expect((await errorPayload(response)).error?.code).toBe("REAL_DISABLED");
  });

  it("POST /api/onramp/webhook → 503 REAL_DISABLED siempre (sin Origin)", async () => {
    const { POST } = await import("@/app/api/onramp/webhook/route");
    const req = new Request(`${SITE}/api/onramp/webhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: "s" }),
    });
    const response = await POST(req);
    expect(response.status).toBe(503);
    expect((await errorPayload(response)).error?.code).toBe("REAL_DISABLED");
  });
});
