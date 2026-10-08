/**
 * Escáner de secretos (M46). Sin dependencias.
 *
 * - Árbol de trabajo: archivos versionados (`git ls-files`). Sale 1 si
 *   `.env.local` está versionado.
 * - `--history` (lento): además todo el historial (`git log -p --all`).
 * - Bundle cliente si existe un build (`.next-verify/static` o
 *   `.next/static`): ningún nombre de variable secreta ni valor con patrones.
 *
 * Ojo: `@supabase/supabase-js` trae el texto `sb_secret_` suelto; ese
 * prefijo sin una clave detrás NO es un hallazgo. En el bundle sólo cuenta
 * `sb_secret_` seguido de 20+ caracteres `[A-Za-z0-9_-]` o un JWT cuyo
 * payload trae `"role":"service_role"`.
 *
 * Imprime archivo, línea y commit (historial) con el valor ENMASCARADO
 * (primeros 6 caracteres + "…"). Nunca imprime el valor completo ni la
 * línea entera. Sale con código 1 si encuentra algo.
 *
 * Uso:
 *   node scripts/scan-secrets.mjs            (árbol de trabajo + bundle)
 *   node scripts/scan-secrets.mjs --history  (además todo el historial)
 *   npm run scan:secrets
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Enmascara un valor: nunca se imprime completo. */
export function maskSecret(value) {
  return `${String(value).slice(0, 6)}…`;
}

/**
 * Patrones de valor (árbol + historial). Los literales del propio script no
 * coinciden consigo mismos: tras el prefijo siempre viene `[`, fuera de la
 * clase. `sk_live_` y `xox?-` exigen 10+ caracteres para no marcar menciones.
 */
const VALUE_PATTERNS = [
  { name: "sb_secret", regex: /sb_secret_[A-Za-z0-9_-]{10,}/g },
  { name: "jwt", regex: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g },
  { name: "private-key", regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  { name: "solana-key-array", regex: /\[(\s*\d{1,3}\s*,){63}\s*\d{1,3}\s*\]/g },
  { name: "resend", regex: /re_[A-Za-z0-9]{20,}/g },
  { name: "stripe-live", regex: /sk_live_[A-Za-z0-9]{10,}/g },
  { name: "slack", regex: /xox[baprs]-[A-Za-z0-9-]{10,}/g },
  { name: "aws-key", regex: /AKIA[0-9A-Z]{16}/g },
];

/** `sb_publishable_` sólo cuenta fuera de los ejemplos (la pública no es secreta). */
const PUBLISHABLE_PATTERN = { name: "sb_publishable", regex: /sb_publishable_[A-Za-z0-9_-]{10,}/g };
const PUBLISHABLE_EXEMPT = new Set([".env.example", "docs/.env.example"]);

/** Nombres de variable que nunca van en el bundle del navegador. */
export const BUNDLE_SECRET_NAMES = [
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "PRIVY_APP_SECRET",
  "JUPITER_API_KEY",
  "KOYWE_SECRET",
  "KOYWE_WEBHOOK_SECRET",
  "CRON_SECRET",
  "SENTRY_AUTH_TOKEN",
  "RESEND_API_KEY",
  "UPSTASH_REDIS_REST_TOKEN",
  "HELIUS_API_KEY",
];

/** En el bundle, `sb_secret_` sólo cuenta con 20+ caracteres detrás. */
const BUNDLE_SB_SECRET = /sb_secret_[A-Za-z0-9_-]{20,}/g;
const BUNDLE_JWT = /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g;
const BUNDLE_NAME_REGEX = new RegExp(`\\b(${BUNDLE_SECRET_NAMES.join("|")})\\b`);

function base64UrlToText(segment) {
  const padded = segment.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded, "base64").toString("utf8");
}

/** true si el JWT trae `"role":"service_role"` en el payload. */
export function isServiceRoleJwt(token) {
  const parts = String(token).split(".");
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(base64UrlToText(parts[1]));
    return payload != null && typeof payload === "object" && payload.role === "service_role";
  } catch {
    return false;
  }
}

/** Hallazgos en un texto (árbol/historial): [{ name, match }]. */
export function findWorktreeSecrets(text, relPath) {
  const out = [];
  for (const { name, regex } of VALUE_PATTERNS) {
    regex.lastIndex = 0;
    let m;
    while ((m = regex.exec(text)) !== null) out.push({ name, match: m[0] });
  }
  if (!PUBLISHABLE_EXEMPT.has(relPath)) {
    PUBLISHABLE_PATTERN.regex.lastIndex = 0;
    let m;
    while ((m = PUBLISHABLE_PATTERN.regex.exec(text)) !== null) {
      out.push({ name: PUBLISHABLE_PATTERN.name, match: m[0] });
    }
  }
  return out;
}

/** Hallazgos en un texto del bundle: [{ name, match }]. */
export function findBundleSecrets(text) {
  const out = [];
  BUNDLE_SB_SECRET.lastIndex = 0;
  let m;
  while ((m = BUNDLE_SB_SECRET.exec(text)) !== null) out.push({ name: "sb_secret", match: m[0] });
  BUNDLE_JWT.lastIndex = 0;
  while ((m = BUNDLE_JWT.exec(text)) !== null) {
    if (!isServiceRoleJwt(m[0])) {
      // Sin rol de servicio puede ser un token de usuario: se ignora salvo
      // que el texto cercano mencione el rol de servicio.
      const at = text.indexOf(m[0]);
      const near = text.slice(Math.max(0, at - 500), at + m[0].length + 500);
      if (!near.includes("service_role")) continue;
    }
    out.push({ name: "service-role-jwt", match: m[0] });
  }
  const named = text.match(BUNDLE_NAME_REGEX);
  if (named) out.push({ name: "secret-name", match: named[1] });
  return out;
}

