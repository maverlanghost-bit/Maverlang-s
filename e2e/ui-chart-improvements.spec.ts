import { expect, test, type Page } from "@playwright/test";

/** El arnés usa auth, precios y datos mock; no firma ni ejecuta operaciones. */
async function entrarDemo(page: Page) {
  await page.goto("/app/registro");
  await page.getByLabel("Correo").fill("ui-charts-demo@example.com");
  await page.getByLabel("Contraseña", { exact: true }).fill("clave12345678");
  await page.getByLabel("Repetir contraseña").fill("clave12345678");
  await page.getByRole("checkbox", { name: /Términos y Condiciones/ }).check();
  await page.getByRole("button", { name: "Crear mi cuenta demo" }).click();
  await expect(page).toHaveURL(/\/app\/?$/);
  // La cuenta mock puede compartir preferencias con otras pruebas. Preservamos
  // sus demás opciones y fijamos la moneda que verifican estos casos.
  const currencySet = await page.evaluate(async () => {
    const current = await fetch("/api/me/preferences", { credentials: "same-origin" });
    if (!current.ok) return false;
    const result = await current.json();
    if (!result.ok || !result.data) return false;
    const updated = await fetch("/api/me/preferences", {
      method: "PUT",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...result.data, displayCurrency: "CLP" }),
    });
    return updated.ok;
  });
  expect(currencySet).toBe(true);
}

/** Historiales ficticios alineados; sólo afectan gráficos, no cotizaciones ni saldos. */
async function usarHistorialVisualDemo(page: Page) {
  const state = { failThreeMonths: false };
  const returns: Record<string, number> = { aaplx: 0.10, nvdax: 0.20, tslax: -0.10, msftx: 0.05, spyx: 0.03, googlx: 0.15, amznx: -0.05 };
  const pointsFor = (symbol: string) => {
    const key = symbol.toLowerCase();
    const change = returns[key] ?? (([...key].reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) % 401, 0) - 200) / 1000);
    return [
      { t: Date.UTC(2026, 9, 1), p: 100 },
      { t: Date.UTC(2026, 9, 2), p: 100 * (1 + change / 2) },
      { t: Date.UTC(2026, 9, 3), p: 100 * (1 + change) },
    ];
  };
  await page.route("**/api/tickers/*/history?*", (route) => {
    const symbol = decodeURIComponent(new URL(route.request().url()).pathname.split("/").at(-2) ?? "");
    return route.fulfill({ json: { ok: true, data: { points: pointsFor(symbol), source: "mock", real: false } } });
  });
  await page.route("**/api/tickers/history?*", (route) => {
    const params = new URL(route.request().url()).searchParams;
    if (state.failThreeMonths && params.get("range") === "3M") {
      return route.fulfill({ status: 503, json: { ok: false, error: { code: "UPSTREAM", message: "Fallo de prueba" } } });
    }
    const symbols = (params.get("symbols") ?? "").split(",").filter(Boolean);
    return route.fulfill({ json: { ok: true, data: { series: symbols.map((symbol) => ({ symbol, points: pointsFor(symbol), source: "mock", real: false })) } } });
  });
  return state;
}

