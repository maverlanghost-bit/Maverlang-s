# PROGRESO — Maverlang

## Estado
T03 hecha. Modo de datos: mock. Siguiente: T04.

## Tareas hechas

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
- Confirmar en el navegador el hero a 360/768/1280 (blur del header y marquee) y que `/dev/ui` se ve bien a 360px.
