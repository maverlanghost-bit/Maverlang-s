import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..", "..");
const SQL = readFileSync(
  path.join(ROOT, "supabase/migrations/0045_profiles_immutability.sql"),
  "utf8",
);
const SQL43 = readFileSync(
  path.join(ROOT, "supabase/migrations/0043_profiles_rpc.sql"),
  "utf8",
);

describe("0045 — inmutabilidad del perfil después del onboarding", () => {
  it("redefine la RPC security definer con search_path fijo", () => {
    expect(SQL).toMatch(
      /create or replace function public\.update_my_profile\(p_patch jsonb\)/i,
    );
    expect(SQL).toMatch(/security definer/i);
    expect(SQL).toMatch(/set search_path = public, pg_temp/i);
    expect(SQL).toMatch(/revoke all on function public\.update_my_profile\(jsonb\)/i);
    expect(SQL).toMatch(/grant execute on function public\.update_my_profile\(jsonb\) to authenticated/i);
  });

  it("impide revertir onboarding_completed", () => {
    expect(SQL).toMatch(/onboarding_no_reversible/);
    expect(SQL).toMatch(/if v_locked and v_onboarding is not true/i);
  });

  it("congela pais, rut, fecha, teléfono y cumplimiento", () => {
    for (const column of [
      "v_pais is distinct from v_row.pais",
      "v_rut is distinct from v_row.rut",
      "v_fecha is distinct from v_row.fecha_nacimiento",
      "v_telefono is distinct from v_row.telefono",
      "v_is_us_person is distinct from v_row.is_us_person",
      "v_residence is distinct from v_row.residence_country",
      "v_nationality is distinct from v_row.nationality_country",
      "v_version is distinct from v_row.us_person_declaration_version",
      "v_declared_at is distinct from v_row.us_person_declared_at",
    ]) {
      expect(SQL).toContain(column);
    }
    expect(SQL).toMatch(/raise exception 'cambio_no_permitido'/);
  });

  it("toma el email de auth.users y rechaza uno distinto", () => {
    expect(SQL).toMatch(/select u\.email into v_auth_email\s+from auth\.users u/i);
    expect(SQL).toMatch(/if not found then\s+raise exception 'email_no_verificado'/i);
    expect(SQL).toMatch(
      /lower\(coalesce\(v_txt, ''\)\) is distinct from lower\(coalesce\(v_auth_email, ''\)\)/i,
    );
    expect(SQL).toContain("v_email := v_auth_email");
  });

  it("sincroniza profiles.email desde auth.users y repara filas existentes", () => {
    expect(SQL).toMatch(
      /create or replace function public\.sync_profile_email_from_auth\(\)/i,
    );
    expect(SQL).toMatch(/after update of email on auth\.users/i);
    expect(SQL).toMatch(/update public\.profiles p/i);
    expect(SQL).toMatch(/where u\.id = p\.id/i);
    expect(SQL).toMatch(/p\.email is distinct from u\.email/i);
    expect(SQL).toMatch(/has_table_privilege\(current_user, 'auth\.users', 'select'\)/i);
  });

  it("conserva el onboarding legítimo y las preferencias", () => {
    expect(SQL).toMatch(/faltan_consentimientos/);
    expect(SQL).toMatch(/v_has_terms and v_has_privacy/);
    expect(SQL).toMatch(/v_nombre := nullif\(btrim\(p_patch->>'nombre'\)/);
    expect(SQL).toMatch(/v_language := v_txt/);
    expect(SQL).toMatch(/v_currency := v_txt/);
    expect(SQL).toMatch(/'nombre', 'email', 'pais', 'rut'/);
  });

  it("mantiene los literales regex de una sola barra, igual que 0043", () => {
    const literals = [
      "'^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$'",
      "'^\\+[1-9][0-9]{7,14}$'",
      "'^\\d{4}-\\d{2}-\\d{2}$'",
    ];
    for (const literal of literals) {
      expect(SQL43).toContain(literal);
      expect(SQL).toContain(literal);
    }
  });

  it("no altera tablas ni elimina funciones previas", () => {
    expect(SQL).not.toMatch(/alter table/i);
    expect(SQL).not.toMatch(/drop function/i);
    expect(SQL).toMatch(/create trigger on_auth_user_email_updated[\s\S]*on auth\.users/i);
    expect(SQL).not.toMatch(/create trigger[\s\S]*on public\.profiles/i);
  });
});
