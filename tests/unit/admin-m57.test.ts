import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { __setAdminGuardForTests, requireAdmin, sessionFromClaims } from "@/lib/admin/guard";
import {
  ADMIN_NOTE_MAX,
  ADMIN_VISIBLE_CAP,
  applyOverride,
  clearOverrideUpdate,
  filterAdminAssets,
  formatReasons,
  hideUpdate,
  parseAdminNote,
  type AdminAsset,
  type AssetOverrideStore,
} from "@/lib/admin/override";
import { CATALOG_CACHE_MS, isVisibleInScope } from "@/lib/catalog/assets";
import { isVisibleStatus, nextSafetyState } from "../../lib/catalog/safety-core.mjs";
import {
  __resetFlagsForTests,
  __setFlagClockForTests,
  __setFlagReaderForTests,
  FLAG_TTL_MS,
  getFlag,
  safeFlagDefault,
} from "@/lib/flags";

const ROOT = path.resolve(__dirname, "..", "..");

function read(relative: string): string {
  return readFileSync(path.join(ROOT, relative), "utf8");
}

function denied(): never {
  throw new Error("NOT_FOUND");
}

afterEach(() => {
  __setAdminGuardForTests(null);
  __resetFlagsForTests();
});

describe("M57: requireAdmin", () => {
  it("sin sesión, con aal1 o sin fila → notFound; con aal2 y admin → ok", async () => {
    __setAdminGuardForTests({
      readSession: async () => null,
      isAdmin: async () => true,
      deny: denied,
    });
    await expect(requireAdmin()).rejects.toThrow("NOT_FOUND");

    let lookups = 0;
    __setAdminGuardForTests({
      readSession: async () => ({ userId: "user-1", aal: "aal1" }),
      isAdmin: async () => {
        lookups += 1;
        return true;
      },
      deny: denied,
    });
    await expect(requireAdmin()).rejects.toThrow("NOT_FOUND");
    expect(lookups).toBe(0);

    __setAdminGuardForTests({
      readSession: async () => ({ userId: "user-1", aal: "aal2" }),
      isAdmin: async () => false,
      deny: denied,
    });
    await expect(requireAdmin()).rejects.toThrow("NOT_FOUND");

    __setAdminGuardForTests({
      readSession: async () => ({ userId: "user-1", aal: "aal2" }),
      isAdmin: async () => {
        throw new Error("db");
      },
      deny: denied,
    });
    await expect(requireAdmin()).rejects.toThrow("NOT_FOUND");

    __setAdminGuardForTests({
      readSession: async () => ({ userId: "user-1", aal: "aal2" }),
      isAdmin: async () => true,
      deny: denied,
    });
    await expect(requireAdmin()).resolves.toEqual({ userId: "user-1" });
  });

  it("arma la sesión desde los claims y el módulo usa getClaims, aal2, app_admins y notFound", () => {
    expect(sessionFromClaims(null, false)).toBeNull();
    expect(sessionFromClaims({ sub: "user-1", aal: "aal2" }, true)).toBeNull();
    expect(sessionFromClaims({ sub: "", aal: "aal2" }, false)).toBeNull();
    expect(sessionFromClaims({ sub: "user-1" }, false)).toEqual({ userId: "user-1", aal: "" });
    expect(sessionFromClaims({ sub: "user-1", aal: "aal2" }, false)).toEqual({
      userId: "user-1",
      aal: "aal2",
    });

    const source = read("lib/admin/guard.ts");
    expect(source).toMatch(/getClaims\(/);
    expect(source).toMatch(/app_admins/);
    expect(source).toMatch(/aal2/);
    expect(source).toMatch(/notFound\(\)/);
    expect(source).toMatch(/export async function requireAdmin/);
  });
});

describe("M57: getFlag", () => {
  it("con la base caída devuelve el default seguro y no lo deja cacheado", async () => {
    let calls = 0;
    __setFlagReaderForTests(async () => {
      calls += 1;
      throw new Error("down");
    });
    expect(await getFlag("trading_enabled")).toBe(false);
    expect(await getFlag("trading_enabled")).toBe(false);
    expect(calls).toBe(2);
    expect(await getFlag("onramp_enabled")).toBe(false);
    expect(await getFlag("deposits_enabled")).toBe(false);
    expect(await getFlag("withdrawals_enabled")).toBe(false);
    expect(safeFlagDefault("offramp_enabled")).toBe(false);

    __setFlagReaderForTests(async () => true);
    expect(await getFlag("trading_enabled")).toBe(true);
  });

  it("cachea una lectura buena 30 s", async () => {
    let now = 1_000;
    let calls = 0;
    __setFlagClockForTests(() => now);
    __setFlagReaderForTests(async () => {
      calls += 1;
      return calls === 1;
    });
    expect(FLAG_TTL_MS).toBe(30_000);
    expect(await getFlag("trading_enabled")).toBe(true);
    expect(await getFlag("trading_enabled")).toBe(true);
    expect(calls).toBe(1);
    now += FLAG_TTL_MS;
    expect(await getFlag("trading_enabled")).toBe(false);
    expect(calls).toBe(2);
  });
});

describe("M57: ocultar un activo", () => {
  it("lo marca hidden, guarda la nota en el evento y el mercado no lo muestra", async () => {
    const note = "Token con problema de custodia reportado por el operador.";
    const events: Record<string, unknown>[] = [];
    let patch: Record<string, unknown> | null = null;
    const store: AssetOverrideStore = {
      async find() {
        return { symbol: "AAPLx", safety_status: "listed" };
      },
      async update(_symbol, next) {
        patch = next;
        return true;
      },
      async insertEvent(event) {
        events.push(event);
        return true;
      },
    };
    const result = await applyOverride(store, {
      symbol: "AAPLx",
      note,
      action: "force_hide",
      userId: "admin-1",
      nowIso: "2026-10-08T15:00:00.000Z",
    });
    expect(result).toBe("ok");
    expect(patch).toMatchObject({
      manual_override: "force_hide",
      manual_note: note,
      safety_status: "hidden",
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.reasons).toEqual([note]);
    expect(events[0]?.status_after).toBe("hidden");
    const metrics = events[0]?.metrics as { note?: string };
    expect(metrics.note).toBe(note);
    expect(isVisibleStatus("hidden")).toBe(false);
    expect(isVisibleInScope({ safetyStatus: "hidden", curated: true, transitionKept: false }, "listed")).toBe(false);
    expect(CATALOG_CACHE_MS).toBeLessThanOrEqual(5 * 60 * 1000);
    const kept = nextSafetyState(
      { safety_status: "hidden", manual_override: "force_hide", consecutive_passes: 3, consecutive_fails: 0 },
      { result: "pass", reasons: [] },
      "market",
    );
    expect(kept.status).toBe("hidden");
  });

  it("exige nota y quitar override no vuelve a listar", async () => {
    expect(parseAdminNote("  ")).toBeNull();
    expect(parseAdminNote("a")).toBe("a");
    expect(parseAdminNote("x".repeat(ADMIN_NOTE_MAX))).toHaveLength(ADMIN_NOTE_MAX);
    expect(parseAdminNote("x".repeat(ADMIN_NOTE_MAX + 1))).toBeNull();
    const cleared = clearOverrideUpdate("ya no hace falta el forzado");
    expect(cleared.manual_override).toBeNull();
    expect(cleared).not.toHaveProperty("safety_status");
    const hidden = hideUpdate("motivo", "2026-10-08T15:00:00.000Z");
    expect(hidden.safety_status).toBe("hidden");

    const store: AssetOverrideStore = {
      async find() {
        return { symbol: "AAPLx", safety_status: "listed" };
      },
      async update() {
        return true;
      },
      async insertEvent() {
        return true;
      },
    };
    expect(
      await applyOverride(store, {
        symbol: "AAPLx",
        note: "   ",
        action: "force_hide",
        userId: "admin-1",
        nowIso: "2026-10-08T15:00:00.000Z",
      }),
    ).toBe("nota");
    expect(
      await applyOverride(store, {
        symbol: "no existe",
        note: "motivo",
        action: "force_hide",
        userId: "admin-1",
        nowIso: "2026-10-08T15:00:00.000Z",
      }),
    ).toBe("missing");
  });

  it("el buscador filtra por símbolo o nombre", () => {
    const rows: AdminAsset[] = [
      {
        symbol: "AAPLx",
        name: "Apple",
        safetyStatus: "listed",
        reasons: ["uno", "dos", "tres", "cuatro", "cinco"],
        checkedAt: null,
        manualOverride: null,
        manualNote: null,
      },
      {
        symbol: "NVDAx",
        name: "NVIDIA",
        safetyStatus: "watch",
        reasons: [],
        checkedAt: null,
        manualOverride: "force_hide",
        manualNote: null,
      },
    ];
    expect(filterAdminAssets(rows, "apple").map((row) => row.symbol)).toEqual(["AAPLx"]);
    expect(filterAdminAssets(rows, "nvda").map((row) => row.symbol)).toEqual(["NVDAx"]);
    expect(formatReasons(rows[0]?.reasons ?? [])).toBe("uno · dos · tres · cuatro +1");
    expect(formatReasons([])).toBe("—");
    expect(ADMIN_VISIBLE_CAP).toBe(100);
  });
});

describe("M57: migración, panel y middleware", () => {
  it("0011 crea las tablas con RLS, sin políticas y con is_admin solo para service_role", () => {
    const sql = read("supabase/migrations/0011_admin.sql");
    expect(sql).toMatch(/create table if not exists public\.app_admins/i);
    expect(sql).toMatch(/user_id uuid primary key references auth\.users/i);
    expect(sql).toMatch(/create table if not exists public\.app_flags/i);
    expect(sql).toMatch(/value jsonb not null/i);
    expect(sql).toMatch(/alter table public\.app_admins enable row level security/i);
    expect(sql).toMatch(/alter table public\.app_flags enable row level security/i);
    expect(sql).toMatch(/revoke all on table public\.app_admins from public, anon, authenticated/i);
    expect(sql).toMatch(/revoke all on table public\.app_flags from public, anon, authenticated/i);
    expect(sql).not.toMatch(/create policy/i);
    expect(sql).toMatch(/security definer/i);
    expect(sql).toMatch(/set search_path = public, pg_temp/i);
    expect(sql).toMatch(/revoke all on function public\.is_admin\(uuid\) from public, anon, authenticated/i);
    expect(sql).toMatch(/grant execute on function public\.is_admin\(uuid\) to service_role/i);
    expect(sql).not.toMatch(/grant execute on function public\.is_admin\(uuid\) to (?:public|anon|authenticated)/i);
    expect(sql).toMatch(/on conflict \(key\) do nothing/i);
    expect(sql).toMatch(/'trading_enabled', 'false'::jsonb/);
    expect(sql).toMatch(/'onramp_enabled', 'false'::jsonb/);
    expect(sql).toMatch(/'offramp_enabled', 'false'::jsonb/);
    expect(sql).toMatch(/'signup_enabled', 'true'::jsonb/);
    expect(sql).toMatch(/'beta_only', 'true'::jsonb/);
    const code = sql.replace(/^--.*$/gm, "");
    expect(code).not.toMatch(/pg_catalog\.current_date/);

    const audit = read("scripts/audit-rls.mjs");
    expect(audit).toMatch(/"app_admins"/);
    expect(audit).toMatch(/"app_flags"/);
    expect(audit).toMatch(/A SELECT app_admins \(denegado\)/);
    expect(audit).toMatch(/A SELECT app_flags \(denegado\)/);
    expect(audit).toMatch(/A INSERT app_admins \(denegado\)/);
    expect(audit).toMatch(/A INSERT app_flags \(denegado\)/);
    expect(audit).toMatch(/A llama is_admin \(denegado\)/);
  });

  it("el panel es servidor, noindex, y cada acción pide requireAdmin", () => {
    const page = read("app/admin/page.tsx");
    expect(page).not.toMatch(/["']use client["']/);
    expect(page).toMatch(/robots:\s*\{\s*index:\s*false/);
    expect(page).toMatch(/requireAdmin\(/);
    expect(page).toMatch(/Ocultar/);
    expect(page).toMatch(/Quitar override/);

    const actions = read("app/admin/actions.ts");
    const chunks = actions.split("export async function ").slice(1);
    expect(chunks.length).toBe(3);
    for (const chunk of chunks) {
      const guardAt = chunk.indexOf("requireAdmin()");
      expect(guardAt).toBeGreaterThan(-1);
      const workAt = Math.min(
        ...["applyOverride(", "writeFlagValue("].map((token) => {
          const at = chunk.indexOf(token);
          return at === -1 ? Number.POSITIVE_INFINITY : at;
        }),
      );
      expect(guardAt).toBeLessThan(workAt);
    }
  });

  it("middleware deja /admin fuera del geobloqueo y el trade no lee flags", () => {
    const middleware = read("middleware.ts");
    const adminAt = middleware.indexOf('pathname === "/admin"');
    const gateAt = middleware.indexOf("const decision = decideGate(");
    expect(adminAt).toBeGreaterThan(-1);
    expect(gateAt).toBeGreaterThan(adminAt);
    expect(middleware.slice(adminAt, gateAt)).toMatch(/return applySecurity/);

    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (statSync(full).isDirectory()) {
          walk(full);
          continue;
        }
        if (entry === "route.ts") files.push(full);
      }
    };
    walk(path.join(ROOT, "app", "api", "trade"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      expect(source, path.relative(ROOT, file)).not.toMatch(/lib\/flags/);
      expect(source, path.relative(ROOT, file)).not.toMatch(/\bgetFlag\b/);
    }
  });

  it("make-admin no trae un correo fijo", () => {
    const script = read("scripts/make-admin.mjs");
    expect(script).toMatch(/<email>/);
    expect(script).toMatch(/app_admins/);
    expect(script).not.toMatch(/@maverlang\.com/);
  });
});
