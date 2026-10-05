# PROGRESO — Maverlang

## Estado
T16 hecha. Modo de datos: mock. Siguiente: T17.

## Tareas hechas

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
- Textos legales: [REVISIÓN ABOGADO].
- Verificar mints contra xstocks.fi antes de producción.
- Confirmar en el navegador el hero (360/768/1280), T04 (reveal, tabs, tabla), T05 (FAQ, CTA, footer, legales, bloqueado), `/dev/ui` a 360px, las rutas `/api/tickers`, `/api/prices` e historial, T08 (`/app` sin sesión, login demo, `?country=US`), T09 (wizard completo, sin saltar pasos), T10 (4 secciones a 360 y 1280, saldo y ojo), T11 (mercado a 360 y 1280), T12 (detalle a 360 y 1280; con sesión, FAKE y HOODx en 404), T13 (compra y venta a 360 y 1280; `?mockError=`), T14 (cartera a 360 y 1280; rangos, hover, asignación, ojo y vacío), T15 (billetera, recibir y enviar a 360 y 1280; dirección inválida, propia, máx. y actividad) y T16 (depositar a 360 y 1280; chips, mínimo, widget, actividad y saldo).
