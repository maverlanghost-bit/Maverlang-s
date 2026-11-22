# Runbook de incidentes (OPS-10)

Borrador operativo. Los plazos y obligaciones legales son `[REVISIÓN ABOGADO]`: este
documento no fija ninguno. Dinero real sigue en NO GO (ver `docs/AUDITORIA-HANDOFF.md`).

## Roles

| Rol | Quién | Qué hace |
| --- | --- | --- |
| Comandante del incidente | Manu (titular) | Decide contener, comunicar y cerrar. |
| Operador | Quien tenga acceso a Vercel/Supabase | Ejecuta kill switches y rotaciones. |
| Comunicación | Manu o a quien designe | Mensajes a usuarios y autoridades, tras consultar al abogado. |
| Escriba | Cualquier persona del equipo | Lleva la línea de tiempo con hora UTC. |

Si hay una sola persona, ocupa todos los roles y anota igual la línea de tiempo.

## Severidad

- **SEV1**: posible pérdida de fondos, secreto con privilegios expuesto, acceso no autorizado a datos personales, o ejecución de dinero real no esperada. Contener de inmediato.
- **SEV2**: caída de una dependencia crítica (Supabase, Privy, Jupiter, RPC) o fallo que bloquea operar/retirar, sin evidencia de pérdida.
- **SEV3**: degradación parcial o error visible sin impacto en dinero ni datos.
- **SEV4**: defecto menor; se agenda.

## Primera hora

1. **Declarar** el incidente, asignar roles y abrir la línea de tiempo (hora UTC).
2. **Contener** (de menor a mayor impacto):
   - Panel de administración (con MFA), flags de producto: `trading_enabled=false` (operar), `withdrawals_enabled=false` (salidas), `onramp_enabled=false` (entradas), `signup_enabled=false`, y `copy_enabled` / `copy_buy_enabled` / `copy_billing_enabled` apagados. Los flags tardan hasta 30 s por la caché.
   - Variables de entorno en Vercel (requieren redeploy): `REAL_TRADING_READY` distinto de `true` y `REAL_EXECUTION_UNLOCKED` ausente o distinto de `true` dejan el dinero real en 503 `REAL_DISABLED` (`REAL_EXECUTION_LOCKED` se calcula a partir de la segunda, ver `lib/trade/real-guards.ts`).
   - Si hace falta, `DATA_MODE=mock`.
3. **Preservar evidencia** antes de limpiar nada (ver más abajo).
4. **Evaluar el alcance**: qué secretos, tablas o usuarios pudieron verse afectados.
5. **Rotar** lo comprometido (orden abajo) y revocar sesiones si hay riesgo de cuentas.
6. **Comunicar** internamente y decidir con el abogado si corresponde avisar afuera.

## Orden de rotación de claves

Rotar primero lo que mueve dinero o da acceso total a datos; después lo demás. Tras cada
rotación, actualizar Vercel (y el Environment `production-data` de GitHub si aplica),
redeploy y verificar `/api/health/deep`.

1. Supabase secret key (`SUPABASE_SECRET_KEY`; si se usó el JWT heredado, también `SUPABASE_SERVICE_ROLE_KEY`).
2. Privy (`PRIVY_APP_SECRET`) y claves de la app.
3. Koywe (`KOYWE_SECRET`, `KOYWE_WEBHOOK_SECRET`) y `ONRAMP_WEBHOOK_SECRET`.
4. Jupiter (`JUPITER_API_KEY`).
5. Helius u otro RPC privado (`HELIUS_API_KEY`).
6. `CRON_SECRET`, `REVALIDATE_SECRET` y `FRACCION_REVALIDATE_SECRET` (si se usa).
7. `DEMO_TOKEN_SECRET` y `SHARE_SIGNING_SECRET` (invalidan tokens ya emitidos: esperado).
8. Upstash (`UPSTASH_REDIS_REST_TOKEN`).
9. Resend (`RESEND_API_KEY`) y xAI (`XAI_API_KEY`).
10. Secretos HMAC (`*_HMAC_SECRET`).

Si una clave pasó por el repo, eliminarla del historial no basta: se da por quemada y se rota.
Revisar con `node scripts/scan-secrets.mjs --history`.

## Preservación de evidencia

- Exportar (no borrar) logs de Vercel, logs de Postgres/Auth/API de Supabase y eventos de Sentry del período.
- Guardar `git log` y el SHA desplegado; capturas de los flags y de las variables (sin valores).
- Copiar las filas relevantes de las tablas de auditoría/operaciones a un respaldo cifrado fuera del proyecto.
- No reiniciar ni restaurar la base antes de exportar. Registrar quién accedió a la evidencia.

## Notificación a usuarios y autoridades

`[REVISIÓN ABOGADO]` Ley 21.719 (protección de datos personales de Chile): determinar si el
incidente es una vulneración de seguridad de datos personales, a quién se notifica
(Agencia de Protección de Datos Personales, titulares afectados), con qué contenido y en
qué plazo. Otras obligaciones (CMF, UAF, bancos/proveedores de pago) también quedan
sujetas a criterio legal. Este runbook no afirma plazos.

Mientras tanto: no declarar públicamente la causa ni el alcance sin confirmar; mensajes
claros, sin culpar y sin prometer compensaciones.

## Simulacro de restauración (Supabase PITR)

Hacerlo en un proyecto aparte, nunca sobre producción, al menos cada trimestre:

1. Confirmar que el plan tiene PITR/backups diarios y la ventana de retención.
2. Restaurar a un proyecto nuevo (Dashboard > Database > Backups > Restore to new project) a un instante conocido.
3. Aplicar las migraciones pendientes si el instante es anterior a la última y correr `npm run audit:rls` contra el proyecto restaurado.
4. Verificar conteos de tablas críticas y saldos contra lo esperado.
5. Anotar tiempo total (RTO) y pérdida máxima de datos (RPO) y corregir este documento.
6. Borrar el proyecto de prueba.

## Plantilla de post-mortem

Sin culpables. Entregar en 5 días hábiles tras cerrar un SEV1/SEV2.

```
# Post-mortem: <título> (SEV<n>)
Fecha/hora UTC inicio - detección - contención - cierre:
Impacto (usuarios, dinero, datos):
Línea de tiempo:
Causa raíz (5 porqués):
Qué funcionó / qué falló en la respuesta:
Qué se notificó y a quién ([REVISIÓN ABOGADO]):
Acciones correctivas (responsable, fecha):
Evidencia guardada en:
```
