import { expect, test } from "@playwright/test";

/**
 * M86: cumplimiento y elegibilidad.
 *
 * En esta app la declaración de elegibilidad vive en el onboarding
 * (`/app/onboarding`, wizard con `isOperationBlocked` del lado cliente) y
 * el rechazo de US Person del servidor está en `rlsUsers.update`
 * (`AUTH_MODE=supabase`; en mock no aplica). No existe un endpoint de
 * compliance dedicado (docs/ARQUITECTURA.md §5).
 *
 * Lo verificable en e2e (DATA_MODE=mock):
 *
 *   1. UI: onboarding con residencia/nacionalidad de país restringido (US)
 *      → "No disponible" y salida a `/bloqueado?motivo=residencia`.
 *      La declaración "Sí, soy de un país restringido" lleva al mismo sitio.
 *   2. API: `PATCH /api/me` con perfil elegible responde 200 (en el camino
 *      supabase, `residenceCountry: "US"` responde 400 `US_RESIDENT_MESSAGE`;
 *      esa capa la cubre `tests/unit/compliance-m75.test.ts`).
 *   3. Idoneidad: aceptación de documentos versionados vía
 *      `POST /api/me/consents` (terminos/privacidad/riesgos) y lectura en
 *      `GET /api/me/consents` + pantalla `/app/perfil/legal`.
 */

interface ApiFail {
  ok: false;
  error: { code: string; message: string };
}

/** PATCH /api/me con Origin del propio host. */
async function patchMe(page: import("@playwright/test").Page, body: unknown) {
  return page.evaluate(
    async (body) => {
      const response = await fetch("/api/me", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(body),
      });
      const text = await response.text();
      let json: unknown = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
      return { status: response.status, json };
    },
    body,
  );
}

/** POST /api/me/consents. */
async function postConsent(page: import("@playwright/test").Page, body: unknown) {
  return page.evaluate(
    async (body) => {
      const response = await fetch("/api/me/consents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(body),
      });
      const text = await response.text();
      let json: unknown = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
      return { status: response.status, json };
    },
    body,
  );
}

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

test("onboarding: residencia en EE.UU. bloquea el registro", async ({ page }) => {
  // El onboarding se abre tras "Continuar con correo" desde /app/ingresar.
  await page.goto("/app/ingresar");
  await page.getByRole("button", { name: "Continuar con correo" }).click();
  await expect(page).toHaveURL(/\/app\/onboarding/);
  await expect(page.getByRole("heading", { name: "¿Dónde vives?" })).toBeVisible();

  // País de residencia: Estados Unidos (restringido).
  await page.getByRole("combobox", { name: "País de residencia" }).click();
  await page.getByRole("option", { name: "Estados Unidos", exact: true }).click();
  await page.getByRole("combobox", { name: "Nacionalidad" }).click();
  await page.getByRole("option", { name: "Chile", exact: true }).click();
  await page.getByRole("button", { name: "Continuar" }).click();

  // La pantalla cambia a "No disponible" con el mensaje de cuenta bloqueada.
  await expect(page.getByRole("heading", { name: "No disponible" })).toBeVisible();
  await expect(
    page.getByText(/No podemos crear la cuenta con el país que indicaste/),
  ).toBeVisible();

  // Entendido sale a /bloqueado?motivo=residencia con el texto de M75.
  await page.getByRole("button", { name: "Entendido" }).click();
  await expect(page).toHaveURL(/\/bloqueado\?motivo=residencia/);
  await expect(
    page.getByRole("heading", { name: "No podemos crear la cuenta con esos datos" }),
  ).toBeVisible();
});

test("onboarding: declararse US Person en el paso 2 también bloquea", async ({ page }) => {
  await page.goto("/app/ingresar");
  await page.getByRole("button", { name: "Continuar con correo" }).click();
  await expect(page).toHaveURL(/\/app\/onboarding/);

  // Paso 1 válido: Chile/Chile.
  await page.getByRole("combobox", { name: "País de residencia" }).click();
  await page.getByRole("option", { name: "Chile", exact: true }).click();
  await page.getByRole("combobox", { name: "Nacionalidad" }).click();
  await page.getByRole("option", { name: "Chile", exact: true }).click();
  await page.getByRole("button", { name: "Continuar" }).click();

  // Paso 2: la declaración de no ser persona restringida, rechazada.
  await expect(page.getByRole("heading", { name: "Declaración" })).toBeVisible();
  await page.getByRole("button", { name: "Sí, soy de un país restringido" }).click();
  await expect(page).toHaveURL(/\/bloqueado\?motivo=residencia/);
});

