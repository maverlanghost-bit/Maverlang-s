/**
 * Pruebas de la migración FORWARD 0047 sobre una base que ya ejecutó la 0042
 * vieja (commit db3c416), en PostgreSQL aislado.
 *
 * - Levanta un PostgreSQL 17 embebido en 127.0.0.1 con puerto libre y
 *   directorio temporal propio. No usa Docker, no usa `psql`, no lee `.env` y
 *   no se conecta a ninguna base existente: NO toca Supabase real.
 * - Aplica las migraciones previas mínimas (0002, 0011, 0027, 0028, 0031) y
 *   después la 0042 VIEJA desde el fixture
 *   `supabase/tests/fixtures/0042_trade_reservations_pre_0047.sql` (la 0042
 *   del árbol no se usa: es la nueva).
 * - Simula filas repetidas de (user_id, request_id) como podría haberlas
 *   dejado una variante anterior sin el unique, y aplica 0047 DOS veces.
 * - Comprueba: deduplicación sin borrar filas, unique final, una sola reserva
 *   activa por usuario (D-06), tope global que no ignora requestIds de otros
 *   usuarios y `consumed` que no cuenta doble cuando ya hay orden.
 *
 * Requisito: `embedded-postgres` y `pg` instalados FUERA del proyecto (no se
 * toca package.json). Ver supabase/tests/README.md.
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
const FIXTURES = path.join(HERE, "fixtures");
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

const DB = "maverlang_trade_forward_test";
const PASSWORD = "postgres";
const OLD_0042 = path.join(FIXTURES, "0042_trade_reservations_pre_0047.sql");
const FORWARD = "0047_trade_reservations_forward.sql";
const PREREQUISITES = [
  "0002_supabase_auth.sql",
  "0011_admin.sql",
  "0027_orders_real.sql",
  "0028_limits.sql",
  "0031_order_reconcile.sql",
];

function readMigration(name) {
  return readFileSync(path.join(MIGRATIONS, name), "utf8");
}

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

const port = await freePort();
const dataDir = path.join(os.tmpdir(), `maverlang-forward-pg-${process.pid}-${Date.now()}`);
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
    console.log(`      ${String(error.message ?? error).replace(/\n/g, "\n      ")}`);
  }
}

async function connect() {
  const client = new Client({
    host: "127.0.0.1",
    port,
    user: "postgres",
    password: PASSWORD,
    database: DB,
  });
  await client.connect();
  await client.query("set statement_timeout = '30s'");
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
  const haystack = `${result.error.code ?? ""} ${result.error.message ?? ""}`;
  assert.match(haystack, pattern, `${label}: error inesperado: ${haystack}`);
  return result.error;
}

async function applySql(client, sql, label) {
  try {
    await client.query(sql);
  } catch (error) {
    error.message = `${label}: ${error.message}`;
    throw error;
  }
}

const U1 = "aaaaaaaa-1111-4111-8111-111111111111";
const U2 = "bbbbbbbb-2222-4222-8222-222222222222";
const U3 = "cccccccc-3333-4333-8333-333333333333";
const U4 = "dddddddd-4444-4444-8444-444444444444";

let admin;

async function addUser(id, email) {
  await admin.query("insert into auth.users (id, email) values ($1, $2)", [id, email]);
}

async function insertReservation({ user, requestId, amount, status, minutesAgo, expiresIn = 10 }) {
  const { rows } = await admin.query(
    `insert into public.trade_reservations
       (user_id, request_id, amount_usd, status, expires_at, created_at, updated_at)
     values ($1, $2, $3, $4, now() + ($5 || ' minutes')::interval, now() - ($6 || ' minutes')::interval, now() - ($6 || ' minutes')::interval)
     returning id`,
    [user, requestId, amount, status, String(expiresIn), String(minutesAgo)],
  );
  return rows[0].id;
}

async function snapshotReservations() {
  const { rows } = await admin.query(`
    select id::text, user_id::text, request_id, amount_usd::text, status,
           expires_at::text, created_at::text, updated_at::text
      from public.trade_reservations
     order by id
  `);
  return rows;
}

async function resetTradingData() {
  await admin.query("delete from public.trade_reservations");
  await admin.query("delete from public.orders");
  await admin.query("delete from public.user_limits");
  await admin.query(`update public.app_flags set value = '{"per_order_usd":200,"daily_usd":500,"monthly_usd":2000}'::jsonb where key = 'limits_default'`);
  await admin.query(`update public.app_flags set value = '10000'::jsonb where key = 'global_daily_usd'`);
}

async function activeReserved(user) {
  const { rows } = await admin.query(
    `select coalesce(sum(amount_usd), 0)::text as total, count(*)::int as n
       from public.trade_reservations
      where user_id = $1 and status = 'reserved'`,
    [user],
  );
  return { total: Number(rows[0].total), n: rows[0].n };
}

async function reserve(user, requestId, amount, expiresIn = 10) {
  const { rows } = await admin.query(
    `select reservation_id from public.reserve_trade_amount($1, $2, $3, now() + ($4 || ' minutes')::interval)`,
    [user, requestId, amount, String(expiresIn)],
  );
  return rows[0].reservation_id;
}

try {
  await cluster.initialise();
  await cluster.start();
  await cluster.createDatabase(DB);

  admin = await connect();
  await applySql(admin, SUPABASE_STUB, "stub Supabase");

  for (const file of PREREQUISITES) {
    await applySql(admin, readMigration(file), file);
    console.log(`APPLY ${file}`);
  }

  // La 0042 VIEJA, desde el fixture. Es la que ya corrieron las bases reales.
  await applySql(admin, readFileSync(OLD_0042, "utf8"), "0042 vieja (fixture)");
  console.log("APPLY 0042 vieja (fixture)");

  await test("la 0042 vieja deja el esquema sin D-06 (punto de partida)", async () => {
    const { rows } = await admin.query(`
      select
        (select count(*)::int from pg_proc p
          where p.pronamespace = 'public'::regnamespace
            and p.proname = 'release_other_trade_reservations') as fn,
        (select count(*)::int from pg_indexes
          where schemaname = 'public'
            and indexname = 'trade_reservations_one_active_idx') as idx,
        (select count(*)::int from pg_constraint
          where conname = 'trade_reservations_user_id_request_id_key') as uq
    `);
    assert.equal(rows[0].fn, 0, "la 0042 vieja no debe tener la función D-06");
    assert.equal(rows[0].idx, 0, "la 0042 vieja no debe tener el índice D-06");
    assert.equal(rows[0].uq, 1, "la 0042 vieja trae el unique (user_id, request_id)");
  });

  await addUser(U1, "u1@example.test");
  await addUser(U2, "u2@example.test");
  await addUser(U3, "u3@example.test");
  await addUser(U4, "u4@example.test");

  // Simulación de una base vieja SIN el unique: se quita la restricción y se
  // cargan filas repetidas, que es el estado del que 0047 tiene que partir.
  await admin.query("alter table public.trade_reservations drop constraint trade_reservations_user_id_request_id_key");

  await insertReservation({ user: U1, requestId: "dup-a", amount: 120, status: "consumed", minutesAgo: 30 });
  await insertReservation({ user: U1, requestId: "dup-a", amount: 120, status: "reserved", minutesAgo: 20 });
  await insertReservation({ user: U1, requestId: "dup-b", amount: 60, status: "reserved", minutesAgo: 15 });
  await insertReservation({ user: U2, requestId: "dup-c", amount: 200, status: "reserved", minutesAgo: 40 });
  await insertReservation({ user: U2, requestId: "dup-c", amount: 200, status: "reserved", minutesAgo: 35 });
  await insertReservation({ user: U3, requestId: "dup-d", amount: 30, status: "released", minutesAgo: 50 });
  await insertReservation({ user: U3, requestId: "dup-d", amount: 30, status: "released", minutesAgo: 45 });

  // La `consumed` de U1 tiene su orden real: su traza no se puede perder.
  await admin.query(
    `insert into public.orders (user_id, side, symbol, mint, request_id, in_amount_ui, status, is_demo, notional_usd)
     values ($1, 'buy', 'AAPLx', 'mint-aapl', 'dup-a', 120, 'confirmed', false, 120)`,
    [U1],
  );

  const before = await snapshotReservations();
  assert.equal(before.length, 7, "el escenario debe dejar 7 filas antes de 0047");

  await test("0047 aplica sobre la 0042 vieja y deduplica sin borrar filas", async () => {
    await applySql(admin, readMigration(FORWARD), FORWARD);

    const after = await snapshotReservations();
    assert.equal(after.length, 7, "0047 borró filas: la traza se pierde");

    const byRequest = new Map();
    for (const row of after) {
      const key = `${row.user_id}|${row.status === "consumed" ? "c" : "x"}`;
      if (!byRequest.has(key)) byRequest.set(key, []);
      byRequest.get(key).push(row);
    }

    // Canónica por (user_id, request_id), exactamente una sin sufijo '#dup-'.
    const { rows: groups } = await admin.query(`
      select user_id::text, request_id, count(*)::int as n
        from public.trade_reservations
       group by user_id, request_id
    `);
    assert.equal(groups.length, 7, "cada fila debe quedar con un request_id propio");

    const canonical = after.filter((r) => !r.request_id.includes("#dup-"));
    assert.equal(canonical.length, 4, "quedan 4 claves canónicas (a, b, c, d)");

    // U1: la consumida con orden sigue consumida, con su monto y su request_id.
    const u1Consumed = canonical.find((r) => r.user_id === U1 && r.request_id === "dup-a");
    assert.ok(u1Consumed, "falta la reserva consumida canónica de U1");
    assert.equal(u1Consumed.status, "consumed");
    assert.equal(Number(u1Consumed.amount_usd), 120);

    // U1: la reserva duplicada de 'dup-a' sobrevive, liberada y re-etiquetada.
    const u1Dup = after.find((r) => r.user_id === U1 && r.request_id.startsWith("dup-a#dup-"));
    assert.ok(u1Dup, "la fila duplicada de U1 se perdió");
    assert.equal(u1Dup.status, "released", "la reserved duplicada debe liberarse");
    assert.equal(Number(u1Dup.amount_usd), 120);

    // U2: canónica = la más antigua; la otra queda liberada y re-etiquetada.
    const u2Rows = after.filter((r) => r.user_id === U2);
    assert.equal(u2Rows.length, 2);
    const u2Canonical = u2Rows.find((r) => r.request_id === "dup-c");
    const u2Dup = u2Rows.find((r) => r.request_id.startsWith("dup-c#dup-"));
    assert.ok(u2Canonical && u2Dup, "U2 debe tener canónica y duplicada");
    assert.equal(u2Canonical.status, "reserved");
    assert.equal(u2Dup.status, "released");
    assert.equal(Number(u2Dup.amount_usd), 200);

    // U3: 'released' duplicadas: una canónica y una re-etiquetada, ambas released.
    const u3Rows = after.filter((r) => r.user_id === U3);
    assert.equal(u3Rows.length, 2);
    assert.equal(u3Rows.filter((r) => r.status === "released").length, 2);
    assert.equal(u3Rows.filter((r) => r.request_id === "dup-d").length, 1);
  });

  await test("0047 deja el unique (user_id, request_id) y una sola reserved por usuario", async () => {
    const { rows } = await admin.query(`
      select count(*)::int as n
        from pg_index i
       where i.indrelid = 'public.trade_reservations'::regclass
         and i.indisunique
         and i.indpred is null
         and i.indnkeyatts = 2
         and pg_get_indexdef(i.indexrelid, 1, true) = 'user_id'
         and pg_get_indexdef(i.indexrelid, 2, true) = 'request_id'
    `);
    assert.equal(rows[0].n, 1, "falta el unique (user_id, request_id)");

    await expectSqlError(
      () =>
        admin.query(
          `insert into public.trade_reservations (user_id, request_id, amount_usd, status, expires_at)
           values ($1, 'dup-c', 200, 'reserved', now() + interval '5 minutes')`,
          [U2],
        ),
      /duplicate key|23505/,
      "insertar un request_id repetido",
    );

    await expectSqlError(
      () =>
        admin.query(
          `insert into public.trade_reservations (user_id, request_id, amount_usd, status, expires_at)
           values ($1, 'otra-reserved', 50, 'reserved', now() + interval '5 minutes')`,
          [U2],
        ),
      /duplicate key|23505/,
      "segunda reserva activa del mismo usuario",
    );

    const { rows: reserved } = await admin.query(
      `select user_id::text, count(*)::int as n
         from public.trade_reservations
        where status = 'reserved'
        group by user_id`,
    );
    for (const row of reserved) {
      assert.equal(row.n, 1, `usuario ${row.user_id} con más de una reserva activa`);
    }
  });

  await test("reaplicar 0047 no cambia ninguna fila (idempotente)", async () => {
    const beforeSecond = await snapshotReservations();
    await applySql(admin, readMigration(FORWARD), `${FORWARD} (segunda pasada)`);
    const afterSecond = await snapshotReservations();
    assert.deepEqual(afterSecond, beforeSecond, "la segunda pasada modificó filas");
  });

  await test("release_other_trade_reservations libera y no borra", async () => {
    const { rows: priv } = await admin.query(`
      select
        has_function_privilege('service_role', 'public.release_other_trade_reservations(uuid,text)', 'execute') as svc,
        has_function_privilege('authenticated', 'public.release_other_trade_reservations(uuid,text)', 'execute') as auth
    `);
    assert.equal(priv[0].svc, true, "service_role debe poder ejecutarla");
    assert.equal(priv[0].auth, false, "authenticated no debe poder ejecutarla");

    const { rows } = await admin.query(
      "select public.release_other_trade_reservations($1, '') as n",
      [U2],
    );
    assert.equal(rows[0].n, 1, "debía liberar la única reserva activa de U2");
    const { rows: count } = await admin.query(
      "select count(*)::int as n from public.trade_reservations where user_id = $1",
      [U2],
    );
    assert.equal(count[0].n, 2, "no se pueden borrar filas al liberar");
  });

  await test("D-06: la reserva nueva reemplaza la anterior y el tope no se duplica", async () => {
    await resetTradingData();
    await admin.query(
      "insert into public.user_limits (user_id, per_order_usd, daily_usd, monthly_usd) values ($1, 300, 500, 2000)",
      [U4],
    );

    await reserve(U4, "r1", 200);
    await reserve(U4, "r2", 300);
    const afterSecond = await activeReserved(U4);
    assert.equal(afterSecond.n, 1, "quedaron dos reservas activas");
    assert.equal(afterSecond.total, 300, "el cupo activo debe ser sólo el último");

    const { rows } = await admin.query(
      "select status from public.trade_reservations where user_id = $1 and request_id = 'r1'",
      [U4],
    );
    assert.equal(rows[0].status, "released", "la reserva anterior debía liberarse");

    // Sin la liberación previa esto chocaría con el diario: 200 + 300 + 100.
    await reserve(U4, "r3", 100);
    const afterThird = await activeReserved(U4);
    assert.equal(afterThird.n, 1);
    assert.equal(afterThird.total, 100, "el tope diario se está duplicando");
  });

  await test("consumed con orden no cuenta doble contra el tope diario", async () => {
    await resetTradingData();
    await admin.query(
      "insert into public.user_limits (user_id, per_order_usd, daily_usd, monthly_usd) values ($1, 300, 500, 2000)",
      [U4],
    );

    await reserve(U4, "c1", 200);
    await admin.query(
      `insert into public.orders (user_id, side, symbol, mint, request_id, in_amount_ui, status, is_demo, notional_usd)
       values ($1, 'buy', 'AAPLx', 'mint-aapl', 'c1', 200, 'confirmed', false, 200)`,
      [U4],
    );
    const consumed = await admin.query(
      "select public.consume_trade_reservation($1, 'c1', 200) as ok",
      [U4],
    );
    assert.equal(consumed.rows[0].ok, true, "la reserva debía consumirse");

    // 200 de la orden + 300 de la reserva nueva = 500 (tope diario exacto).
    // Si `consumed` contara otra vez serían 700 y fallaría con MV_LIMIT_DAILY.
    await reserve(U4, "c2", 300);
    const active = await activeReserved(U4);
    assert.equal(active.n, 1);
    assert.equal(active.total, 300);
  });

  await test("el tope global no ignora reservas de otro usuario con el mismo requestId", async () => {
    await resetTradingData();
    await admin.query(
      `update public.app_flags
          set value = '{"per_order_usd":1000,"daily_usd":1000,"monthly_usd":5000}'::jsonb
        where key = 'limits_default'`,
    );
    await admin.query(
      "update public.app_flags set value = '400'::jsonb where key = 'global_daily_usd'",
    );

    await reserve(U1, "shared-req", 250);
    await expectSqlError(
      () => reserve(U2, "shared-req", 250),
      /MV_LIMIT_GLOBAL/,
      "segundo usuario con el mismo requestId",
    );

    const { rows } = await admin.query(
      `select count(*)::int as n from public.trade_reservations where user_id = $1 and status = 'reserved'`,
      [U2],
    );
    assert.equal(rows[0].n, 0, "la reserva rechazada no debe quedar registrada");
  });

  await test("0047 no deja la tabla accesible a anon/authenticated", async () => {
    const { rows } = await admin.query(`
      select
        has_table_privilege('authenticated', 'public.trade_reservations', 'select') as auth_select,
        has_table_privilege('anon', 'public.trade_reservations', 'select') as anon_select,
        has_function_privilege('authenticated', 'public.reserve_trade_amount(uuid,text,numeric,timestamptz)', 'execute') as auth_reserve,
        c.relrowsecurity, c.relforcerowsecurity
      from pg_class c where c.oid = 'public.trade_reservations'::regclass
    `);
    assert.equal(rows[0].auth_select, false);
    assert.equal(rows[0].anon_select, false);
    assert.equal(rows[0].auth_reserve, false);
    assert.equal(rows[0].relrowsecurity, true);
    assert.equal(rows[0].relforcerowsecurity, true);
  });
} catch (error) {
  failures.push({ name: "arnés", error });
  console.error(`FAIL  arnés: ${String(error.message ?? error)}`);
} finally {
  if (admin) {
    await admin.end().catch(() => {});
  }
  await cluster.stop().catch(() => {});
}

console.log("");
console.log(`Resultado: ${passed} pasaron, ${failures.length} fallaron.`);
if (failures.length > 0) {
  process.exitCode = 1;
}
