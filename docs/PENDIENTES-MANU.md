# Pendientes de Manu para soportar 500 usuarios en vivo

Lo que no se puede hacer desde el código: planes, claves y paneles. El código ya quedó preparado (T93, ver abajo). Los precios de cada plan cambian, así que revisa el valor vigente en la página de cada servicio antes de contratar.

Marca cada casilla al terminarla.

## Imprescindible antes de recibir a 500 personas

- [ ] **Vercel Pro.** El plan Hobby no permite uso comercial y su cupo mensual (invocaciones, CPU, transferencia) se agota en horas con 500 usuarios. Pro también deja publicar con el repositorio privado.
  - Vercel → Settings → Billing → Upgrade to Pro.
  - Después: Settings → Spend Management, con un tope de gasto y alertas para no llevarte sorpresas.
- [ ] **Volver el repositorio a privado** (después de pasar a Pro). Hoy está público y la rama `fix/auditoria-v3` expone las correcciones de seguridad T83.
  - GitHub → repo → Settings → General → Danger Zone → Change visibility.
  - Comprueba con un commit que Vercel siga publicando.
- [ ] **Jupiter: plan de la clave de API.** El plan gratuito permite ~1 petición por segundo. Con varias instancias de Vercel a la vez se supera, y las cotizaciones y compras fallarían.
  - Portal de Jupiter (portal.jup.ag) → plan con más cupo.
  - Si la clave cambia, actualiza `JUPITER_API_KEY` en Vercel.
- [ ] **Upstash (límites de uso): revisar el plan.** Cada petición limitada gasta 2 a 3 comandos de Redis; con 500 usuarios son millones al día.
  - Console de Upstash → base de datos → Usage para ver el consumo actual.
  - Pasa a pago por uso o a un plan fijo con cupo suficiente.
  - Confirma que `UPSTASH_REDIS_REST_URL` y `UPSTASH_REDIS_REST_TOKEN` estén en Vercel Production. Sin ellas, precios, compras e IA responden 503 a propósito.
- [ ] **Supabase Pro.** El plan gratuito tiene topes de CPU y conexiones y pausa el proyecto por inactividad.
  - Supabase → Organization → Billing → Pro.
  - Después, revisa el tamaño de cómputo y activa backups diarios.

## Muy recomendable

- [ ] **Clave de CoinGecko para los gráficos.** Sin clave, las velas del token salen de GeckoTerminal público (~10 llamadas por minuto). Con mucha gente mirando acciones distintas se agota y el gráfico vuelve a la fuente vieja.
  1. Para empezar: crea una clave **Demo** gratis en coingecko.com/en/api. En Vercel pon `COINGECKO_API_KEY=<clave>` y `COINGECKO_API_PLAN=demo` (~30/min).
  2. Para escala: plan de pago (Analyst o superior), con `COINGECKO_API_PLAN=pro` (~500/min).
  - El código elige la API sólo según estas variables; no hay que tocar nada más.
- [ ] **Privy: revisar el plan.** Los planes gratuitos tienen tope de usuarios activos al mes. Privy dashboard → Billing.
- [ ] **IA: tope global diario.** Hoy es de 5.000 mensajes al día entre todos los usuarios; al llegar se corta para todos.
  - Si esperas uso intenso, sube `RATE_LIMIT_AI_GLOBAL_DAILY` en Vercel (por ejemplo `20000`). Antes revisa el cupo y el gasto en el panel del proveedor de IA.
- [ ] **Monitoreo.**
  - Confirma `SENTRY_DSN` en Vercel Production.
  - Activa Vercel Analytics y Speed Insights.
  - Crea alertas de error en Sentry y de uso en Vercel, Upstash y Supabase.

## Prueba de carga (cuando lo anterior esté listo)

- [ ] Crea una cuenta en **Grafana Cloud k6**. Su capa gratuita alcanza para pruebas cortas y genera tráfico desde varias IPs.
- [ ] Avísame y preparo el script k6 y una **vista previa de Vercel** con `DATA_MODE=mock` para la prueba. No se prueba contra producción: no hay que gastar tu cupo real ni presionar a Jupiter o CoinGecko con tráfico falso.
- [ ] Prueba en escalones de 50, 200 y 500 usuarios virtuales, mirando errores y latencia en los paneles.

## Antes de mezclar la auditoría T83 a `main`

Ya estaba anotado en `docs/PRODUCCION-CHECKLIST.md`, resumido aquí:

- [ ] Cargar en Vercel Production: `DEMO_TOKEN_SECRET`, `SHARE_SIGNING_SECRET` (≥32 caracteres), `REVALIDATE_SECRET`, `COPY_PLAN_HMAC_SECRET`, Upstash, `APP_ENV=production` y `SUPABASE_PROJECT_ENV=prod`. Sin ellas el servidor no arranca, a propósito.
- [ ] Aplicar las migraciones 0045 → 0059 en staging y luego en producción (`docs/MIGRACIONES-PROD.md`).
- [ ] `vercel.json` declara 6 crons, que requieren Vercel Pro.

## Lo que ya quedó hecho en el código (T93)

- **Topes por IP para redes compartidas** (los operadores móviles en Chile comparten IP): precios de 120 a 600/min, lecturas públicas de 60 a 300, búsqueda de 60 a 120.
- **Topes ajustables desde Vercel sin desplegar:** `RATE_LIMIT_<POLÍTICA>`, por ejemplo `RATE_LIMIT_PRICES=900`.
- **Menos peticiones:**
  - el estado del mercado pasa a la CDN (60 s);
  - el precio de la ficha se consulta cada 10 s en vez de 5 (la CDN renueva cada 15 s);
  - precios e historial ya salían de la CDN.
- **Velas del token con CoinGecko** cuando hay clave (demo o pro), con más cupo; si no, GeckoTerminal como antes.
- Estimación completa en `docs/CAPACIDAD-500-USUARIOS.md`.
