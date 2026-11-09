# IA-ROADMAP — Maverlang

**Estado:** documento de planificación. **No** implementa funciones, rutas, tablas ni migraciones.
**Alcance:** asistente de `/app/asistente` y las herramientas que lo alimentan.
**Base:** `AGENTS.md`, `docs/ARQUITECTURA.md`, `docs/AUDITORIA-HANDOFF.md`, y el código actual de `app/api/`, `lib/ai/`, `lib/hooks/` y `components/ai/`.

> Regla de oro: si un dato no está en una ruta, un hook o un servicio existente, la función no se implementa con un número aproximado. Se muestra «sin dato» o no se muestra.

---

## 1. Principios permanentes

Estas reglas aplican a todas las funciones de esta hoja, sin excepción:

1. **Datos por la vía existente.** En la interfaz, los datos salen de `lib/hooks/queries.ts` → `lib/api/client.ts` → `/api/*` → `getServices()`. En el servidor, las herramientas del asistente usan `getServices()` y los servicios ya existentes. Nunca se llama a Jupiter, Solana, Supabase ni a un proveedor externo desde un componente. Sólo se resuelven símbolos del catálogo visible (`config/tickers.ts` / `useTickers`); nada fuera de la allowlist.
2. **Sólo lectura por defecto.** El asistente puede consultar, calcular y explicar. No ejecuta órdenes, no firma transacciones y no llama a `/api/trade/build` ni a `/api/trade/submit`. `open_buy` sólo entrega un enlace a la ficha existente.
3. **Sin promesas de rentabilidad.** No se promete rendimiento, seguridad ni resultado. Los escenarios se presentan como cálculos bajo supuestos, no como pronósticos.
4. **Sin consejos de inversión personalizados.** El asistente describe datos, conceptos, riesgos y alternativas. No dice qué comprar, vender, cuánto invertir ni si una opción «conviene» para esa persona. El aviso `copy.adviceNotice` («Las respuestas son informativas y no son consejos de inversión.») permanece visible en el compositor, y el servidor mantiene su propio aviso en `buildSystemPrompt`.
5. **Sin cifras inventadas.** Si falta un precio, un costo, una fecha o una fuente, el resultado es `null` o «sin dato». No se rellena con cero, con un promedio ni con una estimación no declarada.
6. **Fuente y fecha.** Todo número mostrado por una función nueva debe poder rastrearse a una ruta o servicio, con su fecha de actualización cuando exista.
7. **Texto legal como borrador.** Cualquier texto tributario, regulatorio o de riesgos se marca `[REVISIÓN ABOGADO]` hasta que legal lo valide. No se inventan tasas, formularios ni obligaciones.
8. **Marca configurable.** Los textos de interfaz usan `site.name` de `config/site.ts` (`NEXT_PUBLIC_BRAND_NAME`), nunca una variante hardcodeada.
9. **Privacidad y consentimiento.** Las imágenes, la memoria y los datos de cartera requieren finalidad explícita, minimización, retención definida y posibilidad de eliminar. No se crean perfiles ocultos.
10. **Costo acotado.** Cada herramienta nueva declara timeout, caché y presupuesto de llamadas. El asistente no puede multiplicar llamadas a proveedores por cada mensaje.
11. **Idioma y tono.** La interfaz y las respuestas usan español de Chile por defecto; el inglés aparece sólo cuando la persona escribe en inglés. Los textos nuevos viven en `content/i18n` y no se duplican en componentes.

### 1.1 Contexto de cumplimiento

- `docs/AUDITORIA-HANDOFF.md` deja **dinero real = NO GO** hasta cerrar D-02, DB-03, DB-06/07, KYC/AML y legal. Ninguna función de esta hoja debe presentarse como operativa para dinero real.
- Las rutas de operar pasan por `apiOperateBlock` (`lib/compliance/real-quote.ts`). Cualquier simulación o cotización debe respetar ese geobloqueo.
- `DATA_MODE=mock` es el valor por defecto. Las funciones deben funcionar con datos de referencia y no inventar cifras cuando el modo es mock.

---

## 2. Lo que ya existe

### 2.1 Inventario del asistente

| Capa | Pieza existente | Dónde | Qué aporta |
|---|---|---|---|
| Chat | `POST /api/ai/chat` + `runChat` | `app/api/ai/chat/route.ts`, `lib/ai/run-chat.ts` | Conversación con xAI, hasta 4 rondas de herramientas y 6 llamadas por ronda. |
| Herramientas | `AI_TOOLS` y `executeToolCall` | `lib/ai/tools.ts` | `search_stock`, `get_stock`, `compare_stocks`, `get_portfolio`, `open_buy`. |
| Widgets | `AiWidget` | `components/ai/contract.ts`, `components/ai/widgets.tsx` | `stock`, `compare`, `portfolio`, `buy`, `import-preview`; gráficos y tablas. |
| Contexto | Selector y chips de contexto | `components/ai/context-picker.tsx`, `components/ai/context-types.ts` | Hasta 6 acciones, índices o «Toda mi cartera»; viaja como directiva al último mensaje, sin cambiar el contrato HTTP. |
| Imagen | Import de cartera por foto | `app/api/ai/import-portfolio/route.ts`, `components/ai/import/import-preview.tsx` | Lee JPG/PNG de hasta ~4 MB con visión de xAI; no guarda la foto; permite revisar y guardar como seguimiento. |
| Preguntas | `InteractiveQuestionCard` | `components/ai/interactive-question-card.tsx` | Tarjeta de opción múltiple con texto libre y opción de omitir; hoy no está conectada a la respuesta del chat. |
| Export | Markdown de conversación | `components/ai/sessions-store.ts`, `components/ai/assistant-navbar.tsx` | `exportChatToMarkdown` y acción «Exportar a Markdown (.md)». |
| Cartera | `GET /api/portfolio`, `usePortfolio`, `get_portfolio` | `app/api/portfolio/route.ts`, `lib/hooks/queries.ts` | Total, efectivo USDC, posiciones, costo promedio, P&L y `allocationPct`. |
| Precios | `GET /api/prices`, `usePrices` | `app/api/prices/route.ts` | Precio por acción y `change24hPct` por símbolo. |
| Historial | `GET /api/tickers/[symbol]/history`, `useHistory`, `useHistories` | `app/api/tickers/[symbol]/history/route.ts` | Series por rango (`1W`, `1M`, `3M`, `1Y`, `ALL`). |
| Catálogo | `GET /api/tickers`, `/api/market/search`, `useTickers`, `useMarketSearch` | `app/api/tickers/route.ts`, `app/api/market/search/route.ts` | Símbolos visibles, nombres, categorías y búsqueda con debounce. |
| Empresa | `GET /api/tickers/[symbol]/company` | `app/api/tickers/[symbol]/company/route.ts`, `lib/services/company-facts.supabase.ts` | Datos de SEC/EDGAR: sector, capitalización, P/E, dividendos, EPS, ingresos, utilidad, filings y fondo. |
| Tipo de cambio | `GET /api/fx/usdclp`, `useFx` | `app/api/fx/usdclp/route.ts` | USD/CLP con refresco cada 5 minutos. |
| Alertas | `GET/POST/DELETE /api/me/alerts` | `app/api/me/alerts/route.ts`, `components/domain/alert-client.tsx` | Alertas de precio por símbolo, dirección y umbral en US$; `usePriceAlerts`. |
| Favoritos | `GET/PUT /api/me/favorites` | `app/api/me/favorites/route.ts`, `lib/hooks/use-favorites.ts` | Lista local y de cuenta, con fusión y tope. |
| Preferencias | `GET/PUT /api/me/preferences` | `app/api/me/preferences/route.ts` | Notificaciones, idioma y moneda de visualización. |
| Consentimientos | `GET/POST /api/me/consents` | `app/api/me/consents/route.ts` | Términos, privacidad, riesgos y `us_person`. |
| Actividad | `GET /api/wallet/activity`, `useActivity` | `app/api/wallet/activity/route.ts` | Compras, ventas, depósitos, retiros y transferencias. |
| Mercado | `/api/market/status`, `/api/market/movers` | `app/api/market/status/route.ts`, `app/api/market/movers/route.ts` | Sesión de la bolsa y listas de mejores/peores del día. |
| Cotización | `POST /api/trade/quote`, `quoteTrade` | `app/api/trade/quote/route.ts`, `lib/api/client.ts` | Cotización con costos, precio por acción, expiración y, si aplica, CLP y tipo de cambio. |
| Límites | Política `ai`, `takeAiQuota`, `withRateLimit` | `lib/security/rate-limit.ts`, `lib/ai/limit.ts` | 20 solicitudes cada 10 minutos por usuario o IP; límites por ruta en `/api/me/*`. |

