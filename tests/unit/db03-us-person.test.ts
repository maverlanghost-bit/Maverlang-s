import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { rpc, from, getUser } = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser },
    from,
    rpc,
  }),
}));

import { profileUpdateSchema } from "@/lib/api/contracts";
import { US_PERSON_DECLARATION_VERSION } from "@/config/compliance";
import { serverEnv } from "@/lib/env";
import { complianceDbColumns, declarationRecord } from "@/lib/compliance/profile-write";
import {
  US_PERSON_VERSION_MISMATCH_MESSAGE,
  checkUsPersonDeclaration,
  currentUsPersonDeclarationVersion,
  usPersonDeclarationErrorMessage,
} from "@/lib/compliance/us-person";
import { DEMO_USER_ID, getDemoProfile, getDemoUsPersonDeclaration, resetDemoState } from "@/lib/mocks/demo-state";
import { mockUsers } from "@/lib/services/users.mock";
import { rlsUsers } from "@/lib/services/users.rls";
import { supabaseUsers } from "@/lib/services/users.supabase";

const DECLARED_AT = "2026-11-03T12:00:00.000Z";
const CURRENT = currentUsPersonDeclarationVersion();
/** Versión anterior plausible y versión arbitraria: ambas deben fallar. */
const STALE = `${CURRENT}-old`;
const ARBITRARY = "v1";
const PROFILE_ROW = {
  id: "u-1",
  email: "ana@example.cl",
  nombre: "Ana",
  rut: null,
  pais: "CL",
  fecha_nacimiento: null,
  telefono: null,
  is_us_person: false,
  onboarding_completed: true,
  language: "es-CL",
  display_currency: "CLP",
  created_at: "2026-01-01T00:00:00.000Z",
};

function mockProfileRead(): void {
  const maybeSingle = vi.fn().mockResolvedValue({ data: PROFILE_ROW, error: null });
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  from.mockReturnValue({ select });
}

beforeEach(() => {
  vi.clearAllMocks();
  getUser.mockResolvedValue({ data: { user: { id: "u-1" } }, error: null });
  mockProfileRead();
  resetDemoState();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DB-03: contrato PATCH /api/me", () => {
  it("acepta la respuesta explícita yes/no y null, y rechaza isUsPerson", () => {
    expect(profileUpdateSchema.safeParse({ usPersonDeclaration: "yes" }).success).toBe(true);
    expect(profileUpdateSchema.safeParse({ usPersonDeclaration: "no" }).success).toBe(true);
    expect(profileUpdateSchema.safeParse({ usPersonDeclaration: null }).success).toBe(true);
    expect(profileUpdateSchema.safeParse({ isUsPerson: false }).success).toBe(false);
  });
});

describe("DB-03: versión vigente del servidor", () => {
  it("sale de serverEnv y no del texto del cliente", () => {
    expect(CURRENT).toBe(serverEnv.US_PERSON_DECLARATION_VERSION.trim());
    expect(CURRENT.length).toBeGreaterThan(0);
    // El contrato de UI sigue usando la constante versionada del proyecto.
    expect(typeof US_PERSON_DECLARATION_VERSION).toBe("string");
  });
});

