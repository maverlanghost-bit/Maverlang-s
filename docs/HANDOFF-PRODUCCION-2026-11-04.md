# Entrega: preparación para producción — 4 de noviembre de 2026

Este documento complementa `docs/AUDITORIA-HANDOFF.md` y `PROGRESO.md`. El objetivo es continuar la plataforma con depósitos cripto, operaciones seguras y patrocinio de SOL por la empresa. **No está lista para fondos reales.**

## Estado inmediato: integración interrumpida

- La rama actual es `main`, con HEAD local `db3c416`; está tres commits por delante de la referencia local `origin/main`. No se hizo push de esos tres commits en esta sesión.
- Se inició `git merge --no-commit --no-ff fix/security-integration` y el usuario interrumpió el turno. La integración **sí quedó iniciada**: `MERGE_HEAD` apunta a `a4ffabf0e962f27ff20f863a8875cff92d8a02b1` y hay archivos de esa rama ya preparados en el índice.
- Conflictos pendientes: `.github/workflows/ci.yml` y `lib/services/users.rls.ts`. El árbol no está listo para compilar ni para hacer commit. Revisar `git status` antes de trabajar; no ejecutar `git add -A` ni crear un commit hasta revisar y resolver todo el merge.
- Orientación de una revisión estática anterior, **no una resolución ya validada**: preservar el endurecimiento de CI de la rama de seguridad y los cambios de declaración de `main` en `users.rls.ts`; revisar también los auto-merges en `lib/auth/gate.ts`, `lib/services/index.ts` y `lib/trade/real-guards.ts`. Verificar con pruebas, no aplicar `ours`/`theirs` a todo el árbol.
- La rama de seguridad modifica `supabase/migrations/0042_trade_reservations.sql` en el merge. Si una base ya aplicó la 0042 anterior, un gestor de migraciones puede no volver a ejecutarla: preparar una **migración forward** revisada y probarla con datos existentes y reservas duplicadas. No reaplicar el archivo a ciegas.
- No se modificó infraestructura en esta última integración. El estado desplegado y la base real no se verificaron de forma independiente en esta sesión; el handoff anterior dice que el sitio público corre en mock y que la integración completa aún no está desplegada.

## Trabajo completado localmente

- **T27 — `27d05f3`:** mejoras de billetera y depósitos, eliminación de `bigint-buffer` como dependencia directa de la cadena SPL usada, selección de programa SPL/Token-2022, pruebas de PostgreSQL aislado y navegador demo. Sus límites están en `PROGRESO.md`.
- **T28 — `e586ba6`:** investigación de Zod 3 y herramientas de desarrollo; se descartó un parche local incompleto. La actualización de Vitest 4 aprobó 59 pruebas en copia aislada, pero no se instaló ni validó en el proyecto principal.
- **T29 — `7ff842d`:** migración `0045_profiles_immutability.sql`: impide revertir onboarding y cambiar identidad tras completarlo; sincroniza correo con `auth.users`. Pasaron 22 pruebas PostgreSQL aisladas y 17 unitarias. **No aplicada a infraestructura por esta sesión.**
- **T30 — `84ee445`:** declaración explícita de U.S. person, control de versión en servidor/base y guardas de acceso a cuenta real; preserva demo. `0046_profiles_onboarding_declaration.sql` incluye plan de regularización. Pasaron 1.275 pruebas, tipos, lint y 32 pruebas PostgreSQL aisladas. **0046 no aplicada por esta sesión; E2E real no verificado.**
- **T31 — `db3c416`:** corregido el orden de la cadena para base nueva: `0001` legado es no-op, `0024` condicional, `0025` usa UUID y `0028` es reejecutable. El arnés `supabase/tests/run-migration-chain-tests.mjs` aplicó 0001–0046 dos veces y pasó 15 comprobaciones. Usa PostgreSQL aislado con stubs de Supabase; no valida GoTrue/PostgREST reales.
- Los registros detallados y los comandos de los arneses están en `PROGRESO.md` y `supabase/tests/README.md`.

