#!/usr/bin/env node
/**
 * Pre-flight de entorno para producción — sin imprimir valores.
 *
 * Revisa, por nombre, lo obligatorio para que el dinero real tenga sentido y
 * muestra OK / FALTA / AVISO. No lee `.env*`, no llama a la red y no toca la
 * base: mira `process.env` del proceso que lo ejecuta (en Vercel, el del
 * proyecto; en local, el que exportes).
 *
 * Bloqueantes (exit 1 si falta alguno): modo de datos y auth, candado de
 * ejecución real, llaves de Supabase/Privy, sitio y RPC https, Jupiter, cron y
 * la versión de la declaración no-US. Los avisos no bloquean: depósitos,
 * patrocinio/KMS y coherencias que `lib/env.ts` exige en modo estricto.
 *
 * Nunca imprime un valor: ni largo, ni prefijo, ni hash. Sólo el estado y qué
 * se espera. Los nombres son los de `lib/env.ts`; los que se leen directo de
 * `process.env` (ej. `PRIVY_JWT_VERIFICATION_KEY`) se marcan como tales.
 *
 * Uso:
 *   node scripts/check-production-ready.mjs
 */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const ENV_SOURCE_FILE = path.join(ROOT, "lib", "env.ts");

/** Mismo formato que exige `set_us_person_declaration_version` (0046). */
const DECLARATION_VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
/** Valores que `lib/wallet/deposit-sync.ts` acepta para encender el barrido. */
const DEPOSIT_SYNC_ON = new Set(["on", "1", "true", "enabled"]);
const DEVNET_HINTS = /(devnet|testnet|localhost|127\.0\.0\.1)/i;

function norm(value) {
  return typeof value === "string" ? value.trim() : "";
}

function lower(value) {
  return norm(value).toLowerCase();
}

function isSet(value) {
  return norm(value) !== "";
}

function isHttps(value) {
  try {
    return new URL(norm(value)).protocol === "https:";
  } catch {
    return false;
  }
}

