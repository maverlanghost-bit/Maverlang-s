# Tareas — orden de construcción (1 tarea ≈ 1 sesión de Grok Build)

Orden: **Landing → núcleo/datos → shell de plataforma → módulos → pulido → verificación (al final)**.
Cada tarea tiene su prompt en `PROMPTS/NN-*.md`. El builder actualiza `PROGRESO.md` y hace commit al terminar cada una.
Durante la construcción: sólo verificar que `npm run dev` levanta y la ruta se ve; **tests completos en T20**.

| # | Tarea | Depende de | Listo cuando… |
|---|---|---|---|
| 01 | Scaffold: Next.js+TS+Tailwind v4, fuentes Geist, tokens, docs/, AGENTS.md, PROGRESO.md, .env.example | – | `npm run dev` muestra página en blanco con tipografía/colores del DS; estructura §3 creada (carpetas vacías con `.gitkeep`) |
| 02 | Primitivos UI + presentacionales de dominio (PriceText, ChangeBadge, Sparkline, TickerLogo, TickerRow sólo-props) + página `/dev/ui` (catálogo) | 01 | `/dev/ui` muestra todos los componentes y variantes |
| 03 | Landing A: SiteHeader, AnnouncementPill, Hero, TickerMarquee (datos estáticos de `lib/mocks`) | 02 | Hero responsive 360px→1440px, header con blur al hacer scroll |
| 04 | Landing B: HowItWorks (3 pasos), ProductMock, FeatureGrid, CostsSection, SecuritySection, reveal on scroll | 03 | Secciones completas y fieles al DS; reduced-motion respetado |
| 05 | Landing C: FAQ, FinalCTA, SiteFooter legal, `/ayuda`, `/legal/[doc]` (md con versión), `/bloqueado`, metadata SEO/OG, favicon | 04 | Todas las rutas de marketing navegables; sin textos inventados (cifras sólo verificables) |
| 06 | Núcleo de dominio: `lib/types`, `lib/api/contracts.ts` (zod), `lib/api/result.ts`, `lib/env.ts`, `lib/format.ts`, `config/*`, `lib/mocks/*`, `lib/services/*` (mock completos + live stubs) | 01 | `tsc --noEmit` sin errores en estos archivos |
| 07 | API Route Handlers (§2.4) sobre servicios + `lib/api/client.ts` + hooks TanStack Query + Providers | 06 | Cada endpoint responde JSON mock válido (probar 2–3 con el navegador) |
| 08 | Auth + middleware: `auth.mock` / `auth.privy` (adaptador), `/app/ingresar`, guardas `/app/*`, geobloqueo | 07 | Sin sesión → `/app/ingresar`; login mock crea sesión; `?country=US` (mock) → `/bloqueado` |
| 09 | Onboarding `/app/onboarding` (5 pasos, consentimientos versionados → `POST /api/me/consents`) | 08 | Completar onboarding marca `onboardingCompleted` y lleva a `/app` |
| 10 | Shell de plataforma: AppShell (sidebar ≥lg / bottom tabs <lg), TopBar con saldo, i18n es-CL/en, estados Empty/Loading/Error, disclaimer persistente | 08 | Navegación entre las 4 secciones (páginas placeholder) en móvil y desktop |
| 11 | Mercado `/app`: buscador, filtros, orden, lista, "Más movidas hoy", estado de mercado, favoritas (localStorage) | 10 | Buscar "app" filtra a Apple; filtros y orden funcionan; skeletons al cargar |
| 12 | Detalle `/app/accion/[ticker]`: precio, gráfico con rangos, tu posición, stats, sobre empresa/token, CTA fijo | 11 | Ticker inválido → 404 propio; rangos cambian el gráfico |
| 13 | Compra/Venta: TradeSheet (monto CLP/USDC/acciones, cotización, CostBreakdown, confirmar, estados firmando→enviado→confirmado/error, guardia de precio) | 12 | Flujo mock completo compra y venta; errores simulados se muestran bien |
| 14 | Cartera `/app/cartera`: total, P&L, asignación, posiciones (con multiplicador), historial de órdenes | 13 | Cifras cuadran con mocks; vacío sin posiciones |
| 15 | Billetera A: `/app/billetera` (saldos, direcciones, actividad), `/recibir` (QR), `/enviar` (validación + confirmación) | 10 | Dirección inválida bloqueada; envío mock completo |
| 16 | Billetera B: `/app/billetera/depositar` (on-ramp CLP vía adaptador Koywe/Onramper mock + depósito USDC externo) | 15 | Flujo mock: monto → estimado → "widget" simulado → depósito aparece en actividad |
| 17 | Perfil/Ajustes: `/app/perfil` + cuenta, seguridad, notificaciones, idioma/moneda, legal | 10 | Preferencias persisten (mock) y el idioma cambia la UI |
| 18 | Solana lib + stubs live: `scaled-ui.ts`, `fee.ts`, `allowlist.ts`, `address.ts`, `sponsor.ts` stub; `supabase/migrations/0001_init.sql`; TODOs exactos en `*.live.ts` | 06 | Funciones puras compilan; ningún import de servidor en cliente |
| 19 | Pulido: motion, accesibilidad, responsive 360/768/1280, copy es-CL, rendimiento (imágenes, fuentes, LCP) | 05, 17 | Checklist de DESIGN-SYSTEM §Checklist sin pendientes |
| 20 | **Verificación final**: lint, typecheck, build, tests unitarios (format, scaled-ui, fee, allowlist, contratos), e2e smoke (Playwright) de rutas clave | 19 | `npm run lint && npm run typecheck && npm run build && npm test` en verde; reporte de bugs en PROGRESO.md |

Paralelizable (si hubiera 2 sesiones): T06–T07 pueden ir en paralelo con T03–T05.
Fuera de alcance de este paquete (fase siguiente): implementar `*.live.ts`, Privy real, Koywe real, Supabase real, patrocinio de gas, revisión legal.
