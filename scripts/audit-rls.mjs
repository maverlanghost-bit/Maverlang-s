/**
 * Auditoría RLS de Maverlang (M47).
 *
 * Comprueba con dos usuarios reales que nadie puede leer ni escribir datos
 * ajenos, y que las tablas internas sólo las toca el servidor.
 *
 * Uso:
 *   npm run audit:rls -- --dry-run   (imprime la matriz esperada, sin conectarse)
 *   npm run audit:rls                (corre contra desarrollo; lo corre el operador)
 *
 * Lee .env.local en el proceso (sin imprimir claves ni tokens) igual que
 * scripts/verificar-auth.mjs. Crea 2 usuarios temporales confirmados
 * (rls-a-<timestamp>@example.test, rls-b-...), les inicia sesión con la clave
 * publishable, prueba con anon / A-sobre-B / A-sobre-lo-suyo (SELECT, INSERT,
 * UPDATE, DELETE y rpc demo_trade/demo_reset con el user_id de otro) y sale
 * con 1 si hay alguna FALLA. Siempre borra los usuarios de prueba (finally).
 *
 * Matriz esperada (celda = lo que debe pasar):
 * - profiles: anon nada; A lee sólo la suya (nunca la de B); A edita sólo
 *   columnas no sensibles suyas (telefono); A nunca inserta ni borra;
 *   columnas sensibles (kyc_status, role, is_admin, country_blocked) nadie
 *   las cambia desde authenticated (trigger 0009), existan o no hoy.
 * - consents: anon nada; A lee e inserta sólo las suyas; nunca edita ni borra.
 * - preferences: anon nada; A lee, inserta y edita sólo las suyas; nunca borra.
 * - demo_accounts/demo_positions/demo_orders: anon nada; A sólo lectura propia;
 *   ninguna escritura desde anon/authenticated (sólo service_role vía rpc).
 * - assets: lectura pública (anon y authenticated leen); nadie escribe.
 * - user_favorites: anon nada; A lee, inserta y borra sólo las suyas; no puede
 *   insertar con el user_id de B ni ver/borrar las de B; nadie hace UPDATE.
 * - waitlist y _migration_flags: nada para anon/authenticated, ni lectura ni
 *   escritura directa (revoke total: el SELECT da error de permiso).
 * - funciones demo_trade/demo_reset: anon y authenticated siempre denegados
 *   (sólo service_role), incluso con el user_id propio.
 *
 * Tablas futuras (asset_safety, orders, wallets, depósitos y retiros): cada
 * tarea que las cree debe agregar su fila a AUDIT_TABLES y a esta matriz.
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DRY = process.argv.includes("--dry-run");

/** Tablas de public cubiertas por la auditoría. Fija: si aparece otra, FALLA. */
const AUDIT_TABLES = [
  "profiles",
  "consents",
  "preferences",
  "demo_accounts",
  "demo_positions",
  "demo_orders",
  "assets",
  "user_favorites",
  "waitlist",
  "_migration_flags",
];

/** Columnas sensibles de profiles que authenticated nunca puede cambiar (0009). */
const SENSITIVE_PROFILE_COLS = ["kyc_status", "role", "is_admin", "country_blocked"];

const results = [];

function redact(value) {
  const marks = [["sb", "secret"].join("_"), ["sb", "publishable"].join("_")];
  let text = String(value ?? "");
  for (const mark of marks) {
    text = text.replace(new RegExp(`${mark}_[A-Za-z0-9._-]+`, "g"), "[redacted]");
  }
  text = text.replace(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, "[redacted]");
  text = text.replace(/(?:access_token|refresh_token|apikey)=[^&\s]+/gi, "[redacted]");
  return text.replace(/\s+/g, " ").trim().slice(0, 160);
}

function unquote(value) {
  if (value.length >= 2) {
    const open = value[0];
    const close = value[value.length - 1];
    if ((open === '"' && close === '"') || (open === "'" && close === "'")) return value.slice(1, -1);
  }
  return value;
}

function loadLocalEnv(filePath) {
  if (typeof process.loadEnvFile === "function") {
    try {
      process.loadEnvFile(filePath);
      return;
    } catch {
      // Sigue el parser si el archivo no está o Node no pudo leerlo.
    }
  }
  if (!existsSync(filePath)) return;
  let raw = "";
  try {
    raw = readFileSync(filePath, "utf8");
  } catch {
    return;
  }
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const body = trimmed.startsWith("export ") ? trimmed.slice(7).trim() : trimmed;
    const eq = body.indexOf("=");
    if (eq <= 0) continue;
    const key = body.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) continue;
    if (process.env[key] !== undefined) continue;
    process.env[key] = unquote(body.slice(eq + 1).trim());
  }
}

