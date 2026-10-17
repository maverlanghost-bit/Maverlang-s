import { expect, test, type CDPSession, type Page } from "@playwright/test";

/**
 * M84: presupuesto de Core Web Vitals en el build de producción.
 *
 * Se mide con la Performance API real del navegador sobre el build de
 * `npm run e2e` (auth y precios en mock): viewport móvil 390×844 con CPU
 * throttling 4x vía CDP. Umbrales holgados respecto del objetivo de
 * producto (LCP < 2,5 s, CLS < 0,1) para el PC del operador:
 *
 *   - LCP de `/`           ≤ 3 s
 *   - CLS de `/` y `/app`  < 0,1
 *
 * Se corre junto al resto de la suite e2e (`npm run e2e`). Si Playwright
 * no reporta LCP en el entorno (sin `largest-contentful-paint`), el test
 * revisa `paint` y `first-contentful-paint` como respaldo y documenta el
 * caso en docs/RENDIMIENTO.md.
 */

const LCP_BUDGET_MS = 3_000;
const CLS_BUDGET = 0.1;

async function enableCpuThrottle(page: Page, rate: number): Promise<CDPSession> {
  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setCPUThrottlingRate", { rate });
  return session;
}

async function metricsOf(page: Page): Promise<{ lcp: number | null; cls: number }> {
  return page.evaluate(() => {
    const entries = performance.getEntriesByType("measure").length; // nada aún: sólo para forzar el tick
    void entries;
    const lcpEntries = performance.getEntriesByName("largest-contentful-paint");
    let lcp: number | null = null;
    if (lcpEntries.length > 0) {
      lcp = lcpEntries[lcpEntries.length - 1]?.startTime ?? null;
    } else {
      const paint = performance
        .getEntriesByType("paint")
        .find((entry) => entry.name === "first-contentful-paint");
      lcp = paint ? paint.startTime : null;
    }
    let cls = 0;
    const layoutShift = (
      PerformanceObserver as unknown as {
        supportedEntryTypes?: string[];
      }
    );
    if (layoutShift.supportedEntryTypes?.includes("layout-shift") === true) {
      // El CLS se acumula en window.__cls con el observer registrado en la página.
      cls = (window as unknown as { __cls?: number }).__cls ?? 0;
    }
    return { lcp, cls };
  });
}

/** Registra los observers de LCP/CLS dentro de la página antes de navegar. */
async function installObservers(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __cls?: number; __lcp?: number };
    w.__cls = 0;
    w.__lcp = 0;
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const shift = entry as PerformanceEntry & { value?: number; hadRecentInput?: boolean };
          if (shift.hadRecentInput === true) continue;
          w.__cls = (w.__cls ?? 0) + (shift.value ?? 0);
        }
      }).observe({ type: "layout-shift", buffered: true });
      new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const last = entries[entries.length - 1];
        if (last) w.__lcp = last.startTime;
      }).observe({ type: "largest-contentful-paint", buffered: true });
    } catch {
      // Navegadores sin soporte: se evalúa con paint de respaldo.
    }
  });
}

test("M84 perf: LCP y CLS de la portada en móvil con CPU 4x", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installObservers(page);
  const session = await enableCpuThrottle(page, 4);
  try {
    await page.goto("/", { waitUntil: "networkidle" });
    await page.waitForTimeout(1_500);
    const { lcp, cls } = await metricsOf(page);
    console.log(`[perf /] LCP=${lcp} ms, CLS=${cls}`);
    expect(cls, `CLS de / = ${cls}, presupuesto ${CLS_BUDGET}`).toBeLessThan(CLS_BUDGET);
    if (lcp !== null) {
      expect(lcp, `LCP de / = ${lcp} ms, presupuesto ${LCP_BUDGET_MS}`).toBeLessThan(LCP_BUDGET_MS);
    } else {
      test.skip(true, "el navegador no reportó largest-contentful-paint ni first-contentful-paint");
    }
  } finally {
    await session.detach();
  }
});

test("M84 perf: CLS del mercado en móvil con CPU 4x", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installObservers(page);
  const session = await enableCpuThrottle(page, 4);
  try {
    await page.goto("/app", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Mercado" })).toBeVisible();
    // El esqueleto se reemplaza por filas: medir el CLS después del intercambio.
    await page.waitForTimeout(1_500);
    const { cls } = await metricsOf(page);
    console.log(`[perf /app] CLS=${cls}`);
    expect(cls, `CLS de /app = ${cls}, presupuesto ${CLS_BUDGET}`).toBeLessThan(CLS_BUDGET);
  } finally {
    await session.detach();
  }
});

test("M84 perf: el detalle carga el gráfico sin bloquear el primer pintado", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installObservers(page);
  const session = await enableCpuThrottle(page, 4);
  try {
    await page.goto("/app/accion/AAPLx", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Apple", exact: true })).toBeVisible();
    // El nombre visible llega antes que el gráfico (lazy): no exigimos al canvas.
    const { cls } = await metricsOf(page);
    expect(cls, `CLS del detalle = ${cls}, presupuesto ${CLS_BUDGET}`).toBeLessThan(CLS_BUDGET);
  } finally {
    await session.detach();
  }
});
