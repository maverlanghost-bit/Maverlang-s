/**
 * Pruebas de pre-lanzamiento de la RLS de billeteras y depósitos (0041).
 *
 * Qué demuestra, contra PostgreSQL 17 real y aislado:
 *   1. `anon` no puede leer `wallets.privy_user_id` (ni ninguna columna).
 *   2. `authenticated` (usuario A) no puede leer los `crypto_deposits` de B.
 *   3. `authenticated` (usuario A) no puede leer el `privy_user_id` de la fila
 *      de B en `wallets` (ni siquiera el suyo: la columna no está en el GRANT).
 *   4. `service_role` sí puede: el cron de conciliación sigue funcionando.
 *   5. Aplicar 0041 dos veces no rompe ni reabre permisos.
 *   6. (mutación) Con el estado anterior a 0041 —sólo 0002/0025/0029/0030/
 *      0040— las aserciones 1 y 3 fallan: `authenticated` lee `privy_user_id`
 *      y `select *`. Eso prueba que las pruebas no pasan "de gratis".
 *
 * Por qué una fuga acá sería grave:
 * - `privy_user_id` es el DID de Privy que identifica la identidad dueña de la
 *   billetera. Si el navegador lo recibe, un atacante con ese DID (más un
 *   token de esa identidad) puede operar en nombre del usuario: es
 *   suplantación de identidad, no una simple filtración de datos.
 * - `crypto_deposits` guarda montos y firmas on-chain. Leer los depósitos de
 *   otro usuario revela cuánto dinero tiene, cuándo lo movió y las firmas
 *   necesarias para rastrear su actividad en Solana.
 *
 * Requisito: `embedded-postgres` y `pg` instalados FUERA del repo.
 * Ver supabase/tests/README.md. No usa Docker, no usa `psql`, no lee `.env`
 * y nunca se conecta a una base existente.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const MIGRATIONS = path.join(ROOT, "supabase", "migrations");
const HARNESS_DIR =
  process.env.PG_HARNESS_DIR ?? path.join(os.tmpdir(), "opencode", "pg-harness");
const requireFromHarness = createRequire(path.join(HARNESS_DIR, "package.json"));
try {
  requireFromHarness.resolve("embedded-postgres");
  requireFromHarness.resolve("pg");
} catch {
  console.error(
    `No se encontró embedded-postgres en ${HARNESS_DIR}.\n` +
      "Instalalo fuera del repo (ver supabase/tests/README.md) o apuntá PG_HARNESS_DIR.",
  );
  process.exit(1);
}
const EmbeddedPostgres = requireFromHarness("embedded-postgres").default;
const { Client } = requireFromHarness("pg");

const DB_MAIN = "maverlang_prelaunch_rls_0041";
// Base paralela (mismo clúster, mismo puerto) para la prueba de mutación con
// el SQL anterior a 0041. Cuesta casi nada y evita levantar otro PostgreSQL
// (esta máquina tiene poca memoria y otros procesos corriendo).
const DB_PREV = "maverlang_prelaunch_rls_0041_previo";
const PASSWORD = "postgres";

const USER_A = "a1a1a1a1-1111-4111-8111-111111111111";
const USER_B = "b2b2b2b2-2222-4222-8222-222222222222";
const ADDRESS_A = "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";
const ADDRESS_B = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const DID_A = "did:privy:cmaaaaaaaaaaaaaaaaaaaa";
const DID_B = "did:privy:cmbbbbbbbbbbbbbbbbbbbb";

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function readMigration(name) {
  return readFileSync(path.join(MIGRATIONS, name), "utf8");
}

/**
 * Roles: son del clúster, se crean una sola vez.
 */
const CLUSTER_STUB = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
`;

/**
 * Entorno mínimo equivalente a Supabase, por base de datos: esquema `auth`,
 * `auth.users`, `auth.mfa_factors`, `auth.uid()`, `auth.jwt()` y los
 * privilegios por defecto del proyecto (los objetos nuevos nacen con GRANT
 * para los tres roles y las migraciones recortan).
 */
const DB_STUB = `
grant usage on schema public to anon, authenticated, service_role;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;

