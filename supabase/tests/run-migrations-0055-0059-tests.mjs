/**
 * Pruebas de comportamiento de 0055..0059 (MFA, topes, borrado, integridad) en PostgreSQL aislado.
 *
 * - Levanta un PostgreSQL 17 embebido en 127.0.0.1 con puerto libre y
 *   directorio temporal propio. No usa Docker, no usa `psql`, no lee `.env`
 *   y no se conecta a ninguna base existente.
 * - Simula el entorno mínimo de Supabase: roles anon/authenticated/
 *   service_role/supabase_auth_admin, esquema auth, auth.users,
 *   auth.mfa_factors, auth.uid(), auth.jwt() y privilegios por defecto.
 * - Aplica TODAS las migraciones 0001..0046 en orden y comprueba que la
 *   definición final de `update_my_profile`/`handle_new_user` sea la de 0046,
 *   junto con los permisos de profiles/consents y las funciones RPC.
 * - No habilita dinero real ni servicios externos. `REAL_EXECUTION_LOCKED`
 *   sigue cerrado.
 *
 * Requisito: `embedded-postgres` y `pg` instalados FUERA del proyecto (no se
 * toca package.json). Ver supabase/tests/README.md.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
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

const DB = "maverlang_0055_0059_test";
const PASSWORD = "postgres";

const MIGRATION_FILES = readdirSync(MIGRATIONS)
  .filter((name) => /^\d{4}_.*\.sql$/.test(name))
  .sort();

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
 * `update_my_profile` vivo = cuerpo de 0046 + el chequeo MFA que inyecta 0056
 * justo después del `begin` de nivel superior.
 */
function withMfaCheck(body) {
  const injected = body.replace(
    /\nbegin[ \t]*\r?\n/,
    "\nbegin\n  if public.mfa_step_pending() then raise exception 'mfa_requerido' using errcode = '42501'; end if;\n",
  );
  assert.notEqual(injected, body, "no se encontró el begin de update_my_profile");
  return injected;
}

function collapse(sql) {
  return sql.replace(/\r\n/g, "\n").replace(/\s+/g, " ").trim();
}

/**
 * Extrae el cuerpo entre `as $$` y `$$;` de la definición indicada. Se usa
 * para comparar con `pg_proc.prosrc` y demostrar que la función viva es la
 * última versión escrita por la migración (0046), no una anterior.
 */
function extractFunctionBody(sql, signature) {
  const needle = `create or replace function public.${signature}`;
  const start = sql.indexOf(needle);
  assert.notEqual(start, -1, `no se encontró ${needle} en la migración`);
  const asDollar = sql.indexOf("as $$", start);
  assert.notEqual(asDollar, -1, `no se encontró 'as $$' para ${signature}`);
  const bodyStart = asDollar + "as $$".length;
  const bodyEnd = sql.indexOf("$$;", bodyStart);
  assert.notEqual(bodyEnd, -1, `no se encontró cierre '$$;' para ${signature}`);
  return sql.slice(bodyStart, bodyEnd);
}

const SUPABASE_STUB = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create role supabase_auth_admin nologin;

grant usage on schema public to anon, authenticated, service_role, supabase_auth_admin;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role, supabase_auth_admin;

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

grant execute on function auth.jwt() to anon, authenticated, service_role, supabase_auth_admin;
grant execute on function auth.uid() to anon, authenticated, service_role, supabase_auth_admin;

-- Privilegios por defecto de un proyecto Supabase: los objetos nuevos en
-- public nacen con grants para los roles y cada migración recorta.
alter default privileges for role postgres in schema public
  grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all on sequences to postgres, anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all on functions to postgres, anon, authenticated, service_role;
