import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  BLOCKED_COUNTRIES,
  GEO_BLOCKED_MESSAGE,
  US_PERSON_DECLARATION_VERSION,
  evaluateAccess,
  mergeBlockedCountries,
  normalizeRegion,
} from "@/config/compliance";
import { decideGate, type GateInput } from "@/lib/auth/gate";
import { registroUserData } from "@/lib/auth/registro-schema";
import { complianceDbColumns, declarationRecord } from "@/lib/compliance/profile-write";
import { realQuoteGeoDecision } from "@/lib/compliance/real-quote";

const ROOT = path.resolve(__dirname, "..", "..");

function read(relative: string): string {
  return readFileSync(path.join(ROOT, relative), "utf8");
}

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
  useSupabase: false,
  supabaseSession: false,
  supabaseOnboarded: false,
};

const UBICACION = { kind: "redirect" as const, pathname: "/bloqueado", search: "?motivo=ubicacion" };
const NEXT = { kind: "next" as const };

describe("M75: matriz de acceso", () => {
  it("IP CL y residencia CL puede navegar y operar", () => {
    expect(
      evaluateAccess({ ipCountry: "CL", residenceCountry: "CL", nationalityCountry: "CL" }),
    ).toEqual({ navigate: true, operate: true });
  });

  it("IP US bloquea la operación y deja navegar", () => {
    expect(evaluateAccess({ ipCountry: "US", residenceCountry: "CL", nationalityCountry: "CL" })).toEqual({
      navigate: true,
      operate: false,
      reason: "ip",
    });
  });

  it("residencia CL y nacionalidad US bloquea la operación", () => {
    expect(evaluateAccess({ ipCountry: "CL", residenceCountry: "CL", nationalityCountry: "US" })).toEqual({
      navigate: true,
      operate: false,
      reason: "nationality",
    });
  });

  it("IP CU bloquea incluso la navegación", () => {
    expect(evaluateAccess({ ipCountry: "CU" })).toEqual({
      navigate: false,
      operate: false,
      reason: "sanction",
    });
  });

  it("la región UA-43 bloquea la navegación", () => {
    expect(normalizeRegion("UA", "43")).toBe("UA-43");
    expect(normalizeRegion("UA", "UA-43")).toBe("UA-43");
    expect(evaluateAccess({ ipCountry: "UA", ipRegion: "43" })).toEqual({
      navigate: false,
      operate: false,
      reason: "region",
    });
  });

  it("el país del documento bloquea operar (gancho de M76)", () => {
    expect(evaluateAccess({ ipCountry: "CL", residenceCountry: "CL", documentCountry: "GB" })).toEqual({
      navigate: true,
      operate: false,
      reason: "document",
    });
  });
});

describe("M75: cotización real", () => {
  it("GB devuelve GEO_BLOCKED y CL sigue", () => {
    expect(realQuoteGeoDecision("GB")).toEqual({
      ok: false,
      code: "GEO_BLOCKED",
      message: GEO_BLOCKED_MESSAGE,
    });
    expect(realQuoteGeoDecision("CL")).toEqual({ ok: true });
    expect(realQuoteGeoDecision(null)).toEqual({ ok: true });
    expect(realQuoteGeoDecision("")).toEqual({ ok: true });
  });

  it("no está conectada a /api/trade/quote", () => {
    const route = read("app/api/trade/quote/route.ts");
    expect(route).not.toMatch(/lib\/compliance/);
    expect(route).not.toMatch(/realQuoteGeoDecision/);
    expect(route).not.toMatch(/GEO_BLOCKED/);
  });
});

describe("M75: declaración", () => {
  const declaredAt = "2026-10-08T12:00:00.000Z";

  it("guarda versión y fecha cuando residencia y nacionalidad son CL", () => {
    const record = declarationRecord({
      residenceCountry: "cl",
      nationalityCountry: "CL",
      declaredAt,
    });
    expect(record).toEqual({
      residence_country: "CL",
      nationality_country: "CL",
      is_us_person: false,
      us_person_declared_at: declaredAt,
      us_person_declaration_version: US_PERSON_DECLARATION_VERSION,
      consent: { doc: "us_person", version: US_PERSON_DECLARATION_VERSION, accepted_at: declaredAt },
    });
  });

  it("no arma el registro si la nacionalidad es US", () => {
    expect(
      declarationRecord({ residenceCountry: "CL", nationalityCountry: "US", declaredAt }),
    ).toEqual({ blocked: true, reason: "nationality" });
  });

  it("un cambio de teléfono no reescribe la declaración", () => {
    expect(complianceDbColumns({ country: "CL" }, declaredAt)).toBeNull();
  });

  it("la metadata del alta lleva residencia, nacionalidad y versión", () => {
    const data = registroUserData(
      {
        nombre: "Ana Soto",
        rut: "12.345.678-5",
        pais: "cl",
        nacionalidad: "cl",
        fechaNacimiento: "2008-10-05",
        telefono: "+56912345678",
      },
      { terminos: "2026-10-draft", privacidad: "2026-10-draft", riesgos: "2026-10-draft" },
    );
    expect(data.residence_country).toBe("CL");
    expect(data.nationality_country).toBe("CL");
    expect(data.is_us_person).toBe(false);
    expect(data.us_person_declaration_version).toBe("2026-10-draft");
  });
});

