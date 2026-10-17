import { expect, test } from "@playwright/test";

/**
 * M86: regresión de la ficha `/app/accion/NVDAx`.
 *
 * La ruta real de la ficha es `/app/accion/<SYMBOL>` (no `/app/t/...`).
 * Los rangos del gráfico que existen en la UI son 1W/1M/3M/1Y/ALL,
 * etiquetados 1S/1M/3M/1A/Todo (`t.detail.rangeShort`).
 */

/** Sesión demo mínima. */
async function entrarDemo(page: import("@playwright/test").Page) {
  await page.goto("/app/registro");
  await page.getByLabel("Correo").fill("m86-detail@example.com");
  await page.getByLabel("Contraseña", { exact: true }).fill("clave12345678");
  await page.getByLabel("Repetir contraseña").fill("clave12345678");
  await page.getByRole("checkbox", { name: /Términos y Condiciones/ }).check();
  await page.getByRole("button", { name: "Crear mi cuenta demo" }).click();
  await expect(page).toHaveURL(/\/app\/?$/);
}

test("ficha: encabezado, precio y estadísticas clave de NVDAx", async ({ page }) => {
  await entrarDemo(page);
  await page.goto("/app/accion/NVDAx");

  await expect(page.getByRole("heading", { level: 1, name: "NVIDIA", exact: true })).toBeVisible();
  // Símbolo + subyacente bajo el nombre.
  await expect(page.getByText("NVDAx").first()).toBeVisible();
  await expect(page.getByText("NVDA", { exact: true }).first()).toBeVisible();

  // La demo parte en CLP: pasamos a USD para verificar el precio ancla.
  // El interruptor vive en el menú del perfil del sidebar.
  await page.getByRole("button", { name: /Cuenta demo\. Ir a tu perfil/ }).click();
  const menuPerfil = page.getByRole("menu", { name: "Ir a tu perfil" });
  await menuPerfil.getByRole("radiogroup", { name: "Moneda" }).getByRole("radio", { name: "Moneda: USD" }).click();
  await page.getByRole("button", { name: /Cuenta demo\. Ir a tu perfil/ }).click();

  // Precio mock de NVDAx: US$131,15.
  await expect(page.getByText(/US\$131,15/).first()).toBeVisible();

  // Chips de contexto: token en Solana y categoría Tecnología.
  const chips = page.getByRole("list", { name: "Contexto" });
  await expect(chips).toBeVisible();
  await expect(chips.getByText("Token en Solana")).toBeVisible();
  await expect(chips.getByText("Tecnología")).toBeVisible();

  // Estadísticas clave: el panel "Datos" con precio en dólares y variación 24 h.
  await expect(page.getByRole("heading", { name: "Datos", exact: true })).toBeVisible();
  const stats = page.getByRole("heading", { name: "Datos", exact: true }).locator("xpath=following-sibling::dl").first();
  await expect(stats).toBeVisible();
  await expect(stats.getByText("Precio en dólares")).toBeVisible();
  await expect(stats.getByText("Variación 24 h")).toBeVisible();
  await expect(stats.getByText("Precio de mercado")).toBeVisible();
  await expect(stats.getByText("Liquidez del pozo")).toBeVisible();
  await expect(stats.getByText("Emisor")).toBeVisible();
  await expect(stats.getByText("Backed (xStocks)")).toBeVisible();
});

test("ficha: selector de rango del gráfico 1S/1M/3M/1A/Todo", async ({ page }) => {
  await entrarDemo(page);
  await page.goto("/app/accion/NVDAx");
  await expect(page.getByRole("heading", { level: 1, name: "NVIDIA", exact: true })).toBeVisible();

  // `SegmentedControl` con `toggle` → group con aria-label "Rango del gráfico".
  const rangos = page.getByRole("group", { name: "Rango del gráfico" });
  await expect(rangos).toBeVisible();

  // Los cinco rangos reales de la ficha, con sus etiquetas cortas.
  for (const etiqueta of ["1S", "1M", "3M", "1A", "Todo"]) {
    await expect(rangos.getByRole("button", { name: etiqueta, exact: true })).toBeVisible();
  }

  // Cambio de rango: el subtítulo de variación del período lo refleja.
  await rangos.getByRole("button", { name: "1A", exact: true }).click();
  await expect(page.getByText("Variación en 1 año")).toBeVisible();
  await expect(page.getByText("Máximo en 1 año")).toBeVisible();
  await expect(page.getByText("Mínimo en 1 año")).toBeVisible();

  await rangos.getByRole("button", { name: "1S", exact: true }).click();
  await expect(page.getByText("Variación en 1 semana")).toBeVisible();

  // El panel de precio marca el rango activo (data-range en la sección).
  await expect(page.locator("section[data-range='1W']")).toHaveCount(1);
});

