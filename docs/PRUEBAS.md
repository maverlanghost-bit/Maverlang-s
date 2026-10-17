# PRUEBAS — Arquitectura de pruebas de Maverlang

> Cómo se prueba esta app: unitarias, guardias estáticos y regresión E2E.
> Todo corre en modo `DATA_MODE=mock` (sin claves, sin red externa, sin dinero real).

## Mapa general

| Capa | Herramienta | Dónde | Comando | Cuándo corre |
| --- | --- | --- | --- | --- |
| Unitarias | Vitest (+ Testing Library en componentes) | `tests/unit/**/*.test.ts` | `npm test` | local y CI (job `checks`) |
| Guardias estáticos | Vitest sobre el árbol (copys, seguridad, convenciones) | `tests/unit/*` | `npm test` | local y CI (job `checks`) |
| E2E de regresión | Playwright + `@axe-core/playwright` + presupuestos de performance | `e2e/*.spec.ts` | `npm run e2e` | local y CI (job `e2e`) |
| Secretos | `scripts/scan-secrets.mjs` (árbol + `--history` + bundle) | — | `npm run scan:secrets` | local y CI (job `checks`) |
| Dependencias | `scripts/audit-deps.mjs` (gate por advisory) | — | `npm run audit:deps` | CI (job `checks`) |

## 1. Unitarias (Vitest)

- **Config:** `vitest.config.ts` (entorno `node`, alias `@/`, `server-only` stubeado, timeout 20 s).
- **Alcance:** lógica de dominio pura (fee, trade, fx, formatos, allowlist, catálogo,
  compliance, rate-limit, CSP, RLS-audit, migraciones) y componentes aislados cuando
  hace falta render.
- **Convenciones:**
  - Un archivo por tema (`tests/unit/<tema>.test.ts`); imports con alias `@/`.
  - Muchos tests son **guardias estáticos**: leen fuentes del árbol y exigen
    convenciones (sin `sb_secret_`, copy exacto de la portada, rutas de usuario sin
    caché pública, imports permitidos). Fallan si alguien rompe la convención.
  - Sin red real: los servicios externos se stubean o se prueban sus adaptadores
    con fixtures.
- **Ejecutar:**

  ```
  npm test                      # toda la suite
  npx vitest run tests/unit/fee.test.ts   # un archivo
  ```

## 2. E2E de regresión (Playwright)

### Configuración

- **Config:** `playwright.config.ts` — `testDir: "e2e"`, `baseURL` en `http://127.0.0.1:3456`,
  1 worker secuencial (`fullyParallel: false`), `retries: 0`, trace `retain-on-failure`,
  locale `es-CL`, viewport 1280×800.
- **Servidor:** `webServer` corre `npx next start` sobre el build previo
  (`scripts/e2e.mjs` hace `next build` con `NEXT_DIST_DIR=.next-e2e` y luego
  `playwright test`). El env del servidor se fuerza en mock:

  | Variable | Valor en e2e |
  | --- | --- |
  | `DATA_MODE` / `NEXT_PUBLIC_DATA_MODE` | `mock` |
  | `PRICES_MODE` | `mock` |
  | `AUTH_MODE` / `NEXT_PUBLIC_AUTH_MODE` | `mock` (`supabase` con `npm run e2e:auth`) |
  | `RATE_LIMIT_BACKEND` | `memory` |
  | `NEXT_DIST_DIR` | `.next-e2e` |

- **Datos mock:** la demo parte con **US$10.000** ficticios (`lib/mocks/demo-state.ts`),
  dólar mock **950** (`lib/mocks/fx.ts`), precios ancla fijos (AAPLx 228,40 ·
  NVDAx 131,15) y catálogo generado de 50 símbolos (`config/tickers.generated.ts`,
  scope `listed` por defecto). El estado es **en memoria y compartido** entre
  pruebas: los specs que lo mutan parten reiniciando la cuenta demo.

### Suites (`e2e/`)

