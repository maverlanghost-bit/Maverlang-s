/**
 * Pruebas reales de las migraciones 0041 y 0042 contra PostgreSQL aislado.
 *
 * - Levanta un PostgreSQL embebido (embedded-postgres) en 127.0.0.1 con un
 *   puerto libre y un directorio temporal propio. NO se conecta a ninguna
 *   base existente ni lee `.env`.
 * - Replica el entorno mínimo de Supabase (roles anon/authenticated/
 *   service_role, esquema auth, auth.uid(), auth.jwt(), auth.mfa_factors y
 *   privilegios por defecto equivalentes).
 * - Aplica las migraciones previas necesarias y luego 0041/0042 dos veces
 *   (idempotencia).
 * - Ejecuta pruebas de RLS, privilegios, restricciones, ventanas de tiempo y
 *   concurrencia real con varias conexiones.
 *
 * Requisito: `embedded-postgres` instalado FUERA del proyecto (no toca
 * package.json). Ver supabase/tests/README.md.
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

const DB = "maverlang_migrations_test";
const PASSWORD = "postgres";

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

const PREREQUISITES = [
  "0002_supabase_auth.sql",
  "0011_admin.sql",
  "0027_orders_real.sql",
  "0028_limits.sql",
  "0029_wallets.sql",
  "0030_wallet_movements.sql",
  "0031_order_reconcile.sql",
  "0040_wallets_privy_binding.sql",
];

/** Entorno mínimo equivalente a Supabase (sin red y sin datos reales). */
const SUPABASE_STUB = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

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

-- Mismo contrato que Supabase: el subject y el claim viajan en GUCs de la
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

-- Privilegios por defecto de un proyecto Supabase: los objetos nuevos en
-- public nacen con grants para los tres roles y las migraciones recortan.
alter default privileges for role postgres in schema public
  grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all on sequences to postgres, anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all on functions to postgres, anon, authenticated, service_role;
