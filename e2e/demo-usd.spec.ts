import { expect, test } from "@playwright/test";

/**
 * M44: la demo mock parte con US$1.000 ficticios.
 * Registro → cartera en US$1.000 (o su equivalente en CLP con el dólar
 * mock de 950) → comprar US$100 → reiniciar → vuelve a US$1.000.
 * El estado en memoria lo comparten las pruebas, así que se reinicia
 * primero para partir de un estado conocido.
 */
test("demo mock: US$1.000, compra US$100 y reinicio", async ({ page }) => {
  await page.goto("/app/registro");
  await expect(page.getByRole("heading", { name: "Crea tu cuenta demo" })).toBeVisible();

  await page.getByLabel("Correo").fill("demo-usd@example.com");
  await page.getByLabel("Contraseña", { exact: true }).fill("clave12345678");
  await page.getByLabel("Repetir contraseña").fill("clave12345678");
  await page.getByRole("checkbox", { name: /Términos y Condiciones/ }).check();
  await page.getByRole("button", { name: "Crear mi cuenta demo" }).click();

  await expect(page).toHaveURL(/\/app\/?$/);
  await expect(page.getByRole("heading", { name: "Mercado" })).toBeVisible();

  await page.goto("/app/cartera");
  await page.getByRole("button", { name: "Reiniciar cuenta demo" }).click();
  await page.getByRole("button", { name: "Reiniciar", exact: true }).click();
  await expect(page.locator('a[href="/app/accion/AAPLx"]')).toHaveCount(0);
  await expect(page.getByText("$950.000").first()).toBeVisible();

  await page.goto("/app/accion/AAPLx");
  await page.getByRole("button", { name: "Comprar", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: /Comprar Apple/ });
  await sheet.getByRole("button", { name: "US$ 100" }).click();
  const review = sheet.getByRole("button", { name: "Revisar" });
  await expect(review).toBeEnabled();
  await review.click();
  await sheet.getByRole("button", { name: "Confirmar" }).click();
  await expect(sheet.getByText("¡Listo!")).toBeVisible();
  await sheet.getByRole("link", { name: "Ver en cartera" }).click();

  await expect(page).toHaveURL(/\/app\/cartera/);
  await expect(page.getByText("$855.000").first()).toBeVisible();
  await expect(page.locator('a[href="/app/accion/AAPLx"]')).toBeVisible();

  await page.getByRole("button", { name: "Reiniciar cuenta demo" }).click();
  await page.getByRole("button", { name: "Reiniciar", exact: true }).click();
  await expect(page.locator('a[href="/app/accion/AAPLx"]')).toHaveCount(0);
  await expect(page.getByText("$855.000")).toHaveCount(0);
  await expect(page.getByText("$950.000").first()).toBeVisible();
});