test("ficha: información del token subyacente con mint y emisor", async ({ page }) => {
  await entrarDemo(page);
  await page.goto("/app/accion/NVDAx");

  const token = page.getByRole("heading", { name: "Sobre el token", exact: true }).locator("xpath=following-sibling::*").first();
  await expect(page.getByRole("heading", { name: "Sobre el token", exact: true })).toBeVisible();

  // El lead explica que lo emite Backed, no la marca.
  await expect(
    page.getByText(/Lo emite Backed \(xStocks\), no Maverlang Stocks\. El token está en tu billetera\./),
  ).toBeVisible();

  // Identificador (mint) visible con su enlace a Solscan.
  await expect(page.getByText("Identificador", { exact: true })).toBeVisible();
  await expect(page.getByText("Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh")).toBeVisible();
  const solscan = page.getByRole("link", { name: /Ver en Solscan/ });
  await expect(solscan.first()).toHaveAttribute(
    "href",
    /solscan\.io\/token\/Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh/,
  );
  void token;
});

test("ficha: abre la boleta de compra desde Comprar", async ({ page }) => {
  await entrarDemo(page);
  await page.goto("/app/accion/NVDAx");
  await expect(page.getByRole("heading", { level: 1, name: "NVIDIA", exact: true })).toBeVisible();

  // Sección "Comprar o vender" con el botón Comprar habilitado.
  await expect(page.getByRole("heading", { name: "Comprar o vender" })).toBeVisible();
  const comprar = page.getByRole("button", { name: "Comprar", exact: true });
  await expect(comprar).toBeEnabled();
  await comprar.click();

  const sheet = page.getByRole("dialog", { name: "Comprar NVIDIA" });
  await expect(sheet).toBeVisible();
  // Selector de moneda de la boleta (USD/Acciones) y campo de monto.
  await expect(sheet.getByRole("radio", { name: "USD", exact: true })).toBeVisible();
  await expect(sheet.getByRole("radio", { name: "Acciones", exact: true })).toBeVisible();
  await expect(sheet.getByLabel("Monto en USD")).toBeVisible();
  // Botón Cerrar de la hoja.
  await sheet.getByRole("button", { name: "Cerrar" }).click();
  await expect(sheet).toHaveCount(0);
});

test("ficha: vender deshabilitado sin posición; guest ve CTA de cuenta", async ({ page }) => {
  // Sin sesión: el detalle es público con CTA para crear cuenta.
  await page.goto("/app/accion/NVDAx");
  await expect(page.getByRole("heading", { level: 1, name: "NVIDIA", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Crear cuenta para invertir" }).first()).toBeVisible();
  // El guest no ve "Tu posición" ni "Comprar o vender" operable.
  await expect(page.getByRole("heading", { name: "Tu posición" })).toHaveCount(0);

  // Con sesión demo sin posición: Vender deshabilitado con su hint.
  // El estado demo es compartido: se reinicia para garantizar cero posiciones.
  await entrarDemo(page);
  await page.goto("/app/cartera");
  await page.getByRole("button", { name: "Reiniciar cuenta demo" }).click();
  await page.getByRole("button", { name: "Reiniciar", exact: true }).click();
  await expect(page.locator('a[href="/app/accion/NVDAx"]')).toHaveCount(0);

  await page.goto("/app/accion/NVDAx");
  const vender = page.getByRole("button", { name: "Vender", exact: true }).first();
  await expect(vender).toBeDisabled();
  await expect(page.getByText("Para vender, primero tienes que tener esta acción.")).toBeVisible();
});
