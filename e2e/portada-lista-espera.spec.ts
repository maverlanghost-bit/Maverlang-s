import { expect, test } from "@playwright/test";

/**
 * M45: la portada lleva al registro de la demo, la lista de espera confirma
 * y los logos siguen visibles con el flag por defecto (`on`).
 * Corre en mock: sin Supabase, `/api/waitlist` valida y responde 200.
 */
test("portada: demo gratis, lista de espera y logos", async ({ page }) => {
  await page.goto("/");

  const cta = page.getByRole("link", { name: "Prueba la demo gratis" }).first();
  await expect(cta).toBeVisible();
  await expect(cta).toHaveAttribute("href", "/app/registro");
  await cta.click();
  await expect(page).toHaveURL(/\/app\/registro/);

  await page.goto("/");
  await expect(page.getByText("Practica con US$1.000 ficticios y precios reales.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Avísame cuando abra la cuenta Real" })).toBeVisible();

  const waitlist = page.getByRole("form", { name: "Lista de espera" });
  await waitlist.getByLabel("Correo").fill("demo-lista@example.com");
  await waitlist.getByRole("checkbox", { name: /contacten/ }).check();
  await waitlist.getByRole("button", { name: "Avísame" }).click();
  await expect(waitlist.getByText("¡Listo! Te avisaremos.")).toBeVisible();

  await page.goto("/");
  await expect(page.locator('img[src*="logos"]').first()).toBeVisible();
});
