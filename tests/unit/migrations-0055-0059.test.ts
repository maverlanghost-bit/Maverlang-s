import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..", "..");
const read = (name: string) => readFileSync(path.join(ROOT, "supabase/migrations", name), "utf8");

const SQL_0053 = read("0053_copy_trading.sql");
const SQL_0055 = read("0055_copy_follows_lockdown.sql");
const SQL_0056 = read("0056_mfa_restrictive.sql");
const SQL_0057 = read("0057_user_write_caps.sql");
const SQL_0058 = read("0058_account_deletion.sql");
const SQL_0059 = read("0059_integrity.sql");

describe("0053 — restaurada a la versión publicada", () => {
  it("conserva las políticas de escritura originales (el cierre vive en 0055)", () => {
    expect(SQL_0053).toMatch(/copy_follows_insert_own/);
    expect(SQL_0053).toMatch(/grant select, insert, update, delete on table public\.copy_follows to authenticated/i);
  });

  it("coincide byte a byte con el commit publicado 1ad3224 (salvo fin de línea)", () => {
    let published: string;
    try {
      published = execFileSync("git", ["show", "1ad3224:supabase/migrations/0053_copy_trading.sql"], {
        cwd: ROOT,
        encoding: "utf8",
      });
    } catch {
      return; // sin historial git (p. ej. CI con clon superficial)
    }
    expect(SQL_0053.replace(/\r\n/g, "\n")).toBe(published.replace(/\r\n/g, "\n"));
  });
});

describe("0055 — cierre de escritura de copy_follows", () => {
  it("quita políticas y grants de escritura del cliente", () => {
    for (const p of ["insert", "update", "delete"]) {
      expect(SQL_0055).toMatch(new RegExp(`drop policy if exists "copy_follows_${p}_own"`, "i"));
    }
    expect(SQL_0055).toMatch(/revoke all on table public\.copy_follows from public, anon, authenticated/i);
    expect(SQL_0055).toMatch(/grant select on table public\.copy_follows to authenticated/i);
    expect(SQL_0055).not.toMatch(/grant [^;]*insert[^;]*to authenticated/i);
  });

  it("fuerza RLS en las tablas de copy y billing", () => {
    for (const t of ["copy_subscriptions", "billing_events", "copy_follows", "copy_runs", "copy_feed_snapshots"]) {
      expect(SQL_0055).toMatch(new RegExp(`alter table public\\.${t} force row level security`, "i"));
    }
  });
});

describe("0056 — MFA restrictivo", () => {
  it("crea políticas restrictivas for all con with check para cada tabla de usuario", () => {
    expect(SQL_0056).toMatch(/as restrictive for all to authenticated/i);
    expect(SQL_0056).toMatch(/using \(not public\.mfa_step_pending\(\)\)/i);
    expect(SQL_0056).toMatch(/with check \(not public\.mfa_step_pending\(\)\)/i);
    expect(SQL_0056).toMatch(/drop policy if exists %I on public\.%I/i);
    for (const t of [
      "profiles", "consents", "preferences", "price_alerts", "external_holdings",
      "user_favorites", "demo_accounts", "demo_positions", "demo_orders",
      "copy_subscriptions", "copy_runs", "copy_follows", "user_limits", "beta_users",
    ]) {
      expect(SQL_0056).toContain(`'${t}'`);
    }
  });

  it("update_my_profile se parchea desde la definición vigente con el chequeo MFA", () => {
    expect(SQL_0056).toMatch(/pg_get_functiondef\('public\.update_my_profile\(jsonb\)'::regprocedure\)/);
    expect(SQL_0056).toMatch(/mfa_requerido/);
    expect(SQL_0056).toMatch(/errcode = ''42501''/);
    expect(SQL_0056).toMatch(/grant execute on function public\.update_my_profile\(jsonb\) to authenticated/i);
  });

  it("add_my_consent mantiene security definer y revoca/otorga", () => {
    expect(SQL_0056).toMatch(/create or replace function public\.add_my_consent\(p_doc text, p_version text\)/i);
    expect(SQL_0056).toMatch(/if public\.mfa_step_pending\(\) then\s+raise exception 'mfa_requerido' using errcode = '42501'/i);
    expect(SQL_0056).toMatch(/security definer\s+set search_path = public, pg_temp/i);
    expect(SQL_0056).toMatch(/revoke all on function public\.add_my_consent\(text, text\) from public, anon, authenticated/i);
  });
});

