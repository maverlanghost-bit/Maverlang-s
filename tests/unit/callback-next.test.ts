import { describe, expect, it } from "vitest";

import { callbackTarget } from "@/lib/auth/callback-next";
import { safeNextPath } from "@/lib/auth/paths";

describe("callback next", () => {
  it("cae a /app si next no es un destino interno", () => {
    expect(callbackTarget(null, true)).toBe("/app");
    expect(callbackTarget("   ", true)).toBe("/app");
    expect(callbackTarget("https://evil.test/app", true)).toBe("/app");
    expect(callbackTarget("//evil.test", true)).toBe("/app");
    expect(callbackTarget("/app/ingresar?next=/app", true)).toBe("/app");
    expect(safeNextPath("https://evil.test/app")).toBeNull();
    expect(safeNextPath("/app/ingresar")).toBeNull();
    expect(safeNextPath("/app/registro")).toBeNull();
  });

  it("conserva un destino bajo /app", () => {
    expect(callbackTarget("/app/cartera", true)).toBe("/app/cartera");
    expect(callbackTarget("/app/accion/AAPLx?operar=vender", true)).toBe("/app/accion/AAPLx?operar=vender");
    expect(safeNextPath("/app/accion/AAPLx?operar=vender")).toBe("/app/accion/AAPLx?operar=vender");
  });

  it("si el canje falla manda al ingreso", () => {
    expect(callbackTarget("/app/cartera", false)).toBe("/app/ingresar?error=enlace");
    expect(callbackTarget(null, false)).toBe("/app/ingresar?error=enlace");
    expect(callbackTarget("https://evil.test", false)).toBe("/app/ingresar?error=enlace");
  });
});
