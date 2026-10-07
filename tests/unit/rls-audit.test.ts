import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..", "..");
const MIGRATIONS = path.join(ROOT, "supabase", "migrations");

function readMigration(name: string): string {
  return readFileSync(path.join(MIGRATIONS, name), "utf8");
}

function allMigrationsExceptInit(): string {
  return readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql") && f !== "0001_init.sql")
    .map((f) => readFileSync(path.join(MIGRATIONS, f), "utf8"))
    .join("\n");
}

describe("M47: auditoría RLS", () => {
  it("la matriz incluye user_favorites y _migration_flags", () => {
    const script = readFileSync(path.join(ROOT, "scripts", "audit-rls.mjs"), "utf8");
    expect(script).toMatch(/user_favorites/);
    expect(script).toMatch(/_migration_flags/);
    expect(script).toMatch(/AUDIT_TABLES/);
  });

  it("el script nunca deja usuarios de prueba (finally + deleteUser)", () => {
    const script = readFileSync(path.join(ROOT, "scripts", "audit-rls.mjs"), "utf8");
    expect(script).toMatch(/finally/);
    expect(script).toMatch(/deleteUser/);
    expect(script).toMatch(/--dry-run/);
  });

  it("toda create table en public tiene su enable row level security", () => {
    const all = allMigrationsExceptInit();
    const created = new Set<string>();
    for (const match of all.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z_]+)/gi)) {
      created.add(match[1].toLowerCase());
    }
    expect(created.size).toBeGreaterThan(0);
    const missing = [...created].filter(
      (t) => !new RegExp(`alter\\s+table\\s+public\\.${t}\\s+enable\\s+row\\s+level\\s+security`, "i").test(all),
    );
    expect(missing, `sin RLS: ${missing.join(", ")}`).toEqual([]);
  });

  it("0009 es idempotente, sin pg_catalog.current_date y con search_path fijo", () => {
    const sql = readMigration("0009_rls_hardening.sql");
    expect(sql).not.toMatch(/pg_catalog\.current_date/);
    expect(sql).toMatch(/set search_path = public, pg_temp/i);
    expect(sql).toMatch(/reject_profiles_sensitive_change/);
    expect(sql).toMatch(/kyc_status/);
    expect(sql).toMatch(/demo_trade/);
    expect(sql).toMatch(/demo_reset/);
    expect(sql).toMatch(/revoke all on table public\.waitlist/i);
  });

  it("0009 conserva la lógica de registro simple (M43)", () => {
    const sql = readMigration("0009_rls_hardening.sql");
    expect(sql).toMatch(/terms_accepted_at/);
    expect(sql).toMatch(/registro_us_person/);
    expect(sql).toMatch(/on conflict \(id\) do nothing/);
  });

  it("package.json expone npm run audit:rls", () => {
    const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")) as {
      scripts: Record<string, string>;
    };
    expect(pkg.scripts["audit:rls"]).toMatch(/audit-rls\.mjs/);
  });
});
