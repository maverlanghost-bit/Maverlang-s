# RENDIMIENTO — Core Web Vitals, bundle y cachés (M84)

Tarea M84. Objetivo de producto: **LCP < 2,5 s · CLS < 0,1 · INP < 200 ms** en celular 4G
para `/`, `/app` y `/app/accion/AAPLx`, y un JS inicial razonable (Privy y gráficos sólo
donde se usan).

## 1. Cómo medir

### Análisis de bundle (Next 16)

Next 16 trae analizador integrado para Turbopack (sin dependencias nuevas; no se agregó
`@next/bundle-analyzer` — ver `node_modules/next/dist/docs/01-app/02-guides/package-bundling.md`):

```powershell
npx next experimental-analyze            # vista interactiva (filtra por ruta, client/server)
npx next experimental-analyze --output   # escribe .next/diagnostics/analyze (compartible)
```

En el árbol se filtra por ruta y entorno (client/server) y se busca `lightweight-charts`,
`@privy-io/react-auth` y `@solana/web3.js` para confirmar que no llegan al bundle inicial
de `/` ni de `/app`.

### Build de producción y e2e

```powershell
$env:NEXT_DIST_DIR=".next-verify"; npm run build; Remove-Item Env:NEXT_DIST_DIR
npm run e2e        # incluye e2e/perf.spec.ts (LCP/CLS con CPU 4x, viewport 390×844)
```

`e2e/perf.spec.ts` mide con la Performance API real:

- LCP de `/` con `largest-contentful-paint` (respaldo: `first-contentful-paint`) — presupuesto **≤ 3.000 ms** (holgado para el PC del operador; objetivo 2.500).
- CLS de `/`, `/app` y `/app/accion/AAPLx` con un `PerformanceObserver` de `layout-shift` — presupuesto **< 0,1**.
- CPU throttling 4x vía CDP (`Emulation.setCPUThrottlingRate`), viewport móvil 390×844.

El spec no corre aquí (prohibido por el prompt: `npm run e2e`/`npm run build`); el operador
lo valida en su checklist.

## 2. Estado del bundle (verificado con estática y código, sin build)

Comprobación hecha con grep sobre `app/`, `components/` y `lib/` + `tests/unit/perf-static.test.ts`
(queda como guardián en `npm test`):

| Librería pesada | ¿Dónde vive hoy? | Mecanismo |
|---|---|---|
| `@privy-io/react-auth` | sólo `lib/auth/privy-provider.tsx` | `import()` dinámico desde `lib/auth/provider.tsx` (`PrivySlot`), sólo con sesión live |
| `@solana/web3.js` | sólo `lib/services/*.live.ts`, `lib/solana/*`, `lib/security/csp.ts` (servidor) | cero imports en módulos `"use client"` |
| `lightweight-charts` | sólo `components/domain/price-chart.tsx` | `import()` dinámico al montar + `next/dynamic` `ssr:false` (`LazyPriceChart`) en detalle y cartera |
| `@number-flow/react`, TanStack Query | bundle cliente (pequeños) | sin acción |

**Antes → después (M84):** el JS inicial de `/` y `/app` ya no incluía Privy (M65 lo dejó tras
sesión) ni `lightweight-charts` en el camino crítico del servidor; con M84 el gráfico además
sale del chunk inicial del cliente de `/app/accion/*` y `/app/cartera` (se descarga sólo al
montar el panel). El detalle exacto por ruta se llena con `npx next experimental-analyze
--output` en el build de verificación del operador (este worker no puede correr build).

## 3. Cambios de esta tarea

### Cachés HTTP (`lib/api/handler.ts`, `app/api/prices/route.ts`, `app/api/market/search/route.ts`)

