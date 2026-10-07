# PROGRESO — Maverlang

> Estado de la base (2026-10-06): las migraciones 0002, 0003 y 0004 YA están aplicadas en el proyecto Supabase actual y `public.assets` está sincronizada. No hay que pegar nada en el SQL Editor; las instrucciones de `docs/SUPABASE.md` sirven sólo para un proyecto nuevo.

## N21 — Navbar suave + logo chico + sidebar fija (2026-10-07)
- Hecho: navbar del landing sube/baja en 500 ms (antes 240 ms). Logo h-5 (antes h-6). Sidebar con iconos siempre fijos: marca favicon + nombre, nav y avatar en slots fijos; al colapsar sólo se ocultan las palabras (max-w/opacity). Expandida muestra marca + nombre.
- La M al colapsar = falta `public/brand/maverlang-mark.png`. Operador: `Copy-Item "app\icon.png" "public\brand\maverlang-mark.png"`.
- Verificación: sin `tsc/test` aquí; pendiente: `npx tsc --noEmit`, `npm test`, probar colapsar (Ctrl/Cmd+B) y scroll del landing.
- Archivos: `sidebar.tsx`, `site-header.tsx`, `brand-image.tsx`.

## N20 — Buscador con sugerencias (2026-10-07)
- Hecho: al escribir se abre un desplegable con top 6 (logo, nombre, símbolo, precio y variación), esqueletos al cargar, "Buscar «q»" para aplicar y teclado (↑↓/Enter/Esc). Clic o Enter va al detalle. Lógica pura `topSuggestions` en `browse.ts` + tests (3).
- Verificación: sin `tsc/test` aquí (sin shell); pendiente operador: `npx tsc --noEmit`, `npm test`, buscar "apple" en `/app` y navegar con teclado y clic.
- Archivos: `search-suggestions.tsx` (nuevo), `market-screen.tsx`, `browse.ts`, `suggestions.test.ts`, i18n es/en.

## N19 — Ordenar + filtrar en una tira (2026-10-07)
- Hecho: una sola tira "Ordenar y filtrar": orden (Popular, Mayor alza, Mayor baja) + divisor + filtros; sin A–Z (URL vieja con `orden=az` cae a Popular; API y tipos intactos). Scroll horizontal sin barra visible (`no-scrollbar`) y fundido a la derecha que avisa que hay más.
- Verificación: sin `tsc/test` aquí (sin shell); pendiente operador: `npx tsc --noEmit`, `npm test`, revisar `/app` en móvil y desktop.
- Archivos: `market-screen.tsx`, `globals.css`, i18n es/en.

## N18 — Volver al mercado + color del precio en el gráfico (2026-10-07)
- Hecho: flecha "Volver al mercado" arriba del detalle (`/app`). Al recorrer el gráfico el precio ya no destella por cada punto: se tiñe sólo contra el actual (rojo si el punto es menor, verde si es mayor, neutro si igual); el destello en vivo sigue igual sin hover.
- Verificación: sin `tsc/test` aquí (sin shell); pendiente operador: `npx tsc --noEmit`, `npm test`, abrir un detalle y pasar el cursor por el gráfico.
- Archivos: `detail-screen.tsx`, `price-panel.tsx`, `portfolio-screen.tsx` (mismo arreglo en el total), `flash-price.tsx`, `use-price-flash.ts` (pausa), `icons.tsx` (`IconBack`), i18n es/en.

## N17 — Atajos acumulativos + marca Maverlang (2026-10-07)
- Hecho: chips de compra suman (3× US$10 = US$30, tope en Máx); acciones 0,1 / 0,5 / 1. Punto naranja fuera en header, footer, auth, CTA, BrandMark y sidebar colapsada (ahora favicon `maverlang-mark.png` con respaldo M). `icon.tsx` con M (sin punto).
- Pendiente operador (sin shell aquí): mover el PNG a `public/brand/` y exportar el mark cuadrado — comandos abajo. `app/favicon.ico` viejo (punto) hay que borrarlo para que rija `icon.tsx`/nuevo favicon. Luego `npx tsc --noEmit`, `npm test`, ver compra y sidebar.
- Estado 2026-10-07: el PNG sigue en la raíz (`Maverlang Logo-1.png`, no se sirve) y no existe `public/brand/`. Sin esos archivos el logo no puede aparecer: el código ya apunta a `/brand/maverlang-logo.png` y `/brand/maverlang-mark.png`.
- Fix robustez (2026-10-07): nuevo `brand-image.tsx` (`BrandLogoImage` → texto si falta el PNG; `BrandMarkImage` → M si falta). Se usa en header, footer, auth, sidebar colapsada y CTA: sin archivos verás nombre/M en vez de ícono roto.
- Fix logo blanco (2026-10-07): fuera `dark:invert` del logo (la app es sólo clara; con Windows en oscuro Tailwind lo invertía).
- Archivos: `amount-input.tsx`, `brand-mark.tsx`, `sidebar.tsx`, `site-header/footer.tsx`, `auth-frame.tsx`, `final-cta.tsx`, `app/icon.tsx`.

## N16 — Compra en USD o acciones (2026-10-07)
- Hecho: comprar ofrece USD ⇄ Acciones (sin CLP); venta igual que antes. Etiqueta "USD" (no USDC). Smoke e2e compra con "US$ 100". Backend y tests de montos intactos (CLP sigue válido por API).
- Verificación: sin `tsc/test/e2e` aquí (sin shell); pendiente operador: `npx tsc --noEmit`, `npm test`, `npm run e2e`, comprar 1 acc en demo.
- Archivos: `trade-sheet.tsx`, `e2e/smoke.spec.ts`.

## N15 — Precio ejecutable + aviso de despegue + mints verificados (2026-10-07)
- Hecho: titular = precio ejecutable del pozo; Jupiter ahora trae `marketPriceUsd` + `liquidityUsd` (tipos, contratos, parser, batcher). Si despega ≥1% vs mercado, aviso "Despegue del pozo: X% vs mercado" + filas Precio de mercado y Liquidez del pozo en Datos. Tests `pool-price.test.ts` (5).
- Mints: 13/13 (12 + UBERx) idénticos a `api.xstocks.fi` oficial. Nada falso.
- Verificación: sin `tsc/test/build` aquí (sin shell); pendiente operador: `npx tsc --noEmit`, `npm test`, mirar `/app/accion/UBERx` (aviso + Datos).
- Archivos: `types`, `contracts.ts`, `live-quotes.ts`, `price-batcher.ts`, `dislocation.ts`, `price-panel.tsx`, `detail-screen.tsx`, i18n.

## N13 — Detalle a 5 s con key Jupiter (2026-10-07)
- Hecho: `SPOT_MS` 5 s en detalle y hoja de compra; listas siguen en 15 s. Cache servidor 5 s por mint. Con key Free (1 req/s ≈ 60/min) el gasto típico (~16/min) va sobrado; sin key igual funciona con más 429.
- Verificación: sin `tsc/test/build` aquí (sin shell); pendiente operador: `npx tsc --noEmit`, `npm test`, mirar detalle 30 s (destello cada 5 s).
- Archivos: `queries.ts`, `price-batcher.ts`, `detail-screen.tsx`, `trade-sheet.tsx`, tests `price-batcher` + `live-prices-visible`.

## N12 — Favoritas en la cuenta (2026-10-06)
- Hecho: migración `0006_user_favorites.sql` (NO aplicada) + `GET/PUT /api/me/favorites` (sesión, zod, tope 200) en mock/RLS/live. Con sesión: une servidor+local y sube lo nuevo; sin sesión o sin 0006: sigue lo local. Vacío de Favoritas con guía. Tests `favorites.test.ts` (8).
- Verificación: sin `tsc/test/build` aquí (sin shell); pendiente operador: aplicar 0006, `npx tsc --noEmit`, `npm test`, entrar en 2 navegadores y marcar estrella.
- Archivos: `0006`, `lib/favorites/merge.ts`, contratos/cliente/ruta, 3 servicios, `use-favorites.ts`, `market-screen.tsx`, i18n, `SUPABASE.md`.
- Fix build (2026-10-07): `RestInit` acepta `DELETE` (lo pedía `saveFavorites` en `users.supabase.ts`).

## N11 — Fuera insignia demo en compra (2026-10-06)
- Hecho: `trade-sheet` sin Badge Demo ni nota (quedó solo en top-bar/cartera donde sí orienta). Import sin uso fuera.
- Verificación: sin `tsc/lint/build` aquí (sin shell); pendiente operador: `npx tsc --noEmit`, comprar en demo.
- Archivos: `components/domain/trade-sheet.tsx`.
- Favoritas (diagnóstico, sin cambio aún): hoy viven solo en este navegador (`a24_favorites`), no en la cuenta; el filtro Favoritas vacío muestra el vacío genérico.

## N10 — Moneda por defecto: se mantiene CLP (2026-10-06)
- Revertido el cambio a USD: CLP sigue por defecto (mercado chileno). Sin cambios efectivos vs M40.
- Pendiente (demo US$1000): ver nota N10 original — pide migración 0006 + reescritura. A confirmar.

## N9 — Cartera sin saltos + aviso solo con retraso (2026-10-06)
- Hecho: fuera "Valor del punto en el gráfico" de cartera (era lo que empujaba el gráfico) + `mb-2` bajo el total. `PriceFreshness` con `delayedOnly` en cartera, detalle y mercado: sin "Actualizado hace Xs"; solo "Precio con retraso" si stale o > 60 s. Portada intacta.
- Verificación: sin `tsc/lint/build` aquí (sin shell); pendiente operador: `npx tsc --noEmit`, `npm test`, mirar `/app/cartera` (hover sin saltos) y detalle/mercado.
- Archivos: `portfolio-screen.tsx`, `price-panel.tsx`, `market-screen.tsx`, `price-freshness.tsx`.

## N8 — Sidebar: menú con cierre afuera + riel limpio (2026-10-06)
- Hecho: menú de perfil se cierra con clic afuera y Escape. Riel colapsado sin botón salir ni insignia D (solo avatar → `/app/perfil`; el cambio demo/real sigue en expandido y perfil). Fuera los botones de contraer/expandir (se alterna con clic en el fondo y Ctrl/Cmd+B).
- Verificación: sin `tsc/lint/build` aquí (sin shell); pendiente operador: `npx tsc --noEmit`, probar clic fondo, menú y Escape en 1280.
- Archivos: `components/app-shell/sidebar.tsx`.

## N7 — Sidebar sin nota demo + real próximamente (2026-10-06)
- Hecho: `AccountSwitch` sin nota ni insignia (el selector ya dice Cuenta demo). Cuenta real: "Cuentas reales: próximamente. De momento no ofrecemos cuentas reales. Te avisaremos cuando estén disponibles." (es/en). Hoja de compra y resto intactos.
- Verificación: sin `tsc/lint/build` aquí (sin shell); pendiente operador: `npx tsc --noEmit`, mirar sidebar y cuenta real.
- Archivos: `account-switch.tsx`, `es-CL.ts`, `en.ts`.

## N6 — Perfil y Ajustes al menú del usuario (2026-10-06)
- Hecho: sidebar y tabs con 3 ítems (Mercado, Cartera, Billetera). Clic en el perfil del sidebar abre menú con Perfil, Ajustes, switch USD/CLP y salir. En móvil, avatar en el TopBar → `/app/perfil`. Rutas y páginas intactas.
- Verificación: sin `tsc/lint/build` aquí (sin shell); pendiente operador: `npx tsc --noEmit`, `npm run e2e`, mirar `/app` y `/app/cartera` en 360/1280 (menú, moneda, salir).
- Archivos: `nav.ts`, `sidebar.tsx`, `bottom-tabs.tsx`, `top-bar.tsx`.

## N5 — Navbar que se oculta al bajar (2026-10-06)
- Hecho: `SiteHeader` se esconde con `-translate-y-full` al bajar y reaparece al subir o arriba del todo; con menú móvil abierto siempre visible. Transición 240ms con `ease-spring`. Primer render visible (sin flash).
- Verificación: sin `tsc/lint/build` aquí (sin shell); pendiente operador: `npx tsc --noEmit`, probar en `/` bajar/subir a 360/1280, con menú abierto y con reduced-motion.
- Archivos: `components/landing/site-header.tsx`.

