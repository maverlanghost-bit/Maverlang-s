# T01 — Scaffold del proyecto
Lee: `AGENTS.md`. Luego sólo `docs/ARQUITECTURA.md` §1 y §3, `docs/DESIGN-SYSTEM.md` §2 y §6.

Haz:
1. Si el repo está vacío salvo `docs/`, `AGENTS.md`, etc.: crea app Next.js (App Router, TS, ESLint, Tailwind v4, `src/` NO, alias `@/*`) en la carpeta actual sin borrar lo existente.
2. Instala: `geist @tanstack/react-query zod react-hook-form @hookform/resolvers @number-flow/react lightweight-charts qrcode.react clsx tailwind-merge`.
3. `app/globals.css` = contenido de `docs/styles/tokens.css`. Fuentes Geist en `app/layout.tsx` (variables `--font-geist-sans/mono`), `lang="es-CL"`.
4. Crea la estructura de carpetas de ARQUITECTURA §3 con `.gitkeep`; copia `docs/config/tickers.ts` → `config/tickers.ts`, `docs/.env.example` → `.env.example`, `docs/supabase/0001_init.sql` → `supabase/migrations/0001_init.sql`.
5. `config/site.ts` con nombre de marca desde env (fallback "Maverlang Stocks"), URLs y email de soporte.
6. `lib/cn.ts` (clsx + tailwind-merge). Scripts npm: `dev`, `build`, `lint`, `typecheck` (`tsc --noEmit`).
7. Página `/` temporal con H1 y botón usando tokens para confirmar estilos.
8. Crea `PROGRESO.md` (si no existe) con secciones: Estado, Tareas hechas, Decisiones, Pendientes/Bloqueos.

Listo cuando: `npm run dev` levanta y `/` muestra Geist + colores del DS.
Al terminar: actualiza PROGRESO.md y commit `T01: scaffold`.