describe("M75: el entorno suma y no resta", () => {
  it("CL extra conserva US y el resto de la lista base", () => {
    const merged = mergeBlockedCountries(["cl", "BR"]);
    for (const code of BLOCKED_COUNTRIES) expect(merged).toContain(code);
    expect(merged).toContain("CL");
    expect(merged).toContain("BR");
  });
});

describe("M75: gate de dos niveles", () => {
  function gate(overrides: Partial<GateInput>) {
    return decideGate({ ...baseGate, ...overrides });
  }

  it("US navega el mercado y no entra al registro", () => {
    expect(gate({ countryHeader: "US", pathname: "/app" })).toEqual(NEXT);
    expect(gate({ countryHeader: "US", pathname: "/" })).toEqual(NEXT);
    expect(gate({ countryHeader: "US", pathname: "/app/registro" })).toEqual(UBICACION);
  });

  it("CU no navega, ni con el flag de demo", () => {
    expect(gate({ countryHeader: "CU", pathname: "/" })).toEqual(UBICACION);
    expect(gate({ countryHeader: "CU", pathname: "/app" })).toEqual(UBICACION);
    expect(gate({ countryHeader: "CU", pathname: "/ayuda" })).toEqual(UBICACION);
    expect(gate({ countryHeader: "CU", pathname: "/bloqueado" })).toEqual(NEXT);
    expect(gate({ countryHeader: "CU", pathname: "/", demoForBlocked: true })).toEqual(UBICACION);
  });

  it("UA-43 no navega", () => {
    expect(gate({ countryHeader: "UA", regionHeader: "43", pathname: "/" })).toEqual(UBICACION);
    expect(gate({ countryHeader: "UA", regionHeader: "UA-43", pathname: "/app" })).toEqual(UBICACION);
  });

  it("deja /app/ingresar/verificar y, con el flag, el ingreso", () => {
    expect(
      gate({
        countryHeader: "US",
        pathname: "/app/ingresar/verificar",
        useSupabase: true,
        supabaseSession: true,
        supabaseDemoReady: false,
      }),
    ).toEqual(NEXT);
    expect(gate({ countryHeader: "US", pathname: "/app/ingresar", demoForBlocked: true })).toEqual(NEXT);
    expect(gate({ countryHeader: "US", pathname: "/app/registro", demoForBlocked: true })).toEqual(NEXT);
  });

  it("el middleware suma la lista y lee la región", () => {
    const middleware = read("middleware.ts");
    expect(middleware).toMatch(/x-vercel-ip-country-region/);
    expect(middleware).toMatch(/mergeBlockedCountries/);
    expect(middleware).toMatch(/pathname === "\/admin"/);
  });
});

describe("M75: migración 0015", () => {
  it("escribe las columnas, el trigger y la tabla sin acceso de clientes", () => {
    const sql = read("supabase/migrations/0015_compliance.sql");
    const code = sql.replace(/^--.*$/gm, "");
    expect(sql).toMatch(/residence_country/);
    expect(sql).toMatch(/nationality_country/);
    expect(sql).toMatch(/us_person_declared_at/);
    expect(sql).toMatch(/us_person_declaration_version/);
    expect(sql).not.toMatch(/add column if not exists is_us_person/i);
    expect(sql).toMatch(/create table if not exists public\.compliance_events/i);
    expect(sql).toMatch(/alter table public\.compliance_events enable row level security/i);
    expect(sql).toMatch(/revoke all on table public\.compliance_events from public, anon, authenticated/i);
    expect(sql).not.toMatch(/create policy/i);
    expect(code).not.toMatch(/pg_catalog\.current_date/);
    expect(sql).toMatch(/reject_profiles_compliance_change/);
    expect(sql).toMatch(/cambio_no_permitido/);
    expect(sql).toMatch(/registro_us_person/);
    expect(sql).toMatch(/'us_person'/);

    const audit = read("scripts/audit-rls.mjs");
    expect(audit).toMatch(/"compliance_events"/);
    expect(audit).toMatch(/A SELECT compliance_events \(denegado\)/);
    expect(audit).toMatch(/A INSERT compliance_events \(denegado\)/);
    expect(audit).toMatch(/A no cambia residence_country tras el onboarding/);
    expect(audit).toMatch(/0015 no aplicada/);
  });
});
