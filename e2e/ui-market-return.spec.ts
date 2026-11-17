import { expect, test } from "@playwright/test";

test("volver desde ficha conserva filtros públicos y posición de Mercado", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.goto("/app/registro");
  await page.getByLabel("Correo").fill("market-return@example.com");
  await page.getByLabel("Contraseña", { exact: true }).fill("clave12345678");
  await page.getByLabel("Repetir contraseña").fill("clave12345678");
  await page.getByRole("checkbox", { name: /Términos y Condiciones/ }).check();
  await page.getByRole("button", { name: "Crear mi cuenta demo" }).click();
  await expect(page).toHaveURL(/\/app\/?$/);

  const market = page.getByRole("region", { name: "Acciones" });
  await market.getByRole("button", { name: /^Filtros/ }).click();
  const filters = page.getByRole("dialog", { name: "Filtros", exact: true });
  await filters.getByRole("combobox", { name: "Categoría" }).selectOption("etf");
  await filters.getByRole("button", { name: "Ver resultados" }).click();
  await market.getByLabel("Buscar acciones").fill("x");
  await expect(page).toHaveURL(/filtro=etf/);
  await expect(page).toHaveURL(/q=x/);
  const asset = market.locator('a[href="/app/accion/SPYx"]').first();
  await expect(asset).toBeVisible();
  await asset.scrollIntoViewIfNeeded();
  await asset.evaluate((element) => window.scrollTo(0, window.scrollY + element.getBoundingClientRect().top - 300));
  await expect(asset).toBeInViewport();
  const before = await page.evaluate(() => window.scrollY);
  expect(before).toBeGreaterThan(0);
  const expectedUrl = new URL(page.url());
  await asset.click();
  await expect(page).toHaveURL(/\/app\/accion\/SPYx/);
  await page.getByRole("link", { name: "Volver al mercado" }).click();
  await expect(page).toHaveURL(expectedUrl.href);
  await expect(market.getByLabel("Buscar acciones")).toHaveValue("x");
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThanOrEqual(before - 2);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThanOrEqual(before + 2);
  await expect(asset).toBeVisible();
});

test("acceso directo a ficha usa Mercado como destino predeterminado", async ({ page }) => {
  await page.goto("/app/accion/NVDAx");
  await expect(page.getByRole("link", { name: "Volver al mercado" })).toHaveAttribute("href", "/app");
});
