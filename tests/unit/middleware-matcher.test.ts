import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/** El matcher es un literal que Next analiza en build: se extrae del fuente y se prueba como regex. */
function matcherRegex(): RegExp {
  const source = readFileSync(path.resolve(__dirname, "..", "..", "middleware.ts"), "utf8");
  const block = /export const config = \{\s*matcher: \[\s*"([^"\n]+)",?\s*\],?\s*\};/.exec(source);
  expect(block).not.toBeNull();
  // El literal TS usa `\\.`; la regex que recibe Next es el valor evaluado (`\.`).
  const evaluated = JSON.parse(`"${block![1]}"`) as string;
  // Next ancla la expresión al path completo.
  return new RegExp(`^${evaluated}$`);
}

describe("AUTH-8/WEB-6: matcher del middleware", () => {
  const re = matcherRegex();
  const runs = (p: string) => re.test(p);

  it("corre en páginas, incluidas las rutas con punto (tickers como BRK.B)", () => {
    for (const p of [
      "/",
      "/app",
      "/app/cartera",
      "/app/accion/BRK.B",
      "/app/accion/BF.B",
      "/auth/confirmar",
      "/admin",
      "/opengraph-image",
      "/legal/terminos",
    ]) {
      expect(runs(p), p).toBe(true);
    }
  });

  it("no corre en api, _next ni archivos estáticos", () => {
    for (const p of [
      "/api/quote",
      "/api",
      "/_next/static/chunks/main.js",
      "/_next/image",
      "/robots.txt",
      "/sitemap.xml",
      "/manifest.webmanifest",
      "/icon.png",
      "/apple-icon.png",
      "/favicon.ico",
      "/logo.svg",
      "/fonts/inter.woff2",
    ]) {
      expect(runs(p), p).toBe(false);
    }
  });

  it("un prefijo parecido a api sigue pasando por el middleware", () => {
    expect(runs("/apiary")).toBe(true);
  });
});
