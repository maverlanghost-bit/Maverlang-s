import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..", "..");
const SCAN_DIRS = ["app", "components", "lib"];

function collectFiles(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      collectFiles(full, out);
      continue;
    }
    if (full.endsWith(".ts") || full.endsWith(".tsx")) out.push(full);
  }
}

function isClientModule(source: string): boolean {
  const head = source.slice(0, 300).trimStart();
  return head.startsWith('"use client"') || head.startsWith("'use client'");
}

function bannedImportReason(source: string): string | null {
  for (const line of source.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("import") && !trimmed.startsWith("} from") && !trimmed.includes("from \"") && !trimmed.includes("from '") && !trimmed.includes("require(")) {
      continue;
    }
    if (trimmed.includes("server-only")) return `importa "server-only": ${trimmed}`;
    if (trimmed.includes("lib/catalog/assets")) return `importa lib/catalog/assets: ${trimmed}`;
    // lib/env completo (server-only): cualquier import es build error en cliente.
    if (trimmed.includes("lib/env")) return `importa lib/env: ${trimmed}`;
    // asset-status sin .shared: el módulo con server-only. Con .shared está permitido.
    if (trimmed.includes("lib/market/asset-status") && !trimmed.includes("lib/market/asset-status.shared")) {
      return `importa lib/market/asset-status sin .shared: ${trimmed}`;
    }
    // Quotes de la portada (M42): server-only (getServices + lib/env).
    if (trimmed.includes("lib/landing/live-quotes")) {
      return `importa lib/landing/live-quotes: ${trimmed}`;
    }
  }
  return null;
}

describe("M39b: ningún módulo cliente importa servidor", () => {
  it("archivos 'use client' en app/, components/ y lib/ sólo usan asset-status.shared", () => {
    const files: string[] = [];
    for (const dir of SCAN_DIRS) collectFiles(path.join(ROOT, dir), files);
    const violations: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      if (!isClientModule(source)) continue;
      const reason = bannedImportReason(source);
      if (reason) violations.push(`${path.relative(ROOT, file)} ${reason}`);
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });
});