## N4 — Páginas dedicadas + centro de ayuda (2026-10-06)
- Hecho: nuevas `/como-funciona` (reusa HowItWorks + notas), `/costos` (reusa CostsSection + detalle), `/seguridad` (reusa SecuritySection + marco). Navbar apunta a páginas (no a `#`). `/ayuda` es centro de ayuda con 6 guías + FAQ. Sitemap y ARQUITECTURA §2.1 al día. Homepage intacta.
- Verificación: sin `tsc/lint/build` aquí (sin shell); pendiente operador: `npx tsc --noEmit`, `npm run build` (estático), mirar las 4 rutas a 360/1280.
- Archivos: `app/(marketing)/{como-funciona,costos,seguridad,ayuda}/page.tsx`, `site-header.tsx`, `app/sitemap.ts`.
- Fix build (2026-10-06): `/como-funciona` envuelve `HowItWorks` en `<LiveLandingPrices>` (el `LandingPrice` lo exige; era el prerender-error de Vercel).

## N3 — Custodia en lenguaje simple (2026-10-06)
- Hecho: landing sin "billetera/wallet Solana": hero, grilla, seguridad, paso 3 e intro del cómo funciona dicen "tu propia billetera —nosotros no custodiamos tus activos". Títulos sin "autocustodia". FAQ/legales intactos ([REVISIÓN ABOGADO]).
- Verificación: sin `tsc/lint/build` aquí (sin shell); pendiente operador: `npx tsc --noEmit`, mirar `/` (hero, grilla, cómo funciona, seguridad).
- Archivos: `hero.tsx`, `feature-grid.tsx`, `security-section.tsx`, `how-it-works.tsx`, `announcement-pill.tsx` (comentarios).

## N2 — Copy 24/7 según xstocks.fi (2026-10-06)
- Hecho: hero, pill, grilla, lead de mercado (es/en), FAQ y reglas (AGENTS, DESIGN-SYSTEM, DISENO-REFERENCIAS, SUPABASE) a "24/7". Fuente verificada: xstocks.fi dice "tradeable 24/7" / "24/7 Trading Hours". Aviso conservado: fuera del horario regular el precio puede variar más. Lógica de estado del subyacente intacta (regular/extendido/cerrado, tests).
- Verificación: sin `tsc/lint/build` aquí (sin shell); pendiente operador: `npx tsc --noEmit`, `npm test`, mirar `/`, `/ayuda`, `/app`.
- Archivos: `hero.tsx`, `announcement-pill.tsx`, `feature-grid.tsx`, `es-CL.ts`, `en.ts`, `faq.ts`, reglas.

## N1 — Hero sin numerito y menos aire arriba (2026-10-06)
- Hecho: eliminado `01 — Tokenizadas` de `components/landing/hero.tsx:63`; `pt-12→pt-8`, `md:pt-20→md:pt-14`, `lg:pt-24→lg:pt-16`; pill ahora primera pieza sin `mt-5`.
- Verificación: sin `tsc/lint/build` aquí (sin shell); pendiente operador: `npx tsc --noEmit`, mirar `/` a 360/1280.
- No se cambia horario a 24/7: xStocks cierra fin de semana; regla AGENTS.md §4 lo prohíbe.

## M43b — fix e2e y mínimo de compra (2026-10-06, fix(M43): minimo de compra y e2e smoke)
- Hecho: `effectiveMinOrderUsd` es el máximo entre `MIN_TRADE_USD` y el de la acción; `amountBlock` recibe `minUsd` y `blockCopy` muestra ese mismo mínimo; la hoja pasa `chips` con `quickTradeAmounts` (nunca bajo el mínimo, sin pasar el disponible cuando cabe) y quedó un solo "Mínimo por orden". Smoke: compra con `$10.000`, precio visitante con `/\$\s?[\d.]+/` (moneda única M40) y perfil con link/heading "Ajustes" → "Settings".
- Archivos clave: `lib/market/asset-status.shared.ts`, `lib/trade/amount.ts`, `components/domain/trade-sheet.tsx`, `e2e/smoke.spec.ts`, `tests/unit/trade-minimum.test.ts` (6).
- Decisiones: `minUsd` opcional con default `MIN_TRADE_USD` (venta y callers viejos intactos); `SHARES` también filtra por mínimo; `e2e/registro-demo.spec.ts` intacto; sin migraciones.
- Verificación: `npx tsc --noEmit` ok; `npm run lint` ok; `npm test` 186/186 (30 archivos); sin `next dev/build`, sin `npm run e2e` (lo corre el operador). Digo con todas sus letras: NO comprobable aquí el e2e en navegador ni la hoja con datos reales.
- Pendiente operador: correr `npm run e2e` (smoke + registro-demo) y mirar `/app/accion/AAPLx` (rápidos sin $5.000 bajo mínimo, un solo mínimo, Revisar habilitado con $10.000).

## M43 — Registro simple para la demo (2026-10-06, M43: registro simple para la demo)
- Hecho: alta demo en un paso (modo alta: correo, contraseña, repetir contraseña y checkbox "Acepto los Términos y Condiciones y la Política de Privacidad" con links en pestaña nueva a `/legal/terminos` y `/legal/privacidad`; botón "Crear mi cuenta demo"; `user_metadata` sólo con `terms_version`, `privacy_version`, `terms_accepted_at` y `signup_source:"demo"`). `claimsDemoReady()` (términos+privacidad, o perfil completo antiguo) y gate sin redirect a `/app/onboarding`: con demoReady entra a todo `/app`; sin aceptación va a `/app/aceptar` (mismo checkbox; guarda vía `/api/me/consents`, alinea el JWT y refresca). Migración `0005_registro_simple.sql` (NO aplicada) reescribe `handle_new_user()` con `accepted_at` válido/no futuro o `now()` y `on conflict do nothing`. Real sigue en "Próximamente" + "Cuando la cuenta Real esté disponible te pediremos tus datos y verificaremos tu identidad." con link al onboarding (se conserva, accesible directo).
- Archivos clave: `lib/auth/{registro-schema,registro-client,gate,paths,login-client,server-session}.ts`, `lib/supabase/middleware.ts`, `middleware.ts`, `app/(platform)/app/{registro/wizard,aceptar/*,accion/[ticker]/page,accion/[ticker]/detail-screen,ingresar/supabase-login}`, `RealAccountEmpty`, i18n, `0005_registro_simple.sql`, `tests/unit/{registro-demo,gate}.test.ts`, `e2e/registro-demo.spec.ts`.
- Decisiones: `registroSchemaAt`/`perfilListo` intactos (vuelven para Real/KYC); mock conserva su onboarding; `/app/onboarding` ya no rebota con demoReady; aceptar también hace `updateUser` porque el gate lee el JWT, no la tabla; `supabaseDemoReady` opcional con fallback a `supabaseOnboarded`; textos legales nuevos con "[REVISIÓN ABOGADO]".
- Verificación: `npx tsc --noEmit` ok; `npm run lint` ok; `npm test` 180/180 (29 archivos, incl. `registro-demo` 12: esquema exacto, `claimsDemoReady`, gate, SQL estático con `on conflict`+`set search_path`); `git grep sb_secret_` sin claves nuevas; `.env.local` fuera de `git status`; sin `next dev/build`, sin e2e (los corre el operador). Criterios: DOM de 4 campos comprobado en código (email/password/repetir/checkbox, sin RUT ni perfil) + e2e mock escrito (sin checkbox: error exacto y no navega; con todo: `/app` + Mercado). Digo con todas sus letras: NO comprobables aquí las 2 filas de `consents` tras 0005, la compra demo sin perfil contra Supabase ni el e2e en navegador (sin base ni servidor en esta ejecución).
- Pendiente operador/Manu: aplicar 0005 en desarrollo y comprobar por SQL las 2 filas de `consents` (versión + `accepted_at`); correr build de producción, `npm run e2e`, `npm run e2e:auth` y checks con datos reales (bloque C); mirar `/app/registro` (4 campos, error sin checkbox, `signUp` no se llama), `/app/aceptar`, `/app` sin perfil (compra demo, nunca onboarding) y Real ("Próximamente" + nota).

## M42b — Hidratación portada (2026-10-06, fix(M42): hidratacion de la portada)
- Hecho: el error #418 en "/" era `PriceFreshness` con `useState(() => Date.now())`: el "Actualizado hace Xs" difería entre el HTML ISR (hasta 30 s viejo) y el navegador. Nuevo `useMounted()` (`useSyncExternalStore`, `getServerSnapshot: false`) + `resolveFreshnessText`/`FRESHNESS_PLACEHOLDER_TEXT` (puros, en `freshness.ts`): primer render estable con la misma altura, contador desde `useEffect` cada 1 s. Aplicado en `LandingFreshness` y en `PriceFreshness` (M41, también lo usan detalle/mercado/cartera). Resto de la portada revisado: `useLandingQuote` usa los `initial` del servidor, números con `es-CL` fijo, `Reveal`/`Tabs`/`SiteHeader`/`FlashPrice` con primer render estable.
- Archivos clave: `lib/hooks/use-mounted.ts`, `lib/market/freshness.ts`, `components/domain/price-freshness.tsx`, `components/landing/live-landing-prices.tsx`, `tests/unit/landing-freshness-hydration.test.ts` (3).
- Decisiones: sin `suppressHydrationWarning`; comportamiento visible intacto (US$, 20 s, destello, en vivo/ilustrativos); `client-imports` sigue verde (sin server-only en cliente).
- Verificación: `npx tsc --noEmit` ok; `eslint` de los 5 archivos tocados ok; `npm test` 168/168 (28 archivos); `git grep sb_secret_` sin claves nuevas. Sin `next dev/build`, sin e2e, sin push.
- Pendiente: el operador confirma en producción que "/" ya no muestra el error #418 (con y sin preferencia de moneda).

## M42 — Portada con precios reales (2026-10-06, M42: portada con precios reales)
- Hecho: `lib/landing/live-quotes.ts` (server-only; 1 llamada a `prices.list` con los ~10 símbolos de la muestra, timeout 2,5 s, cache 30 s; sin `PRICES_MODE=live`, fallo o timeout → muestra con `live: false`). `page.tsx` async con `revalidate = 30`. `LiveLandingPrices` + `useLandingQuote` + `<LandingPrice full|tape>` (cliente; refresco 20 s, `refetchOnWindowFocus`) + `LandingSharesValue` + un solo `LandingFreshness` bajo la cinta. Hero/cinta/pasos/ficha reciben `quotes` y `live`; etiqueta exacta según origen ("Precios en dólares (US$), en vivo" vs "Precios ilustrativos"); precios en US$ con `formatUsd`/destello M41; sin series en la portada (`sparkline` opcional, muestra como respaldo). `TickerRow` suma `priceSlot` opcional (mercado intacto). Tests `landing-live-quotes.test.ts` (8); `client-imports` vigila `lib/landing/live-quotes`.
- Archivos clave: `lib/landing/live-quotes.ts`, `app/(marketing)/page.tsx`, `components/landing/{live-landing-prices,landing-quote-preview,hero,ticker-marquee,how-it-works,product-mock}.tsx`, `components/domain/ticker-row.tsx`, `lib/mocks/landing.ts`, `tests/unit/{landing-live-quotes,client-imports}.test.ts`.
- Decisiones: `live` global true sólo si todo llega jupiter sin `reference`; parcial mezcla valores con `live` por quote. Con la muestra la query cliente queda apagada. Depósito de HowItWorks sigue en CLP. Copy 24 h, registro/login, mercado, barra móvil y M34-M41 intactos.
- Verificación: `npx tsc --noEmit` ok; `eslint` de los 12 archivos tocados ok (2 warnings menores corregidos); `npm test` 165/165 (27 archivos); `git grep sb_secret_` sin claves nuevas. Sin `next dev/build`, sin e2e, sin push.
- Pendiente: mirar `/` con `PRICES_MODE=live` (números en vivo, destello, "Actualizado hace Xs", etiqueta en vivo) y con fallo (muestra + "Precios ilustrativos"); confirmar ISR 30 s en el entorno del operador.

## M40b — Dólar robusto (2026-10-06, fix(M40): dolar robusto)
- Hecho: `live-fx.ts` con timeout 6 s + 1 reintento, fallo recordado 15 s, último valor válido hasta 24 h marcado `stale` (source `stale`, contrato intacto), dedup en vuelo y respaldo `open.er-api.com` (`rates.CLP`, `FX_FALLBACK_URL`). `livePrices.list` calienta el dólar en segundo plano; `fx()` lo usa. Cartera demo sin cambios: el `stale` fluye como tasa válida y sólo sin ningún dólar mantiene el error actual. Tests `live-fx-robust.test.ts` (6).
- Archivos clave: `lib/market/live-fx.ts`, `lib/services/prices.live.ts`, `lib/env.ts` (`FX_FALLBACK_URL`), `.env.example`, `tests/unit/live-fx-robust.test.ts`.
- Decisiones: fresco sin campo `stale` (compat con tests M34); `stale` vale para M40 (tasa > 0 = CLP conocido); respaldo de 1 intento tras 2 de mindicador; textos M40 y M41 intactos.
- Verificación: `npx tsc --noEmit` ok; `eslint` de los 4 archivos tocados ok; `npm test` 157/157 (26 archivos); `git grep sb_secret_` sin claves nuevas. Sin `next dev/build`, sin e2e, sin push.
- Pendiente: mirar `/app` y `/app/cartera` en arranque en frío con `PRICES_MODE=live` (CLP desde el inicio, sin "Dólar no disponible" salvo caída total).