test("ficha demo: rangos, pestañas y capas del gráfico ampliado", async ({ page }, testInfo) => {
  await entrarDemo(page);
  await page.goto("/app/accion/NVDAx");
  await expect(page.getByRole("heading", { level: 1, name: "NVIDIA", exact: true })).toBeVisible();
  const chart = page.locator("section[data-range]");
  const ranges = page.getByRole("group", { name: "Rango del gráfico", exact: true });
  await expect(ranges).toBeVisible();
  await ranges.getByRole("button", { name: "1M", exact: true }).click();
  await expect(chart).toHaveAttribute("data-range", "1M");
  for (const name of ["Empresa", "Token y riesgos", "Resumen"]) {
    await page.getByRole("tab", { name, exact: true }).click();
    await expect(page.getByRole("tab", { name, exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(chart).toBeVisible();
    await expect(chart).toHaveAttribute("data-range", "1M");
  }
  await expect(chart.locator("canvas").first()).toBeVisible();
  const desktopEvidence = testInfo.outputPath("ficha-desktop.png");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: desktopEvidence, fullPage: true, animations: "disabled" });
  await testInfo.attach("Ficha desktop", { path: desktopEvidence, contentType: "image/png" });

  await chart.getByRole("button", { name: "Pantalla completa", exact: true }).click();
  const full = page.getByRole("dialog", { name: "Gráfico de NVIDIA" });
  await expect(full).toBeVisible();
  await full.getByRole("button", { name: "Herramientas del gráfico" }).click();
  const tools = page.getByRole("dialog", { name: "Herramientas del gráfico" });
  await expect(tools).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(tools).toBeHidden();
  await expect(full).toBeVisible();

  // El explorador es accesible por teclado y revela la tabla dentro de una hoja.
  const tableButton = full.getByRole("button", { name: "Ver tabla de datos" });
  await tableButton.focus();
  await tableButton.click();
  const data = page.getByRole("dialog", { name: "Datos del gráfico" });
  await expect(data).toBeVisible();
  await expect(data.getByRole("table").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(data).toBeHidden();
  await expect(full).toBeVisible();
  await full.getByRole("button", { name: "Salir de pantalla completa", exact: true }).click();
  await expect(full).toBeHidden();
});

test("ficha demo a 360 px: gráfico y pestañas sin desborde horizontal", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await entrarDemo(page);
  await page.goto("/app/accion/NVDAx");
  const chart = page.locator("section[data-range]");
  await expect(chart).toBeVisible();
  await page.getByRole("tab", { name: "Empresa", exact: true }).click();
  await expect(chart).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await expect(chart.locator("canvas").first()).toBeVisible();
  const mobileEvidence = testInfo.outputPath("ficha-360.png");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: mobileEvidence, fullPage: true, animations: "disabled" });
  await testInfo.attach("Ficha 360 px", { path: mobileEvidence, contentType: "image/png" });
  for (const width of [390, 430]) {
    await page.setViewportSize({ width, height: 800 });
    await expect(chart).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  }
});

test("screener demo: selección limitada a cuatro y comparador en URL", async ({ page }, testInfo) => {
  await entrarDemo(page);
  await usarHistorialVisualDemo(page);
  await page.goto("/app/screener");
  const choices = page.getByRole("checkbox", { name: /^Comparar .* · / }).filter({ visible: true });
  await expect.poll(() => choices.count()).toBeGreaterThanOrEqual(5);
  const symbols: string[] = [];
  for (let i = 0; i < 4; i += 1) {
    const choice = choices.nth(i);
    const label = await choice.getAttribute("aria-label");
    symbols.push(label!.split(" · ").at(-1)!);
    await choice.check();
  }
  await expect(choices.nth(4)).toBeDisabled();
  const selection = page.getByLabel("Selección para comparar");
  await expect(selection).toContainText("4/4");
  await selection.getByRole("link", { name: "Comparar selección" }).click();
  await expect(page).toHaveURL(/\/app\/comparar\?/);
  await expect(page.getByRole("heading", { name: "Comparar activos" })).toBeVisible();
  const selected = new URL(page.url()).searchParams.get("activos")?.split(",") ?? [];
  expect(selected).toEqual(symbols);
  const assets = page.getByRole("region", { name: "Activos seleccionados" });
  for (const symbol of symbols) await expect(assets.getByRole("button", { name: `Quitar ${symbol}`, exact: true })).toBeVisible();
  const legend = page.getByLabel("Series del gráfico");
  const legendButtons = legend.getByRole("button");
  await expect(legendButtons).toHaveCount(4);
  await expect(page.getByText(/^Ventana común:/)).toBeVisible();
  for (let i = 0; i < 4; i += 1) await expect(legendButtons.nth(i)).toContainText("%");
  await expect(page.getByRole("slider", { name: symbols[0], exact: true })).toBeEnabled();
  await expect(page.locator('[data-chart-engine="lightweight-charts"] canvas').first()).toBeVisible();
  await page.mouse.move(0, 0);
  await legendButtons.first().focus();
  await expect(legendButtons.first()).toHaveCSS("opacity", "1");
  // El foco atenúa curvas; las etiquetas siguen legibles y operables.
  await expect(legendButtons.nth(1)).toHaveCSS("opacity", "1");
  await page.keyboard.press("Tab");
  await expect(legendButtons.nth(1)).toBeFocused();
  await expect(legendButtons.first()).toHaveCSS("opacity", "1");
  await expect(legendButtons.nth(1)).toHaveCSS("opacity", "1");
  const comparisonEvidence = testInfo.outputPath("comparador-seleccion.png");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: comparisonEvidence, fullPage: true, animations: "disabled" });
  await testInfo.attach("Comparador con selección", { path: comparisonEvidence, contentType: "image/png" });
  await legendButtons.nth(1).blur();
});

