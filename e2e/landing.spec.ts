import { expect, test } from "@playwright/test";

/**
 * M86: regresión de la portada y las páginas públicas.
 *
 * - Portada `/` con H1, CTAs y precios en vivo (mock).
 * - Cambio de idioma ES/EN en `/app/ajustes` (la landing pública no tiene
 *   selector: el idioma se elige dentro de la plataforma).
 * - Legales: `/legal/terminos`, `/legal/privacidad`, `/legal/riesgos`,
 *   `/legal/comisiones` con su aviso de borrador.
 * - `/seguridad` con el marco de custodia y el enlace a riesgos.
 * - Lista de espera: POST `/api/waitlist` interceptado (mismo contrato que
 *   `postWaitlist`), con validación de correo y consentimiento en la UI.
 */

test("portada: héroe, CTAs y aviso de demo", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { level: 1, name: "Acciones de EE.UU. tokenizadas, en tu billetera" }),
  ).toBeVisible();

  const demo = page.getByRole("link", { name: "Prueba la demo gratis" }).first();
  await expect(demo).toHaveAttribute("href", "/app/registro");

  const acciones = page.getByRole("link", { name: "Ver acciones" }).first();
  await expect(acciones).toHaveAttribute("href", "/app");

  await expect(page.getByText("Practica con US$10.000 ficticios y precios reales.")).toBeVisible();
  await expect(page.getByText("Opera 24/7").first()).toBeVisible();
});

test("portada: la lista de espera envía el contrato de /api/waitlist", async ({ page }) => {
  let correoEnviado: unknown = null;
  let consentEnviado: unknown = null;
  let sourceEnviada: unknown = null;
  await page.route("**/api/waitlist", async (route) => {
    let body: { email?: unknown; consent?: unknown; source?: unknown } = {};
    try {
      body = JSON.parse(route.request().postData() ?? "{}") as typeof body;
    } catch {
      body = {};
    }
    correoEnviado = body.email;
    consentEnviado = body.consent;
    sourceEnviada = body.source;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ message: "¡Listo! Te avisaremos." }),
    });
  });

  await page.goto("/");
  const waitlist = page.getByRole("form", { name: "Lista de espera" });
  await waitlist.getByLabel("Correo").fill("m86-landing@example.com");
  await waitlist.getByRole("checkbox", { name: /contacten/ }).check();
  await waitlist.getByRole("button", { name: "Avísame" }).click();

  await expect(page.getByRole("status").filter({ hasText: "¡Gracias por sumarte!" })).toBeVisible();
  await expect.poll(() => correoEnviado).toBe("m86-landing@example.com");
  expect(consentEnviado).toBe(true);
  expect(sourceEnviada).toBe("landing");
  // Éxito reemplaza el form: no se puede reenviar.
  await expect(page.getByRole("form", { name: "Lista de espera" })).toHaveCount(0);
});

test("portada: la lista de espera exige el consentimiento", async ({ page }) => {
  await page.route("**/api/waitlist", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ message: "¡Listo! Te avisaremos." }),
    });
  });

  await page.goto("/");
  const waitlist = page.getByRole("form", { name: "Lista de espera" });
  await waitlist.getByLabel("Correo").fill("m86-sin-consentimiento@example.com");
  await waitlist.getByRole("button", { name: "Avísame" }).click();

  await expect(
    page.getByRole("alert").filter({ hasText: "Acepta que te contacten para avisarte del lanzamiento." }),
  ).toBeVisible();
  await expect(page.getByRole("form", { name: "Lista de espera" })).toBeVisible();
});

test("portada: correo inválido no navega a ningún resultado", async ({ page }) => {
  let llamado = false;
  await page.route("**/api/waitlist", async (route) => {
    llamado = true;
    await route.fulfill({ status: 200, body: JSON.stringify({ message: "¡Listo! Te avisaremos." }) });
  });

  await page.goto("/");
  const waitlist = page.getByRole("form", { name: "Lista de espera" });
  await waitlist.getByLabel("Correo").fill("no-es-un-correo");
  await waitlist.getByRole("checkbox", { name: /contacten/ }).check();
  await waitlist.getByRole("button", { name: "Avísame" }).click();

  await expect(
    page.getByRole("alert").filter({ hasText: "Revisa el correo e inténtalo de nuevo." }),
  ).toBeVisible();
  expect(llamado).toBe(false);
});

test("legales: los cuatro documentos con su aviso de borrador", async ({ page }) => {
  test.slow();
  const docs = [
    { slug: "terminos", heading: /Términos/ },
    { slug: "privacidad", heading: /Privacidad/ },
    { slug: "riesgos", heading: /Riesgos/ },
    { slug: "comisiones", heading: /Comisiones/ },
  ] as const;

  for (const doc of docs) {
    const response = await page.goto(`/legal/${doc.slug}`);
    expect(response?.status(), `GET /legal/${doc.slug}`).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: doc.heading })).toBeVisible();
    await expect(page.getByText("Borrador — [REVISIÓN ABOGADO]")).toBeVisible();
    // Versión y fecha junto al título.
    await expect(page.getByText(/Versión .+ · Actualizado el /)).toBeVisible();
  }
});

test("seguridad: la página explica custodia y enlaza los riesgos", async ({ page }) => {
  const response = await page.goto("/seguridad");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "Qué tienes y qué no" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "La demo no es dinero real" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "El marco completo" })).toBeVisible();

  const riesgos = page.getByRole("link", { name: "Leer los riesgos" });
  await expect(riesgos).toHaveAttribute("href", "/legal/riesgos");
  const demo = page.getByRole("link", { name: "Probar la demo" });
  await expect(demo).toHaveAttribute("href", "/app/registro");
});

test("idioma: ES → EN en ajustes y de vuelta", async ({ page }) => {
  // La sesión demo de la plataforma: registro mínimo.
  await page.goto("/app/registro");
  await page.getByLabel("Correo").fill("m86-idioma@example.com");
  await page.getByLabel("Contraseña", { exact: true }).fill("clave12345678");
  await page.getByLabel("Repetir contraseña").fill("clave12345678");
  await page.getByRole("checkbox", { name: /Términos y Condiciones/ }).check();
  await page.getByRole("button", { name: "Crear mi cuenta demo" }).click();
  await expect(page).toHaveURL(/\/app\/?$/);
  await expect(page.getByRole("heading", { name: "Mercado" })).toBeVisible();

  await page.goto("/app/ajustes");
  await expect(page.getByRole("heading", { level: 1, name: "Ajustes" })).toBeVisible();

  await page.getByRole("radio", { name: "English" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Market" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Wallet" })).toBeVisible();

  // Volver a español: la preferencia persiste en el servidor mock.
  await page.getByRole("radio", { name: "Español (Chile)" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Ajustes" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Mercado" })).toBeVisible();
});

test("ayuda: el centro de ayuda responde 200 con su H1", async ({ page }) => {
  const response = await page.goto("/ayuda");
  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "Ayuda" })).toBeVisible();
});
