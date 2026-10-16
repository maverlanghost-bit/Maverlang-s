/**
 * Auditoría de dependencias con excepciones documentadas (CI fix).
 *
 * Reemplaza a `npm audit --omit=dev --audit-level=high` como gate del CI.
 * Sigue fallando con cualquier vulnerabilidad alta o crítica, EXCEPTO los
 * advisories aceptados explícitamente en `docs/SEGURIDAD.md` §Dependencias
 * (sin parche compatible: el único fix de npm es `--force` con breaking).
 *
 * Un advisory aceptado se identifica por su URL de GHSA: cualquier advisory
 * NUEVO (otra URL) en el mismo paquete vuelve a romper el gate, y Dependabot
 * sigue avisando del fix upstream. Las moderadas/bajas son informativas.
 *
 * Falla cerrado: si `npm audit` no responde o el JSON no se puede leer,
 * sale 1 (un escáner roto no puede dar luz verde).
 *
 * Uso: npm run audit:deps
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Advisories de severidad alta/crítica aceptados con justificación.
 * Cada entrada DEBE estar documentada en `docs/SEGURIDAD.md` §Dependencias
 * (lo exige tests/unit/audit-deps.test.ts).
 */
export const ACCEPTED_ADVISORIES = Object.freeze({
  // bigint-buffer: desbordamiento en toBigIntLE(). Ruta @solana/spl-token →
  // buffer-layout-utils; sin uso directo (git grep toBigIntLE vacío) y sin
  // parche 0.4.x (el fix de npm baja spl-token a 0.1.8, breaking).
  "https://github.com/advisories/GHSA-3gc7-fjrx-p6mg": "bigint-buffer vía @solana/spl-token (sin parche 0.4.x)",
  // ws 8.x en copias anidadas vía @privy-io/react-auth → WalletConnect/viem:
  // el código propio nunca importa ws (WebSocket nativo en navegador). El
  // override raíz ya está en 8.22.0; las copias anidadas sólo las corrige un
  // release upstream. Aparecen sólo si el árbol vuelve a traer ws viejo.
  "https://github.com/advisories/GHSA-58qx-3vcg-4xpx": "ws 8.x anidado vía @privy-io/react-auth",
  "https://github.com/advisories/GHSA-96hv-2xvq-fx4p": "ws 8.x anidado vía @privy-io/react-auth",
});

/** Severidades que rompen el gate. */
const BLOCKING_SEVERITIES = new Set(["high", "critical"]);

/**
 * Recorre el reporte de `npm audit --json` y separa los advisories
 * bloqueantes de los aceptados. Pura: la usan los tests.
 *
 * La aceptación es por advisory (URL) Y por severidad: sólo cubre "high"
 * (así lo documenta docs/SEGURIDAD.md). Si npm re-califica un advisory
 * aceptado a critical, vuelve a romper el gate.
 * @param {unknown} report JSON de npm audit
 * @returns {{ blocking: Array<{ url: string, title: string, severity: string, name: string, packages: string[] }>, accepted: Array<{ url: string, title: string, severity: string, name: string, packages: string[] }> }}
 */
export function collectAdvisoryFindings(report) {
  const out = { blocking: [], accepted: [] };
  if (typeof report !== "object" || report === null) return out;
  const vulnerabilities = /** @type {Record<string, unknown>} */ (report).vulnerabilities;
  if (typeof vulnerabilities !== "object" || vulnerabilities === null) return out;
  /** @type {Map<string, { url: string, title: string, severity: string, name: string, packages: Set<string> }>} */
  const byUrl = new Map();
  for (const [packageName, entry] of Object.entries(
    /** @type {Record<string, unknown>} */ (vulnerabilities),
  )) {
    if (typeof entry !== "object" || entry === null) continue;
    const via = /** @type {Record<string, unknown>} */ (entry).via;
    if (!Array.isArray(via)) continue;
    for (const leaf of via) {
      if (typeof leaf !== "object" || leaf === null) continue;
      const advisory = /** @type {Record<string, unknown>} */ (leaf);
      const url = typeof advisory.url === "string" ? advisory.url : null;
      const severity = typeof advisory.severity === "string" ? advisory.severity : "";
      if (!url || !BLOCKING_SEVERITIES.has(severity)) continue;
      const existing = byUrl.get(url);
      if (existing) {
        existing.packages.add(packageName);
        // La severidad peorea: un mismo advisory reportado alto en un paquete
        // y crítico en otro se trata como crítico.
        if (severity === "critical") existing.severity = "critical";
        continue;
      }
      byUrl.set(url, {
        url,
        title: typeof advisory.title === "string" ? advisory.title : url,
        severity,
        name: typeof advisory.name === "string" ? advisory.name : packageName,
        packages: new Set([packageName]),
      });
    }
  }
  for (const finding of byUrl.values()) {
    const accepted =
      finding.severity === "high" && ACCEPTED_ADVISORIES[urlOf(finding)] !== undefined;
    const target = accepted ? out.accepted : out.blocking;
    target.push({ ...finding, packages: [...finding.packages].sort() });
  }
  out.blocking.sort((a, b) => a.url.localeCompare(b.url));
  out.accepted.sort((a, b) => a.url.localeCompare(b.url));
  return out;
}

