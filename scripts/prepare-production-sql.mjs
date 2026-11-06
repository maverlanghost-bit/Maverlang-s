#!/usr/bin/env node
/**
 * Preparación del release de producción 0041..0051 — SÓLO LECTURA del repo.
 *
 * 1. Comprueba que existan TODAS las migraciones 0041..0051 por prefijo
 *    numérico en `supabase/migrations/` e imprime encontradas/faltantes.
 * 2. Si no falta ninguna, arma el bloque SQL idempotente de activación de
 *    `public.compliance_config` y de la tabla de interruptores. Los nombres de
 *    columnas, la versión de la declaración y los valores sembrados salen de
 *    los propios .sql: acá no se inventa ni se completa nada.
 * 3. Con `--write` deja ese bloque en
 *    `supabase/.temp/production-release-0041-0051.sql` (artefacto local; no se
 *    commitea).
 *
 * Reglas duras:
 * - No abre ninguna conexión: sin `pg`, sin `psql`, sin API de Supabase.
 * - No ejecuta SQL y no lee `.env*`: el bloque lo pega el operador.
 * - No imprime valores del entorno (no lee el entorno).
 *
 * Nota de nombres: el pedido hablaba de `system_flags`, pero en este repo la
 * tabla de interruptores es `public.app_flags` (0011) y así la leen
 * `lib/flags.ts` y `lib/admin/store.ts`. El script ubica la tabla real por su
 * `create table ... public.<algo>flags` y falla cerrado si no la encuentra.
 *
 * Uso:
 *   node scripts/prepare-production-sql.mjs
 *   node scripts/prepare-production-sql.mjs --write
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const MIGRATIONS_DIR = path.join(ROOT, "supabase", "migrations");
const OUT_DIR = path.join(ROOT, "supabase", ".temp");
const OUT_FILE = path.join(OUT_DIR, "production-release-0041-0051.sql");

const FIRST_REQUIRED = 41;
const LAST_REQUIRED = 51;
const REQUIRED_PREFIXES = [];
for (let n = FIRST_REQUIRED; n <= LAST_REQUIRED; n += 1) {
  REQUIRED_PREFIXES.push(String(n).padStart(4, "0"));
}

/** Mismo formato que exige `set_us_person_declaration_version` (0046). */
const DECLARATION_VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
/** Nombres de columna que el bloque usa; tienen que existir en las migraciones. */
const CONFIG_COLUMNS_USED = ["singleton", "us_person_declaration_version"];
const FLAG_COLUMNS_USED = ["key", "value"];
const RESERVED_WORDS = new Set(["constraint", "primary", "unique", "check", "foreign", "like"]);

function fail(message) {
  console.error(`prepare: ${message}`);
  process.exitCode = 1;
}

function printUsage() {
  console.log("Uso: node scripts/prepare-production-sql.mjs [--write]");
  console.log("  --write   deja el bloque SQL en supabase/.temp/production-release-0041-0051.sql");
}

function readText(file) {
  return readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
}

/** Migraciones con el patrón `NNNN_nombre.sql`, en orden. */
function listMigrations() {
  if (!existsSync(MIGRATIONS_DIR)) return null;
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => /^\d{4}_.*\.sql$/i.test(name))
    .sort();
}

/** Nombres de columna del `create table if not exists public.<tabla> (...)`. */
function columnsOf(body) {
  const columns = [];
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "" || line.startsWith("--")) continue;
    const name = line.split(/[\s,]+/)[0].replace(/[",]/g, "");
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) continue;
    if (RESERVED_WORDS.has(name.toLowerCase())) continue;
    if (!columns.includes(name)) columns.push(name);
  }
  return columns;
}

/** Definición real de una tabla del esquema public: archivo, cuerpo y columnas. */
function findTable(files, pattern) {
  const re = new RegExp(`create table if not exists public\\.(${pattern})\\s*\\(([\\s\\S]*?)\\n\\);`, "i");
  for (const file of files) {
    const match = readText(file).match(re);
    if (match) {
      return { table: match[1], file, columns: columnsOf(match[2]) };
    }
  }
  return null;
}

/**
 * Tabla de interruptores. Se buscan las tablas `public.*flags` y se elige la
 * que tenga columnas `key` y `value`: hay tablas históricas de control de
 * migraciones que también terminan en "flags" y no son esta.
 */
function findFlagsTable(files) {
  const re = /create table if not exists public\.([A-Za-z0-9_]*flags)\s*\(([\s\S]*?)\n\);/gi;
  for (const file of files) {
    for (const match of readText(file).matchAll(re)) {
      const columns = columnsOf(match[2]);
      if (FLAG_COLUMNS_USED.every((column) => columns.includes(column))) {
        return { table: match[1], file, columns };
      }
    }
  }
  return null;
}

