# Plan de mejora de gráficos e interfaz

Fecha del plan: 15 de noviembre de 2026, hora de Chile. Estado al 17 de noviembre: las 16 propuestas están implementadas en su alcance inicial y verificadas localmente. Las comprobaciones se concentraron al final del conjunto según la instrucción posterior de Manu. Evidencia y límites en `IMPLEMENTACION-GRAFICOS-UI.md`; sin despliegue ni habilitación de dinero real.

Alcance confirmado con Manu: acciones tokenizadas y cripto. La referencia inicial a mercados de predicciones fue una confusión y queda fuera de este plan.

## 1. Recomendación

Usar **Lightweight Charts para los gráficos financieros grandes** y **componentes seleccionados de shadcn/ui para los controles que los rodean**, conservando el lenguaje visual actual. La mejora debe permitir encontrar un activo, entender su precio y comparar alternativas con menos esfuerzo.

No recomiendo una sustitución masiva de componentes ni convertir la aplicación en un terminal lleno de herramientas. Ya existen gráficos interactivos, comparaciones, indicadores, buscador global, filtros, tablas y paneles móviles. Hay que mejorar esos recorridos y reducir sus diferencias.

Orden recomendado:

1. Aclarar procedencia, moneda y significado de cada serie.
2. Probar un gráfico nuevo en una sola ficha, con el SVG actual disponible como alternativa durante la evaluación.
3. Simplificar controles, especialmente en móvil.
4. Reutilizar la solución en cripto y comparaciones.
5. Mejorar mercado, screener, favoritas y cartera con patrones compartidos.
6. Considerar velas y volumen únicamente cuando exista un contrato de datos que los sostenga.

Manu aprobó implementar todos los bloques y posteriormente concentrar las compilaciones y comprobaciones al final de las mejoras. La implementación se completó por etapas con dependencias selectivas; cambios de ejecución real, migraciones y despliegues conservan sus requisitos específicos.

## 2. Base del análisis y límites

Se revisaron `PROGRESO.md`, dependencias, rutas, componentes y servicios del repositorio local, con base Git `c982197`. Había numerosos cambios previos sin confirmar y rutas nuevas sin seguimiento; esos archivos también forman parte de la versión local observada. Su presencia no demuestra que estén desplegados.

Revisión visual realizada en un servidor local separado, con autenticación, datos y precios en mock: mercado `/app`, ficha `/app/accion/NVDAx` en escritorio y a 390 × 844, modos Simple/Técnico, comparador con NVDAx/SPYx/QQQx y ficha `/app/cripto/SOL` sin cotización/historial. Las pantallas privadas de cartera, billetera y perfil se analizaron mediante código; no se validaron visualmente en una cuenta autenticada. Los tiempos de compilación de desarrollo no se usan como medida de rendimiento de producción.

Las fuentes externas son los repositorios solicitados y documentación oficial. Las propuestas de disposición, prioridad y esfuerzo son criterio de producto e ingeniería aplicado al código observado; no son promesas de conversión, rentabilidad o mejoras porcentuales.

### Lo que existe realmente

| Superficie | Implementación actual | Decisión propuesta |
| --- | --- | --- |
| Ficha de acción: Simple y Técnico nativo | `price-panel.tsx` + `svg-price-chart.tsx`; SVG interactivo, hover, teclado, coste medio, escalas, comparaciones y pantalla completa | Migrar primero una ficha a Lightweight Charts; conservar funciones útiles y alternativa SVG durante el piloto |
| Proveedor TradingView de la ficha | `tradingview-chart.tsx`: iframe `s.tradingview.com/widgetembed`, asociado al subyacente | Identificarlo como referencia externa; decidir su permanencia tras comparar funciones |
| Cripto | `crypto-detail-chart.tsx` usa SVG; precios e historial mediante hooks | Adoptar el mismo motor y formato de estado, conservando precisión de activos pequeños |
| Mercado: Tu día | `market-today/market-today.tsx`; gráfico propio, rangos y spot unificado recientemente | Conservar contenido y consultas; adaptar presentación después del piloto |
| Comparación en ficha | `chart-multi-compare.tsx`, hasta cuatro comparados y selección de series | Mejorar selector y coherencia de fechas; no volver a crear la función |
| Comparador de página | `compare-pro-screen.tsx`, SVG independiente, hasta cuatro activos, presets y simulación | Compartir motor y convenciones con la ficha |
| Cartera | `portfolio-value-chart.tsx`, SVG, benchmark, reparto, posiciones y salud; radiografía/calendario en trabajo local | Revisar significado del histórico antes de embellecerlo; mejorar tabla y detalle |
| Copiar | `components/copy/perf-chart.tsx`, otro SVG | Reutilizar convenciones; migrar motor sólo si aporta interacción necesaria |
| Gráficos del asistente | `components/ai/widgets.tsx`, SVG con rangos/hover | Mantener versiones ligeras; abrir gráfico grande bajo demanda |
| Portada y comparaciones públicas | `components/landing/compare-chart.tsx` y otros gráficos | Conservar SVG cuando sea suficiente para contenido pequeño o inicial |
| Listas y screener | `market-screen.tsx`, `crypto-market.tsx`, `screener-screen.tsx` | Compartir anatomía de fila, filtros y estados; tabla avanzada sólo donde compense |
| Búsqueda global | `stock-search.tsx`; acciones, cripto, Ganar y accesos rápidos; `command-palette.tsx` es compatibilidad | Mejorar la implementación única; evitar una segunda paleta |
| Sistema UI | 32 archivos en `components/ui`; overlays y navegación por teclado propios | Incorporación selectiva de shadcn, respetando contratos existentes |

### Observaciones que justifican cambios

