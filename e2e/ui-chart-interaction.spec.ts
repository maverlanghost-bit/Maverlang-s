import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";

test("ficha móvil emulada: desplazamiento táctil sobre gráfico y métricas", async ({ browser, baseURL }, testInfo) => {
  const context = await browser.newContext({ baseURL, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, locale: "es-CL" });
  const page = await context.newPage();
  try {
    await page.goto("/app/accion/NVDAx");
    await expect(page.getByRole("heading", { level: 1, name: "NVIDIA", exact: true })).toBeVisible();
    const chart = page.locator('[data-chart-engine="lightweight-charts"]');
    await expect(chart.locator("canvas").first()).toBeVisible();
    const ranges = page.getByRole("group", { name: "Rango del gráfico", exact: true });
    await ranges.getByRole("button", { name: "1S", exact: true }).click();
    await expect(page.locator("section[data-range='1W']")).toBeVisible();
    await expect(chart.getByRole("button", { name: "Restablecer vista del gráfico" })).toBeEnabled();
    await chart.getByRole("button", { name: "Restablecer vista del gráfico" }).click();

    await chart.scrollIntoViewIfNeeded();
    const box = await chart.boundingBox();
    expect(box).not.toBeNull();
    const startX = box!.x + box!.width * 0.45;
    const startY = Math.min(box!.y + box!.height * 0.8, 780);
    const before = await page.evaluate(() => window.scrollY);
    const frameIntervals = page.evaluate(() => new Promise<number[]>((resolve) => {
      const intervals: number[] = [];
      let previous: number | null = null;
      const sample = (time: number) => {
        if (previous !== null) intervals.push(time - previous);
        previous = time;
        if (intervals.length >= 45) resolve(intervals);
        else requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    }));
    const cdp = await context.newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: startX, y: startY }] });
    for (let step = 1; step <= 24; step += 1) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: startX, y: startY - step * 8 }] });
      await page.waitForTimeout(20);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    const intervals = await frameIntervals;
    const after = await page.evaluate(() => window.scrollY);
    expect(after).toBeGreaterThan(before);
    expect(intervals.length).toBeGreaterThanOrEqual(30);

    const resources = await page.evaluate(() => performance.getEntriesByType("resource")
      .filter((entry) => /\.js(?:\?|$)/.test(entry.name))
      .map((entry) => {
        const resource = entry as PerformanceResourceTiming;
        return { name: new URL(resource.name).pathname, transferSize: resource.transferSize, encodedBodySize: resource.encodedBodySize, decodedBodySize: resource.decodedBodySize, durationMs: resource.duration };
      }));
    const metricsPath = testInfo.outputPath("chart-mobile-emulation-metrics.json");
    await writeFile(metricsPath, JSON.stringify({ viewport: { width: 390, height: 844 }, environment: "Chromium touch emulation; not a physical phone", scrollBefore: before, scrollAfter: after, frameIntervalsMs: intervals, jsResources: resources }, null, 2));
    await testInfo.attach("chart-mobile-emulation-metrics", { path: metricsPath, contentType: "application/json" });
  } finally {
    await context.close();
  }
});

test("ficha escritorio: arrastre del gráfico, controles y métricas", async ({ page }, testInfo) => {
  await page.goto("/app/accion/NVDAx");
  await expect(page.getByRole("heading", { level: 1, name: "NVIDIA", exact: true })).toBeVisible();
  const chart = page.locator('[data-chart-engine="lightweight-charts"]');
  const canvas = chart.locator("canvas").first();
  await expect(canvas).toBeVisible();
  for (const name of ["Acercar gráfico", "Restablecer vista del gráfico", "Último"]) {
    const button = chart.getByRole("button", { name, exact: true });
    await expect(button).toBeEnabled();
    await button.click();
  }

  await chart.scrollIntoViewIfNeeded();
  const box = await chart.boundingBox();
  expect(box).not.toBeNull();
  const x = box!.x + box!.width * 0.7;
  const y = box!.y + box!.height * 0.5;
  const frameIntervals = page.evaluate(() => new Promise<number[]>((resolve) => {
    const intervals: number[] = [];
    let previous: number | null = null;
    const sample = (time: number) => {
      if (previous !== null) intervals.push(time - previous);
      previous = time;
      if (intervals.length >= 45) resolve(intervals);
      else requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  }));
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let step = 1; step <= 24; step += 1) {
    await page.mouse.move(x - step * 6, y);
    await page.waitForTimeout(20);
  }
  await page.mouse.up();
  const intervals = await frameIntervals;
  expect(intervals.length).toBeGreaterThanOrEqual(30);
  const resources = await page.evaluate(() => performance.getEntriesByType("resource")
    .filter((entry) => /\.js(?:\?|$)/.test(entry.name))
    .map((entry) => {
      const resource = entry as PerformanceResourceTiming;
      return { name: new URL(resource.name).pathname, transferSize: resource.transferSize, encodedBodySize: resource.encodedBodySize, decodedBodySize: resource.decodedBodySize, durationMs: resource.duration };
    }));
  const metricsPath = testInfo.outputPath("chart-desktop-drag-metrics.json");
  await writeFile(metricsPath, JSON.stringify({ viewport: page.viewportSize(), interaction: "horizontal pointer drag over chart", frameIntervalsMs: intervals, jsResources: resources }, null, 2));
  await testInfo.attach("chart-desktop-drag-metrics", { path: metricsPath, contentType: "application/json" });
});
