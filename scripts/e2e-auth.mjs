/**
 * Corre sólo e2e/auth-supabase.spec.ts con AUTH_MODE=supabase.
 * No forma parte de `npm run e2e` (ese sigue en mock).
 * Carga `.env.local` sin imprimir valores. El build usa `.next-e2e-auth`.
 *
 * Uso: node scripts/e2e-auth.mjs
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function unquote(value) {
  if (value.length >= 2) {
    const open = value[0];
    const close = value[value.length - 1];
    if ((open === '"' && close === '"') || (open === "'" && close === "'")) return value.slice(1, -1);
  }
  return value;
}

function loadLocalEnv(filePath) {
  if (typeof process.loadEnvFile === "function") {
    try {
      process.loadEnvFile(filePath);
      return;
    } catch {
      // Sigue el parser si el archivo no está o Node no pudo leerlo.
    }
  }
  if (!existsSync(filePath)) return;
  let raw = "";
  try {
    raw = readFileSync(filePath, "utf8");
  } catch {
    return;
  }
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const body = trimmed.startsWith("export ") ? trimmed.slice(7).trim() : trimmed;
    const eq = body.indexOf("=");
    if (eq <= 0) continue;
    const key = body.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (process.env[key] !== undefined) continue;
    process.env[key] = unquote(body.slice(eq + 1).trim());
  }
}

loadLocalEnv(path.join(root, ".env.local"));

const env = {};
for (const [key, value] of Object.entries(process.env)) {
  if (typeof value === "string") env[key] = value;
}
env.AUTH_MODE = "supabase";
env.NEXT_PUBLIC_AUTH_MODE = "supabase";
env.E2E_AUTH = "supabase";
env.DATA_MODE = "mock";
env.NEXT_PUBLIC_DATA_MODE = "mock";
// M49: el e2e no usa la base de Upstash ni comparte límites (memoria local).
env.RATE_LIMIT_BACKEND = "memory";
env.NEXT_DIST_DIR = ".next-e2e-auth";

const missing = [];
if (!env.NEXT_PUBLIC_SUPABASE_URL?.trim()) missing.push("NEXT_PUBLIC_SUPABASE_URL");
if (!env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim()) missing.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
if (!env.SUPABASE_SECRET_KEY?.trim() && !env.SUPABASE_SERVICE_ROLE_KEY?.trim()) missing.push("SUPABASE_SECRET_KEY");
if (missing.length > 0) {
  console.error(`Faltan ${missing.join(", ")}.`);
  process.exit(1);
}

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: root,
      env,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${args.join(" ")} terminó con código ${code ?? "null"}`));
    });
  });
}

const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
const playwrightCli = path.join(root, "node_modules", "@playwright", "test", "cli.js");

await run([nextBin, "build"]);
await run([playwrightCli, "test", "e2e/auth-supabase.spec.ts"]);