test("comparador demo: distingue historial vacío de error", async ({ page }) => {
  await entrarDemo(page);
  // Fixture explícito: AAPLx sin registros y NVDAx con fallo de red simulado.
  await page.route("**/api/tickers/*/history?*", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.includes("AAPLx")) {
      await route.fulfill({ json: { ok: true, data: { points: [], source: "mock", real: false } } });
    } else if (url.pathname.includes("NVDAx")) {
      await route.fulfill({ status: 503, json: { ok: false, error: { code: "UPSTREAM", message: "Fallo simulado" } } });
    } else {
      await route.continue();
    }
  });
  await page.goto("/app/comparar?activos=AAPLx%2CNVDAx");
  await expect(page.getByText("No pudimos cargar algunos historiales")).toBeVisible();
  await expect(page.getByText(/Sin historial comparable:/)).toContainText("AAPLx");
  await expect(page.getByRole("button", { name: "Reintentar historiales" })).toBeVisible();
});

test("fixture OHLCV: velas, volumen y tabla con unidades explícitas", async ({ page }) => {
  await entrarDemo(page);
  // Datos ficticios de prueba; simulan la forma de barras Yahoo del subyacente,
  // no cotizaciones actuales ni llamadas al proveedor externo.
  const bars = Array.from({ length: 30 }, (_, i) => {
    const open = 100 + i;
    return { t: Date.UTC(2026, 9, 1 + i), o: open, h: open + 3, l: open - 1, c: open + 2, p: open + 2, v: 100_000 + i * 100 };
  });
  await page.route("**/api/tickers/NVDAx/history?*", async (route) => {
    await route.fulfill({ json: { ok: true, data: {
      points: bars,
      source: "closes",
      real: true,
      metadata: {
        instrument: "underlying", provider: "yahoo", providerSymbol: "NVDA",
        resolution: "1d", priceUnit: "usd_per_share", reference: true,
        capabilities: { ohlc: true, volume: true }, volumeUnit: "underlying_shares",
        volumeScope: "underlying_market", priceAdjustment: "provider_quote", multiplier: 1,
      },
    } } });
  });
  await page.goto("/app/accion/NVDAx");
  const chart = page.locator("section[data-range]");
  await chart.getByRole("button", { name: "Técnico", exact: true }).click();
  await chart.getByRole("button", { name: "Herramientas del gráfico" }).click();
  const tools = page.getByRole("dialog", { name: "Herramientas del gráfico" });
  const candles = tools.getByRole("button", { name: "Velas", exact: true });
  const volume = tools.getByRole("button", { name: "Volumen del subyacente (acciones)", exact: true });
  await expect(candles).toBeEnabled();
  await expect(volume).toBeEnabled();
  await candles.click();
  await volume.click();
  await expect(candles).toHaveAttribute("aria-pressed", "true");
  await expect(volume).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await expect(chart.locator("canvas").first()).toBeVisible();
  await expect(chart.getByText(/Barras del subyacente · referencia.*Yahoo Finance/)).toBeVisible();

  const tableButton = chart.getByRole("button", { name: "Ver tabla de datos" });
  await tableButton.focus();
  await tableButton.click();
  let data = page.getByRole("dialog", { name: "Datos del gráfico" });
  await expect(data.getByRole("columnheader", { name: "Apertura (CLP)" })).toBeVisible();
  await expect(data.getByRole("columnheader", { name: "Cierre (CLP)" })).toBeVisible();
  await expect(data.getByRole("columnheader", { name: "Volumen del subyacente (acciones)" })).toBeVisible();
  await expect(data.getByRole("row")).toHaveCount(31);
  await page.keyboard.press("Escape");

  // La escala porcentual desactiva velas; la tabla mantiene precios y cambio.
  await chart.getByRole("button", { name: "Herramientas del gráfico" }).click();
  await tools.getByRole("button", { name: "Escala del eje: porcentaje o precio" }).click();
  await expect(candles).toBeDisabled();
  await page.keyboard.press("Escape");
  await tableButton.focus();
  await tableButton.click();
  data = page.getByRole("dialog", { name: "Datos del gráfico" });
  await expect(data.getByRole("columnheader", { name: "Precio (CLP)" })).toBeVisible();
  await expect(data.getByRole("columnheader", { name: "Variación desde inicio (%)" })).toBeVisible();
  await expect(data.getByRole("columnheader", { name: "Volumen del subyacente (acciones)" })).toBeVisible();
});