| Archivo | Recorrido crítico |
| --- | --- |
| `smoke.spec.ts` | humo integral: portada → registro/onboarding → compra → cartera → ajustes de idioma; detalle sin sesión; cabeceras de seguridad; mercado amplio con búsqueda |
| `landing.spec.ts` | portada, CTAs, lista de espera (`POST /api/waitlist`), legales (`/legal/*`), `/seguridad`, `/ayuda`, cambio de idioma ES/EN en `/app/ajustes` |
| `market.spec.ts` | `/app`: catálogo con contador, filtro por categoría (ETFs), buscador en vivo, cambio de moneda CLP/USD, navegación a la ficha `/app/accion/NVDAx` |
| `detail.spec.ts` | ficha `/app/accion/NVDAx`: precio y stats, selector de rango del gráfico (1S/1M/3M/1A/Todo), token subyacente con mint y Solscan, boleta de compra, vender deshabilitado sin posición |
| `demo-trade.spec.ts` | demo completa: compra NVDAx, cartera e historial, venta parcial, reinicio de cuenta |
| `real-gating.spec.ts` | dinero real apagado: `POST /api/onramp/session` → 503 `REAL_DISABLED`; la demo sigue operando; avisos de demo visibles |
| `compliance.spec.ts` | elegibilidad: onboarding con país restringido (US) → `/bloqueado`; declaración de no ser US Person; consents versionados (`POST /api/me/consents`); `PATCH /api/me` |
| `security.spec.ts` | cabeceras (`nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, CSP `frame-ancestors 'none'`), `Cache-Control: private, no-store` en `/api/me` y `/api/portfolio`, CSRF 403 con `Origin` cruzado |
| `deposit.spec.ts` | `/app/billetera` (USDC, SOL, dirección, actividad) y `/app/billetera/depositar` con pestañas Con pesos / Con USDC; contratos `/api/wallet/*` |
| `auth-supabase.spec.ts` | flujo de auth con `E2E_AUTH=supabase` (sólo `npm run e2e:auth`) |
| `registro-demo.spec.ts` | registro demo mínimo con y sin checkbox legal |
| `demo-usd.spec.ts` | saldo demo US$10.000, compra y reinicio (montos por `ariaSnapshot`) |
| `portada-lista-espera.spec.ts` | portada: demo gratis, lista de espera y logos |
| `a11y.spec.ts` | axe WCAG 2.2 AA (tags `wcag2a`…`wcag22aa`): 0 violaciones serious/critical; flujos de teclado (skip link, foco atrapado, Esc) |
| `perf.spec.ts` | presupuestos: LCP de `/` ≤ 3 s y CLS < 0,1 (Performance API real, CPU 4x vía CDP, viewport 390×844) |

### Convenciones de los specs

- Selectores accesibles (`getByRole`/`getByLabel`) que coinciden con la UI real
  en español de Chile; sin `data-testid` mágicos.
- Las rutas de la ficha son `/app/accion/<SYMBOL>` (no `/app/t/...`).
- Los rangos del gráfico son `1W/1M/3M/1Y/ALL` etiquetados `1S/1M/3M/1A/Todo`.
- El flujo de dinero real es quote → build → submit (`/api/trade/quote`,
  `/api/trade/build`, `/api/trade/submit`); no existe `/api/trade/order`.
- `POST /api/waitlist` y los endpoints de la demo se interceptan con `page.route`
  cuando el estado global no debe mutarse.

### Ejecutar

```
npm run e2e            # build en mock + servidor 127.0.0.1:3456 + suite completa
npx playwright test e2e/market.spec.ts    # un solo spec (requiere build previo)
npm run e2e:auth       # variante con E2E_AUTH=supabase (.next-e2e-auth)
```

Para iterar un spec sin rebuild completo: dejar `next start` sirviendo
`.next-e2e` en el 3456 y correr `npx playwright test` (la config arranca el
webServer si no hay nada en el puerto con `reuseExistingServer: false` — parar
el servidor propio antes si existe).

> Nota de puertos: la suite E2E usa el **3456** (`playwright.config.ts`). El
> **3100** es el puerto del servidor de verificación/manual del operador
> (`docs/OPERACION.md`); no es el de Playwright.

## 3. Criterios de bloqueo en CI

El workflow `.github/workflows/ci.yml` (M87) corre en `pull_request` y `push`
a `main` con tres jobs; el PR no se mergea si alguno falla:

1. **checks** — `npm run typecheck` (0 errores), `npm run lint`,
   `npm test` (unitarias + guardias), `npm run scan:secrets`
   (sin secretos en árbol/historial/bundle), `npm run audit:deps`
   (solo advisories excepcionados en `docs/SEGURIDAD.md`).
2. **build** — build de producción (gate de Vercel).
3. **e2e** — `npx playwright install --with-deps chromium` + `npm run e2e`
   (mock), timeout 20 min; artefactos `playwright-report/` y `test-results/`
   subidos `if: failure()`.

Además bloquean por diseño, dentro de la suite:

- Cualquier violación axe **serious/critical** en las pantallas cubiertas.
- LCP > 3 s en `/` o CLS ≥ 0,1 en `/app` y ficha (`e2e/perf.spec.ts`).
- Cabecera de seguridad ausente o `private, no-store` roto en rutas de
  usuario (`e2e/security.spec.ts` + guardián `tests/unit/perf-static.test.ts`).
- Un endpoint real (`/api/onramp/session`) respondiendo algo distinto de
  503 `REAL_DISABLED` con el flag apagado (`e2e/real-gating.spec.ts`).
- Falta de cualquiera de los specs requeridos por M86: el guardián
  `tests/unit/e2e-suite.test.ts` falla si un archivo `e2e/*.spec.ts`
  requerido no existe, no importa `@playwright/test`, contiene `.only(`,
  o no cubre la ruta/código clave que le corresponde.

## 4. Chequeos estáticos de apoyo

- `npm run scan:secrets` — secretos en el árbol, el historial y el bundle.
- `npm run check:env` — variables por modo (`docs/ENTORNOS.md`).
- `npm run audit:rls` — políticas RLS de Supabase.
- `npm run audit:catalog` — salud del catálogo sincronizado.

## 5. Pendientes / decisiones abiertas

- La variante `e2e:auth` (Supabase real) corre fuera del CI de PR: requiere
  proyecto dev y migraciones aplicadas (`docs/SUPABASE.md`).
- Los presupuestos de performance son holgados (LCP ≤ 3 s) para el PC del
  operador; el objetivo de producto es LCP < 2,5 s (`docs/RENDIMIENTO.md`).
- Las violaciones axe `moderate` se listan en la salida del test y quedan
  documentadas en `docs/ACCESIBILIDAD.md`: no bloquean.
