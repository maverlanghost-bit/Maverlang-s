import { expect, test } from "@playwright/test";

/**
 * M43: registro demo mínimo con datos mock.
 * Correo + contraseña + checkbox → entra a /app y ve el mercado.
 * Sin checkbox, el botón muestra el error y no navega.
 */
test("registro demo crea la cuenta y entra al mercado", async ({ page }) => {
  await page.goto("/app/registro");
  await expect(page.getByRole("heading", { name: "Crea tu cuenta demo" })).toBeVisible();

  await page.getByLabel("Correo").fill("demo-e2e@example.com");
  await page.getByLabel("Contraseña", { exact: true }).fill("clave12345678");
  await page.getByLabel("Repetir contraseña").fill("clave12345678");
  await page.getByRole("checkbox", { name: /Términos y Condiciones/ }).check();
  await page.getByRole("button", { name: "Crear mi cuenta demo" }).click();

  await expect(page).toHaveURL(/\/app\/?$/);
  await expect(page.getByRole("heading", { name: "Mercado" })).toBeVisible();
});

test("registro demo sin checkbox muestra el error y no navega", async ({ page }) => {
  await page.goto("/app/registro");
  await expect(page.getByRole("heading", { name: "Crea tu cuenta demo" })).toBeVisible();

  await page.getByLabel("Correo").fill("demo-sin-check@example.com");
  await page.getByLabel("Contraseña", { exact: true }).fill("clave12345678");
  await page.getByLabel("Repetir contraseña").fill("clave12345678");
  await page.getByRole("button", { name: "Crear mi cuenta demo" }).click();

  await expect(
    page.getByText("Debes aceptar los Términos y Condiciones y la Política de Privacidad para continuar."),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/app\/registro/);
});
