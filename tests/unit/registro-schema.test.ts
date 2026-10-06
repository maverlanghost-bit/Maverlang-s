import { describe, expect, it } from "vitest";

import { classifyAuthError, registroErrorMessage } from "@/lib/auth/registro-errors";
import {
  claimsOnboarded,
  formatRut,
  isAtLeast18,
  isValidRut,
  registroSchemaAt,
  US_RESIDENT_MESSAGE,
} from "@/lib/auth/registro-schema";

const TODAY = new Date(2026, 9, 5);

const valid = {
  email: "ana@example.com",
  password: "clave1234",
  passwordConfirm: "clave1234",
  nombre: "Ana Soto",
  pais: "cl",
  rut: "12.345.678-5",
  fechaNacimiento: "2008-10-05",
  telefono: "+56 9 1234 5678",
  notUsPerson: true,
  terminos: true,
  privacidad: true,
  riesgos: true,
};

describe("RUT", () => {
  it("acepta el verificador correcto, incluso con 7 dígitos y K", () => {
    expect(isValidRut("12.345.678-5")).toBe(true);
    expect(isValidRut("11.111.111-1")).toBe(true);
    expect(isValidRut("8.765.432-K")).toBe(true);
    expect(isValidRut("8765432k")).toBe(true);
    expect(formatRut("123456785")).toBe("12.345.678-5");
  });

  it("rechaza un verificador malo o un texto incompleto", () => {
    expect(isValidRut("12.345.678-6")).toBe(false);
    expect(isValidRut("12.345.678")).toBe(false);
    expect(isValidRut("123")).toBe(false);
  });
});

describe("edad", () => {
  it("cumple 18 el día del cumpleaños y no el día anterior", () => {
    expect(isAtLeast18("2008-10-05", TODAY)).toBe(true);
    expect(isAtLeast18("2008-10-06", TODAY)).toBe(false);
    expect(isAtLeast18("2008-02-31", TODAY)).toBe(false);
  });
});

describe("registroSchemaAt", () => {
  const schema = registroSchemaAt(TODAY, true);

  it("acepta un alta chilena", () => {
    expect(schema.safeParse(valid).success).toBe(true);
  });

  it("rechaza contraseñas distintas", () => {
    const parsed = schema.safeParse({ ...valid, passwordConfirm: "otra-clave" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((issue) => issue.path[0] === "passwordConfirm")).toBe(true);
    }
  });

  it("bloquea Estados Unidos y a una US person", () => {
    const country = schema.safeParse({ ...valid, pais: "US", rut: "" });
    expect(country.success).toBe(false);
    if (!country.success) {
      expect(country.error.issues.some((issue) => issue.message === US_RESIDENT_MESSAGE)).toBe(true);
    }
    const person = schema.safeParse({ ...valid, notUsPerson: false });
    expect(person.success).toBe(false);
  });

  it("exige RUT sólo en Chile", () => {
    expect(schema.safeParse({ ...valid, rut: "12.345.678-6" }).success).toBe(false);
    expect(schema.safeParse({ ...valid, pais: "AR", rut: "" }).success).toBe(true);
  });

  it("al completar datos no pide correo ni contraseña", () => {
    const partial = registroSchemaAt(TODAY, false);
    expect(
      partial.safeParse({ ...valid, email: "", password: "", passwordConfirm: "distinta" }).success,
    ).toBe(true);
  });
});

describe("claimsOnboarded", () => {
  it("lee el perfil listo desde user_metadata", () => {
    expect(
      claimsOnboarded(
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
    expect(claimsOnboarded({ user_metadata: { onboarding_completed: true, pais: "US" } }, TODAY)).toBe(false);
  });
});

describe("errores de auth", () => {
  it("traduce correo usado, contraseña débil, límite y red", () => {
    expect(classifyAuthError({ code: "user_already_exists" })).toBe("already");
    expect(classifyAuthError({ message: "User already registered" })).toBe("already");
    expect(classifyAuthError({ code: "weak_password" })).toBe("weak");
    expect(classifyAuthError({ status: 429, message: "over_email_send_rate_limit" })).toBe("rate");
    expect(classifyAuthError({ name: "TypeError", message: "Failed to fetch" })).toBe("network");
    expect(registroErrorMessage("already")).toMatch(/ya tiene una cuenta/);
    expect(registroErrorMessage("rate")).toMatch(/límite de correos/);
  });
});