## M41 — Precios en vivo visibles (2026-10-06, M41: precios en vivo visibles)
- Hecho: polling 15 s intacto + `refetchOnWindowFocus: true` sólo en precios (`usePrices`, mercado) y gráfico abierto (`useHistory` cada 60 s visible, `refetchIntervalInBackground: false`). `PriceFreshness` ("Actualizado hace Xs" / "Updated Xs ago", `aria-live="off"`, intervalo 1 s) en detalle, cabecera de lista y cartera; `stale` o > 60 s → `text-warn` + "Precio con retraso". `usePriceFlash` (puro + hook 700 ms, sin flash en primer render ni cambio de moneda) vía `FlashPrice` (`bg-up-bg`/`bg-down-bg`) en precio grande, filas/tarjetas y cartera. Último punto del gráfico sigue siendo el spot. Tests `live-prices-visible.test.ts` (10).
- Archivos clave: `lib/{market/freshness,hooks/use-price-flash,hooks/queries}.ts`, `components/domain/{price-freshness,flash-price,ticker-row,ticker-card,position-row}.tsx`, `price-panel`, detalle, `market-screen`, cartera, i18n (`prices.delayed`).
- Decisiones: filas siguen servidor (envuelven `FlashPrice` cliente); textos del formato viven en `freshness.ts` y el sufijo en i18n; `useHistories` (sparklines) sin repoll; moneda única M40 y precio único M34 intactos.
- Verificación: `npx tsc --noEmit` ok; `eslint` por archivo ok; `npm test` 151/151 (25 archivos); `git grep sb_secret_` sin claves nuevas. Sin `next dev/build`, sin e2e, sin push.
- Pendiente: mirar detalle/mercado/cartera con polling real (destello, "Actualizado hace Xs", "Precio con retraso" tras 429), reducir movimiento, EN.

## M40 — Una sola moneda (2026-10-06, M40: una sola moneda)
- Hecho: `lib/preferences/currency.ts` (resolve sesión>local>CLP + cookie `mv_currency` 1 año) y `useDisplayCurrency/useSetDisplayCurrency` (local con useSyncExternalStore, DB si hay sesión, UI al instante); `useT` la usa. `/app/ajustes` pública (moneda primero, idioma después, vale visitante); `/app/perfil/idioma` redirige; perfil y sidebar/bottom-tabs suman Ajustes (IconGear). Switch USD/CLP en top-bar, header público y sidebar. Detalle sin celdas USD/CLP; trade/cartera/billetera/mercado en moneda única; orden CLP→USD antes de cotizar + "La orden se ejecuta en dólares (US$X)". `useFx` cada 5 min. Tests `display-currency.test.ts` (11).
- Archivos clave: `lib/preferences/currency.ts`, `lib/hooks/use-display-currency.ts`, `app/(platform)/app/ajustes/`, `components/{app-shell/currency-switch,domain/preferences-form}`, detalle, `trade-sheet`, cartera, billetera, `paths.ts`, `nav.ts`, i18n.
- Decisiones: idioma visitante también en local (`mv_language`); depósitos en pesos y catálogo intactos; sin CLP sin FX se muestra USD; sell en SHARES sigue en unidades.
- Verificación: `npx tsc --noEmit` ok; `eslint` por archivo ok (completo excede 120 s); `npm test` 141/141 (24 archivos); `git grep sb_secret_` sin claves nuevas. Sin `next dev/build`, sin e2e, sin push.
- Pendiente: mirar `/app/ajustes` con y sin sesión, switch en móvil/escritorio, detalle sin duplicados, compra en CLP con línea en dólares, cartera/billetera en una moneda.

## M39b — Separar asset-status cliente/servidor (2026-10-06, fix(M39): separar asset-status cliente/servidor (build))
- Hecho: `lib/market/asset-status.shared.ts` nuevo (tipos + `chipKeyForStatus`, `tradeBlockForStatus`, `effectiveMinOrderUsd`, `normalizeMode`, `normalizePeriod`; sin `server-only`, sin `lib/env` ni catálogo). `asset-status.ts` conserva `server-only`, `status()`, `isLiveStatusEnabled()`, cache y fetch, y re-exporta lo compartido. `detail-screen.tsx` y `trade-sheet.tsx` importan del `.shared`. Test `client-imports.test.ts` (1) falla si un `"use client"` importa `asset-status` sin `.shared`, `catalog/assets`, `lib/env` o `server-only`.
- Verificación: `npx tsc --noEmit` ok; `eslint` de los 5 archivos tocados ok (`npm run lint` completo excede el límite de 120 s de la shell); `npm test` 130/130 (23 archivos); `git grep` sin `sb_secret_` ni import cliente→servidor. Sin `next dev/build`, sin e2e, sin push.
- Pendiente: el operador corre `next build` para confirmar el fix; mirar `/app/accion/AAPLx` con `MARKET_STATUS_MODE=live`.

## M39 — Horario real por acción (2026-10-06, M39: horario real por accion)
- Hecho: `lib/market/asset-status.ts` (server-only; xStocks assets+system/status timeout 2,5 s cache 60 s; fallback catálogo→mock; sólo con `PRICES_MODE`/`MARKET_STATUS_MODE=live`). `GET /api/market/status?symbol=` (sin símbolo sigue el estado general). Detalle con chips reales (suspendida/abierto/extendido/nocturno/cerrado + "abre el lunes 09:00" en America/Santiago) y línea "Horario: 24 horas, de lunes a viernes" o "Horario de bolsa (NY)". Hoja de compra con "Mínimo por orden" y validación suave; suspendida deshabilita CTA demo. Lista con punto por fila desde el catálogo. `MARKET_STATUS_MODE` en `lib/env.ts` y `.env.example`. Tests `asset-status.test.ts` (6).
- Archivos clave: `lib/market/asset-status.ts`, `lib/catalog/assets.ts` (+columnas modo/período/open/next/limits), `lib/format.ts` (`formatReopenWhen`), `app/api/market/status/route.ts`, contratos/cliente/hooks, detalle, `trade-sheet`, `ticker-row`, `market-screen`, `market-status-pill`, i18n.
- Decisiones: `maxOrderFiatValue` 0 se conserva (no opera en ese período); `offHours` mock → `extended` abierto; `unknown` → cerrado; dot de lista sólo con dato del catálogo. Precio único, sidebar, demo, registro/login, mercado público, barra móvil y `?operar=vender` sin cambios.
- Verificación: `npx tsc --noEmit` ok; `npm run lint` ok; `npm test` 129/129 (22 archivos); `git grep` sin secretos ni "24/7" nuevo; `.env.local` fuera de `git status`. Sin `next dev/build`, sin e2e (límite de shell), sin push.
- Pendiente: mirar `/app/accion/AAPLx` con `MARKET_STATUS_MODE=live` (chips, horario, mínimo, suspendida) y `/app` (puntos por fila); cron de sync ya trae los campos (M37/M38).

## M38b — Catálogo paginado (2026-10-06, fix(M38): catalogo paginado)
- `fetchAssetsFromSupabase` pagina con `order=curated.desc,symbol.asc`, `limit=1000` + `offset` (tope 10 páginas; fallo parcial usa lo obtenido). Si hay filas pero ninguna curada y el alcance es `curated`, fallback a `config/tickers.ts`. Sin filtro `curated=eq.true` en servidor para no romper el cache compartido ni `bySymbol`. Tests: `catalog-pagination.test.ts` (4). `tsc`, `lint`, `npm test` 123/123 ok.

## Estado
M38 hecha y verificada (`npx tsc --noEmit`, `npm run lint`, `npm test` 119). M36 y M37 ya commiteadas (2b089d3); la migración 0004 está aplicada y public.assets tiene 1171 filas. Sin `next dev/build`, sin push, sin e2e (límite de shell).

## Tareas hechas

### M38 — Mercado escalable (2026-10-06, M38: mercado escalable) [VERIFICADA, POR COMMITEAR]
- Hecho: `lib/catalog/assets.ts` (server-only; lee public.assets con publishable key, cache 5 min; `search` con q/categoría/scope/página/orden + `bySymbol`; fallback a `config/tickers.ts`). `GET /api/market/search` (zod, pageSize máx 50, cache 30/60 s, logo local o null, `lowLiquidity` < US$10.000). `lib/market/price-batcher.ts` (lotes de 50, dedup en vuelo, cache 15 s, `stale` tras 429 con backoff); `livePrices` y `/api/prices` (máx 50) lo usan. Mercado con debounce 300 ms, "Cargar más", skeleton, vacío "No encontramos acciones con ese nombre", una llamada de precios por página y "Baja liquidez". Detalle por `bySymbol` con CTA deshabilitado si no habilitada/suspendida.
- Archivos clave: `lib/catalog/assets.ts`, `lib/market/price-batcher.ts`, `app/api/market/search/route.ts`, `market-screen.tsx`, detalle (`page.tsx`, `detail-screen.tsx`), contratos/cliente/hooks, i18n, `.env.example`.
- Decisiones: Supabase se lee por REST con fetch (mockeable, sin cookies); filtro/orden en memoria sobre 1171 filas. `stale` es campo opcional nuevo en `Quote`. Favoritas se filtra en cliente. Precio único M34, sidebar, demo, registro/login, mercado público, barra móvil y `?operar=vender` sin cambios.
- Verificación: `npx tsc --noEmit` ok; `npm run lint` ok; `npm test` 119/119 (20 archivos, incl. `market-search` 11 y `price-batcher` 8); `git grep` sin secretos; `.env.local` fuera de `git status`.
- Pendiente: clave de Jupiter de Manu (portal.jup.ag); mirar `/app` (buscar, chips, "Cargar más", "Baja liquidez") y `/app/accion/AAPLx` en navegador; con `CATALOG_SCOPE=all`, precios/operar fuera de los 50 curados siguen limitados a `config/tickers.ts`.
- Próximo: fuera de esta tarea.

## Tareas hechas

### M37 — Catálogo xStocks automático (2026-10-06, M37: catalogo xstocks automatico) [VERIFICADA, POR COMMITEAR]
- Hecho: migración `0004_assets.sql` (tabla `assets`, RLS sólo SELECT para anon/authenticated, índices curated/category/lower(name)). Curada de 50 en `data/curated-symbols.json` (fuente única) + `config/curated-symbols.ts`. Script `scripts/sync-xstocks.mjs` (`npm run sync:xstocks`, flags --dry-run/--no-db/--no-files; API paginada, Jupiter con reintento y respaldo CSV, logos una vez, upsert service_role, genera `config/tickers.generated.ts`). `config/tickers.ts` sale del generado (mismos exports; 12 mints intactos). `CATALOG_SCOPE=curated|all` (default curated; all para M38) en `lib/env.ts` y `.env.example`.
- Archivos clave: `supabase/migrations/0004_assets.sql`, `data/{xstocks-solana-2026-10-06.csv,curated-symbols.json}`, `config/{curated-symbols.ts,tickers.generated.ts,tickers.ts}`, `scripts/sync-xstocks.mjs`, `lib/catalog/xstocks.ts`, `lib/{types,api/contracts,market/browse,mocks/prices,env.ts}`, mercado, detalle, i18n, `docs/SUPABASE.md`.
- Decisiones: categorías nuevas finance/health/energy/industrial/commodity (filtros y chips extendidos). Generado sin liquidez para no cambiar en cada sync. `HOODx/MSTRx` enabled true (no suspendidos). Mock con ancla determinista para símbolos nuevos; demo/landing/precio único/sidebar/`?operar=vender` sin cambios.
- Verificación: `npx tsc --noEmit` ok; `npm run lint` ok; `npm test` 100/100 (18 archivos, incl. `xstocks-catalog.test.ts` 7); sync real `--no-db`: total 1171, con Solana 1171, 38 logos bajados + 12 existentes, 0 errores; `git grep` sin secretos; `.env.local` fuera de `git status`.
- Pendiente: (0004 ya aplicada el 2026-10-06 vía psql y catálogo sincronizado: 1171 filas) cron diario en Vercel cuando haya deploy (M40); revisar marcas/logos con abogado. [REVISIÓN ABOGADO] logos/marcas.
- Próximo: M38 (fuera de esta tarea).

