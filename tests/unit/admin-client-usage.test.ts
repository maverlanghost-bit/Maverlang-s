import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..", "..");

/**
 * Quién puede importar el cliente con la secret key (M57).
 * Los `.mjs` no entran: no corren en el servidor web.
 * `lib/catalog/monitor.ts` todavía no existe (lo crea M55) y ya está permitido.
 */
export function isAllowedAdminImporter(relativePath: string): boolean {
  const normalized = relativePath.replaceAll("\\", "/");
  if (/^lib\/services\/[^/]+\.supabase\.ts$/.test(normalized)) return true;
  if (normalized === "lib/catalog/monitor.ts") return true;
  if (/^lib\/admin\/.+\.tsx?$/.test(normalized)) return true;
  if (/^app\/api\/cron\/.+\.tsx?$/.test(normalized)) return true;
  return false;
}

const IMPORT_RE = /(?:from\s+|import\s*\(\s*|require\s*\(\s*)["']([^"']*supabase\/admin)["']/g;

function collect(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      collect(full, out);
      continue;
    }
    if (full.endsWith(".ts") || full.endsWith(".tsx")) out.push(full);
  }
}

function scanFiles(): string[] {
  const files: string[] = [];
  for (const dir of ["app", "components", "lib", "scripts"]) {
    collect(path.join(ROOT, dir), files);
  }
  for (const name of ["middleware.ts", "instrumentation.ts", "next.config.ts"]) {
    const full = path.join(ROOT, name);
    if (statSync(full).isFile()) files.push(full);
  }
  return files;
}

describe("M57: lista blanca del cliente admin", () => {
  it("permite servicios, monitor, admin y cron; el resto no", () => {
    expect(isAllowedAdminImporter("lib/services/demo.supabase.ts")).toBe(true);
    expect(isAllowedAdminImporter("lib/services/waitlist.supabase.ts")).toBe(true);
    expect(isAllowedAdminImporter("lib/catalog/monitor.ts")).toBe(true);
    expect(isAllowedAdminImporter("lib/admin/guard.ts")).toBe(true);
    expect(isAllowedAdminImporter("lib/admin/store.ts")).toBe(true);
    expect(isAllowedAdminImporter("app/api/cron/safety/route.ts")).toBe(true);
    expect(isAllowedAdminImporter("lib/waitlist/server.ts")).toBe(false);
    expect(isAllowedAdminImporter("lib/flags.ts")).toBe(false);
    expect(isAllowedAdminImporter("app/admin/page.tsx")).toBe(false);
    expect(isAllowedAdminImporter("app/admin/actions.ts")).toBe(false);
    expect(isAllowedAdminImporter("middleware.ts")).toBe(false);
  });

  it("ningún módulo del servidor fuera de la lista importa el cliente admin", () => {
    const violations: string[] = [];
    for (const file of scanFiles()) {
      const source = readFileSync(file, "utf8");
      IMPORT_RE.lastIndex = 0;
      if (!IMPORT_RE.test(source)) continue;
      const relative = path.relative(ROOT, file).replaceAll("\\", "/");
      if (!isAllowedAdminImporter(relative)) violations.push(relative);
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });
});
