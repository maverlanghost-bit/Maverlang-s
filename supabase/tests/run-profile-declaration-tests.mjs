/**
 * Pruebas reales de la migración 0046 contra PostgreSQL aislado.
 *
 * - Levanta PostgreSQL 17 embebido en 127.0.0.1, puerto libre y directorio
 *   temporal propio. No usa Docker, no usa `psql`, no lee `.env` y no se
 *   conecta a ninguna base existente.
 * - Replica el entorno mínimo de Supabase (roles, auth.uid(), auth.jwt(),
 *   auth.users y privilegios por defecto).
 * - Aplica 0002, 0003, 0015, 0043, 0044 y 0045; crea perfiles legados antes
 *   de 0046; aplica 0046 dos veces y verifica:
 *     * el guard de declaración no-US versionada y residencia/nacionalidad;
 *     * que los perfiles existentes no se invaliden ni se rellenen;
 *     * el plan de regularización y que no se fabriquen declaraciones;
 *     * que el alta demo/paper siga funcionando;
 *     * permisos y concurrencia básica.
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

const DB = "maverlang_profile_declaration_test";
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
const dataDir = path.join(
  os.tmpdir(),
  `maverlang-declaration-pg-${process.pid}-${Date.now()}`,
);
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

async function insertAuthUser(id, meta = {}) {
  await admin.query(
    "insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3::jsonb)",
    [id, `${id}@example.test`, JSON.stringify(meta)],
  );
}

async function createUser(meta = {}) {
  const id = nextUserId();
  await insertAuthUser(id, meta);
  return id;
}

async function signupCounts() {
  const { rows } = await admin.query(`
    select
      (select count(*)::int from auth.users) as users,
      (select count(*)::int from public.profiles) as profiles,
      (select count(*)::int from public.consents) as consents
  `);
  return rows[0];
}

/** Alta rechazada: no debe dejar usuario, perfil ni consentimientos. */
async function expectSignupRejected(meta, pattern, label) {
  const id = nextUserId();
  const before = await signupCounts();
  await expectSqlError(() => insertAuthUser(id, meta), pattern, label);
  const after = await signupCounts();
  assert.deepEqual(after, before, `${label}: el alta rechazada no debe dejar rastro`);
  const { rows: profiles } = await admin.query(
    "select 1 from public.profiles where id = $1",
    [id],
  );
  assert.equal(profiles.length, 0, `${label}: sin perfil`);
  const { rows: consents } = await admin.query(
    "select 1 from public.consents where user_id = $1",
    [id],
  );
  assert.equal(consents.length, 0, `${label}: sin consentimientos`);
  return id;
}

async function declarationVersion() {
  const { rows } = await admin.query(
    "select public.current_us_person_declaration_version() as version",
  );
  return rows[0].version;
}

