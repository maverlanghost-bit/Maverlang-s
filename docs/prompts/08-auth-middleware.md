# T08 — Auth (mock + adaptador Privy) y middleware
Lee: `PROGRESO.md`, `docs/ARQUITECTURA.md` §2.2 (ingresar), §2.3, §10 (Sesión real).

Haz:
1. `lib/auth/` con interfaz cliente `useSession()` → `{ status, user, login(), logout() }`. Dos implementaciones: `MockAuthProvider` (login crea cookie `a24_mock_session` y perfil demo) y `PrivyAuthProvider` (envuelve `@privy-io/react-auth` con `loginMethods: ["email","google"]`, wallet embebida Solana `createOnLogin: "users-without-wallets"`). Selección por `NEXT_PUBLIC_DATA_MODE` o ausencia de `NEXT_PUBLIC_PRIVY_APP_ID`. Instala Privy pero no lo exijas en mock. [VERIFICAR nombres exactos de props en la doc actual de Privy antes de escribir; si no puedes, deja TODO.]
2. `/app/ingresar`: card centrada, logo, "Ingresa o crea tu cuenta", botón email y Google, texto legal con links.
3. `middleware.ts`: geobloqueo (`x-vercel-ip-country`; en dev permitir `?country=XX` para simular) → `/bloqueado`; `/app/*` sin sesión → `/app/ingresar?next=`; sesión sin onboarding (cookie `a24_onb=1` en mock) → `/app/onboarding`. Excluir `_next`, assets y `/api`.
4. Logout limpia cookies y vuelve a `/`.

Listo cuando: flujos de redirección funcionan en mock.
Al terminar: PROGRESO.md + commit `T08: auth y middleware`.
