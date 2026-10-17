import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * M85: accesibilidad WCAG 2.2 AA con axe en las pantallas clave (mock).
 *
 * - Se analiza con los tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa` y
 *   `wcag22aa`. Falla con cualquier violación `serious` o `critical`.
 * - Las `moderate` no rompen el build: se listan en la salida del test como
 *   pendientes y quedan documentadas en `docs/ACCESIBILIDAD.md`.
 * - Los tests de teclado cubren el skip link, el foco atrapado en la hoja de
 *   compra, el cierre con Esc y el retorno del foco al botón que la abrió.
 *
 * `npm run e2e` sirve el build con auth/prices en mock (scripts/e2e.mjs).
 */

const TAGS: string[] = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

interface Violation {
  id: string;
  impact: string | null;
  help: string;
  helpUrl: string;
  nodes: { target: string[] }[];
}

/** Corre axe y exige cero violaciones serious/critical. */
async function scan(page: Page, name: string) {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const blocking = (results.violations as unknown as Violation[]).filter(
    (violation) => violation.impact === "serious" || violation.impact === "critical",
  );
  const moderate = (results.violations as unknown as Violation[]).filter(
    (violation) => violation.impact === "moderate",
  );
  if (blocking.length > 0) {
    const summary = blocking
      .map((violation) => {
        const where = violation.nodes
          .slice(0, 3)
          .map((node) => node.target.join(" "))
          .join(" | ");
        return `${violation.impact} ${violation.id}: ${violation.help} (${violation.helpUrl}) en ${where}`;
      })
      .join("\n  ");
    throw new Error(`[${name}] ${blocking.length} violación(es) bloqueantes de axe:\n  ${summary}`);
  }
  if (moderate.length > 0) {
    const summary = moderate
      .map((violation) => `${violation.id}: ${violation.help}`)
      .join("; ");
    // Pendientes: no rompen la verificación, quedan en docs/ACCESIBILIDAD.md.
    console.log(`[${name}] pendientes moderadas: ${summary}`);
  }
}

/** Registra la cuenta demo (mock) y espera el mercado autenticado. */
async function loginDemo(page: Page) {
  await page.goto("/app/registro");
  await expect(page.getByRole("heading", { name: "Crea tu cuenta demo" })).toBeVisible();
  await page.getByLabel("Correo").fill("a11y-demo@example.com");
  await page.getByLabel("Contraseña", { exact: true }).fill("clave12345678");
  await page.getByLabel("Repetir contraseña").fill("clave12345678");
  await page.getByRole("checkbox", { name: /Términos y Condiciones/ }).check();
  await page.getByRole("button", { name: "Crear mi cuenta demo" }).click();
  await expect(page).toHaveURL(/\/app\/?$/);
  await expect(page.getByRole("heading", { name: "Mercado" })).toBeVisible();
}

test("M85 a11y: portada pública", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Acciones de EE.UU. tokenizadas, en tu billetera" })).toBeVisible();
  await scan(page, "portada /");
});

test("M85 a11y: páginas públicas (ayuda y legal)", async ({ page }) => {
  test.slow();
  await page.goto("/ayuda");
  await expect(page.getByRole("heading", { level: 1, name: "Ayuda" })).toBeVisible();
  await scan(page, "/ayuda");

  await page.goto("/legal/terminos");
  await expect(page.getByRole("heading", { level: 1, name: /Términos/ })).toBeVisible();
  await scan(page, "/legal/terminos");
});

test("M85 a11y: mercado autenticado", async ({ page }) => {
  await loginDemo(page);
  await scan(page, "/app");
});

test("M85 a11y: detalle de acción y hoja de compra abierta", async ({ page }) => {
  test.slow();
  await loginDemo(page);
  await page.goto("/app/accion/AAPLx");
  await expect(page.getByRole("heading", { level: 1, name: "Apple" })).toBeVisible();
  await scan(page, "/app/accion/AAPLx");

  await page.goto("/app/accion/AAPLx?operar=comprar");
  const sheet = page.getByRole("dialog", { name: /Comprar Apple/ });
  await expect(sheet).toBeVisible();
  await scan(page, "/app/accion/AAPLx?operar=comprar");
});

test("M85 a11y: cartera y billetera autenticadas", async ({ page }) => {
  test.slow();
  await loginDemo(page);
  await page.goto("/app/cartera");
  await expect(page.getByRole("heading", { level: 1, name: "Cartera" })).toBeVisible();
  await scan(page, "/app/cartera");

  await page.goto("/app/billetera");
  await expect(page.getByRole("heading", { level: 1, name: "Billetera" })).toBeVisible();
  await scan(page, "/app/billetera");
});

test("M85 a11y: ingreso y registro (sin sesión)", async ({ page }) => {
  test.slow();
  await page.goto("/app/ingresar");
  await expect(page.getByRole("heading", { level: 1, name: "Ingresa o crea tu cuenta" })).toBeVisible();
  await scan(page, "/app/ingresar");

  await page.goto("/app/registro");
  await expect(page.getByRole("heading", { level: 1, name: "Crea tu cuenta demo" })).toBeVisible();
  await scan(page, "/app/registro");
});

test("M85 a11y: ajustes autenticados", async ({ page }) => {
  await loginDemo(page);
  await page.goto("/app/ajustes");
  await expect(page.getByRole("heading", { level: 1, name: "Ajustes" })).toBeVisible();
  await scan(page, "/app/ajustes");
});

test("M85 a11y: flujo de teclado — skip link, hoja de compra y foco", async ({ page }) => {
  await loginDemo(page);

  // Skip link: el primer Tab en el mercado lo revela y lleva al contenido.
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: "Mercado" })).toBeVisible();
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Saltar al contenido" });
  await expect(skip).toBeFocused();
  await expect(skip).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator("#contenido")).toBeFocused();

  // Ir a la ficha y abrir la hoja de compra sólo con teclado.
  await page.goto("/app/accion/AAPLx");
  await expect(page.getByRole("heading", { level: 1, name: "Apple" })).toBeVisible();
  const buy = page.getByRole("button", { name: "Comprar", exact: true });
  await buy.focus();
  await expect(buy).toBeFocused();
  await page.keyboard.press("Enter");
  const sheet = page.getByRole("dialog", { name: /Comprar Apple/ });
  await expect(sheet).toBeVisible();

  // Al abrir, el foco cae en el primer control de la hoja (el selector de
  // moneda USD/Acciones, primero en el orden del DOM).
  const firstControl = sheet.getByRole("radio", { name: "USD" });
  await expect(firstControl).toBeFocused();

  // El foco no escapa de la hoja: Tab desde el último control (Cerrar) vuelve
  // al primero, y Shift+Tab desde el primero salta al último.
  const close = sheet.getByRole("button", { name: "Cerrar" });
  await close.focus();
  await page.keyboard.press("Tab");
  await expect(firstControl).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(close).toBeFocused();

  // Esc cierra la hoja y el foco vuelve al botón Comprar que la abrió.
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await expect(buy).toBeFocused();
});

test("M85 a11y: flujo de compra completo por teclado", async ({ page }) => {
  test.slow();
  await loginDemo(page);

  await page.goto("/app/accion/AAPLx");
  const buy = page.getByRole("button", { name: "Comprar", exact: true });
  await buy.focus();
  await page.keyboard.press("Enter");
  const sheet = page.getByRole("dialog", { name: /Comprar Apple/ });
  await expect(sheet).toBeVisible();

  // Monto por teclado: el campo con aria-label "Monto en USD".
  const amount = sheet.getByLabel("Monto en USD");
  await amount.focus();
  await amount.fill("100");
  await expect(amount).toHaveValue("100");

  const review = sheet.getByRole("button", { name: "Revisar" });
  await expect(review).toBeEnabled();
  await review.focus();
  await page.keyboard.press("Enter");
  await expect(sheet.getByRole("button", { name: "Confirmar" })).toBeEnabled();
});
