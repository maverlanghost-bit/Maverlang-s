import { readFileSync } from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { decideGate, type GateInput } from "@/lib/auth/gate";
import { gateFromAppMetadata, gateFromComplianceRows } from "@/lib/auth/registro-schema";

/**
 * DB-03: la demo (consents) y el onboarding real (perfil completo +
 * declaración U.S. person verificada) son estados distintos. El middleware
 * debe leer la prueba de la declaración y no convertir `is_us_person=false`
 * por defecto en una respuesta.
 */
const state = vi.hoisted(() => ({
  profile: null as Record<string, unknown> | null,
  profileError: null as { message?: string } | null,
  consents: [] as { doc: string; version: string }[],
  selects: [] as { table: string; columns: string }[],
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      getClaims: async () => ({ data: { claims: { sub: "user-1" } }, error: null }),
    },
    from: (table: string) => ({
      select: (columns: string) => {
        state.selects.push({ table, columns });
        if (table === "profiles") {
          return { maybeSingle: async () => ({ data: state.profile, error: state.profileError }) };
        }
        return {
          then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
            Promise.resolve({ data: state.consents, error: null }).then(resolve, reject),
        };
      },
    }),
  }),
}));

vi.mock("@/lib/supabase/config", () => ({
  readSupabasePublicConfig: () => ({ url: "https://proyecto.test", publishableKey: "pk" }),
}));

import { updateSession } from "@/lib/supabase/middleware";

const TODAY = new Date(2026, 9, 5);
const CONSENTS = [
  { doc: "terminos", version: "2026-10-draft" },
  { doc: "privacidad", version: "2026-10-draft" },
];

const VERIFIED_PROFILE = {
  onboarding_completed: true,
  is_us_person: false,
  us_person_declaration_version: "2026-10-draft",
  us_person_declared_at: "2026-10-08T12:00:00.000Z",
};

const COMPLETE_APP_METADATA = {
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
};

const baseGate: GateInput = {
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
  supabaseDemoReady: false,
  supabaseMfaRequired: false,
};

beforeEach(() => {
  state.profile = null;
  state.profileError = null;
  state.consents = [];
  state.selects = [];
});

describe("gateFromComplianceRows: demo vs onboarding real", () => {
  it("sin declaración verificada no hay onboarding real, pero la demo sigue", () => {
    const fromDemo = gateFromComplianceRows({
      consents: CONSENTS,
      onboardingCompleted: false,
      isUsPerson: false,
    });
    expect(fromDemo).toEqual({ onboarded: false, demoReady: true });

    // `is_us_person=false` por default no prueba nada: faltan versión y fecha.
    const withoutProof = gateFromComplianceRows({
      consents: CONSENTS,
      onboardingCompleted: true,
      isUsPerson: false,
    });
    expect(withoutProof).toEqual({ onboarded: false, demoReady: true });

    const partialProof = gateFromComplianceRows({
      consents: CONSENTS,
      onboardingCompleted: true,
      isUsPerson: false,
      usPersonDeclarationVersion: "2026-10-draft",
    });
    expect(partialProof).toEqual({ onboarded: false, demoReady: true });
  });

  it("con perfil completo + versión + fecha hay onboarding real", () => {
    expect(
      gateFromComplianceRows({
        consents: CONSENTS,
        onboardingCompleted: true,
        isUsPerson: false,
        usPersonDeclarationVersion: "2026-10-draft",
        usPersonDeclaredAt: "2026-10-08T12:00:00.000Z",
      }),
    ).toEqual({ onboarded: true, demoReady: true });
  });

  it("un 'sí' explícito no entra ni a la demo", () => {
    expect(
      gateFromComplianceRows({
        consents: CONSENTS,
        onboardingCompleted: true,
        isUsPerson: true,
        usPersonDeclarationVersion: "2026-10-draft",
        usPersonDeclaredAt: "2026-10-08T12:00:00.000Z",
      }),
    ).toEqual({ onboarded: false, demoReady: false });
  });
});

describe("gateFromAppMetadata: no confía en un flag sin prueba", () => {
  it("exige versión y fecha de la declaración", () => {
    expect(gateFromAppMetadata({ app_metadata: COMPLETE_APP_METADATA }, TODAY)).toEqual({
      onboarded: false,
      demoReady: true,
    });
    expect(
      gateFromAppMetadata(
        {
          app_metadata: {
            ...COMPLETE_APP_METADATA,
            us_person_declaration_version: "2026-10-draft",
            us_person_declared_at: "2026-10-08T12:00:00.000Z",
          },
        },
        TODAY,
      ),
    ).toEqual({ onboarded: true, demoReady: true });
  });

  it("un 'sí' explícito no da demo", () => {
    expect(
      gateFromAppMetadata(
        { app_metadata: { ...COMPLETE_APP_METADATA, is_us_person: true } },
        TODAY,
      ),
    ).toEqual({ onboarded: false, demoReady: false });
  });
});

describe("decideGate: demo y onboarding real", () => {
  it("el onboarding verificado no se rebota a /app/aceptar", () => {
    expect(
      decideGate({ ...baseGate, supabaseOnboarded: true }),
    ).toEqual({ kind: "next" });
  });

  it("la demo sin perfil entra a /app y a cartera", () => {
    expect(
      decideGate({ ...baseGate, supabaseDemoReady: true, pathname: "/app/cartera" }),
    ).toEqual({ kind: "next" });
  });

  it("sin aceptación ni onboarding va a /app/aceptar", () => {
    expect(decideGate({ ...baseGate, pathname: "/app/cartera" })).toEqual({
      kind: "redirect",
      pathname: "/app/aceptar",
      search: "?next=%2Fapp%2Fcartera",
    });
  });
});

describe("updateSession: lee la prueba de la declaración", () => {
  const request = new NextRequest("https://maverlang.test/app/cartera");

  it("perfil verificado da onboarding real", async () => {
    state.profile = VERIFIED_PROFILE;
    state.consents = CONSENTS;
    const result = await updateSession(request);
    expect(result.hasSession).toBe(true);
    expect(result.onboarded).toBe(true);
    expect(result.demoReady).toBe(true);
    expect(state.selects).toContainEqual({
      table: "profiles",
      columns:
        "onboarding_completed,is_us_person,us_person_declaration_version,us_person_declared_at",
    });
  });

  it("perfil con onboarding_completed pero sin declaración es sólo demo", async () => {
    state.profile = { onboarding_completed: true, is_us_person: false };
    state.consents = CONSENTS;
    const result = await updateSession(request);
    expect(result.onboarded).toBe(false);
    expect(result.demoReady).toBe(true);
  });

  it("un 'sí' y un error de perfiles fallan cerrado", async () => {
    state.profile = { ...VERIFIED_PROFILE, is_us_person: true };
    state.consents = CONSENTS;
    const declaredYes = await updateSession(request);
    expect(declaredYes.onboarded).toBe(false);
    expect(declaredYes.demoReady).toBe(false);

    state.profileError = { message: "perfiles caído" };
    state.consents = CONSENTS;
    const failed = await updateSession(request);
    expect(failed.onboarded).toBe(false);
    expect(failed.demoReady).toBe(true);
  });
});

describe("middleware: la consulta incluye la declaración", () => {
  it("pide las columnas del gate en profiles", () => {
    const source = readFileSync(
      path.resolve(__dirname, "..", "..", "lib", "supabase", "middleware.ts"),
      "utf8",
    );
    expect(source).toMatch(/us_person_declaration_version/);
    expect(source).toMatch(/us_person_declared_at/);
    expect(source).toMatch(/is_us_person/);
  });
});