### M36 — Cuenta demo por usuario (2026-10-06, M36: cuenta demo por usuario) [VERIFICADA, POR COMMITEAR]
- Hecho: migración `0003_demo_accounts.sql` (demo_accounts/positions/orders, RLS sólo lectura propia, `demo_trade` con promedio ponderado y errores cortos, `demo_reset`, trigger + backfill; sólo `service_role` ejecuta). Servicio server-only `lib/services/demo.supabase.ts` (precio del servicio de M34 y dólar real; sin dólar o con precio de referencia rechaza con mensaje claro; escrituras por rpc). Rutas portfolio/balances/activity/quote/build/submit/status leen la demo del usuario con `mv_account=demo` (defecto); `real` devuelve vacío/bloquea; mock sigue en memoria. Nueva `POST /api/demo/reset`. Selector demo/real en sidebar (icono con tooltip si colapsado), perfil y top bar (insignia Demo); real muestra "Próximamente: depósitos reales"; demo muestra insignia, nota de simulación y botón Reiniciar (Cartera y Perfil). i18n es-CL/en y `docs/SUPABASE.md` con cómo aplicar 0003.
- Archivos clave: `supabase/migrations/0003_demo_accounts.sql`, `lib/services/{demo.supabase,demo.logic}.ts`, `lib/account/{mode,server}.ts`, `lib/hooks/use-account-mode.ts`, `app/api/{portfolio,wallet/*/trade/*,demo/reset}`, `components/{app-shell/account-switch,domain/{real-account-empty,reset-demo-button}}`, shell, cartera, billetera, perfil, detalle, trade-sheet, i18n.
- Decisiones: saldo demo en CLP ($1.000.000); cartera/balances se exponen en USD vía dólar real (sin inventar: si falta, error con reintento). Cotizaciones en memoria (60 s); saldo/posiciones/órdenes en Supabase. Sin billetera, la demo firma con el id de usuario. En billetera demo no hay fila SOL: se oculta ese bloque y la dirección dice "sin dirección en Solana". Registro/login, mercado público, precio único, sidebar, barra móvil y `?operar=vender` sin cambios.
- Verificación (2026-10-06, r2): `npx tsc --noEmit` ok; `npm run lint` ok tras renombrar `useUserDemo`/`useRealAccount` a `isUserDemoRequest`/`isRealAccountRequest` (el prefijo `use` los marcaba como hooks) y quitar el `setState` en efecto de `useAccountMode` (inicializador perezoso lee la cookie); `npm test` 93/93 (17 archivos, incl. `demo-account.test.ts` 11); `npm run e2e` 2 passed + 1 skipped (mock, `.next-e2e`). Revisión SQL: idempotente, RLS sólo-lectura propia, grants sólo a `service_role`, sin `pg_catalog.current_date` (usa `now()`); corregida venta parcial en `demo_trade` (antes no restaba las acciones si quedaba saldo). Búsqueda de claves de Supabase en el código limpia; `.env.local` no aparece en `git status`.
- Pendiente: ninguno (0003 aplicada el 2026-10-06 vía psql; commit e839f5b). Sin `next dev/build`, sin push.
- Próximo: fuera de esta tarea.

## Tareas hechas

### M35 — Sidebar colapsable (2026-10-06, M35: sidebar colapsable)
- Hecho: sidebar de escritorio con dos estados: expandido (240px) y colapsado (riel de 72px con iconos, logo punto y sin textos). Clic en el fondo alterna (links/botones/inputs no); cursor `w/e-resize` sólo en el fondo (`cursor-pointer` en lo interactivo). Botón visible con `aria-label` y `aria-expanded`, atajo Ctrl/Cmd+B (ignora inputs). Colapsado usa `Tooltip` con `aria-label` por item. Cookie `mv_sidebar` (1 año, path=/) leída en el layout: primer HTML sin flash. Ancho con `transition-[width]` 200ms (reduced-motion global lo deja en 1ms). i18n en `shell.collapseSidebar/expandSidebar`. `npx tsc --noEmit`, `npm run lint`, `npm test` (82, +7) y `npm run e2e` (2, 1 skipped) ok. Sin `next dev` ni `npm run build`.
- Archivos clave: `lib/app-shell/sidebar.ts`, `components/app-shell/{sidebar,app-shell}.tsx`, `app/(platform)/app/layout.tsx`, `components/ui/icons.tsx` (IconPanel, IconLogout), `content/i18n/{es-CL,en}.ts`, `tests/unit/sidebar.test.ts`.
- Decisiones: la grilla pasa a `lg:grid-cols-[auto_minmax(0,1fr)]` para animar el ancho del aside sin saltos. Helpers puros sin DOM (entorno vitest `node`): `parseSidebarState`, `serializeSidebarCookie`, `shouldToggleSidebarClick` (closest a `a,button,input,textarea,select,[contenteditable]`), `shouldIgnoreSidebarShortcut`. Colapsado oculta el saldo largo y el botón de salir es sólo icono con label. Móvil, header público y `?operar=vender` sin cambios.
- Pendiente: mirar `/app` y `/app/cartera` en escritorio con sesión (alternar con clic de fondo, botón y Ctrl+B; tooltip y foco; persistencia al recargar; sin flash). No se abrió el navegador.
- Próximo: fuera de esta tarea.

### M34 — Precio único en la ficha (2026-10-06, M34: precio unico consistente)
- Hecho: titular, Datos, posición y orden demo usan el mismo spot. Jupiter `usdPrice` no se vuelve a dividir (AAPLx 332,78 sigue en 332,78). La serie de referencia se reescala para terminar en ese spot y lleva la etiqueta "Ilustrativo". Variación, máximo y mínimo del rango salen de esa serie. "Variación 24 h" es `priceChange24h` de Jupiter, en el mercado y en Datos. El % bajo el titular es el del rango elegido. Con `PRICES_MODE=live`, `/api/fx/usdclp` lee mindicador (cache 45 min, timeout 2,5 s, `source` live y la fecha). Si falla, no usa 950: el precio queda en USD y dice "Dólar no disponible". Sin el flag, todo sigue en mock. `npx tsc --noEmit`, `npm run lint`, `npm test` (75) y `npm run e2e` (2, 1 skipped) ok. Sin `next dev` ni `npm run build`.
- Archivos clave: `lib/market/{live-quotes,live-fx,series,demo-price}.ts`, `lib/services/{index,prices.live,demo-prices,trade.mock,portfolio.mock}.ts`, `lib/mocks/demo-state.ts`, ficha y mercado, `tests/unit/price-consistency.test.ts`.
- Decisiones: el dólar live va con `PRICES_MODE`, sin flag nuevo. La 24 h no sale del gráfico. El historial real sigue sin proveedor. El e2e fuerza precios mock para no depender de la red. La landing sigue ilustrativa.
- Pendiente: mirar `/app/accion/AAPLx` con `PRICES_MODE=live` (titular, CLP, gráfico, Datos, posición y `?operar=vender`) y la nota si mindicador falla. No se abrió el navegador.
- Próximo: fuera de esta tarea.

### M33 — Registro sin confirmación de correo (2026-10-06, M33: registro sin confirmacion de correo)
- Hecho: si `signUp` trae sesión, refresca y entra al `next` saneado (o `/app`) con el toast "Cuenta creada". Si la sesión es null, sigue "Revisa tu correo". La metadata del alta cumple `claimsOnboarded`. `npm run verify:auth`: PASS 8, FAIL 0, SKIP 0. El paso b quedó PASS: el usuario creado sin confirmar sigue sin poder entrar ("email not confirmed"); el SKIP no se disparó. `npx tsc --noEmit`, `npm run lint`, `npm test` (70) y `npm run e2e` (2, 1 skipped) ok. Sin `next dev` ni `npm run build`.
- Archivos clave: `lib/auth/registro-client.ts`, `app/(platform)/app/registro/wizard.tsx`, `scripts/verificar-auth.mjs`, `tests/unit/registro-destination.test.ts`, `content/i18n/{es-CL,en}.ts`, `docs/SUPABASE.md`.
- Decisiones: el código soporta confirmación apagada y encendida. No se tocó `0002`. Errores (correo ya registrado, etc.) siguen en español. En mock el alta no cambia. El paso b del script es SKIP sólo si ese ingreso devuelve sesión.
- Pendiente: mirar `/app/registro?next=/app/accion/AAPLx?operar=comprar` en el navegador (esta ejecución no levanta Next). Si el panel ya tiene Confirm email en OFF, un alta real debería entrar directo; el script no lo vio porque crea el usuario con `email_confirm: false`. Asociar la cartera real al usuario.
- Próximo: fuera de esta tarea.

### M32 — Verificación de auth con Supabase (2026-10-05, M32: verificacion auth)
- Hecho: `npm run verify:auth` crea el usuario con el admin API (sin `signUp` ni correos), exige confirmación, confirma, ingresa, cierra sesión y borra. Resultado: PASS a createUser, PASS b signIn sin confirmar, PASS c signIn confirmado, SKIP d select, SKIP d update, SKIP d rls (migración no aplicada), PASS e signOut, PASS limpieza. RESUMEN PASS (5 PASS, 0 FAIL, 3 SKIP). `npx tsc --noEmit`, `npm run lint`, `npm test` (66), `npm run build` y `npm run e2e` (2, 1 skipped) ok. Sin `next dev`.
- Archivos clave: `scripts/verificar-auth.mjs`, `scripts/e2e-auth.mjs`, `e2e/auth-supabase.spec.ts`, `lib/supabase/secret.ts`, `docs/SUPABASE.md`.
- Decisiones: un SKIP de perfil no falla el script. `npm run e2e:auth` no entra en `npm run e2e` y no se corrió aquí (levanta Next). La clave de servidor quedó en `lib/supabase/secret.ts` (`server-only`). Ningún componente cliente importa `lib/supabase/admin`. No hay literales de clave en el repo. `.env.local` sigue ignorado por git.
- Pendiente: aplicar `0002` y volver a correr `npm run verify:auth` (d debería pasar). Correr `npm run e2e:auth` donde se pueda levantar Next. La cartera real sigue sin asociarse al usuario.
- Próximo: fuera de esta tarea.

### M31 — Login real con Supabase (2026-10-05, M31: login real supabase)
- Hecho: `/app/ingresar` en supabase pide correo y contraseña (`signInWithPassword`). Errores en español, reenvío si falta confirmar, Google en Próximamente. Tras entrar, `next` saneado (por ejemplo `/app/accion/AAPLx?operar=comprar`); si falta el registro, el wizard conserva `next`. Salir hace `signOut`, limpia cookies mock y vuelve a `/` (perfil y sidebar). `/app/recuperar` y `/app/restablecer` públicas. Cartera, billetera, perfil y subrutas exigen sesión. En supabase, quote, build, submit, cartera, billetera, `/api/me*` y `/api/onramp/session` usan `getUser` y responden 401 sin usuario. El webhook no cambia. Mock igual. `npx tsc --noEmit`, `npm run lint`, `npm test` (66) y `npm run e2e` (2, mock) ok. Sin `next dev`.
- Archivos clave: `lib/auth/{login-schema,login-errors,login-client,gate,paths}.ts`, `app/(platform)/app/{ingresar,recuperar,restablecer}`, `lib/services/auth.supabase.ts`, `lib/api/handler.ts`, `docs/SUPABASE.md`.
- Decisiones: la cartera y la billetera siguen en el mock de la demo (la sesión supabase no trae billetera). Google no se enciende. Con sesión, ingresar y registro redirigen; recuperar y restablecer no. El enlace de clave va a `/auth/callback?next=/app/restablecer`.
- Pendiente: asociar la cartera real al usuario. (0002 ya aplicada.) Plantillas de correo opcionales y Redirect URLs en `docs/SUPABASE.md`. No se abrió el navegador.
- Próximo: fuera de esta tarea.