/** Versión sembrada de la declaración no-US (insert de 0046). */
function findDeclarationVersion(files) {
  const re =
    /insert into public\.compliance_config\s*\(\s*singleton\s*,\s*us_person_declaration_version\s*\)\s*values\s*\(\s*true\s*,\s*'([^']*)'\s*\)/i;
  for (const file of files) {
    const match = readText(file).match(re);
    if (match) return { version: match[1].trim(), file };
  }
  return null;
}

/**
 * Semillas de interruptores de las migraciones (`insert into ... (key, value)
 * values (...) on conflict (key) do nothing`). Gana la primera aparición de
 * cada clave: es la que queda en una base nueva.
 */
function findFlagSeeds(files, flagsTable) {
  const blockRe = new RegExp(
    `insert into public\\.${flagsTable}\\s*\\(\\s*key\\s*,\\s*value\\s*\\)([\\s\\S]*?)on conflict\\s*\\(\\s*key\\s*\\)`,
    "gi",
  );
  const pairRe = /\(\s*'([a-z0-9_]+)'\s*,\s*('(?:[^']|'')*'::jsonb)\s*\)/gi;
  const seeds = new Map();
  for (const file of files) {
    const text = readText(file);
    for (const block of text.matchAll(blockRe)) {
      for (const pair of block[1].matchAll(pairRe)) {
        const key = pair[1];
        if (!seeds.has(key)) seeds.set(key, { key, value: pair[2], file });
      }
    }
  }
  return [...seeds.values()];
}

function sqlQuote(value) {
  return `'${value.replace(/'/g, "''")}'`;
}

/** Bloque SQL idempotente, armado sólo con lo leído de las migraciones. */
function buildSql(input) {
  const lines = [];
  lines.push("-- ============================================================");
  lines.push("-- Maverlang — release 0041..0051: activación de configuración");
  lines.push("-- Generado por scripts/prepare-production-sql.mjs desde supabase/migrations.");
  lines.push("-- Idempotente: se puede pegar más de una vez.");
  lines.push("-- NO abre REAL_EXECUTION_UNLOCKED, NO enciende dinero real y NO");
  lines.push("-- reemplaza la revisión del runbook (docs/LAUNCH-PRODUCCION-TECNICO.md).");
  lines.push("-- ============================================================");
  lines.push("");
  lines.push(`-- Migraciones que este release asume aplicadas (en este orden):`);
  for (const file of input.migrations) lines.push(`--   - ${file}`);
  lines.push("");
  lines.push("-- 1. compliance_config: fila única con la versión vigente de la declaración.");
  lines.push(`--    Origen: ${input.config.file}`);
  lines.push(`--    Columnas reales: ${input.config.columns.join(", ")}`);
  lines.push("--    El valor debe ser idéntico a US_PERSON_DECLARATION_VERSION del entorno.");
  lines.push("--    Para rotar la versión: select public.set_us_person_declaration_version('...');");
  lines.push("insert into public.compliance_config (singleton, us_person_declaration_version)");
  lines.push(`values (true, ${sqlQuote(input.version)})`);
  lines.push("on conflict (singleton) do nothing;");
  lines.push("");
  lines.push(`-- 2. ${input.flags.table}: interruptores de producto.`);
  lines.push(`--    Origen: ${input.flags.file}`);
  lines.push(`--    Columnas reales: ${input.flags.columns.join(", ")}`);
  lines.push("--    Valores = semillas de las migraciones (fail-closed). on conflict do nothing:");
  lines.push("--    una segunda pasada no pisa un interruptor que el operador ya cambió.");
  lines.push("--    deposits_enabled y withdrawals_enabled no tienen fila a propósito: sin fila");
  lines.push("--    valen false (lib/flags.ts). Encenderlos es una decisión aparte del operador.");
  if (input.seeds.length === 0) {
    lines.push(`--    (Sin semillas en las migraciones: no se agrega ninguna fila.)`);
  } else {
    lines.push(`insert into public.${input.flags.table} (key, value)`);
    lines.push("values");
    input.seeds.forEach((seed, index) => {
      const comma = index === input.seeds.length - 1 ? "" : ",";
      lines.push(`  (${sqlQuote(seed.key)}, ${seed.value})${comma}`);
    });
    lines.push("on conflict (key) do nothing;");
  }
  lines.push("");
  lines.push("-- 3. Verificación (sólo lectura; pégalo aparte si el editor exige una sentencia).");
  lines.push("select 'compliance_config' as objeto,");
  lines.push("       c.us_person_declaration_version as version,");
  lines.push("       c.updated_at");
  lines.push("  from public.compliance_config c");
  lines.push(" where c.singleton;");
  lines.push("");
  lines.push(`select f.key, f.value, f.updated_at`);
  lines.push(`  from public.${input.flags.table} f`);
  lines.push(" order by f.key;");
  lines.push("");
  return lines.join("\n");
}

