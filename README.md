# Maverlang Stocks

Plataforma para operar **acciones de EE.UU. tokenizadas en Solana** (xStocks de
Backed y Ondo). El usuario entra con su propia billetera (Privy, sin custodia),
practica en una **demo con US$10.000 ficticios** y, cuando el modo real está
activo, compra y vende tokens reales a través de Jupiter.

> La demo es simulacro: precios reales, dinero ficticio. El modo real requiere
> `REAL_TRADING_READY=true` y las keys de producción (ver `docs/ENTORNOS.md`).

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript** estricto
- **Tailwind CSS v4** + design system propio (`docs/DESIGN-SYSTEM.md`)
- **Supabase** (auth, base de datos, RLS) — servicio live y demo persisten ahí
- **Solana** (`@solana/web3.js`, SPL Token / Token-2022) — tokens y transferencias
- **Jupiter Swap API v2** (camino Meta-Aggregator `/order` + `/execute`) — swaps reales
- **Privy** — billetera embebida y firma de transacciones
- **Sentry** — observabilidad de errores (cliente y servidor)
- **TanStack Query** — datos del servidor; **Upstash** — rate limiting
- **Vitest** + **Playwright** — tests unitarios y e2e

## Arrancar en local

```bash
npm install
cp .env.example .env.local   # y completá las variables (ver docs/ENTORNOS.md)
npm run dev                  # http://localhost:3000
```

Sin variables reales la app corre en modo **demo** (mock): podés registrar,
operar la demo y ver el mercado. Para el modo real hacen falta las keys de
Jupiter, Helius (RPC) y Supabase.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | servidor de desarrollo |
| `npm run build` | build de producción |
| `npm run typecheck` | TypeScript estricto (`tsc --noEmit`) |
| `npm run lint` | ESLint |
| `npm test` | tests unitarios (Vitest) |
| `npm run e2e` | tests end-to-end (Playwright) |
| `npm run check:env` | valida variables de entorno por modo |
| `npm run scan:secrets` | busca secretos en el árbol y el historial |
| `npm run audit:rls` | audita las políticas RLS de Supabase |
| `npm run audit:deps` | auditoría de dependencias |

## Estructura

```
app/
  (marketing)/     portada, cómo funciona, costos, seguridad, ayuda, legal
  (platform)/app/  la app: mercado, ficha, cartera, billetera, perfil, ajustes
  api/             rutas: trade, wallet, market, me, onramp, email, cron
lib/
  services/        lógica de negocio (demo.supabase, *.live, *.mock)
  solana/          conexión, fees, direcciones, scaled-ui, allowlist
  market/          Jupiter (order/client/tx), precios, series
  api/             contratos (zod), handler, rate limit
  auth/            sesión, Privy, gate
components/        UI (domain = negocio, ui = primitivos, app-shell = navegación)
supabase/
  migrations/      migraciones numeradas (aplicar en orden en Supabase)
config/            tickers, fees, trade, site
docs/              arquitectura, seguridad, entornos, design system, tareas
```

## Modos de datos

- `DATA_MODE=mock` (default): demo sin tocar red ni base. Para desarrollar.
- `DATA_MODE=live`: servicios reales (Supabase + Jupiter). El modo **real** de
  trading se controla aparte con `REAL_TRADING_READY`.

## Seguridad

- RLS en todas las tablas de usuario; el cliente admin (secret key) sólo se usa
  en la capa `lib/services/*.supabase.ts` (lista blanca verificada por test).
- CSRF (`assertSameOrigin`), rate limiting (Upstash), validación de entradas
  (zod) en toda ruta que cambia estado.
- CSP con nonce, headers de seguridad, escáner de secretos en CI.

Ver `docs/SEGURIDAD.md` y `docs/ENTORNOS.md`.

## CI

GitHub Actions (`.github/workflows/ci.yml`) corre en cada PR y push a `main`:
typecheck, lint, tests, escáner de secretos, auditoría de dependencias y
**build de producción**. Vercel despliega los previews por rama.
