import { expect, test, type Page } from "@playwright/test";

/**
 * Flujos de Privy / billetera en modo aislado.
 *
 * Corre sólo con `AUTH_MODE=mock` y `DATA_MODE=mock`: no monta el SDK de Privy,
 * no habla con Supabase, no usa RPC de Solana y no toca fondos. El "Privy" de
 * esta prueba es el proveedor mock local (`MockAuthProvider`) y la billetera
 * demo fija de `lib/auth/demo-user.ts`.
 *
 * Lo que NO se puede verificar aquí: modal real de Privy, alta de wallet
 * embebida, exportación real de la clave, firma en Solana y vinculación
 * Supabase↔Privy. Eso exige app id, red y credenciales externas.
 */

const SESSION_COOKIE = "a24_mock_session";
const ONBOARDING_COOKIE = "a24_onb";
const DEMO_ADDRESS = "8MydrPjqgPoNBXrRNPdbX1WCcNvBioNL2E9e2XQ4pQNT";

/** Aísla la corrida: nada fuera de localhost puede salir ni quedar pendiente. */
const externalRequests: string[] = [];

test.beforeEach(async ({ page }) => {
  externalRequests.length = 0;
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1" || url.hostname === "localhost") {
      await route.continue();
      return;
    }
    externalRequests.push(url.href);
    await route.abort();
  });
});

test.afterEach(() => {
  expect(externalRequests, "la prueba no debe llamar servicios externos").toEqual([]);
});

/** Marca la sesión demo sin pasar por el formulario. */
async function seedDemoSession(page: Page) {
  await page.goto("/");
  const origin = new URL(page.url()).origin;
  await page.context().addCookies([
    { name: SESSION_COOKIE, value: "1", url: origin },
    { name: ONBOARDING_COOKIE, value: "1", url: origin },
  ]);
}

function searchParam(page: Page, key: string): string | null {
  return new URL(page.url()).searchParams.get(key);
}

test("sin sesión, la billetera redirige al ingreso y conserva la vuelta", async ({ page }) => {
  await page.goto("/app/billetera");

  await expect.poll(() => new URL(page.url()).pathname).toBe("/app/ingresar");
  expect(searchParam(page, "next")).toBe("/app/billetera");
  await expect(page.getByRole("heading", { name: "Ingresa o crea tu cuenta" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Continuar con correo" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Continuar con Google" })).toBeEnabled();
  await expect(page.getByText("En este entorno los dos botones abren la cuenta demo.")).toBeVisible();
});

