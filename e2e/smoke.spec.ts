import { expect, test } from "@playwright/test";

test("smoke con datos mock", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { level: 1, name: "Acciones de EE.UU. tokenizadas, en tu billetera" }),
  ).toBeVisible();

  await page.goto("/app");
  await expect(page).toHaveURL(/\/app\/?$/);
  await expect(page.getByRole("heading", { name: "Mercado" })).toBeVisible();

  await page.goto("/app/ingresar");
  await expect(page.getByRole("heading", { name: "Ingresa o crea tu cuenta" })).toBeVisible();

  await page.getByRole("button", { name: "Continuar con correo" }).click();
  await expect(page).toHaveURL(/\/app\/onboarding/);
  await expect(page.getByRole("heading", { name: "¿Dónde vives?" })).toBeVisible();

  await page.getByRole("combobox", { name: "País de residencia" }).click();
  await page.getByRole("option", { name: "Chile", exact: true }).click();
  await page.getByRole("button", { name: "Continuar" }).click();

  await page.getByRole("checkbox", { name: /No soy ciudadano ni residente/ }).check();
  await page.getByRole("button", { name: "Continuar" }).click();

  await expect(page.getByRole("heading", { name: "Términos y riesgos" })).toBeVisible();
  const consents = page.getByRole("checkbox");
  await expect(consents).toHaveCount(3);
  for (let index = 0; index < 3; index += 1) {
    await consents.nth(index).check();
  }
  await page.getByRole("button", { name: "Continuar" }).click();

  await expect(page.getByText("Lista", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByRole("button", { name: "Explorar acciones" }).click();

  await expect(page).toHaveURL(/\/app\/?$/);
  await expect(page.getByRole("heading", { name: "Mercado" })).toBeVisible();

  await page.getByRole("searchbox", { name: "Buscar acciones" }).fill("AAPL");
  await page.getByRole("link", { name: /AAPLx/ }).click();
  await expect(page).toHaveURL(/\/app\/accion\/AAPLx/);

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
  const apple = page.locator('a[href="/app/accion/AAPLx"]');
  await expect(apple).toBeVisible();
  await expect(apple).toContainText(/acc\./);

  await page.goto("/app/billetera/enviar");
  await page.getByLabel("Destino").fill("no-es-una-direccion");
  await expect(page.getByRole("alert").filter({ hasText: "La dirección no es válida." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Revisar" })).toBeDisabled();

  await page.goto("/app/perfil");
  await page.getByRole("link", { name: "Ajustes" }).click();
  await expect(page.getByRole("heading", { name: "Ajustes" })).toBeVisible();
  await page.getByRole("radio", { name: "English" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Market" })).toBeVisible();
});

test("visita el detalle sin sesión", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  const response = await page.goto("/app/accion/AAPLx");
  expect(response?.status()).toBe(200);
  expect(response?.request().redirectedFrom()).toBeNull();
  await expect(page).toHaveURL(/\/app\/accion\/AAPLx$/);
  await expect(page.getByRole("heading", { level: 1, name: "Apple" })).toBeVisible();
  await expect(page.getByText(/\$\s?[\d.]+/).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Crear cuenta para invertir" }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Tu posición" })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Secciones" })).toHaveCount(0);

  await page.goto("/app/cartera");
  await expect(page).toHaveURL(/\/app\/ingresar\?next=/);
  expect(decodeURIComponent(new URL(page.url()).searchParams.get("next") ?? "")).toContain("/app/cartera");
  await context.close();
});

test("M48: cabeceras de seguridad y CSP sin violaciones", async ({ page }) => {
  const cspErrors: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("Content Security Policy")) cspErrors.push(message.text());
  });

  const policies: string[] = [];
  for (const path of ["/", "/app"]) {
    const response = await page.goto(path);
    expect(response?.status(), `GET ${path}`).toBe(200);
    const headers = response?.headers() ?? {};
    const csp = headers["content-security-policy"] ?? headers["content-security-policy-report-only"];
    expect(csp, `CSP en ${path}`).toBeTruthy();
    if (csp) policies.push(csp);
    expect(headers["x-content-type-options"], `nosniff en ${path}`).toBe("nosniff");
    expect(headers["x-frame-options"], `frame en ${path}`).toBe("DENY");
    expect(headers["referrer-policy"], `referrer en ${path}`).toBe("strict-origin-when-cross-origin");
    expect(headers["cross-origin-opener-policy"], `coop en ${path}`).toBe(
      "same-origin-allow-popups",
    );
    expect(headers["permissions-policy"] ?? "", `permissions en ${path}`).toContain("camera=()");
    expect(headers["strict-transport-security"] ?? "", `hsts en ${path}`).toContain(
      "max-age=63072000",
    );
    expect(headers["x-powered-by"], `sin x-powered-by en ${path}`).toBeUndefined();
  }

  // Nonce distinto en cada solicitud.
  expect(new Set(policies).size, "nonce distinto por solicitud").toBe(policies.length);
  expect(cspErrors, "errores de CSP en consola").toEqual([]);
});
