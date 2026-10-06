/**
 * Verifica Auth de Supabase sin mandar correos.
 * Usa el admin API (no `signUp`). No imprime claves ni tokens.
 *
 * Uso: node scripts/verificar-auth.mjs
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const results = [];

function redact(value) {
  const marks = [
    ["sb", "secret"].join("_"),
    ["sb", "publishable"].join("_"),
  ];
  let text = String(value ?? "");
  for (const mark of marks) {
    text = text.replace(new RegExp(`${mark}_[A-Za-z0-9._-]+`, "g"), "[redacted]");
  }
  text = text.replace(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, "[redacted]");
  text = text.replace(/(?:access_token|refresh_token|apikey)=[^&\s]+/gi, "[redacted]");
  return text.replace(/\s+/g, " ").trim().slice(0, 180);
}

function record(step, status, detail) {
  results.push({ step, status });
  const extra = detail ? ` — ${detail}` : "";
  console.log(`${status}  ${step}${extra}`);
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

function envText(name) {
  return (process.env[name] ?? "").trim();
}

function httpUrl(value) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  } catch {
    return null;
  }
  return value.replace(/\/$/, "");
}

function missingSchema(error) {
  if (!error) return false;
  const code = String(error.code ?? "");
  if (code === "42P01" || code === "PGRST205" || code === "PGRST204" || code === "42703") return true;
  const message = String(error.message ?? "").toLowerCase();
  return (
    message.includes("schema cache") ||
    message.includes("does not exist") ||
    message.includes("could not find the table") ||
    message.includes("could not find the")
  );
}

function isUnconfirmed(error) {
  if (!error) return false;
  const code = String(error.code ?? "").toLowerCase();
  const message = String(error.message ?? "").toLowerCase();
  return code === "email_not_confirmed" || message.includes("email not confirmed");
}

function skipProfiles() {
  record("d select", "SKIP", "migracion no aplicada");
  record("d update", "SKIP", "migracion no aplicada");
  record("d rls", "SKIP", "migracion no aplicada");
}

async function checkProfiles(userClient, userId, meta) {
  const selected = await userClient
    .from("profiles")
    .select("id,email,nombre,rut,pais,fecha_nacimiento,telefono")
    .eq("id", userId);

  if (missingSchema(selected.error)) {
    skipProfiles();
    return;
  }

  if (selected.error) {
    record("d select", "FAIL", redact(selected.error.message));
  } else if (!selected.data || selected.data.length === 0) {
    record("d select", "FAIL", "sin fila");
  } else if (selected.data.length !== 1) {
    record("d select", "FAIL", "mas de una fila");
  } else {
    const row = selected.data[0];
    const bad = [];
    if (row.nombre !== meta.nombre) bad.push("nombre");
    if (row.rut !== meta.rut) bad.push("rut");
    if (row.pais !== meta.pais) bad.push("pais");
    if (String(row.fecha_nacimiento ?? "").slice(0, 10) !== meta.fecha_nacimiento) bad.push("fecha_nacimiento");
    if (row.telefono !== meta.telefono) bad.push("telefono");
    if (row.id !== userId) bad.push("id");
    if (row.email && row.email.toLowerCase() !== meta.email.toLowerCase()) bad.push("email");
    if (bad.length > 0) record("d select", "FAIL", `no coincide: ${bad.join(", ")}`);
    else record("d select", "PASS");
  }

  const nextPhone = "+56933333333";
  const updated = await userClient.from("profiles").update({ telefono: nextPhone }).eq("id", userId).select("id,telefono");
  if (missingSchema(updated.error)) {
    record("d update", "SKIP", "migracion no aplicada");
  } else if (updated.error) {
    record("d update", "FAIL", redact(updated.error.message));
  } else if (!updated.data || updated.data.length !== 1 || updated.data[0].telefono !== nextPhone || updated.data[0].id !== userId) {
    record("d update", "FAIL", "el telefono no quedo actualizado");
  } else {
    record("d update", "PASS");
  }

  const listed = await userClient.from("profiles").select("id");
  const others = await userClient.from("profiles").select("id").neq("id", userId);
  if (missingSchema(listed.error) || missingSchema(others.error)) {
    record("d rls", "SKIP", "migracion no aplicada");
    return;
  }
  if (listed.error || others.error) {
    record("d rls", "FAIL", redact((listed.error ?? others.error).message));
    return;
  }
  const foreign = (listed.data ?? []).filter((row) => row.id !== userId);
  if (foreign.length > 0 || (others.data ?? []).length > 0) {
    record("d rls", "FAIL", "devolvio filas ajenas");
    return;
  }
  if (!(listed.data ?? []).some((row) => row.id === userId)) {
    record("d rls", "FAIL", "el listado no incluye la fila propia");
    return;
  }
  record("d rls", "PASS");
}

async function main() {
  loadLocalEnv(path.join(root, ".env.local"));

  const url = httpUrl(envText("NEXT_PUBLIC_SUPABASE_URL"));
  const publishable = envText("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const secret = envText("SUPABASE_SECRET_KEY") || envText("SUPABASE_SERVICE_ROLE_KEY");
  const missing = [];
  if (!envText("NEXT_PUBLIC_SUPABASE_URL")) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  else if (!url) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!publishable) missing.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  if (!secret) missing.push("SUPABASE_SECRET_KEY");
  if (missing.length > 0 || !url) {
    record("entorno", "FAIL", `faltan o no sirven: ${missing.join(", ")}`);
    return;
  }

  const admin = createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const userClient = createClient(url, publishable, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const email = `maverlang.e2e+${Date.now()}@example.com`;
  const password = randomBytes(24).toString("base64url");
  const meta = {
    nombre: "Ana Prueba",
    rut: "11.111.111-1",
    pais: "CL",
    fecha_nacimiento: "1990-05-04",
    telefono: "+56911111111",
  };

  let userId = null;
  try {
    const created = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: false,
      user_metadata: meta,
    });
    userId = created.data?.user?.id ?? null;
    if (created.error || !userId) {
      record("a createUser", "FAIL", created.error ? redact(created.error.message) : "sin id");
      record("b signIn sin confirmar", "FAIL", "no ejecutado");
      record("c signIn confirmado", "FAIL", "no ejecutado");
      record("d select", "FAIL", "no ejecutado");
      record("d update", "FAIL", "no ejecutado");
      record("d rls", "FAIL", "no ejecutado");
      record("e signOut", "FAIL", "no ejecutado");
      return;
    }
    record("a createUser", "PASS");

    const blocked = await userClient.auth.signInWithPassword({ email, password });
    if (blocked.error && isUnconfirmed(blocked.error) && !blocked.data.session) {
      record("b signIn sin confirmar", "PASS");
    } else if (!blocked.error || blocked.data.session) {
      record("b signIn sin confirmar", "FAIL", "el ingreso funciono sin confirmar");
      await userClient.auth.signOut();
    } else {
      record("b signIn sin confirmar", "FAIL", redact(blocked.error.message));
    }

    const confirmed = await admin.auth.admin.updateUserById(userId, { email_confirm: true });
    const signed = confirmed.error ? null : await userClient.auth.signInWithPassword({ email, password });
    if (confirmed.error || !signed || signed.error || !signed.data.session) {
      const reason = confirmed.error
        ? redact(confirmed.error.message)
        : signed?.error
          ? redact(signed.error.message)
          : "sin sesion";
      record("c signIn confirmado", "FAIL", reason);
      record("d select", "FAIL", "sin sesion");
      record("d update", "FAIL", "sin sesion");
      record("d rls", "FAIL", "sin sesion");
    } else {
      record("c signIn confirmado", "PASS");
      await checkProfiles(userClient, userId, { ...meta, email });
    }

    const out = await userClient.auth.signOut();
    if (out.error) record("e signOut", "FAIL", redact(out.error.message));
    else record("e signOut", "PASS");
  } catch (error) {
    record("inesperado", "FAIL", redact(error instanceof Error ? error.message : error));
  } finally {
    if (!userId) {
      record("limpieza", "SKIP", "no hubo usuario");
      return;
    }
    try {
      const removed = await admin.auth.admin.deleteUser(userId, false);
      if (removed.error) record("limpieza", "FAIL", redact(removed.error.message));
      else record("limpieza", "PASS");
    } catch (error) {
      record("limpieza", "FAIL", redact(error instanceof Error ? error.message : error));
    }
  }
}

await main();
const fail = results.filter((item) => item.status === "FAIL").length;
const pass = results.filter((item) => item.status === "PASS").length;
const skip = results.filter((item) => item.status === "SKIP").length;
console.log(`RESUMEN: ${fail > 0 ? "FAIL" : "PASS"} (${pass} PASS, ${fail} FAIL, ${skip} SKIP)`);
process.exit(fail > 0 ? 1 : 0);
