import { describe, expect, it } from "vitest";

import { signUpDestination } from "@/lib/auth/registro-client";
import { claimsOnboarded, registroUserData } from "@/lib/auth/registro-schema";

const TODAY = new Date(2026, 9, 5);
const NEXT = "/app/accion/AAPLx?operar=comprar";
const VERSIONS = {
  terminos: "2026-10-draft",
  privacidad: "2026-10-draft",
  riesgos: "2026-10-draft",
};

describe("signUpDestination", () => {
  it("con sesión entra al next saneado", () => {
    expect(signUpDestination({ access_token: "sesion" }, NEXT)).toEqual({ kind: "app", path: NEXT });
  });

  it("con sesión y sin next usable entra a /app", () => {
    expect(signUpDestination({ access_token: "sesion" }, null)).toEqual({ kind: "app", path: "/app" });
    expect(signUpDestination({ access_token: "sesion" }, "https://evil.example")).toEqual({ kind: "app", path: "/app" });
    expect(signUpDestination({ access_token: "sesion" }, "/app/ingresar")).toEqual({ kind: "app", path: "/app" });
  });

  it("sin sesión deja la pantalla del correo", () => {
    expect(signUpDestination(null, NEXT)).toEqual({ kind: "email" });
    expect(signUpDestination(undefined, NEXT)).toEqual({ kind: "email" });
  });
});

describe("metadata del alta", () => {
  it("la metadata de signUp cumple claimsOnboarded", () => {
    const data = registroUserData(
      {
        nombre: "Ana Soto",
        rut: "12.345.678-5",
        pais: "cl",
        fechaNacimiento: "2008-10-05",
        telefono: "+56 9 1234 5678",
      },
      VERSIONS,
    );
    expect(data.onboarding_completed).toBe(true);
    expect(claimsOnboarded({ user_metadata: data }, TODAY)).toBe(true);
  });
});
