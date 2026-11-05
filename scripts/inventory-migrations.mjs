#!/usr/bin/env node
/**
 * Inventario de migraciones — SÓLO LECTURA.
 *
 * Lista `supabase/migrations` en orden, marca la migración forward 0047 y
 * enumera las funciones/objetos que esa migración espera encontrar en la base.
 *
 * Reglas duras:
 * - No abre ninguna conexión: no importa `pg`, no usa `psql`, no usa la API de
 *   Supabase. Sólo lee archivos del repositorio.
 * - No lee `.env` ni `.env.local`. Si el entorno ya trae `DATABASE_URL`,
 *   `SUPABASE_DB_URL`, `PGURL` o cualquier variable de conexión, lo informa y
 *   termina sin hacer nada más: la idea es que nadie lo apunte a producción.
 * - No aplica, no valida contra una base ni escribe archivos.
 *
 * Uso:
 *   node scripts/inventory-migrations.mjs
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const MIGRATIONS_DIR = path.join(ROOT, "supabase", "migrations");
const FORWARD_FILE = "0047_trade_reservations_forward.sql";

/** Variables de entorno que implican una base concreta. */
const CONNECTION_ENV = /(^DATABASE_URL$|_DATABASE_URL$|^DB_URL$|^PGURL$|^PGHOST$|^PGPORT$|^POSTGRES_|^SUPABASE_DB|^SUPABASE_URL$)/i;
const URL_VALUE = /^(postgres|postgresql):\/\//i;

/**
 * Objetos que la 0047 espera: los que crea/actualiza y las dependencias que
 * tienen que existir antes (creadas por 0027/0028/0031 y por la 0042 vieja).
 */
const EXPECTED = [
  { kind: "tabla", name: "public.orders", origin: "0027 / 0031", needle: "public.orders" },
  {
    kind: "columna",
    name: "public.orders.notional_usd",
    origin: "0042 vieja / 0047",
    needle: "notional_usd",
  },
  { kind: "columna", name: "public.orders.is_demo", origin: "0031", needle: "is_demo" },
  { kind: "tabla", name: "public.app_flags", origin: "0011 / 0028", needle: "public.app_flags" },
  { kind: "tabla", name: "public.user_limits", origin: "0028", needle: "public.user_limits" },
  {
    kind: "tabla",
    name: "public.trade_reservations",
    origin: "0042 vieja / 0047",
    needle: "public.trade_reservations",
  },
  {
    kind: "unique",
    name: "trade_reservations (user_id, request_id)",
    origin: "0042 vieja / 0047",
    needle: "unique (user_id, request_id)",
  },
  {
    kind: "índice",
    name: "trade_reservations_one_active_idx (user_id) where status = 'reserved'",
    origin: "0047",
    needle: "trade_reservations_one_active_idx",
  },
  {
    kind: "función",
    name: "public.safe_positive_numeric(jsonb, numeric)",
    origin: "0042 / 0047",
    needle: "function public.safe_positive_numeric(",
  },
  {
    kind: "función",
    name: "public.release_other_trade_reservations(uuid, text)",
    origin: "0047",
    needle: "function public.release_other_trade_reservations(",
  },
  {
    kind: "función",
    name: "public.reserve_trade_amount(uuid, text, numeric, timestamptz)",
    origin: "0042 / 0047",
    needle: "function public.reserve_trade_amount(",
  },
  {
    kind: "función",
    name: "public.consume_trade_reservation(uuid, text, numeric)",
    origin: "0042 / 0047",
    needle: "function public.consume_trade_reservation(",
  },
  {
    kind: "función",
    name: "public.release_trade_reservation(uuid, text)",
    origin: "0042 / 0047",
    needle: "function public.release_trade_reservation(",
  },
  {
    kind: "función",
    name: "public.rekey_trade_reservation(uuid, text, text)",
    origin: "0042 / 0047",
    needle: "function public.rekey_trade_reservation(",
  },
  {
    kind: "función",
    name: "public.read_trade_reservation(uuid, text)",
    origin: "0042 / 0047",
    needle: "function public.read_trade_reservation(",
  },
];

function connectionVars() {
  return Object.entries(process.env)
    .filter(([key, value]) => CONNECTION_ENV.test(key) || (value && URL_VALUE.test(value)))
    .map(([key]) => key)
    .sort();
}

function fail(message) {
  console.error(`inventario: ${message}`);
  process.exitCode = 1;
}

const vars = connectionVars();
if (vars.length > 0) {
  console.log("Se detectaron variables de conexión a una base en el entorno:");
  for (const name of vars) {
    console.log(`  - ${name}`);
  }
  console.log("");
  console.log("Este inventario es de sólo lectura y NO abre conexiones.");
  console.log("Termino acá a propósito: no se apunta a ninguna base, ni de staging ni de producción.");
  process.exit(0);
}

if (!existsSync(MIGRATIONS_DIR)) {
  fail(`no existe ${MIGRATIONS_DIR}`);
  process.exit(1);
}

const files = readdirSync(MIGRATIONS_DIR)
  .filter((name) => /^\d{4}_.*\.sql$/.test(name))
  .sort();

console.log(`Migraciones en supabase/migrations (${files.length}):`);
let previous = 0;
let problems = 0;
files.forEach((name, index) => {
  const number = Number(name.slice(0, 4));
  const bytes = statSync(path.join(MIGRATIONS_DIR, name)).size;
  const marker = name === FORWARD_FILE ? "  <- forward 0047" : "";
  console.log(`  ${String(index + 1).padStart(2, " ")}. ${name}  (${bytes} bytes)${marker}`);
  if (number <= previous) {
    problems += 1;
    console.error(`      número fuera de orden o duplicado: ${name}`);
  }
  previous = Math.max(previous, number);
});

if (!files.includes(FORWARD_FILE)) {
  problems += 1;
  console.error(`falta ${FORWARD_FILE}`);
}

const forwardPath = path.join(MIGRATIONS_DIR, FORWARD_FILE);
console.log("");
if (existsSync(forwardPath)) {
  const forward = readFileSync(forwardPath, "utf8").toLowerCase();
  console.log(`Objetos que ${FORWARD_FILE} espera o deja (verificación textual, sin base):`);
  for (const item of EXPECTED) {
    const present = forward.includes(item.needle.toLowerCase());
    console.log(
      `  ${present ? "OK  " : "OJO "} ${item.kind.padEnd(8)} ${item.name}   [origen: ${item.origin}]`,
    );
    if (!present) {
      problems += 1;
    }
  }
}

console.log("");
console.log("Sin conexión a ninguna base. No se aplicó ninguna migración.");
console.log("REAL_EXECUTION_LOCKED no se toca desde este script.");
if (problems > 0) {
  console.error(`Problemas detectados: ${problems}.`);
  process.exitCode = 1;
}
