# Catálogo seguro (M52)

Cómo se decide qué acciones pueden entrar al catálogo ampliado (~250).

## Criterios (todos se cumplen o no entra)

1. Mint con formato válido (empieza con `Xs`) e idéntico al snapshot oficial.
2. Existe en Jupiter, verificado con tag `xstocks` y autoridades canónicas.
3. Datos de trading presentes y activo no suspendido.
4. Subyacente en USD y bolsa permitida (acciones: XNYS/XNAS; ETF: +ARCX/BATS).
5. Nada apalancado, inverso ni de volatilidad; precio de referencia conocido.
6. Costo de compra US$100 ≤ 100 bps, compra US$1.000 ≤ 150 bps, venta ≤ 150 bps.
7. Desviación del precio on-chain vs referencia ≤ 300 bps.

## Por qué

Los filtros 1–2 frenan mints falsos: los mints solo salen de la API oficial
de xStocks; nunca de buscadores ni de terceros. El 4–5 deja fuera productos
que el usuario no espera. El 6–7 deja fuera activos sin liquidez real.

## Niveles (informativos, no aprueban)

A: liquidez ≥ US$100.000. B: ≥ US$10.000. C: solo RFQ.

## Cómo correr la auditoría

`npm run audit:catalog -- --symbols AAPLx,NVDAx` escribe
`data/catalog-audit-<fecha>.csv` con PASA/NO PASA y motivos.
Flags: `--limit N`, `--symbols A,B`, `--no-quotes`, `--out <ruta>`.
El caché diario vive en `data/audit-cache/` y la hace reanudable.

Nota de horario: de noche (sesión overnight) muchos activos no tienen
cotización RFQ; la promoción a 'listado' se decide con corridas en sesión
regular (M53/M55).

## Máquina de estados (M53)

Cada activo guarda `safety_status` (`listed`, `watch`, `hidden`, `unknown`)
más rachas `consecutive_passes`/`consecutive_fails`. Cada corrida con `--db`
aplica `nextSafetyState` y deja evento en `asset_safety_events`.

| Estado previo | Qué pasó | Sesión | Estado nuevo |
|---|---|---|---|
| cualquiera | `force_hide` | cualquiera | `hidden` |
| cualquiera | motivo estático (mint, autoridades, suspendido, bolsa, apalancado) | cualquiera | `hidden` |
| cualquiera | `force_list` sin motivo estático | cualquiera | `listed` |
| cualquiera | `force_list` con motivo estático | cualquiera | `hidden` |
| no `listed` | PASA (1.ª vez) | cualquiera | `watch` |
| no `listed` | PASA (2.ª seguida, una en `market`) | `market` | `listed` |
| no `listed` | PASA (2.ª seguida, ninguna en `market`) | otra | `watch` |
| `listed` | PASA | cualquiera | `listed` |
| `listed` | falla sólo cotización | `overnight`/`closed` | `watch` (nunca `hidden`) |
| otro | falla sólo cotización | `overnight`/`closed` | igual (nunca `hidden`) |
| no `hidden` | falla sólo cotización (1.ª) | `market`/`extended` | `watch` |
| cualquiera | falla sólo cotización (2.ª seguida) | `market`/`extended` | `hidden` |

Visible para la app: `listed` y `watch`. Operable: sólo `listed`.
Las 50 curadas parten con `consecutive_passes = 0`: se ganan el listado
como todas. `manual_override`/`manual_note` son del operador.

## Vigilancia continua (M55)

`lib/catalog/monitor.ts` (`runSafetyBatch({ offset, limit })`) re-audita por
lotes (default 25) los activos `listed`/`watch` ordenados por
`safety_checked_at` (nulos primero): datos de xStocks por símbolo + precio v3
+ 3 cotizaciones (`buy100`, `buy1000`, `sell100`) con el ritmo y backoff de
M52, después `evaluateAsset` → `nextSafetyState` → update + evento. Las filas
`issuer = 'ondo'` no se piden a xStocks: usan los chequeos estáticos de Ondo
y cotizaciones RFQ/JupiterZ (`parseOrderQuote`), con referencia del hermano
xStocks o `price/v3`; el volumen nunca excluye. Corta limpio a los 50 s y deja
el resto para la próxima corrida.

`GET /api/cron/catalog-health` (lotes vía `?offset=&limit=`) exige
`Authorization: Bearer ${CRON_SECRET}` (401 sin él; 503 si no está
configurado) y responde `{ checked, changed, remaining }`. Cuando un activo
cruza `listed` (a `watch`/`hidden` o al revés) inserta evento en
`asset_safety_events` y avisa con `notifyOps` (hoy sólo log `[catalog-health]`;
M61 conecta Sentry, M51 el correo). `vercel.json` la agenda una vez al día
lun–vie (`0 16 * * 1-5`: 16:00 UTC = 13:00 en Chile, dentro del horario
regular de EE.UU.). El plan Hobby de Vercel sólo admite crons diarios:
"Cron expressions that would run more frequently [than once per day] will
fail during deployment" ("Hobby accounts are limited to daily cron jobs",
según https://vercel.com/docs/cron-jobs/usage-and-pricing). En M50, con
Vercel Pro, se cambia a `*/30 * * * 1-5`. Como `runSafetyBatch` revisa 25
por llamada, con una corrida diaria el resto se cubre con
`audit:catalog --db` desde el PC.

Al cotizar, la COMPRA de un activo en revisión responde `ASSET_UNAVAILABLE`
("Este activo está en revisión y no se puede operar ahora"); la venta de una
posición sigue M54c (siempre se puede vender lo que se tiene).
