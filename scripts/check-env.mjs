/**
 * M59: verifica las variables de entorno sin imprimir valores.
 *
 * Lee el entorno actual o un archivo con `--file` (por ejemplo uno bajado
 * con `vercel env pull`) y muestra una tabla con cada variable y su estado
 * OK, FALTA o INVÁLIDA. Nunca imprime valores: sólo largo y prefijo de 4
 * caracteres para las claves públicas (`NEXT_PUBLIC_*`); de los secretos
 * no muestra nada. No lee `.env.local` salvo que se pase con `--file`.
 *
 * Uso:
 *   npm run check:env
 *   npm run check:env -- --env production
 *   npm run check:env -- --env preview --file ./vercel-preview.env
 *
 * `--env production` (o `preview`) cuenta como producción/preview
 * explícita: con faltantes sale con código 1. Sin `--env` ni `APP_ENV`,
 * el modo es demo/desarrollo: muestra avisos y sale con 0.
 * `SUPABASE_PROJECT_ENV=prod` en el origen activa el estricto de
 * producción aunque no haya `--env` (nunca se ignora en silencio).
 */

import { readFileSync } from "node:fs";
import path from "node:path";

const APP_ENVS = ["production", "preview", "development", "test"];

function unquote(value) {
  if (value.length >= 2) {
    const open = value[0];
    const close = value[value.length - 1];
    if ((open === '"' && close === '"') || (open === "'" && close === "'")) {
      return value.slice(1, -1);
    }
  }
  return value;
}

/** Parser dotenv mínimo (archivos `vercel env pull`). El archivo manda sobre el entorno actual. */
function parseDotenvFile(filePath) {
  let raw = readFileSync(filePath, "utf8");
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const body = trimmed.startsWith("export ") ? trimmed.slice(7).trim() : trimmed;
    const eq = body.indexOf("=");
    if (eq <= 0) continue;
    const key = body.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    let value = body.slice(eq + 1).trim();
    const quoted = value.length >= 2 && (value.startsWith('"') || value.startsWith("'"));
    if (!quoted) value = value.replace(/\s+#.*$/, "").trim();
    out[key] = unquote(value);
  }
  return out;
}

function norm(value) {
  return typeof value === "string" ? value.trim() : "";
}

function lower(value) {
  return norm(value).toLowerCase();
}

function isSet(value) {
  return norm(value) !== "";
}

