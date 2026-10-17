import { expect, test } from "@playwright/test";

/**
 * M86: dinero real apagado por defecto (`REAL_TRADING_READY=false`).
 *
 * Cómo funciona el apagado en esta app (M46, `lib/api/handler.ts`):
 *
 *   - `POST /api/onramp/session` llama `assertRealTradingEnabled()` sin
 *     condiciones: con el flag en false responde SIEMPRE 503 REAL_DISABLED
 *     sin tocar servicios externos. Es el endpoint real verificable en e2e.
 *   - `POST /api/trade/build` y `POST /api/trade/submit` apagan el camino
 *     real (`isRealAccountRequest`), que sólo existe con `AUTH_MODE=supabase`
 *     + cookie `mv_account=real`. En el e2e (AUTH_MODE=mock) el único camino
 *     activo es la demo: sigue operando con el flag apagado. El apagado de
 *     build/submit en el camino real lo cubre `tests/unit/real-disabled.test.ts`.
 *   - No existe un endpoint de "order" de trade: el flujo de la plataforma
 *     es quote → build → submit (docs/ARQUITECTURA.md §5).
 *
 * El cuerpo del 503 es el contrato de `lib/api/result.ts`:
 * `{ ok: false, error: { code: "REAL_DISABLED", message } }` con el mensaje
 * humano en español.
 */

const REAL_DISABLED_MESSAGE = "El dinero real todavía no está disponible.";

interface ApiFail {
  ok: false;
  error: { code: string; message: string };
  requestId?: string;
}

/** POST JSON con Origin del propio host (exigido por assertSameOrigin). */
async function postJson(page: import("@playwright/test").Page, path: string, body: unknown) {
  return page.evaluate(
    async ({ path, body }) => {
      const response = await fetch(path, {
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
      return { status: response.status, cacheControl: response.headers.get("cache-control"), json };
    },
    { path, body },
  );
}

/** Sesión demo iniciada (cookie mock). */
async function entrarDemo(page: import("@playwright/test").Page) {
  await page.goto("/app/registro");
  await page.getByLabel("Correo").fill("m86-real-gating@example.com");
  await page.getByLabel("Contraseña", { exact: true }).fill("clave12345678");
  await page.getByLabel("Repetir contraseña").fill("clave12345678");
  await page.getByRole("checkbox", { name: /Términos y Condiciones/ }).check();
  await page.getByRole("button", { name: "Crear mi cuenta demo" }).click();
  await expect(page).toHaveURL(/\/app\/?$/);
}

test("onramp: POST /api/onramp/session responde 503 REAL_DISABLED", async ({ page }) => {
  await entrarDemo(page);
  const response = await postJson(page, "/api/onramp/session", {
    amountClp: 50_000,
    walletAddress: "CuentaDemoMaverlangWalletAddress1234567890abcd",
  });
  expect(response.status).toBe(503);
  const fail = response.json as ApiFail;
  expect(fail.ok).toBe(false);
  expect(fail.error.code).toBe("REAL_DISABLED");
  expect(fail.error.message).toBe(REAL_DISABLED_MESSAGE);
  // Sin caché: el 503 no se guarda en ningún lado.
  expect(response.cacheControl).toBe("no-store");
});

test("onramp: el 503 se repite sin leaked de proveedores", async ({ page }) => {
  await entrarDemo(page);
  // Segunda llamada con otro monto: mismo código, sin detalles internos.
  const response = await postJson(page, "/api/onramp/session", {
    amountClp: 1_000_000,
    walletAddress: "CuentaDemoMaverlangWalletAddress1234567890abcd",
  });
  expect(response.status).toBe(503);
  const fail = response.json as ApiFail;
  expect(fail.error.code).toBe("REAL_DISABLED");
  // El mensaje es el humano de la app, no un error de un proveedor.
  expect(fail.error.message).not.toMatch(/koywe|onramper|jupiter|supabase|error:/i);
  // requestId presente para trazabilidad.
  expect(typeof fail.requestId).toBe("string");
});

test("trade quote: la demo sigue operando con el flag apagado", async ({ page }) => {
  await entrarDemo(page);

  // La cotización demo (sin mv_account=real) responde 200 con una quote real.
  const quote = await postJson(page, "/api/trade/quote", {
    side: "buy",
    symbol: "NVDAx",
    amount: 100,
    amountCurrency: "USDC",
  });
  expect(quote.status).toBe(200);
  const data = quote.json as { ok: true; data: { id: string; pricePerShareUsd: number } };
  expect(data.ok).toBe(true);
  expect(data.data.pricePerShareUsd).toBeGreaterThan(0);

  // Y con la UI: la compra demo funciona de punta a punta (humo mínimo).
  await page.goto("/app/accion/NVDAx");
  await page.getByRole("button", { name: "Comprar", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Comprar NVIDIA" });
  await sheet.getByRole("button", { name: "US$ 10" }).click();
  await expect(sheet.getByRole("button", { name: "Revisar" })).toBeEnabled();
});

test("UI demo: el aviso de simulación es visible en la plataforma", async ({ page }) => {
  await entrarDemo(page);

  // Insignia "Demo" en la barra superior y el aviso de la cartera.
  await page.goto("/app/cartera");
  await expect(page.getByText("Demo", { exact: true }).first()).toBeVisible();
  await expect(
    page.getByText("Simulación con precios reales; no es dinero real ni asesoría."),
  ).toBeVisible();

  // El botón de reinicio de la demo existe (la cuenta real no se reinicia).
  await expect(page.getByRole("button", { name: "Reiniciar cuenta demo" })).toBeVisible();

  // En la pantalla de depósito, el dinero real apagado se nota: cotizar en
  // pesos falla con el mensaje de la app (REAL_DISABLED no filtra detalles).
  await page.goto("/app/billetera/depositar");
  const monto = page.getByLabel("Monto en CLP");
  await monto.fill("50000");
  await expect(page.getByText("No pudimos calcular el depósito.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Continuar con Koywe" })).toBeDisabled();
});

test("UI: cambiar a cuenta real muestra el aviso de próximamente", async ({ page }) => {
  await entrarDemo(page);

  // El interruptor "Tipo de cuenta" del sidebar (expandido en 1280px).
  const tipoCuenta = page.getByRole("radiogroup", { name: "Tipo de cuenta" });
  await tipoCuenta.getByRole("button", { name: "Cuenta real" }).click();

  // No hay flujo real: el diálogo informa que estará disponible pronto.
  const dialogo = page.getByRole("dialog", { name: "Estará disponible en poco tiempo" });
  await expect(dialogo).toBeVisible();
  await expect(dialogo.getByText(/La cuenta real estará disponible en poco tiempo/)).toBeVisible();
  await dialogo.getByRole("button", { name: "Conocer la plataforma" }).click();
  await expect(page).toHaveURL(/\/app\/?$/);
  await expect(page.getByRole("heading", { name: "Mercado" })).toBeVisible();
});
