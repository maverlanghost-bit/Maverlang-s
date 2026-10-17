/**
 * M86: guardián estático de la suite de regresión E2E.
 *
 * Verifica que todos los specs requeridos por M86 existen en `e2e/`,
 * importan `@playwright/test`, no usan `.only(` y cubren las rutas y
 * códigos clave que le corresponden (URLs de la app real, endpoints API
 * con sus códigos HTTP). También exige `docs/PRUEBAS.md`.
 *
 * Es un test unitario (corre en `npm test`, sin navegador): lee los
 * archivos del árbol y valida su contenido.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..", "..");
const E2E_DIR = path.join(ROOT, "e2e");

function readE2e(relative: string): string {
  return readFileSync(path.join(E2E_DIR, relative), "utf8");
}

function e2eFiles(): string[] {
  return readdirSync(E2E_DIR).filter((name) => name.endsWith(".spec.ts"));
}

const REQUIRED: Record<string, string> = {
  "landing.spec.ts": "portada, legales, seguridad, lista de espera e idioma",
  "market.spec.ts": "mercado: catálogo, filtro, buscador, moneda y ficha",
  "detail.spec.ts": "ficha: precio, rangos del gráfico, token y boleta",
  "demo-trade.spec.ts": "recorrido demo: compra, cartera, historial, venta y reinicio",
  "real-gating.spec.ts": "dinero real apagado: 503 REAL_DISABLED y avisos demo",
  "compliance.spec.ts": "elegibilidad: onboarding, declaración y consents",
  "security.spec.ts": "cabeceras, caché privada y CSRF de mismo origen",
  "deposit.spec.ts": "billetera y depósitos con contratos API",
  "a11y.spec.ts": "accesibilidad axe WCAG 2.2 AA",
  "perf.spec.ts": "presupuestos de performance LCP/CLS",
};

describe("M86: suite E2E — archivos requeridos", () => {
  it("existen los 10 specs requeridos por M86 y docs/PRUEBAS.md", () => {
    const files = e2eFiles();
    for (const name of Object.keys(REQUIRED)) {
      expect(files, `e2e/${name} debe existir (${REQUIRED[name]})`).toContain(name);
    }
    expect(existsSync(path.join(ROOT, "docs", "PRUEBAS.md")), "docs/PRUEBAS.md").toBe(true);
  });

  it("los specs requeridos existen físicamente y no están vacíos", () => {
    for (const name of Object.keys(REQUIRED)) {
      const source = readE2e(name);
      expect(source.trim().length, `${name} no debe estar vacío`).toBeGreaterThan(500);
    }
  });
});

describe("M86: suite E2E — convenciones de Playwright", () => {
  it("todos los specs de e2e/ importan @playwright/test", () => {
    for (const name of e2eFiles()) {
      expect(readE2e(name), `${name} debe importar @playwright/test`).toMatch(
        /from ["']@playwright\/test["']/,
      );
    }
  });

  it("ningún spec usa .only(", () => {
    for (const name of e2eFiles()) {
      expect(readE2e(name), `${name} no debe contener .only(`).not.toContain(".only(");
    }
  });

  it("ningún spec activa test.skip global ni test.describe.configure de serial", () => {
    // La suite corre con workers=1: los specs no necesitan forzar modo serial
    // ni saltarse completos (los skip puntuales por entorno sí están bien).
    for (const name of e2eFiles()) {
      const source = readE2e(name);
      expect(source, `${name} sin skip global`).not.toMatch(/^test\.skip\(/m);
      expect(source, `${name} sin mode serial forzado`).not.toContain("configure({ mode: \"serial\" })");
    }
  });

  it("ningún spec navega a rutas inventadas (/app/t/, /api/trade/order, /api/compliance/)", () => {
    // La app real usa /app/accion/<SYMBOL>, /api/trade/{quote,build,submit}
    // y no tiene endpoints /api/trade/order ni /api/compliance/*.
    for (const name of e2eFiles()) {
      const source = readE2e(name);
      expect(source, `${name}: sin /app/t/`).not.toMatch(/\/app\/t\/[A-Z]/);
      expect(source, `${name}: sin /api/trade/order`).not.toContain("/api/trade/order");
      expect(source, `${name}: sin /api/compliance/`).not.toMatch(/\/api\/compliance\//);
    }
  });
});

describe("M86: cobertura de rutas y códigos por spec", () => {
  it("landing.spec.ts cubre portada, legales, seguridad, waitlist e idioma", () => {
    const source = readE2e("landing.spec.ts");
    for (const route of ["/legal/terminos", "/legal/privacidad", "/legal/riesgos", "/legal/comisiones", "/seguridad", "/ayuda"]) {
      expect(source, `landing debe cubrir ${route}`).toContain(route);
    }
    expect(source).toContain("/api/waitlist");
    expect(source).toContain("Prueba la demo gratis");
    // Idioma ES/EN vía ajustes de la plataforma.
    expect(source).toContain("/app/ajustes");
    expect(source).toContain('"English"');
    expect(source).toContain('"Español (Chile)"');
  });

  it("market.spec.ts cubre /app, filtro, buscador, moneda CLP/USD y ficha", () => {
    const source = readE2e("market.spec.ts");
    expect(source).toContain('"/app"');
    expect(source).toContain('"Filtrar"');
    expect(source).toContain("Buscar acciones");
    expect(source).toContain('"Moneda"');
    expect(source).toMatch(/Moneda: (CLP|USD)/);
    expect(source).toContain("/app/accion/NVDAx");
    expect(source).toContain('"ETFs"');
  });

  it("detail.spec.ts cubre la ficha, rangos del gráfico y boleta", () => {
    const source = readE2e("detail.spec.ts");
    expect(source).toContain('"/app/accion/NVDAx"');
    // Los cinco rangos reales de la UI (etiquetas cortas).
    for (const label of ['"1S"', '"1M"', '"3M"', '"1A"', '"Todo"']) {
      expect(source, `detail debe cubrir el rango ${label}`).toContain(label);
    }
    expect(source).toContain("Rango del gráfico");
    expect(source).toContain("Comprar NVIDIA");
    expect(source).toContain("Sobre el token");
    expect(source).toContain("Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh");
    expect(source).toContain('"Datos"');
  });

  it("demo-trade.spec.ts cubre compra, cartera, historial, venta parcial y reinicio", () => {
    const source = readE2e("demo-trade.spec.ts");
    expect(source).toContain("US$10.000");
    expect(source).toContain("Comprar NVIDIA");
    expect(source).toContain('"/app/cartera"');
    expect(source).toContain("Historial de órdenes");
    expect(source).toContain("Vender NVIDIA");
    expect(source).toContain("Monto en Acciones");
    expect(source).toContain("Reiniciar cuenta demo");
    expect(source).toContain("¡Listo!");
  });

  it("real-gating.spec.ts cubre el 503 REAL_DISABLED y los avisos de demo", () => {
    const source = readE2e("real-gating.spec.ts");
    expect(source).toContain("/api/onramp/session");
    expect(source).toContain("503");
    expect(source).toContain("REAL_DISABLED");
    expect(source).toContain("REAL_TRADING_READY");
    // La demo sigue operando con el dinero real apagado.
    expect(source).toContain("/api/trade/quote");
    expect(source).toMatch(/Simulación con precios reales/);
    // El apagado también se nota en la UI de depósito: cotizar falla.
    expect(source).toContain("No pudimos calcular el depósito");
  });

  it("compliance.spec.ts cubre onboarding restringido, declaración y consents", () => {
    const source = readE2e("compliance.spec.ts");
    expect(source).toContain("/app/onboarding");
    expect(source).toContain("Estados Unidos");
    expect(source).toContain("/bloqueado");
    expect(source).toContain("Declaro que no soy ciudadano ni residente de los Estados Unidos");
    expect(source).toContain("/api/me/consents");
    expect(source).toContain("/api/me");
    expect(source).toContain('"terminos"');
    expect(source).toContain("US Person");
  });

  it("security.spec.ts cubre cabeceras, caché privada y CSRF 403", () => {
    const source = readE2e("security.spec.ts");
    expect(source).toContain("nosniff");
    expect(source).toContain("DENY");
    expect(source).toMatch(/strict-origin-when-cross-origin|Referrer-Policy/);
    expect(source).toContain("frame-ancestors 'none'");
    expect(source).toContain("/api/me");
    expect(source).toContain("/api/portfolio");
    expect(source).toContain("private, no-store");
    expect(source).toContain("evil.example");
    expect(source).toContain("403");
    expect(source).toContain("FORBIDDEN_ORIGIN");
    expect(source).toContain("/api/me/preferences");
  });

  it("deposit.spec.ts cubre billetera, pestañas de depósito y contratos API", () => {
    const source = readE2e("deposit.spec.ts");
    expect(source).toContain('"/app/billetera"');
    expect(source).toContain('"/app/billetera/depositar"');
    expect(source).toContain("Forma de depósito");
    expect(source).toContain('"Con pesos"');
    expect(source).toContain('"Con USDC"');
    expect(source).toContain("/api/wallet/balances");
    expect(source).toContain("/api/wallet/activity");
    expect(source).toContain("/api/demo/reset");
    expect(source).toContain("10_000");
  });

  it("a11y.spec.ts y perf.spec.ts siguen presentes con axe y presupuestos", () => {
    const a11y = readE2e("a11y.spec.ts");
    expect(a11y).toContain("@axe-core/playwright");
    expect(a11y).toMatch(/wcag2a|wcag22aa/);

    const perf = readE2e("perf.spec.ts");
    expect(perf).toContain("LCP_BUDGET_MS");
    expect(perf).toContain("CLS_BUDGET");
    expect(perf).toContain("largest-contentful-paint");
    expect(perf).toContain("layout-shift");
  });
});

describe("M86: docs/PRUEBAS.md", () => {
  const docs = readFileSync(path.join(ROOT, "docs", "PRUEBAS.md"), "utf8");

  it("documenta las tres capas y sus comandos", () => {
    expect(docs).toContain("Vitest");
    expect(docs).toContain("Playwright");
    expect(docs).toContain("@axe-core/playwright");
    expect(docs).toContain("npm test");
    expect(docs).toContain("npm run e2e");
  });

  it("documenta el modo mock, el puerto de Playwright y el de operación", () => {
    expect(docs).toContain("DATA_MODE=mock");
    expect(docs).toContain("3456");
    expect(docs).toContain("3100");
    expect(docs).toContain("US$10.000");
  });

  it("documenta los criterios de bloqueo del CI", () => {
    expect(docs).toContain("checks");
    expect(docs).toContain("build");
    expect(docs).toContain("e2e");
    expect(docs).toContain("scan:secrets");
    expect(docs).toContain("REAL_DISABLED");
  });
});