/** @param {{ url: string }} finding */
function urlOf(finding) {
  return finding.url;
}

/**
 * Cuenta totales del reporte (informativo).
 * @param {unknown} report JSON de npm audit
 * @returns {{ total: number, moderate: number, low: number }}
 */
export function summarizeCounts(report) {
  if (typeof report !== "object" || report === null) return { total: 0, moderate: 0, low: 0 };
  const metadata = /** @type {Record<string, unknown>} */ (report).metadata;
  if (typeof metadata !== "object" || metadata === null) return { total: 0, moderate: 0, low: 0 };
  const counts = /** @type {Record<string, unknown>} */ (metadata).vulnerabilities;
  const read = (key) => {
    const value = Number(/** @type {Record<string, unknown>} */ (counts)?.[key]);
    return Number.isFinite(value) ? value : 0;
  };
  return { total: read("total"), moderate: read("moderate"), low: read("low") };
}

function runNpmAudit() {
  // Bajo `npm run` (el caso del CI), `npm_execpath` apunta al CLI de npm:
  // correrlo con process.execPath evita el shell del todo (en Windows npm
  // es un .cmd y spawnSync lo rechaza sin shell desde el fix de
  // CVE-2024-27980). Fallback para invocación directa o CLI atípico: el
  // binario `npm` (shell sólo en Windows; los argumentos son literales,
  // sin entrada externa).
  const options = { cwd: ROOT, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 };
  const args = ["audit", "--omit=dev", "--json"];
  const npmCli = typeof process.env.npm_execpath === "string" ? process.env.npm_execpath : null;
  if (npmCli) {
    const res = spawnSync(process.execPath, [npmCli, ...args], options);
    if (!res.error) return res;
  }
  return spawnSync("npm", args, { ...options, shell: process.platform === "win32" });
}

async function main() {
  const res = runNpmAudit();
  if (res.error) {
    console.error(`audit:deps: no se pudo correr npm audit: ${res.error.message}`);
    process.exitCode = 1;
    return;
  }
  let report;
  try {
    report = JSON.parse(res.stdout);
  } catch {
    console.error("audit:deps: la salida de npm audit no es JSON válido.");
    console.error(String(res.stderr ?? "").slice(0, 400));
    process.exitCode = 1;
    return;
  }
  if (typeof report === "object" && report !== null && "error" in /** @type {object} */ (report)) {
    console.error(`audit:deps: npm audit devolvió un error: ${JSON.stringify(/** @type {Record<string, unknown>} */ (report).error).slice(0, 400)}`);
    process.exitCode = 1;
    return;
  }
  const { blocking, accepted } = collectAdvisoryFindings(report);
  const counts = summarizeCounts(report);
  for (const finding of accepted) {
    console.log(
      `aceptado ${finding.severity} ${finding.name} (${finding.packages.join(", ")}): ${ACCEPTED_ADVISORIES[finding.url]}`,
    );
  }
  for (const finding of blocking) {
    console.log(
      `BLOQUEANTE ${finding.severity} ${finding.name} (${finding.packages.join(", ")}): ${finding.title} — ${finding.url}`,
    );
  }
  const summary = `${counts.total} vulnerabilidad(es): ${blocking.length} alta(s)/crítica(s) no aceptada(s), ${accepted.length} aceptada(s) según docs/SEGURIDAD.md, ${counts.moderate} moderada(s) informativas.`;
  if (blocking.length > 0) {
    console.log(`audit:deps: ${summary}`);
    console.log("audit:deps: revisa el advisory o agrega la excepción en docs/SEGURIDAD.md §Dependencias.");
    process.exitCode = 1;
    return;
  }
  console.log(`audit:deps: OK. ${summary}`);
}

const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invoked === fileURLToPath(import.meta.url)) {
  await main();
}