### 2.2 Cálculos existentes que conviene reutilizar

| Cálculo | Dónde | Uso |
|---|---|---|
| Salud y concentración simple | `components/domain/portfolio-health-card.tsx` | Efectivo vs invertido, cantidad de posiciones, mayor peso y etiqueta visual. Es una referencia de UI, no una recomendación. |
| Resultado y mejores/peores | `lib/portfolio/performance.ts` | `portfolioPerformance`, `periodPerformance`; respeta `null` cuando falta costo. |
| Serie de valor de cartera | `lib/portfolio/series.ts` | `portfolioValueSeries` alinea precios por tiempo para un gráfico de cartera. |
| Movimiento de un rango | `lib/market/series.ts` | `rangeMove` y utilidades de series. |
| Listas del día | `lib/market/movers.ts` | `TodayBoard`, gainers, losers, viewed y SPYx. |
| Fundamentales | `lib/market/fundamentals.ts` | `CompanyFactsView`, cálculos de capitalización, P/E y rendimiento. |

### 2.3 Brechas transversales

Antes de agregar funciones conviene resolver estas piezas comunes:

1. **Registro de herramientas.** Hoy `AI_TOOLS` y `executeToolCall` son una lista cerrada. Al crecer, hace falta una ficha por herramienta con nombre, descripción, parámetros, timeout, presupuesto, caché y política de escritura.
2. **Confirmación de escrituras.** El chat sólo lee. Alertas, memoria y cualquier acción con efecto necesitan un patrón de confirmación explícita y visible, no una tool que escribe «porque el modelo lo decidió».
3. **Fuentes estructuradas.** `SourcesList` existe en la transcripción, pero el contrato `AiChatResponse` sólo devuelve `text` y `widgets`; no hay un campo de fuentes con título, URL, medio y fecha.
4. **Contrato de widgets.** `AiWidget` no incluye preguntas de seguimiento, fuentes ni tablas de concentración. Agregar tipos es un cambio de contrato de widgets, no de la ruta HTTP.
5. **Memoria y consentimiento.** `preferencesSchema` es estricto y sólo cubre notificaciones, idioma y moneda. No hay tabla ni consentimiento para que el asistente recuerde preferencias.
6. **Proveedor de noticias.** No existe una fuente de noticias citables en el repositorio. Sin ella, el explicador de movimientos no puede afirmar causas.
7. **Evaluación.** Hay tests unitarios de piezas puras, pero no un banco de evaluación del asistente completo (prompt → tool → respuesta).
8. **Costo por herramienta.** El cupo `ai` es global; no hay presupuesto separado para cotizaciones, empresas o noticias.

---

## 3. Fichas de funciones

Cada ficha usa el mismo formato:

- **Prioridad:** P0 (antes de ampliar), P1 (siguiente ola), P2 (dependencia externa o revisión legal).
- **Estado:** «Ya existe», «Parcial» o «Falta».
- **Objetivo:** qué problema resuelve y qué NO promete.
- **Datos que ya existen:** hooks, rutas, servicios y cálculos reutilizables.
- **Qué falta:** la pieza concreta que habría que construir.
- **Riesgo / cumplimiento:** qué puede salir mal y cómo se acota.
- **Esfuerzo:** S (acotado), M (una o dos piezas nuevas con tests) o L (fuente, migración o revisión legal).

---

### F01 · Concentración y diversificación de la cartera

**Prioridad:** P0
**Estado:** Parcial. `get_portfolio` ya devuelve pesos y `portfolio-health-card` ya muestra una lectura simple.

**Objetivo.** Responder «¿qué tan concentrada está mi cartera?» con datos: peso de cada posición, cantidad de posiciones, efectivo, mayor peso y un índice de concentración explicado. La respuesta describe la composición; no dice qué hacer con ella.

**Datos que ya existen.**
- `GET /api/portfolio` / `usePortfolio` / tool `get_portfolio`: `totalUsd`, `cashUsdc`, `positions[].valueUsd`, `allocationPct`, `pnlPct`, `avgCostUsd`.
- `components/domain/portfolio-health-card.tsx`: cálculo de invertido vs efectivo, cantidad de posiciones y mayor posición.
- `lib/portfolio/performance.ts`: resultado y mejores/peores posiciones cuando hay costo.
- `useTickers`: nombres y categorías del catálogo.
- `GET /api/tickers/[symbol]/company`: sector de empresas, cuando existe fila en `company_facts`.

**Qué falta.**
- Funciones puras y testeadas: normalizar los pesos a proporción (0 a 1), HHI = suma de pesos al cuadrado, número efectivo de posiciones = 1 / HHI, top 1 y top 3, peso del efectivo, porcentaje fuera del top 3.
- Una tool `analyze_concentration` que devuelva JSON estructurado y un texto breve; un widget o tabla en la transcripción.
- Explicar la fórmula y sus límites. El HHI es una medida de reparto, no una medida de riesgo de mercado.
- Si se quiere sector: mapear `CompanyFactsView.sector` por símbolo. Cobertura parcial (ETFs y fondos no traen sector de cartera), por lo que la respuesta debe decir «cobertura parcial» y no inventar el resto.

**Riesgo / cumplimiento.** Medio. La concentración es un hecho, pero «estás concentrado» puede sonar a recomendación. Frases permitidas: «tu mayor posición pesa X %», «el efectivo representa Y %». Frases prohibidas: «deberías vender», «diversifica en…», «esto es riesgoso para ti». Si la persona pide qué hacer, ofrecer educación general y escenarios, no una cartera objetivo.

**Esfuerzo.** S. No requiere endpoint nuevo: se calcula sobre la cartera que ya carga el asistente.

---

### F02 · Comparación de acciones e índices adjuntos, con gráfico

**Prioridad:** P1
**Estado:** Parcial. `compare_stocks` y `CompareWidget` ya comparan hasta 4 activos con serie normalizada. El selector de contexto ya adjunta acciones, índices y cartera.

**Objetivo.** Que la persona adjunte dos o más activos con «+» y pida «compáralos»; el asistente usa el mismo rango, muestra un gráfico normalizado, una tabla de variación y los riesgos de comparar cosas distintas. No declara un «ganador» ni sugiere cuál comprar.

**Datos que ya existen.**
- Tool `compare_stocks` (`lib/ai/tools.ts`): hasta `MAX_COMPARE = 4`, puntos limpios con `MAX_POINTS = 64`.
- Widget `compare` y `CompareWidget` (`components/ai/widgets.tsx`): normaliza series, dibuja líneas y etiqueta el rango.
- `useHistories` / `GET /api/tickers/history` y `useHistory`: series por rango.
- `ContextPicker` y `context-types.ts` (T60): `ContextItem`, `MAX_CONTEXT_ITEMS = 6`, `INDEX_SYMBOLS` (`SPYx`, `QQQx`, `IWMx`, `VTIx`, `GLDx`).
- `useTickers` / `useMarketSearch`: resolución de nombres y símbolos.

