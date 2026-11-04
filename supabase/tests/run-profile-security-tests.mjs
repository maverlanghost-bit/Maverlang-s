/**
 * Pruebas de regresión de la inmutabilidad del perfil (0043 → 0045) contra
 * PostgreSQL real y aislado.
 *
 * - Levanta PostgreSQL 17 embebido en 127.0.0.1, puerto libre y directorio
 *   temporal propio. No usa Docker, no usa `psql`, no lee `.env` y no se
 *   conecta a ninguna base existente.
 * - Replica el entorno mínimo de Supabase (roles, auth.uid(), auth.jwt(),
 *   auth.users y privilegios por defecto).
 * - Aplica 0002, 0015, 0043 y 0044; demuestra el ataque de dos llamadas y el
 *   cambio de identidad que 0043 permitía; después aplica 0045 dos veces y
 *   verifica la corrección con datos preexistentes.
 * - Incluye concurrencia con conexiones TCP reales.
 *
 * Requisito: `embedded-postgres` y `pg` instalados FUERA del proyecto.
 * Ver supabase/tests/README.md.
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

const DB = "maverlang_profile_security_test";
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
const dataDir = path.join(os.tmpdir(), `maverlang-profile-pg-${process.pid}-${Date.now()}`);
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

async function setJwt(client, userId, role) {
  const payload = { sub: userId, role };
  await client.query("select set_config('request.jwt.claims', $1, false)", [
    JSON.stringify(payload),
  ]);
  await client.query("select set_config('request.jwt.claim.sub', $1, false)", [userId]);
}

async function connectAs(role, userId) {
  const client = await connect();
  await client.query(`set role ${role}`);
  if (userId) await setJwt(client, userId, role);
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
let userSeq = 0;

function nextUserId() {
  userSeq += 1;
  return `00000000-0000-4000-8000-${String(userSeq).padStart(12, "0")}`;
}

async function createUser(meta = {}) {
  const id = nextUserId();
  await admin.query(
    "insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3::jsonb)",
    [id, `${id}@example.test`, JSON.stringify(meta)],
  );
  return id;
}

function onboardingPatch(id, overrides = {}) {
  return {
    nombre: "Ana Pérez",
    email: `${id}@example.test`,
    pais: "CL",
    rut: "11111111-1",
    fecha_nacimiento: "1992-05-10",
    telefono: "+56922222222",
    is_us_person: false,
    onboarding_completed: true,
    language: "es-CL",
    display_currency: "CLP",
    residence_country: "CL",
    nationality_country: "CL",
    us_person_declaration_version: "v-test",
    ...overrides,
  };
}

async function callProfile(client, patch) {
  const { rows } = await client.query(
    "select public.update_my_profile($1::jsonb) as profile",
    [JSON.stringify(patch)],
  );
  return rows[0].profile;
}

async function profileRow(id) {
  const { rows } = await admin.query("select * from public.profiles where id = $1", [id]);
  assert.equal(rows.length, 1, `profileRow(${id}): se esperaba 1 fila`);
  return rows[0];
}

async function onboardUser(id, overrides = {}) {
  const client = await connectAs("authenticated", id);
  try {
    await client.query("select public.add_my_consent('terminos', 'v-test')");
    await client.query("select public.add_my_consent('privacidad', 'v-test')");
    return await callProfile(client, onboardingPatch(id, overrides));
  } finally {
    await client.end();
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

try {
  await cluster.initialise();
  await cluster.start();
  await cluster.createDatabase(DB);

  admin = await connect();
  await applySql(admin, SUPABASE_STUB, "stub Supabase");

  for (const name of [
    "0002_supabase_auth.sql",
    "0015_compliance.sql",
    "0043_profiles_rpc.sql",
    "0044_profiles_column_grants.sql",
  ]) {
    await applySql(admin, readMigration(name), name);
  }

  // -------------------------------------------------------------------------
  // Regresión: comportamiento vulnerable de 0043
  // -------------------------------------------------------------------------
  await test("regresión 0043: el ataque de dos llamadas revertía el onboarding y cambiaba identidad", async () => {
    const user = await createUser();
    await onboardUser(user);

    const client = await connectAs("authenticated", user);
    try {
      const reverted = await callProfile(client, { onboarding_completed: false });
      assert.equal(reverted.onboarding_completed, false, "0043 debía permitir la reversión");

      const changed = await callProfile(client, { telefono: "+56933333333" });
      assert.equal(changed.telefono, "+56933333333", "con el flag apagado, 0043 debía aceptar el cambio");
    } finally {
      await client.end();
    }

    const row = await profileRow(user);
    assert.equal(row.onboarding_completed, false);
    assert.equal(row.telefono, "+56933333333");
  });

  await test("regresión 0043: pais se podía cambiar después del onboarding sin revertir el flag", async () => {
    const user = await createUser();
    await onboardUser(user);

    const client = await connectAs("authenticated", user);
    try {
      const changed = await callProfile(client, { pais: "AR" });
      assert.equal(changed.pais, "AR", "0043 no congelaba pais");
      assert.equal(changed.rut, null, "al cambiar de país se limpia el RUT");
    } finally {
      await client.end();
    }
  });

  // Fila existente antes de 0045, para comprobar compatibilidad e idempotencia.
  const legacyUser = await createUser({
    nombre: "Legado",
    pais: "CL",
    fecha_nacimiento: "1988-03-15",
    telefono: "+56911111111",
    rut: "12345678-5",
    nationality_country: "CL",
    us_person_declaration_version: "v-legacy",
    terms_version: "v-legacy",
    privacy_version: "v-legacy",
    risks_version: "v-legacy",
  });
  const legacyBefore = await profileRow(legacyUser);
  assert.equal(legacyBefore.onboarding_completed, true, "la fila legada debe nacer onboarded");

  // Email forjado antes de 0045: 0043 lo permitía. La migración debe repararlo.
  const forgedLegacyUser = await createUser();
  const forgedLegacyEmail = `${forgedLegacyUser}@example.test`;
  const forgedClient = await connectAs("authenticated", forgedLegacyUser);
  try {
    await callProfile(forgedClient, { email: "suplantado@example.test" });
  } finally {
    await forgedClient.end();
  }
  const forgedBefore = await profileRow(forgedLegacyUser);
  assert.equal(forgedBefore.email, "suplantado@example.test");

  // -------------------------------------------------------------------------
  // 0045
  // -------------------------------------------------------------------------
  await test("0045 aplica sobre una base con 0043/0044 y datos existentes", async () => {
    await applySql(admin, readMigration("0045_profiles_immutability.sql"), "0045");
  });

  await test("0045 es idempotente y conserva la fila existente", async () => {
    await applySql(admin, readMigration("0045_profiles_immutability.sql"), "0045 (2)");
    const after = await profileRow(legacyUser);
    assert.equal(after.onboarding_completed, true);
    assert.equal(after.email, legacyBefore.email);
    assert.equal(after.telefono, legacyBefore.telefono);
    assert.equal(after.rut, legacyBefore.rut);
    assert.equal(after.pais, legacyBefore.pais);
    assert.equal(after.residence_country, legacyBefore.residence_country);
    assert.equal(after.nationality_country, legacyBefore.nationality_country);
    assert.equal(
      after.us_person_declaration_version,
      legacyBefore.us_person_declaration_version,
    );
    assert.equal(
      after.us_person_declared_at.toISOString(),
      legacyBefore.us_person_declared_at.toISOString(),
    );
  });

  await test("0045 repara emails forjados existentes desde auth.users", async () => {
    const row = await profileRow(forgedLegacyUser);
    assert.equal(row.email, forgedLegacyEmail);
    const { rows } = await admin.query(
      "select id from public.profiles where email ilike $1",
      ["suplantado@example.test"],
    );
    assert.equal(rows.length, 0);
  });

  await test("0045 define la RPC security definer y sólo authenticated puede ejecutarla", async () => {
    const { rows } = await admin.query(`
      select
        p.prosecdef,
        pg_get_function_identity_arguments(p.oid) as args,
        has_function_privilege('authenticated', 'public.update_my_profile(jsonb)', 'execute') as auth_exec,
        has_function_privilege('anon', 'public.update_my_profile(jsonb)', 'execute') as anon_exec
      from pg_proc p
      where p.oid = 'public.update_my_profile(jsonb)'::regprocedure
    `);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].prosecdef, true);
    assert.equal(rows[0].args, "p_patch jsonb");
    assert.equal(rows[0].auth_exec, true);
    assert.equal(rows[0].anon_exec, false);
  });

  await test("0045 acepta email, teléfono +569 y fecha válidos antes del onboarding", async () => {
    const user = await createUser();
    const ownEmail = `${user}@example.test`;
    const client = await connectAs("authenticated", user);
    try {
      const result = await callProfile(client, {
        email: `  ${user}@Example.TEST  `,
        telefono: "+56912345678",
        fecha_nacimiento: "1990-01-01",
      });
      assert.equal(result.email, ownEmail);
      assert.equal(result.telefono, "+56912345678");
      assert.equal(result.fecha_nacimiento, "1990-01-01");
    } finally {
      await client.end();
    }

    const row = await profileRow(user);
    assert.equal(row.email, ownEmail);
    assert.equal(row.telefono, "+56912345678");
    assert.equal(row.onboarding_completed, false);
    const { rows } = await admin.query(
      "select fecha_nacimiento::text as fecha from public.profiles where id = $1",
      [user],
    );
    assert.equal(rows[0].fecha, "1990-01-01");
  });

  await test("0045 rechaza email, teléfono y fecha inválidos antes del onboarding", async () => {
    const user = await createUser();
    const client = await connectAs("authenticated", user);
    try {
      await expectSqlError(
        () => callProfile(client, { email: "sin-arroba.example" }),
        /email_invalido/,
        "email sin arroba",
      );
      await expectSqlError(
        () => callProfile(client, { email: "a b@example.com" }),
        /email_invalido/,
        "email con espacio",
      );
      await expectSqlError(
        () => callProfile(client, { telefono: "56912345678" }),
        /telefono_invalido/,
        "teléfono sin +",
      );
      await expectSqlError(
        () => callProfile(client, { telefono: "+56 912345678" }),
        /telefono_invalido/,
        "teléfono con espacio",
      );
      await expectSqlError(
        () => callProfile(client, { fecha_nacimiento: "01-01-1990" }),
        /fecha_invalida/,
        "fecha con formato incorrecto",
      );
      await expectSqlError(
        () => callProfile(client, { fecha_nacimiento: "1990-13-40" }),
        /fecha_invalida/,
        "fecha imposible",
      );
      await expectSqlError(
        () => callProfile(client, { fecha_nacimiento: "2020-01-01" }),
        /fecha_invalida/,
        "fecha de menor de edad",
      );
    } finally {
      await client.end();
    }

    const row = await profileRow(user);
    assert.equal(row.email, `${user}@example.test`);
    assert.equal(row.telefono, null);
    assert.equal(row.onboarding_completed, false);
  });

  await test("0045 rechaza email forjado antes del onboarding y no suplanta al titular", async () => {
    const victim = await createUser();
    const attacker = await createUser();
    const victimEmail = `${victim}@example.test`;
    const attackerEmail = `${attacker}@example.test`;

    const client = await connectAs("authenticated", attacker);
    try {
      await expectSqlError(
        () => callProfile(client, { email: victimEmail }),
        /email_no_verificado/,
        "email de otra persona",
      );
    } finally {
      await client.end();
    }

    const attackerRow = await profileRow(attacker);
    assert.equal(attackerRow.email, attackerEmail);
    const { rows } = await admin.query(
      "select id from public.profiles where email ilike $1",
      [victimEmail],
    );
    assert.deepEqual(rows.map((item) => item.id), [victim]);
  });

  await test("0045 sincroniza un cambio de correo confirmado en auth.users", async () => {
    const user = await createUser();
    await onboardUser(user);
    const oldEmail = `${user}@example.test`;
    const newEmail = `nuevo-${user}@example.test`;

    await admin.query("update auth.users set email = $1 where id = $2", [newEmail, user]);
    let row = await profileRow(user);
    assert.equal(row.email, newEmail, "el trigger debe sincronizar profiles.email");
    assert.equal(row.onboarding_completed, true);

    const client = await connectAs("authenticated", user);
    try {
      // JWT viejo: la RPC no debe confiar en el claim email.
      await client.query("select set_config('request.jwt.claims', $1, false)", [
        JSON.stringify({ sub: user, role: "authenticated", email: oldEmail }),
      ]);
      await expectSqlError(
        () => callProfile(client, { email: oldEmail }),
        /email_no_verificado/,
        "correo viejo tras cambio verificado",
      );
      const synced = await callProfile(client, {
        email: newEmail,
        nombre: "Nombre Verificado",
      });
      assert.equal(synced.email, newEmail);
    } finally {
      await client.end();
    }

    row = await profileRow(user);
    assert.equal(row.email, newEmail);
    const { rows: byNew } = await admin.query(
      "select id from public.profiles where email ilike $1",
      [newEmail],
    );
    assert.deepEqual(byNew.map((item) => item.id), [user]);
    const { rows: byOld } = await admin.query(
      "select id from public.profiles where email ilike $1",
      [oldEmail],
    );
    assert.equal(byOld.length, 0);
  });

  await test("0045 bloquea el ataque de dos llamadas", async () => {
    const user = await createUser();
    await onboardUser(user);
    const before = await profileRow(user);

    const client = await connectAs("authenticated", user);
    try {
      await expectSqlError(
        () => callProfile(client, { onboarding_completed: false }),
        /onboarding_no_reversible/,
        "revertir onboarding",
      );
      await expectSqlError(
        () => callProfile(client, { telefono: "+56933333333" }),
        /cambio_no_permitido/,
        "cambiar teléfono después del intento de reversión",
      );
    } finally {
      await client.end();
    }

    const after = await profileRow(user);
    assert.equal(after.onboarding_completed, true);
    assert.equal(after.telefono, before.telefono);
  });

  await test("0045 congela toda la identidad y el cumplimiento después del onboarding", async () => {
    const user = await createUser();
    await onboardUser(user);

    const client = await connectAs("authenticated", user);
    try {
      const cases = [
        ["pais", { pais: "AR" }, /cambio_no_permitido/],
        ["rut", { rut: "12345678-5" }, /cambio_no_permitido/],
        ["fecha_nacimiento", { fecha_nacimiento: "1990-01-01" }, /cambio_no_permitido/],
        ["telefono", { telefono: "+56944444444" }, /cambio_no_permitido/],
        ["residence_country", { residence_country: "AR" }, /cambio_no_permitido/],
        ["nationality_country", { nationality_country: "AR" }, /cambio_no_permitido/],
        [
          "us_person_declaration_version",
          { us_person_declaration_version: "v-otra" },
          /cambio_no_permitido/,
        ],
        ["is_us_person", { is_us_person: true }, /us_person_bloqueado/],
        [
          "onboarding_completed=true + teléfono",
          { onboarding_completed: true, telefono: "+56955555555" },
          /cambio_no_permitido/,
        ],
      ];
      for (const [label, patch, pattern] of cases) {
        await expectSqlError(() => callProfile(client, patch), pattern, label);
      }
    } finally {
      await client.end();
    }

    const after = await profileRow(user);
    assert.equal(after.onboarding_completed, true);
    assert.equal(after.email, `${user}@example.test`);
    assert.equal(after.pais, "CL");
    assert.equal(after.rut, "11111111-1");
    assert.equal(after.telefono, "+56922222222");
    assert.equal(after.residence_country, "CL");
    assert.equal(after.nationality_country, "CL");
    assert.equal(after.us_person_declaration_version, "v-test");
  });

  await test("0045 bloquea vaciados que en 0043 saltaban el chequeo", async () => {
    const user = await createUser();
    await onboardUser(user);

    const client = await connectAs("authenticated", user);
    try {
      const cases = [
        ["email", { email: "" }, /email_no_verificado/],
        ["pais", { pais: "" }, /cambio_no_permitido/],
        ["rut", { rut: "" }, /cambio_no_permitido/],
        ["fecha_nacimiento", { fecha_nacimiento: "" }, /cambio_no_permitido/],
        ["telefono", { telefono: "" }, /cambio_no_permitido/],
        ["residence_country", { residence_country: "" }, /cambio_no_permitido/],
        ["nationality_country", { nationality_country: "" }, /cambio_no_permitido/],
        ["us_person_declaration_version", { us_person_declaration_version: "" }, /cambio_no_permitido/],
      ];
      for (const [label, patch, pattern] of cases) {
        await expectSqlError(
          () => callProfile(client, patch),
          pattern,
          `vaciar ${label}`,
        );
      }
    } finally {
      await client.end();
    }

    const after = await profileRow(user);
    assert.equal(after.email, `${user}@example.test`);
    assert.equal(after.pais, "CL");
    assert.equal(after.rut, "11111111-1");
    assert.equal(after.telefono, "+56922222222");
    assert.equal(after.residence_country, "CL");
    assert.equal(after.nationality_country, "CL");
    assert.equal(after.us_person_declaration_version, "v-test");
  });

  await test("0045 conserva nombre, idioma y moneda editables después del onboarding", async () => {
    const user = await createUser();
    await onboardUser(user);

    const client = await connectAs("authenticated", user);
    try {
      const named = await callProfile(client, { nombre: "Ana Actualizada" });
      assert.equal(named.nombre, "Ana Actualizada");
      const english = await callProfile(client, { language: "en" });
      assert.equal(english.language, "en");
      const usd = await callProfile(client, { display_currency: "USD" });
      assert.equal(usd.display_currency, "USD");
      const combo = await callProfile(client, {
        nombre: "Ana",
        language: "es-CL",
        display_currency: "CLP",
        onboarding_completed: true,
      });
      assert.equal(combo.nombre, "Ana");
      assert.equal(combo.language, "es-CL");
      assert.equal(combo.display_currency, "CLP");
      assert.equal(combo.onboarding_completed, true);
    } finally {
      await client.end();
    }

    const after = await profileRow(user);
    assert.equal(after.onboarding_completed, true);
    assert.equal(after.email, `${user}@example.test`);
    assert.equal(after.telefono, "+56922222222");
    assert.equal(after.rut, "11111111-1");
  });

  await test("0045 conserva el onboarding legítimo con consentimientos", async () => {
    const user = await createUser();
    const client = await connectAs("authenticated", user);
    try {
      await client.query("select public.add_my_consent('terminos', 'v-test')");
      await client.query("select public.add_my_consent('privacidad', 'v-test')");
      const result = await callProfile(client, onboardingPatch(user));
      assert.equal(result.onboarding_completed, true);
      assert.equal(result.pais, "CL");
      assert.equal(result.rut, "11111111-1");
      assert.equal(result.fecha_nacimiento, "1992-05-10");
    } finally {
      await client.end();
    }

    const row = await profileRow(user);
    assert.equal(row.onboarding_completed, true);
    assert.equal(row.residence_country, "CL");
    assert.equal(row.nationality_country, "CL");
    assert.equal(row.us_person_declaration_version, "v-test");
    assert.ok(row.us_person_declared_at instanceof Date);

    const { rows: consents } = await admin.query(
      "select doc, version from public.consents where user_id = $1 order by doc",
      [user],
    );
    assert.deepEqual(
      consents.map((item) => `${item.doc}:${item.version}`),
      ["privacidad:v-test", "terminos:v-test", "us_person:v-test"],
    );
  });

  await test("0045 sigue exigiendo términos y privacidad para encender onboarding", async () => {
    const user = await createUser();
    const client = await connectAs("authenticated", user);
    try {
      await expectSqlError(
        () => callProfile(client, onboardingPatch(user)),
        /faltan_consentimientos/,
        "onboarding sin consentimientos",
      );
    } finally {
      await client.end();
    }

    const row = await profileRow(user);
    assert.equal(row.onboarding_completed, false);
    assert.equal(row.telefono, null);
  });

  await test("0045 rechaza países bloqueados en pais, residencia y nacionalidad", async () => {
    const user = await createUser();
    const client = await connectAs("authenticated", user);
    try {
      await expectSqlError(
        () => callProfile(client, { pais: "US" }),
        /pais_bloqueado/,
        "pais US",
      );
      await expectSqlError(
        () => callProfile(client, { residence_country: "US" }),
        /pais_bloqueado/,
        "residencia US",
      );
      await expectSqlError(
        () => callProfile(client, { nationality_country: "IR" }),
        /pais_bloqueado/,
        "nacionalidad IR",
      );
    } finally {
      await client.end();
    }
  });

  await test("0045 mantiene los grants de columna y bloquea el UPDATE directo", async () => {
    const user = await createUser();
    await onboardUser(user);

    const { rows: grants } = await admin.query(`
      select
        has_table_privilege('authenticated', 'public.profiles', 'update') as table_update,
        has_column_privilege('authenticated', 'public.profiles', 'nombre', 'update') as name_update,
        has_column_privilege('authenticated', 'public.profiles', 'language', 'update') as language_update,
        has_column_privilege('authenticated', 'public.profiles', 'display_currency', 'update') as currency_update,
        has_column_privilege('authenticated', 'public.profiles', 'email', 'update') as email_update,
        has_column_privilege('authenticated', 'public.profiles', 'telefono', 'update') as phone_update,
        has_column_privilege('authenticated', 'public.profiles', 'onboarding_completed', 'update') as onboarding_update,
        has_column_privilege('authenticated', 'public.profiles', 'pais', 'update') as country_update,
        has_column_privilege('authenticated', 'public.profiles', 'residence_country', 'update') as residence_update
    `);
    assert.equal(grants[0].table_update, false);
    assert.equal(grants[0].name_update, true);
    assert.equal(grants[0].language_update, true);
    assert.equal(grants[0].currency_update, true);
    assert.equal(grants[0].email_update, false);
    assert.equal(grants[0].phone_update, false);
    assert.equal(grants[0].onboarding_update, false);
    assert.equal(grants[0].country_update, false);
    assert.equal(grants[0].residence_update, false);

    const client = await connectAs("authenticated", user);
    try {
      await expectSqlError(
        () =>
          client.query("update public.profiles set onboarding_completed = false where id = $1", [
            user,
          ]),
        /42501|permission denied/,
        "UPDATE directo de onboarding",
      );
      await expectSqlError(
        () =>
          client.query("update public.profiles set telefono = '+56999999999' where id = $1", [
            user,
          ]),
        /42501|permission denied/,
        "UPDATE directo de teléfono",
      );
      const named = await client.query(
        "update public.profiles set nombre = 'Nombre Directo' where id = $1 returning nombre",
        [user],
      );
      assert.equal(named.rows[0].nombre, "Nombre Directo");
    } finally {
      await client.end();
    }
  });

  await test("0045 deja la corrección de identidad en el flujo server-side (service_role)", async () => {
    const user = await createUser();
    await onboardUser(user);

    const service = await connectAs("service_role", user);
    try {
      const { rows } = await service.query(
        "update public.profiles set telefono = '+56955555555', updated_at = now() where id = $1 returning telefono",
        [user],
      );
      assert.equal(rows[0].telefono, "+56955555555");
    } finally {
      await service.end();
    }
  });

  // -------------------------------------------------------------------------
  // Concurrencia real
  // -------------------------------------------------------------------------
  await test("concurrencia: revertir y cambiar identidad a la vez falla en ambas llamadas", async () => {
    const user = await createUser();
    await onboardUser(user);
    const before = await profileRow(user);

    const [clientA, clientB] = await Promise.all([
      connectAs("authenticated", user),
      connectAs("authenticated", user),
    ]);
    try {
      const [revert, identity] = await Promise.all([
        capture(() => callProfile(clientA, { onboarding_completed: false })),
        capture(() => callProfile(clientB, { telefono: "+56977777777" })),
      ]);
      assert.equal(revert.ok, false);
      assert.match(
        `${revert.error.code ?? ""} ${revert.error.message ?? ""}`,
        /onboarding_no_reversible/,
      );
      assert.equal(identity.ok, false);
      assert.match(
        `${identity.error.code ?? ""} ${identity.error.message ?? ""}`,
        /cambio_no_permitido/,
      );
    } finally {
      await Promise.all([clientA.end(), clientB.end()]);
    }

    const after = await profileRow(user);
    assert.equal(after.onboarding_completed, true);
    assert.equal(after.telefono, before.telefono);
  });

  await test("concurrencia: una transacción abierta bloquea la reversión hasta el commit", async () => {
    const user = await createUser();
    await onboardUser(user);

    const clientA = await connectAs("authenticated", user);
    const clientB = await connectAs("authenticated", user);
    try {
      await clientA.query("begin");
      await callProfile(clientA, { nombre: "Nombre Transaccional" });

      let bSettled = false;
      const pending = capture(() =>
        callProfile(clientB, { onboarding_completed: false }),
      ).finally(() => {
        bSettled = true;
      });

      await sleep(300);
      assert.equal(bSettled, false, "la segunda llamada debió esperar el lock de fila");

      await clientA.query("commit");
      const result = await pending;
      assert.equal(result.ok, false);
      assert.match(
        `${result.error.code ?? ""} ${result.error.message ?? ""}`,
        /onboarding_no_reversible/,
      );
    } finally {
      await clientA.query("rollback").catch(() => {});
      await Promise.all([clientA.end(), clientB.end()]);
    }

    const after = await profileRow(user);
    assert.equal(after.onboarding_completed, true);
    assert.equal(after.nombre, "Nombre Transaccional");
  });

  await test("concurrencia: dos preferencias simultáneas no se pisan", async () => {
    const user = await createUser();
    await onboardUser(user);

    const [clientA, clientB] = await Promise.all([
      connectAs("authenticated", user),
      connectAs("authenticated", user),
    ]);
    try {
      const [named, english] = await Promise.all([
        capture(() => callProfile(clientA, { nombre: "Nombre Concurrente" })),
        capture(() => callProfile(clientB, { language: "en" })),
      ]);
      assert.equal(named.ok, true);
      assert.equal(english.ok, true);
    } finally {
      await Promise.all([clientA.end(), clientB.end()]);
    }

    const after = await profileRow(user);
    assert.equal(after.nombre, "Nombre Concurrente");
    assert.equal(after.language, "en");
    assert.equal(after.onboarding_completed, true);
  });

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
