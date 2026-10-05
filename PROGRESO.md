# PROGRESO — Maverlang

## Estado
T09 hecha. Modo de datos: mock. Siguiente: T10.

## Tareas hechas

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
- Confirmar en el navegador el hero (360/768/1280), T04 (reveal, tabs, tabla), T05 (FAQ, CTA, footer, legales, bloqueado), `/dev/ui` a 360px, las rutas `/api/tickers`, `/api/prices` e historial, T08 (`/app` sin sesión, login demo, `?country=US`) y T09 (wizard completo, sin saltar pasos).
