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
  await page.getByRole("combobox", { name: "Nacionalidad" }).click();
  await page.getByRole("option", { name: "Chile", exact: true }).click();
  await page.getByRole("button", { name: "Continuar" }).click();

  await page.getByRole("checkbox", { name: /Declaro que no soy ciudadano/ }).check();
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

  await page.getByRole("button", { name: "Buscar" }).click();
  await page.getByRole("combobox", { name: "Buscar acciones" }).fill("AAPL");
  await page.getByRole("option", { name: /AAPLx|Apple/ }).click();
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

/**
 * M54: el mercado muestra más de 50 acciones y la búsqueda "apple" trae
 * AAPLx. En mock se intercepta `/api/market/search` con un fixture de 60
 * activos `listed` (los precios e historiales siguen en mock, que cubre
 * cualquier símbolo bien formado).
 */
test("M54: mercado amplio con búsqueda apple", async ({ page }) => {
  const categories = ["tech", "tech", "etf", "finance", "health", "other"] as const;
  interface FixtureRow {
    symbol: string;
    name: string;
    underlying: string;
    category: string;
    mint: string;
    logoUrl: string | null;
    enabled: boolean;
    halted: boolean;
    liquidityUsd: number;
    lowLiquidity: boolean;
    curated: boolean;
    openNow: boolean;
    period: string;
    mode: string;
    nextChangeAt: null;
    tradable: boolean;
    underReview: boolean;
  }
  const rows: FixtureRow[] = [
    {
      symbol: "AAPLx",
      name: "Apple",
      underlying: "AAPL",
      category: "tech",
      mint: "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp",
      logoUrl: "/logos/aapl.png",
      enabled: true,
      halted: false,
      liquidityUsd: 900_000,
      lowLiquidity: false,
      curated: true,
      openNow: true,
      period: "market",
      mode: "TwentyFourFive",
      nextChangeAt: null,
      tradable: true,
      underReview: false,
    },
    {
      symbol: "NVDAx",
      name: "NVIDIA",
      underlying: "NVDA",
      category: "tech",
      mint: "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh",
      logoUrl: "/logos/nvda.png",
      enabled: true,
      halted: false,
      liquidityUsd: 800_000,
      lowLiquidity: false,
      curated: true,
      openNow: true,
      period: "market",
      mode: "TwentyFourFive",
      nextChangeAt: null,
      tradable: true,
      underReview: false,
    },
  ];
  for (let index = 0; index < 58; index += 1) {
    const symbol = `F${String(index).padStart(3, "0")}x`;
    rows.push({
      symbol,
      name: `Empresa Fixture ${index}`,
      underlying: `F${String(index).padStart(3, "0")}`,
      category: categories[index % categories.length] ?? "tech",
      mint: `XsFixture${String(index).padStart(34, "1")}`,
      logoUrl: null,
      enabled: true,
      halted: false,
      liquidityUsd: 50_000 - index,
      lowLiquidity: false,
      curated: false,
      openNow: true,
      period: "market",
      mode: "TwentyFourFive",
      nextChangeAt: null,
      tradable: true,
      underReview: false,
    });
  }

  await page.route("**/api/market/search*", async (route) => {
    const url = new URL(route.request().url());
    const q = (url.searchParams.get("q") ?? "").toLowerCase();
    const category = url.searchParams.get("category") ?? "all";
    const pageNum = Number(url.searchParams.get("page") ?? "1");
    const pageSize = Number(url.searchParams.get("pageSize") ?? "20");
    const filtered = rows.filter((row) => {
      if (category !== "all" && row.category !== category) return false;
      if (!q) return true;
      return (
        row.symbol.toLowerCase().includes(q) ||
        row.name.toLowerCase().includes(q) ||
        row.underlying.toLowerCase().includes(q)
      );
    });
    const total = filtered.length;
    const items = filtered.slice((pageNum - 1) * pageSize, pageNum * pageSize);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        data: { items, total, page: pageNum, pageSize, hasMore: pageNum * pageSize < total },
      }),
    });
  });

  await page.goto("/app");
  await expect(page.getByRole("heading", { name: "Mercado" })).toBeVisible();
  await expect(page.getByText("60 acciones")).toBeVisible();

  await page.getByRole("button", { name: "Buscar" }).click();
  await page.getByRole("combobox", { name: "Buscar acciones" }).fill("apple");
  await expect(page.getByRole("option", { name: /AAPLx|Apple/ })).toBeVisible();
});
