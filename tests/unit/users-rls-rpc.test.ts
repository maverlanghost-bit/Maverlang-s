import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { rlsUsers } from "@/lib/services/users.rls";

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
});

describe("users.rls — escrituras por RPC (0043)", () => {
  it("update llama update_my_profile y no escribe profiles directo", async () => {
    rpc.mockResolvedValue({ data: PROFILE_ROW, error: null });

    const result = await rlsUsers.update("u-1", { displayName: "Nueva" });

    expect(rpc).toHaveBeenCalledWith("update_my_profile", { p_patch: { nombre: "Nueva" } });
    // readRow hace un solo from("profiles").select(); el update no vuelve a from().
    expect(from).toHaveBeenCalledTimes(1);
    expect(result.displayName).toBe("Ana");
  });

  it("update falla cerrado si la RPC no existe (migración 0043 sin aplicar)", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: {
        code: "PGRST202",
        message: "Could not find the function public.update_my_profile(p_patch) in the schema cache",
      },
    });

    await expect(rlsUsers.update("u-1", { displayName: "Nueva" })).rejects.toMatchObject({
      code: "INTERNAL",
    });
  });

  it("update no deja pasar un país bloqueado antes de la RPC", async () => {
    await expect(rlsUsers.update("u-1", { country: "US" })).rejects.toMatchObject({
      code: "VALIDATION",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("addConsent llama add_my_consent con doc y versión", async () => {
    rpc.mockResolvedValue({
      data: {
        user_id: "u-1",
        doc: "terminos",
        version: "2026-11",
        accepted_at: "2026-11-03T12:00:00.000Z",
      },
      error: null,
    });

    const consent = await rlsUsers.addConsent({
      userId: "u-1",
      doc: "terminos",
      version: "2026-11",
      acceptedAt: "2026-11-03T12:00:00.000Z",
    });

    expect(rpc).toHaveBeenCalledWith("add_my_consent", {
      p_doc: "terminos",
      p_version: "2026-11",
    });
    expect(consent.doc).toBe("terminos");
  });

  it("addConsent rechaza versión vacía sin llamar a la RPC", async () => {
    await expect(
      rlsUsers.addConsent({
        userId: "u-1",
        doc: "terminos",
        version: "   ",
        acceptedAt: "2026-11-03T12:00:00.000Z",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    expect(rpc).not.toHaveBeenCalled();
  });
});
