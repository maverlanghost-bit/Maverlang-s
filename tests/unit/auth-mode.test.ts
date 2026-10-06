import { afterEach, describe, expect, it, vi } from "vitest";

import { authMode, isSupabaseAuth, pickAuthFlag, resetAuthModeWarningsForTests } from "@/lib/auth/mode";
import { readSupabaseSecretKey } from "@/lib/supabase/config";

const URL = "https://example.supabase.co";
const KEY = "publishable-test";

afterEach(() => {
  resetAuthModeWarningsForTests();
  vi.restoreAllMocks();
});

describe("authMode", () => {
  it("es mock si el flag no pide supabase", () => {
    expect(authMode({})).toBe("mock");
    expect(authMode({ flag: "mock", supabaseUrl: URL, publishableKey: KEY })).toBe("mock");
    expect(isSupabaseAuth({ flag: "mock", supabaseUrl: URL, publishableKey: KEY })).toBe(false);
    expect(authMode({ flag: "live", supabaseUrl: URL, publishableKey: KEY })).toBe("mock");
  });

  it("es supabase sólo con flag, URL y clave pública", () => {
    expect(authMode({ flag: "supabase", supabaseUrl: URL, publishableKey: KEY })).toBe("supabase");
    expect(isSupabaseAuth({ flag: " SUPABASE ", supabaseUrl: ` ${URL}/ `, publishableKey: ` ${KEY} ` })).toBe(true);
  });

  it("cae a mock y avisa una sola vez si falta la URL o la clave", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(authMode({ flag: "supabase", supabaseUrl: URL })).toBe("mock");
    expect(authMode({ flag: "supabase", publishableKey: KEY })).toBe("mock");
    expect(authMode({ flag: "supabase", supabaseUrl: "no-es-url", publishableKey: KEY })).toBe("mock");
    expect(authMode({ flag: "supabase", supabaseUrl: "ftp://example.test", publishableKey: KEY })).toBe("mock");
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("prioriza el flag de servidor", () => {
    expect(pickAuthFlag(undefined, undefined)).toBe("mock");
    expect(pickAuthFlag("  ", "supabase")).toBe("supabase");
    expect(pickAuthFlag("mock", "supabase")).toBe("mock");
    expect(pickAuthFlag("supabase", "mock")).toBe("supabase");
  });
});

describe("readSupabaseSecretKey", () => {
  it("prefiere la clave nueva y acepta el nombre viejo", () => {
    expect(readSupabaseSecretKey({ secret: " server-secret ", legacy: "legacy-secret" })).toBe("server-secret");
    expect(readSupabaseSecretKey({ secret: " ", legacy: "legacy-secret" })).toBe("legacy-secret");
    expect(readSupabaseSecretKey({ secret: "", legacy: "" })).toBeNull();
  });
});