## Pendientes antes de producción

1. **Terminar o decidir el merge interrumpido.** Resolver conflictos con cuidado, revisar cada auto-merge, no perder T29–T31, actualizar los tests del comportamiento de reservas y ejecutar tipos, lint, suite, build, E2E y arneses SQL sobre el resultado integrado. Mantener bloqueos de dinero real.
2. **Staging y migraciones.** Inventariar de forma read-only el esquema y las migraciones efectivamente aplicadas; no asumir que los comentarios históricos reflejan la base real. Respaldar y ensayar sobre una copia. Verificar dependencias 0015/0043/0044/0045/0046, permisos, triggers y sincronización de la versión de declaración entre app y DB. No aplicar 0038 después de 0043 ni reaplicar versiones antiguas por encima de funciones nuevas sin revisión.
3. **Cuentas existentes y cumplimiento.** Completar y probar el procedimiento operativo de soporte para regularizar perfiles antiguos sin crear declaraciones falsas. Revisar el texto de declaración y las versiones legales con un profesional; conectar controles de identidad/KYC/AML adecuados al producto. La autodeclaración no sustituye esos controles.
4. **Billetera e identidad.** La asociación real Supabase↔Privy sigue bloqueada hasta demostrar que ambas identidades pertenecen a la persona correcta. Probar alta, login, recuperación, MFA, permisos RLS y conexión/firma de wallet con servicios de staging y navegadores reales.
5. **Depósitos, retiros y operaciones cripto.** Verificar confirmaciones y reorganizaciones de Solana, mints y decimales, depósitos duplicados, conciliación y saldos. Completar retiros y controles de límites/abuso, manejo de fallos y transacciones de resultado incierto. Las cotizaciones en `Map` en memoria necesitan almacenamiento compartido seguro para un despliegue con varias instancias.
6. **Comisiones de red a cargo de la empresa.** El usuario quiere que la plataforma aporte el SOL. El patrocinio está desactivado y `lib/solana/sponsorship/kms.ts` es un stub: falta firmante seguro, límites, monitoreo, fondeo, protección frente a abuso y pruebas on-chain en entorno de pruebas. No prometer patrocinio hasta comprobarlo.
7. **Dependencias.** Sigue el advisory alto de Zod 3 transitivo; no hay parche oficial compatible identificado en la revisión anterior. `vitest`/`tinypool` de desarrollo mantienen alertas críticas en el estado validado T28. Actualizar o mitigar de forma verificable y mantener visibles las alertas; probar autenticación y billeteras tras cualquier cambio.
8. **Operación y seguridad.** Configurar servicios y secretos del entorno correcto, límites compartidos, monitoreo sin PII, alertas, backups y restauración probada, respuesta a incidentes y revisión externa independiente. Las dos claves NVIDIA expuestas en el chat deben revocarse/rotarse; también evaluar rotación de cualquier secreto expuesto por el repositorio o historial. Nunca copiar secretos a este documento.
9. **Alcance comercial y legal.** Inicialmente se aceptarán depósitos cripto, no pesos locales; el webhook de on-ramp en pesos sigue siendo un pendiente antes de habilitarlo. Definir con asesoría chilena las obligaciones regulatorias, términos, privacidad, riesgos y acuerdos con proveedores. La Ley 21.719 entra en vigor el 1 de diciembre de 2026 según la BCN.

## Precauciones

- `REAL_EXECUTION_LOCKED` y el bloqueo de vinculación real deben mantenerse hasta completar y verificar los controles respectivos.
- No usar claves ni datos reales en tests. No aplicar migraciones ni realizar operaciones con fondos sin un entorno apropiado y la revisión correspondiente.
- Los resultados verdes anteriores son evidencia local de su momento, no certificación de seguridad completa ni prueba del estado actual tras el merge interrumpido.
- No se hizo push en esta sesión. El repositorio es público según el handoff anterior; confirmar el estado actual antes de compartir información sensible.