function validAppEnv(value) {
  const cleaned = lower(value);
  return APP_ENVS.includes(cleaned) ? cleaned : null;
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

function geoList(value) {
  return norm(value)
    .split(",")
    .map((part) => part.trim().toUpperCase())
    .filter((part) => part.length > 0);
}

function sameUrl(a, b) {
  const clean = (s) => norm(s).replace(/\/+$/, "");
  return clean(a) !== "" && clean(a) === clean(b);
}

/** "ok" | "missing" | "invalid" según el origen. */
function present(value) {
  return isSet(value) ? "invalid" : "missing";
}

function buildRows(mode) {
  const production = mode === "production";
  return [
    {
      name: "AUTH_MODE",
      want: "supabase",
      check: (s) => (lower(s.AUTH_MODE) === "supabase" ? "ok" : present(s.AUTH_MODE)),
    },
    {
      name: "NEXT_PUBLIC_AUTH_MODE",
      want: "supabase (igual que AUTH_MODE)",
      pub: true,
      check: (s) => (lower(s.NEXT_PUBLIC_AUTH_MODE) === "supabase" ? "ok" : present(s.NEXT_PUBLIC_AUTH_MODE)),
    },
    {
      name: "PRICES_MODE",
      want: "live",
      check: (s) => (lower(s.PRICES_MODE) === "live" ? "ok" : present(s.PRICES_MODE)),
    },
    {
      name: "MARKET_STATUS_MODE",
      want: "live",
      check: (s) => (lower(s.MARKET_STATUS_MODE) === "live" ? "ok" : present(s.MARKET_STATUS_MODE)),
    },
    {
      name: "NEXT_PUBLIC_SITE_URL",
      want: "https",
      pub: true,
      check: (s) => (isHttps(s.NEXT_PUBLIC_SITE_URL) ? "ok" : present(s.NEXT_PUBLIC_SITE_URL)),
    },
    {
      name: "NEXT_PUBLIC_SUPABASE_URL",
      want: "URL http(s) del proyecto",
      pub: true,
      check: (s) => (isHttpUrl(s.NEXT_PUBLIC_SUPABASE_URL) ? "ok" : present(s.NEXT_PUBLIC_SUPABASE_URL)),
    },
    {
      name: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      want: "definida",
      pub: true,
      check: (s) => (isSet(s.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) ? "ok" : "missing"),
    },
    {
      name: "SUPABASE_SECRET_KEY",
      want: "definida (vale SUPABASE_SERVICE_ROLE_KEY)",
      check: (s) => (isSet(s.SUPABASE_SECRET_KEY) || isSet(s.SUPABASE_SERVICE_ROLE_KEY) ? "ok" : "missing"),
    },
    {
      name: "CRON_SECRET",
      want: ">= 32 caracteres",
      check: (s) => (norm(s.CRON_SECRET).length >= 32 ? "ok" : present(s.CRON_SECRET)),
    },
    {
      name: "JUPITER_API_KEY",
      want: "definida",
      check: (s) => (isSet(s.JUPITER_API_KEY) ? "ok" : "missing"),
    },
    {
      name: "SUPABASE_PROJECT_ENV",
      want: production ? "prod" : "dev (nunca prod en preview)",
      pub: false,
      check: (s) =>
        production
          ? lower(s.SUPABASE_PROJECT_ENV) === "prod"
            ? "ok"
            : present(s.SUPABASE_PROJECT_ENV)
          : lower(s.SUPABASE_PROJECT_ENV) === "dev"
            ? "ok"
            : present(s.SUPABASE_PROJECT_ENV),
    },
    {
      name: "GEO_BLOCKED_COUNTRIES",
      want: "ISO-2 extra (M75: se suma a la lista base, no la vacía)",
      check: (s) => {
        if (!isSet(s.GEO_BLOCKED_COUNTRIES)) return "ok";
        const list = geoList(s.GEO_BLOCKED_COUNTRIES);
        if (list.length === 0) return "invalid";
        return list.every((code) => /^[A-Z]{2}$/.test(code)) ? "ok" : "invalid";
      },
    },
    {
      name: "CATALOG_SCOPE",
      want: "curated o listed (nunca all)",
      check: (s) => {
        const cleaned = lower(s.CATALOG_SCOPE);
        if (cleaned === "" || cleaned === "curated" || cleaned === "listed") return "ok";
        return "invalid";
      },
    },
    {
      name: "DATA_MODE",
      want: "mock (live solo con REAL_TRADING_READY=true)",
      check: (s) => {
        if (lower(s.DATA_MODE) === "live" && lower(s.REAL_TRADING_READY) !== "true") return "invalid";
        return "ok";
      },
    },
    ...(production
      ? [
          {
            name: "SUPABASE_PROD_URL_EXPECTED",
            want: "definida e igual a NEXT_PUBLIC_SUPABASE_URL",
            check: (s) => {
              if (!isSet(s.SUPABASE_PROD_URL_EXPECTED)) return "missing";
              return sameUrl(s.NEXT_PUBLIC_SUPABASE_URL, s.SUPABASE_PROD_URL_EXPECTED) ? "ok" : "invalid";
            },
          },
        ]
      : [
          {
            name: "REAL_TRADING_READY",
            want: "false (default)",
            check: (s) => {
              if (!isSet(s.REAL_TRADING_READY)) return "ok";
              return lower(s.REAL_TRADING_READY) === "false" ? "ok" : "invalid";
            },
          },
        ]),
  ];
}

/** Nunca valores: sólo largo + prefijo de 4 para claves públicas; nada para secretos. */
function infoFor(row, source) {
  const value = source[row.name];
  if (!isSet(value)) return "--";
  if (!row.pub) return "definida";
  const text = norm(value);
  return `len=${text.length} ${text.slice(0, 4)}...`;
}

function printUsage() {
  console.log("Uso: npm run check:env [-- --env production|preview|development] [--file ruta]");
}

async function main() {
  const args = process.argv.slice(2);
  let cliEnv = null;
  let file = null;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") {
      printUsage();
      return;
    }
    if (arg === "--env" || arg.startsWith("--env=")) {
      const value = arg.includes("=") ? arg.slice("--env=".length) : args[(i += 1)];
      const cleaned = validAppEnv(value);
      if (!cleaned) {
        console.error(`ERROR check:env: --env debe ser uno de ${APP_ENVS.join("|")}`);
        process.exitCode = 2;
        return;
      }
      cliEnv = cleaned;
      continue;
    }
    if (arg === "--file" || arg.startsWith("--file=")) {
      file = arg.includes("=") ? arg.slice("--file=".length) : args[(i += 1)];
      if (!file) {
        console.error("ERROR check:env: --file necesita una ruta");
        process.exitCode = 2;
        return;
      }
      continue;
    }
    console.error(`ERROR check:env: argumento desconocido: ${arg}`);
    printUsage();
    process.exitCode = 2;
    return;
  }

  const source = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string") source[key] = value;
  }
  let fromFile = null;
  if (file) {
    try {
      fromFile = parseDotenvFile(path.resolve(file));
    } catch {
      console.error("ERROR check:env: no se pudo leer el archivo");
      process.exitCode = 2;
      return;
    }
    for (const [key, value] of Object.entries(fromFile)) source[key] = value;
  }

  const explicitApp = validAppEnv(source.APP_ENV);
  const project = lower(source.SUPABASE_PROJECT_ENV);
  let strict = null;
  const triggers = [];
  if (cliEnv === "production" || explicitApp === "production" || project === "prod") {
    strict = "production";
    if (cliEnv === "production") triggers.push("--env production");
    if (explicitApp === "production") triggers.push("APP_ENV explicito");
    if (project === "prod") triggers.push("SUPABASE_PROJECT_ENV=prod");
  } else if (cliEnv === "preview" || explicitApp === "preview") {
    strict = "preview";
    if (cliEnv === "preview") triggers.push("--env preview");
    if (explicitApp === "preview") triggers.push("APP_ENV explicito");
  }
  const mode = strict ?? cliEnv ?? explicitApp ?? "development";
  const strictLabel = strict ? `estricto (${triggers.join(" + ")})` : "leniente (demo/desarrollo: solo avisos)";

  console.log(`check:env modo=${mode} ${strictLabel}`);
  const vercelEnv = norm(source.VERCEL_ENV);
  console.log(`VERCEL_ENV: ${vercelEnv === "" ? "no definido (solo informativo)" : "definido (solo informativo)"}`);
  if (file) console.log(`origen: entorno actual + archivo (el archivo manda)`);

  const rows = strict ? buildRows(strict) : buildRows("production");
  console.log("");
  console.log("VARIABLE                              ESTADO    DETALLE                                    INFO");
  let ok = 0;
  let missing = 0;
  let invalid = 0;
  for (const row of rows) {
    const status = row.check(source);
    if (status === "ok") ok += 1;
    if (status === "missing") missing += 1;
    if (status === "invalid") invalid += 1;
    const label = status === "ok" ? "OK" : status === "missing" ? "FALTA" : "INVALIDA";
    console.log(
      `${row.name.padEnd(38)}${label.padEnd(10)}${row.want.padEnd(43)}${infoFor(row, source)}`,
    );
  }
  console.log("");
  if (strict) {
    console.log(`Resumen: ${ok} OK, ${missing} FALTA, ${invalid} INVALIDA`);
    if (missing + invalid > 0) {
      console.error(`ERROR check:env: entorno ${strict} incompleto`);
      process.exitCode = 1;
      return;
    }
    console.log(`OK check:env: entorno ${strict} completo`);
    return;
  }
  console.log(`Avisos: ${missing} FALTA, ${invalid} INVALIDA para produccion (no bloquean en demo/desarrollo)`);
  console.log("OK check:env: modo leniente");
}

await main();