test("asistente demo: acciones y feedback del menú con respuesta interceptada", async ({ page }) => {
  await entrarDemo(page);
  let replies = 0;
  await page.route("**/api/ai/chat", async (route) => {
    replies += 1;
    await route.fulfill({ json: { ok: true, text: `Respuesta de prueba ${replies}.`, widgets: [] } });
  });
  await page.goto("/app/asistente");
  await page.getByLabel("Escribe tu pregunta").fill("Pregunta de prueba");
  await page.getByRole("button", { name: "Enviar", exact: true }).click();
  const conversation = page.getByRole("list", { name: "Conversación" });
  await expect(conversation.getByText("Respuesta de prueba 1.")).toBeVisible();
  const actions = page.getByRole("group", { name: "Acciones de la respuesta" });
  await expect(actions.getByRole("button", { name: "Copiar respuesta" })).toBeVisible();
  await expect(actions.getByRole("button", { name: "Escuchar respuesta" })).toBeVisible();
  await actions.getByRole("button", { name: "Más acciones de la respuesta" }).click();
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("menuitemcheckbox", { name: "Respuesta útil" })).toBeVisible();
  await expect(menu.getByRole("menuitemcheckbox", { name: "Respuesta poco útil" })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: "Compartir respuesta" })).toBeVisible();
  await menu.getByRole("menuitemcheckbox", { name: "Respuesta útil" }).click();
  await actions.getByRole("button", { name: "Más acciones de la respuesta" }).click();
  await expect(menu.getByRole("menuitemcheckbox", { name: "Respuesta útil" })).toHaveAttribute("aria-checked", "true");
  await menu.getByRole("menuitem", { name: "Regenerar respuesta" }).click();
  await expect(conversation.getByText("Respuesta de prueba 2.")).toBeVisible();
  expect(replies).toBe(2);
});

test("móvil demo: cripto, cartera, detalle de posición y favoritas", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await entrarDemo(page);
  const historyFixture = await usarHistorialVisualDemo(page);
  // Fixtures de lectura: no crean posiciones ni realizan operaciones.
  await page.route("**/api/portfolio", (route) => route.fulfill({ json: { ok: true, data: {
    address: "demo-visual-fixture", totalUsd: 1_100, cashUsdc: 1_000,
    positions: [{ symbol: "AAPLx", shares: 1, multiplier: 1, avgCostUsd: 90, priceUsd: 100, valueUsd: 100, pnlUsd: 10, pnlPct: 1 / 9, allocationPct: 100 / 1_100 }],
    pnlUsd: 10, pnlPct: 1 / 9, updatedAt: "2026-11-01T12:00:00.000Z",
  } } }));
  await page.route("**/api/tickers/SOL/history?*", (route) => route.fulfill({ json: { ok: true, data: {
    points: [{ t: Date.UTC(2026, 9, 1), p: 100 }, { t: Date.UTC(2026, 9, 2), p: 105 }, { t: Date.UTC(2026, 9, 3), p: 103 }],
    source: "mock", real: false,
    metadata: { instrument: "demo", provider: "mock", resolution: "1d", priceUnit: "usd_per_token", reference: true, capabilities: { ohlc: false, volume: false } },
  } } }));
  await page.route("**/api/me/favorites", (route) => route.fulfill({ json: { ok: true, data: ["AAPLx"] } }));
  const noOverflow = () => expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);

  await page.goto("/app/cripto/SOL");
  const crypto = page.locator('section[aria-labelledby="precio-cripto-vivo"]');
  await expect(crypto.getByRole("radiogroup", { name: "Rango del gráfico" })).toBeVisible();
  await expect(crypto.locator('[data-chart-engine="lightweight-charts"] canvas').first()).toBeVisible();
  await noOverflow();
  const cryptoEvidence = testInfo.outputPath("cripto-movil.png");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: cryptoEvidence, fullPage: true, animations: "disabled" });
  await testInfo.attach("cripto-movil", { path: cryptoEvidence, contentType: "image/png" });

  await page.goto("/app/cartera");
  const portfolio = page.locator("[data-total][data-cash]");
  await expect(portfolio).toHaveAttribute("data-total", "1100");
  await expect(page.getByText(/Simulación de la composición actual\./)).toBeVisible();
  const portfolioExplorer = page.getByRole("slider", { name: "Simulación de la composición actual" });
  await expect(portfolioExplorer).toBeEnabled();
  await expect(page.locator('[data-chart-engine="lightweight-charts"] canvas').first()).toBeVisible();
  await portfolioExplorer.focus();
  await portfolioExplorer.press("End");
  await expect(portfolio).toHaveAttribute("data-total", "1100");
  await expect(portfolio).toHaveAttribute("data-cash", "1000");
  await portfolioExplorer.blur();
  historyFixture.failThreeMonths = true;
  await page.getByRole("group", { name: "Rango del gráfico" }).getByRole("button", { name: "3M", exact: true }).click();
  await expect(page.getByText("No pudimos cargar el gráfico.")).toBeVisible();
  await expect(page.locator('[data-chart-engine="lightweight-charts"] canvas').first()).toBeVisible();
  await expect(portfolio).toHaveAttribute("data-total", "1100");
  await expect(portfolio).toHaveAttribute("data-cash", "1000");
  historyFixture.failThreeMonths = false;
  await page.getByRole("button", { name: "Reintentar", exact: true }).click();
  await expect(page.getByText("No pudimos cargar el gráfico.")).toBeHidden();
  await expect(portfolioExplorer).toBeEnabled();
  await noOverflow();
  const portfolioEvidence = testInfo.outputPath("cartera-movil.png");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: portfolioEvidence, fullPage: true, animations: "disabled" });
  await testInfo.attach("cartera-movil", { path: portfolioEvidence, contentType: "image/png" });
  await page.getByRole("button", { name: "Opciones de posición: Apple" }).click();
  await page.getByRole("menuitem", { name: "Ver detalle de la posición" }).click();
  const detail = page.getByRole("dialog", { name: "Detalle de la posición" });
  await expect(detail).toBeVisible();
  await expect(detail.getByText("Acciones mostradas")).toBeVisible();
  const positionEvidence = testInfo.outputPath("posicion-movil.png");
  await page.screenshot({ path: positionEvidence, animations: "disabled" });
  await testInfo.attach("posicion-movil", { path: positionEvidence, contentType: "image/png" });
  await detail.getByRole("button", { name: "Cerrar" }).click();
  await expect(detail).toBeHidden();
  await expect(portfolio).toHaveAttribute("data-total", "1100");
  await expect(portfolio).toHaveAttribute("data-cash", "1000");

  await page.goto("/app/favoritas");
  const favorite = page.locator('a[href="/app/accion/AAPLx"]');
  await expect(favorite).toBeVisible();
  await expect(favorite).toContainText("Apple");
  await expect(favorite).toContainText(/\$\s?[\d.]+/);
  await noOverflow();
  const favoritesEvidence = testInfo.outputPath("favoritas-movil.png");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: favoritesEvidence, fullPage: true, animations: "disabled" });
  await testInfo.attach("favoritas-movil", { path: favoritesEvidence, contentType: "image/png" });
});