**Qué falta.**
- Un camino determinista desde los chips adjuntos hasta `compare_stocks`. Hoy el contexto viaja como directiva de texto y el modelo podría ignorarla. Opciones: una acción «Comparar adjuntos» que agregue una instrucción explícita al mensaje, o una tool que lea los elementos del contexto. La primera no cambia el contrato HTTP.
- Resolver qué pasa con 5 o 6 elementos: la tool sólo acepta 4. Decidir si se comparan los primeros 4, se pide elegir o se hacen dos comparaciones.
- Verificar que los índices elegidos existan en el catálogo visible; si no, decirlo.
- Leyenda clara, mismo rango para todos y fecha/hora del último punto.

**Riesgo / cumplimiento.** Bajo/medio. Se puede afirmar «en el período X, A varió más que B»; no se puede decir «A es mejor inversión». Si se comparan un ETF y una acción individual, explicar que no son equivalentes. Mantener el aviso de que el rendimiento pasado no garantiza el futuro.

**Esfuerzo.** S. La mayor parte del gráfico y la tool ya existen; el trabajo es el enganche desde el contexto y los casos límite.

---

### F03 · «Mi cartera hoy»: resumen del día de mercado

**Prioridad:** P0
**Estado:** Falta. Existen cartera, precios, tipo de cambio y estado de mercado, pero no hay una tool que los combine en un resumen diario.

**Objetivo.** Entregar un snapshot breve: valor total, efectivo, variación estimada del día en US$ y CLP, mejores y peores posiciones, sesión de mercado y hora de corte. «Hoy» significa la ventana disponible de 24 horas o la última sesión, y así se explicita.

**Datos que ya existen.**
- `usePortfolio` / `GET /api/portfolio`: total, efectivo y posiciones.
- `usePrices(symbols)` / `GET /api/prices`: `priceUsd` y `change24hPct` por símbolo.
- `useFx` / `GET /api/fx/usdclp`: conversión a CLP.
- `useMarketStatus` / `GET /api/market/status`: sesión regular, fuera de horario o cerrada.
- `GET /api/market/movers`: mejores y peores del mercado, no de la cartera.
- `lib/portfolio/performance.ts`: P&L histórico y mejores/peores por costo.
- `lib/format.ts`: formatos de US$, CLP, porcentaje y acciones.

**Qué falta.**
- Tool `get_portfolio_today`: carga cartera y precios de sus símbolos; calcula variación diaria aproximada como `valor actual × change24hPct` (el campo es un ratio: 0,012 = 1,2 %), no como P&L exacto.
- Añadir `fx` a las dependencias del asistente (`getServices().prices.fx`) para expresar el total en CLP con la tasa y su hora.
- Widget o tabla «Mi cartera hoy» con: total, efectivo, variación estimada, top 3, peores 3, sesión y timestamp.
- Si el mercado está cerrado o fuera de horario, decirlo y mostrar el último precio disponible; no presentar el cambio como «de hoy» si la serie es de otra sesión.
- Tests con cartera vacía, sin precios, sin FX y con mercado cerrado.

**Riesgo / cumplimiento.** Medio. La variación diaria calculada con el valor actual es una aproximación, no un P&L contable; debe rotularse «estimación». No se promete que el precio de compra/venta sea el mostrado. Fuera del horario regular el precio puede variar más. No convertir la variación en una predicción ni en una recomendación.

**Esfuerzo.** M. La tool es acotada, pero hay que cuidar la semántica de «hoy», los datos faltantes y la conversión a CLP.

---

### F04 · Explicador de movimientos, con fuentes

**Prioridad:** P2
**Estado:** Falta. Hay precios y series, pero no una fuente de noticias citables.

**Objetivo.** Explicar por qué se movió una acción o un índice, separando tres cosas: el dato de precio, la explicación verificable con fuente y la hipótesis no confirmada. Si no hay fuente, la respuesta dice que no la tiene.

**Datos que ya existen.**
- `GET /api/prices`, `GET /api/tickers/[symbol]/history`, `usePrices`, `useHistory`.
- `GET /api/market/movers` para el contexto del día.
- `GET /api/tickers/[symbol]/company`: filings de SEC y `sourceUrl`; sirve para eventos corporativos documentados, no para noticias del día.
- `SourcesList` en `components/ai/tool-accordion.tsx`: puede mostrar una lista de fuentes, hoy como strings.

**Qué falta.**
- Un proveedor de noticias con licencia o una fuente pública que permita citar título, medio, URL y fecha. No existe en el repositorio.
- Servicio de servidor con caché, timeout y límite de resultados; normalización de duplicados.
- Contrato de fuentes estructuradas (`title`, `url`, `publisher`, `publishedAt`) y render en la transcripción. `SourcesList` acepta strings; habría que ampliarlo.
- Política de respuesta: primero «qué pasó» (precio y volumen), después «qué se sabe» (fuente), después «qué no se sabe». Nunca afirmar causalidad por correlación.
- Revisión de derechos de autor y de atribución antes de reproducir titulares.

**Riesgo / cumplimiento.** Alto. Es la función con más riesgo de inventar una causa. Prohibido decir «subió porque…» sin una fuente concreta. Si la fuente es un rumor o una red social, etiquetarlo como no verificado. Si no hay fuente, la respuesta correcta es «no tengo una fuente verificable para este movimiento». También hay riesgo de sesgo: una noticia no explica todo el movimiento.

**Esfuerzo.** L. Depende de un proveedor externo, un contrato nuevo y revisión legal.

---

### F05 · Simulador «¿qué pasa si compro X?»

**Prioridad:** P1
**Estado:** Falta. El flujo de cotización existe, pero el asistente no lo usa para simular.

**Objetivo.** Mostrar la aritmética de una compra hipotética: monto en US$ o CLP, precio por acción, cantidad de acciones, costos, total estimado, vuelto y vigencia de la cotización. Es una simulación; no crea una orden ni reserva fondos.

**Datos que ya existen.**
- `POST /api/trade/quote` y `quoteTrade` (`lib/api/client.ts`).
- `tradeQuoteSchema`: `pricePerShareUsd`, `inAmountUi`, `outAmountUi`, `costs`, `expiresAt`, y opcionales `fx` y `estimatedTotalClp`.
- `tradeQuoteRequestSchema`: permite `amountCurrency` `USDC`, `SHARES` o `CLP`.
- `useFx` / `GET /api/fx/usdclp` para mostrar la equivalencia.
- `usePortfolio` para el efectivo disponible.
- `apiOperateBlock` y los límites `trade`/`tradeIp` de la ruta de cotización.
- El motor live acepta `{ persist: false }` para valoraciones internas; la propia ruta lo usa para calcular el notional de los topes.

**Qué falta.**
- Tool `simulate_buy` que obtenga una cotización de sólo lectura. Dos caminos posibles: reutilizar el servicio de cotización con `persist: false` (sin guardar una cotización que nadie va a ejecutar) o usar la ruta existente en cuenta demo. En ambos casos se deben replicar las puertas: geobloqueo, sesión, símbolo visible y límites.
- Tarjeta de simulación con etiqueta «Simulación, no es una orden», monto, precio, acciones, costos, total, vuelto y hora de expiración.
- Si el monto es en CLP, mostrar la tasa usada y su fecha.
- Manejo de errores: símbolo no operable, cotización expirada, monto fuera de rango, geobloqueo, cuenta real con operación deshabilitada.

