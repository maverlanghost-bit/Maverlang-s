/**
 * Arnés de la migración 0051 (libro de retiros `public.wallet_withdrawals`)
 * sobre PostgreSQL 17 embebido.
 *
 * - Levanta un PostgreSQL 17 en 127.0.0.1 con un puerto libre y un directorio
 *   temporal propio (`persistent: false` lo borra al parar). No usa Docker,
 *   no usa `psql`, no se conecta a ninguna base existente y no lee `.env`.
 * - Replica el entorno mínimo de Supabase con el mismo stub que
 *   `run-migration-chain-tests.mjs`: roles anon/authenticated/service_role/
 *   supabase_auth_admin, esquema auth, auth.users, auth.mfa_factors,
 *   auth.uid(), auth.jwt() y los privilegios por defecto del proyecto.
 * - Aplica TODAS las migraciones 0001..0051 en orden y después verifica
 *   RLS, privilegios de tabla/funciones y el comportamiento real de las
 *   cuatro RPC de retiros: reserva, liberación de la reserva anterior,
 *   topes por orden/diario/mensual, reclamo idempotente del envío, cierre y
 *   lectura por requestId o por id.
 *
 * Por qué se prueba contra `service_role` y no como superusuario:
 * las funciones de 0051 son SECURITY INVOKER, es decir corren con los
 * privilegios del rol que las llama. El store real
 * (`lib/services/withdrawals.supabase.ts`) las invoca con la service key, así
 * que la conexión de comportamiento hace `set role service_role`: probar como
 * `postgres` escondería un `permission denied` que en producción sí ocurriría.
 *
 * Requisito: `embedded-postgres` y `pg` instalados FUERA del proyecto (no se
 * toca package.json). Ver supabase/tests/README.md / PG_HARNESS_DIR.
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

const DB = "maverlang_withdrawal_0051_test";
const PASSWORD = "postgres";

// 0001..0051: la cadena cambia con cada migración nueva, así que el número
// esperado se afirma explícitamente para que un archivo faltante o un
// duplicado no pase en silencio.
const EXPECTED_MIGRATIONS = 42;
const LAST_MIGRATION_PREFIX = /^0051_/;

const MIGRATION_FILES = readdirSync(MIGRATIONS)
  .filter((name) => /^\d{4}_.*\.sql$/.test(name))
  .sort();

const USER_A = "44444444-4444-4444-8444-444444444444";
const USER_B = "55555555-5555-4555-8555-555555555555";

// Valores con forma real de Solana (base58) para que las restricciones de
// formato de 0051 se ejerzan igual que en producción.
const MINT = "So11111111111111111111111111111111111111112";
const SYMBOL = "AAPLx";
const SOURCE = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const DESTINATION = "5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1";
const SIGNATURE =
  "5VERv8NMvzbJMEkV8xnrLkEaWRtSz9CosKDYjCJjBRnbJLgp8uirBgmQpjKhoR4tjF3ZpRzrFmBV6UjKdiSZkQUW";
const TX_BASE64 = "AQIDBAUGBwgJCgsMDQ4PEA==";

// Firmas completas: `has_function_privilege` resuelve por firma, y si 0051
// agrega un parámetro o cambia un tipo estos asserts deben fallar, no pasar
// por nombre parecido.
const FN_RESERVE =
  "public.reserve_wallet_withdrawal(uuid,text,text,text,text,text,text,numeric,numeric,text,timestamptz)";
const FN_CLAIM = "public.claim_wallet_withdrawal_submit(uuid,text,text)";
const FN_FINALIZE = "public.finalize_wallet_withdrawal(uuid,text,text,text,text)";
const FN_READ = "public.read_wallet_withdrawal(uuid,text)";
const WITHDRAWAL_FUNCTIONS = [FN_RESERVE, FN_CLAIM, FN_FINALIZE, FN_READ];

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
-- public nacen con grants para los roles y cada migración recorta. Sin esto
-- el revoke de 0051 sería un no-op y la prueba no probaría nada.
alter default privileges for role postgres in schema public
  grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all on sequences to postgres, anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant all on functions to postgres, anon, authenticated, service_role;
`;

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

const port = await freePort();
const dataDir = path.join(os.tmpdir(), `maverlang-withdrawal-pg-${process.pid}-${Date.now()}`);
const pg = new EmbeddedPostgres({
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

/**
 * Conexión de comportamiento: `set role service_role` porque las funciones de
 * 0051 son SECURITY INVOKER y el store real las llama con ese rol. Si algún
 * `grant` de la migración faltara, acá se ve; como `postgres` no se vería.
 */
