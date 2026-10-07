import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  path.resolve(__dirname, "..", "..", "supabase", "migrations", "0007_demo_usd.sql"),
  "utf8",
);

describe("migración 0007 (estático)", () => {
  it("agrega cash_usd/initial_usd y total_usd", () => {
    expect(sql).toMatch(/cash_usd/);
    expect(sql).toMatch(/initial_usd/);
    expect(sql).toMatch(/total_usd/);
  });

  it("marca una-sola-vez con on conflict do nothing", () => {
    expect(sql).toMatch(/_migration_flags/);
    expect(sql).toMatch(/on conflict .*do nothing/i);
    expect(sql).toMatch(/row_count/);
  });

  it("funciones security definer con search_path", () => {
    expect(sql).toMatch(/security definer/i);
    expect(sql).toMatch(/set search_path/i);
  });

  it("demo_trade mantiene la firma y descuenta en USD", () => {
    expect(sql).toMatch(/demo_trade\(\s*p_user uuid,/);
    expect(sql).toMatch(/p_price_usd numeric/);
    expect(sql).toMatch(/cash_usd = cash_usd - v_total_usd/);
    expect(sql).toMatch(/saldo_insuficiente/);
  });

  it("demo_reset vuelve a initial_usd", () => {
    expect(sql).toMatch(/cash_usd = initial_usd/);
  });

  it("sin pg_catalog.current_date", () => {
    expect(sql).not.toMatch(/pg_catalog\.current_date/);
  });
});
