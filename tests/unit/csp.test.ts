import { describe, expect, it } from "vitest";

import { buildCsp, resolveCspMode, sanitizeNonce } from "@/lib/security/csp";
import { buildStaticHeaders } from "@/lib/security/headers";
import nextConfig from "../../next.config";

function directiveOf(policy: string, name: string): string {
  const found = policy
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name} `));
  if (!found) throw new Error(`sin ${name} en: ${policy}`);
  return found;
}

describe("M48: política de producción", () => {
  const policy = buildCsp({
    nonce: "abc123==",
    isDev: false,
    supabaseUrl: "https://proyecto-test.supabase.co",
    rpcUrl: "https://api.mainnet-beta.solana.com",
  });

  it("no contiene unsafe-eval", () => {
    expect(policy).not.toContain("unsafe-eval");
  });

  it("script-src con nonce y strict-dynamic, sin comodines", () => {
    const script = directiveOf(policy, "script-src");
    expect(script).toContain("'self'");
    expect(script).toContain("'nonce-abc123=='");
    expect(script).toContain("'strict-dynamic'");
    expect(script).not.toContain("*");
  });

  it("bloquea clickjacking y objetos", () => {
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("base-uri 'self'");
    expect(policy).toContain("form-action 'self'");
  });

  it("incluye el host de Supabase de la env (https y wss)", () => {
    const connect = directiveOf(policy, "connect-src");
    expect(connect).toContain("https://proyecto-test.supabase.co");
    expect(connect).toContain("wss://proyecto-test.supabase.co");
  });

  it("incluye Privy y el RPC sin hardcodear proyectos", () => {
    const connect = directiveOf(policy, "connect-src");
    expect(connect).toContain("https://auth.privy.io");
    expect(connect).toContain("https://*.privy.io");
    expect(connect).toContain("https://*.privy.systems");
    expect(connect).toContain("https://api.mainnet-beta.solana.com");
    const frames = directiveOf(policy, "frame-src");
    expect(frames).toContain("https://auth.privy.io");
  });

  it("fuerza https sólo en producción", () => {
    expect(policy).toContain("upgrade-insecure-requests");
    const dev = buildCsp({ nonce: "n", isDev: true });
    expect(dev).not.toContain("upgrade-insecure-requests");
  });
});

describe("M48: desarrollo trae unsafe-eval y el cluster cae a mainnet", () => {
  it("dev sí trae unsafe-eval", () => {
    const dev = buildCsp({ nonce: "n", isDev: true });
    expect(directiveOf(dev, "script-src")).toContain("'unsafe-eval'");
  });

  it("sin RPC usa el endpoint del cluster", () => {
    const devnet = buildCsp({ nonce: "n", isDev: true, rpcCluster: "devnet" });
    expect(directiveOf(devnet, "connect-src")).toContain("https://api.devnet.solana.com");
    const fallback = buildCsp({ nonce: "n", isDev: true });
    expect(directiveOf(fallback, "connect-src")).toContain("https://api.mainnet-beta.solana.com");
  });

  it("report-uri sólo con valor de una pieza", () => {
    expect(buildCsp({ nonce: "n", isDev: true, reportUri: "/api/csp" })).toContain("report-uri /api/csp");
    expect(buildCsp({ nonce: "n", isDev: true })).not.toContain("report-uri");
    expect(buildCsp({ nonce: "n", isDev: true, reportUri: "a; b" })).not.toContain("report-uri");
  });

  it("el nonce se sanea", () => {
    expect(sanitizeNonce("ab\nc;d'ef\"")).toBe("abcdef");
  });
});

describe("M48: modo de CSP", () => {
  it("explícito gana y default es enforce en prod, report-only en dev", () => {
    expect(resolveCspMode("off", "production")).toBe("off");
    expect(resolveCspMode("enforce", "development")).toBe("enforce");
    expect(resolveCspMode(undefined, "production")).toBe("enforce");
    expect(resolveCspMode(undefined, "development")).toBe("report-only");
    expect(resolveCspMode("typo", "production")).toBe("enforce");
  });
});

describe("M48: cabeceras estáticas", () => {
  it("las 6 cabeceras con valores exactos", () => {
    const headers = Object.fromEntries(
      buildStaticHeaders({ isProd: true }).map(({ key, value }) => [key, value]),
    );
    expect(headers["Strict-Transport-Security"]).toBe(
      "max-age=63072000; includeSubDomains; preload",
    );
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["Permissions-Policy"]).toBe(
      "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    );
    expect(headers["Cross-Origin-Opener-Policy"]).toBe("same-origin-allow-popups");
  });

  it("HSTS sólo en producción", () => {
    const keys = buildStaticHeaders({ isProd: false }).map(({ key }) => key);
    expect(keys).not.toContain("Strict-Transport-Security");
    expect(keys).toHaveLength(5);
  });
});

describe("M48: next.config", () => {
  it("sin X-Powered-By y con cabeceras para todas las rutas", async () => {
    expect(nextConfig.poweredByHeader).toBe(false);
    const rules = await nextConfig.headers!();
    const all = rules.find((rule) => rule.source === "/(.*)");
    expect(all).toBeDefined();
    const keys = (all?.headers ?? []).map((header) => header.key);
    for (const key of [
      "X-Content-Type-Options",
      "X-Frame-Options",
      "Referrer-Policy",
      "Permissions-Policy",
      "Cross-Origin-Opener-Policy",
    ]) {
      expect(keys).toContain(key);
    }
    const api = rules.find((rule) => rule.source === "/api/:path*");
    expect(api?.headers.map((header) => header.key)).toContain("X-Content-Type-Options");
  });
});