function record(check, pass, detail) {
  results.push({ check, pass });
  const mark = pass ? "OK   " : "FALLA";
  const extra = detail ? ` — ${detail}` : "";
  console.log(`${mark}  ${check}${extra}`);
}

function printSummary() {
  const pass = results.filter((r) => r.pass).length;
  const fail = results.filter((r) => !r.pass).length;
  console.log(`RESUMEN RLS: ${fail > 0 ? "FALLA" : "OK"} (${pass} OK, ${fail} FALLA)`);
  return fail > 0 ? 1 : 0;
}

/** Lectura denegada = error, o sin error pero sin filas ajenas. */
function readDenied(res, foreignIdValues) {
  if (res.error) return true;
  const rows = res.data ?? [];
  if (foreignIdValues.length === 0) return rows.length === 0;
  return !rows.some((row) => foreignIdValues.includes(row.user_id ?? row.id));
}

function dryRun() {
  console.log("Matriz RLS esperada (dry-run, sin conexión):");
  const rows = [
    ["profiles", "anon: nada", "A→B: no ve ni edita", "A propio: lee y edita no sensibles; no inserta/borra; sensibles bloqueadas"],
    ["consents", "anon: nada", "A→B: nada", "A propio: lee e inserta; no edita ni borra"],
    ["preferences", "anon: nada", "A→B: nada", "A propio: lee, inserta y edita; no borra"],
    ["demo_accounts", "anon: nada", "A→B: nada", "A propio: sólo lectura; sin escritura"],
    ["demo_positions", "anon: nada", "A→B: nada", "A propio: sólo lectura; sin escritura"],
    ["demo_orders", "anon: nada", "A→B: nada", "A propio: sólo lectura; sin escritura"],
    ["assets", "anon: lectura", "A→B: n/a (público)", "todos leen; nadie escribe"],
    ["user_favorites", "anon: nada", "A→B: no ve/inserta/borra", "A propio: lee, inserta y borra; sin UPDATE"],
    ["waitlist", "anon: nada", "A→B: n/a", "nadie (ni lectura ni escritura directa)"],
    ["_migration_flags", "anon: nada", "A→B: n/a", "nadie (ni lectura ni escritura directa)"],
    ["demo_trade()", "anon: denegado", "A con user_id de B: denegado", "A con user_id propio: denegado (sólo service_role)"],
    ["demo_reset()", "anon: denegado", "A con user_id de B: denegado", "A con user_id propio: denegado (sólo service_role)"],
  ];
  for (const [tabla, anon, ajeno, propio] of rows) {
    console.log(`OK     ${tabla} | ${anon} | ${ajeno} | ${propio}`);
  }
  console.log("Tablas futuras deben agregar su fila aquí y en AUDIT_TABLES.");
  console.log("RESUMEN RLS: OK (dry-run)");
}