**Riesgo / cumplimiento.** Alto. Una simulación puede confundirse con una orden o con una recomendación. Reglas: no llamar a `/api/trade/build` ni `/api/trade/submit`; no firmar; no pedir wallet; no decir «te conviene comprar»; no garantizar el precio de ejecución; advertir que la cotización expira y que los costos pueden cambiar. En cuenta real, respetar `REAL_TRADING_READY` y el NO GO de dinero real; no encender flags para habilitar esta función.

**Esfuerzo.** M. La cotización ya existe; el trabajo es la tool de sólo lectura, la tarjeta y las puertas de seguridad.

---

### F06 · Alertas de precio por chat

**Prioridad:** P1
**Estado:** Parcial. La API y el cliente de alertas existen; falta la conversación.

**Objetivo.** Crear, listar y eliminar alertas de precio conversando: «avísame si NVDAx supera US$…», «¿qué alertas tengo?», «borra la de TSLAx». La acción de escritura se confirma antes de ejecutarse.

**Datos que ya existen.**
- `GET/POST/DELETE /api/me/alerts` (`app/api/me/alerts/route.ts`).
- `priceAlertSchema`, `priceAlertCreateSchema`, `priceAlertDeleteSchema` (`lib/api/contracts.ts`): símbolo, dirección `above`/`below`, precio en US$ positivo.
- `components/domain/alert-client.tsx`: `listPriceAlerts`, `createPriceAlert`, `deletePriceAlert`, `usePriceAlerts`.
- `requireSession` y `withRateLimit("me")` en la ruta.
- `tradableSymbolSchema` para validar el símbolo.
- `useFx` para mostrar el umbral también en CLP, si la persona lo pide en pesos.

**Qué falta.**
- Tools `list_alerts`, `create_alert` y `delete_alert`, con la misma sesión y los mismos límites de `/api/me/alerts`.
- Tarjeta de confirmación para crear: símbolo, nombre, dirección, umbral en US$ (y equivalente en CLP si corresponde), botones «Crear alerta» y «Cancelar». Sin confirmación no se escribe.
- Resolución de lenguaje natural: «sobre», «por encima», «bajo», «baje de»; si hay ambigüedad, preguntar antes de confirmar.
- Listado con estado (`active`, `triggeredAt`) y opción de eliminar.
- Mensajes de éxito y error; no prometer un canal de aviso que no exista. La entrega depende del cron/servicio de alertas ya presente.

**Riesgo / cumplimiento.** Alto por ser escritura. Requiere sesión, same-origin (la ruta de chat ya lo valida), límite por usuario y confirmación explícita. No crear alertas a partir de una frase ambigua ni de una sugerencia del modelo. Una alerta es informativa: no es una recomendación de compra ni una predicción. No usar la alerta para inducir una operación.

**Esfuerzo.** M. La API está resuelta; el trabajo es el patrón de confirmación y el parseo seguro.

---

### F07 · Watchlist inteligente desde favoritos

**Prioridad:** P1
**Estado:** Parcial. Favoritos y precios existen; falta la vista conversacional.

**Objetivo.** Resumir la lista de favoritos: cómo se movieron hoy, cómo van en el rango elegido, cómo se reparten por categoría y cuáles concentran el movimiento. «Inteligente» significa contextual y determinista, no predictiva.

**Datos que ya existen.**
- `GET/PUT /api/me/favorites` y `useFavorites`: lista local y de cuenta, fusión y tope.
- `useTickers` y `useMarketSearch`: nombres, categorías y búsqueda.
- `usePrices` y `useHistories`: precios y series de los favoritos.
- `GET /api/market/movers`: referencia del mercado, no de la lista.
- `lib/market/movers.ts`: cálculos de variación diaria.

**Qué falta.**
- Tool `get_watchlist` que lea los favoritos de la sesión con `services.users.listFavorites` (misma fuente que la ruta), o una directiva de cliente con los símbolos. Preferir la tool para que funcione aunque el cliente no los envíe.
- Widget/tabla con símbolo, nombre, precio, variación y rango; estado vacío claro.
- Agrupación por categoría del catálogo; explicar que la categoría es del catálogo y puede no cubrir todos los activos.
- Si hay favoritos que ya no están en el catálogo visible, omitirlos y decirlo.

**Riesgo / cumplimiento.** Medio. Los favoritos son datos personales; no se comparten ni se usan para inferir un perfil. No rankear como «las mejores» ni decir «deberías mirar». Se puede decir «las que más subieron de tu lista en el período». No convertir la watchlist en una cartera simulada sin consentimiento.

**Esfuerzo.** S. Todo el dato existe; es una tool de lectura y una tabla.

---

### F08 · Análisis fundamental con datos reales

**Prioridad:** P1
**Estado:** Parcial. La ficha de empresa existe; el asistente no la consulta.

**Objetivo.** Explicar los fundamentales de una empresa o fondo con cifras reales, su fecha y su fuente: sector, capitalización, P/E, dividendos, EPS, ingresos, utilidad, filings y principales posiciones de un fondo. Traducir qué significan los ratios, sin convertirlos en una recomendación.

**Datos que ya existen.**
- `GET /api/tickers/[symbol]/company` (`app/api/tickers/[symbol]/company/route.ts`).
- `readCompanyForSymbol` (`lib/services/company-facts.supabase.ts`) y tabla `company_facts`.
- `CompanyFactsView` (`lib/market/fundamentals.ts`): `sector`, `marketCapUsd`, `pe`, `dividendYield`, `epsTtm`, `revenueTtm`, `netIncomeTtm`, `last10k`, `last10q`, `lastFilingForm`, `fundTopHoldings`, `sourceUrl`, `updatedAt`.
- `components/domain/company-card.tsx`: ejemplo de lectura y presentación; hoy hace `fetch` directo, no se debe copiar ese patrón en componentes nuevos.
- `CompanyCard` y `empresaCopy`: textos y formato existentes.

**Qué falta.**
- Tool `get_company_facts` que llame a `readCompanyForSymbol` en el servidor y devuelva sólo campos presentes, con `sourceUrl` y `updatedAt`.
- Render de fuentes y fecha en la respuesta; `SourcesList` puede reutilizarse si se amplía a fuentes estructuradas.
- Manejo de 404: «no hay ficha para este símbolo», sin inventar.
- Distinguir `company`, `foreign` y `fund`: un ETF no tiene EPS ni P/E de la misma forma; un fondo muestra tenencias.
- Advertir que las acciones en circulación viejas no entran en la capitalización (la librería usa un límite de edad) y que los datos pueden estar desactualizados.

**Riesgo / cumplimiento.** Medio. Los ratios no son una recomendación. Prohibido decir «está barata», «es una buena compra» o «va a subir». Se puede explicar «el P/E relaciona precio y utilidad; un P/E alto puede reflejar expectativas o distorsiones». Siempre mostrar fuente y fecha. No comparar empresas de sectores distintos sin advertirlo.

**Esfuerzo.** M. El dato está; el trabajo es la tool, la selección de campos y la citación.

---

### F09 · Calculadora DCA y aportes mensuales en CLP

**Prioridad:** P1
**Estado:** Parcial. Hay tipo de cambio y cotización en CLP; falta la calculadora y su explicación.

**Objetivo.** Calcular un aporte hipotético: «si aporto $X CLP al mes, a este precio y tipo de cambio, ¿cuántas fracciones compraría y cuánto quedaría sin invertir?». Opcionalmente, mostrar un ejercicio histórico con aportes pasados, siempre rotulado como hipótesis.

