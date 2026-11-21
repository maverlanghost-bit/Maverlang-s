import { expect, test } from "@playwright/test";

/**
 * M86: regresión del mercado `/app` en modo mock.
 *
 * - El catálogo disponible en scope `curated` lista
 *   acciones y ETFs con su contador "N acciones".
 * - Filtro por categoría (panel "Filtros"): ETFs deja sólo ETFs.
 * - Buscador en vivo ( diálogo "Buscar acciones", combobox con listbox).
 * - Precios en USD aunque el navegador conserve una preferencia CLP.
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

/** Total del catálogo según el contador "Mostrando N de TOTAL acciones". */
async function totalAcciones(page: import("@playwright/test").Page): Promise<number> {
  const contador = page.getByText(/^Mostrando \d+ de [\d.]+ acciones$/);
  await expect(contador).toBeVisible();
  const texto = (await contador.textContent()) ?? "";
  const match = /de ([\d.]+) acciones/.exec(texto);
  expect(match, `contador: ${texto}`).not.toBeNull();
  return Number(match![1].replace(/\./g, ""));
}

/** La lista carga de a 20: pide más hasta que aparezca la fila. */
async function mostrarFila(page: import("@playwright/test").Page, href: string) {
  const catalogo = page.getByRole("region", { name: "Acciones" });
  const fila = catalogo.locator(`a[href="${href}"]`).first();
  const mas = catalogo.getByRole("button", { name: /^Cargar \d+ más$/ });
  for (let intento = 0; intento < 30 && !(await fila.isVisible()); intento += 1) {
    if (!(await mas.isVisible())) break;
    const cantidad = await catalogo.locator('ul > li').count();
    await mas.click();
    await expect.poll(() => catalogo.locator('ul > li').count()).toBeGreaterThan(cantidad);
  }
  await expect(fila).toBeVisible();
}

test("mercado: catálogo con contador, acciones y ETFs", async ({ page }) => {
  await entrarDemo(page);
  await expect(page.getByRole("heading", { name: "Mercado" })).toBeVisible();

  // Contador del catálogo disponible en el modo mock.
  const total = await totalAcciones(page);
  expect(total).toBeGreaterThanOrEqual(20);

  // La lista muestra acciones y ETFs del catálogo.
  const catalogo = page.getByRole("region", { name: "Acciones" });
  await expect(catalogo.getByRole("list")).toBeVisible();
  await mostrarFila(page, "/app/accion/SPYx");
  await mostrarFila(page, "/app/accion/NVDAx");
  await mostrarFila(page, "/app/accion/AAPLx");

  // Encabezado de la lista con el conteo visible.
  await expect(page.getByText(new RegExp(`Mostrando \\d+ de ${total} acciones`))).toBeVisible();
});

test("mercado: filtro ETFs deja sólo ETFs y actualiza la URL", async ({ page }) => {
  await entrarDemo(page);
  const total = await totalAcciones(page);

  // La categoría se selecciona dentro del panel de filtros.
  const catalogo = page.getByRole("region", { name: "Acciones" });
  await catalogo.getByRole("button", { name: /^Filtros/ }).click();
  const dialogoFiltros = page.getByRole("dialog", { name: "Filtros", exact: true });
  const categoria = dialogoFiltros.getByRole("combobox", { name: "Categoría", exact: true });
  await expect(categoria).toBeVisible();
  await categoria.selectOption("etf");
  await dialogoFiltros.getByRole("button", { name: "Ver resultados" }).click();

  await expect.poll(() => totalAcciones(page)).toBeLessThan(total);
  const etfs = await totalAcciones(page);
  expect(etfs).toBeGreaterThan(0);
  await mostrarFila(page, "/app/accion/SPYx");
  // Apple (tech) ya no está en el resultado filtrado.
  await expect(catalogo.locator('a[href="/app/accion/AAPLx"]')).toHaveCount(0);
  // El filtro se refleja en la URL (router.replace sin scroll).
  await expect(page).toHaveURL(/filtro=etf/);

  // Volver a Todas restaura el catálogo completo.
  await catalogo.getByRole("button", { name: "Quitar filtro: ETFs" }).click();
  await expect(page).not.toHaveURL(/filtro=etf/);
  await expect.poll(() => totalAcciones(page)).toBe(total);
  await mostrarFila(page, "/app/accion/AAPLx");
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

test("mercado: muestra USD con una preferencia CLP anterior", async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem("mv_currency", "CLP"));
  await entrarDemo(page);
  await totalAcciones(page);
  await mostrarFila(page, "/app/accion/AAPLx");

  const apple = page.getByRole("region", { name: "Acciones" }).locator('a[href="/app/accion/AAPLx"]').first();
  await expect(apple).toContainText(/US\$228,40/);
  await page.getByRole("button", { name: /Cuenta demo\. Ir a tu perfil/ }).click();
  const menu = page.getByRole("menu", { name: "Ir a tu perfil" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("radiogroup", { name: "Moneda" })).toHaveCount(0);
});

test("mercado: la fila lleva a la ficha con volver al mercado", async ({ page }) => {
  await entrarDemo(page);
  await mostrarFila(page, NVDA_HREF);
  const marketUrl = new URL(page.url());
  const nvda = page.getByRole("region", { name: "Acciones" }).locator(`a[href="${NVDA_HREF}"]`);
  await nvda.click();
  await expect(page).toHaveURL(new RegExp(`${NVDA_HREF.replace("/", "\\/")}$`));
  await expect(page.getByRole("heading", { level: 1, name: "NVIDIA" })).toBeVisible();

  const volver = page.getByRole("link", { name: "Volver al mercado" });
  await expect(volver).toHaveAttribute("href", marketUrl.pathname + marketUrl.search);
  await volver.click();
  await expect(page).toHaveURL(marketUrl.href);
  await expect(page.getByRole("heading", { name: "Mercado" })).toBeVisible();
});
