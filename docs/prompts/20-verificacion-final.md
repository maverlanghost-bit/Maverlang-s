# T20 — Verificación final (sólo cuando T01–T19 estén hechas)
Lee: `PROGRESO.md`, `docs/TAREAS.md`.

Haz:
1. `npm run lint`, `npm run typecheck`, `npm run build`: corrige todo error.
2. Vitest: tests unitarios de `lib/format.ts`, `lib/solana/scaled-ui.ts` (incluye newMultiplier con timestamp pasado/futuro), `fee.ts` (0 bps → sin instrucción), `allowlist.ts` (mint falso rechazado), contratos zod (request inválido → VALIDATION).
3. Playwright smoke (DATA_MODE=mock): landing carga; `/app` sin sesión → ingresar; login mock → onboarding → mercado; buscar AAPL → detalle → comprar → éxito → aparece en cartera; enviar con dirección inválida bloqueado; cambiar idioma.
4. Script `npm test` y `npm run e2e`.
5. Reporte en PROGRESO.md: resultado, bugs encontrados/corregidos, deuda técnica, lista de TODO-VERIFICAR y [REVISIÓN ABOGADO] pendientes.

Listo cuando: todo en verde o con bugs documentados.
Al terminar: PROGRESO.md + commit `T20: verificacion final`.