**Datos que ya existen.**
- `GET /api/fx/usdclp` y `useFx`: tasa USD/CLP con refresco de 5 minutos.
- `quoteTrade` y `POST /api/trade/quote`: precio por acción, costos, `fx` y `estimatedTotalClp`; acepta `amountCurrency: "CLP"`.
- `useHistory` / `GET /api/tickers/[symbol]/history`: serie para un ejercicio histórico.
- `lib/format.ts`: CLP, US$, acciones y porcentajes.

**Qué falta.**
- Funciones puras `dcaPlan({ amountClp, fxRate, priceUsd, feeBps })` y `dcaHistory({ contributions, series })`, con tests de redondeo y de datos faltantes.
- Tarjeta con: aporte en CLP, equivalente en US$, precio usado, acciones estimadas, costos, total y vuelto. Mostrar la tasa y su hora.
- Definir si el aporte es único o mensual. Si es mensual, mostrar el supuesto («mismo monto y mismo precio cada mes») y no proyectar precios futuros.
- Ejercicio histórico sólo si hay serie suficiente; etiquetar «simulación con datos pasados, no rentabilidad futura».

**Riesgo / cumplimiento.** Medio. El cálculo puede parecer una promesa de acumulación. Reglas: no usar una tasa de retorno esperada; no decir «vas a tener»; no omitir costos; no asumir que el precio se mantiene. El tipo de cambio y las comisiones cambian. Si la persona pide «cuánto debería aportar», responder que no se entrega asesoría personalizada y ofrecer la aritmética de los montos que ella elija.

**Esfuerzo.** S. No requiere endpoint nuevo; es cálculo puro y UI.

---

### F10 · Escenarios de riesgo y volatilidad

**Prioridad:** P2
**Estado:** Falta. Hay series históricas y utilidades de cartera, pero no medidas de riesgo.

**Objetivo.** Describir el riesgo histórico de un activo o de la cartera: volatilidad, caída máxima, sensibilidad aproximada frente a SPYx y concentración. Opcionalmente, un escenario mecánico: «si SPYx cae 10 %, tu cartera se movería aproximadamente X % bajo estos supuestos». No es un pronóstico ni una probabilidad.

**Datos que ya existen.**
- `GET /api/tickers/[symbol]/history` con rangos `1W`, `1M`, `3M`, `1Y`, `ALL`; `useHistory`, `useHistories`.
- `lib/portfolio/series.ts`: `portfolioValueSeries` para construir el valor de la cartera en el tiempo.
- `lib/portfolio/performance.ts`: `periodPerformance`.
- `lib/market/series.ts`: `rangeMove` y utilidades de series.
- `usePortfolio` y `usePrices`: pesos y valores actuales.
- SPYx como referencia de mercado en `lib/market/movers.ts` (`SPY_SYMBOL`).

**Qué falta.**
- Funciones puras: retornos diarios, desviación estándar anualizada, caída máxima, beta contra SPYx, correlación y sensibilidad simple.
- Tests con series cortas, precios repetidos, huecos y datos no finitos.
- Tarjeta de escenario con supuestos visibles: período usado, frecuencia, moneda, que la beta es histórica y puede cambiar.
- Advertencia cuando la serie es demasiado corta o el activo es poco líquido: no calcular o mostrar «sin datos suficientes».

**Riesgo / cumplimiento.** Medio/alto. Un escenario puede leerse como predicción. Usar «sensibilidad mecánica bajo supuestos», no «va a caer». No asignar probabilidades sin un modelo validado. No decir «tu cartera es segura/riesgosa para ti». No usar el escenario para recomendar coberturas ni cambios de cartera.

**Esfuerzo.** M. Cálculo y tests son acotados; el diseño de los supuestos y del copy es la parte delicada.

---

### F11 · Resumen tributario informativo

**Prioridad:** P2
**Estado:** Falta. Hay actividad y costo promedio, pero no lotes fiscales ni reglas tributarias.

**Objetivo.** Entregar un resumen informativo de la actividad del período y de los eventos que podrían tener relevancia tributaria, con un listado de datos faltantes. No calcula impuestos, no presenta formularios y no reemplaza a un contador.

**Datos que ya existen.**
- `GET /api/wallet/activity` y `useActivity`: compras, ventas, depósitos, retiros y transferencias.
- `GET /api/portfolio`: `avgCostUsd`, `pnlUsd`, `pnlPct` por posición.
- `GET /api/fx/usdclp`: conversión de referencia.
- `useFx`, `format`, y los tipos `Activity` y `Position`.
- `GET /api/me/consents`: consentimientos existentes, no tributarios.

**Qué falta.**
- Reglas tributarias chilenas aplicables a la compra/venta de acciones extranjeras tokenizadas, revisadas por abogado y contador. No incluirlas en el producto hasta esa revisión.
- Lotes fiscales y método de costo (FIFO u otro). `avgCostUsd` es un promedio de cartera, no un lote fiscal.
- Separar realizado de no realizado; hoy `pnlUsd` es mark-to-market, no una ganancia realizada.
- Fechas de adquisición, ventas, retiros, depósitos y conversiones de tipo de cambio del día de cada operación.
- Formato de resumen descargable y texto `[REVISIÓN ABOGADO]` visible.

**Riesgo / cumplimiento.** Alto. No inventar tasas, tramos, formularios ni obligaciones. No afirmar que una operación «no paga impuestos». No ayudar a evadir. La función debe declarar que es informativa, que puede estar incompleta y que requiere revisión profesional. Privacidad: el resumen contiene datos financieros sensibles.

**Esfuerzo.** L. Depende de revisión legal/contable y de datos que hoy no existen (lotes, realizado).

---

### F12 · Lectura de capturas de cartera

**Prioridad:** P1
**Estado:** Parcial. El import por imagen ya existe como flujo separado; el chat acepta imágenes, pero no las conecta al import.

**Objetivo.** Leer una captura de cartera, mostrar una vista previa editable, emparejar símbolos con el catálogo y permitir guardar las posiciones como **seguimiento externo** o como favoritos. No es una compra, no acredita tokens y no reemplaza la cartera de la billetera.

**Datos que ya existen.**
- `POST /api/ai/import-portfolio` (`app/api/ai/import-portfolio/route.ts`): JPG/PNG hasta ~4 MB, visión de xAI, no guarda la foto.
- `components/ai/import/import-preview.tsx`: vista previa editable, «Agregar a mi cartera» y «Agregar a favoritos».
- `lib/portfolio/external-holdings.ts`: `saveExternalHoldings`, almacenamiento en cuenta o dispositivo, tabla `external_holdings` si existe.
- `components/ai/import/ticker-field.tsx`: corrección de símbolo.
- El chat ya acepta `image` y `runChat` la envía como parte del último mensaje del usuario.

**Qué falta.**
- Decidir el enrutamiento: si la imagen es una captura de cartera, derivarla al flujo de import antes de llamar al chat general; si es otra imagen, seguir el chat normal. Evitar pagar dos veces la misma imagen.
- Renderizar `import-preview` dentro de la conversación (el tipo ya existe en `AiWidget`, pero el flujo de import es una ruta aparte).
- Aviso de privacidad antes de enviar: la imagen sale a xAI, no se guarda en disco ni en la base.
- Confirmación explícita antes de guardar; permitir editar cantidades y descartar filas.
- Distinguir «seguimiento externo» de «saldo de la billetera» en todo el copy.

**Riesgo / cumplimiento.** Alto por privacidad y exactitud. La imagen puede contener datos personales; no persistirla, no loguearla y no usarla para otro fin. El OCR puede equivocarse: nunca guardar sin confirmación. No convertir una captura en una orden ni sugerir comprar lo que aparece. Si el símbolo no está en el catálogo, no inventarlo.