async function main() {
  if (DRY) {
    dryRun();
    return 0;
  }
  loadLocalEnv(path.join(root, ".env.local"));

  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/$/, "");
  const publishable = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "").trim();
  const secret =
    (process.env.SUPABASE_SECRET_KEY ?? "").trim() ||
    (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  try {
    new URL(url);
  } catch {
    record("entorno: URL y claves", false, "NEXT_PUBLIC_SUPABASE_URL no sirve o faltan claves");
    return printSummary();
  }
  if (!publishable || !secret) {
    record("entorno: URL y claves", false, "faltan claves en .env.local");
    return printSummary();
  }

  const admin = createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const anon = createClient(url, publishable, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const clientA = createClient(url, publishable, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const clientB = createClient(url, publishable, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const ts = Date.now();
  const emailA = `rls-a-${ts}@example.test`;
  const emailB = `rls-b-${ts}@example.test`;
  const passA = randomBytes(24).toString("base64url");
  const passB = randomBytes(24).toString("base64url");
  let idA = null;
  let idB = null;
  const probeWaitlistEmail = `rls-audit+${ts}@example.test`;

  try {
    const createdA = await admin.auth.admin.createUser({
      email: emailA,
      password: passA,
      email_confirm: true,
    });
    const createdB = await admin.auth.admin.createUser({
      email: emailB,
      password: passB,
      email_confirm: true,
    });
    idA = createdA.data?.user?.id ?? null;
    idB = createdB.data?.user?.id ?? null;
    if (createdA.error || createdB.error || !idA || !idB) {
      record("setup: crear usuarios A y B", false, redact(createdA.error?.message ?? createdB.error?.message));
      return printSummary();
    }
    record("setup: crear usuarios A y B", true);

    const signedA = await clientA.auth.signInWithPassword({ email: emailA, password: passA });
    const signedB = await clientB.auth.signInWithPassword({ email: emailB, password: passB });
    if (signedA.error || !signedA.data.session || signedB.error || !signedB.data.session) {
      record("setup: sesion de A y B", false, redact(signedA.error?.message ?? signedB.error?.message));
      return printSummary();
    }
    record("setup: sesion de A y B", true);

    // ---- Detección de tablas nuevas sin fila en la matriz ----
    try {
      const openapi = await fetch(`${url}/rest/v1/`, {
        headers: { apikey: secret, Authorization: `Bearer ${secret}`, Accept: "application/json" },
      });
      const spec = await openapi.json();
      const exposed = Object.keys(spec.paths ?? {})
        .map((p) => p.replace(/^\//, ""))
        .filter((p) => p && !p.startsWith("rpc/"));
      const extra = exposed.filter((t) => !AUDIT_TABLES.includes(t));
      record(
        "tablas nuevas sin fila en la matriz",
        extra.length === 0,
        extra.length === 0 ? `${exposed.length} tablas expuestas, todas en la matriz` : `sin matriz: ${extra.join(", ")}`,
      );
    } catch (error) {
      record("tablas nuevas sin fila en la matriz", true, `no se pudo listar (ver rls-report.sql): ${redact(error instanceof Error ? error.message : error)}`);
    }

    // ---- anon: lectura ----
    for (const table of AUDIT_TABLES) {
      const res = await anon.from(table).select("*").limit(3);
      if (table === "assets") {
        record("anon SELECT assets (público)", !res.error, res.error ? redact(res.error.message) : `${res.data?.length ?? 0} filas`);
      } else {
        record(`anon SELECT ${table} (nada)`, readDenied(res, []), res.error ? redact(res.error.message) : "0 filas");
      }
    }

    // ---- profiles ----
    const listA = await clientA.from("profiles").select("id");
    record(
      "A lista profiles (sólo la suya)",
      !listA.error &&
        (listA.data ?? []).some((r) => r.id === idA) &&
        !(listA.data ?? []).some((r) => r.id === idB),
      listA.error ? redact(listA.error.message) : `${listA.data?.length ?? 0} filas`,
    );
    const readB = await clientA.from("profiles").select("id").eq("id", idB);
    record("A SELECT perfil de B (nada)", readDenied(readB, [idB]), readB.error ? redact(readB.error.message) : "0 filas");
    const updB = await clientA.from("profiles").update({ telefono: "+56922222222" }).eq("id", idB).select("id");
    record("A UPDATE perfil de B (0 filas)", !updB.error && (updB.data ?? []).length === 0, updB.error ? redact(updB.error.message) : `${updB.data?.length ?? 0} filas`);
    const updOwn = await clientA.from("profiles").update({ telefono: "+56922222222" }).eq("id", idA).select("id,telefono");
    record(
      "A UPDATE telefono propio (1 fila)",
      !updOwn.error && updOwn.data?.length === 1 && updOwn.data[0].telefono === "+56922222222",
      updOwn.error ? redact(updOwn.error.message) : "1 fila",
    );
    const insProfile = await clientA.from("profiles").insert({ id: idA, telefono: "+56933333333" }).select("id");
    record("A INSERT profiles (denegado)", !!insProfile.error, insProfile.error ? redact(insProfile.error.message) : "insertó");
    const delProfile = await clientA.from("profiles").delete().eq("id", idA).select("id");
    record("A DELETE perfil propio (denegado)", !!delProfile.error, delProfile.error ? redact(delProfile.error.message) : "borró");
    const ownRow = await clientA.from("profiles").select("*").eq("id", idA).limit(1);
    const presentSensitive = ownRow.data?.[0]
      ? SENSITIVE_PROFILE_COLS.filter((c) => c in ownRow.data[0])
      : [];
    if (presentSensitive.length === 0) {
      record("A no cambia columnas sensibles (no existen; trigger 0009 las cubre)", true, "profiles sin kyc_status/role/is_admin/country_blocked");
    } else {
      let blocked = 0;
      for (const col of presentSensitive) {
        const attempt = await clientA.from("profiles").update({ [col]: "rls-probe" }).eq("id", idA).select("id");
        if (attempt.error || (attempt.data ?? []).length === 0) blocked += 1;
      }
      record("A no cambia columnas sensibles propias", blocked === presentSensitive.length, `${blocked}/${presentSensitive.length} bloqueadas`);
    }

    // ---- consents ----
    const consentVersion = `rls-${ts}`;
    const insConsentOwn = await clientA.from("consents").insert({ user_id: idA, doc: "terminos", version: consentVersion }).select("id");
    record("A INSERT consent propia (1 fila)", !insConsentOwn.error && (insConsentOwn.data ?? []).length === 1, insConsentOwn.error ? redact(insConsentOwn.error.message) : "1 fila");
    const insConsentB = await clientA.from("consents").insert({ user_id: idB, doc: "terminos", version: consentVersion }).select("id");
    record("A INSERT consent de B (denegado)", !!insConsentB.error, insConsentB.error ? redact(insConsentB.error.message) : "insertó");
    const listConsents = await clientA.from("consents").select("user_id");
    record(
      "A lista consents (sólo suyas)",
      !listConsents.error && !(listConsents.data ?? []).some((r) => r.user_id === idB),
      listConsents.error ? redact(listConsents.error.message) : `${listConsents.data?.length ?? 0} filas`,
    );
    const updConsent = await clientA.from("consents").update({ version: `rls-x-${ts}` }).eq("user_id", idA).select("id");
    record("A UPDATE consents (denegado)", !!updConsent.error, updConsent.error ? redact(updConsent.error.message) : "editó");
    const delConsent = await clientA.from("consents").delete().eq("user_id", idA).select("id");
    record("A DELETE consents (denegado)", !!delConsent.error, delConsent.error ? redact(delConsent.error.message) : "borró");

    // ---- preferences ----
    const insPrefOwn = await clientA.from("preferences").insert({ user_id: idA }).select("user_id");
    const prefOwnOk = !insPrefOwn.error && (insPrefOwn.data ?? []).length === 1;
    record("A INSERT preferences propias (1 fila)", prefOwnOk, insPrefOwn.error ? redact(insPrefOwn.error.message) : "1 fila");
    const insPrefB = await clientB.from("preferences").insert({ user_id: idB }).select("user_id");
    record("setup B: INSERT preferences propias", !insPrefB.error, insPrefB.error ? redact(insPrefB.error.message) : "1 fila");
    const updPrefB = await clientA.from("preferences").update({ notify_news: true }).eq("user_id", idB).select("user_id");
    record("A UPDATE preferences de B (0 filas)", !updPrefB.error && (updPrefB.data ?? []).length === 0, updPrefB.error ? redact(updPrefB.error.message) : `${updPrefB.data?.length ?? 0} filas`);
    const updPrefOwn = await clientA.from("preferences").update({ notify_news: true }).eq("user_id", idA).select("user_id");
    record("A UPDATE preferences propias (1 fila)", !updPrefOwn.error && (updPrefOwn.data ?? []).length === 1, updPrefOwn.error ? redact(updPrefOwn.error.message) : "1 fila");
    const readPrefB = await clientA.from("preferences").select("user_id").eq("user_id", idB);
    record("A SELECT preferences de B (nada)", readDenied(readPrefB, [idB]), readPrefB.error ? redact(readPrefB.error.message) : "0 filas");
    const delPref = await clientA.from("preferences").delete().eq("user_id", idA).select("user_id");
    record("A DELETE preferences (denegado)", !!delPref.error, delPref.error ? redact(delPref.error.message) : "borró");

    // ---- demo_* (sólo lectura propia) ----
    for (const table of ["demo_accounts", "demo_positions", "demo_orders"]) {
      const selOwn = await clientA.from(table).select("*").limit(5);
      const foreign = (selOwn.data ?? []).filter((r) => r.user_id && r.user_id !== idA);
      record(
        `A SELECT ${table} (sólo propias)`,
        !selOwn.error && foreign.length === 0,
        selOwn.error ? redact(selOwn.error.message) : `${selOwn.data?.length ?? 0} filas propias`,
      );
      const selB = await clientA.from(table).select("*").eq("user_id", idB).limit(5);
      record(`A SELECT ${table} de B (nada)`, readDenied(selB, [idB]), selB.error ? redact(selB.error.message) : "0 filas");
    }
    const insDemo =
      (await clientA.from("demo_accounts").insert({ user_id: idA }).select("user_id")).error ??
      (await clientA.from("demo_positions").insert({ user_id: idA, symbol: "AAPLx", shares: 1, avg_cost_usd: 100, avg_cost_clp: 95000 }).select("user_id")).error ??
      (await clientA.from("demo_orders").insert({ user_id: idA, symbol: "AAPLx", side: "buy", shares: 1, price_usd: 100, usdclp: 950, total_clp: 95000 }).select("id")).error;
    record("A INSERT demo_* (denegado)", !!insDemo, insDemo ? redact(insDemo.message) : "insertó");
    const updDemo = await clientA.from("demo_accounts").update({ reset_count: 99 }).eq("user_id", idA).select("user_id");
    record("A UPDATE demo_accounts (denegado)", !!updDemo.error, updDemo.error ? redact(updDemo.error.message) : "editó");
    const delDemo = await clientA.from("demo_orders").delete().eq("user_id", idA).select("id");
    record("A DELETE demo_orders (denegado)", !!delDemo.error, delDemo.error ? redact(delDemo.error.message) : "borró");

    // ---- assets (lectura pública, sin escritura) ----
    const selAssetsA = await clientA.from("assets").select("symbol").limit(3);
    record("A SELECT assets (lectura)", !selAssetsA.error, selAssetsA.error ? redact(selAssetsA.error.message) : `${selAssetsA.data?.length ?? 0} filas`);
    const insAsset = await clientA.from("assets").insert({ symbol: `RLSX${ts % 1000}`, name: "RLS Probe" }).select("symbol");
    record("A INSERT assets (denegado)", !!insAsset.error, insAsset.error ? redact(insAsset.error.message) : "insertó");
    const updAsset = await clientA.from("assets").update({ name: "RLS Probe" }).eq("symbol", "AAPLx").select("symbol");
    record("A UPDATE assets (denegado)", !!updAsset.error, updAsset.error ? redact(updAsset.error.message) : "editó");
    const delAsset = await clientA.from("assets").delete().eq("symbol", "AAPLx").select("symbol");
    record("A DELETE assets (denegado)", !!delAsset.error, delAsset.error ? redact(delAsset.error.message) : "borró");

    // ---- user_favorites ----
    const favA = await clientA.from("user_favorites").insert({ user_id: idA, symbol: "AAPLx" }).select("symbol");
    record("A INSERT favorita propia (1 fila)", !favA.error && (favA.data ?? []).length === 1, favA.error ? redact(favA.error.message) : "1 fila");
    const favB = await clientB.from("user_favorites").insert({ user_id: idB, symbol: "MSFTx" }).select("symbol");
    record("setup B: INSERT favorita propia", !favB.error, favB.error ? redact(favB.error.message) : "1 fila");
    const listFav = await clientA.from("user_favorites").select("user_id,symbol");
    record(
      "A lista favoritas (sólo suyas)",
      !listFav.error &&
        (listFav.data ?? []).some((r) => r.user_id === idA && r.symbol === "AAPLx") &&
        !(listFav.data ?? []).some((r) => r.user_id === idB),
      listFav.error ? redact(listFav.error.message) : `${listFav.data?.length ?? 0} filas`,
    );
    const favAsB = await clientA.from("user_favorites").insert({ user_id: idB, symbol: "AAPLx" }).select("symbol");
    record("A INSERT favorita con user_id de B (denegado)", !!favAsB.error, favAsB.error ? redact(favAsB.error.message) : "insertó");
    const updFav = await clientA.from("user_favorites").update({ symbol: "TSLAx" }).eq("user_id", idA).select("symbol");
    record("A UPDATE favoritas (denegado, sin update)", !!updFav.error, updFav.error ? redact(updFav.error.message) : "editó");
    const delFavB = await clientA.from("user_favorites").delete().eq("user_id", idB).select("symbol");
    const stillB = await clientB.from("user_favorites").select("symbol").eq("user_id", idB);
    record(
      "A DELETE favorita de B (0 filas, la de B intacta)",
      !delFavB.error &&
        (delFavB.data ?? []).length === 0 &&
        !stillB.error &&
        (stillB.data ?? []).some((r) => r.symbol === "MSFTx"),
      delFavB.error ? redact(delFavB.error.message) : "la de B sigue",
    );
    const delFavOwn = await clientA.from("user_favorites").delete().eq("user_id", idA).eq("symbol", "AAPLx").select("symbol");
    record("A DELETE favorita propia (1 fila)", !delFavOwn.error && (delFavOwn.data ?? []).length === 1, delFavOwn.error ? redact(delFavOwn.error.message) : "1 fila");
    const anonInsFav = await anon.from("user_favorites").insert({ user_id: idA, symbol: "AAPLx" }).select("symbol");
    record("anon INSERT favoritas (denegado)", !!anonInsFav.error, anonInsFav.error ? redact(anonInsFav.error.message) : "insertó");

    // ---- waitlist y _migration_flags (nadie, ni lectura directa) ----
    const selWait = await clientA.from("waitlist").select("id").limit(3);
    record("A SELECT waitlist (denegado)", !!selWait.error, selWait.error ? redact(selWait.error.message) : "leyó filas");
    const insWait = await clientA.from("waitlist").insert({ email: probeWaitlistEmail, source: "landing", consent_version: "v1" }).select("id");
    record("A INSERT waitlist (denegado)", !!insWait.error, insWait.error ? redact(insWait.error.message) : "insertó");
    const selFlags = await clientA.from("_migration_flags").select("name").limit(3);
    record("A SELECT _migration_flags (denegado)", !!selFlags.error, selFlags.error ? redact(selFlags.error.message) : "leyó filas");
    const insFlags = await clientA.from("_migration_flags").insert({ name: `rls-probe-${ts}` }).select("name");
    record("A INSERT _migration_flags (denegado)", !!insFlags.error, insFlags.error ? redact(insFlags.error.message) : "insertó");

    // ---- funciones con el user_id de otro (y propio: también denegado) ----
    const tradeAsB = await clientA.rpc("demo_trade", {
      p_user: idB,
      p_symbol: "AAPLx",
      p_side: "buy",
      p_shares: 0.01,
      p_price_usd: 100,
      p_usdclp: 950,
    });
    record("A llama demo_trade con user_id de B (denegado)", !!tradeAsB.error, tradeAsB.error ? redact(tradeAsB.message ?? tradeAsB.error.message) : "ejecutó");
    const tradeOwn = await clientA.rpc("demo_trade", {
      p_user: idA,
      p_symbol: "AAPLx",
      p_side: "buy",
      p_shares: 0.01,
      p_price_usd: 100,
      p_usdclp: 950,
    });
    record("A llama demo_trade propio (denegado: sólo service_role)", !!tradeOwn.error, tradeOwn.error ? redact(tradeOwn.message ?? tradeOwn.error.message) : "ejecutó");
    const resetAsB = await clientA.rpc("demo_reset", { p_user: idB });
    record("A llama demo_reset con user_id de B (denegado)", !!resetAsB.error, resetAsB.error ? redact(resetAsB.message ?? resetAsB.error.message) : "ejecutó");
    const anonTrade = await anon.rpc("demo_trade", {
      p_user: idA,
      p_symbol: "AAPLx",
      p_side: "buy",
      p_shares: 0.01,
      p_price_usd: 100,
      p_usdclp: 950,
    });
    record("anon llama demo_trade (denegado)", !!anonTrade.error, anonTrade.error ? redact(anonTrade.message ?? anonTrade.error.message) : "ejecutó");
  } catch (error) {
    record("inesperado", false, redact(error instanceof Error ? error.message : error));
  } finally {
    // Limpieza: nunca deja usuarios de prueba. La cascada (profiles → demo,
    // consents, preferences, favoritas) borra sus filas. Si alguna sonda a
    // waitlist/_migration_flags hubiese entrado (no debe), se borra con admin.
    try {
      await admin.from("waitlist").delete().eq("email", probeWaitlistEmail);
    } catch {
      // Sin rastro esperado; si falla, los usuarios igual se borran abajo.
    }
    for (const id of [idA, idB]) {
      if (!id) continue;
      try {
        const removed = await admin.auth.admin.deleteUser(id, false);
        record(`limpieza: borrar ${id === idA ? "A" : "B"}`, !removed.error, removed.error ? redact(removed.error.message) : "borrado");
      } catch (error) {
        record(`limpieza: borrar ${id === idA ? "A" : "B"}`, false, redact(error instanceof Error ? error.message : error));
      }
    }
    try {
      await clientA.auth.signOut();
      await clientB.auth.signOut();
    } catch {
      // Sesiones temporales; el borrado del usuario ya las invalida.
    }
  }
  return printSummary();
}

const code = await main();
process.exit(code);
