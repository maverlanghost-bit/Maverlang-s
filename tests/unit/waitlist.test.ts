import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  postWaitlist,
  WAITLIST_SUCCESS_MESSAGE,
  type WaitlistRow,
} from "@/lib/waitlist/server";

const ROOT = path.resolve(__dirname, "..", "..");

function read(relative: string): string {
  return readFileSync(path.join(ROOT, relative), "utf8");
}

function fakeStore() {
  const rows: WaitlistRow[] = [];
  let calls = 0;
  return {
    rows,
    get calls() {
      return calls;
    },
    store: {
      insert: async (row: WaitlistRow) => {
        calls += 1;
        rows.push(row);
        return { duplicate: false as boolean };
      },
    },
  };
}

describe("M45: lista de espera", () => {
  it("correo inválido → 400", async () => {
    const fake = fakeStore();
    const result = await postWaitlist(
      { email: "no-es-correo", consent: true, website: "", source: "landing" },
      null,
      fake.store,
    );
    expect(result.status).toBe(400);
    expect(fake.calls).toBe(0);
  });

  it("correo de más de 254 caracteres → 400", async () => {
    const fake = fakeStore();
    const result = await postWaitlist(
      { email: `${"a".repeat(250)}@x.cl`, consent: true, website: "", source: "landing" },
      null,
      fake.store,
    );
    expect(result.status).toBe(400);
    expect(fake.calls).toBe(0);
  });

  it("sin checkbox → 400", async () => {
    const fake = fakeStore();
    const result = await postWaitlist(
      { email: "demo@example.com", consent: false, website: "", source: "landing" },
      null,
      fake.store,
    );
    expect(result.status).toBe(400);
    expect(fake.calls).toBe(0);
  });

  it("trampa llena → 200 sin insertar", async () => {
    const fake = fakeStore();
    const result = await postWaitlist(
      { email: "bot@example.com", consent: true, website: "http://spam.example", source: "landing" },
      null,
      fake.store,
    );
    expect(result).toEqual({ status: 200, body: { message: WAITLIST_SUCCESS_MESSAGE } });
    expect(fake.calls).toBe(0);
  });

  it("correo válido → 200 con el mensaje exacto y una sola fila", async () => {
    const fake = fakeStore();
    const result = await postWaitlist(
      { email: "  Hola@Ejemplo.cl ", consent: true, website: "", source: "cuenta_real" },
      "CL",
      fake.store,
    );
    expect(result).toEqual({ status: 200, body: { message: WAITLIST_SUCCESS_MESSAGE } });
    expect(fake.calls).toBe(1);
    expect(fake.rows[0]).toMatchObject({
      email: "Hola@Ejemplo.cl",
      source: "cuenta_real",
      country: "CL",
    });
    expect(typeof fake.rows[0]?.consentVersion).toBe("string");
  });

  it("correo repetido → el mismo 200", async () => {
    const result = await postWaitlist(
      { email: "demo@example.com", consent: true, website: "", source: "landing" },
      null,
      { insert: async () => ({ duplicate: true }) },
    );
    expect(result).toEqual({ status: 200, body: { message: WAITLIST_SUCCESS_MESSAGE } });
  });

  it("el correo no aparece en console.*", async () => {
    const email = "super-secreto-123@example.com";
    const spies = ["log", "info", "warn", "error", "debug"].map((method) =>
      vi.spyOn(console, method as "log").mockImplementation(() => undefined),
    );
    try {
      const fake = fakeStore();
      await postWaitlist({ email, consent: true, website: "", source: "landing" }, null, fake.store);
      await postWaitlist({ email, consent: true, website: "lleno", source: "landing" }, null, fake.store);
      for (const spy of spies) {
        for (const call of spy.mock.calls) {
          for (const arg of call) {
            expect(String(arg)).not.toContain(email);
          }
        }
      }
    } finally {
      for (const spy of spies) spy.mockRestore();
    }
  });

  it("la ruta responde 200 sin guardar con on conflict do nothing (estático)", () => {
    expect(read("lib/waitlist/server.ts")).toContain("ignoreDuplicates: true");
    expect(read("lib/waitlist/server.ts")).toContain('onConflict: "email_norm"');
    const route = read("app/api/waitlist/route.ts");
    expect(route).toContain('x-vercel-ip-country');
    expect(route).toContain('console.error("waitlist: no se pudo guardar el correo")');
  });

  it("la migración 0008 es idempotente, con RLS y sin políticas (estático)", () => {
    const sql = read("supabase/migrations/0008_waitlist.sql");
    expect(sql).toMatch(/create table if not exists public\.waitlist/i);
    expect(sql).toMatch(/email_norm.*generated always as.*lower\(btrim\(email\)/i);
    expect(sql).toMatch(/unique/i);
    expect(sql).toMatch(/enable row level security/i);
    expect(sql).not.toMatch(/create policy/i);
    expect(sql).toMatch(/revoke all on table public\.waitlist from public, anon, authenticated/i);
  });
});
