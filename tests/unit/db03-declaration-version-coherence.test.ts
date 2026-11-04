import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { serverEnv } from "@/lib/env";
import {
  assertRealAccountCompliance,
  assertRealDeclarationVersionCoherent,
  checkRealDeclarationVersionCoherence,
  declarationVersionCoherenceVerdict,
  resetDeclarationVersionCoherenceWarningsForTests,
} from "@/lib/trade/real-guards";

/**
 * DB-03: la versión de la declaración que exige/persiste la DB
 * (`public.compliance_config`) y la que usa la app
 * (`serverEnv.US_PERSON_DECLARATION_VERSION`) tienen que coincidir.
 *
 * Todo se prueba con lectores inyectados: ningún test abre Supabase, toca
 * `.env` ni sale a la red. La propiedad central es que la elegibilidad real
 * falla cerrada y no llega a leer el perfil cuando la coherencia no se puede
 * demostrar.
 */

const CURRENT = "2026-11-vigente";
const ROW = {
  onboarding_completed: true,
  is_us_person: false,
  us_person_declaration_version: CURRENT,
  us_person_declared_at: "2026-11-01T12:00:00.000Z",
};

let logs: string[];

beforeEach(() => {
  logs = [];
  resetDeclarationVersionCoherenceWarningsForTests();
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("declarationVersionCoherenceVerdict", () => {
  it("acepta exactamente la misma versión y sólo recorta los bordes", () => {
    expect(declarationVersionCoherenceVerdict(CURRENT, CURRENT)).toEqual({
      ok: true,
      version: CURRENT,
    });
    expect(declarationVersionCoherenceVerdict(` ${CURRENT} `, CURRENT)).toEqual({
      ok: true,
      version: CURRENT,
    });
  });

  it("una versión distinta en cualquiera de las dos fuentes bloquea", () => {
    expect(declarationVersionCoherenceVerdict("2026-10-draft", CURRENT)).toEqual({
      ok: false,
      reason: "version_mismatch",
    });
    expect(declarationVersionCoherenceVerdict(CURRENT, "2026-10-draft")).toEqual({
      ok: false,
      reason: "version_mismatch",
    });
  });

  it("sin versión en la DB falla cerrado", () => {
    for (const missing of [null, undefined, "", "   "]) {
      expect(declarationVersionCoherenceVerdict(missing, CURRENT)).toEqual({
        ok: false,
        reason: "db_version_missing",
      });
    }
  });

  it("un valor de DB que no es texto o no cumple el formato 0046 falla cerrado", () => {
    for (const invalid of [123, true, {}, "-v1", "v 1", "a".repeat(65)]) {
      expect(declarationVersionCoherenceVerdict(invalid, CURRENT)).toEqual({
        ok: false,
        reason: "db_version_invalid",
      });
    }
  });

  it("sin versión de servidor falla cerrado antes de mirar la DB", () => {
    expect(declarationVersionCoherenceVerdict(null, null)).toEqual({
      ok: false,
      reason: "server_version_missing",
    });
    expect(declarationVersionCoherenceVerdict(null, "")).toEqual({
      ok: false,
      reason: "server_version_missing",
    });
    expect(declarationVersionCoherenceVerdict(CURRENT, "v 1")).toEqual({
      ok: false,
      reason: "server_version_invalid",
    });
  });
});

describe("checkRealDeclarationVersionCoherence", () => {
  it("autoriza sólo cuando ambas fuentes coinciden y no consulta nada más", async () => {
    const read = vi.fn(async () => CURRENT);
    await expect(
      checkRealDeclarationVersionCoherence({ read, serverVersion: CURRENT }),
    ).resolves.toEqual({ ok: true, version: CURRENT });
    expect(read).toHaveBeenCalledTimes(1);
    expect(logs).toEqual([]);
  });

  it("usa serverEnv.US_PERSON_DECLARATION_VERSION cuando no se inyecta la versión", async () => {
    await expect(
      checkRealDeclarationVersionCoherence({
        read: async () => serverEnv.US_PERSON_DECLARATION_VERSION,
      }),
    ).resolves.toEqual({
      ok: true,
      version: serverEnv.US_PERSON_DECLARATION_VERSION.trim(),
    });
  });

  it("si compliance_config no se puede leer, falla cerrado y avisa una sola vez", async () => {
    const read = async () => {
      throw new Error("Supabase caído");
    };

    await expect(
      checkRealDeclarationVersionCoherence({ read, serverVersion: CURRENT }),
    ).resolves.toEqual({ ok: false, reason: "config_unavailable" });
    await expect(
      checkRealDeclarationVersionCoherence({ read, serverVersion: CURRENT }),
    ).resolves.toEqual({ ok: false, reason: "config_unavailable" });

    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain("[real-guards]");
    expect(logs[0]).toContain("config_unavailable");
    // El detalle técnico no se propaga al mensaje del cliente.
    expect(logs[0]).not.toContain("Supabase caído");
  });

  it("un desajuste deja rastro con las dos versiones, sin datos de personas", async () => {
    await expect(
      checkRealDeclarationVersionCoherence({
        read: async () => "2026-10-draft",
        serverVersion: CURRENT,
      }),
    ).resolves.toEqual({ ok: false, reason: "version_mismatch" });

    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain("version_mismatch");
    expect(logs[0]).toContain("db=2026-10-draft");
    expect(logs[0]).toContain(`env=${CURRENT}`);
  });

  it("no consulta la base si la versión del servidor no sirve", async () => {
    const read = vi.fn(async () => CURRENT);
    await expect(
      checkRealDeclarationVersionCoherence({ read, serverVersion: " " }),
    ).resolves.toEqual({ ok: false, reason: "server_version_missing" });
    expect(read).not.toHaveBeenCalled();
  });

  it("una fila sin versión o con formato inválido no se normaliza", async () => {
    await expect(
      checkRealDeclarationVersionCoherence({
        read: async () => null,
        serverVersion: CURRENT,
      }),
    ).resolves.toEqual({ ok: false, reason: "db_version_missing" });

    const invalid = "v1 con espacios";
    await expect(
      checkRealDeclarationVersionCoherence({
        read: async () => invalid,
        serverVersion: CURRENT,
      }),
    ).resolves.toEqual({ ok: false, reason: "db_version_invalid" });
  });
});

describe("assertRealDeclarationVersionCoherent", () => {
  it("lanza 503 REAL_DISABLED sin exponer las versiones en el mensaje", async () => {
    const error = await assertRealDeclarationVersionCoherent({
      read: async () => "2026-10-draft",
      serverVersion: CURRENT,
    }).catch((reason: unknown) => reason);

    expect(error).toMatchObject({ code: "REAL_DISABLED" });
    expect((error as Error).message).toBe("El dinero real todavía no está disponible.");
    expect((error as Error).message).not.toContain(CURRENT);
    expect((error as Error).message).not.toContain("2026-10-draft");
  });
});

describe("assertRealAccountCompliance: coherencia antes de la evidencia", () => {
  it("no lee el perfil si la versión de la DB no coincide con la del servidor", async () => {
    const readProfile = vi.fn(async () => ROW);

    await expect(
      assertRealAccountCompliance("u-1", {
        read: readProfile,
        currentVersion: CURRENT,
        readDeclarationVersion: async () => "2026-10-draft",
      }),
    ).rejects.toMatchObject({ code: "REAL_DISABLED" });

    expect(readProfile).not.toHaveBeenCalled();
  });

  it("no lee el perfil si compliance_config no se puede leer", async () => {
    const readProfile = vi.fn(async () => ROW);

    await expect(
      assertRealAccountCompliance("u-1", {
        read: readProfile,
        currentVersion: CURRENT,
        readDeclarationVersion: async () => {
          throw new Error("sin permisos");
        },
      }),
    ).rejects.toMatchObject({ code: "REAL_DISABLED" });

    expect(readProfile).not.toHaveBeenCalled();
  });

  it("no consulta la DB si la versión del servidor falta", async () => {
    const readProfile = vi.fn(async () => ROW);
    const readVersion = vi.fn(async () => CURRENT);

    await expect(
      assertRealAccountCompliance("u-1", {
        read: readProfile,
        currentVersion: "",
        readDeclarationVersion: readVersion,
      }),
    ).rejects.toMatchObject({ code: "REAL_DISABLED" });

    expect(readVersion).not.toHaveBeenCalled();
    expect(readProfile).not.toHaveBeenCalled();
  });

  it("con DB y servidor coherentes sí evalúa la fila (y la rechaza si no sirve)", async () => {
    await expect(
      assertRealAccountCompliance("u-1", {
        read: async () => ({ ...ROW, us_person_declaration_version: "v1" }),
        currentVersion: CURRENT,
        readDeclarationVersion: async () => CURRENT,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("sin id no hay autorización ni lectura de configuración", async () => {
    const readVersion = vi.fn(async () => CURRENT);
    await expect(
      assertRealAccountCompliance("   ", {
        read: async () => ROW,
        currentVersion: CURRENT,
        readDeclarationVersion: readVersion,
      }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(readVersion).not.toHaveBeenCalled();
  });
});