function trackedFiles() {
  const res = spawnSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (res.status !== 0) throw new Error("scan:secrets: no se pudo leer git ls-files");
  return res.stdout.split("\0").filter((f) => f.length > 0);
}

function looksBinary(buffer) {
  const sample = buffer.subarray(0, 8192);
  for (let i = 0; i < sample.length; i += 1) if (sample[i] === 0) return true;
  return false;
}

function readTextFile(abs) {
  try {
    const stat = statSync(abs);
    if (!stat.isFile() || stat.size > 10 * 1024 * 1024) return null;
    const buffer = readFileSync(abs);
    if (looksBinary(buffer)) return null;
    return buffer.toString("utf8");
  } catch {
    return null;
  }
}

/** Escanea el árbol de trabajo. Devuelve hallazgos [{ file, line, name, masked }]. */
export function scanWorktree() {
  const findings = [];
  for (const file of trackedFiles()) {
    if (file === ".env.local") {
      findings.push({ file, line: 0, name: "env-local-tracked", masked: ".env.l…" });
      continue;
    }
    const text = readTextFile(path.join(ROOT, file));
    if (text === null) continue;
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i += 1) {
      for (const { name, match } of findWorktreeSecrets(lines[i], file)) {
        findings.push({ file, line: i + 1, name, masked: maskSecret(match) });
      }
    }
  }
  return findings;
}

function parseHunkStart(header) {
  const m = /\+(\d+)(?:,(\d+))?/.exec(header);
  return m ? Number(m[1]) : null;
}

/** Escanea el historial (`git log -p --all`). Lento. */
export function scanHistory() {
  const res = spawnSync("git", ["log", "-p", "--all", "--no-color", "--no-ext-diff", "--unified=0"], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 512 * 1024 * 1024,
  });
  if (res.status !== 0) throw new Error("scan:secrets: no se pudo leer git log -p --all");
  const findings = [];
  let commit = null;
  let file = null;
  let newLine = 0;
  for (const line of res.stdout.split("\n")) {
    if (line.startsWith("commit ")) {
      commit = line.slice(7).trim().split(" ")[0];
      file = null;
      continue;
    }
    if (line.startsWith("+++ b/")) {
      file = line.slice(6).trim();
      continue;
    }
    if (line.startsWith("@@")) {
      const start = parseHunkStart(line);
      newLine = start === null ? 0 : start - 1;
      continue;
    }
    if (!line.startsWith("+") || line.startsWith("+++") || commit === null) continue;
    newLine += 1;
    const text = line.slice(1);
    for (const { name, match } of findWorktreeSecrets(text, file ?? "")) {
      findings.push({ commit: commit.slice(0, 12), file: file ?? "?", line: newLine, name, masked: maskSecret(match) });
    }
  }
  return findings;
}

function bundleDir() {
  const verify = path.join(ROOT, ".next-verify", "static");
  if (existsSync(verify)) return verify;
  const next = path.join(ROOT, ".next", "static");
  if (existsSync(next)) return next;
  return null;
}

function collectJsFiles(dir, out) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      collectJsFiles(full, out);
      continue;
    }
    if (full.endsWith(".js")) out.push(full);
  }
  return out;
}

/** Escanea el bundle cliente. Devuelve { skipped, findings }. */
export function scanBundle() {
  const dir = bundleDir();
  if (!dir) return { skipped: true, findings: [] };
  const findings = [];
  for (const abs of collectJsFiles(dir, [])) {
    const text = readTextFile(abs);
    if (text === null) continue;
    // Por archivo, un hallazgo por nombre: basta para frenar el deploy.
    const seen = new Set();
    for (const { name, match } of findBundleSecrets(text)) {
      const key = `${name}:${name === "secret-name" ? match : "valor"}`;
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push({
        file: path.relative(ROOT, abs).replace(/\\/g, "/"),
        line: 0,
        name: `bundle:${name}`,
        masked: name === "secret-name" ? match : maskSecret(match),
      });
    }
  }
  return { skipped: false, findings };
}

function printFinding(f) {
  const where = f.commit ? `${f.commit} ${f.file}:${f.line}` : `${f.file}:${f.line}`;
  // Sólo el enmascarado: nunca el valor ni la línea entera.
  console.log(`SECRETO ${f.name} ${where} ${f.masked}`);
}

async function main() {
  const withHistory = process.argv.includes("--history");
  const worktree = scanWorktree();
  for (const f of worktree) printFinding(f);
  let history = [];
  if (withHistory) {
    history = scanHistory();
    for (const f of history) printFinding(f);
  }
  const bundle = scanBundle();
  if (bundle.skipped) {
    console.log("bundle: sin build (.next-verify/static ni .next/static), se salta.");
  } else {
    for (const f of bundle.findings) printFinding(f);
  }
  const total = worktree.length + history.length + bundle.findings.length;
  if (total > 0) {
    console.log(`scan:secrets: ${total} hallazgo(s).`);
    process.exitCode = 1;
    return;
  }
  console.log("scan:secrets: limpio.");
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invoked === fileURLToPath(import.meta.url)) {
  await main();
}