### M30 — Registro real con Supabase (2026-10-05, M30: registro real supabase)
- Hecho: migración `0002_supabase_auth.sql`, idempotente, para pegar una vez. `/app/registro` en 3 pasos. En modo supabase, `signUp` con confirmación y pantalla "Revisa tu correo" (reenviar a los 60 s). `/api/me` lee `public.profiles` con la sesión (RLS). Si falta la tabla, aviso discreto. El gate mira `user_metadata` del JWT y no consulta la tabla. `npx tsc --noEmit`, `npm run lint`, `npm test` (56) y `npm run e2e` (2, mock) ok. Sin `next dev`.
- Archivos clave: `supabase/migrations/0002_supabase_auth.sql`, `docs/SUPABASE.md`, `lib/auth/registro-schema.ts`, `app/(platform)/app/registro/*`, `lib/services/users.rls.ts`, `lib/auth/gate.ts`.
- Decisiones: `0001` queda con el aviso "NO APLICAR" (no se mueve ni se borra). En mock el formulario valida y entra a la demo. La landing sigue en `/app/ingresar`. El header y "Crear cuenta para invertir" van a `/app/registro` y conservan `next`. Si faltan datos, `/app/onboarding` reusa el wizard. Cartera, billetera y órdenes siguen en mock. El wizard está en español, como el onboarding.
- Pendiente: (0002 ya aplicada.) En el panel: Site URL `http://localhost:3000`; Redirect URLs `http://localhost:3000/auth/callback` y `http://localhost:3000/**`; confirmación de correo activa; el SMTP integrado tiene un límite bajo de correos por hora (en producción, SMTP propio). No se abrió el navegador: esta ejecución no levanta `next dev`. Ingreso, salir y recuperar son M31.
- Próximo: fuera de esta tarea.

### M29 — Base de Supabase (2026-10-05, M29: supabase base)
- Hecho: clientes en `lib/supabase` (`@supabase/ssr` 0.12.7, `@supabase/supabase-js` 2.117.2). `authMode()` es supabase sólo con el flag y URL + clave pública; si falta algo, mock y un `console.warn` una vez. El middleware refresca con `getClaims` (no `getSession`) y copia las cookies al redirect. `/auth/callback` canjea `code` o `token_hash`. `npm run e2e` construye y sirve con auth mock en `.next-e2e`. `npx tsc --noEmit`, `npm run lint`, `npm test` (45) y `npm run e2e` (2) ok. Sin `next dev`.
- Archivos clave: `lib/supabase/*`, `lib/auth/{mode,gate,provider,server-session,supabase-provider,callback-next}.ts`, `middleware.ts`, `app/auth/callback/route.ts`, `scripts/e2e.mjs`, `lib/env.ts`, `.env.example`, `docs/ARQUITECTURA.md`.
- Decisiones: el cliente usa sólo `NEXT_PUBLIC_AUTH_MODE` (hidratación alineada); el servidor prioriza `AUTH_MODE`. Privy queda y no manda si el modo es supabase. `/auth/*` no pasa por geobloqueo, para canjear el correo. Onboarding sigue en `a24_onb`. `SUPABASE_SECRET_KEY` reemplaza el nombre viejo, que queda de alias. `DATA_MODE` y `PRICES_MODE` no cambian. `login()` va a `/app/ingresar`; `logout()` hace `signOut` y vuelve a `/`.
- Pendiente: aplicar `supabase/migrations/0001_init.sql` (el remoto está vacío). Registro (M30) e ingreso/recuperar (M31). Google sigue apagado; la confirmación por correo está activa. No se levantó `next dev`.
- Próximo: fuera de esta tarea.

### M28 — Mercado público sin cuenta (2026-10-05, M28: mercado publico sin cuenta)
- Hecho: sin sesión, `/app` y `/app/accion/[ticker]` responden y no redirigen. Cartera, billetera (depositar, enviar, recibir) y perfil redirigen a `/app/ingresar?next=…`. Con sesión y sin onboarding se ve el mercado; operar manda a completar el registro y conserva `?operar`. Geobloqueo igual. `npx tsc --noEmit`, `npm run lint`, `npm test` (35) y `npm run build` ok. `npm run e2e` (2) ok. Sin `next dev`.
- Archivos clave: `lib/auth/{paths,gate,server-session}.ts`, `middleware.ts`, `components/app-shell/{app-shell,public-header}.tsx`, detalle, landing, `content/i18n/{es-CL,en}.ts`, `tests/unit/gate.test.ts`, `e2e/smoke.spec.ts`, `docs/ARQUITECTURA.md`.
- Decisiones: `isPublicAppPath` y `readServerSession` leen las mismas cookies que el gate, para enchufar Supabase después. El ingreso no tiene modo: los dos CTA llevan sólo `next`. Sin sesión no se monta el TradeSheet ni se llama a cartera, billetera ni `/api/me` (`usePrefs` sólo con sesión). Favoritas siguen: están en este navegador, no en la cuenta. En la landing, "Ver acciones" va a `/app`; "Crear cuenta" y "Entrar" van a `/app/ingresar`.
- Pendiente: mirar `/`, `/app` y `/app/accion/AAPLx` a 360 y en escritorio (header público, CTA, barra, `?operar=vender` ya logueado). El e2e es 1280. No se integró Supabase.
- Próximo: fuera de esta tarea.

### M27 — Logos reales de empresas (2026-10-05, M27: logos de empresas)
- Hecho: 12 PNG de xStocks (400×400, con transparencia) en `public/logos/<underlying>.png`. `config/tickers.ts` apunta a `.png`. El monograma sigue si falta o falla la imagen. Mercado, detalle, cartera, billetera, hoja de compra/venta y landing pasan `logoUrl`. `npx tsc --noEmit`, `npm run lint` y `npm test` (28) ok. Sin `next dev`.
- Archivos clave: `public/logos/*.png`, `scripts/descargar-logos.mjs`, `config/tickers.ts`, `components/domain/{ticker-logo,trade-sheet}.tsx`, `lib/mocks/landing.ts`, landing (hero, how-it-works, product-mock), `tests/unit/ticker-logos.test.ts`, `docs/PENDIENTES-LEGALES.md`.
- Decisiones: no hizo falta `simple-icons`: los 12 respondieron 200 `image/png`. `object-cover` llena el círculo (el PNG es cuadrado; las esquinas transparentes quedan fuera). Fondo `bg-bg` si hay transparencia. Se quitó `unoptimized`: son PNG locales y Next los optimiza; `onError` sigue cayendo al monograma. Marcas sólo para identificar el activo.
- Pendiente: [REVISIÓN ABOGADO] del uso de marcas (`docs/PENDIENTES-LEGALES.md`). Mirar mercado, detalle, compra/venta y landing a 360 y en escritorio. No se levantó el servidor. `/dev/ui` deja un monograma de ejemplo sin `logoUrl`.
- Próximo: fuera de esta tarea.

### M26 — Horario 24/5 y precios reales activos (2026-10-05, M26: horario 24/5 y precios reales activos)
- Hecho: hero, pill, chips, grilla, lead del mercado y FAQ dicen "24 horas, de lunes a viernes" (EN: "Trade 24 hours a day, Monday to Friday"). Sábado y domingo: "Mercado cerrado: abre el lunes". Lun–vie fuera de 09:30–16:00 NY: "Fuera del horario regular" y el aviso de que el precio puede variar más. `.env.example` recomienda `PRICES_MODE=live`. Sin la variable, el código sigue en mock. Si Jupiter falla o falta un ticker, sigue la ancla y "Precio de referencia". Consulta a Jupiter lite de AAPLx: usdPrice 333,39 (acción de referencia 332,85); la ancla mock sigue cerca de 228. `npx tsc --noEmit`, `npm run lint` y `npm test` (27) ok. Sin `next dev`.
- Archivos clave: `components/landing/{hero,announcement-pill,feature-grid,faq}.tsx`, `lib/content/faq.ts`, `lib/mocks/market.ts`, `content/i18n/{es-CL,en}.ts`, `.env.example`, `tests/unit/market-hours.test.ts`.
- Decisiones: `MarketStatus.session` es `regular`, `offHours` o `closed`. El fin de semana no bloquea la orden: sólo cambia el aviso. La regla quedó en AGENTS.md y en DESIGN-SYSTEM. No se leyó `.env.local`.
- Pendiente: la landing es `force-static` y sigue con precios ilustrativos (hero, cinta, mock de producto y sparklines). Unirla al servicio live rompería ese estático o dejaría el precio congelado al build; el historial sigue en mock. Mirar `/`, `/ayuda`, `/app` y `/app/accion/AAPLx` (chip, FAQ, precio real y "Precio de referencia" si falta un ticker). Barra, `?operar=vender`, chips, stats y gráfico no se rehicieron.
- Próximo: fuera de esta tarea.

### M25 — Precios reales detrás de un flag (2026-10-05, M25: precios reales detras de flag (mock por defecto))
- Hecho: `PRICES_MODE=mock` por defecto. Con `live`, el precio actual sale de Jupiter Price v3 (`JUPITER_BASE_URL/price/v3`). `JUPITER_API_KEY` es opcional y no va en el código. Timeout 2,5 s, cache 10 s. Se descartan precios ≤ 0 o no numéricos. Si falla la red o falta un ticker, se usa la ancla y `reference: true` (en el detalle, «Precio de referencia»). Historial, dólar y horario siguen en mock. Con el flag apagado no hay red. `npx tsc --noEmit`, `npm run lint` y `npm test` (23) ok. Sin `next dev`.
- Activar: `PRICES_MODE=live` en el servidor (no hace falta `DATA_MODE=live`) y reiniciar el proceso. La clave de Jupiter es opcional.
- Archivos clave: `lib/market/live-quotes.ts`, `lib/services/{prices.live,index}.ts`, `lib/env.ts`, `.env.example`, `tests/unit/live-prices.test.ts`, `app/(platform)/app/accion/[ticker]/price-panel.tsx`.
- Decisiones: flag propio, para no encender trade, cartera ni auth. El multiplicador on-chain se intenta con tope de 0,8 s y cache de 5 min; si el RPC no llega, queda 1. `PRICE_DEVIATION_MAX_BPS` sigue sólo en la cotización de la orden. Cartera y orden mock siguen en la ancla. El aviso no sale en el modo mock.
- Pendiente: mirar `/app` y `/app/accion/AAPLx` con el flag (precio, aviso si falta un ticker, gráfico, barra, `?operar=vender`). Sin RPC privado el multiplicador puede quedar en 1.
- Próximo: fuera de esta tarea.

### M24 — Gráfico UX: crosshair y sin recrear (2026-10-05, M24: grafico UX crosshair y sin recrear chart)
- Hecho: lightweight-charts se crea al montar y se destruye al salir. El rango hace `setData` y `fitContent`; el color (sube, baja o plano) entra con `applyOptions`. `autoSize` redimensiona. Crosshair en imán, líneas punteadas. Cursor o arrastre horizontal: precio y fecha es-CL (`formatDateTime`); al salir, último precio y variación del rango. Rangos con `aria-pressed` y foco visible. La caja no cambia de alto: skeleton encima mientras carga. El arrastre vertical sigue siendo de la página. `npx tsc --noEmit` y `npm run lint` ok. Sin `next dev`.
- Archivos clave: `components/domain/price-chart.tsx`, `app/(platform)/app/accion/[ticker]/price-panel.tsx`, `components/ui/segmented-control.tsx`.
- Decisiones: no hay rango 1D; siguen 1S, 1M, 3M, 1A y Todo. La hora usa `lib/format.ts` (America/Santiago). Sólo un gesto claramente horizontal elige un punto; si no, la página se desplaza. Al soltar el dedo vuelve el precio. No se tocó la barra, los chips, `?operar=vender` ni la cartera. Datos mock.
- Pendiente: mirar `/app/accion/AAPLx` a 360 y en escritorio (crosshair, rangos, scroll vertical, skeleton, barra y `?operar=vender`).
- Próximo: M25.

### M23 — Detalle premium: logos, chips y stats (2026-10-05, M23: detalle premium logos chips y stats)
- Hecho: si no hay archivo en `public/logos`, monograma circular (símbolo sin la "x", color estable, borde). Header 56px; filas 36px. Chips: categoría, "Token en Solana" y horario (abierto o mercado ampliado, con la nota del API). Grilla 2 columnas en celular y 3 en escritorio: precio USD y CLP, variación 24 h, variación, máximo y mínimo del rango. Mint con copiar y Solscan. Emisor y aviso de congelamiento, con link a riesgos. `npx tsc --noEmit` y `npm run lint` ok. Sin `next dev`.
- Archivos clave: `components/domain/ticker-logo.tsx`, `app/(platform)/app/accion/[ticker]/{detail-screen,price-panel}.tsx`, `lib/market/series.ts`, `content/i18n/{es-CL,en}.ts`, `components/domain/position-row.tsx`, `app/(platform)/app/billetera/wallet-screen.tsx`.
- Decisiones: no se copian logos de marcas (TODO-VERIFICAR). Sin capitalización ni volumen en los datos: no se muestran. El mock no tiene cierre total, así que fuera del horario regular el chip dice "Mercado ampliado" y sigue el aviso de precio. No se dice "24/7". El multiplicador queda en "Sobre el token". La barra y `?operar=vender` no se tocaron.
- Pendiente: mirar `/app/accion/AAPLx` a 360 y en escritorio (chips, grilla, copiar, barra, `?operar=vender`). Mercado, cartera y billetera heredan el monograma.
- Próximo: M24.