test("alertas: selector único compartido, elegibilidad y reintento", async ({ page }) => {
  await entrarDemo(page);
  let failSearch = false;
  await page.route("**/api/market/search*", async (route) => {
    const query = new URL(route.request().url()).searchParams.get("q") ?? "";
    if (query === "error" && failSearch) {
      await route.fulfill({ status: 503, json: { ok: false, error: { code: "UPSTREAM", message: "Fallo de prueba" } } });
      return;
    }
    const item = { symbol: "MSFTx", name: "Microsoft", underlying: "MSFT", category: "tech", mint: "fixture", logoUrl: null, enabled: true, halted: false, liquidityUsd: 100000, lowLiquidity: false, curated: true, tradable: true, underReview: false };
    await route.fulfill({ json: { ok: true, data: { items: [item, { ...item, symbol: "FAKEx", name: "No disponible", tradable: false }], total: 2, page: 1, pageSize: 12, hasMore: false } } });
  });
  await page.goto("/app/alertas");
  const picker = page.getByRole("button", { name: "Buscar acción para crear alerta" });
  await picker.click();
  const dialog = page.getByRole("dialog", { name: "Seleccionar activo" });
  const search = dialog.getByRole("combobox", { name: "Buscar por nombre o símbolo" });
  await search.fill("Microsoft");
  await expect(dialog.getByRole("option", { name: /MSFTx/ })).toBeVisible();
  await expect(dialog.getByRole("option", { name: /FAKEx/ })).toHaveCount(0);
  await search.press("Enter");
  await expect(dialog).toBeHidden();
  await expect(page.getByText("Microsoft", { exact: true })).toBeVisible();
  await expect(picker).toBeEnabled();

  failSearch = true;
  await page.getByRole("button", { name: "AAPLx", exact: true }).click();
  await picker.click();
  await search.fill("error");
  await expect(dialog.getByText("No pudimos cargar las acciones")).toBeVisible();
  failSearch = false;
  await dialog.getByRole("button", { name: "Reintentar acciones" }).click();
  await expect(dialog.getByRole("option", { name: /MSFTx/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});
