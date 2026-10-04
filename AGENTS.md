# Maverlang — contexto del proyecto

**Qué es:** web app chilena para comprar fracciones de acciones de EE.UU. tokenizadas (xStocks en Solana) pagando con pesos. Marca "Maverlang" (nombre comercial "Maverlang Stocks") (usar siempre `NEXT_PUBLIC_BRAND_NAME` / `config/site.ts`, nunca hardcodear).
**Dos partes:** (1) Landing de marketing en `app/(marketing)` (`/`, `/ayuda`, `/legal/*`). (2) Plataforma en `app/(platform)/app` (`/app/*`): mercado, detalle, compra/venta, cartera, billetera, perfil, onboarding.
**Stack:** Next.js App Router + TypeScript strict + Tailwind v4 + TanStack Query + zod + Privy + @solana/web3.js + Jupiter + Supabase. Idioma UI: español de Chile.

**Docs (léelas sólo cuando el prompt lo pida, y sólo la sección indicada):**
- `docs/DESIGN-SYSTEM.md` — tokens, componentes, copy, checklist.
- `docs/ARQUITECTURA.md` — rutas (§2), carpetas (§3), tipos (§4), servicios (§5), reglas de dominio (§6).
- `docs/TAREAS.md` — orden de tareas.
- `PROGRESO.md` — estado actual. **Léelo al iniciar cada sesión.**

**Reglas permanentes:**
1. Una tarea por sesión. No adelantes tareas futuras.
2. Datos SIEMPRE vía `lib/api/client.ts` → `/api/*` → `getServices()`. `DATA_MODE=mock` por defecto. Nada de llamadas directas a Jupiter/Solana/Supabase desde componentes.
3. Sólo mints de `config/tickers.ts`. Mostrar acciones = crudo × multiplicador (ARQUITECTURA §6).
4. Nunca inventar cifras de negocio, testimonios ni promesas de rentabilidad. Textos legales = borrador marcado "[REVISIÓN ABOGADO]".
5. Secretos sólo en servidor (`lib/env.ts`). Nunca commitear `.env.local`.
6. Componentes pequeños, server components por defecto, `"use client"` sólo donde haga falta.
7. No instalar dependencias fuera del stack sin anotarlo en PROGRESO.md con el motivo.
8. No ejecutar comandos destructivos (`rm -rf`, `git reset --hard`, `git push --force`, borrar ramas). No hacer push salvo que se pida.
9. Tests completos se hacen al final (T20); ahora sólo verifica que compila y la ruta se ve.
10. **Al terminar cada tarea:** actualizar `PROGRESO.md` (tarea, archivos clave, decisiones, pendientes, próximos pasos — máx. 15 líneas por tarea) y `git add -A && git commit -m "TNN: <resumen>"`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
