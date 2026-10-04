# PROGRESO — Maverlang

## Estado
T01 hecha. Modo de datos: mock. Siguiente: T02.

## Tareas hechas

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
- Confirmar en el navegador que `/` muestra Geist y los colores del DS.
