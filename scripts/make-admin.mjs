/**
 * Alta de un admin en public.app_admins (M57).
 * Lo corre el operador. No corre en el servidor web.
 *
 * Uso: node scripts/make-admin.mjs <email>
 *
 * Lee la secret key del entorno (SUPABASE_SECRET_KEY o el nombre viejo).
 * No imprime claves. Idempotente: si el usuario ya es admin, no duplica.
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

import { ensureProjectConfirmed } from "./project-guard.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function redact(value) {
  const marks = [["sb", "secret"].join("_"), ["sb", "publishable"].join("_")];
  let text = String(value ?? "");
  for (const mark of marks) {
    text = text.replace(new RegExp(`${mark}_[A-Za-z0-9._-]+`, "g"), "[redacted]");
  }
  text = text.replace(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, "[redacted]");
  return text.replace(/\s+/g, " ").trim().slice(0, 180);
}

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

function emailArg() {
  const args = process.argv.slice(2);
  const skip = new Set();
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--confirm-project") {
      skip.add(i);
      skip.add(i + 1);
    }
  }
  const positional = args.filter((arg, index) => !skip.has(index) && !arg.startsWith("--"));
  return (positional[0] ?? "").trim().toLowerCase();
}

function isEmail(value) {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function findUserId(admin, email) {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return { error: redact(error.message) };
    const users = data?.users ?? [];
    const found = users.find((user) => (user.email ?? "").trim().toLowerCase() === email);
    if (found?.id) return { id: found.id };
    if (users.length < 200) return { id: null };
  }
  return { id: null };
}

async function main() {
  const email = emailArg();
  if (!isEmail(email)) {
    console.error("Uso: node scripts/make-admin.mjs <email>");
    return 1;
  }

  loadLocalEnv(path.join(root, ".env.local"));
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/$/, "");
  const secret =
    (process.env.SUPABASE_SECRET_KEY ?? "").trim() ||
    (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  try {
    new URL(url);
  } catch {
    console.error("FALTA  URL de Supabase");
    return 1;
  }
  if (!secret) {
    console.error("FALTA  secret key en el entorno");
    return 1;
  }

  ensureProjectConfirmed({ targetUrl: url, script: "make-admin" });

  const admin = createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const found = await findUserId(admin, email);
  if (found.error) {
    console.error(`FALLO  buscar usuario — ${found.error}`);
    return 1;
  }
  if (!found.id) {
    console.error("No hay un usuario con ese correo.");
    return 1;
  }

  const existing = await admin.from("app_admins").select("user_id").eq("user_id", found.id).maybeSingle();
  if (existing.error) {
    console.error(`FALLO  leer app_admins — ${redact(existing.error.message)}`);
    return 1;
  }
  if (existing.data?.user_id) {
    console.log("OK  ya era admin");
    return 0;
  }

  const inserted = await admin.from("app_admins").insert({ user_id: found.id, note: "alta por script" });
  if (inserted.error) {
    console.error(`FALLO  insertar — ${redact(inserted.error.message)}`);
    return 1;
  }
  console.log("OK  app_admins");
  return 0;
}

let code = 1;
try {
  code = await main();
} catch (error) {
  console.error(`FALLO  ${redact(error instanceof Error ? error.message : error)}`);
  code = 1;
}
process.exit(code);
