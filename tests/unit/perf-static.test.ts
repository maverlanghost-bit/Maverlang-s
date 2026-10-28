import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * M84: presupuestos de rendimiento verificables sin build ni servidor.
 *
 * 1. Ninguna ruta de API con datos de usuario queda cacheable: toda ruta
 *    bajo app/api que toque sesión/cartera/billetera/perfil usa
 *    `handle("private")` o `handle("no-store")`, nunca los presets públicos.
 * 2. Las rutas públicas de catálogo/precios llevan `stale-while-revalidate`.
 * 3. El provider de Privy y `@solana/web3.js` viven en módulos que sólo se
 *    cargan con `import()` dinámico desde el cliente (`lib/auth/provider.tsx`).
 */

const ROOT = path.resolve(__dirname, "..", "..");

function listFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      listFiles(full, out);
    } else if (full.endsWith(".ts") || full.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

function rel(file: string): string {
  return path.relative(ROOT, file).replace(/\\/g, "/");
}

/** Rutas cuya respuesta SIEMPRE pertenece a un usuario: jamás `public`. */
const USER_DATA_PREFIXES = [
  "app/api/me/",
  "app/api/portfolio/",
  "app/api/wallet/",
  "app/api/trade/",
  "app/api/onramp/session/",
  "app/api/demo/",
];

const PUBLIC_CACHEABLE = ["app/api/market/search/route.ts", "app/api/prices/route.ts"];

describe("M84: ninguna ruta con datos de usuario es cacheable", () => {
  const apiDir = path.join(ROOT, "app", "api");

  it("todas las rutas de datos de usuario usan private/no-store", () => {
    const violations: string[] = [];
    for (const file of listFiles(apiDir)) {
      const id = rel(file);
      if (!USER_DATA_PREFIXES.some((prefix) => id.startsWith(prefix))) continue;
      if (!id.endsWith("route.ts")) continue;
      const source = readFileSync(file, "utf8");
      // Cada handler GET/POST/... debe declarar su modo de caché con handle("...").
      const handles = [...source.matchAll(/handle\(\s*"([a-z0-9-]+)"\s*,/g)].map((m) => m[1]);
      if (handles.length === 0) {
        violations.push(`${id}: sin handle() con modo de caché explícito`);
        continue;
      }
      for (const mode of handles) {
        if (mode !== "private" && mode !== "no-store") {
          violations.push(`${id}: handle("${mode}") en ruta con datos de usuario`);
        }
      }
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("una ruta de usuario jamás usa un preset público (defensa extra)", () => {
    const violations: string[] = [];
    for (const file of listFiles(apiDir)) {
      const id = rel(file);
      if (!id.endsWith("route.ts")) continue;
      if (!USER_DATA_PREFIXES.some((prefix) => id.startsWith(prefix))) continue;
      const source = readFileSync(file, "utf8");
      if (/handle\(\s*"(hour|short|swr15)"/.test(source)) {
        violations.push(`${id}: preset público en ruta de usuario`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("search y prices llevan stale-while-revalidate (públicas)", () => {
    for (const id of PUBLIC_CACHEABLE) {
      const source = readFileSync(path.join(ROOT, id), "utf8");
      const handles = [...source.matchAll(/handle\(\s*"([a-z0-9-]+)"\s*,/g)].map((m) => m[1]);
      expect(handles.length, `${id} sin handle`).toBeGreaterThan(0);
      expect(handles, `${id} debe usar short o swr15`).toContain(handles[0]);
      expect(["short", "swr15"]).toContain(handles[0]);
    }
    const handler = readFileSync(path.join(ROOT, "lib/api/handler.ts"), "utf8");
    expect(handler).toContain('short: "public, max-age=30, s-maxage=60, stale-while-revalidate=60"');
    expect(handler).toContain('swr15: "public, max-age=15, s-maxage=15, stale-while-revalidate=30"');
  });
});

describe("M84: carga diferida de librerías pesadas", () => {
  const scanDirs = ["app", "components", "lib"].map((dir) => path.join(ROOT, dir));

  it("ningún archivo importa lightweight-charts", () => {
    const violations: string[] = [];
    for (const dir of scanDirs) {
      for (const file of listFiles(dir)) {
        const source = readFileSync(file, "utf8");
        if (source.includes('"lightweight-charts"') || source.includes("'lightweight-charts'")) {
          violations.push(`${rel(file)}: importa lightweight-charts`);
        }
      }
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("el gráfico es SVG propio sin librería pesada (LazyPriceChart)", () => {
    const lazy = readFileSync(path.join(ROOT, "components/domain/lazy-price-chart.tsx"), "utf8");
    // El gráfico ahora es SVG propio (sin librería pesada): no necesita next/dynamic.
    expect(lazy).not.toContain("lightweight-charts");
    expect(lazy).toContain("svg-price-chart");
  });

  it("el provider de Privy no se importa estático desde el árbol cliente", () => {
    const violations: string[] = [];
    for (const dir of scanDirs) {
      for (const file of listFiles(dir)) {
        if (rel(file) === "lib/auth/privy-provider.tsx") continue;
        const source = readFileSync(file, "utf8");
        for (const line of source.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("import") && !trimmed.includes(" from \"") && !trimmed.includes(" from '")) continue;
          if (trimmed.includes("privy-provider")) {
            // Sólo permitido dentro de import() dinámico (provider.tsx).
            if (trimmed.includes('import("./privy-provider")')) continue;
            if (trimmed.startsWith("import type")) continue;
            violations.push(`${rel(file)}: ${trimmed}`);
          }
          if (trimmed.includes('"@privy-io/react-auth"') || trimmed.includes("'@privy-io/react-auth'")) {
            if (/^import\s+type/.test(trimmed)) continue;
            if (rel(file) !== "lib/auth/privy-provider.tsx") {
              violations.push(`${rel(file)}: import de @privy-io/react-auth fuera de privy-provider → ${trimmed}`);
            }
          }
        }
      }
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("@solana/web3.js nunca se importa en módulos cliente", () => {
    const violations: string[] = [];
    for (const dir of scanDirs) {
      for (const file of listFiles(dir)) {
        const source = readFileSync(file, "utf8");
        const head = source.slice(0, 300).trimStart();
        if (!head.startsWith('"use client"') && !head.startsWith("'use client'")) continue;
        for (const line of source.split("\n")) {
          const trimmed = line.trim();
          if (trimmed.includes("@solana/web3.js") && trimmed.startsWith("import")) {
            if (/^import\s+type/.test(trimmed)) continue;
            violations.push(`${rel(file)}: ${trimmed}`);
          }
        }
      }
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("la fila del mercado y el logo declaran sizes/lazy (fuera de la 1ª pantalla)", () => {
    const row = readFileSync(path.join(ROOT, "components/domain/ticker-row.tsx"), "utf8");
    expect(row).toContain('loading="lazy"');
    expect(row).toContain('sizes="40px"');
    const logo = readFileSync(path.join(ROOT, "components/domain/ticker-logo.tsx"), "utf8");
    expect(logo).toContain('loading={loading}');
    expect(logo).toContain('sizes={sizes}');
  });
});