| Ruta | Preset | Cabecera |
|---|---|---|
| `/api/market/search` | `short` | `public, max-age=30, s-maxage=60, stale-while-revalidate=60` |
| `/api/prices` | `swr15` (nuevo) | `public, max-age=15, s-maxage=15, stale-while-revalidate=30` |
| `/api/tickers` | `hour` (sin cambio) | `public, max-age=3600, s-maxage=3600` |
| Rutas de usuario (`/api/me/*`, `/api/portfolio`, `/api/wallet/*`, `/api/trade/*`, `/api/onramp/session`, `/api/demo/*`) | `private`/`no-store` (sin cambio) | `private, no-store` / `no-store` |

`/api/prices` pasa de `no-store` a 15 s CDN + SWR 30 s: son precios públicos del catálogo
(sin sesión) y coincide con el polling de 15 s del cliente; el CDN absorbe la ráfaga de la
lista. **Ninguna ruta con datos de usuario cambia**: `tests/unit/perf-static.test.ts` recorre
`app/api/**/route.ts` y falla si una ruta de usuario usa un preset público o si una pública
pierde el SWR.

### Carga diferida

- `components/domain/lazy-price-chart.tsx` (nuevo): `next/dynamic` + `ssr:false` sobre
  `PriceChart`. Usado en `price-panel.tsx` (detalle) y `portfolio-screen.tsx` (cartera).
- `price-chart.tsx` conserva su `import("lightweight-charts")` interno: el chunk de la
  librería sólo baja cuando hay datos que dibujar.

### Mercado (re-renders e imágenes)

- `TickerRow` ahora es `memo` con comparador por contenido (`sameRow`): un tick de precios
  ya no re-renderiza las 20 filas de la página, sólo las que cambiaron. El comparador mira
  los datos visibles y el estado `pressed` del botón de favorito (los nodos JSX inline
  cambian de identidad en cada render del padre).
- `TickerLogo` acepta `loading`/`sizes` (`next/image`). Filas de mercado, buscador,
  cartera y billetera: `loading="lazy"` + `sizes="40px"`. Movers (`TickerCard`), hoja de
  trade y cabecera del detalle: `loading="eager"` con `sizes` acorde (48/64px) — primera
  pantalla, no retrasan el LCP.
- Esqueleto del mercado ya era estable (cajas fijas `min-h-14`, sin pulso): sin CLS al
  llegar el catálogo; se verifica con el spec e2e.

### Fuentes (`app/fonts.ts`)

Ya cumplía: `geist` local vía `next/font/local` con `display: "swap"` y sólo los pesos
usados (variable 100–900, subsets automáticos, sin `@font-face` extra). Sin cambios.

## 4. Presupuestos y guardián

| Presupuesto | Valor | Dónde se verifica |
|---|---|---|
| LCP `/` (prod, CPU 4x, móvil) | ≤ 3.000 ms | `e2e/perf.spec.ts` |
| CLS `/`, `/app`, detalle | < 0,1 | `e2e/perf.spec.ts` |
| Rutas de usuario no cacheables | 0 excepciones | `tests/unit/perf-static.test.ts` |
| `lightweight-charts` fuera del inicial | 0 imports estáticos | `tests/unit/perf-static.test.ts` |
| Privy sólo vía `import()` | 0 imports estáticos | `tests/unit/perf-static.test.ts` |
| web3.js fuera de módulos cliente | 0 imports | `tests/unit/perf-static.test.ts` |

## 5. Pendiente operador (medición real)

1. `npx next experimental-analyze --output` en el build de verificación → pegar aquí el
   tamaño del JS inicial por ruta (`/`, `/app`, `/app/accion/AAPLx`) y confirmar en el
   treemap que Privy/web3/lightweight-charts no aparecen en los chunks de `/` y `/app`.
2. `npm run e2e` → correr `e2e/perf.spec.ts` y anotar LCP/CLS medidos en esta tabla.
3. Lighthouse móvil sobre el preview: `/` ≥ 85, `/app` ≥ 80, accesibilidad ≥ 90 (checklist C).
