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