- En la ficha móvil en Técnico, el encabezado, rangos, selector de proveedor, ajustes e indicadores consumen la primera pantalla. El gráfico requiere desplazamiento adicional.
- Simple y Técnico son modos; Gráfico Pro y TradingView son proveedores. Son dos decisiones distintas expuestas juntas, aunque al usuario le importa qué puede ver y de dónde sale el precio.
- La ficha presenta termómetro del período, resumen de apertura/promedio, simulación y otras secciones. Conviene jerarquizarlas para dar prioridad a precio, gráfico y operación.
- El comparador usa una cápsula de rangos y tarjetas distintas de los controles de la ficha. La función es similar, pero la interacción cambia entre pantallas.
- En la ficha cripto observada, Datos del token aparece antes del gráfico; mint, decimales y topes ocupan la zona inicial. Conviene llevar precio y gráfico arriba y dejar metadatos en una sección secundaria.
- En el mercado observado, la selección general estaba en CLP y el destacado mostraba USD. Debe decidirse una política de moneda consistente y visible.
- En mock se observó el rótulo de frescura «En vivo» cerca de «Referencia: no es el precio real». Las dos etiquetas pueden referirse a cosas distintas; la interfaz tiene que explicitarlo y distinguir demo, precio reciente e histórico.
- Mercado mostró 446 acciones en el catálogo local. El screener carga un subconjunto de hasta 60, según su implementación. El alcance de sus resultados necesita ser visible y su paginación debe revisarse.
- Existen muchas funciones añadidas en el trabajo local. Su existencia no justifica mostrar todas al mismo nivel ni anunciarlas como disponibles en producción.

## 3. Qué aporta cada librería

### Lightweight Charts