### M22 — Detalle en celular: padding del CTA y deep-link de vender (2026-10-05, M22: detalle mobile padding CTA y deep-link vender)
- Hecho: la barra queda sobre las tabs, con safe-area, sin solaparse. El scroll reserva el alto medido de las tabs (ya incluye el safe-area) + el alto real del CTA + 16px. `--app-detail-cta` usa ese alto y se borra al salir. Botones de la barra: mínimo 44px, padding 16–20px, gap y texto entero a 360px. `?operar=vender|comprar` abre la hoja al cargar; atrás la cierra; cerrar quita el parámetro sin recarga. En la cartera, cada posición con saldo tiene Vender hacia `/app/accion/XXX?operar=vender`, fuera del enlace de la fila. Sin saldo, la hoja dice «No tienes XXX para vender». `npx tsc --noEmit` y `npm run lint` ok. Sin `next dev`.
- Archivos clave: `app/(platform)/app/accion/[ticker]/detail-screen.tsx`, `components/app-shell/{app-shell,bottom-tabs}.tsx`, `app/globals.css`, `app/(platform)/app/cartera/portfolio-screen.tsx`, `components/domain/{position-row,trade-sheet}.tsx`, `content/i18n/{es-CL,en}.ts`.
- Decisiones: no se suma el safe-area dos veces. El respiro móvil del shell pasa de 24px a 16px. Desde `lg` la card lateral no cambia. Abrir desde el botón hace `pushState`; cerrar un deep link hace `replaceState` (no `router.replace`, para no refetch).
- Pendiente: mirar `/app/accion/AAPLx` y `/app/cartera` a 360–430 (barra, scroll hasta el aviso, Vender, `?operar=vender` con y sin saldo, atrás y cerrar). Escritorio no se recorrió aquí.
- Próximo: M23.

### M21 — Copy del hero (2026-10-05, M21: hero copy tokenizacion y mercado ampliado)
- Hecho: H1 "Acciones de EE.UU. tokenizadas, en tu billetera"; subtítulo con fracciones desde $1.000, Solana, pesos y "casi a cualquier hora". Pill: token en billetera → `#como-funciona`. Tres chips bajo los CTAs. FeatureGrid #1 suma token y horario ampliado. OG alineado. `npx tsc --noEmit` y `npm run lint` ok. Sin `next dev`.
- Archivos clave: `components/landing/{hero,announcement-pill,feature-grid}.tsx`, `components/ui/icons.tsx`, `lib/seo/share-image.tsx`, `e2e/smoke.spec.ts`.
- Decisiones: 1 variante activa; 2 ALTERNATIVA en comentarios. No se dice 24/7 ni CMF ni accionista registrado. El chip del medio usa "wallet" como pide la tarea; el resto dice "billetera". i18n no se tocó: la landing no sale de ahí. Comisión 0% sigue en costos.
- Pendiente: mirar `/` a 360/768/1280 (H1, wrap de chips, pill). El smoke no se corrió aquí.
- Próximo: fase live, fuera de este paquete.

### T20 — Verificación final (2026-10-05, T20: verificacion final)
- Hecho: `npm run lint`, `npm run typecheck`, `npm run build`, `npm test` (12) y `npm run e2e` en verde. Vitest cubre format, scaled-ui (newMultiplier con timestamp pasado y futuro), fee (0 bps no arma instrucción), allowlist (mint falso rechazado) y zod (request inválido → VALIDATION). El smoke mock recorre landing, `/app` sin sesión → ingresar, login, onboarding, mercado, AAPL, compra, cartera, dirección inválida bloqueada e idioma en inglés.
- Archivos clave: `tests/unit/*`, `e2e/smoke.spec.ts`, `vitest.config.ts`, `playwright.config.ts`, `package.json`.
- Decisiones: devDependencies `vitest@3.2.4` y `@playwright/test` (las pide T20). Vitest 5 exige `@types/node` 22 y el repo está en 20. `npm run e2e` sirve el build con `next start` en 127.0.0.1:3456 y lo cierra; hace falta `npm run build` antes. `t18-check.ts` sigue en disco, ahora en `.gitignore`, sin borrarlo.
- Bugs: ninguno de producto. El primer e2e chocó con el announcer vacío de Next (`role="alert"`); el aviso de dirección sí estaba. Se afinó el selector.
- Deuda: Next 16 avisa de pasar `middleware.ts` a `proxy.ts`. Los dos archivos juntos rompen el build, así que se deja el nombre de §2.3. `bigint-buffer` sigue en JS porque npm bloqueó el install-script. Stubs live sin llamar. El smoke es 1280×800; 360/768 no se recorrió aquí.
- TODO-VERIFICAR: mints de `config/tickers.ts` contra xstocks.fi; mínimo CLP y métodos de Koywe/Onramper; dividendos y emisor en la FAQ; autocustodia y exportar la clave (Privy); patrocinio del fee-payer [POR DECIDIR]; firma del webhook de Onramper; logos y marcas (`docs/PENDIENTES-LEGALES.md`) [REVISIÓN ABOGADO]; el texto final del disclaimer.
- [REVISIÓN ABOGADO]: `content/legal/{terminos,privacidad,riesgos}.md`, FAQ de regulación, footer, banner de `/legal`, paso 3 del onboarding, baja de cuenta y disclaimer del shell.
- Próximo: fase live, fuera de este paquete.

### T19 — Pulido visual, accesibilidad y rendimiento (2026-10-05, T19: pulido)
- Hecho: checklist en landing y `/app`. Tabs con `animate-tab` y `--ease-spring` (el Sheet ya lo usaba), press `active:scale-[0.98]`, NumberFlow en el saldo del shell. Cierre de Sheet/Dialog a 44px. `aria-live` en el USDC de la billetera y en la cotización; el countdown no se anuncia. Contraste a 4,5:1. Copy es-CL sin "app", "slippage", "spread", "exchange", "SDK" ni "broker". Fuentes con `display: swap`. QR y `lightweight-charts` en import dinámico. Logo con `next/image`. Landing y `/bloqueado` en `force-static`. `overflow-x-clip` en el body. `npx tsc --noEmit` y `npm run lint` ok. Sin `next dev`.
- Archivos clave: `app/fonts.ts`, `app/globals.css`, `components/ui/{tabs,qr-code,qr-mark,overlay}.tsx`, `components/domain/{balance-header,ticker-logo,price-chart}.tsx`, `content/i18n/es-CL.ts`, landing y legales.
- Decisiones: gris `#6c6f75`, sube `#1c7c5b`, baja `#cc2c55`, aviso `#99651a`. El placeholder sigue en `fg-subtle`. La lista del mercado no anuncia cada precio (refresco de 15 s); sí el precio grande, los totales y la cotización. "Deslizamiento máx." y "Diferencia de precio". El dólar sigue el Intl es-CL (`US$1.234,56`, sin espacio). Sin archivos en `public/logos`: si el logo falla, quedan las iniciales.
- Pendiente: mirar 360/768/1280 (landing, mercado, detalle, compra, cartera, billetera, depositar, perfil, ingresar y onboarding). No se corrió `next build`, así que `force-static` no quedó confirmado ahí.
- Próximo: T20.

### T18 — Librería Solana y stubs live (2026-10-05, T18: solana backend stubs)
- Hecho: multiplicador Token-2022, comisión USDC, dirección, allowlist, conexión y sponsor. TODOs de Jupiter, cartera, Privy, Koywe y Onramper. Queries de Supabase escritas, sólo si `DATA_MODE=live`. `0001_init.sql` presente. `npx tsc --noEmit` y `npm run lint` ok. Sin `next dev`. Las funciones puras se probaron con un script local.
- Archivos clave: `lib/solana/{scaled-ui,fee,address,allowlist,connection,sponsor}.ts`, `lib/services/{prices,trade,portfolio}.live.ts`, `users.supabase.ts`, `auth.privy.ts`, `onramp.{koywe,onramper}.ts`.
- Decisiones: se instalaron `@solana/web3.js` 1.99 y `@solana/spl-token` 0.4.15 (stack §1; no estaban). El helper es `getScaledUiAmountConfig`. Sin literales `0n`: el target es ES2017. `connection.ts` no importa `serverEnv`, para que el cliente use sólo la URL pública. La baja live va a `audit_log`: `profiles` no tiene columna. Idioma y moneda siguen en `profiles`. USDC usa el programa clásico. Ningún componente cliente importa `serverEnv`, `sponsor` ni servicios (`onboarding/page.tsx` es de servidor). PostgREST, sin `@supabase/supabase-js`.
- Pendiente: borrar `t18-check.ts` (queda en el disco, fuera del commit). No se corrió `next build`. En live faltan las llamadas, `@privy-io/server-auth`, orgId de Koywe y el secret de webhook de Onramper. `npm` bloqueó el install-script de `bigint-buffer`; web3.js usó el fallback JS.
- Próximo: T19.

### T17 — Perfil y ajustes (2026-10-05, T17: perfil ajustes)
- Hecho: `/app/perfil` con avatar, correo, país, menú y versión. Cuenta (nombre con `PATCH /api/me`, correo de sólo lectura, país, ID con copiar, solicitud de baja). Seguridad (métodos, exportar clave sin mostrarla, sesiones y 2FA en Próximamente). Notificaciones e idioma/moneda con `setPrefs` optimista. Legal con versión, fecha y links. `npx tsc --noEmit` y `npm run lint` ok. Sin `next dev`.
- Archivos clave: `app/(platform)/app/perfil/**`, `lib/auth/export-wallet.ts`, `lib/hooks/use-update-prefs.ts`, `app/api/me/{consents,deletion}`, `lib/mocks/demo-state.ts`, `content/i18n/{es-CL,en}.ts`.
- Decisiones: subrutas de §2.2. `GET /api/me/consents` y `POST /api/me/deletion` no están en §2.4: la tabla y la baja los necesitan. La baja mock guarda la fecha y no mueve saldos ni borra la cuenta. La clave sale por adaptador: mock no tiene clave; live usa `useExportWallet` de Privy y esta app no la recibe. Privy 3.47 no lista sesiones y el alta de 2FA no está cableada: ambas dicen Próximamente. Idioma y moneda cambian al instante el `/app` que usa `useT`. Landing, `/ayuda`, ingresar y onboarding siguen en español. La versión sale de `package.json`.
- Pendiente: mirar `/app/perfil` y las cinco pantallas a 360 y 1280 (nombre, copiar ID, diálogo de baja, exportar clave, switches, idioma y tabla). En live, baja y consentimientos siguen en el stub de Supabase.
- Próximo: T18.

### T16 — Depositar pesos (2026-10-05, T16: deposito onramp)
- Hecho: `/app/billetera/depositar` con Con pesos y Con USDC. Monto CLP, chips, mínimo, estimado y costo desde `createOnrampSession`. Continuar con Koywe abre el diálogo mock (pago → procesando → USDC acreditado); Otros métodos usa Onramper. Al pagar, el webhook mock suma USDC, deja un Depósito en la actividad, refresca saldos y muestra toast. `npx tsc --noEmit` y `npm run lint` ok. Sin `next dev`.
- Archivos clave: `app/(platform)/app/billetera/depositar/**`, `lib/onramp/**`, `config/onramp.ts`, `lib/services/onramp.mock.ts`, `lib/mocks/demo-state.ts`, `lib/api/{client,contracts}.ts`, `content/i18n/{es-CL,en}.ts`.
- Decisiones: mínimo 10.000 CLP en config, [VERIFICAR] con el proveedor. El costo mock es $0: no se inventa la comisión. Khipu, EtPay y transferencia son info, [VERIFICAR en Koywe]. `lib/onramp` es la interfaz común: mock = diálogo; live = URL o SDK (el servicio live sigue en stub). El crédito entra por `POST /api/onramp/webhook`; repetir la misma sesión no suma. La actividad es `kind: deposit`.
- Pendiente: mirar `/app/billetera/depositar` a 360 y 1280 (chips, mínimo, widget, toast, actividad, saldo y la pestaña USDC). En live el SDK de Koywe no está conectado.
- Próximo: T17.

