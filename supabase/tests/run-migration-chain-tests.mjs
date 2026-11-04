/**
 * Arnés de la cadena completa de migraciones (0001..0046) en PostgreSQL aislado.
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

const DB = "maverlang_migration_chain_test";
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

try {
  await cluster.initialise();
  await cluster.start();
  await cluster.createDatabase(DB);

  admin = await connect();
  await applySql(admin, SUPABASE_STUB, "stub Supabase");

  // -------------------------------------------------------------------------
  // Cadena completa, en orden. Si una migración falla, se detiene acá y se
  // reporta el archivo exacto: no tiene sentido correr pruebas sobre un
  // esquema incompleto.
  // -------------------------------------------------------------------------
  const applied = [];
  for (const file of MIGRATION_FILES) {
    try {
      await admin.query(readMigration(file));
      applied.push(file);
      console.log(`APPLY ${file}`);
    } catch (error) {
      console.log(`FAIL  aplicar ${file}`);
      console.log(`      ${String(error.message).replace(/\n/g, "\n      ")}`);
      failures.push({ name: `aplicar ${file}`, error });
      break;
    }
  }

  if (failures.length === 0) {
    await test("0001..0046 se aplican en orden, sin archivos faltantes ni duplicados", async () => {
      assert.equal(
        MIGRATION_FILES.length,
        37,
        "la cadena cambió: actualizar la lista esperada del arnés",
      );
      assert.match(MIGRATION_FILES[0], /^0001_/);
      assert.match(MIGRATION_FILES.at(-1), /^0046_/);
      assert.deepEqual(applied, MIGRATION_FILES);
    });

    await test("0001 es no-op y 0002 define profiles con id uuid", async () => {
      const { rows } = await admin.query(`
        select table_name, column_name, data_type
        from information_schema.columns
        where table_schema = 'public'
          and (
            (table_name = 'profiles' and column_name = 'id')
            or (table_name in ('orders', 'crypto_deposits') and column_name = 'user_id')
          )
      `);
      const byKey = new Map(rows.map((r) => [`${r.table_name}.${r.column_name}`, r.data_type]));
      assert.equal(byKey.get("profiles.id"), "uuid");
      assert.equal(byKey.get("orders.user_id"), "uuid");
      assert.equal(byKey.get("crypto_deposits.user_id"), "uuid");
    });

    await test("0025 crea crypto_deposits con FK uuid a profiles (no text)", async () => {
      const { rows } = await admin.query(`
        select c.confrelid = 'public.profiles'::regclass as ok
        from pg_constraint c
        where c.conrelid = 'public.crypto_deposits'::regclass
          and c.contype = 'f'
          and c.conname = 'crypto_deposits_user_id_fkey'
      `);
      assert.equal(rows.length, 1, "falta la FK crypto_deposits.user_id -> profiles");
      assert.equal(rows[0].ok, true);
    });

    await test("la función viva update_my_profile es exactamente la de 0046", async () => {
      const body = extractFunctionBody(
        readMigration("0046_profiles_onboarding_declaration.sql"),
        "update_my_profile(p_patch jsonb)",
      );
      const { rows } = await admin.query(`
        select p.prosrc, p.prosecdef, p.proconfig
        from pg_proc p
        where p.pronamespace = 'public'::regnamespace
          and p.proname = 'update_my_profile'
      `);
      assert.equal(rows.length, 1, "debe existir una sola update_my_profile");
      assert.equal(collapse(rows[0].prosrc), collapse(body), "la función no es la de 0046");
      assert.match(rows[0].prosrc, /declaracion_solo_al_completar/);
      assert.match(rows[0].prosrc, /version_declaracion_no_vigente/);
      assert.equal(rows[0].prosecdef, true, "debe ser security definer");
      assert.ok(
        (rows[0].proconfig ?? []).some((item) => item.startsWith("search_path=public, pg_temp")),
        "search_path inseguro",
      );
    });

    await test("la función viva handle_new_user es exactamente la de 0046", async () => {
      const body = extractFunctionBody(
        readMigration("0046_profiles_onboarding_declaration.sql"),
        "handle_new_user()",
      );
      const { rows } = await admin.query(`
        select p.prosrc, p.prosecdef
        from pg_proc p
        where p.pronamespace = 'public'::regnamespace
          and p.proname = 'handle_new_user'
      `);
      assert.equal(rows.length, 1, "debe existir una sola handle_new_user");
      assert.equal(collapse(rows[0].prosrc), collapse(body), "la función no es la de 0046");
      assert.match(rows[0].prosrc, /registro_menor_edad/);
      assert.equal(rows[0].prosecdef, true, "debe ser security definer");
    });

    await test("profiles y consents conservan los grants de 0043/0044", async () => {
      assert.equal(await tablePriv("authenticated", "public.profiles", "select"), true);
      assert.equal(await tablePriv("authenticated", "public.profiles", "insert"), false);
      assert.equal(await tablePriv("authenticated", "public.profiles", "delete"), false);
      assert.equal(await tablePriv("authenticated", "public.profiles", "update"), false);

      assert.equal(await columnPriv("authenticated", "public.profiles", "nombre", "update"), true);
      assert.equal(await columnPriv("authenticated", "public.profiles", "language", "update"), true);
      assert.equal(
        await columnPriv("authenticated", "public.profiles", "display_currency", "update"),
        true,
      );
      assert.equal(await columnPriv("authenticated", "public.profiles", "email", "update"), false);
      assert.equal(await columnPriv("authenticated", "public.profiles", "pais", "update"), false);
      assert.equal(
        await columnPriv("authenticated", "public.profiles", "onboarding_completed", "update"),
        false,
      );

      assert.equal(await tablePriv("authenticated", "public.consents", "select"), true);
      assert.equal(await tablePriv("authenticated", "public.consents", "insert"), false);
      assert.equal(await tablePriv("authenticated", "public.consents", "update"), false);
      assert.equal(await tablePriv("authenticated", "public.consents", "delete"), false);

      assert.equal(await tablePriv("anon", "public.profiles", "select"), false);
      assert.equal(await tablePriv("anon", "public.consents", "select"), false);
    });

    await test("funciones de perfil: RPC sólo authenticated y service_role interno", async () => {
      assert.equal(await functionPriv("authenticated", "public.update_my_profile(jsonb)"), true);
      assert.equal(await functionPriv("anon", "public.update_my_profile(jsonb)"), false);
      assert.equal(await functionPriv("service_role", "public.update_my_profile(jsonb)"), true);

      assert.equal(await functionPriv("authenticated", "public.add_my_consent(text,text)"), true);
      assert.equal(await functionPriv("anon", "public.add_my_consent(text,text)"), false);

      assert.equal(
        await functionPriv("authenticated", "public.reject_profiles_client_locked_change()"),
        false,
      );
      assert.equal(
        await functionPriv("anon", "public.reject_profiles_client_locked_change()"),
        false,
      );

      assert.equal(
        await functionPriv("authenticated", "public.handle_new_user()"),
        false,
      );
      assert.equal(await functionPriv("anon", "public.handle_new_user()"), false);
      assert.equal(
        await functionPriv("supabase_auth_admin", "public.handle_new_user()"),
        true,
      );
      assert.equal(await functionPriv("service_role", "public.handle_new_user()"), true);

      assert.equal(
        await functionPriv("authenticated", "public.current_us_person_declaration_version()"),
        false,
      );
      assert.equal(
        await functionPriv("service_role", "public.current_us_person_declaration_version()"),
        true,
      );
      assert.equal(
        await functionPriv("authenticated", "public.set_us_person_declaration_version(text)"),
        false,
      );
      assert.equal(
        await functionPriv("service_role", "public.set_us_person_declaration_version(text)"),
        true,
      );
      assert.equal(
        await functionPriv(
          "authenticated",
          "public.regularize_legacy_profile(uuid,boolean,text,text,jsonb,text)",
        ),
        false,
      );
      assert.equal(
        await functionPriv(
          "service_role",
          "public.regularize_legacy_profile(uuid,boolean,text,text,jsonb,text)",
        ),
        true,
      );
    });

    await test("handle_new_user ignora onboarding/cumplimiento del metadata", async () => {
      await admin.query(
        `insert into auth.users (id, email, raw_user_meta_data)
         values ($1, $2, $3::jsonb)`,
        [
          USER_METADATA,
          "metadata@example.test",
          JSON.stringify({
            nombre: "Legacy Metadata",
            pais: "CL",
            fecha_nacimiento: "1990-01-01",
            telefono: "+56911112222",
            rut: "12345678-5",
            terms_version: "2026-10",
            privacy_version: "2026-10",
            risks_version: "2026-10",
            onboarding_completed: true,
            is_us_person: false,
            residence_country: "CL",
            nationality_country: "CL",
            us_person_declaration_version: "2026-10-draft",
            us_person_declared_at: "2026-01-01T00:00:00Z",
          }),
        ],
      );

      const row = await profile(USER_METADATA);
      assert.ok(row, "no se creó el perfil");
      assert.equal(row.onboarding_completed, false);
      assert.equal(row.is_us_person, false);
      assert.equal(row.residence_country, null);
      assert.equal(row.nationality_country, null);
      assert.equal(row.us_person_declaration_version, null);
      assert.equal(row.us_person_declared_at, null);

      const demo = await admin.query(
        "select cash_usd from public.demo_accounts where user_id = $1",
        [USER_METADATA],
      );
      assert.equal(demo.rows.length, 1, "falta la cuenta demo");
      assert.equal(Number(demo.rows[0].cash_usd), 10000);

      const consents = await admin.query(
        "select doc from public.consents where user_id = $1 order by doc",
        [USER_METADATA],
      );
      assert.deepEqual(
        consents.rows.map((r) => r.doc),
        ["privacidad", "riesgos", "terminos"],
      );
    });

    await test("update_my_profile exige declaración y versión vigente, y completa", async () => {
      await admin.query("insert into auth.users (id, email) values ($1, $2)", [
        USER_RPC,
        "rpc@example.test",
      ]);

      const client = await connectAsUser(USER_RPC);
      try {
        await client.query("select public.add_my_consent('terminos', '2026-10')");
        await client.query("select public.add_my_consent('privacidad', '2026-10')");

        const base = {
          nombre: "Ana RPC",
          pais: "CL",
          fecha_nacimiento: "1990-01-01",
          telefono: "+56912345678",
          rut: "12345678-5",
          onboarding_completed: true,
          residence_country: "CL",
          nationality_country: "CL",
        };

        await expectSqlError(
          () =>
            client.query("select public.update_my_profile($1::jsonb)", [
              JSON.stringify(base),
            ]),
          /declaracion_requerida/,
          "sin declaración explícita",
        );

        await expectSqlError(
          () =>
            client.query("select public.update_my_profile($1::jsonb)", [
              JSON.stringify({
                ...base,
                is_us_person: false,
                us_person_declaration_version: "inventada",
              }),
            ]),
          /version_declaracion_no_vigente/,
          "versión inventada",
        );

        const ok = await client.query("select public.update_my_profile($1::jsonb) as r", [
          JSON.stringify({
            ...base,
            is_us_person: false,
            us_person_declaration_version: "2026-10-draft",
          }),
        ]);
        assert.equal(ok.rows[0].r.onboarding_completed, true);

        const row = await profile(USER_RPC);
        assert.equal(row.onboarding_completed, true);
        assert.equal(row.is_us_person, false);
        assert.equal(row.residence_country, "CL");
        assert.equal(row.nationality_country, "CL");
        assert.equal(row.us_person_declaration_version, "2026-10-draft");
        assert.ok(row.us_person_declared_at, "falta la fecha de declaración");

        const usConsent = await admin.query(
          "select 1 from public.consents where user_id = $1 and doc = 'us_person'",
          [USER_RPC],
        );
        assert.equal(usConsent.rows.length, 1, "falta el consentimiento us_person");
        const events = await admin.query(
          "select 1 from public.compliance_events where user_id = $1 and type = 'us_person_declaration'",
          [USER_RPC],
        );
        assert.equal(events.rows.length, 1, "falta el evento de declaración");
      } finally {
        await client.end();
      }
    });

    await test("después del onboarding no se puede cambiar identidad ni email", async () => {
      const client = await connectAsUser(USER_RPC);
      try {
        await expectSqlError(
          () =>
            client.query("update public.profiles set email = 'evil@example.test' where id = $1", [
              USER_RPC,
            ]),
          /permission denied|no permitido/i,
          "email por UPDATE directo",
        );

        await expectSqlError(
          () =>
            client.query("update public.profiles set pais = 'AR' where id = $1", [USER_RPC]),
          /permission denied|no permitido/i,
          "pais por UPDATE directo",
        );

        await expectSqlError(
          () =>
            client.query(
              "select public.update_my_profile($1::jsonb)",
              [JSON.stringify({ onboarding_completed: false })],
            ),
          /onboarding_no_reversible/,
          "apagar onboarding",
        );

        await expectSqlError(
          () =>
            client.query(
              "select public.update_my_profile($1::jsonb)",
              [JSON.stringify({ pais: "AR" })],
            ),
          /cambio_no_permitido/,
          "cambiar país después del onboarding",
        );

        const allowed = await client.query(
          "update public.profiles set nombre = 'Ana Actualizada' where id = $1",
          [USER_RPC],
        );
        assert.equal(allowed.rowCount, 1, "nombre debería seguir siendo editable");
      } finally {
        await client.end();
      }
    });

    await test("reaplicar 0046 no pisa datos ni permisos", async () => {
      const before = await profile(USER_RPC);
      const planBefore = await admin.query(
        "select count(*)::int as n from public.profile_regularization_plan",
      );
      await applySql(
        admin,
        readMigration("0046_profiles_onboarding_declaration.sql"),
        "0046 (segunda pasada)",
      );
      const after = await profile(USER_RPC);
      const planAfter = await admin.query(
        "select count(*)::int as n from public.profile_regularization_plan",
      );
      assert.deepEqual(after, before, "0046 modificó una fila existente");
      assert.equal(planAfter.rows[0].n, planBefore.rows[0].n, "0046 duplicó el plan");
      assert.equal(await functionPriv("authenticated", "public.update_my_profile(jsonb)"), true);
      assert.equal(await functionPriv("anon", "public.update_my_profile(jsonb)"), false);
    });

    await test("0025 es idempotente y no cambia el tipo uuid", async () => {
      await applySql(
        admin,
        readMigration("0025_crypto_deposits.sql"),
        "0025 (segunda pasada)",
      );
      const { rows } = await admin.query(`
        select data_type from information_schema.columns
        where table_schema = 'public' and table_name = 'crypto_deposits'
          and column_name = 'user_id'
      `);
      assert.equal(rows[0].data_type, "uuid");
    });

    await test("tablas sensibles quedan con RLS forzada", async () => {
      for (const table of [
        "orders",
        "crypto_deposits",
        "wallets",
        "wallet_movements",
        "wallet_reconciliations",
        "trade_reservations",
      ]) {
        const { rows } = await admin.query(
          "select relrowsecurity, relforcerowsecurity from pg_class where oid = $1::regclass",
          [`public.${table}`],
        );
        assert.equal(rows[0].relrowsecurity, true, `${table}: RLS no habilitada`);
        assert.equal(rows[0].relforcerowsecurity, true, `${table}: RLS no forzada`);
      }
    });

    await test("handle_new_user rechaza metadata con país bloqueado", async () => {
      await expectSqlError(
        () =>
          admin.query(
            `insert into auth.users (id, email, raw_user_meta_data)
             values ($1, $2, '{"pais":"US"}'::jsonb)`,
            [USER_US, "us@example.test"],
          ),
        /registro_us_person/,
        "alta con país bloqueado",
      );
      const { rows } = await admin.query("select 1 from auth.users where id = $1", [USER_US]);
      assert.equal(rows.length, 0, "el usuario bloqueado no debe existir");
    });

    await test("toda la cadena se puede reaplicar sin errores ni pérdida de datos", async () => {
      const before = await profile(USER_RPC);
      const countsBefore = await admin.query(`
        select
          (select count(*)::int from public.assets) as assets,
          (select count(*)::int from public.demo_accounts) as demo_accounts,
          (select count(*)::int from public.consents) as consents,
          (select count(*)::int from public.profile_regularization_plan) as plan
      `);
      for (const file of MIGRATION_FILES) {
        await applySql(admin, readMigration(file), `${file} (segunda pasada completa)`);
      }
      const after = await profile(USER_RPC);
      const countsAfter = await admin.query(`
        select
          (select count(*)::int from public.assets) as assets,
          (select count(*)::int from public.demo_accounts) as demo_accounts,
          (select count(*)::int from public.consents) as consents,
          (select count(*)::int from public.profile_regularization_plan) as plan
      `);
      assert.deepEqual(after, before, "la segunda pasada modificó un perfil existente");
      assert.deepEqual(
        countsAfter.rows[0],
        countsBefore.rows[0],
        "la segunda pasada duplicó filas de catálogo/demo/consentimientos/plan",
      );

      const body = extractFunctionBody(
        readMigration("0046_profiles_onboarding_declaration.sql"),
        "update_my_profile(p_patch jsonb)",
      );
      const handleBody = extractFunctionBody(
        readMigration("0046_profiles_onboarding_declaration.sql"),
        "handle_new_user()",
      );
      const udfRows = await admin.query(`
        select p.prosrc
        from pg_proc p
        where p.pronamespace = 'public'::regnamespace
          and p.proname = 'update_my_profile'
      `);
      assert.equal(collapse(udfRows.rows[0].prosrc), collapse(body), "la segunda pasada no dejó 0046");
      const handleRows = await admin.query(`
        select p.prosrc
        from pg_proc p
        where p.pronamespace = 'public'::regnamespace
          and p.proname = 'handle_new_user'
      `);
      assert.equal(
        collapse(handleRows.rows[0].prosrc),
        collapse(handleBody),
        "la segunda pasada no dejó handle_new_user de 0046",
      );
      assert.equal(await functionPriv("authenticated", "public.update_my_profile(jsonb)"), true);
      assert.equal(await functionPriv("anon", "public.update_my_profile(jsonb)"), false);
    });
  }
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