Es un motor de dibujo financiero en canvas. Puede servir para líneas, áreas, velas, histogramas y paneles. **No entrega cotizaciones, el historial de TradingView, indicadores calculados ni una interfaz de trading completa.** El iframe actual y esta librería son productos diferentes. [Comparación oficial de productos](https://tradingview.github.io/lightweight-charts/docs/product-comparison).

Su encaje aquí: controlar apariencia, navegación temporal y sincronización con los datos que ya consume la app. La documentación consultada corresponde a v5.3; al implementar debe fijarse una versión estable y usar su API v5, no copiar ejemplos antiguos. Su ejecución ocurre en el cliente. [Inicio y API de series](https://tradingview.github.io/lightweight-charts/docs).

Conservar la atribución requerida y el enlace a TradingView en una ubicación accesible; revisar el `NOTICE` de la versión elegida. El logo de atribución resuelve el enlace, pero hay que conservar también el aviso exigido. [Licencia y atribución del repositorio](https://github.com/tradingview/lightweight-charts#license).

### shadcn/ui

Es código de componentes que se incorpora y mantiene en el proyecto. Permite adaptar comportamiento y estilos; no obliga a adoptar una plantilla de dashboard. Su valor en esta app está en controles complejos y composiciones consistentes. [Introducción oficial](https://ui.shadcn.com/docs).

Elegir una sola familia de primitivas para el piloto. Propongo evaluar la variante Radix para diálogos, popovers y menús, en lugar de mezclar familias por componente. La elección se valida con React 19, Tailwind v4 y los overlays actuales antes de expandirla.

Los gráficos de shadcn usan Recharts. No los propongo como segundo motor para precios. Sólo evaluar Recharts más adelante si aparecen análisis de barras o repartos que el SVG existente ya no resuelva bien. [Chart de shadcn](https://ui.shadcn.com/docs/components/chart).

## 4. Matriz de prioridades

P0: necesario para una interpretación fiable. P1: mejora principal recomendada. P2: opcional tras validar el núcleo. Esfuerzo orientativo de ingeniería, sujeto al estado del trabajo local: S = hasta una jornada; M = 1–3; L = 3–6; XL = trabajo de datos con alcance todavía abierto. No sumar las filas como presupuesto: comparten componentes.

| ID | Propuesta | Prioridad | Esfuerzo | Dependencia principal |
| --- | --- | --- | --- | --- |
| G01 | Procedencia, frescura, moneda y capacidad de cada serie | P0 | M | Acordar semántica del histórico |
| G02 | Motor compartido de Lightweight Charts y piloto en acción | P1 | L | G01; paquete nuevo aprobado |
| G03 | Controles de gráfico compactos y panel de herramientas | P1 | M | Piloto de componentes shadcn |
| G04 | Comparaciones con la misma ventana y lectura sincronizada | P1 | M–L | G01/G02 |
| G05 | Extensión del motor a cripto | P1 | M | Piloto G02 aprobado |
| G06 | Semántica y navegación del gráfico de cartera | P0/P1 | M o XL | Datos históricos de posiciones y flujos |
| G07 | Velas, volumen e indicadores con datos suficientes | P2 | XL | Fuente/contrato OHLCV y cobertura |
| U01 | Mercado con filtros claros y tabla coherente | P1 | M–L | Datos y alcance de paginación |
| U02 | Screener consistente y selección para comparar | P1 | M | U01; TanStack Table opcional |
| U03 | Mejoras a búsqueda global y selector de comparados | P1 | M | Mantener una implementación de búsqueda |
| U04 | Ficha organizada en Resumen / Empresa / Token | P1 | M | G03; preservar contexto de riesgo |
| U05 | Tabla de posiciones y panel de detalle | P1 | M | G06 para métricas históricas |
| U06 | Presentación de operaciones y estados de ejecución | P1, posterior | M–L | Revisión específica de flujos de dinero |
| U07 | Navegación de herramientas y acceso móvil a cripto | P1 | M | Revisar shell actual y cambios locales |
| U08 | Estados y overlays coherentes en toda la app | P1 | M | Piloto shadcn sin regresiones de foco |
| U09 | Pulido de asistente, Copiar y marketing | P2 | M | Núcleo validado; conservar identidad |

## 5. Plan detallado de gráficos

### G01. Hacer inequívoco qué precio se está viendo

**Problema actual.** `Quote.priceUsd` y los ticks representan precio del token ajustado para la unidad de presentación. En cambio, `historyWithSource()` puede devolver cierres del subyacente escalados. El iframe muestra el subyacente con datos externos. `source: "closes"` no equivale a historial de operaciones del token, aunque la respuesta lo clasifique como real.

**Cambio visible.** Añadir una línea de contexto estable junto al gráfico: instrumento, procedencia, moneda y última observación. Ejemplos de textos propuestos, sin inventar valores: «Precio del token · USD», «Histórico del subyacente · referencia» o «Datos de demostración». Separar la fecha del último histórico de la actualización del spot.

**Reglas de comportamiento.**

1. El precio principal sigue siendo el spot del instrumento elegido; el hover muestra fecha y valor histórico claramente identificados y al salir recupera el spot.
2. Cambiar 1D/1S/1M cambia el rango y su variación, no el significado del precio principal. Variación 24 h y variación del rango se rotulan por separado.
3. Mantener los registros históricos originales. `anchorSeriesToSpot()` reescala toda la serie: revisar sus usos en mercado, detalle, screener y comparador. No convertir ese ajuste en política del motor nuevo sin justificarlo. No confundir este reescalado con añadir una observación spot posterior.
4. Sólo añadir un spot al histórico si instrumento, unidad y momento son compatibles. No unir un cierre del subyacente con un precio del token como si fueran una misma serie de operaciones.
5. Ante un salto de fuente, separar las series, mostrar contexto o dejar un hueco. No suavizarlo para que el gráfico resulte más bonito.
6. En CLP, definir si se ofrece conversión de precios USD al tipo de cambio actual o un histórico CLP real. Si sólo existe FX actual, rotularlo como conversión de referencia; no presentar su variación como rendimiento histórico en pesos.
7. El precio graficado es orientativo. El precio final por monto, impacto y costes lo entrega la cotización de la operación.
8. No volver a aplicar el multiplicador a precios ya normalizados. Tampoco usar el multiplicador actual como sustituto de ajustes históricos no disponibles.
9. Definir qué significa cada rango: últimas 24 horas, sesión bursátil o días calendario. La ruta actual de 1D puede tomar dos jornadas de ticks; conservar esa decisión sin explicarla produciría otra ambigüedad. El producto opera 24/7; distinguirlo del horario del subyacente y avisar mayor variación fuera del horario regular de EE.UU.

**Modelo propuesto.** Mantener el contrato existente al inicio y construir un adaptador con metadatos derivados donde sean verificables. Si hace falta ampliar API, proponer campos explícitos de instrumento/fuente, actualización, unidad, cobertura y capacidades `line`, `ohlc`, `volume`; cualquier dato desconocido permanece desconocido. La librería de gráficos no decide qué es un precio real.

**Aceptación.** Una persona puede identificar si ve token, subyacente o demo; spot y curva no se presentan engañosamente como una única fuente; no hay «0» para ausencia de datos; unidades coherentes en encabezado, eje y tooltip. Validación con mock, cierres, ticks y fallo de fuente.

### G02. Un motor compartido para gráficos financieros grandes

**Sustituir.** Primero el renderizador SVG de una ficha, después el del comparador y cripto. Reutilizar consultas, caché y cálculos de dominio; conservar el SVG hasta aprobar equivalencia. No borrar `svg-price-chart.tsx` porque sigue teniendo consumidores.

**Experiencia nueva.**

- Cursor con fecha y precio alineados; última cotización reconocible sin tapar la curva.
- Desplazamiento temporal y zoom en escritorio; acción «Restablecer vista» cuando la persona se aleja de la ventana inicial.
- Al llegar un precio, conservar el zoom y el lugar que está inspeccionando; si dejó de seguir el presente, ofrecer «Volver al último precio».
- Pantalla completa conserva rango, comparados e indicadores en lugar de iniciar otra experiencia.
- Escalas y formatos coherentes; cuadrícula discreta y opcional. Área suave para lectura simple, línea para comparaciones.
- Etiquetas legibles sin competir con el precio principal; tipografía y colores existentes, sin un panel de estética ajena incrustado.

**Integración propuesta.** `FinancialChart` recibe datos normalizados y capacidades; `ChartToolbar`/`ChartLegend` viven en React. El motor sólo dibuja y emite eventos. Separar adaptador temporal, formato de moneda y estado de selección.

**Técnica necesaria.**

- Carga dinámica dentro de un Client Component con altura reservada; los contenedores y datos que puedan seguir en servidor lo hacen. Seguir la guía local de Next 16 sobre lazy loading; `ssr: false` se declara en cliente.
- Instanciar una vez por contenedor. Limpiar listeners, observadores y gráfico al desmontar; verificar el ciclo doble de desarrollo de React. [Integración React oficial](https://tradingview.github.io/lightweight-charts/tutorials/react/advanced).
- Usar `setData` para cambios de conjunto y `update` para actualizaciones compatibles. No ajustar toda la vista con cada tick.
- Convertir Unix milisegundos de `PricePoint.t` a segundos para intradía; ordenar y resolver duplicados creados al convertir. No pasar valores ausentes o no finitos.
- Mantener una sola conversión entre ratios de dominio y porcentajes de presentación: `0,012` equivale a `1,2 %`. El eje, la leyenda y la variación principal deben coincidir.
- Conservar claves temporales UTC canónicas. Formatear etiquetas y tooltip en `America/Santiago`; distinguir cierres por día de timestamps intradía. No aplicar un offset fijo que falle en cambios de hora. Lightweight Charts necesita tratamiento de zona horaria explícito. [Zonas horarias](https://tradingview.github.io/lightweight-charts/docs/time-zones).
- Responder al tamaño del contenedor y al colapso del sidebar. No dejar un canvas cortado tras pantalla completa o rotación.
- El gráfico no hace fetch directo a proveedores. Sigue `lib/api/client.ts` → `/api/*` → servicios y reutiliza TanStack Query.

**Móvil.** Scroll vertical natural al pasar por el gráfico; inspección táctil deliberada sin secuestrar todo el gesto. Probar configuración de touch, zoom y pulsación en dispositivo real. Controles de 44 px aunque su trazo visual sea pequeño.

**Accesibilidad.** Canvas no sustituye el `slider` y la navegación por teclado existentes: conservar un explorador accesible de puntos, resumen textual y opción de tabla de datos. Anunciar cambios de rango y errores; no emitir mensajes de lector de pantalla en cada movimiento del cursor.

**Aceptación.** Misma serie y cifras que la fuente elegida; sin pérdida de funciones aprobadas; rango y hover correctos; no duplicar peticiones; no reiniciar zoom por polling; vista completa y sidebar funcionan; SVG disponible para revertir el piloto. El tamaño y fluidez se miden con build de producción, sin prometer una mejora numérica de antemano.

### G03. Menos controles sobre el gráfico, más espacio para leerlo

**Problema.** La ficha actual mezcla selección de modo, proveedor, rangos, promedio, escala, porcentaje, benchmark y medias en varias filas.

**Propuesta.** Mantener Simple como entrada. En ambos modos, una fila principal de rangos y acciones «Comparar», «Herramientas» y «Ampliar». Herramientas abre `Popover` en escritorio y `Sheet` en móvil. Dentro: estilo compatible con los datos, SMA, RSI, línea de coste medio, cuadrícula y escala. Las opciones activas aparecen como chips removibles debajo de la barra.

Conservar la preferencia Simple/Técnico de `use-chart-mode.ts`. Durante el piloto, el proveedor anterior queda en una opción secundaria de evaluación. En la versión final, el nombre del motor no necesita ser una decisión principal del usuario. Si sigue el iframe, llamarlo «Ver subyacente en TradingView» y explicar su alcance.

No incluir velas o volumen como interruptores activos si la fuente no los proporciona. Mostrar la explicación de disponibilidad dentro de Herramientas cuando sea útil.

**Aceptación.** A 390 px, la primera vista de la ficha muestra precio, rangos y una parte sustancial del gráfico en Simple; Técnico evita acumular filas permanentes. Medir también a 360 y 430 px. Abrir/cerrar herramientas conserva rango y foco, y no modifica operaciones.

### G04. Comparar series de forma coherente

**Conservar.** Comparación en ficha, comparador de página, hasta cuatro series comparadas donde el contrato actual lo permita, selección por leyenda y enlaces con activos preseleccionados.

**Mejorar.**

1. Un selector de activos con búsqueda, nombre, símbolo, tipo y estado de datos. Seleccionados visibles como chips y límite explicado.
2. Fechas comunes explícitas. Rebasing a 0 % con precio válido de inicio dentro de una ventana comparable. Si falta cobertura, indicar inicio distinto o recortar a una ventana común; no comparar silenciosamente períodos distintos.
3. Un cursor vertical que muestra valores de todas las series en ese momento. Si se usa la observación anterior disponible, limitar su antigüedad y mostrar su hora; no tomar datos posteriores como si ya fueran conocidos.
4. Diferenciar variación de precio de rentabilidad total. SPYx/QQQx son instrumentos comparados; no afirmar que incluyen dividendos, impuestos o comisiones si no se calculan.
5. Leyenda estable y accesible: color, símbolo y valor. Al enfocar una curva se atenúan otras, sin depender sólo del color para identificarlas.
6. Guardar símbolos y rango en URL sin información privada. Mantener compatibilidad con enlaces actuales.

**Dependencias.** G01 y G02. `Combobox` sirve como patrón para selección. [Combobox de shadcn](https://ui.shadcn.com/docs/components/radix/combobox).

**Aceptación.** Dos activos con fechas de inicio distintas no producen una comparación aparentemente equivalente sin avisar; añadir/quitar un activo no reinicia el rango; el tooltip representa un mismo instante y su política de muestreo es explícita.

### G05. Cripto con el mismo gráfico y precisión apropiada

Usar el mismo motor, rangos y panel de herramientas de acciones. Conservar sus diferencias de dominio: token/red, precisión dinámica, fuente, demo y ausencia de historial. No convertir una ficha cripto en una ficha de acción.

Reordenar la ficha para mostrar identidad → precio/gráfico → datos y avisos, manteniendo el módulo de operación en su lugar adecuado según tamaño. Actualmente los metadatos del token preceden al gráfico. El precio del módulo de operación y el del gráfico necesitan una misma política de moneda/frescura, sin duplicar mensajes contradictorios.

El formato del eje y tooltip no debe redondear un precio pequeño a cero. Establecer precisión y paso mínimo según el instrumento, con separación correcta de miles y decimales. Mantener USD/CLP y el tipo de conversión visible.

En mock, el servicio omite cotizaciones e historiales cripto/LST. La aceptación consiste en un estado «Sin cotización» o «Sin historial» correcto, no en inventar una serie para llenar el componente. La prueba visual con datos reales debe hacerse posteriormente en un entorno adecuado y separado de la habilitación de operaciones reales.

**Aceptación.** BTC/SOL y un activo de precio muy pequeño conservan precisión; nunca se muestra una línea plana inventada; falta de FX no se presenta como CLP; avisos y bloqueo real de cripto existentes se preservan. El estado vacío no afirma que hay un «precio real en vivo arriba» cuando la cotización también falta.

### G06. Cartera: separar evolución del patrimonio y rendimiento

**Hallazgo.** `portfolioValueSeries()` usa cantidades actuales y efectivo actual para valorar distintos momentos de los historiales, y fija el último punto al total presente. Eso permite reconstruir cómo habría variado la composición actual, pero no demuestra el patrimonio real que tuvo la cuenta en cada fecha. La selección de precio más cercano también requiere revisar el posible uso de observaciones posteriores.

**Opción inicial, sin ampliar datos.** Rotular con precisión lo que calcula la serie, explicar la base y evitar presentarlo como rendimiento personal histórico. Conservar `null` para métricas que no puedan justificarse.

**Opción completa, separada.** Construir la evolución desde posiciones y efectivo históricos, operaciones, depósitos y retiros, con cobertura conocida. Para rendimiento, descontar o neutralizar flujos mediante una metodología acordada y explicada. Es un trabajo de datos/contabilidad; cambiar la librería no lo resuelve.

**Diseño propuesto.** Dos vistas sólo cuando sus datos existan: «Valor de la cartera» y «Rendimiento». Aportes y retiros pueden verse como marcadores verificados. Benchmark en una escala comparable, con advertencia de cobertura y metodología.

**Aceptación.** Un depósito por sí solo no se anuncia como ganancia de inversión. Una posición comprada hoy no aparece como tenida durante todo el año. No atribuir al usuario rendimientos simulados de la cartera actual.

### G07. Velas, volumen y estudios: ampliación condicionada

**Límite concreto.** El tipo y esquema HTTP de historial entregan `{t, p}`. `SvgPriceChart` acepta OHLCV opcional, pero `pricePointSchema` y `historyFields()` no los transportan. Instalar Lightweight Charts no crea los datos faltantes.

**Secuencia si se aprueba este bloque.**

1. Elegir fuente por instrumento, permisos de uso, cobertura, resolución y calidad. Distinguir operaciones del token de cierres u OHLC del subyacente.
2. Definir contrato de barras y capacidades en tipos, zod y servicios. Diferenciar rango visible de resolución de barra: «1 mes» no significa «vela mensual».
3. Agregar OHLC sólo desde observaciones suficientes y rotular su procedencia. Un mínimo/máximo de sondeos espaciados no debe venderse como máximo/mínimo completo del mercado.
4. Volumen significa unidades negociadas en un ámbito definido. Liquidez del pool, monto de cotizaciones y número de puntos no sustituyen volumen negociado.
5. Reutilizar `lib/market/indicators.ts` para SMA/RSI cuando corresponda; respetar calentamiento y frecuencia. Una SMA de 20 puntos de sondeo no es automáticamente una SMA de 20 días.
6. Usar panel secundario para RSI o volumen cuando se activen, conservando área de precio suficiente. La librería permite paneles, pero cálculos y controles siguen siendo nuestros. [Paneles oficiales](https://tradingview.github.io/lightweight-charts/docs/panes).

**Aceptación.** Velas y volumen sólo aparecen con datos válidos y metadatos suficientes. No simular máximos, mínimos, operaciones o volumen para completar la estética. No asumir que el motor nuevo sustituye todas las herramientas de dibujo del iframe.

## 6. Plan detallado de interfaz con shadcn

### U01. Mercado: encontrar y evaluar activos con menos ruido

**Actual.** Destacado Tu día, listados del día, filtro por categoría, ordenamiento, lista/mapa de calor, favoritas y carga incremental. No falta una portada de mercado; falta compartir una jerarquía y controles entre sus superficies.

**Propuesta.** Mantener Tu día, pero limitar su altura y dar protagonismo al catálogo. Barra con búsqueda, categoría, orden, filtros adicionales y lista/mapa. Los filtros activos se ven como chips removibles con «Limpiar». Mantener los filtros existentes en URL y ampliar ese contrato con cuidado.

**Fila de acción, escritorio.** Identidad (logo, nombre, símbolo y emisor cuando aporte distinción), precio en moneda elegida, variación 24 h rotulada, minigráfico con período explícito y favorita. Estado/frescura donde cambie la interpretación. Evitar muchas columnas que repitan el encabezado.

**Fila móvil.** Identidad a la izquierda, precio y variación a la derecha, favorita accesible; secundarios al abrir la ficha. Conservar la decisión actual de no obligar a mostrar sparklines diminutas en móvil. No introducir desplazamiento horizontal para la lista principal.

**shadcn.** `Popover`, `Select` o `Dropdown Menu` para filtros/orden; `Sheet` para filtros móviles; `Badge` para filtros activos; `Table` si mejora la semántica de escritorio. No reemplazar la lógica de búsqueda o precios por el componente UI.

**Aceptación.** Filtrar no borra accidentalmente la búsqueda; volver desde la ficha recupera filtros y posición cuando corresponda; resultados vacíos explican qué limpiar; orden por alzas no se presenta como global si sólo se evaluó una página.

### U02. Screener: una herramienta para comparar, no otra lista desconectada

**Actual.** Ya filtra por sector, emisor, rendimiento y liquidez; permite distintas vistas y consume historiales. No se propone crear otro screener.

**Propuesta.** Unir sus filtros, tabla y estado con U01. Añadir selección de 2–4 activos para abrir el comparador existente. Fila con precio, cambio 24 h, liquidez disponible, emisor y selección. Columnas opcionales mediante menú; ocultar información secundaria en móvil.

**Corrección de alcance.** Revisar `fetchScreenerCatalog()`: tiene un tope de 60 y usa tamaños de página diferentes al pedir la segunda página. Comprobar offsets y duplicados antes de prometer cobertura del catálogo completo. Si se mantiene el límite, mostrar «Analizando N activos» y explicar el universo.

**Elección técnica.** La guía Data Table de shadcn usa TanStack Table, que es otra dependencia distinta de TanStack Query. Adoptarlo si se aprueban selección, columnas configurables y ordenamiento complejo; para una tabla pequeña, `Table` y la lógica actual pueden bastar. No instalarlo sólo por el aspecto. [Guía de Data Table](https://ui.shadcn.com/docs/components/radix/data-table).

**Aceptación.** Conteo y alcance correctos; orden y filtro consistentes en todo el conjunto considerado; selección conservada al cambiar orden; acciones comprensibles con teclado; valores desconocidos no ordenados como si fueran cero.

### U03. Búsqueda y selectores: mejorar la implementación única

**Conservar.** `StockSearchRoot`, sus grupos de acciones/cripto/Ganar/Ir a, atajo global y la compatibilidad de `openCommandPalette()`. Ya existe navegación por teclado, foco y presentación móvil.

**Mejorar.** Utilizar patrones `Command`/`Combobox` para filas y selección; reforzar distinción entre un activo y una acción de navegación. Mostrar nombre, símbolo, categoría y origen del resultado. Para símbolos parecidos, hacer inequívoco qué token se abrirá.

Reutilizar la anatomía del selector en «Comparar» y alertas, sin compartir estados privados por accidente. Incluir carga y error al lado de la búsqueda, sin sustituirlos por «No hay resultados». Si los resultados vienen de la API, no aplicar un segundo filtro que los oculte de forma distinta.

`Command` usa `cmdk` en la variante consultada; su adopción agrega esa dependencia. Primero comparar su utilidad con la solución existente. [Command oficial](https://ui.shadcn.com/docs/components/radix/command).

**Aceptación.** Sigue habiendo una sola paleta y un solo atajo; flechas/Enter/Escape funcionan; el foco vuelve al disparador; ninguna selección de búsqueda ejecuta una compra.

### U04. Ficha de activo: lectura principal y profundidad bajo demanda

**Conservar.** Nombre, identidad del token, precio/gráfico, operación lateral en escritorio y CTA inferior móvil, datos de empresa y contexto de riesgos.

**Propuesta.** Tras gráfico y datos esenciales, pestañas «Resumen», «Empresa», «Token y riesgos». La operación queda visible en su zona actual; el contexto material de token/fuente/sesión no desaparece detrás de pestañas. Simuladores históricos y DCA se agrupan como herramientas expandibles; sus cálculos y avisos siguen explícitos.

Reducir repetición entre precio del encabezado, tarjeta de operación, Datos y resumen del período. «Compartir», IA y alerta pueden agruparse sin perder accesibilidad; mantener una acción principal clara.

**shadcn.** `Tabs`, `Accordion`, `Tooltip`/`Popover` de explicación y menú de secundarios. Una explicación necesaria para decidir no queda disponible sólo con hover.

**Aceptación.** Precio, unidad, fuente y acción principal se entienden sin abrir secciones; sólo existe un scroll principal móvil; pestañas no pierden la selección del gráfico; enlaces y avisos legales siguen disponibles.

### U05. Cartera y favoritas: actuar sobre posiciones con claridad

**Cartera.** Mantener valor, gráfico, reparto y posiciones. Unificar fila: activo, valor, cantidad mostrada, coste medio si existe, ganancia/pérdida si se conoce y peso. En móvil mostrar identidad, valor y resultado; abrir un `Sheet` de detalle para el resto. Diferenciar efectivo, acciones y cripto con etiquetas y agrupación, sin mezclar unidades.

**Favoritas.** Reutilizar la fila y los estados del mercado; mismo período de sparkline, moneda y frescura. Menú de acciones con comparar y quitar favorita; no convertirlo en una segunda ficha.

**shadcn.** Tabla sencilla o Data Table según necesidades reales; `Sheet`, `Dropdown Menu`, `Tooltip` y `Empty`. Reutilizar reparto y barras actuales. Evaluar un gráfico de distribución nuevo sólo si mejora legibilidad demostrablemente.

**Aceptación.** `null` de coste/P&L conserva «Sin dato»; valores y totales concuerdan con la fuente; etiquetas de cantidad no confunden tokens crudos y acciones ajustadas; un detalle no exige salir de la cartera.

### U06. Compra/venta y billetera: presentación consistente, ejecución preservada

El flujo ya cuenta con desglose de costes, impacto, vencimiento de cotización y pasos de ejecución. La propuesta es mejorar presentación: pestañas Comprar/Vender, monto y unidad claros, «Pagas / Recibes», coste total, detalle expandible, estado de cotización y acción principal coherente.

En móvil, un panel con cabecera y acción persistentes y cuerpo desplazable que respete teclado y safe area. Un `Sheet` de diseño general no debe cerrar por gesto o Escape en un estado donde el flujo actual lo impida. Mantener visibles pendientes de firma, envío y confirmación; no mostrar éxito prematuro.

Para billetera, reutilizar agrupación de campos, direcciones copiables, estados vacíos y diálogos. Cambios de diseño de formularios no autorizan nuevos destinatarios, transferencias ni lógica de firma.

**Aceptación.** Misma máquina de estados y mismas protecciones; cotización vencida no permite confirmar; no hay doble envío; un error conserva contexto útil; cerrar/reabrir no duplica una operación. Antes de tocar estos archivos, leer el handoff obligatorio de auditoría y validar el alcance específico.

### U07. Navegación: ordenar herramientas y resolver cripto en móvil

**Actual.** Sidebar propio con tamaños 212/68 px, estado persistido y coordinación con el asistente; cinco pestañas móviles. El trabajo local añadió Screener, Comparar, Armar Mix y Alertas en subnavegación. Cripto está separado en escritorio, pero no es uno de los cinco destinos móviles.

**Propuesta.** Conservar shell y comportamiento de colapso. En escritorio mantener destinos principales y agrupar herramientas bajo una entrada secundaria reconocible. En móvil, conservar las cinco pestañas y proporcionar acceso evidente a Cripto desde Mercado mediante navegación secundaria visible, además de búsqueda. Elegir este ajuste antes de sumar una sexta pestaña apretada.

`Sidebar` de shadcn puede aportar patrones de composición y tooltips; no recomiendo reemplazar de entrada todo el shell, porque ya tiene persistencia, foco, safe area y coordinación de anchura. [Sidebar oficial](https://ui.shadcn.com/docs/components/radix/sidebar).

**Aceptación.** Cripto alcanzable sin conocer su URL; sección activa correcta; colapsar no desplaza logo/avatar ni desajusta el chat; herramientas secundarias no parecen nuevos productos independientes.

### U08. Estados, menús y paneles compartidos

Crear un piloto de primitivas con `Popover`, menú y diálogo/hoja en una superficie de bajo impacto, como comparación o filtros. No sobrescribir automáticamente los archivos existentes de `components/ui` con el CLI.

Definir estados coherentes: carga inicial con altura estable; actualización conservando datos; sin resultados con acción para limpiar; sin histórico con explicación; error con reintento; dato atrasado con fecha; demo visible. Evitar tanto la animación permanente como un toast por cada precio actualizado.

Conservar los contratos actuales de `Dialog`, `Sheet`, `Select`, `Tabs` y botones mediante adaptadores cuando compense migrarlos. Reemplazar el interior de un componente sólo tras probar equivalencia de foco, Escape, portales y bloqueo de scroll. Las implementaciones actuales ya resuelven parte de esto; no asumir que están ausentes.

**Aceptación.** Un overlay devuelve el foco al origen, no deja el fondo interactivo cuando es modal y no genera saltos laterales. Los avisos operativos permanecen en el contexto; toast se reserva para información temporal que no requiera decisión.

### U09. Asistente, Copiar y marketing: adopción posterior y selectiva

**Asistente.** Mantener el chat y comandos actuales. Unificar menú de mensajes, selección de activos y vista expandida de gráficos. SVG para widgets pequeños; motor financiero al ampliar. No montar un canvas pesado en cada mensaje del historial.

**Copiar.** Aplicar anatomía de tabla, leyenda y estados coherentes. Conservar avisos de ejemplo, condiciones de datos y flags. Cambiar diseño no convierte curvas simuladas en retornos reales ni habilita funciones.

**Marketing/ayuda.** Reutilizar componentes básicos cuando haya beneficio visible; conservar composición de marca y páginas públicas en servidor. Priorizar el producto antes de dedicar una fase completa a sustituir tarjetas de la landing.

**Opcionales posteriores.** Rango de fechas personalizado si hay cobertura/paginación del histórico; paneles redimensionables sólo si el uso en escritorio lo justifica; modo oscuro sólo como decisión de producto con presupuesto propio de contraste y gráficos. Ninguno es requisito de esta propuesta inicial.

## 7. Bocetos de estructura para revisar

Son esquemas de jerarquía, no diseños finales ni cotizaciones reales. Los corchetes representan datos existentes o controles propuestos.

### Ficha en escritorio

```text
[Volver]    [Logo] Empresa · símbolo token       [Favorita] [Más]

[Precio actual]  [Cambio 24 h]            |  [Comprar / Vender]
[Instrumento · fuente · actualización]   |  [Monto y moneda]
[Variación del rango]                   |  [Pagas / Recibes]
                                        |  [Coste y cotización]
[1D 1S 1M 3M 1A Todo] [Comparar] [⚙] [⛶]|  [Acción principal]
[Chips de estudios y comparados activos] |
                                        |
[             Gráfico                  ]|
[             Precio                   ]|
[   RSI / volumen sólo si activados     ]|
[Fuente del histórico · referencia]     |

[Resumen] [Empresa] [Token y riesgos]
[Datos esenciales]
[Simuladores y herramientas expandibles]
```

### Ficha móvil

```text
[Volver] [Empresa · símbolo] [Favorita] [Más]
[Precio] [24 h]     [Fuente y actualización]
[Simple / Técnico]
[1D 1S 1M 3M 1A] [Más rangos / herramientas]
[Gráfico con fecha, valor y acción ampliar]
[Contexto de fuente / período]
[Resumen / Empresa / Token]
...
[Acción principal respetando tabs y safe area]
```

### Mercado y screener

```text
[Mercado]  [Acciones] [Cripto] [Herramientas]
[Tu día: contenido relevante, altura contenida]
[Buscar] [Categoría] [Filtros] [Ordenar] [Vista]
[Filtros activos] [Limpiar]      [Alcance / frescura]
[Identidad | Precio | Cambio 24 h | Tendencia | ☆]
[Filas con la misma anatomía en todas las listas]
[Cargar más / paginación consistente]
```

### Comparador

```text
[Comparar activos]                 [Rango]
[Buscar y añadir] [Activo 1 ×] [Activo 2 ×] ...
[Ventana común / avisos de cobertura]
[Gráfico % · leyenda y cursor sincronizado]
[Tabla breve: precio · cambio período · origen]
[Simulación histórica expandible]
```

## 8. Integración sin romper el diseño existente

### Tokens y estilo

`app/globals.css` ya es la fuente de tokens: fondo blanco, superficies grises, tipografía Geist, color de marca negro, ganancias/pérdidas y radios propios. Conservarla. Mapear tokens semánticos de los componentes nuevos a los existentes, evitando introducir otro gris de texto, otro sistema de bordes u otra escala de radios.

Los tokens de shadcn son adaptables mediante variables CSS; esta es la estrategia para integrarlos con la marca. El canvas debe recibir colores CSS resueltos, no asumir que acepta expresiones `var(...)` como el SVG. Actualizar opciones cuando cambien tema o preferencias aplicables. [Temas de shadcn](https://ui.shadcn.com/docs/theming).

Mantener nombres de marca desde `site`/`NEXT_PUBLIC_BRAND_NAME`, copy en español de Chile y convenciones USD/CLP consistentes. Ganancias/pérdidas llevan signo y texto, no sólo rojo/verde. Los comparados usan una paleta estable independiente del resultado.

### Archivos propuestos, sujetos al alcance aprobado

| Capa | Archivos candidatos | Responsabilidad |
| --- | --- | --- |
| Motor nuevo | `components/charts/financial-chart.tsx` | Ciclo del gráfico, series y eventos; sin acceso directo a proveedores |
| Controles | `components/charts/chart-toolbar.tsx`, `chart-settings.tsx`, `chart-legend.tsx` | Acciones de producto y accesibilidad |
| Adaptadores | `lib/charts/adapters.ts`, `format.ts`, `capabilities.ts` | Tiempo, unidad, procedencia, precisión y opciones disponibles |
| Piloto de componentes | Subdirectorio temporal o nombres explícitos en `components/ui` | Evitar colisiones con componentes actuales; retirar duplicación al consolidar |
| Configuración shadcn | `components.json`, sólo si se decide usar su flujo de incorporación | Alias correctos y fuente de estilos existente |
| Ficha | `app/(platform)/app/accion/[ticker]/price-panel.tsx` | Integración inicial, separando responsabilidades del archivo actual |
| Gráficos posteriores | `crypto-detail-chart.tsx`, `compare-pro-screen.tsx`, `portfolio-value-chart.tsx` | Reutilizar motor con adaptaciones de dominio |
| Listas | `market-screen.tsx`, `crypto-market.tsx`, `screener-screen.tsx`, favoritas/cartera | Anatomía compartida de filas, filtros y estados |
| Búsqueda/shell | `stock-search.tsx`, `nav.ts`, `sidebar.tsx`, `market-section-chips.tsx` | Mejorar recorridos preservando contratos |
| Datos, sólo si se aprueba ampliar | Tipos, `lib/api/contracts.ts`, cliente, rutas y servicios afectados | Transportar metadatos/OHLCV reales; validación zod coherente |

No crear una API paralela para gráficos ni duplicar caches por proveedor de dibujo. Los renderizadores consumen los datos normalizados que la aplicación ya gestiona. Mantener un único lugar para lógica de rendimiento y normalización.

### Dependencias previstas

| Dependencia | Propuesta | Motivo / condición |
| --- | --- | --- |
| `lightweight-charts` | Recomendada para piloto | Motor financiero solicitado; versión estable fijada |
| Primitivas de la familia shadcn elegida | Sólo las necesarias | Popover, menú y overlays; confirmar lista exacta del código incorporado |
| `cmdk` | Condicional | Sólo si se adopta Command tras comparar con el buscador actual |
| `@tanstack/react-table` | Condicional | Selección/columnas/orden complejo del screener; no confundir con Query |
| Recharts | Posponer | Evitar un motor adicional sin necesidad real |
| Otra librería de formularios | No prevista | Ya existen React Hook Form, resolvers y zod |
| Wrapper React ajeno para Lightweight Charts | No previsto inicialmente | Un adaptador pequeño propio permite controlar versión y ciclo de vida |

Toda dependencia fuera del stack se registra con motivo en `PROGRESO.md`. Durante esta tarea no se instala ninguna.

## 9. Fases ejecutables y decisiones de aprobación

Cada fase constituye una tarea posterior independiente, con actualización de progreso y commit propio. No ejecutar todas en una sola sesión.

### Bloque A — Gráfico de acción y controles: recomendado primero

**Incluye:** G01, piloto G02, G03 y un mínimo de U08. Definición de fuentes/unidades, gráfico de línea/área, cursor, zoom, restablecer, pantalla completa, herramientas compactas y accesibilidad equivalente.

**Entregable para revisar:** una ficha en escritorio y móvil con datos del modo existente y alternativa SVG; comparación visual y funcional con la versión anterior; dependencias y tamaño medidos. Aproximación: 4–7 jornadas efectivas, separadas en tareas, después de resolver fuentes.

**Fuera del bloque:** construir OHLCV, rehacer cartera, cambiar backend de trading o rediseñar toda la navegación.

**Decisión al cerrar:** adoptar el motor nuevo, ajustar el diseño o mantener el actual. Decidir expresamente qué función cumple el iframe externo.

### Bloque B — Comparador y cripto

**Incluye:** G04, G05, selector de activos de U03 y formatos/estados comunes. Aproximación: 3–5 jornadas si no cambia la fuente de datos.

**Entregable:** comparación consistente con distinta cobertura, datos vacíos y varias precisiones; enlaces actuales conservados. La validación con series reales depende de un entorno y proveedor disponibles.

### Bloque C — Mercado, screener, favoritas y descubrimiento

**Incluye:** U01, U02, U03 y U07. Revisión del universo/paginación del screener antes de diseñar su estado final. Aproximación: 4–7 jornadas, según tabla simple o avanzada y cambios de API necesarios.

**Entregable:** recorrido de buscar → filtrar → comparar → abrir ficha, con acceso evidente a cripto en móvil. Validar utilidad con tareas concretas, no con número de componentes cambiados.

### Bloque D — Cartera y operaciones

**Incluye:** G06, U05 y U06 después de acordar semántica y revisar el handoff de seguridad. La presentación con datos actuales puede ser de alcance medio; una serie patrimonial histórica fiable requiere estimación propia tras auditar datos.

**Entregable:** posiciones legibles, detalle móvil y métricas correctamente rotuladas. El rediseño no cambia disponibilidad ni autorización de dinero real.

### Bloque E — Datos avanzados y expansión opcional

**Incluye:** G07 y, si aportan valor, U09, rango de fechas, analítica adicional o tema oscuro. Sin fecha comprometida hasta definir proveedor, cobertura, costes y derechos de uso de datos.

**Decisión:** sólo ampliar después de que el uso de los bloques anteriores justifique herramientas más avanzadas.

## 10. Cómo se verificará una implementación aprobada

En esta tarea se entrega análisis y documentación; no se corren suites ni se afirma que la implementación propuesta compila. Para cada tarea posterior: compilar y revisar visualmente sus rutas, conforme a las reglas del proyecto. La verificación integral queda para su etapa final.

### Matriz visual y de interacción

| Caso | Resultado esperado |
| --- | --- |
| 360/390/430 px | Sin desborde de página; precio/rangos/gráfico legibles; CTA y teclado no tapan decisiones |
| Tablet 768 px | Controles sin salto extraño entre móvil y escritorio |
| Escritorio 1280/1440 px | Gráfico y operación equilibrados; tabla legible; sidebar colapsado/expandido |
| Ratón, táctil y teclado | Inspección clara, scroll natural, foco visible y retorno correcto de overlays |
| Simple/Técnico/pantalla completa | Mismos datos y selección; cambios de presentación conservan contexto |
| USD/CLP; FX disponible/ausente | Unidad visible, conversión explicada, ninguna cifra USD rotulada como CLP |
| Mock/ticks/cierres/vacío/error/stale | Procedencia correcta, sin falso vivo ni números inventados |
| Activo pequeño y activo de precio alto | Precisión útil, eje y tooltip concordantes |
| Comparados con distinta cobertura | Ventana y ausencia de datos explícitas; no inventar continuidad |
| Polling durante zoom/hover | No reiniciar vista ni pisar la inspección con un remount |
| Red lenta y regreso a pestaña | Skeleton estable; datos existentes permanecen con estado de frescura |
| Persona con lector de pantalla | Resumen, controles y explorador/tabla accesibles; canvas no es la única vía |

### Medidas útiles

- Número de filas de controles antes de la curva en móvil y altura útil de gráfico.
- Peticiones por apertura y cambio de rango; aprovechar caché y lotes existentes.
- JavaScript inicial y diferido por ruta, memoria tras montar/desmontar y fluidez durante interacción.
- Tareas observables: encontrar un activo, conocer fuente/moneda, comparar dos activos y volver al listado con filtros.
- Ausencia de discrepancias entre encabezado, tooltip, tabla, dato de origen y cotización de operación cuando sean magnitudes comparables.

No fijar una mejora porcentual inventada. Tomar una línea base en producción/preview con condiciones reproducibles y comparar el mismo recorrido.

## 11. Qué conservar y qué posponer

**Conservar:** identidad actual, tokens, componentes simples que funcionan, SVG de sparklines y widgets pequeños, caché/API/servicios, preferencia Simple/Técnico, comparaciones y estudios existentes, avisos de riesgo y estados de demo.

**Posponer:** reescritura del shell, dashboards genéricos, velas sintéticas, volumen ficticio, libro de órdenes no respaldado por el producto, biblioteca adicional de gráficos por decoración, canvas por cada fila, todas las herramientas de análisis abiertas por defecto y nuevas funciones de ejecución bajo la etiqueta de diseño.

El mayor beneficio esperado es una plataforma más fácil de interpretar y recorrer: un precio con contexto claro, gráficos consistentes y controles que no ocupen más espacio que la información que ayudan a leer.

## 12. Fuentes oficiales consultadas

- [Repositorio shadcn/ui](https://github.com/shadcn-ui/ui) y [documentación](https://ui.shadcn.com/docs).
- [Temas y tokens](https://ui.shadcn.com/docs/theming).
- [Data Table](https://ui.shadcn.com/docs/components/radix/data-table), [Command](https://ui.shadcn.com/docs/components/radix/command), [Combobox](https://ui.shadcn.com/docs/components/radix/combobox) y [Sidebar](https://ui.shadcn.com/docs/components/radix/sidebar).
- [Chart/Recharts](https://ui.shadcn.com/docs/components/chart).
- [Repositorio Lightweight Charts y atribución](https://github.com/tradingview/lightweight-charts).
- [Inicio y series](https://tradingview.github.io/lightweight-charts/docs), [comparación de productos](https://tradingview.github.io/lightweight-charts/docs/product-comparison), [paneles](https://tradingview.github.io/lightweight-charts/docs/panes), [zonas horarias](https://tradingview.github.io/lightweight-charts/docs/time-zones) e [integración React](https://tradingview.github.io/lightweight-charts/tutorials/react/advanced).
- Guía local de esta versión de Next: `node_modules/next/dist/docs/01-app/02-guides/lazy-loading.md`.
