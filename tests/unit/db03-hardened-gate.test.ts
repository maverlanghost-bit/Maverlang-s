import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { decideGate, type GateInput } from "@/lib/auth/gate";
import {
  configuredUsPersonDeclarationVersion,
  gateFromAppMetadata,
  gateFromComplianceRows,
  usPersonDeclarationVerified,
} from "@/lib/auth/registro-schema";

/**
 * DB-03 (endurecido): una declaración sólo vale si es un "no" explícito con
 * la versión vigente y una fecha del servidor parseable. La versión vigente
 * del middleware sale de `serverEnv`, no de la constante pública ni del JWT.
 * Los usuarios legados conservan la demo y tienen `/app/onboarding` abierto
 * para regularizar; las operaciones reales las corta `real-guards`.
 */

const state = vi.hoisted(() => ({
  claims: null as Record<string, unknown> | null,
  profile: null as Record<string, unknown> | null,
  profileError: null as { message?: string } | null,
  consents: [] as { doc: string; version: string }[],
  consentsError: null as { message?: string } | null,
  selects: [] as { table: string; columns: string }[],
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      getClaims: async () => ({ data: { claims: state.claims }, error: null }),
    },
    from: (table: string) => ({
      select: (columns: string) => {
        state.selects.push({ table, columns });
        if (table === "profiles") {
          return { maybeSingle: async () => ({ data: state.profile, error: state.profileError }) };
        }
        return {
          then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
            Promise.resolve({ data: state.consents, error: state.consentsError }).then(resolve, reject),
        };
      },
    }),
  }),
}));

vi.mock("@/lib/supabase/config", () => ({
  readSupabasePublicConfig: () => ({ url: "https://proyecto.test", publishableKey: "pk" }),
}));

/** La versión vigente del servidor: distinta de la constante pública a propósito. */
vi.mock("@/lib/env", () => ({
  serverEnv: { US_PERSON_DECLARATION_VERSION: "2026-11-vigente" },
}));

import { updateSession } from "@/lib/supabase/middleware";

const TODAY = new Date(2026, 9, 5);
const CURRENT = "2026-11-vigente";
const CONSENTS = [
  { doc: "terminos", version: "2026-10-draft" },
  { doc: "privacidad", version: "2026-10-draft" },
];

const verifiedRow = {
  onboarding_completed: true,
  is_us_person: false,
  us_person_declaration_version: CURRENT,
  us_person_declared_at: "2026-10-08T12:00:00.000Z",
};

const completeAppMetadata = {
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
  us_person_declaration_version: CURRENT,
  us_person_declared_at: "2026-10-08T12:00:00.000Z",
};

const baseGate: GateInput = {
  pathname: "/app/onboarding",
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
  state.claims = { sub: "user-1" };
  state.profile = null;
  state.profileError = null;
  state.consents = [];
  state.consentsError = null;
  state.selects = [];
});

describe("DB-03: la versión arbitraria no verifica la declaración", () => {
  it("rechaza 'v1' aunque haya fecha y is_us_person=false", () => {
    expect(
      usPersonDeclarationVerified(
        {
          is_us_person: false,
          us_person_declaration_version: "v1",
          us_person_declared_at: "2026-10-08T12:00:00.000Z",
        },
        CURRENT,
      ),
    ).toBe(false);
  });

  it("acepta exactamente la versión vigente (con borde recortado)", () => {
    expect(
      usPersonDeclarationVerified(
        {
          is_us_person: false,
          us_person_declaration_version: ` ${CURRENT} `,
          us_person_declared_at: "2026-10-08T12:00:00.000Z",
        },
        CURRENT,
      ),
    ).toBe(true);
  });

  it("rechaza una fecha que no es un instante", () => {
    expect(
      usPersonDeclarationVerified(
        {
          is_us_person: false,
          us_person_declaration_version: CURRENT,
          us_person_declared_at: "ayer",
        },
        CURRENT,
      ),
    ).toBe(false);
  });

  it("sin versión esperada falla cerrado, aunque la fila traiga texto", () => {
    expect(
      usPersonDeclarationVerified(
        {
          is_us_person: false,
          us_person_declaration_version: "2026-10-draft",
          us_person_declared_at: "2026-10-08T12:00:00.000Z",
        },
        "",
      ),
    ).toBe(false);
    expect(configuredUsPersonDeclarationVersion()).toBeTypeOf("string");
  });

  it("gateFromComplianceRows sólo marca onboarding con la versión vigente", () => {
    expect(
      gateFromComplianceRows(
        {
          consents: CONSENTS,
          onboardingCompleted: true,
          isUsPerson: false,
          usPersonDeclarationVersion: "v1",
          usPersonDeclaredAt: "2026-10-08T12:00:00.000Z",
        },
        CURRENT,
      ),
    ).toEqual({ onboarded: false, demoReady: true });

    expect(
      gateFromComplianceRows(
        {
          consents: CONSENTS,
          onboardingCompleted: true,
          isUsPerson: false,
          usPersonDeclarationVersion: CURRENT,
          usPersonDeclaredAt: "2026-10-08T12:00:00.000Z",
        },
        CURRENT,
      ),
    ).toEqual({ onboarded: true, demoReady: true });
  });

  it("gateFromAppMetadata exige la misma versión vigente", () => {
    expect(
      gateFromAppMetadata(
        { app_metadata: { ...completeAppMetadata, us_person_declaration_version: "v1" } },
        TODAY,
        CURRENT,
      ),
    ).toEqual({ onboarded: false, demoReady: true });
    expect(gateFromAppMetadata({ app_metadata: completeAppMetadata }, TODAY, CURRENT)).toEqual({
      onboarded: true,
      demoReady: true,
    });
  });
});