test("onboarding: flujo elegible completa con declaración y documentos", async ({ page }) => {
  await page.goto("/app/ingresar");
  await page.getByRole("button", { name: "Continuar con correo" }).click();

  // Paso 1: Chile/Chile (elegible).
  await page.getByRole("combobox", { name: "País de residencia" }).click();
  await page.getByRole("option", { name: "Chile", exact: true }).click();
  await page.getByRole("combobox", { name: "Nacionalidad" }).click();
  await page.getByRole("option", { name: "Chile", exact: true }).click();
  await page.getByRole("button", { name: "Continuar" }).click();

  // Paso 2: aceptar la declaración de no ser US Person.
  await expect(page.getByRole("heading", { name: "Declaración" })).toBeVisible();
  await page
    .getByRole("checkbox", { name: /Declaro que no soy ciudadano ni residente de los Estados Unidos/ })
    .check();
  await page.getByRole("button", { name: "Continuar" }).click();

  // Paso 3: términos, privacidad y riesgos versionados.
  await expect(page.getByRole("heading", { name: "Términos y riesgos" })).toBeVisible();
  const consentimientos = page.getByRole("checkbox");
  const total = await consentimientos.count();
  expect(total).toBeGreaterThanOrEqual(3);
  for (let index = 0; index < total; index += 1) {
    await consentimientos.nth(index).check();
  }
  await page.getByRole("button", { name: "Continuar" }).click();

  // Paso 4: la billetera demo se crea y queda "Lista".
  await expect(page.getByRole("heading", { name: "Tu billetera" })).toBeVisible();
  await expect(page.getByText("Lista", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Continuar" }).click();

  // Paso 5: todo listo → Explorar acciones entra al mercado.
  await expect(page.getByRole("heading", { name: "Todo listo" })).toBeVisible();
  await page.getByRole("button", { name: "Explorar acciones" }).click();
  await expect(page).toHaveURL(/\/app\/?$/);
  await expect(page.getByRole("heading", { name: "Mercado" })).toBeVisible();
});

test("API: PATCH /api/me registra el perfil elegible de Chile", async ({ page }) => {
  await entrarDemo(page, "m86-compliance-ok@example.com");

  const aceptado = await patchMe(page, {
    residenceCountry: "CL",
    nationalityCountry: "CL",
    isUsPerson: false,
    onboardingCompleted: true,
    usPersonDeclarationVersion: "2026-10-draft",
  });
  expect(aceptado.status).toBe(200);
  const perfil = aceptado.json as {
    ok: true;
    data: { country: string; isUsPerson: boolean; onboardingCompleted: boolean };
  };
  expect(perfil.ok).toBe(true);
  expect(perfil.data.country).toBe("CL");
  expect(perfil.data.isUsPerson).toBe(false);
  expect(perfil.data.onboardingCompleted).toBe(true);
});

test("API: PATCH /api/me rechaza cuerpos inválidos con 400 VALIDATION", async ({ page }) => {
  await entrarDemo(page, "m86-compliance-shape@example.com");

  // Campo desconocido: el esquema es .strict() → 400 sin eco del valor.
  const rechazo = await patchMe(page, { residenceCountry: "CL", campoInventado: true });
  expect(rechazo.status).toBe(400);
  const fail = rechazo.json as ApiFail;
  expect(fail.ok).toBe(false);
  expect(fail.error.code).toBe("VALIDATION");
  expect(fail.error.message).toContain("campoInventado");
  // Sin eco del valor enviado.
  expect(fail.error.message).not.toContain("true");
});

test("API: idoneidad vía consents versionados (POST y GET)", async ({ page }) => {
  await entrarDemo(page, "m86-compliance-consents@example.com");

  // Aceptar los tres documentos versionados.
  for (const doc of ["terminos", "privacidad", "riesgos"] as const) {
    const respuesta = await postConsent(page, { doc, version: "2026-10-draft" });
    expect(respuesta.status, `POST consents ${doc}`).toBe(200);
  }

  // GET devuelve lo aceptado con su versión y fecha.
  const listado = await page.evaluate(async () => {
    const response = await fetch("/api/me/consents", { credentials: "same-origin" });
    return { status: response.status, json: (await response.json()) as unknown };
  });
  expect(listado.status).toBe(200);
  const data = listado.json as {
    ok: true;
    data: { doc: string; version: string; acceptedAt: string }[];
  };
  expect(data.ok).toBe(true);
  const docs = data.data.map((row) => row.doc);
  expect(docs).toContain("terminos");
  expect(docs).toContain("privacidad");
  expect(docs).toContain("riesgos");
  for (const row of data.data) {
    expect(row.version).toBe("2026-10-draft");
    expect(Number.isNaN(Date.parse(row.acceptedAt))).toBe(false);
  }

  // El perfil legal de la UI los muestra (idoneidad registrada).
  await page.goto("/app/perfil/legal");
  await expect(page.getByRole("heading", { name: "Documentos legales" })).toBeVisible();
  await expect(page.getByText("Términos y condiciones")).toBeVisible();
  await expect(page.getByText("Política de privacidad")).toBeVisible();
  await expect(page.getByText("Divulgación de riesgos")).toBeVisible();
});

test("API: consent con documento inválido se rechaza con 400", async ({ page }) => {
  await entrarDemo(page, "m86-compliance-invalid@example.com");

  const rechazo = await postConsent(page, { doc: "no_existe", version: "2026-10-draft" });
  expect(rechazo.status).toBe(400);
  const fail = rechazo.json as ApiFail;
  expect(fail.ok).toBe(false);
  expect(fail.error.code).toBe("VALIDATION");
});