test("ingreso demo: onboarding crea la billetera simulada y vuelve a la billetera", async ({ page }) => {
  await page.goto("/app/ingresar?next=/app/billetera");
  await page.getByRole("button", { name: "Continuar con correo" }).click();

  await expect.poll(() => new URL(page.url()).pathname).toBe("/app/onboarding");
  expect(searchParam(page, "next")).toBe("/app/billetera");
  await expect(page.getByRole("heading", { name: "¿Dónde vives?" })).toBeVisible();

  // Paso 1: residencia y nacionalidad elegibles.
  await page.getByRole("combobox", { name: "País de residencia" }).click();
  await page.getByRole("option", { name: "Chile", exact: true }).click();
  await page.getByRole("combobox", { name: "Nacionalidad" }).click();
  await page.getByRole("option", { name: "Chile", exact: true }).click();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();

  // Paso 2: declaración de no ser persona restringida.
  await expect(page.getByRole("heading", { name: "Declaración" })).toBeVisible();
  await page.getByRole("radio", { name: /Declaro que no soy ciudadano/ }).check();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();

  // Paso 3: aceptación de los tres documentos.
  await expect(page.getByRole("heading", { name: "Términos y riesgos" })).toBeVisible();
  const docs = page.getByRole("checkbox");
  await expect(docs).toHaveCount(3);
  for (let index = 0; index < 3; index += 1) await docs.nth(index).check();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();

  // Paso 4: "conexión" de la billetera simulada. Debe mostrar la dirección demo
  // recortada y habilitar Continuar sólo cuando está lista.
  await expect(page.getByRole("heading", { name: "Tu billetera" })).toBeVisible();
  await expect(page.getByText("Billetera lista", { exact: true })).toBeVisible({ timeout: 5_000 });
  await expect(page.getByLabel(`Dirección ${DEMO_ADDRESS}`)).toBeVisible();
  await expect(page.getByText("Queda asociada a tu cuenta. Lo que compres queda en esta billetera.")).toBeVisible();
  await page.getByRole("button", { name: "Continuar", exact: true }).click();

  // Paso 5: cierre y vuelta al `next` protegido.
  await expect(page.getByRole("heading", { name: "Todo listo" })).toBeVisible();
  await page.getByRole("button", { name: "Explorar acciones" }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe("/app/billetera");
  await expect(page.getByRole("heading", { level: 1, name: "Billetera" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Estás en la demo" })).toBeVisible();
});

test("billetera demo: no expone dirección ni QR en depositar y recibir", async ({ page }) => {
  await seedDemoSession(page);

  await page.goto("/app/billetera");
  await expect(page.getByRole("heading", { level: 1, name: "Billetera" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Estás en la demo" })).toBeVisible();
  await expect(page.getByText("No envíes fondos reales: no hay una dirección de cobro en la demo.")).toBeVisible();
  await expect(page.getByText(DEMO_ADDRESS)).toHaveCount(0);

  await page.goto("/app/billetera/depositar");
  await expect(page.getByRole("heading", { level: 1, name: "Depositar" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Estás en la demo" })).toBeVisible();
  await expect(page.getByText(DEMO_ADDRESS)).toHaveCount(0);
  await expect(page.getByRole("img", { name: /Código QR/ })).toHaveCount(0);

  await page.goto("/app/billetera/recibir");
  await expect(page.getByRole("heading", { level: 1, name: "Recibir" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Estás en la demo" })).toBeVisible();
  await expect(page.getByText(DEMO_ADDRESS)).toHaveCount(0);
  await expect(page.getByRole("img", { name: /Código QR/ })).toHaveCount(0);
});

test("seguridad demo: la exportación de clave no muestra ninguna clave", async ({ page }) => {
  await seedDemoSession(page);
  await page.goto("/app/perfil/seguridad");

  await expect(page.getByRole("heading", { level: 1, name: "Seguridad" })).toBeVisible();
  const methods = page.getByRole("region", { name: "Métodos de ingreso" });
  await expect(methods.getByText("demo@example.com")).toBeVisible();
  await page.getByRole("button", { name: "Exportar clave privada" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(/Con esta clave se pueden enviar tus acciones y tu USDC/)).toBeVisible();
  await dialog.getByRole("button", { name: "Entiendo el riesgo" }).click();
  await expect(dialog.getByText("En esta demo no hay una clave privada. No mostramos ninguna.")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Entiendo el riesgo" })).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "Cerrar" }).first()).toBeVisible();
});

test("cuenta real: no conecta nada y avisa que está próximamente", async ({ page }) => {
  await seedDemoSession(page);
  await page.goto("/app/perfil");

  const accountType = page.getByRole("group", { name: "Tipo de cuenta" });
  await expect(accountType.getByRole("button", { name: "Cuenta demo" })).toHaveAttribute("aria-pressed", "true");
  await accountType.getByRole("button", { name: "Cuenta real" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Estará disponible en poco tiempo" })).toBeVisible();
  await expect(dialog.getByText("La cuenta real estará disponible en poco tiempo.")).toBeVisible();
  await expect(dialog.getByText(/De momento no ofrecemos cuentas reales/)).toHaveCount(0);

  // El panel entra con la animación pop-in; esperarla evita que Playwright
  // confunda el movimiento con inestabilidad y cierre el overlay.
  await dialog.evaluate(async (element) => {
    await Promise.all(
      element.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => undefined)),
    );
  });
  await dialog.getByRole("button", { name: "Conocer la plataforma" }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe("/app");
  await page.goto("/app/perfil");
  const stillDemo = page.getByRole("group", { name: "Tipo de cuenta" });
  await expect(stillDemo.getByRole("button", { name: "Cuenta demo" })).toHaveAttribute("aria-pressed", "true");
  await expect(stillDemo.getByRole("button", { name: "Cuenta real" })).toHaveAttribute("aria-pressed", "false");
});

test("billetera y seguridad demo no desbordan a lo ancho en móvil", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedDemoSession(page);

  for (const [path, heading] of [
    ["/app/billetera", "Billetera"],
    ["/app/billetera/depositar", "Depositar"],
    ["/app/billetera/recibir", "Recibir"],
    ["/app/perfil/seguridad", "Seguridad"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${path} desborda ${overflow}px`).toBeLessThanOrEqual(1);
  }
});

test("cerrar sesión limpia la demo y vuelve a proteger la billetera", async ({ page }) => {
  await seedDemoSession(page);
  await page.goto("/app/perfil/cuenta");

  await expect(page.getByRole("heading", { level: 1, name: "Cuenta" })).toBeVisible();
  await page.getByRole("button", { name: "Cerrar sesión" }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe("/");

  await page.goto("/app/billetera");
  await expect.poll(() => new URL(page.url()).pathname).toBe("/app/ingresar");
  expect(searchParam(page, "next")).toBe("/app/billetera");
});
