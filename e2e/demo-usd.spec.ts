import { expect, test, type Locator } from "@playwright/test";

/**
 * La demo mock parte con US$10.000 ficticios.
 * Registro → cartera (o su equivalente en CLP con el dólar mock de 950) →
 * comprar US$100 → reiniciar → vuelve al inicial.
 * El estado en memoria lo comparten las pruebas, así que se reinicia
 * primero para partir de un estado conocido.
 *
 * Los montos se leen del árbol accesible (`ariaSnapshot`) para ser robusto
 * al formateo es-CL.
 */
async function monto(locator: Locator) {
  return (await locator.ariaSnapshot()).replace(/[\s"]/g, "");
}
test("demo mock: US$10.000, compra US$100 y reinicio", async ({ page }) => {
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
  const disponible = page
    .getByRole("heading", { name: "Disponible para invertir" })
    .locator("..");
  await page.getByRole("button", { name: "Reiniciar cuenta demo" }).click();
  await page.getByRole("button", { name: "Reiniciar", exact: true }).click();
  await expect(page.locator('a[href="/app/accion/AAPLx"]')).toHaveCount(0);
  await expect.poll(() => monto(disponible)).toContain("$9.500.000");

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
  await expect.poll(() => monto(disponible)).toContain("$9.405.000");
  await expect(page.locator('a[href="/app/accion/AAPLx"]')).toBeVisible();

  await page.getByRole("button", { name: "Reiniciar cuenta demo" }).click();
  await page.getByRole("button", { name: "Reiniciar", exact: true }).click();
  await expect(page.locator('a[href="/app/accion/AAPLx"]')).toHaveCount(0);
  await expect.poll(() => monto(disponible)).not.toContain("$9.405.000");
  await expect.poll(() => monto(disponible)).toContain("$9.500.000");
});