### T15 — Billetera (2026-10-05, T15: billetera)
- Hecho: `/app/billetera` con USDC grande, SOL de red (explicación y aviso si no alcanza rent + red), Depositar · Enviar · Recibir, activos, dirección con copiar y actividad de todas las clases agrupada por día en Santiago. `/recibir` con QR, copiar, compartir y los avisos de red y de tokens. `/enviar` bloquea una dirección que no es base58 de 32 bytes, avisa si es la propia, monto con máx., revisión con red y rent mock, y confirma con `buildSend`, firma y los estados de T13. El envío mock queda en la actividad. `npx tsc --noEmit` y `npm run lint` ok. Sin `next dev`.
- Archivos clave: `app/(platform)/app/billetera/**`, `lib/solana/address.ts`, `lib/wallet/{send-cost,days,display,explorer}.ts`, `lib/mocks/demo-state.ts`, `lib/services/{portfolio.mock,trade.mock}.ts`, `content/i18n/{es-CL,en}.ts`.
- Decisiones: SOL no se envía (`MINT_NOT_ALLOWED`). La rent mock (0,0016 SOL) aparece si el destino no es la propia dirección; no se pasa a pesos. Enviar a la propia dirección no cambia el saldo. El débito y la actividad `kind: send` ocurren en `POST /api/trade/submit` al firmar, porque §2.4 no tiene submit de envío. La orden interna sólo sirve para el polling. Depositar sigue en T16. `address.ts` queda para T18.
- Pendiente: mirar `/app/billetera`, `/recibir` y `/enviar` a 360 y 1280 (dirección inválida, propia, máx., confirmar y actividad). Solscan no tiene las firmas `mock-sig-…`. Con 0,05 SOL de la demo el aviso de SOL bajo no se ve.
- Próximo: T16.

### T14 — Cartera (2026-10-05, T14: cartera)
- Hecho: `/app/cartera` con valor total (CLP/USD), P&L en monto y % ("—" si es null), rangos y gráfico de valor, AllocationBar, PositionRow, USDC con Depositar, historial buy/sell y vacío. La demo cuadra: 228,40 + 65,58 + 199,12 + 250 USDC = 743,10 USD. `npx tsc --noEmit` y `npm run lint` ok. Sin `next dev`.
- Archivos clave: `app/(platform)/app/cartera/*`, `components/domain/{allocation-bar,position-row,activity-item}.tsx`, `lib/portfolio/series.ts`, `lib/hooks/use-hide-balance.ts`, `lib/format.ts`, `content/i18n/{es-CL,en}.ts`.
- Decisiones: `Position.shares` ya incluye el multiplicador; no se vuelve a aplicar. El tooltip dice "incluye ajustes del emisor". El gráfico es historial de precios × las acciones de hoy + USDC; el último punto es `totalUsd`. Sin acciones no hay gráfico: quedan el vacío, el USDC y el historial. Depositar apunta a `/app/billetera/depositar` (T16). El ojo del shell también tapa montos y gráfico.
- Pendiente: mirar `/app/cartera` a 360 y 1280 (rangos, hover, asignación, filas, historial, ojo y vacío). Solscan no tiene las firmas `mock-sig-…`.
- Próximo: T15.

### T13 — Compra/venta (2026-10-05, T13: compra venta)
- Hecho: TradeSheet con `?operar=comprar|vender`. Monto CLP/USDC o acciones/USDC, chips, saldo y mínimo US$ 1. Cotización a los 400 ms, countdown y nueva cotización al vencer. Revisar muestra el resumen, CostBreakdown (comisión 0%, red, rent si abre cuenta, impacto, slippage), el aviso si el mercado está cerrado y el link a riesgos. Confirmar hace build, firma (mock 800 ms; Privy `signTransaction`) , submit y polling. Estados: Firmando, Enviando, Listo (cartera y Solscan) y Error con reintento. Al confirmar se invalidan cartera, saldos y actividad. `npx tsc --noEmit` y `npm run lint` ok. Sin `next dev`.
- Archivos clave: `components/domain/{trade-sheet,cost-breakdown}.tsx`, `components/ui/amount-input.tsx`, `lib/trade/amount.ts`, `lib/auth/{sign-transaction.ts,privy-signer.tsx}`, `lib/api/client.ts`, `config/trade.ts`, detalle de la acción, `content/i18n/{es-CL,en}.ts`.
- Decisiones: el archivo va en kebab-case, como el resto de `components/domain`. El mínimo vive en `config/trade.ts`, no en el env. USDC se muestra como US$. "Depositar" apunta a `/app/billetera/depositar` (la página es T16). Si faltan acciones al vender, no se ofrece depositar. Red y rent van en SOL, sin pasarlos a dólares. La firma mock devuelve la misma transacción. `?mockError=CODE` se reenvía a quote, build, submit y status.
- Pendiente: mirar compra y venta de AAPLx a 360 y 1280 (monto, chips, cotización, revisar, confirmar, listo). Probar `?operar=comprar&mockError=PRICE_DEVIATION` y también `QUOTE_EXPIRED`, `INSUFFICIENT_FUNDS` y `UPSTREAM`. Solscan no tiene las firmas `mock-sig-…`. En live, firmar depende de la billetera Privy.
- Próximo: T14.

### T13 — Peer Solana de Privy (2026-10-05, T13: fix dependencias Privy Solana)
- Hecho: el 500 de `/`, `/ayuda` y `/app/accion/AAPLx` era `Can't resolve '@solana-program/memo'` desde `@privy-io/react-auth/solana`. Se instaló `@solana-program/memo@0.10.0`. system 0.10.0, token 0.9.0, `@solana/kit` 5.5.1 y `@solana/wallet-standard-features` 1.5.0 ya resolvían. `npx tsc --noEmit` y `npm run lint` ok. Sin `next dev`.
- Decisiones: memo 0.10.0 exacto, no 0.14.1. El peer de Privy es `>=0.8.0`; su devDependency `^0.14.1` pide kit `^8` y el subpath `@solana/kit/program-client-core`, que kit 5.5.1 (lo trae `x402`) no tiene. No se tocó el import: en mock, `AuthProvider` carga Privy con `import()` sólo si `shouldUsePrivy()`.
- Pendiente: el operador debe recargar el servidor y confirmar que esas tres rutas ya no dan 500. La firma live no se probó.

### T12 — Detalle de acción (2026-10-05, T12: detalle accion)
- Hecho: `/app/accion/[ticker]` con header, precio, gráfico por rango, posición, datos, empresa y token, y CTA. Fuera del catálogo operable → 404 de la app. `npx tsc --noEmit` ok. ESLint de los archivos tocados ok. Sin `next dev`.
- Archivos clave: `app/(platform)/app/accion/[ticker]/*`, `components/domain/price-chart.tsx`, `content/tickers/*`, `app/not-found.tsx`, `content/i18n/{es-CL,en}.ts`.
- Decisiones: el server usa `tradableTicker` (HOODx y MSTRx también 404). Rangos `1S 1M 3M 1A Todo` = `1W 1M 3M 1Y ALL`; parte en 1M. El área es verde, roja o gris según el signo del rango. El crosshair cambia el precio grande. `?operar=comprar|vender` abre un Sheet vacío (el TradeSheet es T13). Vender queda deshabilitado sin acciones. Textos de empresa sin cifras. El mint abre Solscan. Se dice que el emisor puede congelar el token, con link a `/legal/riesgos`. En móvil, `--app-detail-cta` deja el aviso y el toast sobre la barra. `lightweight-charts` se carga al dibujar y conserva el logo de atribución.
- Pendiente: mirar `/app/accion/AAPLx` a 360 y 1280 (rangos, crosshair, favorito, compartir, comprar y vender). Con sesión, `/app/accion/FAKE` y `/app/accion/HOODx` deben ser la 404; sin cookie el middleware manda a ingresar. La posición demo está en AAPL, NVDA y TSLA.
- Próximo: T13.

### T11 — Mercado (2026-10-05, T11: mercado)
- Hecho: `/app` lista las acciones habilitadas. Buscador (símbolo, nombre, subyacente; sin acentos; debounce 150 ms; `/` en ≥1024px). Chips Todas · Tecnología · ETFs · Fintech · Consumo · Favoritas. Orden Popular (config) · Mayor alza · Mayor baja · A–Z. "Más movidas hoy" = top 3 por |variación|. TickerRow con sparkline 1W, precio en la moneda de preferencia (CLP = USD×FX) y estrella. MarketStatusPill desde `/api/market/status`. Skeletons, vacío y error con reintento. `npx tsc --noEmit` y `npm run lint` ok. El filtro "app" → solo AAPLx se probó en Node. Sin `next dev`.
- Archivos clave: `app/(platform)/app/{page,market-screen}.tsx`, `components/domain/{ticker-card,ticker-row,market-status-pill,favorite-button}.tsx`, `lib/market/browse.ts`, `lib/hooks/{queries,use-favorites}.ts`, `lib/api/client.ts`, `content/i18n/{es-CL,en}.ts`.
- Decisiones: query `q`, `filtro` (`tech|etf|fintech|consumer|favorites`) y `orden` (`gain|loss|az`). Popular y Todas no se escriben. Favoritos en `localStorage` `a24_favorites` (`{v:1,symbols}`). HOODx y MSTRx no se listan. "Más movidas" usa el filtro activo, no la búsqueda, y se oculta mientras hay texto: "app" deja solo Apple. No es una recomendación. La estrella va fuera del link. Historial 1W por símbolo, sparkline de 32 puntos.
- Pendiente: mirar `/app` a 360 y 1280 (buscar "app", chips, orden, estrella, pill, vacío y error). `/app/accion/[symbol]` sigue sin página (T12).
- Próximo: T12.

### T10 — Shell de la plataforma (2026-10-05, T10: shell plataforma)
- Hecho: AppShell en `/app`. ≥lg sidebar 240px; <lg TopBar y BottomTabs de 64px con safe-area. Item activo resaltado. Mercado, Cartera, Billetera y Perfil son placeholders con PageHeader y EmptyState. `npx tsc --noEmit` y `npm run lint` ok. Sin `next dev`.
- Archivos clave: `app/(platform)/app/{layout,page,cartera,billetera,perfil}`, `components/app-shell/*`, `components/domain/balance-header.tsx`, `components/ui/{page-header,loading-state,error-state}.tsx`, `content/i18n/{es-CL,en}.ts`, `lib/hooks/{use-t,queries}.ts`.
- Decisiones: ingresar y onboarding siguen en su carpeta; AppShell no les monta el chrome (un layout en `app/(platform)/app` envuelve cualquier route group hijo). Saldo = `totalUsd` de la cartera, en la moneda de `usePrefs`; CLP usa `GET /api/fx/usdclp` (`getFx`/`useFx`, 1 h en el cliente). Ocultar saldo en `localStorage` (`a24_hide_balance:<userId>`). Sin preferencias: es-CL y CLP. Los montos siguen en formato es-CL. Disclaimer de §4, [REVISIÓN ABOGADO]. El toast usa `--app-chrome-bottom` para no quedar bajo las tabs.
- Pendiente: mirar 360 y 1280 (sidebar, tabs, saldo, ojo, disclaimer y las 4 secciones). `/app/billetera/depositar` sigue sin página (T16).
- Próximo: T11.

### T09 — Onboarding (2026-10-05, T09: onboarding)
- Hecho: `/app/onboarding` es un wizard de 5 pasos, mobile-first, sin AppShell. País (si `US`, no disponible), declaración US person, 3 consentimientos versionados, billetera y “Todo listo”. `npx tsc --noEmit` y `npm run lint` ok. Sin `next dev`.
- Archivos clave: `app/(platform)/app/onboarding/*` (wizard, schema zod, borrador y países).
- Decisiones: versiones desde `serverEnv` (`TERMS_VERSION`, `PRIVACY_VERSION`, `RISKS_VERSION`) como props; el cliente no importa `lib/env`. Borrador en `localStorage` (`a24_onb_draft`, por usuario) y `clampDraft` impide saltar pasos. Paso 3 hace `POST /api/me/consents` por documento; el cierre repite el POST, luego `PATCH /api/me` (`country`, `isUsPerson: false`, `onboardingCompleted`) y cookie `a24_onb=1`. La dirección sale de la sesión (mock o Privy); no se inventa una. Sin cookie, `finished` no vale: logout no deja entrar a `/app`.
- Pendiente: mirar el flujo en el navegador (360 y desktop): país, `US`, declaración, documentos, billetera, “Explorar acciones” y “Depositar pesos”. `/app` y `/app/billetera/depositar` siguen sin página (T10 y T16). El layout de T10 no debe envolver `/app/onboarding` con AppShell.
- Próximo: T10.