async function connectAsServiceRole() {
  const client = await connect();
  await client.query("set role service_role");
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

async function functionPriv(role, fn) {
  const { rows } = await admin.query(
    "select has_function_privilege($1, $2, 'execute') as ok",
    [role, fn],
  );
  return rows[0].ok;
}

/**
 * Alta de usuario de prueba. El perfil lo crea `handle_new_user` (0046); si
 * por lo que sea no quedó, se inserta a mano con el mismo id para que la FK
 * `wallet_withdrawals.user_id -> profiles(id)` no bloquee el arnés.
 */
async function seedUser(userId, email) {
  await admin.query("insert into auth.users (id, email) values ($1, $2)", [userId, email]);
  const { rows } = await admin.query("select 1 from public.profiles where id = $1", [userId]);
  if (rows.length === 0) {
    await admin.query("insert into public.profiles (id, email) values ($1, $2)", [
      userId,
      email,
    ]);
  }
}

async function resetWithdrawals(userId) {
  await admin.query("delete from public.wallet_withdrawals where user_id = $1", [userId]);
}

async function withdrawalRows(userId) {
  const { rows } = await admin.query(
    "select * from public.wallet_withdrawals where user_id = $1 order by created_at, id",
    [userId],
  );
  return rows;
}

async function withdrawalByRequest(userId, requestId) {
  const { rows } = await admin.query(
    "select * from public.wallet_withdrawals where user_id = $1 and request_id = $2",
    [userId, requestId],
  );
  return rows[0];
}

/**
 * El contrato compartido fija la interfaz TypeScript, no los nombres de
 * columna que devuelven las RPC (0051 usa `withdrawal_id`, `withdrawal_status`
 * y `withdrawal_signature` en el reclamo). Se aceptan las variantes
 * razonables para que un renombre no rompa el arnés por un detalle de alias
 * que no cambia el comportamiento.
 */
function pick(row, names) {
  for (const name of names) {
    if (row[name] !== undefined && row[name] !== null) return row[name];
  }
  return undefined;
}

const rowId = (row) => pick(row, ["withdrawal_id", "id"]);
const rowExpiresAt = (row) => pick(row, ["expires_at", "reserved_expires_at"]);
const rowClaimed = (row) => pick(row, ["claimed", "was_claimed"]);
const rowSignature = (row) =>
  pick(row, ["withdrawal_signature", "signature", "stored_signature"]);

function withdrawalInput(userId, requestId, overrides = {}) {
  const amountUsd = overrides.amountUsd ?? 10;
  return {
    userId,
    requestId,
    reference: `ref-${requestId}`,
    mint: MINT,
    symbol: SYMBOL,
    sourceAddress: SOURCE,
    destinationAddress: DESTINATION,
    amountUi: overrides.amountUi ?? amountUsd,
    amountUsd,
    builtTransactionBase64: TX_BASE64,
    expiresAt:
      overrides.expiresAt ?? new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  };
}

async function reserve(input) {
  const { rows } = await rpc.query(
    `select * from public.reserve_wallet_withdrawal($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      input.userId,
      input.requestId,
      input.reference,
      input.mint,
      input.symbol,
      input.sourceAddress,
      input.destinationAddress,
      input.amountUi,
      input.amountUsd,
      input.builtTransactionBase64,
      input.expiresAt,
    ],
  );
  return rows[0];
}

async function claim(userId, requestId, signature) {
  const { rows } = await rpc.query(
    "select * from public.claim_wallet_withdrawal_submit($1,$2,$3)",
    [userId, requestId, signature],
  );
  return rows[0];
}

async function finalize(userId, requestId, status, signature, error) {
  const { rows } = await rpc.query(
    "select * from public.finalize_wallet_withdrawal($1,$2,$3,$4,$5)",
    [userId, requestId, status, signature, error],
  );
  return rows[0];
}

async function read(userId, requestIdOrId) {
  const { rows } = await rpc.query(
    "select * from public.read_wallet_withdrawal($1,$2)",
    [userId, requestIdOrId],
  );
  return rows[0];
}

/**
 * Fila insertada directamente para simular gasto ya ejecutado (los topes
 * diario/mensual no se pueden agotar sólo con reservas vivas, porque la
 * reserva nueva libera la anterior). `created_at` queda en `now()`: cuenta
 * como gasto de hoy.
 */
async function insertSpentRow({ userId, requestId, status, amountUsd }) {
  await admin.query(
    `insert into public.wallet_withdrawals (
       user_id, request_id, reference, mint, symbol, source_address,
       destination_address, amount_ui, amount_usd, built_transaction_base64,
       status, signature, expires_at
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now() + interval '30 minutes')`,
    [
      userId,
      requestId,
      `ref-${requestId}`,
      MINT,
      SYMBOL,
      SOURCE,
      DESTINATION,
      amountUsd,
      amountUsd,
      TX_BASE64,
      status,
      SIGNATURE,
    ],
  );
}

/**
 * Gasto confirmado a principios del mes en curso (12:00 de Santiago del día 1)
 * para agotar el tope mensual sin tocar el diario. Sólo el día 1 esa marca cae
 * dentro de la ventana diaria; en ese caso la función evalúa el tope mensual
 * antes del diario (mismo orden que 0047) y el error sigue siendo
 * MV_LIMIT_MONTHLY.
 */
async function insertMonthlySpentRow({ userId, requestId, amountUsd }) {
  const monthStart =
    "(date_trunc('month', now() at time zone 'America/Santiago') + interval '12 hours') at time zone 'America/Santiago'";
  await admin.query(
    `insert into public.wallet_withdrawals (
       user_id, request_id, reference, mint, symbol, source_address,
       destination_address, amount_ui, amount_usd, built_transaction_base64,
       status, signature, created_at, expires_at
     ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'confirmed',$11, ${monthStart}, ${monthStart} + interval '30 minutes')`,
    [
      userId,
      requestId,
      `ref-${requestId}`,
      MINT,
      SYMBOL,
      SOURCE,
      DESTINATION,
      amountUsd,
      amountUsd,
      TX_BASE64,
      SIGNATURE,
    ],
  );
}

let admin;
let rpc;

try {
  await pg.initialise();
  await pg.start();
  await pg.createDatabase(DB);

  admin = await connect();
  await applySql(admin, SUPABASE_STUB, "stub Supabase");

  // -------------------------------------------------------------------------
  // Cadena completa 0001..0051, en orden. Si una migración falla se detiene
  // acá y se reporta el archivo exacto: probar sobre un esquema incompleto no
  // diría nada sobre 0051.
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

  if (applied.length === MIGRATION_FILES.length) {
    // Se afirma fuera de `test()` a propósito: es precondición de todo lo
    // demás, no un check más del libro de retiros.
    assert.equal(
      MIGRATION_FILES.length,
      EXPECTED_MIGRATIONS,
      `la cadena cambió: se esperaban ${EXPECTED_MIGRATIONS} migraciones (0001..0051) y hay ${MIGRATION_FILES.length}`,
    );
    assert.match(
      MIGRATION_FILES.at(-1),
      LAST_MIGRATION_PREFIX,
      `la última migración debe ser 0051, es ${MIGRATION_FILES.at(-1)}`,
    );
    assert.match(MIGRATION_FILES[0], /^0001_/);
    assert.deepEqual(applied, MIGRATION_FILES, "la cadena no se aplicó completa y en orden");
    console.log(`APPLY ${applied.length}/${EXPECTED_MIGRATIONS} migraciones`);

    await seedUser(USER_A, "withdraw-a@example.test");
    await seedUser(USER_B, "withdraw-b@example.test");

    // La conexión de comportamiento entra recién acá: antes no existían ni la
    // tabla ni las funciones de 0051.
    rpc = await connectAsServiceRole();

    // -----------------------------------------------------------------------
    // 1. RLS habilitada y forzada.
    // -----------------------------------------------------------------------
    await test("wallet_withdrawals tiene RLS habilitada y forzada", async () => {
      const { rows } = await admin.query(
        "select relrowsecurity, relforcerowsecurity from pg_class where oid = $1::regclass",
        ["public.wallet_withdrawals"],
      );
      assert.equal(rows.length, 1, "no existe public.wallet_withdrawals");
      assert.equal(rows[0].relrowsecurity, true, "RLS no habilitada");
      // FORCE evita que el dueño de la tabla (el rol de migraciones) salte las
      // políticas; sin FORCE una consulta del dueño vería filas ajenas.
      assert.equal(rows[0].relforcerowsecurity, true, "RLS no forzada");
    });

    // -----------------------------------------------------------------------
    // 2. Privilegios de tabla: clientes sin acceso, sólo service_role.
    // -----------------------------------------------------------------------
    await test("anon y authenticated no tocan la tabla; service_role sí", async () => {
      for (const role of ["anon", "authenticated"]) {
        for (const privilege of ["SELECT", "INSERT", "UPDATE", "DELETE"]) {
          assert.equal(
            await tablePriv(role, "public.wallet_withdrawals", privilege),
            false,
            `${role} no debería tener ${privilege} sobre wallet_withdrawals`,
          );
        }
      }
      for (const privilege of ["SELECT", "INSERT", "UPDATE"]) {
        assert.equal(
          await tablePriv("service_role", "public.wallet_withdrawals", privilege),
          true,
          `service_role necesita ${privilege} para que las funciones SECURITY INVOKER funcionen`,
        );
      }
    });

    // -----------------------------------------------------------------------
    // 3. Privilegios de funciones con firma completa.
    // -----------------------------------------------------------------------
    await test("las cuatro funciones de 0051 sólo las ejecuta service_role", async () => {
      for (const fn of WITHDRAWAL_FUNCTIONS) {
        assert.equal(await functionPriv("service_role", fn), true, `service_role debería poder ejecutar ${fn}`);
        assert.equal(await functionPriv("anon", fn), false, `anon no debería ejecutar ${fn}`);
        assert.equal(
          await functionPriv("authenticated", fn),
          false,
          `authenticated no debería ejecutar ${fn}`,
        );
      }
    });

    // -----------------------------------------------------------------------
    // 4. Reserva feliz: devuelve id y vencimiento y persiste los montos.
    // -----------------------------------------------------------------------
    await test("reserve_wallet_withdrawal reserva y guarda los montos exactos", async () => {
      await resetWithdrawals(USER_A);
      const result = await reserve(
        withdrawalInput(USER_A, "wd-reserve-1", { amountUi: 2.5, amountUsd: 125.5 }),
      );

      const id = rowId(result);
      assert.ok(id, "la reserva debe devolver el id de la fila");
      assert.match(String(id), /^[0-9a-f-]{36}$/i, `id inesperado: ${id}`);
      const expiresAt = rowExpiresAt(result);
      assert.ok(expiresAt, "la reserva debe devolver expires_at");
      assert.ok(new Date(expiresAt).getTime() > Date.now(), "expires_at debe estar en el futuro");

      const row = await withdrawalByRequest(USER_A, "wd-reserve-1");
      assert.ok(row, "no se insertó la fila de retiro");
      assert.equal(row.id, id, "el id devuelto no es el de la fila");
      assert.equal(row.status, "reserved");
      assert.equal(Number(row.amount_ui), 2.5);
      assert.equal(Number(row.amount_usd), 125.5);
      assert.equal(row.reference, "ref-wd-reserve-1");
      assert.equal(row.mint, MINT);
      assert.equal(row.symbol, SYMBOL);
      assert.equal(row.source_address, SOURCE);
      assert.equal(row.destination_address, DESTINATION);
      assert.equal(Number(row.amount_usd), 125.5, "amount_usd se redondea a 2 decimales");
    });

    // -----------------------------------------------------------------------
    // 5. Una sola reserva viva por usuario: la nueva libera la anterior.
    // -----------------------------------------------------------------------
    await test("una segunda reserva libera la anterior y deja una sola viva", async () => {
      await resetWithdrawals(USER_A);
      const first = await reserve(withdrawalInput(USER_A, "wd-rel-1", { amountUsd: 120 }));
      const second = await reserve(withdrawalInput(USER_A, "wd-rel-2", { amountUsd: 80 }));
      assert.notEqual(rowId(first), rowId(second), "la segunda reserva debe ser una fila nueva");

      const rows = await withdrawalRows(USER_A);
      assert.equal(rows.length, 2, "la reserva liberada no se borra: es traza de auditoría");
      const byRequest = new Map(rows.map((row) => [row.request_id, row]));
      assert.equal(byRequest.get("wd-rel-1").status, "released", "la primera debía quedar liberada");
      assert.equal(byRequest.get("wd-rel-2").status, "reserved");
      assert.equal(
        rows.filter((row) => row.status === "reserved").length,
        1,
        "no puede quedar más de una reserva viva por usuario",
      );
    });

    // -----------------------------------------------------------------------
    // 6. Tope por operación: US$500.
    // -----------------------------------------------------------------------
    await test("rechaza una operación de más de US$500 con MV_LIMIT_ORDER", async () => {
      await resetWithdrawals(USER_A);
      // 0051 pone un techo duro de US$500 por retiro (least con el tope del
      // usuario/app_flags, que viene sembrado en US$200 por 0028). US$501
      // rebota con MV_LIMIT_ORDER en cualquier caso, y como el usuario está
      // limpio el rechazo no puede venir del tope diario ni del mensual.
      await expectSqlError(
        () =>
          rpc.query(
            `select * from public.reserve_wallet_withdrawal($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
            [
              USER_A,
              "wd-limit-order",
              "ref-wd-limit-order",
              MINT,
              SYMBOL,
              SOURCE,
              DESTINATION,
              501,
              501,
              TX_BASE64,
              new Date(Date.now() + 10 * 60 * 1000).toISOString(),
            ],
          ),
        /MV_LIMIT_ORDER/,
        "reserva de US$501",
      );

      const rows = await withdrawalRows(USER_A);
      assert.equal(rows.length, 0, "una reserva rechazada no debe dejar fila");
    });

    // -----------------------------------------------------------------------
    // 7. Tope diario: US$500.
    // Escenario: hoy ya hay US$400 enviados (fila 'submitted' insertada
    // directamente, como la dejaría un envío en curso) y se intenta reservar
    // US$150 → US$550 > US$500. Ninguno de los dos montos supera el tope por
    // operación, así que el único tope que puede dispararse es el diario.
    // -----------------------------------------------------------------------
    await test("rechaza superar el tope diario de US$500 con MV_LIMIT_DAILY", async () => {
      await resetWithdrawals(USER_B);
      await insertSpentRow({
        userId: USER_B,
        requestId: "wd-day-spent",
        status: "submitted",
        amountUsd: 400,
      });

      await expectSqlError(
        () =>
          rpc.query(
            `select * from public.reserve_wallet_withdrawal($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
            [
              USER_B,
              "wd-limit-day",
              "ref-wd-limit-day",
              MINT,
              SYMBOL,
              SOURCE,
              DESTINATION,
              150,
              150,
              TX_BASE64,
              new Date(Date.now() + 10 * 60 * 1000).toISOString(),
            ],
          ),
        /MV_LIMIT_DAILY/,
        "US$400 enviados + reserva de US$150",
      );

      await resetWithdrawals(USER_B);
    });

    // -----------------------------------------------------------------------
    // 8. Tope mensual: US$2000.
    // Escenario: cuatro filas 'confirmed' de US$500 a principios del mes
    // (fuera de la ventana de hoy, salvo el día 1) acumulan US$2000; una
    // reserva de US$100 quedaría en US$2100. El monto por operación (US$100)
    // y el gasto de hoy (US$0) quedan dentro de sus topes.
    // -----------------------------------------------------------------------
    await test("rechaza superar el tope mensual de US$2000 con MV_LIMIT_MONTHLY", async () => {
      await resetWithdrawals(USER_B);
      for (let index = 0; index < 4; index += 1) {
        await insertMonthlySpentRow({
          userId: USER_B,
          requestId: `wd-month-spent-${index}`,
          amountUsd: 500,
        });
      }

      await expectSqlError(
        () =>
          rpc.query(
            `select * from public.reserve_wallet_withdrawal($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
            [
              USER_B,
              "wd-limit-month",
              "ref-wd-limit-month",
              MINT,
              SYMBOL,
              SOURCE,
              DESTINATION,
              100,
              100,
              TX_BASE64,
              new Date(Date.now() + 10 * 60 * 1000).toISOString(),
            ],
          ),
        /MV_LIMIT_MONTHLY/,
        "US$2000 confirmados + reserva de US$100",
      );

      await resetWithdrawals(USER_B);
    });

    // -----------------------------------------------------------------------
    // 9. Reclamo del envío: idempotente, una sola firma.
    // -----------------------------------------------------------------------
    await test("claim_wallet_withdrawal_submit reclama una vez y conserva la firma", async () => {
      await resetWithdrawals(USER_A);
      await reserve(withdrawalInput(USER_A, "wd-claim-1", { amountUsd: 60 }));

      const first = await claim(USER_A, "wd-claim-1", SIGNATURE);
      assert.equal(rowClaimed(first), true, "el primer llamado debe reclamar la fila");
      assert.equal(first.status ?? pick(first, ["withdrawal_status"]), "submitted");
      assert.equal(rowSignature(first), SIGNATURE, "la firma reclamada debe ser la enviada");

      const row = await withdrawalByRequest(USER_A, "wd-claim-1");
      assert.equal(row.status, "submitted");
      assert.equal(row.signature, SIGNATURE);

      // Segundo intento con OTRA firma: no se reenvía, no se reescribe y la
      // firma que se devuelve es la primera (la que realmente salió a la red).
      const otherSignature = `${SIGNATURE.slice(0, -1)}2`;
      const second = await claim(USER_A, "wd-claim-1", otherSignature);
      assert.equal(rowClaimed(second), false, "una firma ya reclamada no se reclama de nuevo");
      assert.equal(
        rowSignature(second),
        SIGNATURE,
        "el segundo llamado debe devolver la firma original, no la nueva",
      );

      const after = await withdrawalByRequest(USER_A, "wd-claim-1");
      assert.equal(after.signature, SIGNATURE, "la firma guardada no se reescribe");
      assert.equal(after.status, "submitted");
    });

    // -----------------------------------------------------------------------
    // 10. Cierre: 'confirmed', confirmed_at cargado y firma conservada.
    // -----------------------------------------------------------------------
    await test("finalize_wallet_withdrawal confirma y conserva la firma si p_signature es null", async () => {
      await resetWithdrawals(USER_A);
      await reserve(withdrawalInput(USER_A, "wd-final-1", { amountUsd: 70 }));
      await claim(USER_A, "wd-final-1", SIGNATURE);

      const result = await finalize(USER_A, "wd-final-1", "confirmed", null, null);
      // El contrato del store es un booleano; no se fija el nombre de la
      // columna de retorno, pero sí que diga true.
      assert.ok(
        Object.values(result).some((value) => value === true),
        `finalize debía devolver true: ${JSON.stringify(result)}`,
      );

      const row = await withdrawalByRequest(USER_A, "wd-final-1");
      assert.equal(row.status, "confirmed");
      assert.ok(row.confirmed_at, "confirmed_at no puede quedar nulo al confirmar");
      assert.ok(new Date(row.confirmed_at).getTime() <= Date.now() + 1000);
      assert.equal(
        row.signature,
        SIGNATURE,
        "con p_signature null se conserva la firma ya reclamada",
      );
      assert.equal(row.error, null);
    });

    // -----------------------------------------------------------------------
    // 11. Lectura acotada por requestId y por id en texto.
    // -----------------------------------------------------------------------
    await test("read_wallet_withdrawal lee por request_id y por id::text", async () => {
      await resetWithdrawals(USER_A);
      const reserved = await reserve(withdrawalInput(USER_A, "wd-read-1", { amountUsd: 90 }));
      const id = String(rowId(reserved));

      const byRequest = await read(USER_A, "wd-read-1");
      assert.ok(byRequest, "no se encontró la fila por request_id");
      assert.equal(String(rowId(byRequest)), id);
      assert.equal(byRequest.request_id ?? pick(byRequest, ["withdrawal_request_id"]), "wd-read-1");
      assert.equal(byRequest.status ?? pick(byRequest, ["withdrawal_status"]), "reserved");
      assert.equal(Number(byRequest.amount_usd), 90);
      assert.equal(byRequest.symbol, SYMBOL);
      assert.equal(byRequest.mint, MINT);

      const byId = await read(USER_A, id);
      assert.ok(byId, "no se encontró la fila por id::text");
      assert.equal(String(rowId(byId)), id);
      assert.equal(byId.request_id ?? pick(byId, ["withdrawal_request_id"]), "wd-read-1");

      // La lectura va filtrada por usuario: el mismo id con otro usuario no
      // devuelve nada.
      const { rows: foreign } = await rpc.query(
        "select * from public.read_wallet_withdrawal($1,$2)",
        [USER_B, id],
      );
      assert.equal(foreign.length, 0, "otro usuario no puede leer el retiro");
    });
  }
} catch (error) {
  failures.push({ name: "arnés", error });
  console.error(`FAIL  arnés: ${String(error.message ?? error)}`);
} finally {
  if (rpc) {
    await rpc.end().catch(() => {});
  }
  if (admin) {
    await admin.end().catch(() => {});
  }
  await pg.stop().catch(() => {});
}

console.log("");
if (failures.length > 0) {
  console.log(`FALLARON ${failures.length} de ${passed + failures.length} checks.`);
  for (const failure of failures) {
    console.log(`- ${failure.name}: ${String(failure.error.message ?? failure.error)}`);
  }
  process.exit(1);
}

console.log(`OK ${passed}/${passed}`);
process.exit(0);