describe("DB-03: el middleware usa la versión del servidor", () => {
  const request = new NextRequest("https://maverlang.test/app/cartera");

  it("una fila con la versión del env es onboarding real", async () => {
    state.profile = verifiedRow;
    state.consents = CONSENTS;
    const result = await updateSession(request);
    expect(result.hasSession).toBe(true);
    expect(result.onboarded).toBe(true);
    expect(result.demoReady).toBe(true);
  });

  it("la constante pública no alcanza si el env pide otra versión", async () => {
    state.profile = { ...verifiedRow, us_person_declaration_version: "2026-10-draft" };
    state.consents = CONSENTS;
    const result = await updateSession(request);
    expect(result.onboarded).toBe(false);
    expect(result.demoReady).toBe(true);
  });

  it("una fila is_us_person=true tapa un app_metadata de demo viejo", async () => {
    state.claims = {
      sub: "user-1",
      app_metadata: {
        is_us_person: false,
        terms_version: "2026-10-draft",
        privacy_version: "2026-10-draft",
      },
    };
    state.profile = { ...verifiedRow, is_us_person: true };
    state.consents = CONSENTS;
    const result = await updateSession(request);
    expect(result.onboarded).toBe(false);
    expect(result.demoReady).toBe(false);
  });
});

describe("DB-03: la fila de perfil manda aunque app_metadata esté completo", () => {
  const request = new NextRequest("https://maverlang.test/app/cartera");
  const completeClaims = { sub: "user-1", app_metadata: completeAppMetadata };

  it("consulta profiles y consents siempre, sin fast-path de app_metadata", async () => {
    state.claims = completeClaims;
    state.profile = verifiedRow;
    state.consents = CONSENTS;
    const result = await updateSession(request);
    expect(result.hasSession).toBe(true);
    expect(result.onboarded).toBe(true);
    expect(result.demoReady).toBe(true);
    expect(state.selects.filter((select) => select.table === "profiles")).toHaveLength(1);
    expect(state.selects.filter((select) => select.table === "consents")).toHaveLength(1);
  });

  it("is_us_person=true en la fila prevalece sobre app_metadata y consents", async () => {
    state.claims = completeClaims;
    state.profile = { ...verifiedRow, is_us_person: true };
    state.consents = CONSENTS;
    const result = await updateSession(request);
    expect(result.onboarded).toBe(false);
    expect(result.demoReady).toBe(false);
  });

  it("sin fila de perfil, app_metadata completo no autoriza onboarding real", async () => {
    state.claims = completeClaims;
    state.profile = null;
    state.consents = CONSENTS;
    const result = await updateSession(request);
    expect(result.onboarded).toBe(false);
    // La demo con consentimientos reales no se rompe.
    expect(result.demoReady).toBe(true);
  });

  it("un error al leer profiles nunca autoriza onboarding real", async () => {
    state.claims = completeClaims;
    state.profile = verifiedRow;
    state.profileError = { message: "perfiles caído" };
    state.consents = CONSENTS;
    const result = await updateSession(request);
    expect(result.onboarded).toBe(false);
    expect(result.demoReady).toBe(true);
  });

  it("sin fila ni consentimientos no hay demo (fail-closed)", async () => {
    state.claims = completeClaims;
    state.profile = null;
    state.consents = [];
    const result = await updateSession(request);
    expect(result.onboarded).toBe(false);
    expect(result.demoReady).toBe(false);
  });

  it("una fila incompleta manda sobre un app_metadata que se dice completo", async () => {
    state.claims = completeClaims;
    state.profile = {
      onboarding_completed: false,
      is_us_person: false,
      us_person_declaration_version: CURRENT,
      us_person_declared_at: "2026-10-08T12:00:00.000Z",
    };
    state.consents = CONSENTS;
    const result = await updateSession(request);
    expect(result.onboarded).toBe(false);
    expect(result.demoReady).toBe(true);
  });

  it("la fila verificada autoriza aunque el JWT no traiga app_metadata", async () => {
    state.claims = { sub: "user-1" };
    state.profile = verifiedRow;
    state.consents = CONSENTS;
    const result = await updateSession(request);
    expect(result.onboarded).toBe(true);
    expect(result.demoReady).toBe(true);
  });
});

describe("DB-03: derivación segura de usuarios legados", () => {
  it("con sesión y sin aceptación, el onboarding ya no es un callejón", () => {
    expect(decideGate({ ...baseGate, pathname: "/app/onboarding" })).toEqual({ kind: "next" });
    expect(decideGate({ ...baseGate, pathname: "/app/cartera" })).toEqual({
      kind: "redirect",
      pathname: "/app/aceptar",
      search: "?next=%2Fapp%2Fcartera",
    });
  });

  it("el legado con demo lista sigue en la demo y puede ir a regularizar", () => {
    const legacy = { supabaseDemoReady: true };
    expect(decideGate({ ...baseGate, ...legacy, pathname: "/app/cartera" })).toEqual({ kind: "next" });
    expect(decideGate({ ...baseGate, ...legacy, pathname: "/app/perfil" })).toEqual({ kind: "next" });
    expect(decideGate({ ...baseGate, ...legacy, pathname: "/app/onboarding" })).toEqual({ kind: "next" });
  });
});