**Esfuerzo.** S. El flujo de import y la vista previa ya existen; el trabajo es integrarlo a la conversación y el consentimiento.

---

### F13 · Preguntas de seguimiento interactivas

**Prioridad:** P1
**Estado:** Parcial. `InteractiveQuestionCard` existe, pero no está conectada a la respuesta del asistente.

**Objetivo.** Después de una respuesta, ofrecer 2 a 4 preguntas de seguimiento relevantes, respondibles con los datos disponibles. La persona toca una y se envía como siguiente turno.

**Datos que ya existen.**
- `InteractiveQuestionCard` (`components/ai/interactive-question-card.tsx`): `question`, `options[]`, `allowCustom`, `onSubmit`, `onSkip`.
- `AiWidget` (`components/ai/contract.ts`) y el render de widgets en `transcript.tsx`.
- El envío de mensajes del compositor y el estado de la conversación.
- `buildSystemPrompt` para la política de cuándo preguntar.

**Qué falta.**
- Un tipo de widget `question` o un campo `followUps` en la respuesta; hoy el contrato sólo tiene `text` y `widgets`.
- Política del servidor: máximo una tarjeta por turno, entre 2 y 4 opciones, sólo si la respuesta deja una pregunta natural; no preguntar para alargar la conversación.
- Render en la transcripción y handler que transforme la opción en un mensaje de usuario.
- Accesibilidad: foco, teclado, `aria-label`, opción de omitir; i18n es-CL/en.
- Evitar opciones que induzcan una compra o una decisión personalizada.

**Riesgo / cumplimiento.** Bajo/medio. Las opciones pueden sesgar la conversación. Deben ser informativas y no incluir «compra ahora» ni «¿quieres invertir?». Si una opción requiere un dato que no existe, no ofrecerla. No usar la tarjeta para recolectar datos personales sin consentimiento.

**Esfuerzo.** S. El componente está; falta el contrato y el enganche.

---

### F14 · Memoria de preferencias con consentimiento

**Prioridad:** P2
**Estado:** Parcial. Hay preferencias y consentimientos, pero no memoria del asistente.

**Objetivo.** Recordar preferencias explícitas de la persona —idioma, moneda de visualización, modo principiante, sectores o activos que sigue— para no preguntarlas de nuevo. La memoria es visible, editable y eliminable. No se infieren preferencias ni se crea un perfil de riesgo oculto.

**Datos que ya existen.**
- `GET/PUT /api/me/preferences` y `usePrefs`: `notifyOrders`, `notifyDeposits`, `notifyNews`, `language`, `displayCurrency`.
- `GET/POST /api/me/consents` y `useConsents`: documentos `terminos`, `privacidad`, `riesgos`, `us_person`.
- `useSession` y el aislamiento por usuario del chat.
- `useFavorites` como señal explícita de interés, no como preferencia inferida.

**Qué falta.**
- Definir el alcance: ¿basta con `language` y `displayCurrency`, o se agregan `beginnerMode`, `followedSectors` y `lastRange`? Cualquier campo nuevo exige actualizar `preferencesSchema` (hoy `.strict()`) y su migración.
- Consentimiento específico de memoria: qué se guarda, para qué, dónde, por cuánto tiempo y cómo se borra. Los documentos actuales no cubren memoria del asistente.
- UI «Lo que el asistente recuerda de ti» con edición y borrado.
- Retención y borrado al eliminar la cuenta; no guardar memoria en logs ni en el historial de conversaciones sin control.
- No usar un «perfil de riesgo» autodeclarado para dar consejos personalizados. Si se guarda, es contexto declarado, no una autorización para recomendar.

**Riesgo / cumplimiento.** Alto en privacidad. Aplicar minimización, finalidad, consentimiento informado y derecho a eliminar. La memoria no puede convertirse en un perfil comercial ni en una base para segmentar publicidad. Revisar el marco chileno de protección de datos personales y la política de privacidad con `[REVISIÓN ABOGADO]`.

**Esfuerzo.** M. Si se reutiliza `preferences` con dos o tres campos y consentimiento, es acotado; si se crea una tabla de memoria con historial y borrado, sube a L.

---

### F15 · Modo «explícame como principiante»

**Prioridad:** P1
**Estado:** Falta. El system prompt es claro, pero no hay un modo explícito.

**Objetivo.** Explicar el mismo contenido con lenguaje simple: qué es una acción tokenizada, qué significa un porcentaje, qué es un costo, qué es un rango, qué no está incluido. Usa los mismos datos y los mismos riesgos; no simplifica hasta omitir advertencias.

**Datos que ya existen.**
- `buildSystemPrompt` (`lib/ai/system-prompt.ts`) y las reglas de estilo.
- `applyDirectives` en `asistente-screen.tsx`: hoy agrega instrucciones al último mensaje sin cambiar el contrato HTTP.
- `copy` de `content/i18n/extra-asistente.ts` y los textos de ayuda.
- Los widgets y tablas existentes, que pueden acompañarse de una explicación breve.

**Qué falta.**
- Un toggle visible en el compositor o en el menú, con estado accesible.
- Una directiva de prompt («Explica como si la persona nunca hubiera invertido; define cada término; usa ejemplos con los datos de esta respuesta») que no cambie el contrato HTTP.
- Glosario corto y consistente: acción, fracción, xStock, USDC, spread, comisión, rango, P&L.
- Tests que verifiquen que el modo no altera cifras ni elimina el aviso legal.

**Riesgo / cumplimiento.** Bajo. El riesgo es que la simplificación se lea como una recomendación o que omita riesgos. Mantener las advertencias, no usar «es fácil» ni «todos ganan», y no prometer resultados. El modo no debe cambiar los datos ni la fuente.

**Esfuerzo.** S.

---

### F16 · Exportar análisis a PDF y Markdown

**Prioridad:** P1
**Estado:** Parcial. Markdown de la conversación ya existe; PDF y export estructurado, no.

**Objetivo.** Exportar un análisis o una conversación con fecha, fuentes, tablas, gráficos y el aviso de que es informativo. Markdown para reutilizar; PDF para compartir o archivar.

**Datos que ya existen.**
- `exportChatToMarkdown` en `components/ai/sessions-store.ts`.
- `onExportMarkdown` en `AssistantNavbar` (menú «Exportar a Markdown (.md)»).
- `transcript.tsx` y los widgets: la información visible ya está estructurada.
- `copy.adviceNotice` y el disclaimer del servidor.

**Qué falta.**
- Un exportador que incluya los widgets como tablas o SVG, no sólo el texto del chat.
- PDF mediante `window.print()` con hoja de impresión dedicada, sin agregar dependencias; si se requiere un PDF generado en servidor, evaluar la dependencia y anotarla en `PROGRESO.md` antes de instalarla.
- Encabezado con fecha, rango de datos, fuentes y aviso; pie con «No es recomendación de inversión».
- Nombre de archivo estable y advertencia de que el archivo contiene datos personales de la cartera.
- Tests de que el Markdown conserva el aviso y no inventa secciones.

**Riesgo / cumplimiento.** Bajo/medio. Un archivo exportado puede circular sin contexto. Incluir siempre el aviso, la fecha y las fuentes. No subir el archivo a un servidor ni a un tercero. Si se exporta una cartera, advertir que contiene datos financieros personales.

**Esfuerzo.** S para Markdown y print-to-PDF; M si se busca un PDF diseñado con gráficos vectoriales.

---

### F17 · Comandos con «/» y menciones con «@NVDAx»

**Prioridad:** P1
**Estado:** Parcial. El selector de contexto agrega activos; no hay parser de comandos ni menciones.

