import { expect, test } from "@playwright/test";

/**
 * M86: billetera y depósitos en modo demo/mock.
 *
 * `/app/billetera`: USDC disponible, SOL para la red, dirección, actividad
 * y los accesos Depositar/Enviar/Recibir.
 *
 * `/app/billetera/depositar`: pestañas "Con pesos" / "Con USDC"
 * (tablist "Forma de depósito"). En demo con `REAL_TRADING_READY=false`
 * la cotización en pesos falla (`POST /api/onramp/session` → 503): la UI
 * muestra su error de cotización y "Continuar con Koywe" queda deshabilitado.
 * La pestaña USDC muestra la dirección, el QR y los pasos de la red Solana.
 *
 * Contratos API de billetera: `GET /api/wallet/balances` y
 * `GET /api/wallet/activity` (200, `ok: true`, `private, no-store`).
 */

/** Sesión demo iniciada. */
async function entrarDemo(page: import("@playwright/test").Page, correo: string) {
  await page.goto("/app/registro");
  await page.getByLabel("Correo").fill(correo);
  await page.getByLabel("Contraseña", { exact: true }).fill("clave12345678");
  await page.getByLabel("Repetir contraseña").fill("clave12345678");
  await page.getByRole("checkbox", { name: /Términos y Condiciones/ }).check();
  await page.getByRole("button", { name: "Crear mi cuenta demo" }).click();
  await expect(page).toHaveURL(/\/app\/?$/);
}

