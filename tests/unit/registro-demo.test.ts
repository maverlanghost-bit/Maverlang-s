import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { decideGate, type GateInput } from "@/lib/auth/gate";
import {
  claimsDemoReady,
  DEMO_LEGAL_MESSAGE,
  registroDemoSchema,
  registroDemoUserData,
} from "@/lib/auth/registro-schema";

const TODAY = new Date(2026, 9, 5);

const valid = {
  email: "demo@example.com",
  password: "clave1234",
  passwordConfirm: "clave1234",
  aceptaLegal: true,
};

describe("registroDemoSchema", () => {
  const schema = registroDemoSchema();

  it("acepta correo, contraseña y checkbox", () => {
    expect(schema.safeParse(valid).success).toBe(true);
  });

  it("sin el checkbox da el error con el mensaje exacto", () => {
    const parsed = schema.safeParse({ ...valid, aceptaLegal: false });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const legal = parsed.error.issues.find((issue) => issue.path[0] === "aceptaLegal");
      expect(legal?.message).toBe(DEMO_LEGAL_MESSAGE);
      expect(DEMO_LEGAL_MESSAGE).toBe(
        "Debes aceptar los Términos y Condiciones y la Política de Privacidad para continuar.",
      );
    }
  });

  it("rechaza contraseñas distintas", () => {
    const parsed = schema.safeParse({ ...valid, passwordConfirm: "otra-clave" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((issue) => issue.path[0] === "passwordConfirm")).toBe(true);
    }
  });

  it("rechaza correo inválido y clave corta", () => {
    expect(schema.safeParse({ ...valid, email: "no-es-correo" }).success).toBe(false);
    expect(schema.safeParse({ ...valid, password: "corta", passwordConfirm: "corta" }).success).toBe(false);
  });
});

describe("registroDemoUserData", () => {
  it("manda sólo versiones, fecha ISO y origen demo", () => {
    const data = registroDemoUserData(
      { terminos: "2026-10-draft", privacidad: "2026-10-draft" },
      "2026-10-06T00:00:00.000Z",
    );
    expect(data).toEqual({
      terms_version: "2026-10-draft",
      privacy_version: "2026-10-draft",
      terms_accepted_at: "2026-10-06T00:00:00.000Z",
      signup_source: "demo",
    });
  });
});

describe("claimsDemoReady", () => {
  it("vale con términos y privacidad, sin perfil completo", () => {
    expect(
      claimsDemoReady(
        { user_metadata: { terms_version: "2026-10-draft", privacy_version: "2026-10-draft" } },
        TODAY,
      ),
    ).toBe(true);
  });

  it("vale para usuarios antiguos con el perfil completo", () => {
    expect(
      claimsDemoReady(
        {
          user_metadata: {
            onboarding_completed: true,
            nombre: "Ana Soto",
            pais: "CL",
            rut: "12.345.678-5",
            fecha_nacimiento: "2008-10-05",
            telefono: "+56912345678",
            is_us_person: false,
            terms_version: "2026-10-draft",
            privacy_version: "2026-10-draft",
            risks_version: "2026-10-draft",
          },
        },
        TODAY,
      ),
    ).toBe(true);
  });

  it("no vale sin aceptación ni perfil", () => {
    expect(claimsDemoReady({ user_metadata: {} }, TODAY)).toBe(false);
    expect(claimsDemoReady(null, TODAY)).toBe(false);
    expect(
      claimsDemoReady({ user_metadata: { terms_version: "2026-10-draft" } }, TODAY),
    ).toBe(false);
  });
});

const base: GateInput = {
  pathname: "/app",
  search: "",
  countryHeader: "CL",
  countryQuery: null,
  nodeEnv: "test",
  blockedCountries: ["US"],
  mockSession: null,
  onboarding: null,
  privyToken: null,
  usePrivy: false,
  useSupabase: true,
  supabaseSession: true,
  supabaseOnboarded: false,
  supabaseDemoReady: true,
};

function gate(overrides: Partial<GateInput> = {}) {
  return decideGate({ ...base, ...overrides });
}

describe("gate demo (M43)", () => {
  it("sesión + demoReady sin perfil entra a /app, detalle y cartera", () => {
    expect(gate({ pathname: "/app" })).toEqual({ kind: "next" });
    expect(gate({ pathname: "/app/accion/AAPLx" })).toEqual({ kind: "next" });
    expect(gate({ pathname: "/app/cartera" })).toEqual({ kind: "next" });
  });

  it("sesión sin aceptación va a /app/aceptar", () => {
    const noReady = { supabaseDemoReady: false };
    expect(gate({ ...noReady, pathname: "/app/cartera" })).toEqual({
      kind: "redirect",
      pathname: "/app/aceptar",
      search: "?next=%2Fapp%2Fcartera",
    });
    expect(gate({ ...noReady, pathname: "/app/aceptar" })).toEqual({ kind: "next" });
    expect(gate({ pathname: "/app/aceptar" })).toEqual({
      kind: "redirect",
      pathname: "/app",
      search: "",
    });
  });

  it("/app/onboarding ya no es destino automático", () => {
    expect(gate({ supabaseDemoReady: false, pathname: "/app/cartera" })).toEqual({
      kind: "redirect",
      pathname: "/app/aceptar",
      search: "?next=%2Fapp%2Fcartera",
    });
    expect(gate({ pathname: "/app/onboarding" })).toEqual({ kind: "next" });
  });
});

describe("migración 0005 (estático)", () => {
  it("inserta con on conflict y fija search_path", () => {
    const sql = readFileSync(path.resolve(__dirname, "..", "..", "supabase", "migrations", "0005_registro_simple.sql"), "utf8");
    expect(sql).toMatch(/on conflict/i);
    expect(sql).toMatch(/set search_path/i);
    expect(sql).toMatch(/terms_accepted_at/);
    expect(sql).toMatch(/registro_us_person/);
  });
});