**Objetivo.** Escribir `/cartera`, `/comparar`, `/alerta`, `/dca`, `/principiante` o `/exportar` para iniciar una acción, y `@NVDAx` para mencionar un activo y agregarlo al contexto. El autocompletado muestra sólo activos del catálogo.

**Datos que ya existen.**
- `useMarketSearch` (debounce 250 ms, mínimo 2 letras) y `useTickers`.
- `ContextPicker` y `context-types.ts`: agregar/quitar contexto, tope 6.
- El compositor y el envío de mensajes.
- `INDEX_SYMBOLS` para índices.
- Las acciones de `AssistantNavbar` (nuevo chat, buscar, exportar) que pueden mapearse a comandos.

**Qué falta.**
- Parser que active comandos sólo al inicio del mensaje o después de un espacio, para no romper URLs ni texto normal.
- Registro de comandos con etiqueta, descripción, icono, acción y si requiere confirmación.
- Menú de autocompletado con teclado (flechas, Enter, Escape), `aria-activedescendant` y anuncio de resultados.
- Menciones `@`: búsqueda en catálogo, selección, chip de contexto y límite de 6; no permitir símbolos fuera del catálogo.
- Comandos de escritura (`/alerta`) pasan por la tarjeta de confirmación de F06; nunca escriben directo.
- i18n es-CL/en y tests de parser.

**Riesgo / cumplimiento.** Bajo/medio. Un comando mal parseado puede enviar una pregunta incompleta o crear una alerta no deseada. Los comandos no pueden saltarse el aviso legal ni las reglas de consejo. `@` sólo resuelve activos visibles; si no hay coincidencia, decirlo.

**Esfuerzo.** M. Es interfaz y parser, con bastantes casos límite de accesibilidad.

---

### F18 · Atajos de teclado

**Prioridad:** P2
**Estado:** Parcial. Hay `⌘K` para buscar chats, Escape en modales y Enter para enviar; no hay mapa global.

**Objetivo.** Permitir trabajar sin mouse: enviar, nueva conversación, buscar, enfocar el compositor, abrir contexto, abrir ayuda y cerrar. Los atajos se descubren con `?`.

**Datos que ya existen.**
- `⌘K` en el buscador de chats (`nav-chats.tsx`).
- Manejo de Escape en navbar, selector de contexto, modales y menús.
- Enter/Shift+Enter en el compositor.
- `aria-label` y roles existentes.

**Qué falta.**
- Un registro central de atajos con `event.key`, `metaKey`/`ctrlKey`, alcance y descripción.
- Ayuda `?` con lista de atajos, sin abrirse mientras se escribe en un campo.
- Evitar conflictos con navegador, sistema operativo y lectores de pantalla; no usar letras sueltas dentro de inputs.
- Foco visible y restauración del foco al cerrar.
- Alternativa móvil para cada acción; los atajos no pueden ser la única vía.

**Riesgo / cumplimiento.** Bajo. El riesgo es apropiarse de un atajo del navegador o romper la escritura. Documentar y permitir desactivar los atajos personalizados.

**Esfuerzo.** S.

---

### F19 · Límites y rate limiting

**Prioridad:** P0
**Estado:** Parcial. El cupo global del asistente existe; no hay presupuestos por herramienta.

**Objetivo.** Mantener la latencia, el costo y el abuso bajo control cuando el asistente tenga más herramientas y más llamadas externas. Cada herramienta declara timeout, caché, límite y comportamiento cuando se agota.

**Datos que ya existen.**
- `RATE_LIMIT_POLICIES.ai` en `lib/security/rate-limit.ts`: 20 solicitudes cada 10 minutos por usuario o IP.
- `takeAiQuota` (`lib/ai/limit.ts`) y `withRateLimit`.
- `MAX_TOOL_ROUNDS = 4` y `MAX_CALLS_PER_ROUND = 6` en `lib/ai/run-chat.ts`.
- `AI_MAX_IMAGE_CHARS` y `AI_MAX_BODY_BYTES` en `lib/ai/schema.ts` (~4 MB de imagen).
- Límites `trade`, `tradeIp` y `me` para cotizaciones y alertas.
- `SENSITIVE_RATE_LIMIT_POLICIES`: las políticas sensibles fallan cerrado si no hay backend global.

**Qué falta.**
- Presupuesto por herramienta: por ejemplo, cuántas cotizaciones, lecturas de empresa o búsquedas de noticias por conversación y por usuario. Los números se definen con costo real medido, no a ojo.
- Caché por fuente: empresa ~1 hora (la ruta ya usa `s-maxage=3600`), FX 5 minutos, precios segundos; no repetir la misma consulta dentro del mismo turno.
- Timeout y circuit breaker por proveedor; respuesta degradada («no pude consultar…») en vez de colgar la conversación.
- Concurrencia máxima y cola para trabajos lentos; no abrir una llamada por cada símbolo si se puede hacer un lote.
- Métricas de llamadas, tokens, latencia y errores por herramienta; alertas de costo.
- Mensajes 429 claros con `Retry-After` y qué puede hacer la persona mientras espera.
- Revisar el cupo global si se agregan herramientas costosas; no aumentarlo sin medir.

**Riesgo / cumplimiento.** Medio. Un límite mal puesto bloquea a usuarios legítimos; uno ausente multiplica el costo. Las políticas sensibles deben fallar cerrado. No usar la rate limit como excusa para degradar la privacidad ni para retener datos.

**Esfuerzo.** M. Es infraestructura transversal, no una pantalla.

---

### F20 · Evaluación de calidad del asistente (evals)

**Prioridad:** P0
**Estado:** Parcial. Hay tests unitarios de herramientas y widgets; no hay un banco de evaluación del asistente completo.

**Objetivo.** Medir, antes y después de cada función, si el asistente usa la herramienta correcta, si las cifras son trazables, si cita fuentes, si rechaza consejos personalizados y si no inventa datos. También medir latencia y costo.

**Datos que ya existen.**
- `runChat` acepta dependencias inyectables (`AssistantDeps`) y un `complete` alternativo; eso permite pruebas deterministas.
- `AI_TOOLS` y `executeToolCall` son testeables por separado.
- Tests existentes en `tests/unit/ai-*` y datos de `lib/mocks/`.
- `buildSystemPrompt` y `withDisclaimer` para verificar el aviso.

**Qué falta.**
- Un conjunto dorado de prompts en es-CL y en, con: pregunta, herramientas esperadas, widgets esperados, cifras que deben aparecer, cifras que no deben aparecer y resultado de cumplimiento.
- Fixtures de cartera, precios, historial, empresa, alertas y favoritos; nada de datos personales reales.
- Chequeos deterministas: ¿se llamó a la tool correcta?, ¿el widget tiene los símbolos correctos?, ¿cada número aparece en la fuente?, ¿se incluyó el aviso?, ¿se rechazó una pregunta de consejo?
- Evaluación con LLM como juez sólo para lo subjetivo (claridad, tono), con revisión humana por muestreo y sesgo conocido.
- Runner en CI con presupuesto de tiempo y costo; comparación contra la línea base.
- Casos de regresión para cada ficha de esta hoja antes de marcarla como terminada.

**Riesgo / cumplimiento.** Medio. Un juez automático puede premiar respuestas plausibles pero falsas; por eso los chequeos de cifras y fuentes deben ser deterministas. No usar conversaciones reales sin consentimiento. No convertir los evals en una promesa de calidad absoluta.

**Esfuerzo.** M. La infraestructura de inyección ya existe; el trabajo es el conjunto de casos y el runner.

---

## 4. Secuencia recomendada

No son fechas ni compromisos. Es orden de dependencia: lo que hay que resolver antes de que la siguiente capa sea segura.

### Fase 0 — Fundaciones

