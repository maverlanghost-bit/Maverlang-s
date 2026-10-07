import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..", "..");

function readMigration(): string {
  return readFileSync(path.join(ROOT, "supabase", "migrations", "0010_asset_safety.sql"), "utf8");
}

describe("M53: migración 0010", () => {
  it("trae las columnas de seguridad en assets", () => {
    const sql = readMigration();
    for (const col of [
      "safety_status",
      "safety_reasons",
      "safety_metrics",
      "safety_tier",
      "safety_checked_at",
      "safety_session",
      "consecutive_passes",
      "consecutive_fails",
      "listed_at",
      "hidden_at",
      "manual_override",
      "manual_note",
    ]) {
      expect(sql, col).toMatch(new RegExp(`add column if not exists ${col}\\b`, "i"));
    }
    expect(sql).toMatch(/safety_status in \('listed', 'watch', 'hidden', 'unknown'\)/);
    expect(sql).toMatch(/manual_override in \('force_hide', 'force_list'\)/);
    expect(sql).toMatch(/assets_safety_status_idx/);
  });

  it("crea runs y events con RLS y sin acceso anon/authenticated", () => {
    const sql = readMigration();
    expect(sql).toMatch(/create table if not exists public\.asset_safety_runs/i);
    expect(sql).toMatch(/create table if not exists public\.asset_safety_events/i);
    expect(sql).toMatch(/alter table public\.asset_safety_runs enable row level security/i);
    expect(sql).toMatch(/alter table public\.asset_safety_events enable row level security/i);
    expect(sql).toMatch(/revoke all on table public\.asset_safety_runs from public, anon, authenticated/i);
    expect(sql).toMatch(/revoke all on table public\.asset_safety_events from public, anon, authenticated/i);
    expect(sql).toMatch(/references public\.asset_safety_runs \(id\)/i);
    expect(sql).toMatch(/references public\.assets \(symbol\)/i);
  });

  it("assets sigue público de lectura y nadie gana insert/update", () => {
    const sql = readMigration();
    expect(sql).toMatch(/create policy assets_select_public[\s\S]*to anon, authenticated[\s\S]*using \(true\)/i);
    expect(sql).toMatch(/grant select on table public\.assets to anon, authenticated/i);
    expect(sql).not.toMatch(/grant\s+insert/i);
    expect(sql).not.toMatch(/grant\s+update/i);
  });

  it("es idempotente y sin pg_catalog.current_date", () => {
    const sql = readMigration();
    expect(sql).toMatch(/add column if not exists/i);
    expect(sql).toMatch(/create table if not exists/i);
    expect(sql).toMatch(/drop policy if exists/i);
    const code = sql.replace(/^--.*$/gm, "");
    expect(code).not.toMatch(/pg_catalog\.current_date/);
    expect(code).not.toMatch(/pg_catalog\.now/);
  });
});

describe("M53: auditoría RLS cubre las tablas nuevas", () => {
  it("AUDIT_TABLES y la matriz traen runs y events sin permisos", () => {
    const script = readFileSync(path.join(ROOT, "scripts", "audit-rls.mjs"), "utf8");
    expect(script).toMatch(/asset_safety_runs/);
    expect(script).toMatch(/asset_safety_events/);
    expect(script).toMatch(/A SELECT asset_safety_runs \(denegado\)/);
    expect(script).toMatch(/A SELECT asset_safety_events \(denegado\)/);
  });
});

describe("M53: el script avisa aplica 0010 con código 2", () => {
  it("el --db sonda la migración antes de escribir", () => {
    const script = readFileSync(path.join(ROOT, "scripts", "audit-catalog.mjs"), "utf8");
    expect(script).toMatch(/aplica 0010/);
    expect(script).toMatch(/exitCode = 2/);
    expect(script).toMatch(/checkSafetyMigration/);
  });
});
