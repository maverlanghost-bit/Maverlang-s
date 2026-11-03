import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..", "..");
const SQL = readFileSync(path.join(ROOT, "supabase/migrations/0043_profiles_rpc.sql"), "utf8");

describe("0043 — perfil y consentimientos por RPC", () => {
  it("define las dos RPC security definer con search_path", () => {
    expect(SQL).toMatch(/create or replace function public\.update_my_profile\(p_patch jsonb\)/i);
    expect(SQL).toMatch(/create or replace function public\.add_my_consent\(p_doc text, p_version text\)/i);
    expect(SQL.match(/security definer/gi)?.length).toBeGreaterThanOrEqual(3);
    expect(SQL.match(/set search_path = public, pg_temp/gi)?.length).toBeGreaterThanOrEqual(3);
  });

  it("exige consentimientos para encender onboarding_completed", () => {
    expect(SQL).toMatch(/faltan_consentimientos/);
    expect(SQL).toMatch(/c\.doc = 'terminos'/);
    expect(SQL).toMatch(/c\.doc = 'privacidad'/);
  });

  it("cierra el UPDATE de tabla y deja solo las tres columnas seguras", () => {
    expect(SQL).toMatch(/revoke all on table public\.profiles from public, anon, authenticated/i);
    expect(SQL).toMatch(/grant update \(nombre, language, display_currency\)/i);
    expect(SQL).toMatch(/revoke all on table public\.consents from public, anon, authenticated/i);
    expect(SQL).toMatch(/drop policy if exists consents_insert_own/i);
  });

  it("recrea el trigger de 0038 con bypass para la RPC", () => {
    expect(SQL).toMatch(/create or replace function public\.reject_profiles_client_locked_change/i);
    expect(SQL).toMatch(/current_setting\('app\.profile_write', true\) = 'on'/i);
    expect(SQL).toMatch(/create trigger profiles_reject_client_locked_change/i);
  });
});
