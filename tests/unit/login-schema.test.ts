import { describe, expect, it } from "vitest";

import { recoveryRedirectTo } from "@/lib/auth/callback-next";
import { classifyLoginError, loginErrorMessage } from "@/lib/auth/login-errors";
import { loginSchema, recuperarSchema, restablecerSchema } from "@/lib/auth/login-schema";
import { isCredentialPath, isPasswordFlowPath, isPublicAppPath, safeNextPath } from "@/lib/auth/paths";

describe("rutas de cuenta", () => {
  it("deja públicas las pantallas de ingreso y clave, y no el mercado privado", () => {
    expect(isCredentialPath("/app/ingresar")).toBe(true);
    expect(isCredentialPath("/app/registro")).toBe(true);
    expect(isCredentialPath("/app/recuperar")).toBe(true);
    expect(isCredentialPath("/app/restablecer")).toBe(true);
    expect(isPasswordFlowPath("/app/recuperar")).toBe(true);
    expect(isPasswordFlowPath("/app/restablecer")).toBe(true);
    expect(isCredentialPath("/app/cartera")).toBe(false);
    expect(isCredentialPath("/app/perfil/ajustes")).toBe(false);
    expect(isPublicAppPath("/app/recuperar")).toBe(false);
    expect(isPublicAppPath("/app/restablecer")).toBe(false);
  });
});

describe("safeNextPath", () => {
  it("conserva la vuelta a comprar o vender", () => {
    expect(safeNextPath("/app/accion/AAPLx?operar=comprar")).toBe("/app/accion/AAPLx?operar=comprar");
    expect(safeNextPath("/app/accion/AAPLx?operar=vender")).toBe("/app/accion/AAPLx?operar=vender");
    expect(safeNextPath("/app/restablecer")).toBe("/app/restablecer");
  });

  it("rechaza destinos que salen de la app o vuelven al ingreso", () => {
    expect(safeNextPath("https://evil.test/app")).toBeNull();
    expect(safeNextPath("//evil.test")).toBeNull();
    expect(safeNextPath("/\\evil")).toBeNull();
    expect(safeNextPath("/app/ingresar")).toBeNull();
    expect(safeNextPath("/app/registro")).toBeNull();
    expect(safeNextPath("/ayuda")).toBeNull();
  });
});

describe("login y recuperar", () => {
  it("exige correo y contraseña", () => {
    expect(loginSchema.safeParse({ email: "ana@example.com", password: "x" }).success).toBe(true);
    expect(loginSchema.safeParse({ email: "no-es-correo", password: "x" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "ana@example.com", password: "" }).success).toBe(false);
  });

  it("pide un correo para recuperar", () => {
    expect(recuperarSchema.safeParse({ email: "ana@example.com" }).success).toBe(true);
    expect(recuperarSchema.safeParse({ email: "ana" }).success).toBe(false);
  });

  it("exige 8 caracteres y que las dos contraseñas coincidan", () => {
    expect(restablecerSchema.safeParse({ password: "clave1234", passwordConfirm: "clave1234" }).success).toBe(true);
    const short = restablecerSchema.safeParse({ password: "corta", passwordConfirm: "corta" });
    expect(short.success).toBe(false);
    const mismatch = restablecerSchema.safeParse({ password: "clave1234", passwordConfirm: "otra1234" });
    expect(mismatch.success).toBe(false);
    if (!mismatch.success) {
      expect(mismatch.error.issues.some((issue) => issue.path[0] === "passwordConfirm")).toBe(true);
    }
  });

  it("traduce los errores de ingreso", () => {
    expect(classifyLoginError({ code: "invalid_credentials", message: "Invalid login credentials" })).toBe("invalid");
    expect(classifyLoginError({ code: "email_not_confirmed", message: "Email not confirmed" })).toBe("unconfirmed");
    expect(classifyLoginError({ status: 429, message: "Too many requests" })).toBe("rate");
    expect(classifyLoginError({ name: "TypeError", message: "Failed to fetch" })).toBe("network");
    expect(classifyLoginError({ message: "Auth session missing!" })).toBe("expired");
    expect(loginErrorMessage("invalid")).toMatch(/contraseña/);
    expect(loginErrorMessage("unconfirmed")).toMatch(/correo/);
    expect(loginErrorMessage("rate")).toMatch(/intentos/);
  });

  it("arma el redirect de recuperación hacia restablecer", () => {
    const url = new URL(recoveryRedirectTo());
    expect(url.pathname).toBe("/auth/callback");
    expect(url.searchParams.get("next")).toBe("/app/restablecer");
  });
});
