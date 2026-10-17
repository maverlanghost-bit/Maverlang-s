/**
 * M87: CI completo en GitHub Actions y protección de main.
 * Valida estáticamente el workflow, la plantilla de PR, CODEOWNERS y la
 * sección de rama protegida en docs/DEPLOY.md. Sin secretos reales: el
 * workflow sólo usa env mock/dummy.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..", "..");

function read(relative: string): string {
  return readFileSync(path.join(ROOT, relative), "utf8");
}

describe("M87: workflow de CI (.github/workflows/ci.yml)", () => {
  const ci = read(".github/workflows/ci.yml");

  it("corre en pull_request y push a main", () => {
    expect(ci).toMatch(/^on:\s*$/m);
    expect(ci).toContain("pull_request:");
    expect(ci).toContain("branches: [main]");
  });

  it("tiene los tres jobs: checks, build y e2e", () => {
    expect(ci).toMatch(/^\s{2}checks:\s*$/m);
    expect(ci).toMatch(/^\s{2}build:\s*$/m);
    expect(ci).toMatch(/^\s{2}e2e:\s*$/m);
  });

  it("job checks: typecheck, lint, test, scan:secrets y audit:deps", () => {
    expect(ci).toContain("npm run typecheck");
    expect(ci).toContain("npm run lint");
    expect(ci).toContain("npm test");
    expect(ci).toContain("npm run scan:secrets");
    expect(ci).toContain("npm run audit:deps");
  });

  it("job e2e: chromium con deps, npm run e2e y timeout de 20 minutos", () => {
    expect(ci).toContain("npx playwright install --with-deps chromium");
    expect(ci).toContain("npm run e2e");
    // Cada job tiene timeout explícito (el exigido por M87: 20 min).
    expect(ci).toMatch(/^\s{4}timeout-minutes: 20$/m);
  });

  it("job e2e: sube artefactos de Playwright ante fallo", () => {
    expect(ci).toContain("actions/upload-artifact@v4");
    expect(ci).toMatch(/if:\s*failure\(\)/);
    expect(ci).toContain("playwright-report/");
    expect(ci).toContain("test-results/");
  });

  it("usa Node 22, npm ci con caché y cero secretos reales", () => {
    expect(ci).toContain("node-version: 22");
    expect(ci).toContain("cache: npm");
    expect(ci).toContain("npm ci");
    // Sin secretos de GitHub ni valores que parezcan credenciales.
    expect(ci).not.toMatch(/\$\{\{\s*secrets\./);
    expect(ci).not.toMatch(/sb_secret_|sbp_[A-Za-z0-9]|sk_live_|sk-ant-/);
  });
});

describe("M87: plantilla de PR (.github/pull_request_template.md)", () => {
  it("existe y exige CI verde en el PR", () => {
    const tpl = read(".github/pull_request_template.md");
    expect(tpl).toContain("CI de GitHub en verde");
    expect(tpl).toContain("checks");
    expect(tpl).toContain("e2e");
    // Checklist de verificación completa: criterios, checks y secretos.
    expect(tpl).toContain("Criterios de aceptación");
    expect(tpl).toContain("Sin secretos en el diff");
  });
});

describe("M87: CODEOWNERS (.github/CODEOWNERS)", () => {
  const codeowners = read(".github/CODEOWNERS");

  it("exige revisión de @Mbrop-13 en los 4 paths sensibles", () => {
    const requeridos = [
      "/supabase/migrations/",
      "/lib/trade/",
      "/lib/onramp/",
      "/lib/kyc/",
    ];
    for (const dir of requeridos) {
      const linea = codeowners
        .split("\n")
        .find((l) => l.trim().startsWith(dir));
      expect(linea, `falta regla para ${dir}`).toBeDefined();
      expect(linea).toContain("@Mbrop-13");
    }
  });
});

describe("M87: docs/DEPLOY.md — rama main protegida", () => {
  const deploy = read("docs/DEPLOY.md");

  it("documenta la sección de rama protegida con las reglas recomendadas", () => {
    expect(deploy).toMatch(/##\s+Rama main protegida/);
    // Checks obligatorios: los tres jobs del CI.
    expect(deploy).toContain("`checks`");
    expect(deploy).toContain("`build`");
    expect(deploy).toContain("`e2e`");
    // Sin force-push, historial lineal y PR/push a elección de Manu.
    expect(deploy).toMatch(/force-push/i);
    expect(deploy).toMatch(/historial lineal/i);
    expect(deploy).toMatch(/push directo/i);
    // Referencia al CODEOWNERS.
    expect(deploy).toContain("CODEOWNERS");
  });
});

describe("M87: scripts/e2e.mjs portable (Linux/macOS/Windows)", () => {
  it("usa path.join y spawn de node, sin PowerShell ni comandos win32", () => {
    const e2e = read("scripts/e2e.mjs");
    expect(e2e).toContain("path.join(");
    expect(e2e).toContain("spawn(process.execPath");
    expect(e2e).not.toMatch(/powershell|cmd\.exe|\.cmd\b|\.bat\b/i);
    expect(e2e).not.toMatch(/shell:\s*true/);
  });

  it("configura todo en mock y no contiene secretos", () => {
    const e2e = read("scripts/e2e.mjs");
    expect(e2e).toContain('DATA_MODE = "mock"');
    expect(e2e).not.toMatch(/sb_secret_|sbp_[A-Za-z0-9]|sk_live_|sk-ant-/);
  });
});
