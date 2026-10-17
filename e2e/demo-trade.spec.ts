import { expect, test, type Locator } from "@playwright/test";

/**
 * M86: recorrido completo de la cuenta demo (US$10.000 virtuales).
 *
 * El estado demo es compartido entre pruebas del mismo servidor, así que
 * cada test parte reiniciando la cuenta desde `/app/cartera`.
 *
 * Recorrido: reinicio → cotización y compra de NVDAx → cartera con posición
 * e historial → venta parcial → reinicio final.
 *
 * Los montos se leen del árbol accesible (`ariaSnapshot`) para ser robusto
 * al formateo es-CL (igual que `demo-usd.spec.ts`).
 */

async function monto(locator: Locator) {
  return (await locator.ariaSnapshot()).replace(/[\s"]/g, "");
}

/** Registro demo + sesión iniciada. */
async function entrarDemo(page: import("@playwright/test").Page, correo: string) {
  await page.goto("/app/registro");
  await page.getByLabel("Correo").fill(correo);
  await page.getByLabel("Contraseña", { exact: true }).fill("clave12345678");
  await page.getByLabel("Repetir contraseña").fill("clave12345678");
  await page.getByRole("checkbox", { name: /Términos y Condiciones/ }).check();
  await page.getByRole("button", { name: "Crear mi cuenta demo" }).click();
  await expect(page).toHaveURL(/\/app\/?$/);
  await expect(page.getByRole("heading", { name: "Mercado" })).toBeVisible();
}

/** Reinicia la cuenta demo desde la cartera y espera el saldo inicial. */
async function reiniciarDemo(page: import("@playwright/test").Page) {
  await page.goto("/app/cartera");
  const disponible = page
    .getByRole("heading", { name: "Disponible para invertir" })
    .locator("xpath=following-sibling::div");
  await page.getByRole("button", { name: "Reiniciar cuenta demo" }).click();
  await page.getByRole("button", { name: "Reiniciar", exact: true }).click();
  // US$10.000 × 950 (dólar mock) = $9.500.000 en la vista CLP por defecto.
  await expect.poll(() => monto(disponible)).toContain("$9.500.000");
  return disponible;
}

test("demo: compra NVDAx por US$100 y la cartera se actualiza", async ({ page }) => {
  await entrarDemo(page, "m86-demo-compra@example.com");
  const disponible = await reiniciarDemo(page);

  // Ficha de NVDAx → boleta de compra.
  await page.goto("/app/accion/NVDAx");
  await expect(page.getByRole("heading", { level: 1, name: "NVIDIA", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Comprar", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Comprar NVIDIA" });
  await expect(sheet).toBeVisible();

  // Cotización en vivo: el chip US$ 100 dispara la quote del monto.
  await sheet.getByRole("button", { name: "US$ 100" }).click();
  const review = sheet.getByRole("button", { name: "Revisar" });
  await expect(review).toBeEnabled();

  // La cotización muestra las acciones que recibes antes de confirmar.
  await expect(sheet.getByText(/Recibes ≈ .+ de NVIDIA/)).toBeVisible();
  await review.click();

  // Revisión con desglose de costos y confirmación.
  await expect(sheet.getByText("Precio estimado")).toBeVisible();
  await expect(sheet.getByText("Comisión de red")).toBeVisible();
  await sheet.getByRole("button", { name: "Confirmar" }).click();

  await expect(sheet.getByText("¡Listo!")).toBeVisible();
  await sheet.getByRole("link", { name: "Ver en cartera" }).click();
  await expect(page).toHaveURL(/\/app\/cartera/);

  // La cartera muestra la posición de NVIDIA.
  const nvda = page.locator('a[href="/app/accion/NVDAx"]');
  await expect(nvda).toBeVisible();
  await expect(nvda).toContainText(/acc\./);

  // El disponible bajó: 10.000 − 100 = 9.900 USD × 950 = $9.405.000.
  await expect.poll(() => monto(disponible)).toContain("$9.405.000");
});

test("demo: el historial de órdenes registra la compra", async ({ page }) => {
  await entrarDemo(page, "m86-demo-historial@example.com");
  await reiniciarDemo(page);

  await page.goto("/app/accion/NVDAx");
  await page.getByRole("button", { name: "Comprar", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Comprar NVIDIA" });
  await sheet.getByRole("button", { name: "US$ 50" }).click();
  const review = sheet.getByRole("button", { name: "Revisar" });
  await expect(review).toBeEnabled();
  await review.click();
  await sheet.getByRole("button", { name: "Confirmar" }).click();
  await expect(sheet.getByText("¡Listo!")).toBeVisible();

  // Historial de órdenes en la cartera: compra de NVIDIA confirmada.
  await page.goto("/app/cartera");
  const historial = page.getByRole("heading", { name: "Historial de órdenes" }).locator("xpath=following-sibling::div");
  await expect(historial.getByText(/Compra · NVIDIA/)).toBeVisible();
  await expect(historial.getByText("Confirmada")).toBeVisible();

  // La actividad de la billetera también la registra.
  await page.goto("/app/billetera");
  const actividad = page.getByRole("heading", { name: "Actividad", exact: true }).locator("xpath=following-sibling::*").first();
  await expect(actividad.getByText(/Compra/).first()).toBeVisible();
  void actividad;
});

test("demo: venta parcial desde la cartera", async ({ page }) => {
  await entrarDemo(page, "m86-demo-venta@example.com");
  await reiniciarDemo(page);

  // Compra de 1 acción de NVDAx para poder vender después.
  await page.goto("/app/accion/NVDAx");
  await page.getByRole("button", { name: "Comprar", exact: true }).click();
  const sheetCompra = page.getByRole("dialog", { name: "Comprar NVIDIA" });
  await sheetCompra.getByRole("radio", { name: "Acciones", exact: true }).click();
  await sheetCompra.getByRole("button", { name: "1", exact: true }).click();
  const reviewCompra = sheetCompra.getByRole("button", { name: "Revisar" });
  await expect(reviewCompra).toBeEnabled();
  await reviewCompra.click();
  await sheetCompra.getByRole("button", { name: "Confirmar" }).click();
  await expect(sheetCompra.getByText("¡Listo!")).toBeVisible();

  // Venta parcial desde la cartera (botón Vender de la fila).
  await page.goto("/app/cartera");
  await page.getByRole("link", { name: "Vender NVIDIA" }).click();
  await expect(page).toHaveURL(/\/app\/accion\/NVDAx\?operar=vender/);

  const sheetVenta = page.getByRole("dialog", { name: "Vender NVIDIA" });
  await expect(sheetVenta).toBeVisible();
  // Vender la mitad: 0,5 acciones.
  await sheetVenta.getByLabel("Monto en Acciones").fill("0,5");
  const reviewVenta = sheetVenta.getByRole("button", { name: "Revisar" });
  await expect(reviewVenta).toBeEnabled();
  await reviewVenta.click();
  await expect(sheetVenta.getByText(/Vendes 0,5 acc\. de NVIDIA/)).toBeVisible();
  await sheetVenta.getByRole("button", { name: "Confirmar" }).click();
  await expect(sheetVenta.getByText("¡Listo!")).toBeVisible();

  // La posición baja a 0,5 acc.
  await sheetVenta.getByRole("link", { name: "Ver en cartera" }).click();
  await expect(page).toHaveURL(/\/app\/cartera/);
  const nvda = page.locator('a[href="/app/accion/NVDAx"]');
  await expect(nvda).toContainText(/0,5 acc\./);

  // Historial con la venta registrada.
  const historial = page.getByRole("heading", { name: "Historial de órdenes" }).locator("xpath=following-sibling::div");
  await expect(historial.getByText(/Venta · NVIDIA/)).toBeVisible();
});

test("demo: reinicio de cuenta borra posiciones y vuelve al saldo inicial", async ({ page }) => {
  await entrarDemo(page, "m86-demo-reset@example.com");

  // Compra pequeña para dejar rastro.
  await page.goto("/app/accion/NVDAx");
  await page.getByRole("button", { name: "Comprar", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Comprar NVIDIA" });
  await sheet.getByRole("button", { name: "US$ 10" }).click();
  const review = sheet.getByRole("button", { name: "Revisar" });
  await expect(review).toBeEnabled();
  await review.click();
  await sheet.getByRole("button", { name: "Confirmar" }).click();
  await expect(sheet.getByText("¡Listo!")).toBeVisible();

  await page.goto("/app/cartera");
  await expect(page.locator('a[href="/app/accion/NVDAx"]')).toBeVisible();

  // Reinicio: diálogo de confirmación con su texto claro.
  await page.getByRole("button", { name: "Reiniciar cuenta demo" }).click();
  const dialogo = page.getByRole("dialog", { name: "Reiniciar la cuenta demo" });
  await expect(dialogo.getByText(/Tu cuenta demo vuelve a US\$10\.000/)).toBeVisible();
  await dialogo.getByRole("button", { name: "Reiniciar", exact: true }).click();

  // La posición desaparece y el disponible vuelve al inicial.
  await expect(page.locator('a[href="/app/accion/NVDAx"]')).toHaveCount(0);
  const disponible = page
    .getByRole("heading", { name: "Disponible para invertir" })
    .locator("xpath=following-sibling::div");
  await expect.poll(() => monto(disponible)).toContain("$9.500.000");

  // El historial queda vacío tras el reinicio.
  const historial = page.getByRole("heading", { name: "Historial de órdenes" }).locator("xpath=following-sibling::div");
  await expect(historial.getByText("Todavía no hay órdenes. Cuando compres tu primera acción, la verás aquí.")).toBeVisible();
});
