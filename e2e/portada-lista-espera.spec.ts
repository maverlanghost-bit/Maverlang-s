import { expect, test } from "@playwright/test";

import { WAITLIST_SUCCESS_MESSAGE } from "../lib/waitlist/message";

/**
 * M45: la portada lleva al registro de la demo, la lista de espera confirma
 * y los logos siguen visibles con el flag por defecto (`on`).
 * Corre en mock con `/api/waitlist` interceptada: responde 200 con el mismo
 * cuerpo de éxito de `postWaitlist`, sin escribir en Supabase real
 * (`next start` carga `.env.local` y la tabla aún no existe).
 */
test("portada: demo gratis, lista de espera y logos", async ({ page }) => {
  await page.goto("/");

  const cta = page.getByRole("link", { name: "Prueba la demo gratis" }).first();
  await expect(cta).toBeVisible();
  await expect(cta).toHaveAttribute("href", "/app/registro");
  await cta.click();
  await expect(page).toHaveURL(/\/app\/registro/);

  await page.goto("/");
  await expect(page.getByText("Practica con US$10.000 ficticios y precios reales.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Avísame cuando abra la cuenta Real" })).toBeVisible();

  let correoEnviado: unknown = null;
  let consentEnviado: unknown = null;
  await page.route("**/api/waitlist", async (route) => {
    let recibido: { email?: unknown; consent?: unknown } = {};
    try {
      recibido = JSON.parse(route.request().postData() ?? "{}") as typeof recibido;
    } catch {
      recibido = {};
    }
    correoEnviado = recibido.email;
    consentEnviado = recibido.consent;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ message: WAITLIST_SUCCESS_MESSAGE }),
    });
  });

  const waitlist = page.getByRole("form", { name: "Lista de espera" });
  await waitlist.getByLabel("Correo").fill("demo-lista@example.com");
  await waitlist.getByRole("checkbox", { name: /contacten/ }).check();
  await waitlist.getByRole("button", { name: "Avísame" }).click();
  await expect(page.getByRole("status").filter({ hasText: WAITLIST_SUCCESS_MESSAGE }).first()).toBeVisible();
  await expect(page.getByRole("form", { name: "Lista de espera" })).toHaveCount(0);
  await expect.poll(() => correoEnviado).toBe("demo-lista@example.com");
  expect(consentEnviado).toBe(true);

  await page.goto("/");
  await expect(page.locator('img[src*="logos"]').first()).toBeVisible();
});
