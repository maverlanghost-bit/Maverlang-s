# T10 — Shell de la plataforma
Lee: `PROGRESO.md`, `docs/ARQUITECTURA.md` §2.2 (layout), `docs/DESIGN-SYSTEM.md` §2 (layout) y §4.

Haz:
1. `app/(platform)/app/layout.tsx` con AppShell: ≥lg sidebar 240px (logo, Mercado, Cartera, Billetera, Perfil, abajo saldo + avatar); <lg TopBar (logo + saldo total) y BottomTabs 64px con iconos y safe-area. Item activo resaltado. Excluir `ingresar` y `onboarding` del shell (route groups anidados si hace falta).
2. BalanceHeader reutilizable (total en moneda de preferencia, toggle ocultar saldo 👁 persistido).
3. i18n: `content/i18n/es-CL.ts` y `en.ts` + hook `useT()`; textos del shell traducidos. Moneda/idioma desde `usePrefs`.
4. Patrones `PageHeader`, `LoadingState`, `EmptyState`, `ErrorState` (con reintento).
5. Disclaimer corto persistente al pie del contenido.
6. Páginas placeholder para cartera, billetera y perfil.

Listo cuando: navegación fluida entre las 4 secciones en 360px y 1280px.
Al terminar: PROGRESO.md + commit `T10: shell plataforma`.