`;

const port = await freePort();
const dataDir = path.join(os.tmpdir(), `maverlang-chain-pg-${process.pid}-${Date.now()}`);
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
  await client.query("set statement_timeout = '30s'");
  await client.query("set lock_timeout = '10s'");
  return client;
}

async function connectAsUser(userId, role = "authenticated") {
  const client = await connect();
  await client.query("select set_config('request.jwt.claims', $1, false)", [
    JSON.stringify({ sub: userId, role }),
  ]);
  await client.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
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

async function tablePriv(role, table, privilege) {
  const { rows } = await admin.query(
    "select has_table_privilege($1, $2, $3) as ok",
    [role, table, privilege],
  );
  return rows[0].ok;
}

async function columnPriv(role, table, column, privilege) {
  const { rows } = await admin.query(
    "select has_column_privilege($1, $2, $3, $4) as ok",
    [role, table, column, privilege],
  );
  return rows[0].ok;
}

async function functionPriv(role, fn) {
  const { rows } = await admin.query(
    "select has_function_privilege($1, $2, 'execute') as ok",
    [role, fn],
  );
  return rows[0].ok;
}

async function profile(userId) {
  const { rows } = await admin.query(
    "select * from public.profiles where id = $1",
    [userId],
  );
  return rows[0];
}

let admin;
const USER_METADATA = "11111111-1111-4111-8111-111111111111";
const USER_RPC = "22222222-2222-4222-8222-222222222222";
const USER_US = "33333333-3333-4333-8333-333333333333";

const U_MFA = "aaaaaaa1-0000-4000-8000-000000000001"; // con TOTP verificado
const U_PLAIN = "aaaaaaa2-0000-4000-8000-000000000002"; // sin TOTP
const U_DEL = "aaaaaaa3-0000-4000-8000-000000000003"; // borrado de cuenta
const U_ANON = "aaaaaaa4-0000-4000-8000-000000000004"; // anonimización
const U_RUT_A = "aaaaaaa5-0000-4000-8000-000000000005";
const U_RUT_B = "aaaaaaa6-0000-4000-8000-000000000006";

async function connectAs(userId, { aal = "aal1", role = "authenticated" } = {}) {
  const client = await connect();
  await client.query("select set_config('request.jwt.claims', $1, false)", [
    JSON.stringify({ sub: userId, role, aal }),
  ]);
  await client.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
  await client.query(`set role ${role}`);
  return client;
}

async function withClient(userId, opts, fn) {
  const client = await connectAs(userId, opts);
  try {
    return await fn(client);
  } finally {
    await client.end().catch(() => {});
  }
}

const PERM = /42501|permission denied/i;
const ALERT_SQL =
  "insert into public.price_alerts (user_id, symbol, direction, price_usd) values ($1,'AAPLx','above',$2)";

try {
  await cluster.initialise();
  await cluster.start();
  await cluster.createDatabase(DB);

  admin = await connect();
  await applySql(admin, SUPABASE_STUB, "stub Supabase");

  for (const file of MIGRATION_FILES) {
    try {
      await admin.query(readMigration(file));
    } catch (error) {
      error.message = `aplicar ${file}: ${error.message}`;
      throw error;
    }
  }
  // Segunda pasada de las nuevas: idempotencia.
  for (const file of MIGRATION_FILES.filter((f) => /^005[5-9]_/.test(f))) {
    await applySql(admin, readMigration(file), `${file} (segunda pasada)`);
  }
  console.log(`APPLY ${MIGRATION_FILES.length} migraciones (+ segunda pasada 0055..0059)`);

  for (const [id, email] of [
    [U_MFA, "mfa@example.test"],
    [U_PLAIN, "plain@example.test"],
    [U_DEL, "del@example.test"],
    [U_ANON, "anon@example.test"],
    [U_RUT_A, "ruta@example.test"],
    [U_RUT_B, "rutb@example.test"],
  ]) {
    await admin.query("insert into auth.users (id, email) values ($1, $2)", [id, email]);
  }
  await admin.query(
    "insert into auth.mfa_factors (user_id, factor_type, status) values ($1, 'totp', 'verified')",
    [U_MFA],
  );
  await admin.query(ALERT_SQL, [U_MFA, 1]);

  // ---------------------------------------------------------------- 0055
  await test("0055: authenticated no inserta, actualiza ni borra copy_follows", async () => {
    await withClient(U_PLAIN, {}, async (c) => {
      await expectSqlError(
        () => c.query("insert into public.copy_follows (user_id) values ($1)", [U_PLAIN]),
        PERM,
        "insert",
      );
      await expectSqlError(
        () => c.query("update public.copy_follows set user_id = user_id"),
        PERM,
        "update",
      );
      await expectSqlError(() => c.query("delete from public.copy_follows"), PERM, "delete");
      await c.query("select * from public.copy_follows"); // select sí
    });
  });

  // ---------------------------------------------------------------- 0056
  await test("0056: aal1 con TOTP verificado no lee ni escribe tablas de usuario", async () => {
    await withClient(U_MFA, { aal: "aal1" }, async (c) => {
      const sel = await c.query("select * from public.profiles");
      assert.equal(sel.rows.length, 0, "aal1 leyó profiles");
      const upd = await c.query("update public.profiles set nombre = 'x'");
      assert.equal(upd.rowCount, 0, "aal1 actualizó profiles");
      const alerts = await c.query("select * from public.price_alerts");
      assert.equal(alerts.rows.length, 0, "aal1 leyó price_alerts");
      await expectSqlError(
        () => c.query(ALERT_SQL, [U_MFA, 2]),
        /42501|row-level security/i,
        "insert price_alerts aal1",
      );
    });
  });

  await test("0056: aal1 con TOTP no puede usar update_my_profile ni add_my_consent (42501)", async () => {
    await withClient(U_MFA, { aal: "aal1" }, async (c) => {
      const e1 = await expectSqlError(
        () => c.query("select public.update_my_profile($1::jsonb)", [JSON.stringify({ nombre: "Ana" })]),
        /mfa_requerido/,
        "update_my_profile",
      );
      assert.equal(e1.code, "42501");
      const e2 = await expectSqlError(
        () => c.query("select public.add_my_consent('terminos','2026-10')"),
        /mfa_requerido/,
        "add_my_consent",
      );
      assert.equal(e2.code, "42501");
    });
  });

  await test("0056: aal2 con TOTP funciona", async () => {
    await withClient(U_MFA, { aal: "aal2" }, async (c) => {
      const sel = await c.query("select * from public.profiles");
      assert.equal(sel.rows.length, 1);
      const alerts = await c.query("select * from public.price_alerts");
      assert.equal(alerts.rows.length, 1);
      await c.query("select public.update_my_profile($1::jsonb)", [JSON.stringify({ nombre: "Ana" })]);
      await c.query("select public.add_my_consent('terminos','2026-10')");
      const upd = await c.query("update public.profiles set nombre = 'Ana B'");
      assert.equal(upd.rowCount, 1);
    });
  });

  await test("0056: sin TOTP, aal1 funciona", async () => {
    await withClient(U_PLAIN, { aal: "aal1" }, async (c) => {
      const sel = await c.query("select * from public.profiles");
      assert.equal(sel.rows.length, 1);
      await c.query("select public.update_my_profile($1::jsonb)", [JSON.stringify({ nombre: "Beto" })]);
      await c.query("select public.add_my_consent('privacidad','2026-10')");
    });
  });

  await test("0056: hay 14 políticas restrictivas de MFA en tablas de usuario", async () => {
    const { rows } = await admin.query(
      "select count(*)::int as n from pg_policies where policyname like '%\\_mfa\\_restrictive' and permissive = 'RESTRICTIVE' and tablename <> 'account_deletion_requests'",
    );
    assert.equal(rows[0].n, 14);
  });

  // ---------------------------------------------------------------- 0057
  await test("0057: 21er aviso activo y símbolo inválido se rechazan", async () => {
    await withClient(U_PLAIN, {}, async (c) => {
      for (let i = 0; i < 20; i += 1) {
        await c.query(ALERT_SQL, [U_PLAIN, i + 1]);
      }
      const e = await expectSqlError(() => c.query(ALERT_SQL, [U_PLAIN, 99]), /tope_avisos_activos/, "21er aviso");
      assert.equal(e.code, "54000");
      await expectSqlError(
        () =>
          c.query(
            "insert into public.price_alerts (user_id, symbol, direction, price_usd, active) values ($1,'bad sym!','above',5,false)",
            [U_PLAIN],
          ),
        /simbolo_invalido/,
        "símbolo",
      );
      await expectSqlError(
        () => c.query("insert into public.user_favorites (user_id, symbol) values ($1,'bad sym!')", [U_PLAIN]),
        /simbolo_invalido/,
        "favorita",
      );
    });
  });

  await test("0057: add_my_consent rechaza versión inválida y el 21er consentimiento por doc", async () => {
    await withClient(U_PLAIN, {}, async (c) => {
      const e = await expectSqlError(
        () => c.query("select public.add_my_consent('riesgos','bad version!')"),
        /version_invalida/,
        "versión",
      );
      assert.equal(e.code, "22023");
      for (let i = 1; i <= 20; i += 1) {
        await c.query("select public.add_my_consent('riesgos', $1)", [`v${i}`]);
      }
      await c.query("select public.add_my_consent('riesgos','v1')"); // repetida: ok
      const e2 = await expectSqlError(
        () => c.query("select public.add_my_consent('riesgos','v21')"),
        /tope_consentimientos/,
        "21er consentimiento",
      );
      assert.equal(e2.code, "54000");
    });
  });

  // ---------------------------------------------------------------- 0058
  await test("0058: request_my_deletion funciona y es idempotente mientras está pendiente", async () => {
    await withClient(U_DEL, {}, async (c) => {
      const first = (await c.query("select public.request_my_deletion() as t")).rows[0].t;
      assert.ok(first);
      await new Promise((r) => setTimeout(r, 50));
      const second = (await c.query("select public.request_my_deletion() as t")).rows[0].t;
      assert.equal(second.getTime(), first.getTime());
      const own = await c.query("select status from public.account_deletion_requests");
      assert.deepEqual(own.rows, [{ status: "pending" }]);
      await expectSqlError(
        () => c.query("update public.account_deletion_requests set status = 'cancelled'"),
        PERM,
        "escritura directa",
      );
    });
    await withClient(U_PLAIN, {}, async (c) => {
      const rows = await c.query("select * from public.account_deletion_requests");
      assert.equal(rows.rows.length, 0, "otro usuario ve solicitudes ajenas");
    });
    await withClient(U_MFA, { aal: "aal1" }, async (c) => {
      await expectSqlError(() => c.query("select public.request_my_deletion()"), /mfa_requerido/, "MFA");
    });
  });

  await test("0058: anon y authenticated no ejecutan anonymize_user", async () => {
    assert.equal(await functionPriv("anon", "public.anonymize_user(uuid)"), false);
    assert.equal(await functionPriv("authenticated", "public.anonymize_user(uuid)"), false);
    assert.equal(await functionPriv("service_role", "public.anonymize_user(uuid)"), true);
    await withClient(U_PLAIN, {}, async (c) => {
      await expectSqlError(() => c.query("select public.anonymize_user($1)", [U_ANON]), PERM, "authenticated");
    });
  });

  await test("0058: service_role anonymize_user borra PII y uso, conserva historial", async () => {
    await admin.query(
      `update public.profiles set nombre='Carla', telefono='+56911112222', fecha_nacimiento='1990-01-01',
         rut='12345678-5', email='carla@example.test' where id = $1`,
      [U_ANON],
    );
    await admin.query("insert into public.user_favorites (user_id, symbol) values ($1,'AAPLx')", [U_ANON]);
    await admin.query(ALERT_SQL, [U_ANON, 2]);
    await admin.query("insert into public.external_holdings (user_id, ticker, quantity) values ($1,'AAPL',3)", [U_ANON]);
    await admin.query(
      `insert into public.ai_shared_chats (id, owner_id, title, messages)
       values ('chat-anon-001', $1, 't', '[{"role":"user","text":"hola"}]'::jsonb)`,
      [U_ANON],
    );
    await admin.query(
      "insert into public.orders (user_id, side, symbol, mint, in_amount_ui, status) values ($1,'buy','AAPLx','mint1',10,'confirmed')",
      [U_ANON],
    );
    await admin.query(
      "insert into public.consents (user_id, doc, version) values ($1,'terminos','2026-10') on conflict do nothing",
      [U_ANON],
    );

    await withClient(U_ANON, { role: "service_role" }, (c) => c.query("select public.anonymize_user($1)", [U_ANON]));

    const p = await profile(U_ANON);
    assert.equal(p.nombre, null);
    assert.equal(p.rut, null);
    assert.equal(p.telefono, null);
    assert.equal(p.fecha_nacimiento, null);
    assert.equal(p.email, null);
    for (const [t, col] of [
      ["user_favorites", "user_id"],
      ["price_alerts", "user_id"],
      ["external_holdings", "user_id"],
      ["ai_shared_chats", "owner_id"],
      ["preferences", "user_id"],
    ]) {
      const r = await admin.query(`select count(*)::int as n from public.${t} where ${col} = $1`, [U_ANON]);
      assert.equal(r.rows[0].n, 0, `${t} no se borró`);
    }
    const orders = await admin.query("select count(*)::int as n from public.orders where user_id = $1", [U_ANON]);
    assert.equal(orders.rows[0].n, 1, "se borró una orden");
    const consents = await admin.query("select count(*)::int as n from public.consents where user_id = $1", [U_ANON]);
    assert.ok(consents.rows[0].n >= 1, "se borró un consentimiento");
    const req = await admin.query(
      "select status, processed_at from public.account_deletion_requests where user_id = $1",
      [U_ANON],
    );
    assert.equal(req.rows[0].status, "processed");
    assert.ok(req.rows[0].processed_at);
  });

  await test("0058: borrar auth.users con órdenes falla (RESTRICT); ai_shared_chats en cascada", async () => {
    await expectSqlError(
      () => admin.query("delete from auth.users where id = $1", [U_ANON]),
      /23503|violates foreign key/i,
      "delete auth.users",
    );
    const { rows } = await admin.query(`
      select count(*)::int as n from pg_constraint
      where contype = 'f' and confdeltype = 'c'
        and confrelid in ('auth.users'::regclass, 'public.profiles'::regclass)
        and conrelid::regclass::text in ('orders','wallet_movements','crypto_deposits',
          'wallet_withdrawals','trade_reservations','sponsor_usage','sponsor_usage_requests',
          'compliance_events','consents','wallets','copy_subscriptions','copy_runs')`);
    assert.equal(rows[0].n, 0);
    const chats = await admin.query(
      "select confdeltype from pg_constraint where conrelid = 'public.ai_shared_chats'::regclass and contype = 'f'",
    );
    assert.deepEqual(chats.rows.map((r) => r.confdeltype), ["c"]);
  });

  // ---------------------------------------------------------------- 0059
  await test("0059: segunda billetera primaria del mismo usuario se rechaza", async () => {
    await admin.query(
      "insert into public.wallets (user_id, address, is_primary) values ($1,'WalletAddr1111111111111111111111111111111111',true)",
      [U_PLAIN],
    );
    await expectSqlError(
      () =>
        admin.query(
          "insert into public.wallets (user_id, address, is_primary) values ($1,'WalletAddr2222222222222222222222222222222222',true)",
          [U_PLAIN],
        ),
      /23505|duplicate key/i,
      "segunda primaria",
    );
    await admin.query(
      "insert into public.wallets (user_id, address, is_primary) values ($1,'WalletAddr3333333333333333333333333333333333',false)",
      [U_PLAIN],
    );
  });

  await test("0059: RUT normalizado duplicado entre perfiles onboarded se rechaza", async () => {
    await admin.query(
      "update public.profiles set rut = '12345678-5', onboarding_completed = true where id = $1",
      [U_RUT_A],
    );
    await expectSqlError(
      () =>
        admin.query(
          "update public.profiles set rut = '12.345.678-5', onboarding_completed = true where id = $1",
          [U_RUT_B],
        ),
      /23505|duplicate key/i,
      "RUT duplicado",
    );
    // Sin onboarding el mismo RUT no choca.
    await admin.query("update public.profiles set rut = '12.345.678-5' where id = $1", [U_RUT_B]);
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
