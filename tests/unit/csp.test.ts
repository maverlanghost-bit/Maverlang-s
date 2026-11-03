import { describe, expect, it } from "vitest";
import { NextRequest, NextResponse } from "next/server";

import { buildCsp, resolveCspMode, sanitizeNonce } from "@/lib/security/csp";
import { buildStaticHeaders } from "@/lib/security/headers";
import { mergeSupabaseIntoNext } from "@/lib/supabase/middleware";
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

  it("M-01: sin comodín, ningún proyecto Supabase ajeno entra al connect-src", () => {
    const connect = directiveOf(policy, "connect-src");
    expect(connect).not.toMatch(/\*\.supabase\.co/);
    expect(connect.split(/\s+/).filter((token) => token.includes("supabase.co"))).toEqual([
      "https://proyecto-test.supabase.co",
      "wss://proyecto-test.supabase.co",
    ]);
  });

  it("M-01: sin NEXT_PUBLIC_SUPABASE_URL falla cerrado (sólo 'self', sin comodín)", () => {
    const sinUrl = buildCsp({ nonce: "abc123==", isDev: false });
    const connect = directiveOf(sinUrl, "connect-src");
    expect(connect).not.toContain("supabase.co");
    expect(connect).not.toMatch(/\*\.supabase\.co/);
    expect(connect.replace(/^connect-src\s+/, "").split(/\s+/)[0]).toBe("'self'");
    // Un valor inválido tampoco habilita comodines ni hosts arbitrarios.
    const basura = buildCsp({ nonce: "abc123==", isDev: false, supabaseUrl: "no-es-una-url" });
    expect(directiveOf(basura, "connect-src")).not.toContain("supabase.co");
  });

  it("M-01: require-trusted-types-for queda fuera (rompería el JSON-LD)", () => {
    // `lib/seo/jsonld.tsx` usa dangerouslySetInnerHTML y no hay política
    // `trusted-types` registrada: activar la directiva lanzaría TypeError en
    // el navegador. Si algún día se activa, este test debe cambiar a propósito.
    expect(policy).not.toContain("require-trusted-types-for");
    expect(policy).not.toContain("trusted-types");
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
  it("las 9 cabeceras de producción con valores exactos", () => {
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
    expect(headers["Cross-Origin-Resource-Policy"]).toBe("same-origin");
    expect(headers["X-DNS-Prefetch-Control"]).toBe("off");
    expect(headers["X-Permitted-Cross-Domain-Policies"]).toBe("none");
    expect(Object.keys(headers)).toHaveLength(9);
  });

  it("HSTS sólo en producción", () => {
    const keys = buildStaticHeaders({ isProd: false }).map(({ key }) => key);
    expect(keys).not.toContain("Strict-Transport-Security");
    expect(keys).toHaveLength(8);
  });

  it("no activa COEP (rompería imágenes e iframes de terceros)", () => {
    expect(buildStaticHeaders({ isProd: true }).map(({ key }) => key)).not.toContain(
      "Cross-Origin-Embedder-Policy",
    );
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
      "Cross-Origin-Resource-Policy",
      "X-DNS-Prefetch-Control",
      "X-Permitted-Cross-Domain-Policies",
    ]) {
      expect(keys).toContain(key);
    }
  });

  it("B-01: /api/* recibe nosniff y CORP desde next.config", async () => {
    const rules = await nextConfig.headers!();
    const api = rules.find((rule) => rule.source === "/api/:path*");
    expect(api).toBeDefined();
    const headers = Object.fromEntries(
      (api?.headers ?? []).map((header) => [header.key, header.value]),
    );
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Cross-Origin-Resource-Policy"]).toBe("same-origin");
    expect(headers["X-DNS-Prefetch-Control"]).toBe("off");
    expect(headers["X-Permitted-Cross-Domain-Policies"]).toBe("none");
  });
});

describe("M48b-fix: nonce de la CSP en modo Supabase", () => {
  it("mergeSupabaseIntoNext conserva x-nonce/CSP y pasa cookie + cache-control", () => {
    const refreshed = NextResponse.next({
      request: new NextRequest("https://ejemplo.cl/app"),
    });
    refreshed.cookies.set("sb-test", "valor");
    refreshed.headers.set("cache-control", "no-store");

    const headers = new Headers();
    headers.set("x-nonce", "abc123");
    headers.set("content-security-policy", "script-src 'nonce-abc123'");
    const next = NextResponse.next({ request: { headers } });

    mergeSupabaseIntoNext(refreshed, next);

    expect(next.headers.get("x-middleware-override-headers")).toContain("x-nonce");
    expect(next.headers.get("x-middleware-override-headers")).toContain("content-security-policy");
    expect(next.headers.get("x-middleware-request-x-nonce")).toContain("abc123");
    expect(next.cookies.get("sb-test")?.value).toBe("valor");
    expect(next.headers.get("cache-control")).toBe("no-store");
  });
});