test("billetera: USDC, SOL, dirección y accesos", async ({ page }) => {
  await entrarDemo(page, "m86-deposit-wallet@example.com");
  await page.goto("/app/billetera");

  await expect(page.getByRole("heading", { level: 1, name: "Billetera" })).toBeVisible();
  await expect(page.getByText("USDC disponible")).toBeVisible();
  await expect(page.getByText("Con esto compras acciones.")).toBeVisible();
  await expect(page.getByText("SOL para comisiones de red")).toBeVisible();

  // Accesos de la billetera.
  await expect(page.getByRole("link", { name: "Depositar", exact: true })).toHaveAttribute(
    "href",
    "/app/billetera/depositar",
  );
  await expect(page.getByRole("link", { name: "Enviar", exact: true })).toHaveAttribute(
    "href",
    "/app/billetera/enviar",
  );
  await expect(page.getByRole("link", { name: "Recibir", exact: true })).toHaveAttribute(
    "href",
    "/app/billetera/recibir",
  );

  // La dirección demo (maverlang-demo-wallet-v1) con su copia.
  await expect(page.getByRole("heading", { name: "Tu dirección" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copiar" }).first()).toBeVisible();

  // Actividad (vacía o con movimientos, pero la sección existe).
  await expect(page.getByRole("heading", { name: "Actividad", exact: true })).toBeVisible();
});

test("billetera: USDC y SOL aparecen en la lista de activos", async ({ page }) => {
  await entrarDemo(page, "m86-deposit-assets@example.com");
  await page.goto("/app/billetera");

  await expect(page.getByRole("heading", { name: "Activos" })).toBeVisible();
  const activos = page.getByRole("heading", { name: "Activos" }).locator("xpath=following-sibling::ul");
  await expect(activos).toBeVisible();
  await expect(activos.getByText("USDC", { exact: true })).toBeVisible();
  await expect(activos.getByText("SOL", { exact: true })).toBeVisible();
  await expect(activos.getByText("Dólares digitales")).toBeVisible();
});

test("depósito: pestañas Con pesos / Con USDC", async ({ page }) => {
  await entrarDemo(page, "m86-deposit-tabs@example.com");
  await page.goto("/app/billetera/depositar");

  await expect(page.getByRole("heading", { level: 1, name: "Depositar" })).toBeVisible();
  await expect(page.getByText("Pesos con un proveedor, o USDC por la red Solana.")).toBeVisible();

  const pestanas = page.getByRole("tablist", { name: "Forma de depósito" });
  await expect(pestanas).toBeVisible();
  const pesos = pestanas.getByRole("tab", { name: "Con pesos" });
  const usdc = pestanas.getByRole("tab", { name: "Con USDC" });
  await expect(pesos).toBeVisible();
  await expect(usdc).toBeVisible();

  // La pestaña por defecto es pesos.
  await expect(pesos).toHaveAttribute("aria-selected", "true");
  await expect(usdc).toHaveAttribute("aria-selected", "false");

  // Cambiar a USDC y volver.
  await usdc.click();
  await expect(usdc).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Cómo depositar USDC")).toBeVisible();
  await pesos.click();
  await expect(pesos).toHaveAttribute("aria-selected", "true");
  await expect(page.getByLabel("Monto en CLP")).toBeVisible();
});

test("depósito en pesos: mínimo del proveedor y cotización apagada", async ({ page }) => {
  await entrarDemo(page, "m86-deposit-pesos@example.com");
  await page.goto("/app/billetera/depositar");

  // El mínimo del proveedor es $10.000.
  const monto = page.getByLabel("Monto en CLP");
  await monto.fill("5000");
  await expect(page.getByRole("alert").filter({ hasText: "El mínimo del proveedor es $10.000." })).toBeVisible();

  // Con monto válido se intenta cotizar, pero el dinero real está apagado:
  // el estimado queda en error y Continuar con Koywe deshabilitado.
  await monto.fill("50000");
  await expect(page.getByText(/No pudimos calcular el depósito|Calculando el estimado/)).toBeVisible();
  await expect(page.getByText("No pudimos calcular el depósito.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Continuar con Koywe" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Otros métodos" })).toBeDisabled();
});

test("depósito en USDC: pasos de la red Solana y dirección", async ({ page }) => {
  await entrarDemo(page, "m86-deposit-usdc@example.com");
  await page.goto("/app/billetera/depositar");

  await page.getByRole("tab", { name: "Con USDC" }).click();

  await expect(page.getByText("Envía USDC desde otro servicio a tu dirección, por la red Solana.")).toBeVisible();
  await expect(page.getByLabel("Cómo depositar USDC")).toBeVisible();
  await expect(page.getByText("En el servicio desde el que envías, elige enviar USDC.")).toBeVisible();
  await expect(page.getByText(/Red: Solana\. Si eliges otra, el envío no llega/)).toBeVisible();

  // Advertencias: sólo red Solana y sólo USDC.
  await expect(page.getByText("Sólo red Solana. Si eliges otra, el USDC no llega.")).toBeVisible();
  await expect(page.getByText("Envía sólo USDC. Otros activos pueden perderse.")).toBeVisible();

  // QR de la dirección con su texto accesible.
  await expect(page.getByRole("img", { name: "Código QR de tu dirección para recibir USDC en Solana" })).toBeVisible();
  // La dirección demo visible bajo el QR.
  await expect(page.getByText("8MydrPjqgPoNBXrRNPdbX1WCcNvBioNL2E9e2XQ4pQNT")).toBeVisible();
});

test("contratos API: balances y actividad de la billetera", async ({ page }) => {
  await entrarDemo(page, "m86-deposit-api@example.com");

  const balances = await page.evaluate(async () => {
    const response = await fetch("/api/wallet/balances", { credentials: "same-origin" });
    return {
      status: response.status,
      cacheControl: response.headers.get("cache-control"),
      json: (await response.json()) as unknown,
    };
  });
  expect(balances.status).toBe(200);
  expect(balances.cacheControl).toBe("private, no-store");
  const balancesData = balances.json as {
    ok: true;
    data: { symbol: string; uiAmount: number }[];
  };
  expect(balancesData.ok).toBe(true);
  const symbols = balancesData.data.map((row) => row.symbol);
  expect(symbols).toContain("USDC");
  expect(symbols).toContain("SOL");
  const usdc = balancesData.data.find((row) => row.symbol === "USDC");
  expect(usdc?.uiAmount).toBeGreaterThan(0);

  const activity = await page.evaluate(async () => {
    const response = await fetch("/api/wallet/activity", { credentials: "same-origin" });
    return {
      status: response.status,
      cacheControl: response.headers.get("cache-control"),
      json: (await response.json()) as unknown,
    };
  });
  expect(activity.status).toBe(200);
  expect(activity.cacheControl).toBe("private, no-store");
  const activityData = activity.json as { ok: true; data: unknown[] };
  expect(activityData.ok).toBe(true);
  expect(Array.isArray(activityData.data)).toBe(true);
});

test("contratos API: reinicio demo responde y el saldo vuelve a 10.000 USDC", async ({ page }) => {
  await entrarDemo(page, "m86-deposit-reset@example.com");

  const reset = await page.evaluate(async () => {
    const response = await fetch("/api/demo/reset", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({}),
    });
    return { status: response.status, json: (await response.json()) as unknown };
  });
  expect(reset.status).toBe(200);
  expect((reset.json as { ok: boolean }).ok).toBe(true);

  // El saldo de la billetera vuelve al inicial (10.000 USDC).
  const balances = await page.evaluate(async () => {
    const response = await fetch("/api/wallet/balances", { credentials: "same-origin" });
    return (await response.json()) as { ok: boolean; data: { symbol: string; uiAmount: number }[] };
  });
  const usdc = balances.data.find((row) => row.symbol === "USDC");
  expect(usdc?.uiAmount).toBe(10_000);
});
