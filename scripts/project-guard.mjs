/**
 * Guardia de proyecto para scripts con la secret key (M46).
 *
 * - Imprime a qué proyecto apunta (sólo el ref del host, sin claves ni URLs).
 * - Si el host destino no es el de desarrollo (`.env.local`), exige
 *   `--confirm-project <ref>`.
 * - Nunca imprime valores de variables, sólo el ref.
 *
 * Se usa en: sync-xstocks, verificar-auth, audit-rls, audit-catalog (--db) y
 * e2e-auth. Nunca se ejecuta desde una ruta pública: el sync en Vercel va
 * por la ruta con `CRON_SECRET` (M50).
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Ref del proyecto: primer tramo del host (`abcd1234` en `abcd1234.supabase.co`). */
export function supabaseRefOf(url) {
  try {
    const host = new URL(String(url)).hostname;
    const ref = host.split(".")[0] ?? "";
    return ref.length > 0 ? ref : null;
  } catch {
    return null;
  }
}

/**
 * Lee la URL de desarrollo directo del archivo `.env.local`, sin pasar por
 * `process.env` (que ya puede traer el destino). Nunca imprime el valor.
 */
export function readDevSupabaseUrl() {
  const file = path.join(ROOT, ".env.local");
  if (!existsSync(file)) return null;
  let raw = "";
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    return null;
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const body = trimmed.startsWith("export ") ? trimmed.slice(7).trim() : trimmed;
    const eq = body.indexOf("=");
    if (eq <= 0) continue;
    if (body.slice(0, eq).trim() !== "NEXT_PUBLIC_SUPABASE_URL") continue;
    let value = body.slice(eq + 1).trim().replace(/\s+#.*$/, "").trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    return value.length > 0 ? value : null;
  }
  return null;
}

function confirmFlag() {
  const at = process.argv.indexOf("--confirm-project");
  if (at < 0) return "";
  return (process.argv[at + 1] ?? "").trim();
}

/**
 * Imprime el ref destino y, si no es el de desarrollo, exige
 * `--confirm-project <ref>`. Sale con código 1 si falta o no coincide.
 */
export function ensureProjectConfirmed({ targetUrl, script }) {
  const ref = supabaseRefOf(targetUrl);
  console.log(`[${script}] proyecto Supabase: ${ref ?? "desconocido"}`);
  const devRef = supabaseRefOf(readDevSupabaseUrl() ?? "");
  if (devRef && ref && ref === devRef) return { ref };
  const given = confirmFlag();
  if (given && ref && given === ref) return { ref };
  console.error(
    `[${script}] el destino (${ref ?? "desconocido"}) no es el de desarrollo ` +
      `(${devRef ?? "desconocido"}). Revisa y reintenta con --confirm-project ${ref ?? "<ref>"}.`,
  );
  process.exit(1);
  return { ref };
}