describe("0057 — topes de escritura", () => {
  it("define triggers BEFORE INSERT con topes de 20/200 avisos, 200 favoritas y 100 posiciones", () => {
    for (const t of ["price_alerts", "user_favorites", "external_holdings"]) {
      expect(SQL_0057).toMatch(new RegExp(`create trigger ${t}_enforce_caps\\s+before insert on public\\.${t}`, "i"));
      expect(SQL_0057).toMatch(new RegExp(`revoke all on function public\\.${t}_enforce_caps\\(\\) from public, anon, authenticated`, "i"));
    }
    expect(SQL_0057).toMatch(/v_active >= 20/);
    expect(SQL_0057).toMatch(/v_total >= 200/);
    expect(SQL_0057).toMatch(/v_total >= 100/);
    expect(SQL_0057.match(/security definer/gi)?.length).toBeGreaterThanOrEqual(5);
    expect(SQL_0057.match(/pg_advisory_xact_lock/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it("valida el formato de símbolo", () => {
    expect(SQL_0057).toMatch(/\^\[A-Za-z0-9\.\]\{1,12\}\(x\|on\)\$/);
    expect(SQL_0057).toMatch(/simbolo_invalido/);
  });

  it("add_my_consent final: MFA, versión validada y tope por documento", () => {
    expect(SQL_0057).toMatch(/mfa_requerido/);
    expect(SQL_0057).toContain("'^[A-Za-z0-9._-]{1,32}$'");
    expect(SQL_0057).toMatch(/v_count >= 20/);
    expect(SQL_0057).toMatch(/grant execute on function public\.add_my_consent\(text, text\) to authenticated/i);
  });
});

describe("0058 — borrado de cuenta", () => {
  it("define la tabla de solicitudes con RLS forzada y sin escrituras de cliente", () => {
    expect(SQL_0058).toMatch(/create table if not exists public\.account_deletion_requests/i);
    expect(SQL_0058).toMatch(/references auth\.users \(id\) on delete restrict/i);
    expect(SQL_0058).toMatch(/check \(status in \('pending', 'processed', 'cancelled'\)\)/i);
    expect(SQL_0058).toMatch(/alter table public\.account_deletion_requests force row level security/i);
    expect(SQL_0058).toMatch(/grant select on table public\.account_deletion_requests to authenticated/i);
    expect(SQL_0058).not.toMatch(/grant [^;]*(insert|update|delete)[^;]*on table public\.account_deletion_requests to authenticated/i);
    expect(SQL_0058).toMatch(/account_deletion_requests_mfa_restrictive/);
  });

  it("request_my_deletion exige sesión y MFA y sólo se ejecuta como authenticated", () => {
    expect(SQL_0058).toMatch(/create or replace function public\.request_my_deletion\(\)\s+returns timestamptz/i);
    expect(SQL_0058).toMatch(/no_session' using errcode = '42501'/);
    expect(SQL_0058).toMatch(/mfa_requerido/);
    expect(SQL_0058).toMatch(/grant execute on function public\.request_my_deletion\(\) to authenticated/i);
  });

  it("anonymize_user sólo para service_role, borra PII y datos de uso y no toca el historial legal", () => {
    expect(SQL_0058).toMatch(/create or replace function public\.anonymize_user\(p_user uuid\)\s+returns void/i);
    expect(SQL_0058).toMatch(/grant execute on function public\.anonymize_user\(uuid\) to service_role/i);
    expect(SQL_0058).not.toMatch(/grant execute on function public\.anonymize_user\(uuid\) to [^;]*authenticated/i);
    expect(SQL_0058).toMatch(/app\.profile_write', 'on'/);
    for (const t of ["preferences", "user_favorites", "price_alerts", "external_holdings"]) {
      expect(SQL_0058).toMatch(new RegExp(`delete from public\\.${t} where user_id = p_user`, "i"));
    }
    expect(SQL_0058).toMatch(/delete from public\.ai_shared_chats where owner_id = p_user/i);
    const fn = SQL_0058.slice(SQL_0058.indexOf("function public.anonymize_user"), SQL_0058.indexOf("-- 5."));
    for (const t of [
      "orders", "wallet_movements", "crypto_deposits", "wallet_withdrawals",
      "trade_reservations", "compliance_events", "consents", "billing_events",
    ]) {
      expect(fn).not.toMatch(new RegExp(`(delete from|update) public\\.${t}\\b`, "i"));
    }
  });

  it("cambia FKs financieras a RESTRICT de forma idempotente", () => {
    expect(SQL_0058).toMatch(/confdeltype = 'c'/);
    expect(SQL_0058).toMatch(/ON DELETE RESTRICT/);
    for (const t of [
      "orders", "wallet_movements", "crypto_deposits", "wallet_withdrawals",
      "trade_reservations", "sponsor_usage", "compliance_events", "consents",
    ]) {
      expect(SQL_0058).toContain(`'${t}'`);
    }
  });

  it("ai_shared_chats gana expires_at, revoked_at y cascada con el dueño", () => {
    expect(SQL_0058).toMatch(/add column if not exists expires_at timestamptz not null default \(now\(\) \+ interval '90 days'\)/i);
    expect(SQL_0058).toMatch(/add column if not exists revoked_at timestamptz/i);
    expect(SQL_0058).toMatch(/foreign key \(owner_id\) references auth\.users \(id\) on delete cascade/i);
  });
});

describe("0059 — integridad", () => {
  it("crea índices únicos parciales protegidos contra duplicados", () => {
    expect(SQL_0059).toMatch(/create unique index if not exists wallets_one_primary_per_user_uidx[\s\S]*where is_primary = true/i);
    expect(SQL_0059).toMatch(/create unique index if not exists profiles_rut_unique_idx[\s\S]*where rut is not null and onboarding_completed/i);
    expect(SQL_0059.match(/raise warning/gi)?.length).toBe(2);
    expect(SQL_0059.match(/\breturn;/g)?.length).toBe(2);
  });
});

describe("convenciones de las migraciones nuevas", () => {
  it("encabezado NO APLICADA y sin sentencias destructivas sobre datos de negocio", () => {
    for (const sql of [SQL_0055, SQL_0056, SQL_0057, SQL_0058, SQL_0059]) {
      expect(sql.split("\n").slice(0, 4).join("\n")).toMatch(/-- NO APLICADA/);
      expect(sql).not.toMatch(/\bdrop table\b|\btruncate\b/i);
    }
  });
});