function isHttpUrl(value) {
  try {
    const protocol = new URL(norm(value)).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

/** "ok" | "missing" (ausente) | "invalid" (definida pero no sirve). */
function valueState(value, ok) {
  if (!isSet(value)) return "missing";
  return ok ? "ok" : "invalid";
}

function printUsage() {
  console.log("Uso: node scripts/check-production-ready.mjs");
}

/** Nombres de lib/env.ts, sólo para marcar los que viven fuera de ese archivo. */
function envSourceText() {
  if (!existsSync(ENV_SOURCE_FILE)) return null;
  try {
    return readFileSync(ENV_SOURCE_FILE, "utf8");
  } catch {
    return null;
  }
}

/** ¿Alguno de los nombres aparece literal en lib/env.ts? */
function declaredInEnvSource(source, names) {
  if (!source) return true;
  return names.some((name) => source.includes(name));
}

function buildRequired() {
  return [
    {
      names: ["DATA_MODE"],
      requirement: "live",
      check: (env) => valueState(env.DATA_MODE, lower(env.DATA_MODE) === "live"),
      invalidText: "definida pero no es live",
    },
    {
      names: ["AUTH_MODE"],
      requirement: "supabase",
      check: (env) => valueState(env.AUTH_MODE, lower(env.AUTH_MODE) === "supabase"),
      invalidText: "definida pero no es supabase",
    },
    {
      names: ["ALLOW_MOCK_AUTH"],
      requirement: "distinta de true",
      check: (env) => (isSet(env.ALLOW_MOCK_AUTH) && lower(env.ALLOW_MOCK_AUTH) === "true" ? "invalid" : "ok"),
      invalidText: "está en true: la demo de auth queda publicada",
    },
    {
      names: ["REAL_EXECUTION_UNLOCKED"],
      requirement: "true (abre el candado de ejecución real)",
      check: (env) => valueState(env.REAL_EXECUTION_UNLOCKED, lower(env.REAL_EXECUTION_UNLOCKED) === "true"),
      invalidText: "definida pero no es true: toda operación real responde 503 REAL_DISABLED",
    },
    {
      names: ["NEXT_PUBLIC_SUPABASE_URL"],
      requirement: "URL http(s) del proyecto de producción",
      check: (env) => valueState(env.NEXT_PUBLIC_SUPABASE_URL, isHttpUrl(env.NEXT_PUBLIC_SUPABASE_URL)),
      invalidText: "definida pero no es una URL http(s)",
      warnText: (env) => (isSet(env.NEXT_PUBLIC_SUPABASE_URL) && !isHttps(env.NEXT_PUBLIC_SUPABASE_URL) ? "no es https" : null),
    },
    {
      names: ["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"],
      requirement: "definida",
      check: (env) => valueState(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, true),
    },
    {
      names: ["SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"],
      requirement: "definida (vale el alias SUPABASE_SERVICE_ROLE_KEY)",
      check: (env) =>
        valueState(
          env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY,
          isSet(env.SUPABASE_SECRET_KEY) || isSet(env.SUPABASE_SERVICE_ROLE_KEY),
        ),
    },
    {
      names: ["NEXT_PUBLIC_PRIVY_APP_ID"],
      requirement: "definida",
      check: (env) => valueState(env.NEXT_PUBLIC_PRIVY_APP_ID, true),
    },
    {
      names: ["PRIVY_APP_SECRET", "PRIVY_JWT_VERIFICATION_KEY"],
      requirement: "PRIVY_APP_SECRET o PRIVY_JWT_VERIFICATION_KEY",
      check: (env) =>
        valueState(
          env.PRIVY_APP_SECRET || env.PRIVY_JWT_VERIFICATION_KEY,
          isSet(env.PRIVY_APP_SECRET) || isSet(env.PRIVY_JWT_VERIFICATION_KEY),
        ),
      invalidText: "ninguna de las dos llaves de Privy está definida",
    },
    {
      names: ["NEXT_PUBLIC_SITE_URL"],
      requirement: "https",
      check: (env) => valueState(env.NEXT_PUBLIC_SITE_URL, isHttps(env.NEXT_PUBLIC_SITE_URL)),
      invalidText: "definida pero no es https",
    },
    {
      names: ["SOLANA_RPC_URL"],
      requirement: "https y no devnet/testnet/local",
      check: (env) =>
        valueState(
          env.SOLANA_RPC_URL,
          isHttps(env.SOLANA_RPC_URL) && !DEVNET_HINTS.test(norm(env.SOLANA_RPC_URL)),
        ),
      invalidText: "definida pero no es https de mainnet",
    },
    {
      names: ["JUPITER_BASE_URL"],
      requirement: "URL http(s) de Jupiter",
      check: (env) => valueState(env.JUPITER_BASE_URL, isHttpUrl(env.JUPITER_BASE_URL)),
      invalidText: "definida pero no es una URL http(s)",
    },
    {
      names: ["CRON_SECRET"],
      requirement: ">= 24 caracteres (lib/env.ts estricto exige 32)",
      check: (env) => valueState(env.CRON_SECRET, norm(env.CRON_SECRET).length >= 24),
      invalidText: "definida pero con menos de 24 caracteres",
      warnText: (env) => {
        const length = norm(env.CRON_SECRET).length;
        return length >= 24 && length < 32 ? "cumple acá pero el modo estricto de lib/env.ts pide 32" : null;
      },
    },
    {
      names: ["US_PERSON_DECLARATION_VERSION"],
      requirement: "definida y con formato de 0046 (debe coincidir con compliance_config)",
      check: (env) =>
        valueState(env.US_PERSON_DECLARATION_VERSION, DECLARATION_VERSION_PATTERN.test(norm(env.US_PERSON_DECLARATION_VERSION))),
      invalidText: "definida pero no cumple el formato de 0046",
    },
  ];
}

/** Avisos no bloqueantes: nunca cambian el código de salida. */
function buildWarnings() {
  return [
    {
      names: ["WALLET_DEPOSIT_SYNC"],
      text: (env) =>
        DEPOSIT_SYNC_ON.has(lower(env.WALLET_DEPOSIT_SYNC))
          ? "encendido: el barrido corre sólo si deposits_enabled también está en true"
          : "apagado o ausente: el barrido de depósitos no corre",
    },
    {
      names: ["SPONSOR_ENABLED"],
      text: (env) =>
        lower(env.SPONSOR_ENABLED) === "true"
          ? "true: el patrocinio sigue en stub (KMS no configurado), no prometerlo"
          : "apagado (default); el KMS de patrocinio sigue sin implementar",
    },
    {
      names: ["REAL_TRADING_READY"],
      text: (env) =>
        lower(env.DATA_MODE) === "live" && lower(env.REAL_TRADING_READY) !== "true"
          ? "DATA_MODE en live sin REAL_TRADING_READY en true: lib/env.ts lo marca como faltante"
          : "coherente con DATA_MODE",
    },
    {
      names: ["PRICES_MODE", "MARKET_STATUS_MODE"],
      text: (env) =>
        lower(env.PRICES_MODE) === "live" && lower(env.MARKET_STATUS_MODE) === "live"
          ? "precios y horario en live"
          : "lib/env.ts pide PRICES_MODE y MARKET_STATUS_MODE en live (modo estricto)",
    },
    {
      names: ["NEXT_PUBLIC_AUTH_MODE"],
      text: (env) =>
        lower(env.NEXT_PUBLIC_AUTH_MODE) === "supabase"
          ? "coincide con AUTH_MODE (supabase)"
          : "no es supabase: el cliente no coincidiría con AUTH_MODE",
    },
  ];
}

function statusLabel(status) {
  if (status === "ok") return "OK";
  if (status === "missing") return "FALTA";
  if (status === "invalid") return "FALTA";
  return "AVISO";
}

function main() {
  const args = process.argv.slice(2);
  for (const arg of args) {
    if (arg === "--help" || arg === "-h") {
      printUsage();
      return;
    }
    console.error(`check:production-ready: argumento desconocido: ${arg}`);
    printUsage();
    process.exitCode = 2;
    return;
  }

  const env = process.env;
  const source = envSourceText();
  const required = buildRequired();
  const warnings = buildWarnings();

  console.log("check:production-ready — pre-flight de entorno (sólo nombres, nunca valores)");
  console.log("origen: process.env del proceso que ejecuta este script");
  if (!source) console.log("nota: no se pudo leer lib/env.ts; no se marca el origen de cada nombre");
  console.log("");
  const NAME_WIDTH =
    Math.max(
      "VARIABLE".length,
      ...required.map((row) => row.names.join(" | ").length),
      ...warnings.map((row) => row.names.join(" | ").length),
    ) + 2;
  console.log("VARIABLE".padEnd(NAME_WIDTH) + "ESTADO   QUE SE ESPERA");
  console.log("-".repeat(96));

  let ok = 0;
  let missing = 0;
  const details = [];
  for (const row of required) {
    const status = row.check(env);
    const label = statusLabel(status);
    const name = row.names.join(" | ");
    if (status === "ok") {
      ok += 1;
    } else {
      missing += 1;
      details.push(name);
    }
    let detail = row.requirement;
    if (status === "missing") detail = `ausente — se espera ${row.requirement}`;
    if (status === "invalid") detail = `${row.invalidText ?? "valor no válido"} — se espera ${row.requirement}`;
    if (status === "ok" && row.warnText) {
      const note = row.warnText(env);
      if (note) detail = `${row.requirement} (ojo: ${note})`;
    }
    if (!declaredInEnvSource(source, row.names)) detail = `${detail} · leída fuera de lib/env.ts`;
    console.log(`${name.padEnd(NAME_WIDTH)}${label.padEnd(9)}${detail}`);
  }

  console.log("");
  console.log("AVISOS (no bloquean)");
  for (const row of warnings) {
    const note = row.text(env).trim();
    if (note === "") continue;
    const prefix = !declaredInEnvSource(source, row.names) ? " · leída fuera de lib/env.ts" : "";
    console.log(`${row.names.join(" | ").padEnd(NAME_WIDTH)}${"AVISO".padEnd(9)}${note}${prefix}`);
  }

  console.log("");
  console.log(`Resumen: ${ok} OK, ${missing} FALTA, ${warnings.length} AVISO (avisos no bloquean).`);
  if (missing > 0) {
    console.error(`ERROR check:production-ready: falta lo obligatorio (${details.join(", ")}).`);
    process.exitCode = 1;
    return;
  }
  console.log("OK check:production-ready: el entorno mínimo está completo.");
  console.log("Esto no enciende dinero real: sigue el runbook docs/LAUNCH-PRODUCCION-TECNICO.md.");
}

main();