create table auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table auth.mfa_factors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  factor_type text not null,
  status text not null,
  created_at timestamptz not null default now()
);

-- Mismo contrato que Supabase: el subject y los claims viajan en GUCs de la
-- petición (PostgREST los setea por request).
create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), ''),
    '{}'
  )::jsonb;
$$;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(auth.jwt() ->> 'sub', '')
  )::uuid;
$$;

grant execute on function auth.jwt() to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all on sequences to postgres, anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all on functions to postgres, anon, authenticated, service_role;
`;

/**
 * Migraciones previas que 0041 necesita: perfiles (0002), depósitos (0025),
 * billeteras (0029), movimientos/conciliaciones (0030) y el binding de
 * identidad Privy (0040). No se aplican 0027/0028/0031/0042: 0041 no las toca
 * y así el arnés tarda menos.
 */
const PREREQUISITES = [
  "0002_supabase_auth.sql",
  "0025_crypto_deposits.sql",
  "0029_wallets.sql",
  "0030_wallet_movements.sql",
  "0040_wallets_privy_binding.sql",
];

const MIGRATION_0041 = "0041_wallets_deposits_rls.sql";

const port = await freePort();
const dataDir = path.join(os.tmpdir(), `maverlang-rls-0041-${process.pid}-${Date.now()}`);
const cluster = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: "postgres",
  password: PASSWORD,
  port,
  persistent: false,
  autoRehydrateSymlinks: true,
  initdbFlags: ["--encoding=UTF8", "--locale=C"],
  onLog: () => {},
  onError: () => {},
});

// ---------------------------------------------------------------------------
// Mini arnés
// ---------------------------------------------------------------------------
let passed = 0;
const failures = [];

async function test(name, fn) {
  try {
    const evidence = await fn();
    passed += 1;
    console.log(`PASS  ${name}`);
    if (evidence) console.log(`      → ${evidence}`);
  } catch (error) {
    failures.push({ name, error });
    console.log(`FAIL  ${name}`);
    console.log(`      → ${error.message.replace(/\n/g, "\n        ")}`);
  }
}

function connectOptions(database) {
  return {
    host: "127.0.0.1",
    port,
    user: "postgres",
    password: PASSWORD,
    database,
  };
}

async function connect(database) {
  const client = new Client(connectOptions(database));
  await client.connect();
  await client.query("set statement_timeout = '20s'");
  await client.query("set lock_timeout = '10s'");
  return client;
}

async function applySql(client, sql, label) {
  try {
    await client.query(sql);
  } catch (error) {
    error.message = `${label}: ${error.message}`;
    throw error;
  }
}

/** Devuelve el error en vez de lanzarlo, para poder asertar el código SQL. */
async function attempt(fn) {
  try {
    const result = await fn();
    return { ok: true, rows: result.rows, rowCount: result.rowCount };
  } catch (error) {
    return { ok: false, code: error.code, message: error.message };
  }
}

function describeError(result) {
  return `${result.code ?? "sin código"}: ${result.message}`;
}

/**
 * Simula una sesión de PostgREST: SET ROLE + claims en GUCs.
 * `authenticated` recibe el sub del usuario; `anon` va sin sub (lo real).
 */
async function session(database, role, userId = null, claims = {}) {
  const client = await connect(database);
  await client.query(`set role ${role}`);
  if (userId) {
    const payload = { sub: userId, role, ...claims };
    await client.query("select set_config('request.jwt.claims', $1, false)", [
      JSON.stringify(payload),
    ]);
    await client.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
  }
  return client;
}

/** Datos de prueba: dos usuarios, cada uno con billetera, depósito y movimiento. */
async function seed(admin) {
  for (const [id, email] of [
    [USER_A, "usuario-a@example.test"],
    [USER_B, "usuario-b@example.test"],
  ]) {
    // El trigger handle_new_user() de 0002 crea el perfil.
    await admin.query(
      "insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, '{}'::jsonb)",
      [id, email],
    );
  }

  await admin.query(
    `insert into public.wallets (user_id, address, privy_wallet_id, privy_user_id)
     values ($1, $2, 'pw-a', $3), ($4, $5, 'pw-b', $6)`,
    [USER_A, ADDRESS_A, DID_A, USER_B, ADDRESS_B, DID_B],
  );

  // Montos y firmas reales hacen que la fuga sea concreta: monto + firma.
  await admin.query(
    `insert into public.crypto_deposits (user_id, mint, amount_ui, signature, from_address)
     values
       ($1, 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 25.5,
        'sig-deposito-a-1111111111111111111111111111111111111111111', $3),
       ($2, 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 1234.75,
        'sig-deposito-b-2222222222222222222222222222222222222222222', $4)`,
    [USER_A, USER_B, ADDRESS_A, ADDRESS_B],
  );

  await admin.query(
    `insert into public.wallet_movements (user_id, kind, mint, amount_ui, reference, signature)
     values
       ($1, 'deposit', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 25.5, 'mov-a',
        'sig-deposito-a-1111111111111111111111111111111111111111111'),
       ($2, 'deposit', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 1234.75, 'mov-b',
        'sig-deposito-b-2222222222222222222222222222222222222222222')`,
    [USER_A, USER_B],
  );
}

let admin;
let mutationAdmin;

try {
  // -------------------------------------------------------------------------
  // Clúster + base principal
  // -------------------------------------------------------------------------
  await cluster.initialise();
  await cluster.start();
  await cluster.createDatabase(DB_MAIN);

  admin = await connect(DB_MAIN);
  await applySql(admin, CLUSTER_STUB, "stub de roles");
  await applySql(admin, DB_STUB, "stub Supabase");
  for (const name of PREREQUISITES) {
    await applySql(admin, readMigration(name), name);
  }
  await seed(admin);

  await test("0041 aplica sin errores y fuerza RLS en las cuatro tablas", async () => {
    await applySql(admin, readMigration(MIGRATION_0041), "0041");
    // Se aplica ANTES de las pruebas: si falla, el arnés se cae acá y no
    // sigue con un esquema a medio migrar.
    return "0041 aplicada sobre 0002/0025/0029/0030/0040";
  });

  await test("0041 deja RLS habilitada y FORZADA en wallets, crypto_deposits, wallet_movements y wallet_reconciliations", async () => {
    const tables = ["wallets", "crypto_deposits", "wallet_movements", "wallet_reconciliations"];
    const { rows } = await admin.query(
      `select c.relname, c.relrowsecurity, c.relforcerowsecurity
         from pg_class c
        where c.oid = any($1::regclass[])`,
      [tables.map((table) => `public.${table}`)],
    );
    assert.equal(rows.length, tables.length, "faltan tablas de billetera");
    for (const row of rows) {
      assert.equal(row.relrowsecurity, true, `${row.relname}: RLS no habilitada`);
      assert.equal(row.relforcerowsecurity, true, `${row.relname}: RLS no forzada`);
    }
    return rows.map((row) => `${row.relname}=RLS+FORCE`).join(", ");
  });

  // -------------------------------------------------------------------------
  // Caso 1 — anon no lee wallets.privy_user_id
  // -------------------------------------------------------------------------
  await test("1. anon NO puede leer wallets.privy_user_id (SELECT explícito → error de permiso)", async () => {
    const anon = await session(DB_MAIN, "anon");
    try {
      const result = await attempt(() => anon.query("select privy_user_id from public.wallets"));
      assert.equal(
        result.ok,
        false,
        `anon leyó privy_user_id: ${JSON.stringify(result.rows)}`,
      );
      assert.equal(result.code, "42501", `código inesperado: ${describeError(result)}`);
      return describeError(result);
    } finally {
      await anon.end();
    }
  });

  await test("1b. anon tampoco lee columnas públicas ni `select *` de wallets (no hay GRANT de tabla)", async () => {
    const anon = await session(DB_MAIN, "anon");
    try {
      const publicCols = await attempt(() =>
        anon.query("select id, user_id, address, created_at from public.wallets"),
      );
      assert.equal(publicCols.ok, false, "anon leyó columnas públicas de wallets");
      assert.equal(publicCols.code, "42501");

      const star = await attempt(() => anon.query("select * from public.wallets"));
      assert.equal(star.ok, false, "anon hizo select * en wallets");
      assert.equal(star.code, "42501");

      // Ni siquiera falsificando el subject (lo que un JWT sin firmar haría)
      // el GRANT lo deja pasar: la defensa no depende de la política.
      await anon.query("select set_config('request.jwt.claim.sub', $1, false)", [USER_A]);
      await anon.query("select set_config('request.jwt.claims', $1, false)", [
        JSON.stringify({ sub: USER_A, role: "anon" }),
      ]);
      const forged = await attempt(() => anon.query("select id, address from public.wallets"));
      assert.equal(forged.ok, false, "anon con sub falsificado leyó wallets");
      assert.equal(forged.code, "42501");
      return `${publicCols.code} en columnas públicas, ${star.code} en select *, ${forged.code} con sub falsificado`;
    } finally {
      await anon.end();
    }
  });

  await test("1c. catálogo: anon no tiene SELECT de tabla ni de la columna privy_user_id", async () => {
    const { rows } = await admin.query(`
      select
        has_table_privilege('anon', 'public.wallets', 'select') as tabla,
        has_column_privilege('anon', 'public.wallets', 'id', 'select') as col_id,
        has_column_privilege('anon', 'public.wallets', 'privy_user_id', 'select') as col_did,
        has_column_privilege('anon', 'public.wallets', 'privy_wallet_id', 'select') as col_wallet,
        has_table_privilege('anon', 'public.crypto_deposits', 'select') as depositos
    `);
    const row = rows[0];
    assert.equal(row.tabla, false, "anon tiene SELECT de tabla en wallets");
    assert.equal(row.col_id, false, "anon tiene SELECT de id");
    assert.equal(row.col_did, false, "anon tiene SELECT de privy_user_id");
    assert.equal(row.col_wallet, false, "anon tiene SELECT de privy_wallet_id");
    assert.equal(row.depositos, false, "anon tiene SELECT en crypto_deposits");
    return "tabla=false, id=false, privy_user_id=false, privy_wallet_id=false, crypto_deposits=false";
  });

  // -------------------------------------------------------------------------
  // Caso 2 — A no lee los depósitos de B
  // -------------------------------------------------------------------------
  await test("2. authenticated (A) NO puede leer crypto_deposits de B (error de permiso, no filas vacías)", async () => {
    // Precondición real: los depósitos de ambos existen y service_role los ve.
    const { rows: counts } = await admin.query(
      `select user_id, count(*)::int as n, sum(amount_ui)::text as total
         from public.crypto_deposits group by user_id order by user_id`,
    );
    assert.equal(counts.length, 2, "faltan depósitos de prueba");
    assert.equal(counts.find((row) => row.user_id === USER_B).n, 1, "B no tiene depósito");
    assert.equal(counts.find((row) => row.user_id === USER_B).total, "1234.75");

    const a = await session(DB_MAIN, "authenticated", USER_A, { aal: "aal2" });
    try {
      const table = await attempt(() => a.query("select * from public.crypto_deposits"));
      assert.equal(
        table.ok,
        false,
        `A leyó crypto_deposits: ${JSON.stringify(table.rows)}`,
      );
      assert.equal(table.code, "42501", `código inesperado: ${describeError(table)}`);

      const target = await attempt(() =>
        a.query("select amount_ui, signature from public.crypto_deposits where user_id = $1", [
          USER_B,
        ]),
      );
      assert.equal(target.ok, false, "A leyó el depósito puntual de B");
      assert.equal(target.code, "42501");
      return `B tiene 1 depósito de US$${counts.find((r) => r.user_id === USER_B).total}; A recibe ${describeError(target)}`;
    } finally {
      await a.end();
    }
  });

  await test("2b. anon tampoco lee crypto_deposits (tabla revocada por completo)", async () => {
    const anon = await session(DB_MAIN, "anon");
    try {
      const result = await attempt(() =>
        anon.query("select user_id, amount_ui, signature from public.crypto_deposits"),
      );
      assert.equal(result.ok, false, "anon leyó crypto_deposits");
      assert.equal(result.code, "42501");
      return describeError(result);
    } finally {
      await anon.end();
    }
  });

  // -------------------------------------------------------------------------
  // Caso 3 — A no lee el privy_user_id de la fila de B
  // -------------------------------------------------------------------------
  await test("3. authenticated (A) NO puede leer el privy_user_id de la fila de B en wallets", async () => {
    const a = await session(DB_MAIN, "authenticated", USER_A, { aal: "aal2" });
    try {
      // (a) Columna privada apuntada a la fila de B: no es "0 filas", es
      // permiso denegado, porque la columna no está en el GRANT.
      const targeted = await attempt(() =>
        a.query("select privy_user_id from public.wallets where user_id = $1", [USER_B]),
      );
      assert.equal(targeted.ok, false, `A leyó el DID de B: ${JSON.stringify(targeted.rows)}`);
      assert.equal(targeted.code, "42501", `código inesperado: ${describeError(targeted)}`);

      // (b) Ni siquiera su propia columna: el GRANT es por columna, no por fila.
      const own = await attempt(() => a.query("select privy_user_id from public.wallets"));
      assert.equal(own.ok, false, "A leyó privy_user_id de su propia billetera");
      assert.equal(own.code, "42501");

      // (c) `select *` tampoco: expondría privy_wallet_id y updated_at.
      const star = await attempt(() => a.query("select * from public.wallets"));
      assert.equal(star.ok, false, "A hizo select * en wallets");
      assert.equal(star.code, "42501");

      // (d) Por columnas públicas, la RLS deja ver SÓLO su fila: B no aparece.
      const visible = await attempt(() =>
        a.query("select id, user_id, address, created_at from public.wallets where user_id = $1", [
          USER_B,
        ]),
      );
      assert.equal(visible.ok, true, "la consulta de columnas públicas debía funcionar");
      assert.equal(visible.rows.length, 0, `A vio la fila de B: ${JSON.stringify(visible.rows)}`);

      const all = await a.query("select id, user_id, address from public.wallets");
      assert.equal(all.rows.length, 1, `A debía ver 1 fila, vio ${all.rows.length}`);
      assert.equal(all.rows[0].user_id, USER_A, "A ve la fila de otro usuario");
      assert.equal(all.rows[0].address, ADDRESS_A);
      return `privy_user_id→${targeted.code}, propio→${own.code}, select*→${star.code}, filas de B=0, filas propias=1`;
    } finally {
      await a.end();
    }
  });

  await test("3b. authenticated (B) sólo se ve a sí mismo (la RLS no depende del orden de los usuarios)", async () => {
    const b = await session(DB_MAIN, "authenticated", USER_B, { aal: "aal2" });
    try {
      const own = await b.query("select id, user_id, address from public.wallets");
      assert.equal(own.rows.length, 1, `B debía ver 1 fila, vio ${own.rows.length}`);
      assert.equal(own.rows[0].user_id, USER_B);

      const other = await b.query(
        "select id, user_id, address from public.wallets where user_id = $1",
        [USER_A],
      );
      assert.equal(other.rows.length, 0, "B vio la billetera de A");
      return "B ve 1 fila propia y 0 filas de A";
    } finally {
      await b.end();
    }
  });

  // -------------------------------------------------------------------------
  // Escrituras: ningún cliente escribe dinero
  // -------------------------------------------------------------------------
  await test("3c. authenticated no puede INSERT/UPDATE/DELETE en wallets ni escribir depósitos", async () => {
    const a = await session(DB_MAIN, "authenticated", USER_A, { aal: "aal2" });
    try {
      const insertWallet = await attempt(() =>
        a.query("insert into public.wallets (user_id, address) values ($1, $2)", [
          USER_A,
          "3xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsX",
        ]),
      );
      assert.equal(insertWallet.ok, false, "A insertó una billetera");
      assert.equal(insertWallet.code, "42501");

      const updateWallet = await attempt(() =>
        a.query("update public.wallets set address = address"),
      );
      // Sin GRANT de UPDATE el error es de permiso; con GRANT sería 0 filas.
      assert.equal(updateWallet.ok, false, "A actualizó wallets");
      assert.equal(updateWallet.code, "42501");

      const deleteWallet = await attempt(() => a.query("delete from public.wallets"));
      assert.equal(deleteWallet.ok, false, "A borró wallets");
      assert.equal(deleteWallet.code, "42501");

      const insertDeposit = await attempt(() =>
        a.query(
          "insert into public.crypto_deposits (user_id, mint, amount_ui, signature) values ($1, 'mint', 999999, 'sig-falsa')",
          [USER_A],
        ),
      );
      assert.equal(insertDeposit.ok, false, "A se acreditó un depósito falso");
      assert.equal(insertDeposit.code, "42501");

      const updateDeposit = await attempt(() =>
        a.query("update public.crypto_deposits set amount_ui = 999999"),
      );
      assert.equal(updateDeposit.ok, false, "A modificó un depósito");
      assert.equal(updateDeposit.code, "42501");

      return "insert/update/delete en wallets y crypto_deposits: 42501";
    } finally {
      await a.end();
    }
  });

  await test("3d. authenticated no puede leer wallet_movements ni wallet_reconciliations", async () => {
    const a = await session(DB_MAIN, "authenticated", USER_A, { aal: "aal2" });
    try {
      const movements = await attempt(() =>
        a.query("select user_id, amount_ui, signature from public.wallet_movements"),
      );
      assert.equal(movements.ok, false, "A leyó wallet_movements");
      assert.equal(movements.code, "42501");

      const runs = await attempt(() => a.query("select * from public.wallet_reconciliations"));
      assert.equal(runs.ok, false, "A leyó wallet_reconciliations");
      assert.equal(runs.code, "42501");
      return `movements→${movements.code}, reconciliations→${runs.code}`;
    } finally {
      await a.end();
    }
  });

  // -------------------------------------------------------------------------
  // Caso 4 — service_role sí puede (el cron no se rompe)
  // -------------------------------------------------------------------------
  await test("4. service_role lee privy_user_id de ambos y todos los crypto_deposits (cron OK)", async () => {
    const service = await session(DB_MAIN, "service_role");
    try {
      const { rows: wallets } = await service.query(
        "select user_id, privy_user_id, privy_wallet_id from public.wallets order by user_id",
      );
      assert.equal(wallets.length, 2, "service_role debía ver las 2 billeteras");
      assert.deepEqual(
        wallets.map((row) => row.privy_user_id),
        [DID_A, DID_B],
        `DIDs inesperados: ${JSON.stringify(wallets)}`,
      );

      const { rows: deposits } = await service.query(
        "select user_id, amount_ui::text as amount_ui, signature from public.crypto_deposits order by user_id",
      );
      assert.equal(deposits.length, 2, "service_role debía ver los 2 depósitos");
      assert.equal(deposits.find((row) => row.user_id === USER_B).amount_ui, "1234.75");
      assert.match(
        deposits.find((row) => row.user_id === USER_B).signature,
        /^sig-deposito-b-/,
      );

      const { rows: movements } = await service.query(
        "select count(*)::int as n from public.wallet_movements",
      );
      assert.equal(movements[0].n, 2, "service_role debía ver los 2 movimientos");
      return `wallets=2 con DIDs, deposits=2 (B=US$1234.75), movements=2`;
    } finally {
      await service.end();
    }
  });

  // -------------------------------------------------------------------------
  // Caso 5 — idempotencia
  // -------------------------------------------------------------------------
  await test("5. aplicar 0041 dos veces no rompe ni duplica políticas", async () => {
    await applySql(admin, readMigration(MIGRATION_0041), "0041 (2ª vez)");
    const { rows } = await admin.query(`
      select
        (select count(*)::int from pg_policies
          where schemaname = 'public' and tablename = 'wallets') as wallets_policies,
        (select count(*)::int from pg_policies
          where schemaname = 'public' and tablename = 'crypto_deposits') as deposits_policies,
        (select count(*)::int from pg_policies
          where schemaname = 'public' and tablename = 'wallets'
            and policyname = 'wallets_select_own') as own_policy,
        (select count(*)::int from pg_constraint
          where conrelid = 'public.wallets'::regclass
            and conname = 'wallets_privy_user_id_format') as did_check,
        (select count(*)::int from pg_indexes
          where schemaname = 'public' and tablename = 'wallets'
            and indexname = 'wallets_one_privy_identity_per_user') as identity_idx
    `);
    assert.equal(rows[0].wallets_policies, 1, "políticas de wallets duplicadas");
    assert.equal(rows[0].deposits_policies, 0, "crypto_deposits no debe tener políticas");
    assert.equal(rows[0].own_policy, 1, "wallets_select_own duplicada o ausente");
    assert.equal(rows[0].did_check, 1, "check del DID duplicado o ausente");
    assert.equal(rows[0].identity_idx, 1, "índice de identidad duplicado o ausente");

    // Los datos siguen intactos después de reaplicar.
    const { rows: wallets } = await admin.query(
      "select count(*)::int as n from public.wallets",
    );
    const { rows: deposits } = await admin.query(
      "select count(*)::int as n from public.crypto_deposits",
    );
    assert.equal(wallets[0].n, 2, "se perdieron billeteras al reaplicar");
    assert.equal(deposits[0].n, 2, "se perdieron depósitos al reaplicar");
    return "políticas wallets=1, deposits=0; check e índice=1; datos 2/2 intactos";
  });

  await test("5b. tras reaplicar, los bloqueos de los casos 1–3 siguen vigentes", async () => {
    const anon = await session(DB_MAIN, "anon");
    const a = await session(DB_MAIN, "authenticated", USER_A, { aal: "aal2" });
    try {
      const anonDid = await attempt(() => anon.query("select privy_user_id from public.wallets"));
      assert.equal(anonDid.ok, false, "anon leyó privy_user_id después de reaplicar");
      assert.equal(anonDid.code, "42501");

      const aDid = await attempt(() =>
        a.query("select privy_user_id from public.wallets where user_id = $1", [USER_B]),
      );
      assert.equal(aDid.ok, false, "A leyó el DID de B después de reaplicar");
      assert.equal(aDid.code, "42501");

      const aDeposits = await attempt(() => a.query("select * from public.crypto_deposits"));
      assert.equal(aDeposits.ok, false, "A leyó crypto_deposits después de reaplicar");
      assert.equal(aDeposits.code, "42501");

      const aRows = await a.query("select user_id from public.wallets");
      assert.equal(aRows.rows.length, 1, "A debía seguir viendo sólo su fila");
      assert.equal(aRows.rows[0].user_id, USER_A);
      return `anon DID→42501, A DID de B→42501, A depositos→42501, A filas=1 (propia)`;
    } finally {
      await anon.end();
      await a.end();
    }
  });

  // -------------------------------------------------------------------------
  // Mutación: mismo escenario SIN 0041 (estado anterior = SQL viejo).
  // Si acá NO hay fuga, las pruebas de arriba no estarían demostrando nada.
  // -------------------------------------------------------------------------
  await test("6. mutación: con el SQL anterior a 0041 (sin la migración) la fuga es real", async () => {
    await cluster.createDatabase(DB_PREV);
    mutationAdmin = await connect(DB_PREV);
    await applySql(mutationAdmin, DB_STUB, "stub Supabase (previo)");
    for (const name of PREREQUISITES) {
      await applySql(mutationAdmin, readMigration(name), `${name} (previo)`);
    }
    await seed(mutationAdmin);

    const a = await session(DB_PREV, "authenticated", USER_A, { aal: "aal2" });
    try {
      // Estado viejo: GRANT de tabla + política sólo por auth.uid().
      const did = await attempt(() => a.query("select privy_user_id from public.wallets"));
      assert.equal(
        did.ok,
        true,
        "el SQL viejo ya bloqueaba privy_user_id: la prueba de mutación no demuestra nada",
      );
      assert.equal(did.rows.length, 1, "el SQL viejo debía devolver la fila propia");
      assert.equal(did.rows[0].privy_user_id, DID_A, "el DID leído no es el esperado");

      const star = await attempt(() => a.query("select * from public.wallets"));
      assert.equal(star.ok, true, "el SQL viejo ya bloqueaba select *");
      assert.equal(star.rows[0].privy_wallet_id, "pw-a", "privy_wallet_id no se filtraba");

      // Reproduce LITERALMENTE la aserción del caso 3 contra el SQL viejo y
      // captura el fallo: esa es la prueba de que la prueba no pasa de gratis.
      let assertionFailure = null;
      try {
        assert.equal(did.ok, false, `A leyó privy_user_id: ${JSON.stringify(did.rows)}`);
      } catch (error) {
        assertionFailure = error.message.replace(/\s+/g, " ").trim();
      }
      assert.ok(
        assertionFailure,
        "la aserción del caso 3 pasó con el SQL viejo: la prueba de mutación no demuestra nada",
      );

      // Lo que 0029 ya cerraba (para ser honestos con el alcance de 0041):
      // la fila de B no era visible y crypto_deposits devolvía 0 filas por RLS
      // sin políticas. 0041 lo convierte en error de permiso además de forzar
      // RLS y sacar la columna del GRANT.
      const otherRow = await attempt(() =>
        a.query("select user_id, address from public.wallets where user_id = $1", [USER_B]),
      );
      assert.equal(otherRow.ok, true);
      assert.equal(otherRow.rows.length, 0, "la RLS vieja ya ocultaba la fila de B");

      const deposits = await attempt(() => a.query("select * from public.crypto_deposits"));
      assert.equal(deposits.ok, true, "el SQL viejo ya revocaba crypto_deposits");
      assert.equal(
        deposits.rows.length,
        0,
        "el SQL viejo debía devolver 0 filas por RLS sin políticas",
      );

      return [
        "SQL viejo (0029+0040, sin 0041):",
        `A lee su privy_user_id=${did.rows[0].privy_user_id} y select * (privy_wallet_id=pw-a)`,
        `la aserción del caso 3 falla → "AssertionError: ${assertionFailure}"`,
        "la aserción 1 (anon) ya la cerraba el revoke de 0029: es guarda de regresión;",
        "la fila de B y los depositos de B ya los cerraba 0029 (RLS sin políticas) devolviendo 0 filas;",
        "0041 los convierte en error de permiso (42501), fuerza RLS y saca privy_user_id/privy_wallet_id del GRANT",
      ].join("\n      ");
    } finally {
      await a.end();
    }
  });

  // -------------------------------------------------------------------------
  // Resumen
  // -------------------------------------------------------------------------
  console.log("");
  console.log(`Resultado: ${passed} pasaron, ${failures.length} fallaron.`);
  if (failures.length > 0) {
    console.log("Fallos:");
    for (const failure of failures) {
      console.log(`- ${failure.name}: ${failure.error.message}`);
    }
    process.exitCode = 1;
  }
} finally {
  await admin?.end().catch(() => {});
  await mutationAdmin?.end().catch(() => {});
  await cluster.stop().catch(() => {});
}