**F19 (límites)** y **F20 (evals)**, más el patrón de confirmación para escrituras.

Criterio de salida: cada herramienta nueva tiene timeout, caché, presupuesto y al menos un caso de evaluación; las escrituras no ocurren sin confirmación.

### Fase 1 — Lectura de alto valor

**F01 (concentración)**, **F03 («Mi cartera hoy»)**, **F15 (principiante)**, **F02 (comparación adjunta)**, **F16 (export)** y **F17 (comandos/menciones)**.

Criterio de salida: todas las cifras provienen de rutas existentes; no se agregó un proveedor externo; el aviso legal sigue visible.

### Fase 2 — Herramientas con datos existentes

**F05 (simulador)**, **F06 (alertas)**, **F07 (watchlist)**, **F08 (fundamentales)**, **F09 (DCA)**, **F12 (capturas)** y **F13 (seguimiento)**.

Criterio de salida: la simulación no ejecuta órdenes; las alertas se confirman; la captura no se guarda sin confirmación; las fuentes y fechas son visibles.

### Fase 3 — Dependencias externas o revisión legal

**F04 (movimientos con fuentes)**, **F10 (riesgo/volatilidad)**, **F11 (tributario)**, **F14 (memoria)** y **F18 (atajos)**.

Criterio de salida: proveedor de noticias licenciado o descartado; revisión `[REVISIÓN ABOGADO]` para tributos y memoria; escenarios rotulados como sensibilidad, no pronóstico.

---

## 5. Decisiones pendientes

1. **Proveedor de noticias.** Sin una fuente citable no se puede implementar F04. Hay que decidir licencia, costo, cobertura de Chile/EE.UU. y política de atribución.
2. **Tributario.** F11 no avanza hasta que abogado y contador definan el alcance informativo y los datos mínimos. No se inventan tasas ni formularios.
3. **Memoria.** F14 requiere decidir si se extiende `preferencesSchema` o se crea una tabla aparte, y qué consentimiento se agrega.
4. **PDF.** F16 puede resolverse con impresión del navegador; si se quiere PDF generado, hay que evaluar dependencia y anotarla en `PROGRESO.md`.
5. **Sector para concentración.** F01 puede quedarse en pesos y efectivo; el sector exige mapear `company_facts` y aceptar cobertura parcial.
6. **Simulador en cuenta real.** F05 debe respetar `REAL_TRADING_READY` y el NO GO de dinero real. Si la cotización real está apagada, la simulación se ofrece en demo o se declara no disponible; no se enciende un flag para habilitarla.
7. **Presupuesto de evals.** F20 necesita un tope de tiempo/costo en CI y una persona responsable de revisar los fallos.

---

## 6. Anexo — Rutas y piezas de referencia

| Necesidad | Ruta o pieza | Estado |
|---|---|---|
| Conversación | `POST /api/ai/chat`, `lib/ai/run-chat.ts` | Ya existe |
| Cartera | `GET /api/portfolio`, `usePortfolio`, `get_portfolio` | Ya existe |
| Precios | `GET /api/prices`, `usePrices` | Ya existe |
| Historial | `GET /api/tickers/[symbol]/history`, `useHistory`, `useHistories` | Ya existe |
| Catálogo y búsqueda | `GET /api/tickers`, `/api/market/search`, `useTickers`, `useMarketSearch` | Ya existe |
| Empresa | `GET /api/tickers/[symbol]/company`, `readCompanyForSymbol` | Ya existe |
| Tipo de cambio | `GET /api/fx/usdclp`, `useFx` | Ya existe |
| Alertas | `/api/me/alerts`, `alert-client.tsx` | Ya existe |
| Favoritos | `/api/me/favorites`, `useFavorites` | Ya existe |
| Preferencias | `/api/me/preferences`, `usePrefs` | Ya existe |
| Consentimientos | `/api/me/consents`, `useConsents` | Ya existe |
| Actividad | `/api/wallet/activity`, `useActivity` | Ya existe |
| Mercado | `/api/market/status`, `/api/market/movers` | Ya existe |
| Cotización | `POST /api/trade/quote`, `quoteTrade` | Ya existe |
| Import por imagen | `POST /api/ai/import-portfolio`, `ImportPreview` | Ya existe |
| Preguntas | `InteractiveQuestionCard` | Existe el componente; falta el enganche |
| Export Markdown | `exportChatToMarkdown`, `onExportMarkdown` | Ya existe |
| Límite del asistente | `RATE_LIMIT_POLICIES.ai`, `takeAiQuota` | Ya existe |
| Evaluaciones | `AssistantDeps`, tests de `lib/ai` | Parcial |

---

## 7. Tabla resumen

| ID | Función | Prioridad | Esfuerzo | Dependencia principal | Estado |
|---|---|---|---|---|---|
| F01 | Concentración y diversificación de cartera | P0 | S | `GET /api/portfolio` + `get_portfolio` | Parcial |
| F02 | Comparación de acciones e índices adjuntos con gráfico | P1 | S | `compare_stocks` + `ContextPicker` | Parcial |
| F03 | «Mi cartera hoy»: resumen del día | P0 | M | `usePrices` (`change24hPct`) + `useFx` | Falta |
| F04 | Explicador de movimientos con fuentes | P2 | L | Proveedor de noticias citables (no existe) | Falta |
| F05 | Simulador «¿qué pasa si compro X?» | P1 | M | Servicio `trade.quote` (`persist: false`) + ruta | Falta |
| F06 | Alertas de precio por chat | P1 | M | `/api/me/alerts` | Parcial |
| F07 | Watchlist inteligente desde favoritos | P1 | S | `/api/me/favorites` | Parcial |
| F08 | Análisis fundamental real | P1 | M | `/api/tickers/[symbol]/company` | Parcial |
| F09 | DCA y aportes mensuales en CLP | P1 | S | `/api/fx/usdclp` + `quoteTrade` | Parcial |
| F10 | Escenarios de riesgo y volatilidad | P2 | M | `/api/tickers/[symbol]/history` | Falta |
| F11 | Resumen tributario informativo `[REVISIÓN ABOGADO]` | P2 | L | Reglas tributarias + revisión legal | Falta |
| F12 | Lectura de capturas de cartera | P1 | S | `/api/ai/import-portfolio` | Parcial |
| F13 | Preguntas de seguimiento interactivas | P1 | S | `InteractiveQuestionCard` | Parcial |
| F14 | Memoria de preferencias con consentimiento | P2 | M | `/api/me/preferences` + consentimiento | Parcial |
| F15 | Modo «explícame como principiante» | P1 | S | `buildSystemPrompt` + directiva | Falta |
| F16 | Exportar análisis a PDF/Markdown | P1 | S | `exportChatToMarkdown` | Parcial |
| F17 | Comandos «/» y menciones «@NVDAx» | P1 | M | `useMarketSearch` + chips de contexto | Parcial |
| F18 | Atajos de teclado | P2 | S | `⌘K`, Escape y Enter existentes | Parcial |
| F19 | Límites y rate limiting por herramienta | P0 | M | `RATE_LIMIT_POLICIES.ai` + `takeAiQuota` | Parcial |
| F20 | Evaluación de calidad (evals) | P0 | M | `AssistantDeps` + fixtures | Parcial |

**Prioridad:** P0 = antes de ampliar herramientas o de alto valor inmediato; P1 = siguiente ola; P2 = depende de una fuente, una migración o una revisión legal.
**Esfuerzo:** S = acotado; M = una o dos piezas nuevas con tests; L = proveedor, migración o revisión externa.
**Estado:** «Ya existe» = usable hoy; «Parcial» = hay piezas pero falta la función completa; «Falta» = no hay fuente o contrato.