async function planRow(id) {
  const { rows } = await admin.query(
    `select status, resolved_at, missing_fields
       from public.profile_regularization_plan
      where user_id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

async function profileRow(id) {
  const { rows } = await admin.query("select * from public.profiles where id = $1", [id]);
  assert.equal(rows.length, 1, `profileRow(${id}): se esperaba 1 fila`);
  return rows[0];
}

async function callProfile(client, patch) {
  const { rows } = await client.query(
    "select public.update_my_profile($1::jsonb) as profile",
    [JSON.stringify(patch)],
  );
  return rows[0].profile;
}

async function addConsents(client) {
  await client.query("select public.add_my_consent('terminos', 'v-test')");
  await client.query("select public.add_my_consent('privacidad', 'v-test')");
}

async function newCompletableUser() {
  const id = await createUser();
  const client = await connectAs("authenticated", id);
  try {
    await addConsents(client);
  } finally {
    await client.end();
  }
  return id;
}

function onboardingPatch(id, overrides = {}) {
  return {
    nombre: "Ana Pérez",
    email: `${id}@example.test`,
    pais: "CL",
    rut: "11111111-1",
    fecha_nacimiento: "1992-05-10",
    telefono: "+56912345678",
    is_us_person: false,
    onboarding_completed: true,
    language: "es-CL",
    display_currency: "CLP",
    residence_country: "CL",
    nationality_country: "CL",
    us_person_declaration_version: "2026-10-draft",
    ...overrides,
  };
}

/** Fuerza una fila legada ya onboarded, sin pasar por la RPC. */
async function forceLegacyProfile(id, { version, declaredAt, residence, nationality }) {
  await admin.query(
    `update public.profiles set
       nombre = 'Legado',
       pais = 'CL',
       rut = '12345678-5',
       fecha_nacimiento = '1988-03-15',
       telefono = '+56911112222',
       is_us_person = false,
       onboarding_completed = true,
       language = 'es-CL',
       display_currency = 'CLP',
       residence_country = $2,
       nationality_country = $3,
       us_person_declaration_version = $4,
       us_person_declared_at = $5
     where id = $1`,
    [id, residence, nationality, version, declaredAt],
  );
}

async function planRows() {
  const { rows } = await admin.query(
    `select user_id, missing_fields, status
       from public.profile_regularization_plan
      order by user_id`,
  );
  return rows;
}

try {
  await cluster.initialise();
  await cluster.start();
  await cluster.createDatabase(DB);

  admin = await connect();
  await applySql(admin, SUPABASE_STUB, "stub Supabase");

  for (const name of [
    "0002_supabase_auth.sql",
    "0003_demo_accounts.sql",
    "0015_compliance.sql",
    "0043_profiles_rpc.sql",
    "0044_profiles_column_grants.sql",
    "0045_profiles_immutability.sql",
  ]) {
    await applySql(admin, readMigration(name), name);
  }

  // -------------------------------------------------------------------------
  // Datos legados/ demo antes de 0046
  // -------------------------------------------------------------------------

  const legacyMissing = await createUser();
  await forceLegacyProfile(legacyMissing, {
    version: null,
    declaredAt: null,
    residence: null,
    nationality: null,
  });

  const legacyVersionOnly = await createUser();
  await forceLegacyProfile(legacyVersionOnly, {
    version: "v-legacy",
    declaredAt: null,
    residence: "CL",
    nationality: "CL",
  });

  const legacyComplete = await createUser();
  await forceLegacyProfile(legacyComplete, {
    version: "v-legacy",
    declaredAt: new Date(),
    residence: "CL",
    nationality: "CL",
  });

  // Alta demo/paper: sólo versiones y origen en user_metadata, sin perfil
  // completo ni declaración. Debe crear perfil y cuenta demo.
  const demoUser = await createUser({
    terms_version: "v-demo",
    privacy_version: "v-demo",
    terms_accepted_at: new Date().toISOString(),
    signup_source: "demo",
  });

  const legacyBefore = await profileRow(legacyMissing);

  // -------------------------------------------------------------------------
  // 0046
  // -------------------------------------------------------------------------

  await test("0046 aplica sobre 0045/0044/0043 con datos existentes", async () => {
    await applySql(
      admin,
      readMigration("0046_profiles_onboarding_declaration.sql"),
      "0046",
    );
  });

  await test("0046 es idempotente y no reabre el plan", async () => {
    const before = await planRows();
    await applySql(
      admin,
      readMigration("0046_profiles_onboarding_declaration.sql"),
      "0046 (2)",
    );
    const after = await planRows();
    assert.equal(after.length, before.length, "no debe duplicar filas del plan");
    for (const row of before) {
      const same = after.find((item) => item.user_id === row.user_id);
      assert.ok(same, `desapareció ${row.user_id}`);
      assert.equal(same.status, row.status);
      assert.deepEqual(same.missing_fields, row.missing_fields);
    }
  });

  await test("0046 protege perfiles existentes y no rellena columnas", async () => {
    const after = await profileRow(legacyMissing);
    assert.equal(after.onboarding_completed, true);
    assert.equal(after.us_person_declaration_version, null);
    assert.equal(after.us_person_declared_at, null);
    assert.equal(after.residence_country, null);
    assert.equal(after.nationality_country, null);
    assert.equal(after.is_us_person, false);
    assert.equal(after.nombre, legacyBefore.nombre);
    assert.equal(after.telefono, legacyBefore.telefono);
  });

  await test("0046 siembra el plan sólo con perfiles incompletos", async () => {
    const rows = await planRows();
    const byUser = new Map(rows.map((row) => [row.user_id, row]));

    const missing = byUser.get(legacyMissing);
    assert.ok(missing, "legacyMissing debe estar en el plan");
    assert.equal(missing.status, "pending");
    assert.deepEqual(
      [...missing.missing_fields].sort(),
      ["nationality_country", "residence_country", "us_person_declaration"],
    );

    const versionOnly = byUser.get(legacyVersionOnly);
    assert.ok(versionOnly, "legacyVersionOnly debe estar en el plan");
    assert.deepEqual(versionOnly.missing_fields, ["us_person_declaration"]);

    const complete = byUser.get(legacyComplete);
    assert.ok(complete, "una versión vieja también necesita regularización");
    assert.deepEqual(complete.missing_fields, ["us_person_declaration"]);
    assert.equal(byUser.has(demoUser), false, "una demo sin onboarding no va al plan");
  });

  await test("0046 no fabrica consentimientos ni eventos de declaración", async () => {
    const { rows: consents } = await admin.query(
      "select doc, version from public.consents where user_id = $1 order by doc",
      [legacyMissing],
    );
    assert.deepEqual(consents, [], "no debe crear consentimientos para el legado");

    const { rows: events } = await admin.query(
      "select type from public.compliance_events where user_id = $1",
      [legacyMissing],
    );
    assert.deepEqual(events, [], "no debe crear eventos de declaración");
  });

  await test("0046 no bloquea el alta demo/paper", async () => {
    const row = await profileRow(demoUser);
    assert.equal(row.onboarding_completed, false);
    assert.equal(row.is_us_person, false);
    assert.equal(row.us_person_declaration_version, null);
    assert.equal(row.residence_country, null);
    assert.equal(row.nationality_country, null);

    const { rows: demo } = await admin.query(
      "select cash_clp from public.demo_accounts where user_id = $1",
      [demoUser],
    );
    assert.equal(demo.length, 1, "el trigger demo debe crear la cuenta");
    assert.equal(Number(demo[0].cash_clp), 1000000);

    const { rows: consents } = await admin.query(
      "select doc from public.consents where user_id = $1 order by doc",
      [demoUser],
    );
    assert.deepEqual(
      consents.map((item) => item.doc),
      ["privacidad", "terminos"],
    );

    const client = await connectAs("authenticated", demoUser);
    try {
      const updated = await callProfile(client, { nombre: "Demo Paper" });
      assert.equal(updated.nombre, "Demo Paper");
      assert.equal(updated.onboarding_completed, false);
    } finally {
      await client.end();
    }
  });

  await test("0046 permite nombre antes del onboarding sin declaración", async () => {
    const id = await createUser();
    const client = await connectAs("authenticated", id);
    try {
      const updated = await callProfile(client, { nombre: "Sin Declarar" });
      assert.equal(updated.nombre, "Sin Declarar");
      assert.equal(updated.onboarding_completed, false);
    } finally {
      await client.end();
    }
  });

  await test("0046 permite completar con is_us_person=false versionado", async () => {
    const id = await newCompletableUser();
    const client = await connectAs("authenticated", id);
    try {
      const result = await callProfile(client, onboardingPatch(id));
      assert.equal(result.onboarding_completed, true);
      assert.equal(result.pais, "CL");
      assert.equal(result.rut, "11111111-1");
      assert.equal(result.fecha_nacimiento, "1992-05-10");
    } finally {
      await client.end();
    }

    const row = await profileRow(id);
    assert.equal(row.onboarding_completed, true);
    assert.equal(row.is_us_person, false);
    assert.equal(row.us_person_declaration_version, "2026-10-draft");
    assert.ok(row.us_person_declared_at instanceof Date);
    assert.equal(row.residence_country, "CL");
    assert.equal(row.nationality_country, "CL");

    const { rows: consents } = await admin.query(
      "select doc, version from public.consents where user_id = $1 order by doc",
      [id],
    );
    assert.deepEqual(
      consents.map((item) => `${item.doc}:${item.version}`),
      ["privacidad:v-test", "terminos:v-test", "us_person:2026-10-draft"],
    );

    const { rows: events } = await admin.query(
      "select count(*)::int as n from public.compliance_events where user_id = $1 and type = 'us_person_declaration'",
      [id],
    );
    assert.equal(events[0].n, 1);
  });

  await test("0046 acepta el alias us_person_declaration=no", async () => {
    const id = await newCompletableUser();
    const patch = onboardingPatch(id, {
      is_us_person: undefined,
      us_person_declaration: "no",
      residence_country: "cl",
      nationality_country: "cl",
      us_person_declaration_version: "2026-10-draft",
    });
    const client = await connectAs("authenticated", id);
    try {
      const result = await callProfile(client, patch);
      assert.equal(result.onboarding_completed, true);
    } finally {
      await client.end();
    }

    const row = await profileRow(id);
    assert.equal(row.onboarding_completed, true);
    assert.equal(row.is_us_person, false);
    assert.equal(row.us_person_declaration_version, "2026-10-draft");
    assert.equal(row.residence_country, "CL");
    assert.equal(row.nationality_country, "CL");
  });

  await test("0046 rechaza completar sin declaración explícita", async () => {
    const cases = [
      [
        "sin clave de declaración",
        (patch) => {
          delete patch.is_us_person;
        },
        /declaracion_requerida/,
      ],
      [
        "is_us_person null",
        (patch) => {
          patch.is_us_person = null;
        },
        /is_us_person_invalido/,
      ],
      [
        "is_us_person true",
        (patch) => {
          patch.is_us_person = true;
        },
        /us_person_bloqueado/,
      ],
      [
        "declaración yes",
        (patch) => {
          delete patch.is_us_person;
          patch.us_person_declaration = "yes";
        },
        /us_person_bloqueado/,
      ],
      [
        "declaración dudosa",
        (patch) => {
          delete patch.is_us_person;
          patch.us_person_declaration = "maybe";
        },
        /declaracion_invalida/,
      ],
    ];

    for (const [label, mutate, pattern] of cases) {
      const id = await newCompletableUser();
      const patch = onboardingPatch(id);
      mutate(patch);
      const client = await connectAs("authenticated", id);
      try {
        await expectSqlError(() => callProfile(client, patch), pattern, label);
      } finally {
        await client.end();
      }
      const row = await profileRow(id);
      assert.equal(row.onboarding_completed, false, `${label}: no debe completar`);
      assert.equal(row.us_person_declaration_version, null, `${label}: sin versión`);
    }
  });

  await test("0046 rechaza versión ausente, vacía o inválida", async () => {
    const cases = [
      [
        "versión ausente",
        (patch) => {
          delete patch.us_person_declaration_version;
        },
        /version_declaracion_requerida/,
      ],
      [
        "versión vacía",
        (patch) => {
          patch.us_person_declaration_version = "";
        },
        /version_declaracion_requerida/,
      ],
      [
        "versión de 65 caracteres",
        (patch) => {
          patch.us_person_declaration_version = "v".repeat(65);
        },
        /version_declaracion_invalida/,
      ],
      [
        "versión numérica",
        (patch) => {
          patch.us_person_declaration_version = 123;
        },
        /version_declaracion_invalida/,
      ],
    ];

    for (const [label, mutate, pattern] of cases) {
      const id = await newCompletableUser();
      const patch = onboardingPatch(id);
      mutate(patch);
      const client = await connectAs("authenticated", id);
      try {
        await expectSqlError(() => callProfile(client, patch), pattern, label);
      } finally {
        await client.end();
      }
      const row = await profileRow(id);
      assert.equal(row.onboarding_completed, false, `${label}: no debe completar`);
      assert.equal(row.us_person_declaration_version, null, `${label}: sin versión`);
    }
  });

  await test("0046 rechaza residencia/nacionalidad ausentes o inválidas", async () => {
    const cases = [
      [
        "residencia ausente",
        (patch) => {
          delete patch.residence_country;
        },
        /residencia_requerida/,
      ],
      [
        "residencia vacía",
        (patch) => {
          patch.residence_country = "";
        },
        /residencia_requerida/,
      ],
      [
        "nacionalidad ausente",
        (patch) => {
          delete patch.nationality_country;
        },
        /nacionalidad_requerida/,
      ],
      [
        "nacionalidad vacía",
        (patch) => {
          patch.nationality_country = "";
        },
        /nacionalidad_requerida/,
      ],
      [
        "residencia con formato inválido",
        (patch) => {
          patch.residence_country = "C1";
        },
        /residencia_invalida/,
      ],
      [
        "nacionalidad con formato inválido",
        (patch) => {
          patch.nationality_country = "USA";
        },
        /nacionalidad_invalida/,
      ],
      [
        "residencia bloqueada",
        (patch) => {
          patch.residence_country = "US";
        },
        /pais_bloqueado/,
      ],
      [
        "nacionalidad bloqueada",
        (patch) => {
          patch.nationality_country = "IR";
        },
        /pais_bloqueado/,
      ],
    ];

    for (const [label, mutate, pattern] of cases) {
      const id = await newCompletableUser();
      const patch = onboardingPatch(id);
      mutate(patch);
      const client = await connectAs("authenticated", id);
      try {
        await expectSqlError(() => callProfile(client, patch), pattern, label);
      } finally {
        await client.end();
      }
      const row = await profileRow(id);
      assert.equal(row.onboarding_completed, false, `${label}: no debe completar`);
      assert.equal(row.residence_country, null, `${label}: sin residencia`);
      assert.equal(row.nationality_country, null, `${label}: sin nacionalidad`);
    }
  });

  await test("0046 no permite preescribir la declaración antes de completar", async () => {
    const id = await newCompletableUser();
    const client = await connectAs("authenticated", id);
    try {
      await expectSqlError(
        () =>
          callProfile(client, {
            nombre: "Parcial",
            is_us_person: false,
            residence_country: "CL",
            nationality_country: "CL",
            us_person_declaration_version: "2026-10-draft",
          }),
        /declaracion_solo_al_completar/,
        "preescribir declaración",
      );

      await expectSqlError(
        () => callProfile(client, { onboarding_completed: true }),
        /declaracion_requerida/,
        "completar sólo con el flag",
      );

      const completed = await callProfile(client, onboardingPatch(id));
      assert.equal(completed.onboarding_completed, true);
    } finally {
      await client.end();
    }

    const row = await profileRow(id);
    assert.equal(row.onboarding_completed, true);
    assert.equal(row.us_person_declaration_version, "2026-10-draft");
    assert.ok(row.us_person_declared_at instanceof Date);
  });

  await test("0046 no invalida ni deja tocar el perfil legado por RPC", async () => {
    const client = await connectAs("authenticated", legacyMissing);
    try {
      const named = await callProfile(client, { nombre: "Legado Actualizado" });
      assert.equal(named.nombre, "Legado Actualizado");
      assert.equal(named.onboarding_completed, true);

      await expectSqlError(
        () => callProfile(client, { residence_country: "CL" }),
        /cambio_no_permitido/,
        "mover residencia legada",
      );
      await expectSqlError(
        () => callProfile(client, {
          onboarding_completed: true,
          is_us_person: false,
          residence_country: "CL",
          nationality_country: "CL",
          us_person_declaration_version: "v-nueva",
        }),
        /cambio_no_permitido/,
        "regularizar por RPC",
      );
    } finally {
      await client.end();
    }

    const row = await profileRow(legacyMissing);
    assert.equal(row.onboarding_completed, true);
    assert.equal(row.nombre, "Legado Actualizado");
    assert.equal(row.us_person_declaration_version, null);
    assert.equal(row.us_person_declared_at, null);
    assert.equal(row.residence_country, null);
    assert.equal(row.nationality_country, null);
  });

  await test("0046 restringe el plan y la vista a service_role", async () => {
    const client = await connectAs("authenticated", legacyMissing);
    try {
      await expectSqlError(
        () => client.query("select * from public.profile_regularization_plan"),
        /42501|permission denied/i,
        "plan",
      );
      await expectSqlError(
        () => client.query("select * from public.profile_regularization_status"),
        /42501|permission denied/i,
        "vista",
      );
      await expectSqlError(
        () =>
          client.query("select public.profile_declaration_missing_fields($1)", [
            legacyMissing,
          ]),
        /42501|permission denied/i,
        "helper",
      );
      await expectSqlError(
        () =>
          client.query(
            "select public.resolve_profile_regularization($1, 'contacted')",
            [legacyMissing],
          ),
        /42501|permission denied/i,
        "resolve",
      );
    } finally {
      await client.end();
    }

    const service = await connectAs("service_role", legacyMissing);
    try {
      const { rows } = await service.query(
        "select * from public.profile_regularization_status where user_id = $1",
        [legacyMissing],
      );
      assert.equal(rows.length, 1);
      assert.equal(rows[0].plan_status, "pending");
      assert.equal(rows[0].declaration_complete, false);
      assert.deepEqual(
        [...rows[0].current_missing_fields].sort(),
        ["nationality_country", "residence_country", "us_person_declaration"],
      );
    } finally {
      await service.end();
    }
  });

  await test("0046 no permite cerrar regularizado sin evidencia real", async () => {
    const service = await connectAs("service_role", legacyMissing);
    try {
      await expectSqlError(
        () =>
          service.query(
            "select public.resolve_profile_regularization($1, 'regularized')",
            [legacyMissing],
          ),
        /perfil_sin_declaracion/,
        "cerrar sin declaración",
      );

      // Regularización server-side real: recién ahora se escribe evidencia.
      await service.query(
        `update public.profiles set
           is_us_person = false,
           us_person_declaration_version = '2026-10-draft',
           us_person_declared_at = now(),
           residence_country = 'CL',
           nationality_country = 'CL'
         where id = $1`,
        [legacyMissing],
      );

      const { rows } = await service.query(
        "select public.resolve_profile_regularization($1, 'regularized', 'contactado') as result",
        [legacyMissing],
      );
      assert.equal(rows[0].result.status, "regularized");
      assert.ok(rows[0].result.resolved_at);
    } finally {
      await service.end();
    }

    const row = await profileRow(legacyMissing);
    assert.equal(row.onboarding_completed, true);
    assert.equal(row.us_person_declaration_version, "2026-10-draft");
    assert.ok(row.us_person_declared_at instanceof Date);
    assert.equal(row.residence_country, "CL");
    assert.equal(row.nationality_country, "CL");

    const { rows: plan } = await admin.query(
      "select status, resolved_at from public.profile_regularization_plan where user_id = $1",
      [legacyMissing],
    );
    assert.equal(plan[0].status, "regularized");
    assert.ok(plan[0].resolved_at);
  });

  await test("0046 sync agrega huecos nuevos sin tocar los existentes", async () => {
    const newcomer = await createUser();
    await forceLegacyProfile(newcomer, {
      version: null,
      declaredAt: null,
      residence: null,
      nationality: null,
    });

    const service = await connectAs("service_role");
    try {
      const { rows } = await service.query(
        "select public.sync_profile_regularization_plan() as inserted",
      );
      assert.equal(rows[0].inserted, 1);
      const { rows: again } = await service.query(
        "select public.sync_profile_regularization_plan() as inserted",
      );
      assert.equal(again[0].inserted, 0, "sync debe ser idempotente");
    } finally {
      await service.end();
    }

    const rows = await planRows();
    const legacy = rows.find((row) => row.user_id === legacyMissing);
    assert.equal(legacy.status, "regularized", "no debe reabrir una fila resuelta");
    const added = rows.find((row) => row.user_id === newcomer);
    assert.ok(added, "el hueco nuevo debe entrar al plan");
    assert.equal(added.status, "pending");
  });

  await test("0046 reaplica con datos y conserva el plan regularizado", async () => {
    const before = await planRows();
    await applySql(
      admin,
      readMigration("0046_profiles_onboarding_declaration.sql"),
      "0046 (con datos)",
    );
    const after = await planRows();
    assert.equal(after.length, before.length);
    const legacy = after.find((row) => row.user_id === legacyMissing);
    assert.equal(legacy.status, "regularized");
  });

  await test("concurrencia: dos completados simultáneos no duplican declaración", async () => {
    const id = await newCompletableUser();
    const [clientA, clientB] = await Promise.all([
      connectAs("authenticated", id),
      connectAs("authenticated", id),
    ]);
    try {
      const results = await Promise.all([
        capture(() => callProfile(clientA, onboardingPatch(id))),
        capture(() => callProfile(clientB, onboardingPatch(id))),
      ]);
      assert.equal(results.filter((item) => item.ok).length, 2);
    } finally {
      await Promise.all([clientA.end(), clientB.end()]);
    }

    const row = await profileRow(id);
    assert.equal(row.onboarding_completed, true);
    assert.equal(row.us_person_declaration_version, "2026-10-draft");
    const { rows: consents } = await admin.query(
      "select count(*)::int as n from public.consents where user_id = $1 and doc = 'us_person'",
      [id],
    );
    assert.equal(consents[0].n, 1, "el consentimiento us_person no se duplica");
  });

  await test("DB-03: metadata completa no acredita onboarding", async () => {
    const id = await createUser({
      nombre: "Meta Completa",
      rut: "11111111-1",
      pais: "CL",
      fecha_nacimiento: "1990-01-01",
      telefono: "+56911112222",
      is_us_person: false,
      residence_country: "CL",
      nationality_country: "CL",
      us_person_declaration_version: "2026-10-draft",
      onboarding_completed: true,
      terms_version: "v-meta",
      privacy_version: "v-meta",
      risks_version: "v-meta",
    });

    const row = await profileRow(id);
    assert.equal(row.onboarding_completed, false, "el flag del metadata se ignora");
    assert.equal(row.is_us_person, false);
    assert.equal(row.us_person_declaration_version, null);
    assert.equal(row.us_person_declared_at, null);
    assert.equal(row.residence_country, null);
    assert.equal(row.nationality_country, null);

    const { rows: consents } = await admin.query(
      "select doc from public.consents where user_id = $1 order by doc",
      [id],
    );
    assert.deepEqual(
      consents.map((item) => item.doc),
      ["privacidad", "riesgos", "terminos"],
    );
    const { rows: usConsents } = await admin.query(
      "select count(*)::int as n from public.consents where user_id = $1 and doc = 'us_person'",
      [id],
    );
    assert.equal(usConsents[0].n, 0, "no se crea consentimiento us_person desde metadata");
    const { rows: events } = await admin.query(
      "select count(*)::int as n from public.compliance_events where user_id = $1",
      [id],
    );
    assert.equal(events[0].n, 0, "no se crea evento de declaración desde metadata");

    const client = await connectAs("authenticated", id);
    try {
      await expectSqlError(
        () => callProfile(client, { onboarding_completed: true }),
        /declaracion_requerida/,
        "metadata completa + flag no basta",
      );
    } finally {
      await client.end();
    }
  });

  await test("DB-03: demo y OAuth siguen creando perfil sin onboarding", async () => {
    const demo = await createUser({
      terms_version: "v-demo-2",
      privacy_version: "v-demo-2",
      terms_accepted_at: new Date().toISOString(),
      signup_source: "demo",
    });
    const demoRow = await profileRow(demo);
    assert.equal(demoRow.onboarding_completed, false);
    assert.equal(demoRow.us_person_declaration_version, null);
    assert.equal(demoRow.residence_country, null);
    const { rows: demoAccount } = await admin.query(
      "select cash_clp from public.demo_accounts where user_id = $1",
      [demo],
    );
    assert.equal(demoAccount.length, 1, "la cuenta demo se sigue creando");
    const { rows: demoConsents } = await admin.query(
      "select doc from public.consents where user_id = $1 order by doc",
      [demo],
    );
    assert.deepEqual(
      demoConsents.map((item) => item.doc),
      ["privacidad", "terminos"],
    );

    const oauth = await createUser({
      iss: "https://accounts.google.com",
      name: "OAuth User",
      email_verified: true,
      provider_id: "google",
    });
    const oauthRow = await profileRow(oauth);
    assert.equal(oauthRow.onboarding_completed, false);
    assert.equal(oauthRow.us_person_declaration_version, null);
    assert.equal(oauthRow.residence_country, null);
    assert.equal(oauthRow.nationality_country, null);
  });

  await test("DB-03: metadata bloqueada no crea cuenta", async () => {
    const { rows: before } = await admin.query("select count(*)::int as n from auth.users");
    await expectSqlError(
      () => createUser({ pais: "US" }),
      /registro_us_person/,
      "metadata país US",
    );
    await expectSqlError(
      () => createUser({ is_us_person: true }),
      /registro_us_person/,
      "metadata is_us_person true",
    );
    const { rows: after } = await admin.query("select count(*)::int as n from auth.users");
    assert.equal(after[0].n, before[0].n, "el alta bloqueada no deja usuario");
  });

  await test("DB-03: completar exige perfil completo y fecha adulta", async () => {
    const id = await newCompletableUser();
    const client = await connectAs("authenticated", id);
    try {
      const cases = [
        ["nombre", (patch) => delete patch.nombre, /nombre_requerido/],
        ["pais", (patch) => { delete patch.pais; delete patch.rut; }, /pais_requerido/],
        ["fecha", (patch) => delete patch.fecha_nacimiento, /fecha_requerida/],
        ["telefono", (patch) => delete patch.telefono, /telefono_requerido/],
        ["rut", (patch) => delete patch.rut, /rut_requerido/],
        [
          "menor de edad",
          (patch) => {
            patch.fecha_nacimiento = "2015-01-01";
          },
          /fecha_invalida/,
        ],
      ];
      for (const [label, mutate, pattern] of cases) {
        const patch = onboardingPatch(id);
        mutate(patch);
        await expectSqlError(() => callProfile(client, patch), pattern, label);
      }

      const completed = await callProfile(client, onboardingPatch(id));
      assert.equal(completed.onboarding_completed, true);
    } finally {
      await client.end();
    }
  });

  await test("DB-03: versión vigente en DB y fecha puesta por el servidor", async () => {
    const service = await connectAs("service_role");
    try {
      await service.query(
        "select public.set_us_person_declaration_version('2026-11-test') as result",
      );
    } finally {
      await service.end();
    }

    const id = await newCompletableUser();
    const client = await connectAs("authenticated", id);
    try {
      await expectSqlError(
        () =>
          callProfile(
            client,
            onboardingPatch(id, {
              us_person_declaration_version: "2026-10-draft",
              us_person_declared_at: "2000-01-01T00:00:00Z",
            }),
          ),
        /version_declaracion_no_vigente/,
        "versión vieja",
      );

      await expectSqlError(
        () =>
          callProfile(
            client,
            onboardingPatch(id, {
              us_person_declaration_version: "v-inventada",
            }),
          ),
        /version_declaracion_no_vigente/,
        "versión inventada",
      );

      const completed = await callProfile(
        client,
        onboardingPatch(id, {
          us_person_declaration_version: "2026-11-test",
          us_person_declared_at: "2000-01-01T00:00:00Z",
        }),
      );
      assert.equal(completed.onboarding_completed, true);
    } finally {
      await client.end();
    }

    const row = await profileRow(id);
    assert.equal(row.us_person_declaration_version, "2026-11-test");
    assert.ok(row.us_person_declared_at instanceof Date);
    assert.ok(
      row.us_person_declared_at.getFullYear() >= 2020,
      "la fecha del cliente se ignora",
    );

    const reset = await connectAs("service_role");
    try {
      await reset.query(
        "select public.set_us_person_declaration_version('2026-10-draft') as result",
      );
    } finally {
      await reset.end();
    }
  });

  await test("DB-03: regularización de legado no inventa evidencia", async () => {
    const id = await createUser();
    await forceLegacyProfile(id, {
      version: null,
      declaredAt: null,
      residence: null,
      nationality: null,
    });
    await admin.query(
      "update public.profiles set nombre = null, telefono = null where id = $1",
      [id],
    );

    const service = await connectAs("service_role", id);
    try {
      await service.query("select public.sync_profile_regularization_plan() as inserted");
      await expectSqlError(
        () =>
          service.query(
            "select public.resolve_profile_regularization($1, 'regularized')",
            [id],
          ),
        /perfil_sin_declaracion/,
        "cerrar sin identidad ni declaración",
      );
      await expectSqlError(
        () =>
          service.query(
            "select public.regularize_legacy_profile($1, false, 'CL', 'CL')",
            [id],
          ),
        /nombre_requerido/,
        "regularizar sin datos de identidad",
      );

      const { rows } = await service.query(
        `select public.regularize_legacy_profile(
           $1, false, 'CL', 'CL', $2::jsonb, 'contactado'
         ) as result`,
        [
          id,
          JSON.stringify({
            nombre: "Legado Regularizado",
            telefono: "+56911112222",
          }),
        ],
      );
      assert.equal(rows[0].result.status, "regularized");
      assert.equal(rows[0].result.changed, true);

      const again = await service.query(
        `select public.regularize_legacy_profile(
           $1, false, 'CL', 'CL', $2::jsonb, 'contactado'
         ) as result`,
        [
          id,
          JSON.stringify({
            nombre: "Legado Regularizado",
            telefono: "+56911112222",
          }),
        ],
      );
      assert.equal(again.rows[0].result.changed, false, "segunda llamada idempotente");
    } finally {
      await service.end();
    }

    const row = await profileRow(id);
    assert.equal(row.onboarding_completed, true);
    assert.equal(row.nombre, "Legado Regularizado");
    assert.equal(row.telefono, "+56911112222");
    assert.equal(row.is_us_person, false);
    assert.equal(row.us_person_declaration_version, "2026-10-draft");
    assert.ok(row.us_person_declared_at instanceof Date);
    assert.equal(row.residence_country, "CL");
    assert.equal(row.nationality_country, "CL");

    const { rows: plan } = await admin.query(
      "select status, resolved_at from public.profile_regularization_plan where user_id = $1",
      [id],
    );
    assert.equal(plan[0].status, "regularized");
    assert.ok(plan[0].resolved_at);

    const { rows: events } = await admin.query(
      "select count(*)::int as n from public.compliance_events where user_id = $1 and type = 'profile_regularization'",
      [id],
    );
    assert.equal(events[0].n, 1, "una sola auditoría de regularización");
    const { rows: usConsents } = await admin.query(
      "select count(*)::int as n from public.consents where user_id = $1 and doc = 'us_person'",
      [id],
    );
    assert.equal(usConsents[0].n, 1, "un solo consentimiento us_person");
  });

  await test("concurrencia: dos regularizaciones simultáneas no duplican evidencia", async () => {
    const id = await createUser();
    await forceLegacyProfile(id, {
      version: null,
      declaredAt: null,
      residence: null,
      nationality: null,
    });
    await admin.query(
      "update public.profiles set nombre = null, telefono = null where id = $1",
      [id],
    );
    const sync = await connectAs("service_role");
    try {
      await sync.query("select public.sync_profile_regularization_plan() as inserted");
    } finally {
      await sync.end();
    }

    const [clientA, clientB] = await Promise.all([
      connectAs("service_role", id),
      connectAs("service_role", id),
    ]);
    try {
      const payload = JSON.stringify({
        nombre: "Legado Concurrente",
        telefono: "+56933334444",
      });
      const results = await Promise.all([
        capture(() =>
          clientA.query(
            `select public.regularize_legacy_profile(
               $1, false, 'CL', 'CL', $2::jsonb, 'contactado'
             ) as result`,
            [id, payload],
          ),
        ),
        capture(() =>
          clientB.query(
            `select public.regularize_legacy_profile(
               $1, false, 'CL', 'CL', $2::jsonb, 'contactado'
             ) as result`,
            [id, payload],
          ),
        ),
      ]);
      assert.equal(results.filter((item) => item.ok).length, 2);
      const changed = results
        .filter((item) => item.ok)
        .map((item) => item.value.rows[0].result.changed);
      assert.deepEqual(changed.sort(), [false, true]);
    } finally {
      await Promise.all([clientA.end(), clientB.end()]);
    }

    const { rows: events } = await admin.query(
      "select count(*)::int as n from public.compliance_events where user_id = $1 and type = 'profile_regularization'",
      [id],
    );
    assert.equal(events[0].n, 1, "la regularización concurrente no duplica auditoría");
    const { rows: usConsents } = await admin.query(
      "select count(*)::int as n from public.consents where user_id = $1 and doc = 'us_person'",
      [id],
    );
    assert.equal(usConsents[0].n, 1, "la regularización concurrente no duplica consentimiento");
  });

  await test("DB-03: config y regularización sólo service_role", async () => {
    const client = await connectAs("authenticated", legacyMissing);
    try {
      for (const [label, sql] of [
        ["config", "select * from public.compliance_config"],
        ["versión vigente", "select public.current_us_person_declaration_version()"],
        [
          "rotar versión",
          "select public.set_us_person_declaration_version('2026-12-test')",
        ],
        [
          "regularizar",
          "select public.regularize_legacy_profile($1, false, 'CL', 'CL', '{}'::jsonb, null)",
        ],
      ]) {
        const result = await capture(() =>
          sql.includes("$1") ? client.query(sql, [legacyMissing]) : client.query(sql),
        );
        assert.equal(result.ok, false, `${label}: authenticated no debe poder`);
        assert.match(
          `${result.error.code ?? ""} ${result.error.message ?? ""}`,
          /42501|permission denied/i,
          `${label}: error inesperado`,
        );
      }
    } finally {
      await client.end();
    }
  });

  await test("DB-03: fecha de menor o inválida en metadata no crea nada", async () => {
    const { rows: dates } = await admin.query(`
      select
        (current_date - interval '10 years')::date::text as menor,
        (current_date - interval '18 years' + interval '1 day')::date::text as casi18,
        (current_date + interval '1 day')::date::text as futuro
    `);
    const d = dates[0];

    const cases = [
      ["menor de 10 años", { fecha_nacimiento: d.menor }, /registro_menor_edad/],
      ["un día menos de 18", { fecha_nacimiento: d.casi18 }, /registro_menor_edad/],
      ["fecha futura", { fecha_nacimiento: d.futuro }, /fecha_nacimiento_invalida/],
      ["formato dd/mm/aaaa", { fecha_nacimiento: "31/12/1990" }, /fecha_nacimiento_invalida/],
      ["fecha inexistente", { fecha_nacimiento: "2020-02-31" }, /fecha_nacimiento_invalida/],
      ["texto cualquiera", { fecha_nacimiento: "no-es-fecha" }, /fecha_nacimiento_invalida/],
      ["fecha numérica", { fecha_nacimiento: 19900510 }, /fecha_nacimiento_invalida/],
    ];

    for (const [label, overrides, pattern] of cases) {
      await expectSignupRejected(
        {
          ...overrides,
          terms_version: "v-menor",
          privacy_version: "v-menor",
          risks_version: "v-menor",
          terms_accepted_at: new Date().toISOString(),
          signup_source: "demo",
        },
        pattern,
        label,
      );
    }
  });

  await test("DB-03: fecha adulta válida se guarda sin acreditar onboarding", async () => {
    const { rows: dates } = await admin.query(
      "select (current_date - interval '18 years')::date::text as justo18",
    );
    const justo18 = dates[0].justo18;

    const id = await createUser({
      fecha_nacimiento: justo18,
      terms_version: "v-fecha",
      privacy_version: "v-fecha",
      onboarding_completed: true,
    });
    const row = await profileRow(id);
    assert.equal(row.onboarding_completed, false, "el metadata no acredita onboarding");
    assert.equal(row.us_person_declaration_version, null);
    const { rows: fecha } = await admin.query(
      "select fecha_nacimiento::text as fecha from public.profiles where id = $1",
      [id],
    );
    assert.equal(fecha[0].fecha, justo18, "la fecha adulta válida se conserva");
    const { rows: consents } = await admin.query(
      "select doc from public.consents where user_id = $1 order by doc",
      [id],
    );
    assert.deepEqual(
      consents.map((item) => item.doc),
      ["privacidad", "terminos"],
    );

    // Fecha vacía: demo/paper no manda fecha y debe seguir operando.
    const demo = await createUser({
      fecha_nacimiento: "",
      terms_version: "v-vacia",
      privacy_version: "v-vacia",
      signup_source: "demo",
    });
    const demoRow = await profileRow(demo);
    assert.equal(demoRow.onboarding_completed, false);
    assert.equal(demoRow.fecha_nacimiento, null);
    const { rows: demoAccount } = await admin.query(
      "select cash_clp from public.demo_accounts where user_id = $1",
      [demo],
    );
    assert.equal(demoAccount.length, 1, "la cuenta demo se sigue creando");
  });

  await test("DB-03: regularize no cierra el plan sin evidencia nueva", async () => {
    const version = await declarationVersion();
    const id = await createUser();
    await forceLegacyProfile(id, {
      version,
      declaredAt: new Date(),
      residence: "CL",
      nationality: "CL",
    });
    // Fila pendiente de una corrida anterior, con un perfil ya completo.
    await admin.query(
      `insert into public.profile_regularization_plan (user_id, missing_fields)
       values ($1, array['us_person_declaration'])`,
      [id],
    );

    const service = await connectAs("service_role", id);
    try {
      const { rows } = await service.query(
        "select public.regularize_legacy_profile($1, false, 'CL', 'CL') as result",
        [id],
      );
      const result = rows[0].result;
      assert.equal(result.changed, false, "no había nada que escribir");
      assert.equal(result.status, "pending", "sin evidencia nueva no se regulariza");
      assert.equal(result.reopened, false);
      assert.equal(result.plan_updated, false);
      assert.equal(result.resolved_at, null);
      assert.deepEqual(result.missing_fields_current, []);
    } finally {
      await service.end();
    }

    const plan = await planRow(id);
    assert.equal(plan.status, "pending");
    assert.equal(plan.resolved_at, null);

    // El cierre honesto es resolve_*, que exige evidencia real.
    const closer = await connectAs("service_role", id);
    try {
      const { rows } = await closer.query(
        "select public.resolve_profile_regularization($1, 'regularized') as result",
        [id],
      );
      assert.equal(rows[0].result.status, "regularized");
      assert.ok(rows[0].result.resolved_at);
    } finally {
      await closer.end();
    }
  });

  await test("DB-03: regularize no reescribe ni inventa un cierre con evidencia", async () => {
    const version = await declarationVersion();
    const id = await createUser();
    await forceLegacyProfile(id, {
      version,
      declaredAt: new Date(),
      residence: "CL",
      nationality: "CL",
    });
    // Fila cerrada por un flujo anterior, con evidencia real en el perfil.
    await admin.query(
      `insert into public.profile_regularization_plan
         (user_id, missing_fields, status, resolved_at, notes)
       values ($1, array['us_person_declaration'], 'regularized', now() - interval '30 days', 'cierre previo')`,
      [id],
    );
    const before = await planRow(id);

    const service = await connectAs("service_role", id);
    try {
      const { rows } = await service.query(
        "select public.regularize_legacy_profile($1, false, 'CL', 'CL') as result",
        [id],
      );
      const result = rows[0].result;
      assert.equal(result.changed, false, "no se escribe evidencia nueva");
      assert.equal(result.reopened, false);
      assert.equal(result.status, "regularized");
      assert.equal(result.plan_updated, false);
      assert.deepEqual(result.missing_fields_current, []);

      const again = await service.query(
        "select public.regularize_legacy_profile($1, false, 'CL', 'CL') as result",
        [id],
      );
      assert.equal(again.rows[0].result.plan_updated, false, "llamada idempotente");
    } finally {
      await service.end();
    }

    const after = await planRow(id);
    assert.equal(after.status, "regularized");
    assert.equal(
      String(after.resolved_at),
      String(before.resolved_at),
      "un no-op no reescribe el resolved_at de un cierre con evidencia",
    );
  });

  await test("DB-03: reabrir por rotación de versión no conserva el resolved_at viejo", async () => {
    const oldVersion = await declarationVersion();
    const id = await createUser();
    await forceLegacyProfile(id, {
      version: oldVersion,
      declaredAt: new Date(Date.now() - 40 * 86400000),
      residence: "CL",
      nationality: "CL",
    });
    await admin.query(
      `insert into public.profile_regularization_plan
         (user_id, missing_fields, status, resolved_at)
       values ($1, array['us_person_declaration'], 'regularized', now() - interval '30 days')`,
      [id],
    );
    const before = await planRow(id);

    const rotate = await connectAs("service_role");
    try {
      await rotate.query(
        "select public.set_us_person_declaration_version('2026-11-rotacion') as result",
      );
    } finally {
      await rotate.end();
    }

    const service = await connectAs("service_role", id);
    try {
      const { rows } = await service.query(
        "select public.regularize_legacy_profile($1, false, 'CL', 'CL') as result",
        [id],
      );
      const result = rows[0].result;
      assert.equal(result.changed, true, "la versión vieja obliga a declarar otra vez");
      assert.equal(result.version, "2026-11-rotacion");
      assert.equal(result.status, "regularized");
      assert.ok(
        new Date(result.resolved_at).getTime() >
          new Date(before.resolved_at).getTime() + 86400000,
        "resolved_at debe ser el de esta regularización, no el viejo",
      );
    } finally {
      await service.end();
    }

    const row = await profileRow(id);
    assert.equal(row.us_person_declaration_version, "2026-11-rotacion");

    const reset = await connectAs("service_role");
    try {
      await reset.query(
        "select public.set_us_person_declaration_version($1) as result",
        [oldVersion],
      );
    } finally {
      await reset.end();
    }
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
