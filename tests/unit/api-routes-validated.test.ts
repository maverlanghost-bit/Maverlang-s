import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
  marketSearchQuerySchema,
  pricesQuerySchema,
  tradeQuoteRequestSchema,
} from "@/lib/api/contracts";
import { assertSameOrigin, handle, isOriginExempt, parseJson } from "@/lib/api/handler";
import { DomainError, httpStatusFor } from "@/lib/api/result";

const ROOT = path.resolve(__dirname, "..", "..");
const API_DIR = path.join(ROOT, "app", "api");

function collectRoutes(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...collectRoutes(full));
      continue;
    }
    if (entry === "route.ts") out.push(full);
  }
  return out;
}

function exportedMethods(source: string): string[] {
  const found = new Set<string>();
  for (const match of source.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b/g)) {
    if (match[1]) found.add(match[1]);
  }
  return [...found];
}

function isExemptRoute(file: string): boolean {
  const rel = path.relative(ROOT, file).replace(/\\/g, "/");
  return rel.includes("app/api/onramp/webhook") || rel.includes("app/api/cron/");
}

describe("M56: toda ruta API valida su entrada (estático)", () => {
  const files = collectRoutes(API_DIR);

  it("hay rutas que revisar", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("POST/PUT/PATCH/DELETE usan parseJson y assertSameOrigin (salvo exentas)", () => {
    const missingBody = files.filter((file) => {
      if (isExemptRoute(file)) return false;
      const methods = exportedMethods(readFileSync(file, "utf8"));
      const changes = methods.some((m) => m === "POST" || m === "PUT" || m === "PATCH" || m === "DELETE");
      if (!changes) return false;
      return !readFileSync(file, "utf8").includes("parseJson");
    });
    const missingOrigin = files.filter((file) => {
      if (isExemptRoute(file)) return false;
      const methods = exportedMethods(readFileSync(file, "utf8"));
      const changes = methods.some((m) => m === "POST" || m === "PUT" || m === "PATCH" || m === "DELETE");
      if (!changes) return false;
      return !readFileSync(file, "utf8").includes("assertSameOrigin");
    });
    expect(missingBody, `sin parseJson: ${missingBody.join(", ")}`).toEqual([]);
    expect(missingOrigin, `sin assertSameOrigin: ${missingOrigin.join(", ")}`).toEqual([]);
  });

  it("ninguna ruta que cambia estado usa los alias viejos", () => {
    const legacy = files.filter((file) => {
      const source = readFileSync(file, "utf8");
      return source.includes("bodyOf(") || source.includes("queryOf(");
    });
    expect(legacy, `con bodyOf/queryOf: ${legacy.join(", ")}`).toEqual([]);
  });

  it("todo GET que lee la query usa parseQuery", () => {
    const missing = files.filter((file) => {
      const source = readFileSync(file, "utf8");
      const readsQuery =
        source.includes("parseQuery(") || source.includes("queryOf(") || source.includes("searchParams");
      if (!readsQuery) return false;
      return !source.includes("parseQuery(");
    });
    expect(missing, `GET sin parseQuery: ${missing.join(", ")}`).toEqual([]);
  });

  it("cada ruta que cambia estado declara su esquema en contracts", () => {
    const missing = files.filter((file) => {
      if (isExemptRoute(file)) return false;
      const source = readFileSync(file, "utf8");
      const methods = exportedMethods(source);
      const changes = methods.some((m) => m === "POST" || m === "PUT" || m === "PATCH" || m === "DELETE");
      if (!changes) return false;
      return !(source.includes("lib/api/contracts") && source.includes("Schema"));
    });
    expect(missing, `sin esquema de entrada: ${missing.join(", ")}`).toEqual([]);
  });

  it("el webhook y /api/cron/* quedan exentos de Origin", () => {
    expect(isOriginExempt("/api/onramp/webhook")).toBe(true);
    expect(isOriginExempt("/api/cron/sync")).toBe(true);
    expect(isOriginExempt("/api/demo/reset")).toBe(false);
  });
});

describe("M56: comportamiento del blindaje", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://maverlang.test";
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  function postJson(url: string, body: string, origin?: string): Request {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (origin !== undefined) headers["origin"] = origin;
    return new Request(url, { method: "POST", headers, body });
  }

  it("cuerpo de 20 KB → 413 PAYLOAD_TOO_LARGE", async () => {
    const schema = z.object({}).strict();
    const req = postJson("https://maverlang.test/api/demo/reset", "x".repeat(20 * 1024));
    const failure = await parseJson(req, schema).then(
      () => null,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(DomainError);
    expect((failure as DomainError).code).toBe("PAYLOAD_TOO_LARGE");
    expect(httpStatusFor("PAYLOAD_TOO_LARGE")).toBe(413);
  });

  it("campo extra → 400 VALIDATION con el campo y sin el valor", async () => {
    const schema = z.object({ amount: z.number() }).strict();
    const req = postJson(
      "https://maverlang.test/api/x",
      JSON.stringify({ amount: 10, evil: "SECRETO-123" }),
    );
    const failure = await parseJson(req, schema).then(
      () => null,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(DomainError);
    expect((failure as DomainError).code).toBe("VALIDATION");
    expect((failure as DomainError).message).toContain("evil");
    expect((failure as DomainError).message).not.toContain("SECRETO-123");
  });

  it("cuerpo que no es JSON → 400 sin eco", async () => {
    const schema = z.object({}).strict();
    const req = postJson("https://maverlang.test/api/x", "{no-json");
    const failure = await parseJson(req, schema).then(
      () => null,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(DomainError);
    expect((failure as DomainError).code).toBe("VALIDATION");
  });

  it("Origin ajeno en POST → 403 FORBIDDEN_ORIGIN", () => {
    const req = new Request("https://maverlang.test/api/demo/reset", {
      method: "POST",
      headers: { origin: "https://evil.example" },
    });
    expect(() => assertSameOrigin(req)).toThrowError(DomainError);
    try {
      assertSameOrigin(req);
    } catch (error) {
      expect((error as DomainError).code).toBe("FORBIDDEN_ORIGIN");
    }
    expect(httpStatusFor("FORBIDDEN_ORIGIN")).toBe(403);
  });

  it("sin Origin ni Referer en POST → 403", () => {
    const req = new Request("https://maverlang.test/api/demo/reset", { method: "POST" });
    try {
      assertSameOrigin(req);
      expect.unreachable("debió fallar sin origen");
    } catch (error) {
      expect((error as DomainError).code).toBe("FORBIDDEN_ORIGIN");
    }
  });

  it("el mismo origen (Origin o Referer) pasa y el GET pasa sin origen", () => {
    const byOrigin = new Request("https://maverlang.test/api/demo/reset", {
      method: "POST",
      headers: { origin: "https://maverlang.test" },
    });
    expect(() => assertSameOrigin(byOrigin)).not.toThrow();
    const byReferer = new Request("https://maverlang.test/api/me", {
      method: "PATCH",
      headers: { referer: "https://maverlang.test/app/ajustes" },
    });
    expect(() => assertSameOrigin(byReferer)).not.toThrow();
    const get = new Request("https://maverlang.test/api/prices?symbols=AAPLx");
    expect(() => assertSameOrigin(get)).not.toThrow();
  });

  it("M56b-fix: el host pedido también vale (e2e en 127.0.0.1 o tras proxy)", () => {
    // (a) Playwright sirve en 127.0.0.1:3456 pero req.url llega como localhost.
    const e2e = new Request("http://localhost:3456/api/trade/quote", {
      method: "POST",
      headers: { host: "127.0.0.1:3456", origin: "http://127.0.0.1:3456" },
    });
    expect(() => assertSameOrigin(e2e)).not.toThrow();
    // (b) Tras proxy: el navegador ve el dominio público en x-forwarded-host.
    const forwarded = new Request("http://localhost:3456/api/trade/quote", {
      method: "POST",
      headers: {
        host: "127.0.0.1:3456",
        "x-forwarded-host": "maverlang.vercel.app",
        origin: "https://maverlang.vercel.app",
      },
    });
    expect(() => assertSameOrigin(forwarded)).not.toThrow();
    // (c) Origen ajeno sigue en 403 aunque el host pedido sea propio.
    const evil = new Request("http://localhost:3456/api/trade/quote", {
      method: "POST",
      headers: { host: "127.0.0.1:3456", origin: "https://evil.example" },
    });
    try {
      assertSameOrigin(evil);
      expect.unreachable("debió fallar con origen ajeno");
    } catch (error) {
      expect((error as DomainError).code).toBe("FORBIDDEN_ORIGIN");
    }
  });

  it("un error interno → 500 con requestId y sin el texto original", async () => {
    const secret = "postgres://interna:clave-secreta@db.supabase.co:5432";
    const response = await handle("no-store", async () => {
      throw new Error(`falló la consulta: ${secret}`);
    });
    expect(response.status).toBe(500);
    const payload = (await response.json()) as {
      ok: boolean;
      error: { code: string; message: string };
      requestId?: string;
    };
    expect(payload.ok).toBe(false);
    expect(payload.error.code).toBe("INTERNAL");
    expect(JSON.stringify(payload)).not.toContain("clave-secreta");
    expect(JSON.stringify(payload)).not.toContain("supabase.co");
    expect(typeof payload.requestId).toBe("string");
    expect(payload.requestId!.length).toBeGreaterThan(0);
    expect(response.headers.get("x-request-id")).toBe(payload.requestId);
  });

  it("montos del trade: tope, decimales y símbolo", () => {
    // Sobre el máximo de la beta en USDC.
    expect(
      tradeQuoteRequestSchema.safeParse({
        side: "buy",
        symbol: "AAPLx",
        amount: 1001,
        amountCurrency: "USDC",
      }).success,
    ).toBe(false);
    // Tres decimales en dólares.
    expect(
      tradeQuoteRequestSchema.safeParse({
        side: "buy",
        symbol: "AAPLx",
        amount: 100.123,
        amountCurrency: "USDC",
      }).success,
    ).toBe(false);
    // Nueve decimales en acciones.
    expect(
      tradeQuoteRequestSchema.safeParse({
        side: "buy",
        symbol: "AAPLx",
        amount: 0.123456789,
        amountCurrency: "SHARES",
      }).success,
    ).toBe(false);
    // Sin la x final no es símbolo del catálogo.
    expect(
      tradeQuoteRequestSchema.safeParse({
        side: "buy",
        symbol: "AAPL",
        amount: 10,
        amountCurrency: "USDC",
      }).success,
    ).toBe(false);
    // Válidas: US$100 y media acción.
    expect(
      tradeQuoteRequestSchema.safeParse({
        side: "buy",
        symbol: "AAPLx",
        amount: 100,
        amountCurrency: "USDC",
      }).success,
    ).toBe(true);
    expect(
      tradeQuoteRequestSchema.safeParse({
        side: "sell",
        symbol: "NVDAx",
        amount: 0.5,
        amountCurrency: "SHARES",
      }).success,
    ).toBe(true);
  });

  it("límites de la query: q larga y símbolo raro no pasan", () => {
    expect(marketSearchQuerySchema.safeParse({ q: "a".repeat(65) }).success).toBe(false);
    expect(marketSearchQuerySchema.safeParse({ q: "apple" }).success).toBe(true);
    expect(pricesQuerySchema.safeParse({ symbols: "AAPLx, <script>" }).success).toBe(false);
    expect(pricesQuerySchema.safeParse({ symbols: "AAPLx,NVDAx" }).success).toBe(true);
  });
});
