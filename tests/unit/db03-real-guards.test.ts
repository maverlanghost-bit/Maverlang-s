import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { serverEnv } from "@/lib/env";
import {
  REAL_COMPLIANCE_REQUIRED_MESSAGE,
  assertRealAccountCompliance,
  realAccountComplianceVerdict,
} from "@/lib/trade/real-guards";

/**
 * DB-03: dinero real exige perfil completo + declaración U.S. person vigente.
 * La guardia falla cerrado si falta la fuente, y la compuerta de ejecución
 * sigue cerrada (no se habilita trading con esto).
 */

const CURRENT = "2026-11-vigente";
const ROW = {
  onboarding_completed: true,
  is_us_person: false,
  us_person_declaration_version: CURRENT,
  us_person_declared_at: "2026-11-01T12:00:00.000Z",
};

describe("realAccountComplianceVerdict", () => {
  it("acepta la fila completa con la versión vigente", () => {
    expect(realAccountComplianceVerdict(ROW, CURRENT)).toEqual({ ok: true });
  });

  it("sin fila no hay autorización", () => {
    expect(realAccountComplianceVerdict(null, CURRENT)).toEqual({ ok: false, reason: "missing" });
  });

  it("onboarding incompleto bloquea", () => {
    expect(realAccountComplianceVerdict({ ...ROW, onboarding_completed: false }, CURRENT)).toEqual({
      ok: false,
      reason: "onboarding",
    });
  });

  it("una versión arbitraria o vieja no autoriza", () => {
    expect(
      realAccountComplianceVerdict({ ...ROW, us_person_declaration_version: "v1" }, CURRENT),
    ).toEqual({ ok: false, reason: "declaration" });
    expect(
      realAccountComplianceVerdict({ ...ROW, us_person_declaration_version: "2026-09-draft" }, CURRENT),
    ).toEqual({ ok: false, reason: "declaration" });
  });

  it("un sí, un is_us_person ausente o una fecha ilegible bloquean", () => {
    expect(realAccountComplianceVerdict({ ...ROW, is_us_person: true }, CURRENT)).toEqual({
      ok: false,
      reason: "declaration",
    });
    expect(realAccountComplianceVerdict({ ...ROW, is_us_person: null }, CURRENT)).toEqual({
      ok: false,
      reason: "declaration",
    });
    expect(
      realAccountComplianceVerdict({ ...ROW, us_person_declared_at: "ayer" }, CURRENT),
    ).toEqual({ ok: false, reason: "declaration" });
  });

  it("sin versión vigente configurada falla cerrado", () => {
    expect(realAccountComplianceVerdict(ROW, "")).toEqual({ ok: false, reason: "declaration" });
  });
});

describe("assertRealAccountCompliance", () => {
  it("deja pasar la fila verificada con la versión del servidor", async () => {
    const currentVersion = serverEnv.US_PERSON_DECLARATION_VERSION;
    await expect(
      assertRealAccountCompliance("u-1", {
        read: async () => ({
          ...ROW,
          us_person_declaration_version: currentVersion,
        }),
        currentVersion,
        readDeclarationVersion: async () => currentVersion,
      }),
    ).resolves.toBeUndefined();
  });

  it("sin declaración deriva a /app/onboarding (VALIDATION, no se inventa evidencia)", async () => {
    const error = await assertRealAccountCompliance("u-1", {
      read: async () => ({ ...ROW, us_person_declaration_version: "v1" }),
      currentVersion: CURRENT,
      readDeclarationVersion: async () => CURRENT,
    }).catch((reason: unknown) => reason);
    expect(error).toMatchObject({ code: "VALIDATION" });
    expect((error as Error).message).toBe(REAL_COMPLIANCE_REQUIRED_MESSAGE);
    expect((error as Error).message).toContain("/app/onboarding");
  });

  it("sin fila también manda a regularizar", async () => {
    await expect(
      assertRealAccountCompliance("u-1", {
        read: async () => null,
        currentVersion: CURRENT,
        readDeclarationVersion: async () => CURRENT,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("si la fuente no está disponible falla cerrado con REAL_DISABLED", async () => {
    await expect(
      assertRealAccountCompliance("u-1", {
        read: async () => {
          throw new Error("Supabase caído");
        },
        currentVersion: CURRENT,
        readDeclarationVersion: async () => CURRENT,
      }),
    ).rejects.toMatchObject({ code: "REAL_DISABLED" });
  });

  it("sin id no hay a quién autorizar", async () => {
    await expect(
      assertRealAccountCompliance("   ", { read: async () => ROW, currentVersion: CURRENT }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("orden y compuerta", () => {
  it("la declaración se exige antes de flags/beta/límites", () => {
    const source = readFileSync(
      path.resolve(__dirname, "..", "..", "lib", "trade", "real-guards.ts"),
      "utf8",
    );
    const body = source.slice(source.indexOf("export async function assertRealTradeAllowed"));
    const lock = body.indexOf("assertRealExecutionLocked()");
    const compliance = body.indexOf("assertRealAccountCompliance(userId)");
    const flags = body.indexOf("assertTradingEnabled(deps)");
    expect(lock).toBeGreaterThan(-1);
    expect(compliance).toBeGreaterThan(lock);
    expect(flags).toBeGreaterThan(compliance);
  });

  it("la compuerta de ejecución sigue cerrada: no se habilita trading", async () => {
    const guards = await import("@/lib/trade/real-guards");
    expect(guards.REAL_EXECUTION_LOCKED).toBe(true);
    await expect(guards.assertRealTradeAllowed("u-1", 100)).rejects.toMatchObject({
      code: "REAL_DISABLED",
    });
  });
});