describe("DB-03: chequeo de la declaración", () => {
  it("bloquea sí, sin respuesta y sin versión; acepta no con la versión vigente", () => {
    expect(checkUsPersonDeclaration({ usPersonDeclaration: "yes" })).toEqual({
      kind: "blocked",
      reason: "us_person",
    });
    expect(checkUsPersonDeclaration({ usPersonDeclaration: "no" })).toEqual({
      kind: "blocked",
      reason: "missing_version",
    });
    expect(
      checkUsPersonDeclaration({ usPersonDeclaration: "no", usPersonDeclarationVersion: CURRENT }),
    ).toEqual({
      kind: "declared",
      declaration: "no",
      version: CURRENT,
    });
    expect(checkUsPersonDeclaration({ onboardingCompleted: true })).toEqual({
      kind: "blocked",
      reason: "unanswered",
    });
    expect(checkUsPersonDeclaration({})).toEqual({ kind: "not_requested" });
  });

  it("rechaza versiones antiguas y arbitrarias aunque el cliente las invente", () => {
    expect(
      checkUsPersonDeclaration({ usPersonDeclaration: "no", usPersonDeclarationVersion: STALE }),
    ).toEqual({ kind: "blocked", reason: "version_mismatch" });
    expect(
      checkUsPersonDeclaration({ usPersonDeclaration: "no", usPersonDeclarationVersion: ARBITRARY }),
    ).toEqual({ kind: "blocked", reason: "version_mismatch" });
    expect(
      checkUsPersonDeclaration({ usPersonDeclaration: "no", usPersonDeclarationVersion: ` ${CURRENT} ` }),
    ).toEqual({ kind: "declared", declaration: "no", version: CURRENT });
  });

  it("cuando el servidor sube de versión, la anterior deja de valer", () => {
    const next = `${CURRENT}-next`;
    expect(
      checkUsPersonDeclaration(
        { usPersonDeclaration: "no", usPersonDeclarationVersion: CURRENT },
        next,
      ),
    ).toEqual({ kind: "blocked", reason: "version_mismatch" });
    expect(
      checkUsPersonDeclaration(
        { usPersonDeclaration: "no", usPersonDeclarationVersion: next },
        next,
      ),
    ).toEqual({ kind: "declared", declaration: "no", version: next });
  });

  it("el mensaje de versión no vigente es propio, no el de versión faltante", () => {
    expect(usPersonDeclarationErrorMessage("version_mismatch")).toBe(US_PERSON_VERSION_MISMATCH_MESSAGE);
    expect(US_PERSON_VERSION_MISMATCH_MESSAGE).not.toBe("");
  });

  it("no convierte la ausencia de respuesta en false ni en columnas", () => {
    expect(complianceDbColumns({ onboardingCompleted: true }, DECLARED_AT)).toEqual({
      blocked: "unanswered",
    });
    expect(complianceDbColumns({ usPersonDeclaration: "no" }, DECLARED_AT)).toEqual({
      blocked: "missing_version",
    });
    expect(complianceDbColumns({}, DECLARED_AT)).toBeNull();
  });

  it("bloquea columnas cuando la versión no es la vigente", () => {
    expect(
      complianceDbColumns(
        { usPersonDeclaration: "no", usPersonDeclarationVersion: STALE },
        DECLARED_AT,
      ),
    ).toEqual({ blocked: "version_mismatch" });
    expect(
      complianceDbColumns(
        { usPersonDeclaration: "no", usPersonDeclarationVersion: ARBITRARY },
        DECLARED_AT,
      ),
    ).toEqual({ blocked: "version_mismatch" });
  });

  it("con no y la versión vigente arma is_us_person=false y persiste la del servidor", () => {
    expect(
      complianceDbColumns(
        {
          onboardingCompleted: true,
          usPersonDeclaration: "no",
          usPersonDeclarationVersion: `  ${CURRENT}  `,
          residenceCountry: "cl",
          nationalityCountry: "CL",
        },
        DECLARED_AT,
      ),
    ).toEqual({
      is_us_person: false,
      us_person_declaration_version: CURRENT,
      us_person_declared_at: DECLARED_AT,
      residence_country: "CL",
      nationality_country: "CL",
    });
  });

  it("declarationRecord exige la versión vigente cuando la recibe", () => {
    expect(
      declarationRecord({
        residenceCountry: "CL",
        nationalityCountry: "CL",
        usPersonDeclaration: "no",
        version: STALE,
        declaredAt: DECLARED_AT,
      }),
    ).toEqual({ blocked: true, reason: "version_mismatch" });

    const record = declarationRecord({
      residenceCountry: "CL",
      nationalityCountry: "CL",
      usPersonDeclaration: "no",
      version: CURRENT,
      declaredAt: DECLARED_AT,
    });
    expect(record).toMatchObject({
      us_person_declaration_version: CURRENT,
      consent: { doc: "us_person", version: CURRENT },
    });
  });
});

