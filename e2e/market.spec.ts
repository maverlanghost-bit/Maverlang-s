import { expect, test } from "@playwright/test";

/**
 * M86: regresión del mercado `/app` en modo mock.
 *
 * - El catálogo (50 símbolos generados, scope `listed` por defecto) lista
 *   acciones y ETFs con su contador "N acciones".
 * - Filtro por categoría (radiogroup "Filtrar"): ETFs deja sólo ETFs.
 * - Buscador en vivo ( diálogo "Buscar acciones", combobox con listbox).
 * - Cambio de moneda CLP/USD (radiogroup "Moneda" del sidebar; el dólar mock
 *   es 950, así que AAPLx ≈ $216.980 en CLP).
 * - Navegación a la ficha: la ruta real es `/app/accion/NVDAx`.
 */

const NVDA_HREF = "/app/accion/NVDAx";

/** Sesión demo mínima con estado conocido (reinicio incluido). */
async function entrarDemo(page: import("@playwright/test").Page) {
  await page.goto("/app/registro");
  await page.getByLabel("Correo").fill("m86-market@example.com");
  await page.getByLabel("Contraseña", { exact: true }).fill("clave12345678");
  await page.getByLabel("Repetir contraseña").fill("clave12345678");
  await page.getByRole("checkbox", { name: /Términos y Condiciones/ }).check();
  await page.getByRole("button", { name: "Crear mi cuenta demo" }).click();
  await expect(page).toHaveURL(/\/app\/?$/);
  await expect(page.getByRole("heading", { name: "Mercado" })).toBeVisible();
}

test("mercado: catálogo con contador, acciones y ETFs", async ({ page }) => {
  await entrarDemo(page);
  await expect(page.getByRole("heading", { name: "Mercado" })).toBeVisible();

  // Contador del scope listed (50 símbolos en el catálogo generado).
  await expect(page.getByText("50 acciones")).toBeVisible();

  // La lista muestra acciones y ETFs del catálogo.
  const lista = page.getByRole("heading", { name: "Acciones", exact: true }).locator("xpath=following-sibling::ul").first();
  await expect(lista).toBeVisible();
  await expect(page.locator('a[href="/app/accion/AAPLx"]')).toBeVisible();
  await expect(page.locator('a[href="/app/accion/SPYx"]')).toBeVisible();
  await expect(page.locator('a[href="/app/accion/NVDAx"]')).toBeVisible();

  // Encabezado de la lista con el conteo visible.
  await expect(page.getByText(/Mostrando \d+ de 50/)).toBeVisible();
});

test("mercado: filtro ETFs deja sólo ETFs y actualiza la URL", async ({ page }) => {
  await entrarDemo(page);
  await expect(page.getByText("50 acciones")).toBeVisible();

  // El filtro es un radiogroup "Filtrar" con chips.
  const filtros = page.getByRole("radiogroup", { name: "Filtrar" });
  await filtros.getByRole("radio", { name: "ETFs" }).click();

  await expect(page.getByText("4 acciones")).toBeVisible();
  await expect(page.locator('a[href="/app/accion/SPYx"]')).toBeVisible();
  // Apple (tech) ya no está en el resultado filtrado.
  await expect(page.locator('a[href="/app/accion/AAPLx"]')).toHaveCount(0);
  // El filtro se refleja en la URL (router.replace sin scroll).
  await expect(page).toHaveURL(/filtro=etf/);

  // Volver a Todas restaura el catálogo completo.
  await filtros.getByRole("radio", { name: "Todas" }).click();
  await expect(page.getByText("50 acciones")).toBeVisible();
  await expect(page.locator('a[href="/app/accion/AAPLx"]')).toBeVisible();
});

test("mercado: buscador en vivo lleva a la ficha de NVDAx", async ({ page }) => {
  await entrarDemo(page);

  await page.getByRole("button", { name: "Buscar" }).click();
  const dialogo = page.getByRole("dialog", { name: "Buscar acciones" });
  await expect(dialogo).toBeVisible();

  const input = dialogo.getByRole("combobox", { name: "Buscar acciones" });
  await input.fill("nvidia");
  const opcion = dialogo.getByRole("option", { name: /NVDAx|NVIDIA/ });
  await expect(opcion).toBeVisible();
  await opcion.click();

  // Ruta real de la ficha en Maverlang: /app/accion/<SYMBOL>.
  await expect(page).toHaveURL(new RegExp(`${NVDA_HREF.replace("/", "\\/")}$`));
  await expect(page.getByRole("heading", { level: 1, name: "NVIDIA" })).toBeVisible();
});

test("mercado: cambio de moneda CLP/USD en el sidebar", async ({ page }) => {
  await entrarDemo(page);
  await expect(page.getByText("50 acciones")).toBeVisible();

  // Precios en USD por defecto (preferencia inicial de la demo es CLP;
  // el registro demo la fija en CLP, así que primero pasamos a USD).
  // El interruptor vive en el menú del perfil del sidebar.
  await page.getByRole("button", { name: /Cuenta demo\. Ir a tu perfil/ }).click();
  const moneda = page.getByRole("menu", { name: "Ir a tu perfil" }).getByRole("radiogroup", { name: "Moneda" });
  await moneda.getByRole("radio", { name: "Moneda: USD" }).click();
  // Cerrar el menú para que no tape la lista.
  await page.getByRole("button", { name: /Cuenta demo\. Ir a tu perfil/ }).click();

  // Apple a US$ 228,40 (mock): el precio visible cambia de dólares.
  const apple = page.locator('a[href="/app/accion/AAPLx"]');
  await expect(apple).toContainText(/US\$228,40/);

  // A CLP con el dólar mock de 950: 228,40 × 950 = 216.980.
  await moneda.getByRole("radio", { name: "Moneda: CLP" }).click();
  await expect(apple).toContainText(/\$216\.980/);

  // Volver a USD para no dejar la preferencia cruzada en la sesión mock.
  await moneda.getByRole("radio", { name: "Moneda: USD" }).click();
  await expect(apple).toContainText(/US\$228,40/);
});

test("mercado: la fila lleva a la ficha con volver al mercado", async ({ page }) => {
  await entrarDemo(page);
  const nvda = page.locator(`a[href="${NVDA_HREF}"]`);
  await nvda.click();
  await expect(page).toHaveURL(new RegExp(`${NVDA_HREF.replace("/", "\\/")}$`));
  await expect(page.getByRole("heading", { level: 1, name: "NVIDIA" })).toBeVisible();

  const volver = page.getByRole("link", { name: "Volver al mercado" });
  await expect(volver).toHaveAttribute("href", "/app");
  await volver.click();
  await expect(page).toHaveURL(/\/app\/?$/);
  await expect(page.getByRole("heading", { name: "Mercado" })).toBeVisible();
});
