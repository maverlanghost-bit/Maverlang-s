# Pendientes para publicar la plataforma

Actualizado el 21 de noviembre de 2026. Esta lista usa como referencia el código del repositorio y el progreso registrado. El estado de las cuentas, claves y migraciones en los paneles de producción queda por confirmar.

**La demo pública y el dinero real son dos lanzamientos.** La demo puede salir cuando su entorno, registro y controles de seguridad estén verificados. El dinero real sigue bloqueado hasta cerrar los puntos de la segunda etapa. Las órdenes límite reales tienen una condición adicional y pueden habilitarse más adelante.

## 1. Demo pública

- [ ] **Vercel y GitHub.** Confirmar acceso al proyecto correcto, rama de despliegue, dominio y HTTPS. Integrar el cambio que se quiere publicar y revisar el estado de CI y sus dependencias sobre ese mismo commit. Verificar los seis crons declarados y su frecuencia en el plan vigente. [Guía de despliegue](DEPLOY.md) · [Límites de crons de Vercel](https://vercel.com/docs/schedules/cron-jobs/usage-and-pricing)
- [ ] **Supabase.** Separar el proyecto de pruebas del de producción. Verificar las migraciones que necesita la demo, permisos por usuario, registro, verificación de correo, recuperación de cuenta y URLs de retorno del login. Usar autenticación Supabase para cuentas públicas. [Entornos de Supabase](https://supabase.com/docs/guides/deployment/managing-environments)
- [ ] **Upstash Redis.** Configurar el límite compartido de peticiones y comprobar que las rutas sensibles responden como corresponde. Ver los pasos de configuración más abajo.
- [ ] **Secretos y monitoreo.** Rotar claves expuestas, separar credenciales de prueba y producción y comprobar que el CI y los logs no publiquen secretos ni datos personales. Configurar alertas básicas de errores y fallos de los crons activos.
- [ ] **Textos públicos de la demo.** Revisar términos, privacidad y consentimiento del registro antes de abrir cuentas al público. Confirmar que la información de soporte esté disponible.
- [ ] **Prueba del lanzamiento.** Con `DATA_MODE=mock`, `NEXT_PUBLIC_DATA_MODE=mock`, `REAL_TRADING_READY=false` y `REAL_EXECUTION_UNLOCKED` ausente, probar registro, mercado y compraventa demo. Confirmar que las rutas reales siguen cerradas y que la interfaz identifica el saldo ficticio. Ejecutar la compilación y las suites completas cuando Manu dé la indicación.

## Cómo configurar Upstash

Upstash Redis comparte los contadores del límite de peticiones entre las instancias de Vercel. Sirve, por ejemplo, para que una misma cuenta no pueda duplicar su cupo sólo porque dos solicitudes llegaron a servidores distintos. El código ya usa Upstash. Falta confirmar la configuración del entorno que se va a publicar. [Límite de peticiones del repositorio](../lib/security/rate-limit.ts) · [Guía oficial de Upstash](https://upstash.com/docs/redis/sdks/ratelimit-ts/gettingstarted)

1. Crear una base Redis en Upstash para staging y otra para producción.
2. Guardar la URL REST y el token REST como `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN` en las variables del servidor del entorno correspondiente en Vercel.
3. Con las credenciales de **staging** en `.env.local`, ejecutar `npm run check:upstash`. El script crea una clave temporal, verifica el contador y la elimina. [Script de comprobación](../scripts/check-upstash.mjs)
4. En staging, probar que se comparte el cupo entre instancias, que superar el cupo devuelve **429** y que las rutas sensibles devuelven **503** cuando no pueden aplicar el límite. Esa prueba confirma el comportamiento de la app, además de la conexión con Redis. [Comportamiento de los límites](../lib/security/rate-limit.ts)

## 2. Dinero real

- [ ] **Cumplimiento y revisión legal.** Implementar y probar la verificación de identidad y los controles KYC/AML que correspondan al producto. La declaración de U.S. person ya tiene código y migración versionada en `0046`. Falta confirmar su aplicación, regularizar cuentas existentes y verificar que Supabase y la app usan la misma versión. Llevar términos, privacidad, riesgos y acuerdos con proveedores a revisión de abogado. [Handoff de auditoría](AUDITORIA-HANDOFF.md) · [Runbook técnico](LAUNCH-PRODUCCION-TECNICO.md)
- [ ] **Base de datos de producción.** Inventariar qué migraciones tiene aplicadas la base real, hacer respaldo y ensayar una restauración y la actualización en staging. Verificar permisos por usuario y la persistencia de reservas, cotizaciones y retiros (`0047`, `0049` y `0051`). Las pruebas en una base aislada sirven como evidencia del código. El cierre requiere comprobar el esquema del entorno objetivo. [Runbook técnico](LAUNCH-PRODUCCION-TECNICO.md)
- [ ] **Acceso a cuenta real y billetera.** Completar el recorrido del usuario autorizado. Hoy el selector fuerza la cuenta demo. En staging, verificar elegibilidad, asociación de Supabase con Privy, firma desde la billetera vinculada y bloqueo de una cuenta que no cumpla los requisitos. [Selector de cuenta](../lib/hooks/use-account-mode.ts)
- [ ] **Operaciones a mercado y depósitos USDC.** Configurar las claves de Jupiter y el RPC de Solana del entorno. Probar firma, cotización vencida, confirmación, cargos y saldos, con cupos y pausas operativas. Verificar que la conciliación acredita cada depósito confirmado una sola vez y detecta transacciones pendientes. [Runbook técnico](LAUNCH-PRODUCCION-TECNICO.md)
- [ ] **Retiros.** El código versionado ya tiene rutas, libro y topes diarios y mensuales en `0051`. Confirmar la migración, revisar la política de destinos y probar envíos sin doble débito, confirmaciones ambiguas y conciliación de retiros pendientes. La conciliación automática adicional tiene cambios locales por integrar o verificar. [Retiros en el registro del proyecto](../PROGRESO.md)
- [ ] **Activación y reversión.** Correr el preflight del entorno real, verificar el build y los flujos completos sobre el candidato a producción con autorización de Manu. Definir quién controla la beta, las pausas, las alertas y el rollback. Verificar cómo se recuperan los movimientos pendientes tras una pausa. Aplicar el orden de encendido del runbook sólo al cerrar esta etapa. [Runbook técnico](LAUNCH-PRODUCCION-TECNICO.md)

## 3. Órdenes límite reales

El cálculo del precio y la vista previa ya están en el servidor. El **ejecutor de órdenes** es la pieza que toma una orden pendiente y puede liquidarla cuando se cumpla su límite. Upstash cubre el límite de peticiones de la app. [Vista previa existente](../app/api/trade/limit/preview/route.ts)

- [ ] **Elegir y validar el ejecutor.** Debe hacer cumplir durante la liquidación el máximo de compra o mínimo de venta por acción, con el multiplicador vigente del xStock y el monto neto que recibe el usuario. Jupiter Trigger V2 deriva su mínimo del umbral, los precios de mercado y la tolerancia. Hoy queda por validar una vía que cumpla el límite estricto. [Cómo ejecuta Jupiter](https://developers.jup.ag/blog/lov2-from-barter-to-money) · [Multiplicadores de xStocks](https://docs.xstocks.fi/developers/multipliers)
- [ ] **Integrar el ciclo completo.** Conectar firma y autorización de fondos, registro persistente, vigencia, cancelación, devolución del saldo que corresponda y conciliación con Solana. Resolver cómo manejar ejecuciones parciales si el ejecutor las permite y qué pasa con una orden pendiente cuando cambia el multiplicador.
- [ ] **Probar el precio y la recuperación.** Verificar que una compra a US$120 no se ejecute por encima de ese valor por acción, y que una venta respete su mínimo. Probar faltas de liquidez, cambios de multiplicador, reintentos y cancelaciones simultáneas a una ejecución. Revisar el costo de red y cómo se muestra al usuario.

## Funciones que pueden salir después

- [ ] **Depósitos en pesos.** Si entran en el lanzamiento, validar autenticación del webhook del proveedor, acreditación única y conciliación de transferencias con el saldo en USDC.
- [ ] **Comisiones de red pagadas por la plataforma.** Si se ofrecen, conectar un firmante seguro, fondeo en SOL, cupos y alertas. El patrocinio tiene guardas en el repo y la integración de firma segura sigue pendiente. [Runbook técnico](LAUNCH-PRODUCCION-TECNICO.md)
