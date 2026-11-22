import { beforeEach, describe, expect, it, vi } from "vitest";

const { verifyOtp, exchangeCodeForSession, createServerClient } = vi.hoisted(() => {
  const verifyOtp = vi.fn();
  const exchangeCodeForSession = vi.fn();
  const createServerClient = vi.fn((..._args: unknown[]) => ({ auth: { verifyOtp, exchangeCodeForSession } }));
  return { verifyOtp, exchangeCodeForSession, createServerClient };
});

vi.mock("@supabase/ssr", () => ({ createServerClient }));

import { NextRequest } from "next/server";

import { GET, POST } from "@/app/auth/callback/route";

const ORIGIN = "https://app.example.com";
const HASH = "abcdef1234567890abcdef";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", ORIGIN);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proj.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "pub-key");
  verifyOtp.mockResolvedValue({ error: null });
  exchangeCodeForSession.mockResolvedValue({ error: null });
});

function form(fields: Record<string, string>, headers: Record<string, string>): NextRequest {
  return new NextRequest(`${ORIGIN}/auth/callback`, {
    method: "POST",
    body: new URLSearchParams(fields),
    headers: { "content-type": "application/x-www-form-urlencoded", ...headers },
  });
}

describe("AUTH-3: callback sin login CSRF", () => {
  it("GET con token_hash NO verifica: redirige a /auth/confirmar", async () => {
    const res = await GET(
      new NextRequest(`${ORIGIN}/auth/callback?token_hash=${HASH}&type=magiclink&next=/app/cartera`),
    );
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(createServerClient).not.toHaveBeenCalled();
    const target = new URL(res.headers.get("location")!);
    expect(target.pathname).toBe("/auth/confirmar");
    expect(target.searchParams.get("token_hash")).toBe(HASH);
    expect(target.searchParams.get("next")).toBe("/app/cartera");
  });

  it("GET con next externo no lo propaga", async () => {
    const res = await GET(
      new NextRequest(`${ORIGIN}/auth/callback?token_hash=${HASH}&type=magiclink&next=https://evil.com`),
    );
    expect(new URL(res.headers.get("location")!).searchParams.get("next")).toBeNull();
  });

  it("GET con code (PKCE) sigue canjeando la sesión", async () => {
    const res = await GET(new NextRequest(`${ORIGIN}/auth/callback?code=abc&next=/app`));
    expect(exchangeCodeForSession).toHaveBeenCalledWith("abc");
    expect(new URL(res.headers.get("location")!).pathname).toBe("/app");
  });

  it("POST desde otro origen no verifica", async () => {
    const res = await POST(
      form({ token_hash: HASH, type: "magiclink", next: "/app" }, { origin: "https://evil.com" }),
    );
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(res.status).toBe(303);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/app/ingresar");
  });

  it("POST sin Origin ni Referer no verifica", async () => {
    await POST(form({ token_hash: HASH, type: "magiclink" }, {}));
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("POST del mismo origen verifica y redirige con 303", async () => {
    const res = await POST(
      form({ token_hash: HASH, type: "magiclink", next: "/app/cartera" }, { origin: ORIGIN }),
    );
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: HASH, type: "magiclink" });
    expect(res.status).toBe(303);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/app/cartera");
  });

  it("POST con tipo inválido no verifica", async () => {
    await POST(form({ token_hash: HASH, type: "hacker" }, { origin: ORIGIN }));
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("las cookies llevan sameSite lax y path / (AUTH-5)", async () => {
    await GET(new NextRequest(`${ORIGIN}/auth/callback?code=abc`));
    const options = createServerClient.mock.calls[0]?.[2] as { cookieOptions: Record<string, unknown> };
    expect(options.cookieOptions).toMatchObject({ sameSite: "lax", path: "/" });
  });
});