`;

const port = await freePort();
const dataDir = path.join(os.tmpdir(), `maverlang-pg-${process.pid}-${Date.now()}`);
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

const failures = [];
let passed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`PASS  ${name}`);
  } catch (error) {
    failures.push({ name, error });
    console.log(`FAIL  ${name}`);
    console.log(`      ${error.message.replace(/\n/g, "\n      ")}`);
  }
}

function connectOptions() {
  return {
    host: "127.0.0.1",
    port,
    user: "postgres",
    password: PASSWORD,
    database: DB,
  };
}

async function connect() {
  const client = new Client(connectOptions());
  await client.connect();
  await client.query("set statement_timeout = '20s'");
  await client.query("set lock_timeout = '10s'");
  return client;
}

async function connectAs(role) {
  const client = await connect();
  await client.query(`set role ${role}`);
  return client;
}

async function capture(fn) {
  try {
    return { ok: true, value: await fn() };
  } catch (error) {
    return { ok: false, error };
  }
}

async function expectSqlError(fn, pattern, label) {
  const result = await capture(fn);
  assert.equal(result.ok, false, `${label}: se esperaba un error de PostgreSQL`);
  const error = result.error;
  const haystack = `${error.code ?? ""} ${error.message ?? ""}`;
  assert.match(haystack, pattern, `${label}: error inesperado: ${haystack}`);
  return error;
}

async function applySql(client, sql, label) {
  try {
    await client.query(sql);
  } catch (error) {
    error.message = `${label}: ${error.message}`;
    throw error;
  }
}

let admin;

async function resetData() {
  await admin.query("truncate table auth.users restart identity cascade");
  await admin.query(`
    insert into public.app_flags (key, value)
    values ('global_daily_usd', '10000'::jsonb)
    on conflict (key) do update set value = excluded.value
  `);
}

async function seedUser(id, email = `${id}@example.test`) {
  await admin.query("insert into auth.users (id, email) values ($1, $2)", [id, email]);
}

async function setLimits(userId, { perOrder = 200, daily = 500, monthly = 2000 } = {}) {
  await admin.query(
    `insert into public.user_limits (user_id, per_order_usd, daily_usd, monthly_usd)
     values ($1, $2, $3, $4)
     on conflict (user_id) do update set
       per_order_usd = excluded.per_order_usd,
       daily_usd = excluded.daily_usd,
       monthly_usd = excluded.monthly_usd`,
    [userId, perOrder, daily, monthly],
  );
}

async function setGlobalDaily(value) {
  await admin.query(
    `insert into public.app_flags (key, value)
     values ('global_daily_usd', $1::jsonb)
     on conflict (key) do update set value = excluded.value`,
    [JSON.stringify(String(value))],
  );
}

async function seedOrder(userId, amount, { status = "confirmed", isDemo = false, createdAt = null } = {}) {
  const { rows } = await admin.query(
    `insert into public.orders
       (user_id, side, symbol, mint, in_amount_ui, status, is_demo, created_at)
     values ($1, 'buy', 'AAPLx', 'mint-test', $2, $3, $4, coalesce($5::timestamptz, now()))
     returning id`,
    [userId, amount, status, isDemo, createdAt],
  );
  return rows[0].id;
}

async function reserve(client, userId, requestId, amount, expires = "2 minutes") {
  const { rows } = await client.query(
    `select reservation_id, reserved_expires_at
       from public.reserve_trade_amount($1::uuid, $2::text, $3::numeric, now() + $4::interval)`,
    [userId, requestId, amount, expires],
  );
  return rows[0];
}

async function countReservations(userId) {
  const { rows } = await admin.query(
    "select count(*)::int as n from public.trade_reservations where user_id = $1",
    [userId],
  );
  return rows[0].n;
}

async function setJwt(client, userId, claims) {
  const payload = { sub: userId, ...claims };
  await client.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify(payload)]);
  await client.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
}

function assertOne(rows, label) {
  assert.equal(rows.length, 1, `${label}: se esperaba 1 fila, llegaron ${rows.length}`);
}

try {
  await cluster.initialise();
  await cluster.start();
  await cluster.createDatabase(DB);

  admin = await connect();
  await applySql(admin, SUPABASE_STUB, "stub Supabase");

  for (const name of PREREQUISITES) {
    await applySql(admin, readMigration(name), name);
  }

  await test("0041 y 0042 aplican en PostgreSQL 17 sin errores", async () => {
    await applySql(admin, readMigration("0041_wallets_deposits_rls.sql"), "0041");
    await applySql(admin, readMigration("0042_trade_reservations.sql"), "0042");
  });

  await test("0041 y 0042 son idempotentes al aplicarse dos veces", async () => {
    await applySql(admin, readMigration("0041_wallets_deposits_rls.sql"), "0041 (2)");
    await applySql(admin, readMigration("0042_trade_reservations.sql"), "0042 (2)");
    const { rows } = await admin.query(
      `select count(*)::int as n from pg_policies
        where schemaname = 'public' and tablename = 'wallets' and policyname = 'wallets_select_own'`,
    );
    assert.equal(rows[0].n, 1);
  });

  // -------------------------------------------------------------------------
  // 0041 — RLS, privilegios, MFA y restricciones
  // -------------------------------------------------------------------------
  const protectedTables = [
    "wallets",
    "crypto_deposits",
    "wallet_movements",
    "wallet_reconciliations",
  ];

  await test("0041 fuerza RLS en las cuatro tablas de billetera", async () => {
    for (const table of protectedTables) {
      const { rows } = await admin.query(
        `select relrowsecurity, relforcerowsecurity
           from pg_class where oid = $1::regclass`,
        [`public.${table}`],
      );
      assert.equal(rows[0].relrowsecurity, true, `${table}: RLS no habilitada`);
      assert.equal(rows[0].relforcerowsecurity, true, `${table}: RLS no forzada`);
    }
  });

  await test("0041 no expone columnas privadas de wallets a authenticated", async () => {
    const { rows } = await admin.query(`
      select
        has_table_privilege('authenticated', 'public.wallets', 'select') as table_select,
        has_column_privilege('authenticated', 'public.wallets', 'id', 'select') as id_select,
        has_column_privilege('authenticated', 'public.wallets', 'address', 'select') as address_select,
        has_column_privilege('authenticated', 'public.wallets', 'privy_user_id', 'select') as privy_user_select,
        has_column_privilege('authenticated', 'public.wallets', 'privy_wallet_id', 'select') as privy_wallet_select,
        has_column_privilege('authenticated', 'public.wallets', 'updated_at', 'select') as updated_select,
        has_column_privilege('authenticated', 'public.wallets', 'user_id', 'insert') as user_insert
    `);
    const row = rows[0];
    assert.equal(row.table_select, false, "no debe haber SELECT de tabla completa");
    assert.equal(row.id_select, true);
    assert.equal(row.address_select, true);
    assert.equal(row.privy_user_select, false, "privy_user_id no debe ser legible");
    assert.equal(row.privy_wallet_select, false, "privy_wallet_id no debe ser legible");
    assert.equal(row.updated_select, false, "updated_at no debe estar en el grant");
    assert.equal(row.user_insert, false, "no debe haber escritura");
  });

  await test("0041 exige aal2 cuando existe un TOTP verificado (fail-closed)", async () => {
    await resetData();
    const user1 = "11111111-1111-4111-8111-111111111111";
    const user2 = "22222222-2222-4222-8222-222222222222";
    await seedUser(user1);
    await seedUser(user2);
    await admin.query(
      "insert into public.wallets (user_id, address, privy_wallet_id, privy_user_id) values ($1, $2, $3, $4)",
      [user1, "WalletUser1Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "pw-1", "did:privy:user1"],
    );
    await admin.query(
      "insert into public.wallets (user_id, address, privy_user_id) values ($1, $2, $3)",
      [user2, "WalletUser2Bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", "did:privy:user2"],
    );
    await admin.query(
      "insert into auth.mfa_factors (user_id, factor_type, status) values ($1, 'totp', 'verified')",
      [user1],
    );

    const session = await connectAs("authenticated");
    try {
      await setJwt(session, user1, { aal: "aal1" });
      let { rows } = await session.query(
        "select id, address from public.wallets order by created_at",
      );
      assert.equal(rows.length, 0, "aal1 con TOTP verificado no debe ver la billetera");

      await setJwt(session, user1, { aal: "aal2" });
      ({ rows } = await session.query("select id, address from public.wallets"));
      assertOne(rows, "aal2");
      assert.equal(rows[0].address, "WalletUser1Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");

      await setJwt(session, user2, { aal: "aal1" });
      ({ rows } = await session.query("select id, address from public.wallets"));
      assertOne(rows, "usuario sin TOTP");
      assert.equal(rows[0].address, "WalletUser2Bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");

      // Sin claim aal se trata como aal1: con TOTP presente, deniega.
      await setJwt(session, user1, {});
      ({ rows } = await session.query("select id, address from public.wallets"));
      assert.equal(rows.length, 0, "sin aal debe fallar cerrado");
    } finally {
      await session.end();
    }
  });

  await test("0041 oculta filas sin DID aunque el usuario sea el dueño", async () => {
    await resetData();
    const userId = "33333333-3333-4333-8333-333333333333";
    await seedUser(userId);
    await admin.query(
      "insert into public.wallets (user_id, address, privy_user_id) values ($1, $2, null)",
      [userId, "WalletLegacyCccccccccccccccccccccccccccccccc"],
    );
    const session = await connectAs("authenticated");
    try {
      await setJwt(session, userId, { aal: "aal2" });
      const { rows } = await session.query("select id, address from public.wallets");
      assert.equal(rows.length, 0, "una fila sin DID no debe exponerse");
    } finally {
      await session.end();
    }
  });

  await test("0041 bloquea lectura directa de columnas privadas y escrituras", async () => {
    await resetData();
    const userId = "44444444-4444-4444-8444-444444444444";
    await seedUser(userId);
    await admin.query(
      "insert into public.wallets (user_id, address, privy_user_id) values ($1, $2, $3)",
      [userId, "WalletPrivDddddddddddddddddddddddddddddddd", "did:privy:priv"],
    );
    const session = await connectAs("authenticated");
    try {
      await setJwt(session, userId, { aal: "aal2" });
      await expectSqlError(
        () => session.query("select privy_user_id from public.wallets"),
        /42501|permission denied/i,
        "select privy_user_id",
      );
      await expectSqlError(
        () => session.query("select * from public.wallets"),
        /42501|permission denied/i,
        "select *",
      );
      await expectSqlError(
        () =>
          session.query(
            "insert into public.wallets (user_id, address) values ($1, $2)",
            [userId, "WalletInsertEeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"],
          ),
        /42501|permission denied/i,
        "insert",
      );
      await expectSqlError(
        () => session.query("update public.wallets set address = address"),
        /42501|permission denied/i,
        "update",
      );
      await expectSqlError(
        () => session.query("delete from public.wallets"),
        /42501|permission denied/i,
        "delete",
      );
    } finally {
      await session.end();
    }
  });

  await test("0041 niega depositos, movimientos y conciliaciones a authenticated", async () => {
    const session = await connectAs("authenticated");
    try {
      for (const table of ["crypto_deposits", "wallet_movements", "wallet_reconciliations"]) {
        await expectSqlError(
          () => session.query(`select * from public.${table} limit 1`),
          /42501|permission denied/i,
          table,
        );
      }
    } finally {
      await session.end();
    }
  });

  await test("0041 aplica restricciones a filas nuevas y las deja NOT VALID", async () => {
    await resetData();
    const userId = "55555555-5555-4555-8555-555555555555";
    const other = "66666666-6666-4666-8666-666666666666";
    await seedUser(userId);
    await seedUser(other);

    const { rows: constraints } = await admin.query(`
      select conname, convalidated
        from pg_constraint
       where conname in (
         'wallets_privy_user_id_format',
         'wallets_address_not_blank',
         'crypto_deposits_signature_not_blank',
         'crypto_deposits_amount_bounds',
         'wallet_movements_reference_not_blank',
         'wallet_movements_signature_not_blank',
         'wallet_movements_amount_bounds'
       )
       order by conname
    `);
    assert.equal(constraints.length, 7, "faltan restricciones de 0041");
    assert.ok(constraints.every((row) => row.convalidated === false), "deben quedar NOT VALID");

    await expectSqlError(
      () =>
        admin.query(
          "insert into public.wallets (user_id, address, privy_user_id) values ($1, $2, $3)",
          [userId, "WalletBadDidFfffffffffffffffffffffffffffffff", "privy:no-es-did"],
        ),
      /23514|wallets_privy_user_id_format/i,
      "DID inválido",
    );
    await expectSqlError(
      () =>
        admin.query(
          "insert into public.wallets (user_id, address, privy_user_id) values ($1, $2, $3)",
          [userId, "   ", "did:privy:blank"],
        ),
      /23514|wallets_address_not_blank/i,
      "dirección en blanco",
    );

    await admin.query(
      "insert into public.wallets (user_id, address, privy_user_id) values ($1, $2, $3)",
      [userId, "WalletOkGgggggggggggggggggggggggggggggggggg", "did:privy:ok"],
    );
    await expectSqlError(
      () =>
        admin.query(
          "insert into public.wallets (user_id, address, privy_user_id) values ($1, $2, $3)",
          [userId, "WalletSecondHhhhhhhhhhhhhhhhhhhhhhhhhhhhhhhh", "did:privy:second"],
        ),
      /23505|wallets_one_privy_identity_per_user/i,
      "dos identidades para una cuenta",
    );
    await expectSqlError(
      () =>
        admin.query(
          "insert into public.wallets (user_id, address, privy_user_id) values ($1, $2, $3)",
          [other, "WalletOtherIiiiiiiiiiiiiiiiiiiiiiiiiiiiiiii", "did:privy:ok"],
        ),
      /23505|wallets_privy_user_id_key/i,
      "DID repetido entre cuentas",
    );

    await expectSqlError(
      () =>
        admin.query(
          "insert into public.crypto_deposits (user_id, mint, amount_ui, signature) values ($1, 'mint', 10, '   ')",
          [userId],
        ),
      /23514|crypto_deposits_signature_not_blank/i,
      "firma de depósito en blanco",
    );
    await expectSqlError(
      () =>
        admin.query(
          "insert into public.crypto_deposits (user_id, mint, amount_ui) values ($1, 'mint', 0)",
          [userId],
        ),
      /23514/i,
      "monto de depósito cero",
    );
    await expectSqlError(
      () =>
        admin.query(
          "insert into public.wallet_movements (user_id, kind, mint, amount_ui, reference) values ($1, 'deposit', 'mint', 10, '  ')",
          [userId],
        ),
      /23514|wallet_movements_reference_not_blank/i,
      "referencia en blanco",
    );
    await expectSqlError(
      () =>
        admin.query(
          "insert into public.wallet_movements (user_id, kind, mint, amount_ui, reference, signature) values ($1, 'deposit', 'mint', 10, 'ref-1', '  ')",
          [userId],
        ),
      /23514|wallet_movements_signature_not_blank/i,
      "firma de movimiento en blanco",
    );
  });

  await test("0041 restringe el execute de mfa_step_pending a authenticated", async () => {
    const { rows } = await admin.query(`
      select
        has_function_privilege('authenticated', 'public.mfa_step_pending()', 'execute') as auth_ok,
        has_function_privilege('anon', 'public.mfa_step_pending()', 'execute') as anon_ok,
        has_function_privilege('service_role', 'public.mfa_step_pending()', 'execute') as service_ok
    `);
    assert.equal(rows[0].auth_ok, true);
    assert.equal(rows[0].anon_ok, false);
    // service_role conserva EXECUTE por los privilegios por defecto del
    // proyecto; la política sólo se evalúa para authenticated.
    assert.equal(rows[0].service_ok, true);
    const { rows: policies } = await admin.query(`
      select qual from pg_policies
       where schemaname = 'public' and tablename = 'wallets' and policyname = 'wallets_select_own'
    `);
    assertOne(policies, "política wallets_select_own");
    assert.match(policies[0].qual, /mfa_step_pending/);
    assert.match(policies[0].qual, /did:privy:/);
  });

  // -------------------------------------------------------------------------
  // 0042 — reservas, topes y permisos
  // -------------------------------------------------------------------------
  await test("0042 crea tabla, índices, columnas y funciones esperadas", async () => {
    const { rows: table } = await admin.query(`
      select
        to_regclass('public.trade_reservations') is not null as table_ok,
        (select count(*)::int from pg_indexes
          where schemaname = 'public' and tablename = 'trade_reservations'
            and indexname in ('trade_reservations_active_user_idx', 'trade_reservations_active_idx')) as indexes,
        (select count(*)::int from information_schema.columns
          where table_schema = 'public' and table_name = 'orders' and column_name = 'notional_usd') as notional_col,
        (select count(*)::int from pg_constraint
          where conname = 'orders_notional_usd_check') as notional_check
    `);
    assert.equal(table[0].table_ok, true);
    assert.equal(table[0].indexes, 2);
    assert.equal(table[0].notional_col, 1);
    assert.equal(table[0].notional_check, 1);

    const { rows: functions } = await admin.query(`
      select proname
        from pg_proc
       where pronamespace = 'public'::regnamespace
         and proname in (
           'safe_positive_numeric',
           'reserve_trade_amount',
           'consume_trade_reservation',
           'release_trade_reservation',
           'rekey_trade_reservation',
           'read_trade_reservation'
         )
       order by proname
    `);
    assert.equal(functions.length, 6, "faltan funciones de 0042");
  });

  await test("0042 sólo permite ejecutar las funciones a service_role", async () => {
    const signatures = [
      "public.reserve_trade_amount(uuid,text,numeric,timestamptz)",
      "public.consume_trade_reservation(uuid,text,numeric)",
      "public.release_trade_reservation(uuid,text)",
      "public.rekey_trade_reservation(uuid,text,text)",
      "public.read_trade_reservation(uuid,text)",
      "public.safe_positive_numeric(jsonb,numeric)",
    ];
    for (const signature of signatures) {
      const { rows } = await admin.query(
        `select
           has_function_privilege('service_role', $1, 'execute') as service_ok,
           has_function_privilege('authenticated', $1, 'execute') as auth_ok,
           has_function_privilege('anon', $1, 'execute') as anon_ok`,
        [signature],
      );
      assert.equal(rows[0].service_ok, true, `${signature}: service_role sin execute`);
      assert.equal(rows[0].auth_ok, false, `${signature}: authenticated con execute`);
      assert.equal(rows[0].anon_ok, false, `${signature}: anon con execute`);
    }

    const { rows: table } = await admin.query(`
      select
        has_table_privilege('service_role', 'public.trade_reservations', 'select,insert,update') as service_ok,
        has_table_privilege('authenticated', 'public.trade_reservations', 'select') as auth_ok,
        has_table_privilege('anon', 'public.trade_reservations', 'select') as anon_ok
    `);
    assert.equal(table[0].service_ok, true);
    assert.equal(table[0].auth_ok, false);
    assert.equal(table[0].anon_ok, false);
  });

  await test("0042 reserva cupo y respeta el tope por orden", async () => {
    await resetData();
    const user = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    await seedUser(user);
    const service = await connectAs("service_role");
    try {
      const row = await reserve(service, user, "req-ok", 150);
      assert.ok(row.reservation_id);
      assert.ok(row.reserved_expires_at instanceof Date);
      await expectSqlError(
        () => reserve(service, user, "req-order", 200.01),
        /MV_LIMIT_ORDER/,
        "tope por orden",
      );
    } finally {
      await service.end();
    }
  });

  await test("0042 suma órdenes reales del día y respeta el tope diario", async () => {
    await resetData();
    const user = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    await seedUser(user);
    await seedOrder(user, 400);
    const service = await connectAs("service_role");
    try {
      await reserve(service, user, "req-100", 100);
      await expectSqlError(
        () => reserve(service, user, "req-1", 1),
        /MV_LIMIT_DAILY/,
        "tope diario exacto",
      );
    } finally {
      await service.end();
    }
  });

  await test("0042 no cuenta failed, expired ni demo", async () => {
    await resetData();
    const user = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    await seedUser(user);
    await setLimits(user, { perOrder: 5000, daily: 5000, monthly: 10000 });
    await seedOrder(user, 1000, { status: "failed" });
    await seedOrder(user, 1000, { status: "expired" });
    await seedOrder(user, 1000, { isDemo: true });
    const service = await connectAs("service_role");
    try {
      const row = await reserve(service, user, "req-ok", 500);
      assert.ok(row.reservation_id);
    } finally {
      await service.end();
    }
  });

  await test("0042 usa las ventanas America/Santiago (día y mes)", async () => {
    await resetData();
    const user = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    await seedUser(user);
    const { rows: bounds } = await admin.query(`
      select
        (date_trunc('day', now() at time zone 'America/Santiago') at time zone 'America/Santiago') as day_start,
        (date_trunc('month', now() at time zone 'America/Santiago') at time zone 'America/Santiago') as month_start
    `);
    const dayStart = bounds[0].day_start;
    const monthStart = bounds[0].month_start;

    // Ayer: cuenta para el mes, no para el día.
    await seedOrder(user, 600, { createdAt: new Date(dayStart.getTime() - 1000) });
    const service = await connectAs("service_role");
    try {
      await reserve(service, user, "req-yesterday", 100);

      // Hoy: 450 + reserva activa 100 + 100 = 650 > 500.
      await seedOrder(user, 450);
      await expectSqlError(
        () => reserve(service, user, "req-today", 100),
        /MV_LIMIT_DAILY/,
        "límite diario con orden de ayer",
      );
    } finally {
      await service.end();
    }

    const user2 = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    await seedUser(user2);
    await seedOrder(user2, 5000, { createdAt: new Date(monthStart.getTime() - 1000) });
    const service2 = await connectAs("service_role");
    try {
      await reserve(service2, user2, "req-last-month", 200);
      await seedOrder(user2, 1900);
      await expectSqlError(
        () => reserve(service2, user2, "req-month", 100),
        /MV_LIMIT_MONTHLY/,
        "límite mensual con orden del mes anterior",
      );
    } finally {
      await service2.end();
    }
  });

  await test("0042 respeta el tope global diario entre usuarios", async () => {
    await resetData();
    await setGlobalDaily(100);
    const userA = "ffffffff-ffff-4fff-8fff-ffffffffffff";
    const userB = "99999999-9999-4999-8999-999999999999";
    await seedUser(userA);
    await seedUser(userB);
    await seedOrder(userB, 90);
    const service = await connectAs("service_role");
    try {
      await expectSqlError(
        () => reserve(service, userA, "req-global", 20),
        /MV_LIMIT_GLOBAL/,
        "tope global",
      );
    } finally {
      await service.end();
    }
  });

  await test("0042 idempotencia: mismo requestId devuelve la misma reserva", async () => {
    await resetData();
    const user = "12121212-1212-4212-8212-121212121212";
    await seedUser(user);
    const service = await connectAs("service_role");
    try {
      const first = await reserve(service, user, "req-same", 100);
      const second = await reserve(service, user, "req-same", 100);
      assert.equal(second.reservation_id, first.reservation_id);
      assert.equal(await countReservations(user), 1);
      await expectSqlError(
        () => reserve(service, user, "req-same", 101),
        /MV_RESERVATION_CONFLICT/,
        "mismo requestId con otro monto",
      );
    } finally {
      await service.end();
    }
  });

  await test("0042 rechaza reservas inválidas o ya vencidas", async () => {
    await resetData();
    const user = "13131313-1313-4313-8313-131313131313";
    await seedUser(user);
    const service = await connectAs("service_role");
    try {
      await expectSqlError(
        () => reserve(service, user, "", 100),
        /MV_RESERVATION_INVALID/,
        "requestId vacío",
      );
      await expectSqlError(
        () => reserve(service, user, "req-zero", 0),
        /MV_RESERVATION_INVALID/,
        "monto cero",
      );
      await expectSqlError(
        () => reserve(service, user, "req-expired", 100, "-1 second"),
        /MV_RESERVATION_EXPIRED/,
        "vencimiento pasado",
      );
    } finally {
      await service.end();
    }
  });

  await test("0042 consume, libera y re-etiqueta de forma idempotente", async () => {
    await resetData();
    const user = "14141414-1414-4414-8414-141414141414";
    await seedUser(user);
    const service = await connectAs("service_role");
    try {
      await reserve(service, user, "req-consume", 100);
      let { rows } = await service.query(
        "select public.consume_trade_reservation($1::uuid, $2::text, $3::numeric) as ok",
        [user, "req-consume", 101],
      );
      assert.equal(rows[0].ok, false, "un monto distinto no consume");
      ({ rows } = await service.query(
        "select public.consume_trade_reservation($1::uuid, $2::text, $3::numeric) as ok",
        [user, "req-consume", 100],
      ));
      assert.equal(rows[0].ok, true);
      ({ rows } = await service.query(
        "select public.consume_trade_reservation($1::uuid, $2::text, null) as ok",
        [user, "req-consume"],
      ));
      assert.equal(rows[0].ok, false, "consumir dos veces debe devolver false");
      ({ rows } = await service.query(
        "select public.release_trade_reservation($1::uuid, $2::text) as ok",
        [user, "req-consume"],
      ));
      assert.equal(rows[0].ok, false, "no se libera una reserva consumida");

      await reserve(service, user, "req-release", 100);
      ({ rows } = await service.query(
        "select public.release_trade_reservation($1::uuid, $2::text) as ok",
        [user, "req-release"],
      ));
      assert.equal(rows[0].ok, true);
      ({ rows } = await service.query(
        "select public.release_trade_reservation($1::uuid, $2::text) as ok",
        [user, "req-release"],
      ));
      assert.equal(rows[0].ok, false, "liberar dos veces debe devolver false");

      await reserve(service, user, "req-old", 100);
      ({ rows } = await service.query(
        "select public.rekey_trade_reservation($1::uuid, $2::text, $3::text) as ok",
        [user, "req-old", "req-new"],
      ));
      assert.equal(rows[0].ok, true);
      ({ rows } = await service.query(
        "select * from public.read_trade_reservation($1::uuid, $2::text)",
        [user, "req-old"],
      ));
      assert.equal(rows.length, 0, "el requestId viejo ya no debe existir");
      ({ rows } = await service.query(
        "select * from public.read_trade_reservation($1::uuid, $2::text)",
        [user, "req-new"],
      ));
      assertOne(rows, "reserva re-etiquetada");
      assert.equal(rows[0].status, "reserved");

      await reserve(service, user, "req-conflict-a", 100);
      await reserve(service, user, "req-conflict-b", 100);
      await expectSqlError(
        () =>
          service.query(
            "select public.rekey_trade_reservation($1::uuid, $2::text, $3::text)",
            [user, "req-conflict-a", "req-conflict-b"],
          ),
        /MV_RESERVATION_CONFLICT/,
        "rekey a un id existente",
      );
      ({ rows } = await service.query(
        "select public.release_trade_reservation($1::uuid, $2::text) as ok",
        [user, "req-does-not-exist"],
      ));
      assert.equal(rows[0].ok, false, "liberar una reserva inexistente devuelve false");

      await expectSqlError(
        () =>
          service.query(
            "select public.rekey_trade_reservation($1::uuid, $2::text, $3::text)",
            [user, "req-missing", "req-new-2"],
          ),
        /MV_RESERVATION_MISSING/,
        "rekey inexistente",
      );
    } finally {
      await service.end();
    }
  });

  await test("0042 una reserva vencida no se consume", async () => {
    await resetData();
    const user = "15151515-1515-4515-8515-151515151515";
    await seedUser(user);
    const service = await connectAs("service_role");
    try {
      await reserve(service, user, "req-expire", 100);
      await admin.query(
        "update public.trade_reservations set expires_at = now() - interval '1 second' where user_id = $1",
        [user],
      );
      const { rows } = await service.query(
        "select public.consume_trade_reservation($1::uuid, $2::text, $3::numeric) as ok",
        [user, "req-expire", 100],
      );
      assert.equal(rows[0].ok, false);
    } finally {
      await service.end();
    }
  });

  await test("0042 valida notional_usd y no expone trade_reservations a authenticated", async () => {
    await resetData();
    const user = "16161616-1616-4616-8616-161616161616";
    await seedUser(user);
    await expectSqlError(
      () =>
        admin.query(
          "insert into public.orders (user_id, side, symbol, mint, in_amount_ui, status, notional_usd) values ($1, 'buy', 'AAPLx', 'mint', 10, 'confirmed', 0)",
          [user],
        ),
      /23514|orders_notional_usd_check/i,
      "notional cero",
    );
    await expectSqlError(
      () =>
        admin.query(
          "insert into public.orders (user_id, side, symbol, mint, in_amount_ui, status, notional_usd) values ($1, 'buy', 'AAPLx', 'mint', 10, 'confirmed', -1)",
          [user],
        ),
      /23514|orders_notional_usd_check/i,
      "notional negativo",
    );

    const session = await connectAs("authenticated");
    try {
      await setJwt(session, user, { aal: "aal2" });
      await expectSqlError(
        () => session.query("select * from public.trade_reservations"),
        /42501|permission denied/i,
        "select trade_reservations",
      );
      await expectSqlError(
        () =>
          session.query(
            "select * from public.reserve_trade_amount($1::uuid, 'r', 10, now() + interval '1 minute')",
            [user],
          ),
        /42501|permission denied/i,
        "rpc reserve",
      );
    } finally {
      await session.end();
    }
  });

  await test("0042 no cuenta dos veces la reserva consumida y su orden", async () => {
    await resetData();
    const user = "1a1a1a1a-1a1a-4a1a-8a1a-1a1a1a1a1a1a";
    await seedUser(user);
    await setLimits(user, { perOrder: 500, daily: 500 });
    const service = await connectAs("service_role");
    try {
      await reserve(service, user, "dc-1", 300);
      await service.query(
        "select public.consume_trade_reservation($1::uuid, $2::text, $3::numeric)",
        [user, "dc-1", 300],
      );
      await admin.query(
        `insert into public.orders
           (user_id, request_id, side, symbol, mint, in_amount_ui, status, notional_usd)
         values ($1, 'dc-1', 'buy', 'AAPLx', 'mint-test', 300, 'pending', 300)`,
        [user],
      );
      // 300 de la orden + 200 nuevos = 500; la reserva consumida ya no suma.
      const row = await reserve(service, user, "dc-2", 200);
      assert.ok(row.reservation_id);
    } finally {
      await service.end();
    }
  });

  await test("0042 una reserva consumida sin orden sigue reteniendo cupo", async () => {
    await resetData();
    const user = "1b1b1b1b-1b1b-4b1b-8b1b-1b1b1b1b1b1b";
    await seedUser(user);
    await setLimits(user, { perOrder: 500, daily: 500 });
    const service = await connectAs("service_role");
    try {
      await reserve(service, user, "hold-1", 300);
      await service.query(
        "select public.consume_trade_reservation($1::uuid, $2::text, $3::numeric)",
        [user, "hold-1", 300],
      );
      await expectSqlError(
        () => reserve(service, user, "hold-2", 300),
        /MV_LIMIT_DAILY/,
        "reserva consumida sin orden",
      );
    } finally {
      await service.end();
    }
  });

  await test("0042 el tope global no excluye reservas homónimas de otro usuario", async () => {
    await resetData();
    await setGlobalDaily(1000);
    const userA = "1c1c1c1c-1c1c-4c1c-8c1c-1c1c1c1c1c1c";
    const userB = "1d1d1d1d-1d1d-4d1d-8d1d-1d1d1d1d1d1d";
    await seedUser(userA);
    await seedUser(userB);
    await setLimits(userA, { perOrder: 1000, daily: 1000, monthly: 2000 });
    await setLimits(userB, { perOrder: 1000, daily: 1000, monthly: 2000 });
    const service = await connectAs("service_role");
    try {
      await reserve(service, userB, "shared-request", 500);
      await expectSqlError(
        () => reserve(service, userA, "shared-request", 600),
        /MV_LIMIT_GLOBAL/,
        "requestId compartido entre usuarios",
      );
    } finally {
      await service.end();
    }
  });

  await test("0042 safe_positive_numeric rechaza basura y usa el default", async () => {
    const { rows } = await admin.query(`
      select
        public.safe_positive_numeric('150'::jsonb, 200) as num,
        public.safe_positive_numeric('"150"'::jsonb, 200) as str,
        public.safe_positive_numeric('" 42 "'::jsonb, 200) as spaced,
        public.safe_positive_numeric('0'::jsonb, 200) as zero,
        public.safe_positive_numeric('-5'::jsonb, 200) as negative,
        public.safe_positive_numeric('"1e3"'::jsonb, 200) as sci,
        public.safe_positive_numeric('{"x":1}'::jsonb, 200) as obj,
        public.safe_positive_numeric('null'::jsonb, 200) as nil
    `);
    const row = rows[0];
    assert.equal(Number(row.num), 150);
    assert.equal(Number(row.str), 150);
    assert.equal(Number(row.spaced), 42);
    assert.equal(Number(row.zero), 200);
    assert.equal(Number(row.negative), 200);
    assert.equal(Number(row.sci), 200);
    assert.equal(Number(row.obj), 200);
    assert.equal(Number(row.nil), 200);
  });

  await test("service_role conserva acceso con RLS forzada y sin políticas", async () => {
    await resetData();
    const user = "1e1e1e1e-1e1e-4e1e-8e1e-1e1e1e1e1e1e";
    await seedUser(user);
    await admin.query(
      "insert into public.wallets (user_id, address, privy_user_id) values ($1, $2, $3)",
      [user, "WalletServiceJjjjjjjjjjjjjjjjjjjjjjjjjjjjjjj", "did:privy:service"],
    );
    const service = await connectAs("service_role");
    try {
      let { rows } = await service.query("select * from public.wallets where user_id = $1", [user]);
      assertOne(rows, "service_role wallets");
      assert.equal(rows[0].privy_user_id, "did:privy:service");

      await reserve(service, user, "svc-1", 100);
      ({ rows } = await service.query("select * from public.trade_reservations where user_id = $1", [user]));
      assertOne(rows, "service_role trade_reservations");

      await expectSqlError(
        () =>
          service.query(
            "insert into public.wallets (user_id, address, privy_user_id) values ($1, $2, $3)",
            [user, "WalletService2Kkkkkkkkkkkkkkkkkkkkkkkkkkkkkk", "did:privy:service-2"],
          ),
        /23505|wallets_one_privy_identity_per_user/i,
        "segunda identidad con service_role",
      );
    } finally {
      await service.end();
    }
  });

  // -------------------------------------------------------------------------
  // Concurrencia real (varias conexiones)
  // -------------------------------------------------------------------------
  await test("concurrencia: dos reservas simultáneas no superan el tope diario", async () => {
    await resetData();
    const user = "17171717-1717-4717-8717-171717171717";
    await seedUser(user);
    await setLimits(user, { perOrder: 500, daily: 500 });
    const clients = await Promise.all([connectAs("service_role"), connectAs("service_role")]);
    try {
      const results = await Promise.all([
        capture(() => reserve(clients[0], user, "race-a", 300)),
        capture(() => reserve(clients[1], user, "race-b", 300)),
      ]);
      const ok = results.filter((r) => r.ok);
      const failed = results.filter((r) => !r.ok);
      assert.equal(ok.length, 1, `se esperaba 1 éxito, hubo ${ok.length}`);
      assert.equal(failed.length, 1);
      assert.match(failed[0].error.message, /MV_LIMIT_DAILY/);
      assert.equal(await countReservations(user), 1);
    } finally {
      await Promise.all(clients.map((c) => c.end()));
    }
  });

  await test("concurrencia: 10 reservas del mismo usuario respetan el cupo", async () => {
    await resetData();
    const user = "18181818-1818-4818-8818-181818181818";
    await seedUser(user);
    await setLimits(user, { daily: 500 });
    const clients = await Promise.all(
      Array.from({ length: 10 }, () => connectAs("service_role")),
    );
    try {
      const results = await Promise.all(
        clients.map((client, index) =>
          capture(() => reserve(client, user, `batch-${index}`, 60)),
        ),
      );
      const ok = results.filter((r) => r.ok).length;
      assert.equal(ok, 8, `se esperaban 8 reservas de US$60, hubo ${ok}`);
      assert.equal(results.filter((r) => !r.ok).length, 2);
      const { rows } = await admin.query(
        "select coalesce(sum(amount_usd), 0)::numeric as total from public.trade_reservations where user_id = $1",
        [user],
      );
      assert.equal(Number(rows[0].total), 480);
    } finally {
      await Promise.all(clients.map((c) => c.end()));
    }
  });

  await test("concurrencia: 10 llamadas con el mismo requestId crean una sola reserva", async () => {
    await resetData();
    const user = "19191919-1919-4919-8919-191919191919";
    await seedUser(user);
    const clients = await Promise.all(
      Array.from({ length: 10 }, () => connectAs("service_role")),
    );
    try {
      const results = await Promise.all(
        clients.map((client) => capture(() => reserve(client, user, "same-request", 100))),
      );
      assert.equal(results.filter((r) => r.ok).length, 10);
      const ids = new Set(results.filter((r) => r.ok).map((r) => r.value.reservation_id));
      assert.equal(ids.size, 1, "todas deben devolver la misma reserva");
      assert.equal(await countReservations(user), 1);
    } finally {
      await Promise.all(clients.map((c) => c.end()));
    }
  });

  await test("concurrencia: el tope global se respeta entre 25 usuarios", async () => {
    await resetData();
    await setGlobalDaily(1000);
    const users = Array.from(
      { length: 25 },
      (_, index) => `2${String(index).padStart(7, "0")}-2222-4222-8222-222222222222`,
    );
    for (const user of users) await seedUser(user);
    const clients = await Promise.all(
      users.map(() => connectAs("service_role")),
    );
    try {
      const results = await Promise.all(
        users.map((user, index) =>
          capture(() => reserve(clients[index], user, `global-${index}`, 50)),
        ),
      );
      const ok = results.filter((r) => r.ok).length;
      const failed = results.filter((r) => !r.ok);
      assert.equal(ok, 20, `se esperaban 20 reservas de US$50, hubo ${ok}`);
      assert.equal(failed.length, 5);
      assert.ok(failed.every((r) => /MV_LIMIT_GLOBAL/.test(r.error.message)));
      const { rows } = await admin.query(
        "select coalesce(sum(amount_usd), 0)::numeric as total from public.trade_reservations",
      );
      assert.equal(Number(rows[0].total), 1000);
    } finally {
      await Promise.all(clients.map((c) => c.end()));
    }
  });

  await test("concurrencia: consumos y reservas simultáneas no bloquean ni duplican", async () => {
    await resetData();
    const user = "20202020-2020-4020-8020-202020202020";
    await seedUser(user);
    await setLimits(user, { daily: 2000, monthly: 5000 });
    const reservationClient = await connectAs("service_role");
    const consumeClient = await connectAs("service_role");
    try {
      await reserve(reservationClient, user, "mix-1", 100);
      const results = await Promise.all([
        capture(() => reserve(reservationClient, user, "mix-2", 100)),
        capture(() =>
          consumeClient.query(
            "select public.consume_trade_reservation($1::uuid, $2::text, $3::numeric) as ok",
            [user, "mix-1", 100],
          ),
        ),
      ]);
      assert.equal(results.filter((r) => r.ok).length, 2);
      assert.equal(await countReservations(user), 2);
    } finally {
      await reservationClient.end();
      await consumeClient.end();
    }
  });

  await test("0041 y 0042 se reaplican con datos existentes sin perder filas", async () => {
    const before = await countReservations("20202020-2020-4020-8020-202020202020");
    assert.ok(before > 0, "la prueba de concurrencia debió dejar reservas");
    await applySql(admin, readMigration("0041_wallets_deposits_rls.sql"), "0041 (con datos)");
    await applySql(admin, readMigration("0042_trade_reservations.sql"), "0042 (con datos)");
    assert.equal(await countReservations("20202020-2020-4020-8020-202020202020"), before);
    const { rows } = await admin.query(
      `select count(*)::int as n from pg_policies
        where schemaname = 'public' and tablename = 'wallets' and policyname = 'wallets_select_own'`,
    );
    assert.equal(rows[0].n, 1);
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
  await cluster.stop().catch(() => {});
}
