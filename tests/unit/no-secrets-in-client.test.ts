import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..", "..");
const SCAN_DIRS = ["app", "components", "lib"];
const ENV_EXAMPLE = path.join(ROOT, ".env.example");

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

const ENV_ACCESS = /process\.env(?:\.([A-Za-z0-9_]+)|\[\s*['"]([A-Za-z0-9_]+)['"]\s*\])/g;

function isPublicEnvName(name: string): boolean {
  return name.startsWith("NEXT_PUBLIC_") || name === "NODE_ENV";
}

function envExampleKeys(): string[] {
  const keys: string[] = [];
  for (const line of readFileSync(ENV_EXAMPLE, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const body = trimmed.startsWith("export ") ? trimmed.slice(7).trim() : trimmed;
    const eq = body.indexOf("=");
    if (eq <= 0) continue;
    const key = body.slice(0, eq).trim();
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) keys.push(key);
  }
  return keys;
}

function publicEnvNamesInEnvTs(): string[] {
  const source = readFileSync(path.join(ROOT, "lib", "env.ts"), "utf8");
  const start = source.indexOf("const publicSchema");
  const end = source.indexOf("const serverSchema");
  const block = source.slice(start, end);
  const names = new Set<string>();
  for (const match of block.matchAll(/\b(NEXT_PUBLIC_[A-Z0-9_]+)\b/g)) names.add(match[1]);
  return [...names];
}

describe("M46: ningún secreto llega al cliente", () => {
  it("archivos 'use client' sólo leen NEXT_PUBLIC_* o NODE_ENV", () => {
    const files: string[] = [];
    for (const dir of SCAN_DIRS) collectFiles(path.join(ROOT, dir), files);
    const violations: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      if (!isClientModule(source)) continue;
      for (const match of source.matchAll(ENV_ACCESS)) {
        const name = match[1] ?? match[2] ?? "";
        if (!isPublicEnvName(name)) {
          violations.push(`${path.relative(ROOT, file)} lee process.env.${name}`);
        }
      }
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("ningún NEXT_PUBLIC_ en .env.example termina en SECRET, TOKEN ni PRIVATE", () => {
    const bad = envExampleKeys().filter(
      (key) =>
        key.startsWith("NEXT_PUBLIC_") &&
        (key.endsWith("SECRET") || key.endsWith("TOKEN") || key.endsWith("PRIVATE")),
    );
    expect(bad, `NEXT_PUBLIC_* secreto en .env.example: ${bad.join(", ")}`).toEqual([]);
  });

  it("lib/env.ts: lo que termina en _SECRET, _KEY, _TOKEN o _PASSWORD vive sólo en el servidor", () => {
    const bad = publicEnvNamesInEnvTs().filter((name) => {
      if (/(SECRET|TOKEN|PRIVATE|PASSWORD)$/.test(name)) return true;
      if (name.endsWith("_KEY") && !name.endsWith("PUBLISHABLE_KEY")) return true;
      return false;
    });
    expect(bad, `nombre secreto en publicSchema: ${bad.join(", ")}`).toEqual([]);
  });
});
