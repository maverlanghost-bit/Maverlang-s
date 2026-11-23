# Capacidad: ¿aguanta 500 usuarios en vivo? (T92, 2026-11-23)

Estimación hecha leyendo el código y las cabeceras de producción. **No es una medición**: para medirlo hay que correr la prueba de carga de la sección final.

## Cuánta carga genera un usuario conectado

| Pantalla | Peticiones automáticas | Va a la CDN o a la función |
|---|---|---|
| Mercado | precios cada 15 s, "Tu día" cada 60 s | precios: CDN 15 s (`public, max-age=15`) |
| Ficha de acción | precio spot cada 5 s, historial cada 60-300 s | historial: CDN (`HIT` medido); spot: se agrupa por símbolos |
| Cartera, perfil, billetera | `/api/me`, cartera, preferencias cada 60 s | **función + Supabase** (datos por usuario, sin CDN) |
| Asistente IA | según uso | función + proveedor de IA (tope 20 por 10 min y 100 por día por usuario) |

Promedio razonable: **10 a 15 peticiones por minuto por usuario**. Con 500 usuarios:
- unas **85 a 125 peticiones por segundo** en el borde de Vercel. La mayoría de las de precios e historial salen de la CDN;
- unas **25 peticiones por segundo a funciones y Supabase**, por los datos de cada usuario.

Esa cifra no es alta para Vercel ni para Supabase. El riesgo está en los **planes y límites de terceros**, no en el código.

## Riesgos, de mayor a menor

1. **Plan Hobby de Vercel.** No admite uso comercial y su cupo mensual gratuito (invocaciones, CPU, transferencia) se agotaría en horas con 500 usuarios activos. Hace falta **Vercel Pro**.
2. **Límites por IP de la app** (`lib/security/rate-limit.ts`): precios 120/min, `me` y `publicGet` 60/min por IP. En Chile los operadores móviles comparten IPs entre muchos clientes (CGNAT). Diez personas tras la misma IP en una ficha (12 spot/min cada una) ya superan 120/min y recibirían 429. Arreglo: con sesión, limitar por usuario en vez de por IP, o subir los topes de lectura pública.
3. **Upstash** (contador de límites): cada petición limitada gasta 2 a 3 comandos. A ~25 por segundo son millones de comandos al día, muy por encima de un plan gratuito. Revisar el plan y el costo de pago por uso.
4. **GeckoTerminal gratis** (velas del token, T91): ~10 llamadas/min por IP de salida. Las combinaciones populares quedan en la CDN, pero con 500 personas recorriendo 446 acciones la cola larga agota el cupo. El gráfico vuelve entonces a la fuente vieja (cierres de Yahoo, que pueden no cuadrar con el precio). Para producción: clave de CoinGecko (API on-chain de pago) o un cron propio que guarde las velas en la BD.
5. **Supabase.** Si es el plan gratuito, revisar límites de conexiones, CPU y la pausa por inactividad. Con 25 peticiones por segundo conviene Pro.
6. **Privy** (acceso/billetera): los planes gratuitos tienen tope de usuarios activos al mes. Verificar que el plan cubra el volumen esperado.
7. **IA:** el tope global es de 5.000 mensajes al día (`aiGlobalDaily`). Con 500 usuarios usándola en serio se alcanza y se corta para todos.
8. **Jupiter** (precios): ya va agrupado y en caché de 15 s. Riesgo bajo, pero confirmar el plan de la clave.

## Cómo medirlo de verdad

Herramienta recomendada: **k6** (Grafana, código abierto). Simula usuarios virtuales que hacen lo mismo que el navegador: abrir el mercado, entrar a una ficha y sondear precios con los mismos intervalos.

- **Contra una vista previa de Vercel, no contra producción.** No hay que gastar el cupo real ni presionar a Jupiter o GeckoTerminal con tráfico falso, y conviene `DATA_MODE=mock` para no llamar a terceros.
- **Desde varias IPs** (Grafana Cloud k6) o con los límites por IP relajados en esa vista previa. Desde un solo PC, los límites por IP cortarían la prueba a los pocos segundos y no medirían la plataforma.
- **Escalones:** 50 → 200 → 500 usuarios virtuales, 5 min cada uno.
- **Qué mirar:** latencia p95 por ruta, tasa de errores (429/5xx), aciertos de CDN y uso en los paneles de Vercel, Supabase y Upstash.

Antes de la prueba de 500 conviene resolver los puntos 1 y 2. Si no, la prueba sólo confirmará esos límites.