function main() {
  const args = process.argv.slice(2);
  let write = false;
  for (const arg of args) {
    if (arg === "--write") {
      write = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      printUsage();
      return;
    }
    console.error(`prepare: argumento desconocido: ${arg}`);
    printUsage();
    process.exitCode = 2;
    return;
  }

  const files = listMigrations();
  if (files === null) {
    fail(`no existe ${MIGRATIONS_DIR}`);
    return;
  }

  const missing = REQUIRED_PREFIXES.filter(
    (prefix) => !files.some((name) => name.startsWith(`${prefix}_`)),
  );
  const present = REQUIRED_PREFIXES.filter((prefix) => !missing.includes(prefix));

  console.log(`Migraciones exigidas: ${REQUIRED_PREFIXES[0]}..${REQUIRED_PREFIXES[REQUIRED_PREFIXES.length - 1]}`);
  for (const prefix of REQUIRED_PREFIXES) {
    const found = files.filter((name) => name.startsWith(`${prefix}_`));
    if (found.length === 0) {
      console.log(`  FALTA  ${prefix}`);
    } else {
      console.log(`  OK     ${found.join(", ")}`);
      if (found.length > 1) {
        console.log(`         ojo: ${found.length} archivos con el mismo prefijo`);
      }
    }
  }
  console.log("");
  console.log(`Resumen: ${present.length} encontradas, ${missing.length} faltantes (de ${REQUIRED_PREFIXES.length}).`);

  if (missing.length > 0) {
    console.error(`prepare: faltan migraciones: ${missing.join(", ")}. No se genera SQL.`);
    process.exitCode = 1;
    return;
  }

  // De acá en adelante todo sale de los .sql: si algo no se puede leer, se corta.
  const config = findTable(files, "compliance_config");
  if (!config) {
    fail("no se encontró el create table de public.compliance_config en las migraciones");
    return;
  }
  const missingConfigColumns = CONFIG_COLUMNS_USED.filter((column) => !config.columns.includes(column));
  if (missingConfigColumns.length > 0) {
    fail(
      `public.compliance_config no expone ${missingConfigColumns.join(", ")} (columnas leídas: ${config.columns.join(", ")}). No se inventa el bloque.`,
    );
    return;
  }

  const flags = findFlagsTable(files);
  if (!flags) {
    fail("no se encontró la tabla de interruptores (create table ... public.<algo>flags con key y value) en las migraciones");
    return;
  }
  const missingFlagColumns = FLAG_COLUMNS_USED.filter((column) => !flags.columns.includes(column));
  if (missingFlagColumns.length > 0) {
    fail(
      `public.${flags.table} no expone ${missingFlagColumns.join(", ")} (columnas leídas: ${flags.columns.join(", ")}). No se inventa el bloque.`,
    );
    return;
  }

  const declaration = findDeclarationVersion(files);
  if (!declaration) {
    fail("no se encontró la versión sembrada de la declaración en public.compliance_config");
    return;
  }
  if (!DECLARATION_VERSION_PATTERN.test(declaration.version)) {
    fail(`la versión sembrada (${declaration.file}) no cumple el formato de 0046; no se genera SQL`);
    return;
  }

  const seeds = findFlagSeeds(files, flags.table);
  const releaseFiles = REQUIRED_PREFIXES.flatMap((prefix) =>
    files.filter((name) => name.startsWith(`${prefix}_`)),
  );
  const sql = buildSql({
    migrations: releaseFiles,
    config,
    flags,
    version: declaration.version,
    seeds,
  });

  console.log("");
  console.log(`Activación: public.compliance_config (${config.file}) + public.${flags.table} (${flags.file})`);
  if (flags.table !== "system_flags") {
    console.log(
      `nota: las migraciones no tienen public.system_flags; los interruptores viven en public.${flags.table} (la tabla que leen lib/flags.ts y lib/admin/store.ts).`,
    );
  }
  console.log(`Interruptores sembrados: ${seeds.length === 0 ? "ninguno" : seeds.map((seed) => seed.key).join(", ")}`);
  console.log("");
  console.log("--- Bloque SQL (idempotente) ---");
  console.log(sql);
  console.log("--- Fin del bloque ---");
  console.log("");

  if (write) {
    try {
      mkdirSync(OUT_DIR, { recursive: true });
      writeFileSync(OUT_FILE, sql, "utf8");
    } catch {
      fail("no se pudo escribir el archivo de release en supabase/.temp");
      return;
    }
    console.log(`Escrito: ${path.relative(ROOT, OUT_FILE)} (${Buffer.byteLength(sql, "utf8")} bytes).`);
    console.log("Es un artefacto local para pegar en el SQL Editor; no se commitea.");
  } else {
    console.log("Sin --write no se escribe ningún archivo.");
  }

  console.log("No se ejecutó SQL: este script sólo lee migraciones del repo.");
  console.log("REAL_EXECUTION_UNLOCKED y los kill switches de dinero NO se tocan desde acá.");
}

main();
