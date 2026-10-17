import { expect, test } from "@playwright/test";

/**
 * M86: cabeceras de seguridad HTTP, caché privada y rechazo CSRF.
 *
 * Las cabeceras las inyecta el middleware (`lib/security/headers.ts` +
 * `lib/security/csp.ts`) en las páginas y `next.config.ts` en las API
 * (`nosniff` también sale de `jsonResult`). El CSRF de mismo origen
 * (`assertSameOrigin`, M56) rechaza POST/PUT/PATCH con `Origin` ajeno
 * con 403 `FORBIDDEN_ORIGIN`.
 *
 * El prompt de M86 pide el rechazo de origen cruzado contra
 * `POST /api/me/preferences` (en esta app es PUT, con el mismo guardia)
 * y contra el camino demo de trade (`POST /api/trade/quote`).
 *
 * Las peticiones con `Origin` arbitrario se hacen con `page.request`
 * (APIRequestContext de Playwright): el fetch del navegador no permite
 * sobreescribir `Origin` (es forbidden header), mientras que el cliente
 * de peticiones sí manda el header tal cual y hereda las cookies del
 * contexto (la sesión demo).
 */

interface ApiFail {
  ok: false;
  error: { code: string; message: string };
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

/** GET autenticado (hereda cookies del contexto) con sus cabeceras. */
async function getApi(page: import("@playwright/test").Page, path: string) {
  const response = await page.request.get(path);
  let json: unknown = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }
  return {
    status: response.status(),
    cacheControl: response.headers()["cache-control"] ?? null,
    json,
  };
}

/** Petición que cambia estado con Origin arbitrario. */
async function mutarConOrigin(
  page: import("@playwright/test").Page,
  method: "POST" | "PUT" | "PATCH",
  path: string,
  body: unknown,
  origin: string | null,
) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (origin) headers["origin"] = origin;
  const response = await page.request.fetch(path, { method, headers, data: JSON.stringify(body) });
  let json: unknown = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }
  return { status: response.status(), json };
}

test("cabeceras: seguridad en las páginas públicas y de la plataforma", async ({ page }) => {
  for (const path of ["/", "/app"]) {
    const response = await page.goto(path);
    expect(response?.status(), `GET ${path}`).toBe(200);
    const headers = response?.headers() ?? {};

    expect(headers["x-content-type-options"], `nosniff en ${path}`).toBe("nosniff");
    expect(headers["x-frame-options"], `frame en ${path}`).toBe("DENY");
    expect(headers["referrer-policy"], `referrer en ${path}`).toBe("strict-origin-when-cross-origin");
    const csp = headers["content-security-policy"] ?? "";
    expect(csp, `CSP en ${path}`).toContain("frame-ancestors 'none'");
    expect(headers["permissions-policy"] ?? "", `permissions en ${path}`).toContain("camera=()");
    expect(headers["strict-transport-security"] ?? "", `hsts en ${path}`).toContain("max-age=63072000");
    expect(headers["x-powered-by"], `sin x-powered-by en ${path}`).toBeUndefined();
  }
});

test("caché: /api/me y /api/portfolio viajan con private, no-store", async ({ page }) => {
  await entrarDemo(page, "m86-security-cache@example.com");

  const me = await getApi(page, "/api/me");
  expect(me.status).toBe(200);
  expect(me.cacheControl).toBe("private, no-store");

  const cartera = await getApi(page, "/api/portfolio");
  expect(cartera.status).toBe(200);
  expect(cartera.cacheControl).toBe("private, no-store");

  const balances = await getApi(page, "/api/wallet/balances");
  expect(balances.status).toBe(200);
  expect(balances.cacheControl).toBe("private, no-store");
});

test("CSRF: PUT /api/me/preferences con Origin cruzado responde 403", async ({ page }) => {
  await entrarDemo(page, "m86-security-prefs@example.com");

  const rechazo = await mutarConOrigin(
    page,
    "PUT",
    "/api/me/preferences",
    {
      notifyOrders: true,
      notifyDeposits: true,
      notifyNews: false,
      language: "es-CL",
      displayCurrency: "CLP",
    },
    "https://evil.example",
  );
  expect(rechazo.status).toBe(403);
  const fail = rechazo.json as ApiFail;
  expect(fail.ok).toBe(false);
  expect(fail.error.code).toBe("FORBIDDEN_ORIGIN");
  expect(fail.error.message).toBe("El origen de la solicitud no está permitido.");
});

test("CSRF: POST /api/trade/quote con Origin cruzado responde 403", async ({ page }) => {
  await entrarDemo(page, "m86-security-trade@example.com");

  const rechazo = await mutarConOrigin(
    page,
    "POST",
    "/api/trade/quote",
    { side: "buy", symbol: "NVDAx", amount: 100, amountCurrency: "USDC" },
    "https://evil.example",
  );
  expect(rechazo.status).toBe(403);
  const fail = rechazo.json as ApiFail;
  expect(fail.error.code).toBe("FORBIDDEN_ORIGIN");

  // El mismo POST con el Origin legítimo del host sigue funcionando (200).
  const propio = await mutarConOrigin(
    page,
    "POST",
    "/api/trade/quote",
    { side: "buy", symbol: "NVDAx", amount: 100, amountCurrency: "USDC" },
    "http://127.0.0.1:3456",
  );
  expect(propio.status).toBe(200);
});

test("CSRF: POST /api/demo/reset con Origin cruzado también se rechaza", async ({ page }) => {
  await entrarDemo(page, "m86-security-reset@example.com");

  const rechazo = await mutarConOrigin(page, "POST", "/api/demo/reset", {}, "https://evil.example");
  expect(rechazo.status).toBe(403);
  const fail = rechazo.json as ApiFail;
  expect(fail.error.code).toBe("FORBIDDEN_ORIGIN");
});

test("CSP: la consola no reporta violaciones al navegar", async ({ page }) => {
  const cspErrors: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("Content Security Policy")) cspErrors.push(message.text());
  });

  await page.goto("/");
  await expect(
    page.getByRole("heading", { level: 1, name: "Acciones de EE.UU. tokenizadas, en tu billetera" }),
  ).toBeVisible();

  await entrarDemo(page, "m86-security-csp@example.com");
  await page.goto("/app/accion/NVDAx");
  await expect(page.getByRole("heading", { level: 1, name: "NVIDIA", exact: true })).toBeVisible();

  expect(cspErrors, "violaciones de CSP en consola").toEqual([]);
});
