import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..", "..");
const API_DIR = path.join(ROOT, "app", "api");

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

/**
 * Módulos que tocan la secret key: directo (admin/secret) o un salto vía los
 * servicios que la usan (demo por usuario, perfiles, lista de espera).
 */
const ADMIN_TOUCH =
  /supabase\/admin|supabase\/secret|waitlist\/server|demo\.supabase|users\.supabase/;

const PROTECTED = /requireSession|requireSupabaseUser|requireCronSecret|CRON_SECRET/;

/**
 * Lista blanca explícita: rutas con cliente admin que no exigen sesión porque
 * sólo insertan, sin leer ni exponer datos de nadie.
 */
const ALLOWLIST: Array<{ rel: string; mustContain: string[]; mustNotContain: string[] }> = [
  {
    rel: "app/api/waitlist/route.ts",
    mustContain: ["EXCEPCIÓN M46", "postWaitlist"],
    mustNotContain: ["requireSession"],
  },
];

function relOf(file: string): string {
  return path.relative(ROOT, file).replace(/\\/g, "/");
}

/** Extrae el bloque `XRequestSchema = z.object({ ... })` con conteo de llaves. */
function requestSchemaBlocks(source: string): Array<{ name: string; block: string }> {
  const out: Array<{ name: string; block: string }> = [];
  for (const match of source.matchAll(/(\w+RequestSchema)\s*=\s*z\.object\(\{/g)) {
    const name = match[1];
    let depth = 0;
    let i = (match.index ?? 0) + match[0].length - 1;
    for (; i < source.length; i += 1) {
      if (source[i] === "{") depth += 1;
      else if (source[i] === "}") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    out.push({ name, block: source.slice(match.index ?? 0, i + 1) });
  }
  return out;
}

describe("M46: rutas con cliente admin protegidas", () => {
  const files = collectRoutes(API_DIR);

  it("hay rutas que revisar", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("toda ruta que toca el admin exige sesión o CRON_SECRET (salvo lista blanca)", () => {
    const unprotected: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      if (!ADMIN_TOUCH.test(source)) continue;
      if (PROTECTED.test(source)) continue;
      const allowed = ALLOWLIST.find((entry) => relOf(file) === entry.rel);
      if (allowed) continue;
      unprotected.push(relOf(file));
    }
    expect(unprotected, `sin sesión ni CRON_SECRET: ${unprotected.join(", ")}`).toEqual([]);
  });

  it("la lista blanca es explícita, comentada y sólo inserta", () => {
    for (const entry of ALLOWLIST) {
      const source = readFileSync(path.join(ROOT, entry.rel), "utf8");
      for (const text of entry.mustContain) {
        expect(source, `${entry.rel} debe mencionar ${text}`).toContain(text);
      }
      for (const text of entry.mustNotContain) {
        expect(source, `${entry.rel} no debe usar ${text}`).not.toContain(text);
      }
    }
  });

  it("ninguna ruta usa el user id del body: sólo el de la sesión", () => {
    const offenders: string[] = [];
    const bodyUserId = /(body|parsed|input)\s*[.[]\s*['"]?(userId|user_id)\b/;
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      if (bodyUserId.test(source)) offenders.push(relOf(file));
    }
    expect(offenders, `user id del body: ${offenders.join(", ")}`).toEqual([]);
  });

  it("ningún esquema de request declara userId ni user_id", () => {
    const contracts = readFileSync(path.join(ROOT, "lib", "api", "contracts.ts"), "utf8");
    const offenders = requestSchemaBlocks(contracts)
      .filter(({ block }) => /\buser_?id\s*:/.test(block))
      .map(({ name }) => name);
    expect(offenders, `request con user id: ${offenders.join(", ")}`).toEqual([]);
  });
});
