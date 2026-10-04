# T09 — Onboarding
Lee: `PROGRESO.md`, `docs/ARQUITECTURA.md` §2.2 (onboarding) y §6 (regla 7).

Haz `/app/onboarding` como wizard de 5 pasos con barra de progreso (layout sin AppShell, mobile-first):
1. País de residencia (select; si `US` → pantalla de no disponible).
2. Declaración: "No soy ciudadano ni residente de EE.UU. (US person)" — checkbox obligatorio + explicación breve.
3. Términos, Privacidad y Riesgos: resumen de riesgos en 4 bullets + 3 checkboxes con link al doc y su versión (`TERMS_VERSION`…). Al continuar → `POST /api/me/consents` por cada doc.
4. Billetera: estado "Creando tu billetera…" → "Lista" con dirección abreviada (mock / Privy).
5. "Todo listo": CTA "Depositar pesos" (→ `/app/billetera/depositar`) y "Explorar acciones" (→ `/app`). Marca `onboardingCompleted` vía `PATCH /api/me` y cookie `a24_onb=1`.
Guardar progreso en estado local para no perderlo al recargar. Validación con zod + react-hook-form.

Listo cuando: el flujo completo lleva a `/app` y no se puede saltar pasos.
Al terminar: PROGRESO.md + commit `T09: onboarding`.