### T08 — Auth y middleware (2026-10-05, T08: auth y middleware)
- Hecho: `useSession()` con mock y Privy. `/app/ingresar` (email y Google). `middleware.ts` geobloquea y guarda `/app/*`. Logout limpia `a24_mock_session` y `a24_onb` y vuelve a `/`. `npx tsc --noEmit` y `npm run lint` ok. El gate se probó aparte, sin `next dev`.
- Archivos clave: `lib/auth/*`, `middleware.ts`, `app/(platform)/app/ingresar/*`, `app/(platform)/app/onboarding/*`, `app/providers.tsx`, `package.json`.
- Decisiones: Privy (`@privy-io/react-auth` 3.47, del stack) sólo si `NEXT_PUBLIC_DATA_MODE=live` y hay `NEXT_PUBLIC_PRIVY_APP_ID`. Si no, mock y el SDK no se monta. Props leídas en los tipos 3.47: `loginMethods: ["email","google"]`, `embeddedWallets.solana.createOnLogin: "users-without-wallets"`. Onboarding = cookie `a24_onb=1` (también en live, hasta poder leer el perfil). `?country=` sólo fuera de production. `next` sólo bajo `/app`. Next 16 avisa que `middleware.ts` pasó a `proxy.ts`; se deja el nombre de §2.3 (los dos archivos juntos rompen el build). `/app/onboarding` es un alto con cerrar sesión: los pasos son T09. `/api/me` de la demo sigue con `onboardingCompleted: true`; el guard usa la cookie.
- Pendiente: mirar en el navegador `/app` → ingresar, login demo → onboarding, logout → `/`, `?country=US` → `/bloqueado`. Con `a24_onb=1`, `/app` aún no tiene página (T10). `@privy-io/server-auth` sigue en §10. No se instalaron los peers opcionales `@solana/kit`.
- Próximo: T09.

### T07 — API, cliente y hooks (2026-10-05, T07: api y cliente)
- Hecho: un `route.ts` por endpoint de §2.4 (`runtime` node). `npx tsc --noEmit` y `npm run lint` ok. Smoke sin `next dev`: `/api/tickers` (12, cache 3600), `/api/prices?symbols=AAPLx,NVDAx` (no-store), historial `1M` (120 puntos). HOODx → `MINT_NOT_ALLOWED`. Cartera sin cookie → 401; con `a24_mock_session` → demo. Geo `US` bloqueado. Cotización, `/api/me` y el webhook también.
- Archivos clave: `app/api/**/route.ts`, `lib/api/{handler,client}.ts`, `lib/hooks/queries.ts`, `app/providers.tsx`, `app/layout.tsx`.
- Decisiones: el catálogo sale del allowlist (§5 no tiene servicio de tickers). Precios e historial `no-store`; FX y mercado también, porque dependen del reloj. Sesión en cartera, saldos, actividad y en lo que pide `userId` (submit, onramp, me, consentimientos, preferencias). `?mockError=` envuelve la llamada al servicio, no el login. Toaster = `ToastProvider` ya existente. `usePrices` refresca cada 15 s. Sin header de país se asume CL. `.gitignore` usa `/build/` (sólo la raíz): `build/` ocultaba `app/api/**/build`.
- Pendiente: mirar esas rutas en el navegador (no se levantó servidor). Enviar SOL queda `MINT_NOT_ALLOWED` (no está en el allowlist). El cliente no envuelve fx, mercado, estado de orden ni geo.
- Próximo: T08.

### T06 — Núcleo de dominio (2026-10-05, T06: nucleo dominio)
- Hecho: tipos §4, contratos zod de §2.4, `ApiResult` y mapa HTTP, `serverEnv`/`publicEnv`, fees, `formatRelative`, mocks deterministas, `Services` mock y stubs live, allowlist. `npm run typecheck` y `npm run lint` ok. Smoke sin `next dev`: compra mock, errores, FX 950, horario NY.
- Archivos clave: `lib/types/index.ts`, `lib/api/{contracts,result}.ts`, `lib/env.ts`, `config/fees.ts`, `lib/format.ts`, `lib/mocks/*`, `lib/services/*`, `lib/solana/allowlist.ts`.
- Decisiones: se agregó `server-only` (marcador de Next; el scaffold no lo traía). `*Pct` es ratio, como `formatPercent`. Multiplicador mock 1. FX ~950 y SOL a 150 USD son relleno con `source` mock. Demo: 1 AAPLx, 0,5 NVDAx, 0,8 TSLAx y 250 USDC. `sendBuild` vive en portfolio (§2.4 no está en el bloque §5). `withMockError` simula `?mockError=`. Cotización 60 s. Si el saldo cambia al confirmar, la orden queda `failed`.
- Pendiente: mirar la app con `next dev` (no se levantó servidor). El horario mock no incluye feriados de EE.UU. HOODx y MSTRx siguen apagados. Los stubs live no llaman a Jupiter, Koywe ni Supabase.
- Próximo: T07.

### T05 — Landing C (2026-10-05, T05: landing legal y SEO)
- Hecho: FAQ (6 en `/`, 8 en `/ayuda`), FinalCTA, SiteFooter, `/legal/[doc]` desde markdown, `/bloqueado`, metadata, OG, robots, sitemap e iconos. `npx tsc --noEmit`, `npm run lint` y `npm run build` ok (rutas estáticas). Sin `next dev`.
- Archivos clave: `components/landing/{faq,final-cta,site-footer,legal-document}.tsx`, `lib/content/{faq,legal}.ts`, `content/legal/*.md`, `app/{layout,robots,sitemap,icon,apple-icon,opengraph-image,twitter-image}.tsx`, `app/bloqueado/page.tsx`, `app/(marketing)/{layout,page,ayuda,legal}`.
- Decisiones: sin dependencia nueva; el servidor parsea el md y reemplaza `{{brand}}` por `site.name`. Banner en la página. Comisión 0% como T04; dividendo y emisor [VERIFICAR]; no se afirma autorización de la CMF. Retiro a banco sin plazo prometido. `dynamicParams = false`. robots niega `/app`, `/api`, `/dev`, `/bloqueado`. `favicon.ico` reescrito (punto naranja), más `icon.tsx`.
- Pendiente: mirar `/`, `/ayuda`, `/legal/*` y `/bloqueado` a 360/768/1280. Correo de soporte vacío.
- T05b (2026-10-05, T05b: copy propiedad del token): el token es del usuario y está en su billetera. FAQ y `/ayuda` aclaran que no es accionista registrado, que no hay voto y que el token sigue el precio. Misma idea en el paso 3, la grilla, seguridad, el footer y, en lo mínimo, riesgos y términos.
- Próximo: T06.

### T04 — Landing B (2026-10-05, T04: landing secciones)
- Hecho: HowItWorks, ProductMock, FeatureGrid, CostsSection, SecuritySection y `useReveal`. `npx tsc --noEmit` y `npm run lint` ok. Sin servidor.
- Archivos clave: `components/landing/{how-it-works,product-mock,feature-grid,costs-section,security-section,reveal,section}.tsx`, `lib/hooks/{use-reveal,reveal-motion}.ts`, `app/(marketing)/page.tsx`, `app/globals.css`.
- Decisiones: reveal visible en SSR/sin JS; con motion, lo que está fuera de vista entra al hacer scroll (600ms, stagger 80ms, 16px). Lo ya visible no se oculta. Reduced-motion queda estático. Comprar del mock no es un control. Precios ilustrativos. No se dice «emisor regulado» ni que la clave ya se exporta (TODO-VERIFICAR, Privy). «Sin papeleo» = sin cuenta en un broker de EE.UU.; sí hay términos. Red: orden de centavos de dólar, monto al confirmar. Rent ≈0,0016 SOL no se pasa a USD (patrocinio [POR DECIDIR]). Grilla 2×2 desde `sm`.
- Pendiente: mirar `/` a 360/768/1280 (reveal, tabs, tabla). `/legal/comisiones` y `/legal/riesgos` llegan en T05. Cerrar redacción de emisor y autocustodia.
- Próximo: T05.

### T03 — Landing A (2026-10-05, T03: landing hero)
- Hecho: header fijo (blur al scroll, menú en Sheet), hero centrado, card ivory con TickerRows y cinta infinita. `npx tsc --noEmit` y `npm run lint` ok. Sin servidor.
- Archivos clave: `app/(marketing)/layout.tsx`, `app/(marketing)/page.tsx`, `components/landing/{site-header,announcement-pill,hero,ticker-marquee}.tsx`, `lib/mocks/landing.ts`, `app/globals.css`.
- Decisiones: marca desde `site.name` con punto naranja. Copy elegido; alternativas en comentarios de `hero.tsx` y `announcement-pill.tsx`. Precios sólo ilustrativos, sin logos de emisor (iniciales). Cinta `aria-hidden` más lista para lector de pantalla; pausa en hover; estática si `prefers-reduced-motion`. Links a `/#como-funciona`, `/#costos`, `/#seguridad` y `/ayuda`.
- Pendiente: mirar `/` a 360/768/1280 (blur, marquee, sin scroll horizontal). `/app`, `/ayuda` y las anclas todavía no tienen página.
- Próximo: T04.

### T02 — Primitivos UI (2026-10-04, T02: primitivos UI)
- Hecho: primitivos en `components/ui/`, presentacionales en `components/domain/` (TickerLogo, PriceText, ChangeBadge, Sparkline, TickerRow), `lib/format.ts` con `Intl` es-CL y catálogo `/dev/ui` (`notFound()` si `NODE_ENV==="production"`). `npx tsc --noEmit` y `npm run lint` ok.
- Archivos clave: `components/ui/*`, `components/domain/*`, `lib/format.ts`, `app/dev/ui/page.tsx`, `app/dev/ui/catalog.tsx`, `app/globals.css`.
- Decisiones: sin Radix (no está en el stack; Dialog/Sheet/Tabs/Select/Tooltip/Switch/Accordion con roles, foco y Esc). Sheet lateral desde `md`. IconButton mediano 44px en móvil y 48px desde `md`. `formatPercent` recibe un ratio (0,012 = 1,2%). PriceText no anuncia cambios salvo `live`. Chips de monto en USD cuando la moneda es USD.
- Pendiente: mirar `/dev/ui` a 360px con `npm run dev` (no se levantó servidor).
- Próximo: T03.

### T01 — Scaffold (2026-10-04, T01: scaffold)
- Hecho: Next.js 16.3.8 (App Router, TS strict, Tailwind v4, ESLint, sin `src/`, alias `@/*`). Tokens, Geist, `lang="es-CL"`, estructura §3, copias de tickers / `.env.example` / SQL, página `/` temporal. `npm run typecheck`, `npm run lint` y `npm run build` ok (`/` estática).
- Archivos clave: `package.json`, `app/layout.tsx`, `app/globals.css`, `app/(marketing)/page.tsx`, `config/site.ts`, `config/tickers.ts`, `lib/cn.ts`, `lib/types/index.ts`, `.env.example`, `supabase/migrations/0001_init.sql`.
- Decisiones: paquete npm `maverlang-stocks` (npm rechaza mayúsculas en la carpeta). Marca desde `NEXT_PUBLIC_BRAND_NAME` (fallback "Maverlang Stocks"). Stub `Ticker` para que el allowlist compile. `docs/` fuera de tsc y ESLint. zod 4, la última al instalar.
- Pendiente: mirar `/` con `npm run dev` (no se levantó servidor). Sustituir el stub de `Ticker` en la tarea de tipos.
- Próximo: T02.

## Decisiones globales
- Marca: Maverlang (nombre comercial "Maverlang Stocks") (configurable por env).
- Comisión propia: 0 bps al lanzamiento.
- Paquete npm: `maverlang-stocks`.

## Pendientes / bloqueos
- Ubicación definitiva del repo (OneDrive vs C:\dev).
- Textos legales: [REVISIÓN ABOGADO]. Mints contra xstocks.fi, mínimo y métodos de on-ramp, dividendos, emisor, autocustodia Privy, patrocinio [POR DECIDIR] y firma del webhook de Onramper: [VERIFICAR] antes de producción.
- Logos y marcas del catálogo: sólo identifican el activo. Archivos de xStocks/Backed en `public/logos`. Ver `docs/PENDIENTES-LEGALES.md`. [REVISIÓN ABOGADO] antes de producción.
- El smoke de T20 cubre el flujo mock a 1280×800. Sigue sin mirarse 360/768 (landing, mercado, detalle, compra, cartera, billetera, depositar, perfil) ni `?country=US`, `?mockError=`, FAKE/HOODx en 404 y el ojo del saldo.
- Borrar `t18-check.ts` (sigue en el disco; `.gitignore` evita commitearlo).
- Fase live: `.env.example` recomienda `PRICES_MODE=live`. Si la variable no existe, el código sigue en mock (tests y CI). Con live, el spot y el dólar son reales; el historial sigue ilustrativo y anclado a ese spot. Trade on-chain, Koywe y Onramper siguen en stub. Auth de Supabase: registro (M30), ingreso (M31) y verificación (M32, perfil en SKIP). Falta aplicar `0002` y correr `npm run e2e:auth`. La cartera mock no está asociada al usuario. Privy sigue en el código. La landing sigue con precios ilustrativos.
