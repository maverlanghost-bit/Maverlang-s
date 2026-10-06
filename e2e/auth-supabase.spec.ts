import { randomBytes } from "node:crypto";

import { expect, test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

/**
 * Opcional. `npm run e2e` sigue en mock y este spec se salta.
 * `npm run e2e:auth` construye con AUTH_MODE=supabase y lo corre.
 * Crea el usuario con el admin API (no manda correo) y lo borra al final.
 */

const PROFILE = {
  nombre: "Ana Prueba",
  rut: "11.111.111-1",
  pais: "CL",
  fecha_nacimiento: "1990-05-04",
  telefono: "+56911111111",
  is_us_person: false,
  terms_version: "2026-10-draft",
  privacy_version: "2026-10-draft",
  risks_version: "2026-10-draft",
  onboarding_completed: true,
} as const;

function text(name: string): string {
  return (process.env[name] ?? "").trim();
}

function configured(): boolean {
  const mode = text("AUTH_MODE").toLowerCase();
  const flag = text("E2E_AUTH").toLowerCase();
  const secret = text("SUPABASE_SECRET_KEY") || text("SUPABASE_SERVICE_ROLE_KEY");
  return flag === "supabase" && mode === "supabase" && Boolean(text("NEXT_PUBLIC_SUPABASE_URL") && text("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") && secret);
}

test.describe("auth supabase", () => {
  test.skip(!configured(), "AUTH_MODE no es supabase o falta el entorno de Supabase");

  test("ingresa, vuelve a la acción y salir cierra la cartera", async ({ page }) => {
    const url = text("NEXT_PUBLIC_SUPABASE_URL");
    const secret = text("SUPABASE_SECRET_KEY") || text("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !secret) throw new Error("Falta el entorno de Supabase.");

    const admin = createClient(url, secret, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const email = `maverlang.e2e+${Date.now()}@example.com`;
    const password = randomBytes(24).toString("base64url");
    let userId: string | null = null;

    try {
      const created = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: PROFILE,
      });
      userId = created.data.user?.id ?? null;
      if (created.error || !userId) throw new Error("No se pudo crear el usuario de prueba.");

      await page.goto("/app/ingresar?next=/app/accion/AAPLx");
      await expect(page.getByRole("heading", { name: "Ingresa" })).toBeVisible();
      await page.getByLabel("Correo").fill(email);
      await page.getByLabel("Contraseña").fill(password);
      await page.getByRole("button", { name: "Ingresar" }).click();

      await expect(page).toHaveURL(/\/app\/accion\/AAPLx$/);
      await expect(page.getByRole("heading", { level: 1, name: "Apple" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Comprar", exact: true })).toBeVisible();
      await expect(page.getByRole("link", { name: "Crear cuenta para invertir" })).toHaveCount(0);

      await page.goto("/app/cartera");
      await expect(page).toHaveURL(/\/app\/cartera\/?$/);
      await expect(page.getByRole("heading", { name: "Cartera" })).toBeVisible();

      await page.getByRole("button", { name: "Cerrar sesión" }).click();
      await expect(page).toHaveURL(/\/$/);

      await page.goto("/app/cartera");
      await expect(page).toHaveURL(/\/app\/ingresar\?next=/);
      expect(decodeURIComponent(new URL(page.url()).searchParams.get("next") ?? "")).toContain("/app/cartera");
    } finally {
      if (userId) {
        const removed = await admin.auth.admin.deleteUser(userId, false);
        if (removed.error) throw new Error("No se pudo borrar el usuario de prueba.");
      }
    }
  });
});