describe("DB-03: demo sin declaración", () => {
  it("la demo parte sin declaración y no inventa false", async () => {
    expect(getDemoProfile().isUsPerson).toBeNull();
    expect(getDemoUsPersonDeclaration()).toEqual({ value: null, version: null, declaredAt: null });

    const changed = await mockUsers.update(DEMO_USER_ID, { displayName: "Demo 2" });
    expect(changed.displayName).toBe("Demo 2");
    expect(changed.isUsPerson).toBeNull();

    const onboarded = await mockUsers.update(DEMO_USER_ID, { onboardingCompleted: true });
    expect(onboarded.onboardingCompleted).toBe(true);
    expect(onboarded.isUsPerson).toBeNull();
  });

  it("sólo un no explícito con la versión vigente deja is_us_person=false", async () => {
    const saved = await mockUsers.update(DEMO_USER_ID, {
      usPersonDeclaration: "no",
      usPersonDeclarationVersion: CURRENT,
    });
    expect(saved.isUsPerson).toBe(false);
    expect(getDemoUsPersonDeclaration()).toMatchObject({
      value: "no",
      version: CURRENT,
    });
  });

  it("rechaza sí, no sin versión y versiones viejas o arbitrarias", async () => {
    await expect(mockUsers.update(DEMO_USER_ID, { usPersonDeclaration: "yes" })).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await expect(mockUsers.update(DEMO_USER_ID, { usPersonDeclaration: "no" })).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await expect(
      mockUsers.update(DEMO_USER_ID, {
        usPersonDeclaration: "no",
        usPersonDeclarationVersion: STALE,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      mockUsers.update(DEMO_USER_ID, {
        usPersonDeclaration: "no",
        usPersonDeclarationVersion: ARBITRARY,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    expect(getDemoProfile().isUsPerson).toBeNull();
    expect(getDemoUsPersonDeclaration().version).toBeNull();
  });
});

describe("DB-03: users.rls", () => {
  it("rechaza completar onboarding sin declaración antes de la RPC", async () => {
    await expect(rlsUsers.update("u-1", { onboardingCompleted: true })).rejects.toMatchObject({
      code: "VALIDATION",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("rechaza una versión vieja o arbitraria antes de la RPC", async () => {
    await expect(
      rlsUsers.update("u-1", {
        onboardingCompleted: true,
        usPersonDeclaration: "no",
        usPersonDeclarationVersion: STALE,
        residenceCountry: "CL",
        nationalityCountry: "CL",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      rlsUsers.update("u-1", {
        usPersonDeclaration: "no",
        usPersonDeclarationVersion: ARBITRARY,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("con no y la versión vigente envía is_us_person=false a la RPC", async () => {
    rpc.mockResolvedValue({ data: PROFILE_ROW, error: null });
    await rlsUsers.update("u-1", {
      onboardingCompleted: true,
      usPersonDeclaration: "no",
      usPersonDeclarationVersion: CURRENT,
      residenceCountry: "CL",
      nationalityCountry: "CL",
    });
    expect(rpc).toHaveBeenCalledWith("update_my_profile", {
      p_patch: expect.objectContaining({
        onboarding_completed: true,
        is_us_person: false,
        us_person_declaration_version: CURRENT,
        residence_country: "CL",
        nationality_country: "CL",
      }),
    });
  });
});

describe("DB-03: users.supabase (live)", () => {
  it("rechaza la versión no vigente antes de cualquier llamada de red", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await expect(
      supabaseUsers.update("u-1", {
        onboardingCompleted: true,
        usPersonDeclaration: "no",
        usPersonDeclarationVersion: STALE,
        residenceCountry: "CL",
        nationalityCountry: "CL",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      supabaseUsers.update("u-1", {
        usPersonDeclaration: "no",
        usPersonDeclarationVersion: ARBITRARY,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
