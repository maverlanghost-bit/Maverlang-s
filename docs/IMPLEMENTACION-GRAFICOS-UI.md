# Implementación del plan de gráficos e interfaz

Objetivo aprobado: implementar las 16 mejoras de `PLAN-GRAFICOS-Y-UI.md`, sin pedir aprobación por cada bloque. Estado al 17 de noviembre de 2026: alcance inicial implementado y verificado localmente, con las comprobaciones concentradas al final según la instrucción posterior de Manu. No se habilitan operaciones reales ni se despliega.

Verificación completa posterior T69: **1.969/1.969 unitarios y 87 casos de navegador aprobados, con dos omisiones previstas; lint general sin errores**. El apartado T69 al final contiene los resultados definitivos, posteriores a las corridas por grupos de T68.

## Estado por propuesta

| ID | Alcance | Estado actual |
| --- | --- | --- |
| G01 | Procedencia, frescura, moneda e histórico | Implementado y comprobado: spot/historial separados, precios originales, moneda/fecha/demo/referencia y ausencia de datos explícitas. 1D de ticks declara hasta dos días. Contratos, regresiones y fixtures de fuente verificados; las fuentes productivas conservan sus condiciones. |
| G02 | Motor financiero compartido | Implementado en acción, cripto, cartera, comparador y ampliación del asistente. Carga diferida, zoom, arrastre, cursor, actualización incremental, fullscreen, alternativa y lectura accesible. Navegador y mediciones de producción registrados; táctil emulado, sin afirmar prueba en teléfono físico. |
| G03 | Herramientas compactas | Popover/Sheet, estudios removibles, capacidades y versión alternativa. Rango y foco conservados al abrir/cerrar; revisión de capturas y comprobación sin desborde a 360/390/430 px. |
| G04 | Comparaciones coherentes | Ventana común, observaciones conocidas, fechas originales y huecos; URL y simulación coherentes. Límite de cuatro, lectura sincronizada y enfoque de leyenda comprobados; curvas atenuadas con texto legible. |
| G05 | Gráfico cripto consistente | Motor y precisión compartidos, estados sin precio/historial y gráfico antes de los metadatos. Navegación móvil, gráfico con fixture explícita y ausencia de desborde comprobados; la prueba con fuente real corresponde al entorno posterior indicado en el plan. |
| G06 | Significado del histórico de cartera | Opción inicial implementada: composición actual hipotética, cantidades/efectivo constantes, cobertura y huecos; sin muestreo futuro ni anclaje al saldo. Fuente/FX y SPYx alineado. Navegador y regresiones comprobados. El patrimonio/rendimiento real sigue siendo una ampliación de datos separada. |
| G07 | Velas, volumen y estudios verificables | Soporte condicional implementado: barras Yahoo existentes con USD/resolución/unidades verificables, sin convertir cierres DB/ticks/mock en velas. Regresiones y fixture OHLCV de navegador verifican velas, volumen y tabla. No implica permiso de redistribución ni cobertura garantizada de producción. |
| U01 | Mercado y filtros | Búsqueda API, filtros removibles, A–Z, universo visible, filas comunes, carga adicional y URL con páginas/vista comprobados. Retorno desde ficha conserva URL, filtro, búsqueda y posición; el acceso directo vuelve a Mercado. Ambos recorridos comprobados en navegador. |
| U02 | Screener y selección | Páginas uniformes de 50, universo/límite visibles, filtros/orden/columnas y selección 2–4 con URL. Límites API de 50/dos simultáneos verificados; selección, acceso al comparador y límite de cuatro comprobados en navegador. |
| U03 | Búsqueda y selectores | Implementado: `AssetPicker` compartido en comparador, ficha y Alertas, selección simple/múltiple, elegibilidad, búsqueda API, teclado, foco, carga/error/reintento y límite. La paleta única conserva identidad/emisor y procedencia; sin cmdk. Se incorporan pantalla/ruta previas de Alertas, conservando sus operaciones; otras funciones locales fuera del alcance se preservan. |
| U04 | Organización de ficha | Resumen/Empresa/Token y riesgos, gráfico/avisos fuera de pestañas y análisis expandible. Rangos y gráfico permanecen al cambiar pestañas; estadísticas, token y compra comprobados en navegador; capturas revisadas. |
| U05 | Cartera y favoritas | Menú y detalle sin salir de cartera, cantidades/costes/ausentes y privacidad explícitos. Navegador comprueba que el saldo no cambia al inspeccionar. Favoritas comparte filas y recupera nombre/precio canónicos tras normalización en mayúsculas; regresión y capturas verificadas. |
| U06 | Presentación de operaciones/billetera | Pagas/Recibes, costes, permisos y revisión nueva al cambiar lado; cierre bloqueado durante ejecución y dirección íntegra copiable. Funciones confirm preservadas salvo notificaciones UI; compra/venta/reinicio demo y guardas verificadas. Ninguna operación real; NO GO intacto. |
| U07 | Navegación y acceso móvil a cripto | Activos principales visibles, herramientas agrupadas y Alertas integrada; acceso a Cripto y retorno a Acciones. Estado móvil y captura de cripto comprobados; comportamiento de colapso del shell conservado. |
| U08 | Estados y overlays | Primitivas compatibles, portales en modal/fullscreen, foco al montar y Escape por capa. Teclado, devolución de foco, tabla dentro de fullscreen, error/vacío y reintentos comprobados. Atribución nativa accesible y controles sobre el lienzo corregidos tras axe/E2E. |
| U09 | Asistente, Copiar y marketing | Menús de mensajes y SVG temporal con ampliación financiera diferida; Copiar conserva índice estimado, metodología/tabla y ausentes. Fuentes públicas y filtros compartidos. Contratos/SSR, menú/feedback/regeneración, portada y formularios comprobados; no se monta canvas por mensaje. |

## Etapa inicial (T63)

- Dependencias exactas: `lightweight-charts@5.3.0`, `@radix-ui/react-popover@1.3.1`, `@radix-ui/react-dropdown-menu@2.2.1`. Se copiaron/adaptaron sólo componentes necesarios; no se clonaron repositorios ni se ejecutó el CLI sobre los componentes existentes.
- Históricos: `compatibleSpot` exige ticks del token + quote Jupiter no referencial y fecha real; normalización UTC/deduplicado por segundo; el spot no reescribe cierres ni series demo. Los helpers históricos de compatibilidad conservan precios originales.
- El gráfico conserva ventana al actualizar el último punto y expone zoom/restablecer/último. Las comparaciones necesitan todavía la política común de alineación de G04.
- Acciones: se eliminó el poller adicional `['quote', symbol]`; la cotización llega desde la pantalla existente. SVG se conserva como alternativa; falta de historial ya no cambia automáticamente al subyacente externo.
- Verificación ligera: TypeScript focalizado sobre los archivos de integración y dependencias, sin errores; ESLint dirigido y comprobación de diff. El build, suites, E2E, mediciones de producción y revisión visual de esta implementación están pendientes por instrucción de Manu.
- Trabajo previo: el repositorio tenía numerosos cambios locales anteriores. Se conserva un diff de referencia en `tmp/ui-approved-baseline/working.patch` (ignorado por Git); no incluir cambios ajenos en los commits de esta etapa.

## Cierre del alcance inicial

Las 16 propuestas están cubiertas en su alcance inicial. Los apartados por etapa conservan su estado histórico; la evidencia definitiva está al final de este documento. Patrimonio histórico real, pruebas en teléfono físico, cobertura y permisos productivos de fuentes, actualización de seguridad de Next.js y habilitación de dinero real requieren trabajo posterior específico. No se presentan como parte de esta entrega.

## Comparación y selección (T64)

- La ruta local `/app/comparar` ahora usa `components/charts/compare-screen.tsx`; se conserva sin modificar el antiguo archivo local no rastreado `components/domain/compare-pro-screen.tsx`. Se incorpora la ruta al commit porque forma parte del alcance aprobado.
- `lib/charts/comparison.ts` produce una vista analítica que conserva la fecha de cada observación utilizada; no interpola precios futuros. Umbral de hueco: cuatro días para cierres; tres veces la separación mediana (mínimo un minuto) para las otras series. Estos son criterios de presentación, no garantías del proveedor.
- Cada curva comienza en la misma ventana temporal. Datos ausentes tienen estado explícito. Para que los cortes sean visuales también en líneas, se crean segmentos separados: un whitespace de Lightweight Charts por sí solo puede conectar las líneas.
- La ficha reutiliza esa alineación para gráfico/leyendas y distingue fuente por activo. El benchmark elegido no se reemplaza silenciosamente por SPY cuando falla. La versión clásica se deshabilita para comparaciones con huecos; si falla el canvas, se ofrece tabla de registros.
- Popover y menús detectan el contenedor fullscreen para mantener visibles los selectores. La búsqueda compartida no ejecuta operaciones y no filtra dos veces los resultados de acciones del servidor.
- Verificación ligera: comprobaciones de ventana común, ausencia de observaciones futuras, precios preservados y cortes por huecos; TypeScript y lint dirigidos. Sin build, suite completa, E2E, servidor ni revisión visual de la implementación.

## Mercado, screener y navegación (T65)

- `components/market/asset-row.tsx` y `filter-panel.tsx` comparten anatomía de filas, selección y filtros: Popover en escritorio y Sheet en móvil. La lista principal no fuerza desplazamiento horizontal.
- El nuevo screener usa páginas homogéneas de 50 y conserva selección independiente de los filtros. El usuario amplía el catálogo explícitamente; restauración URL limitada a 20 páginas/1.000 activos, con límite visible si el catálogo fuera mayor. Tabla y mapa comparten el conjunto filtrado y los valores desconocidos no equivalen a cero.
- El cliente API divide lecturas de precios/históricos en lotes de 50 con dos solicitudes simultáneas como máximo. Un fallo del lote rechaza la lectura; se conserva el error y los datos anteriores que ofrezca Query, sin presentar totales parciales como completos.
- Las tendencias semanales preservan sus precios y usan el signo de su propio período. El contexto distingue referencia del subyacente, demostración, moneda/conversión y la observación más antigua del lote.
- Se incorpora la ruta screener y los accesos Screener/Comparar. Los componentes locales previos de screener y las rutas Mix/Alertas quedan conservados fuera del commit; sus enlaces locales también permanecen en el árbol de trabajo.
- TypeScript focalizado, ESLint dirigido, sintaxis e invariantes de lotes/estado URL/duplicados/ausentes/orden; sin verificaciones pesadas ni revisión visual de esta etapa.

## Composición de cartera y organización de información (T66)

- Se implementa la opción inicial de G06: una simulación de la composición actual, sin atribuirla al patrimonio que tuvo la cuenta. Los historiales deben cubrir todas las posiciones con cantidad positiva; valores futuros y el cierre forzado al saldo actual se eliminan. Los huecos sobreviven a memoización, comparación y renderizado.
- FinancialChart sustituye el gráfico grande de cartera, con fuente, fechas y metodología visibles. SPYx se alinea en la misma ventana y los fallos o incompatibilidades se explican. La cifra principal de saldo sigue siendo la del servicio al inspeccionar el gráfico.
- Ficha: gráfico/rango separados de las pestañas, contexto de riesgo y desviación visibles, y análisis histórico desplegable. El simulador usa los extremos de su propio historial y rotula fecha/fuente final.
- Posiciones: Sheet con detalle y menú Radix, montos ocultables, costes/resultados ausentes conservados y cantidades de acciones/tokens diferenciadas. LST/USDY vuelven a Ganar, donde ya existe la operación, sin añadir firmas ni ejecución automática.
- Favoritas: misma anatomía que Mercado y menú para comparar/quitar; se conservan alertas y se muestran errores de cotización sin borrar las filas conocidas.
- Las funcionalidades locales previas no rastreadas siguen fuera del commit. TypeScript/lint focalizados y comprobaciones de invariantes pasaron; revisión visual y verificaciones pesadas siguen aplazadas.

## Presentación de operaciones y billetera (T67)

- `QuoteExchangeSummary` sólo recibe valores de presentación; no consulta proveedores ni calcula cantidades nuevas. Acciones y cripto lo alimentan desde su cotización vigente, con costes abiertos por defecto y controles de revisión/confirmación conservados.
- Comprar/Vender de la ficha respeta disponibilidad, reinicia el formulario por clave de lado y exige una cotización nueva. La selección nunca ejecuta una operación.
- Sheet/Overlay admiten `dismissible` (por defecto verdadero). Las hojas de operación lo desactivan desde el inicio de confirmar hasta finalizar firma/envío/sondeo; foco y scroll siguen en sus implementaciones existentes. Los demás consumidores conservan su contrato.
- El envío mantiene la dirección completa y añade copia en la revisión, sin tocar validaciones ni la ejecución. Las funciones confirm de acción y cripto se compararon por AST con su base: las únicas adiciones son las notificaciones de UI ocupada.
- TypeScript/lint focalizados y diff; sin build, suite completa, E2E, servidor ni revisión visual/operaciones. No se habilita dinero real ni se incluyen cambios locales de órdenes límite o destinatarios.

## Integración final y datos históricos (T68)

- `PricePoint` y HTTP transportan OHLCV opcional y `HistoryMetadata`. El fallback Yahoo ya existente conserva barras reales cuando moneda/resolución/unidades son verificables; el respaldo DB sigue primero y sus cierres no se convierten en velas. Ticks y mock conservan sus límites. No se añade proveedor ni se fuerza cobertura.
- El motor y las herramientas exigen capacidades y campos completos. Volumen del subyacente sin FX/multiplicador, última barra potencialmente en formación, indicadores en períodos diarios compatibles. Datos faltantes, incompatibilidad de comparación y fallos de actualización conservan su significado.
- Rankings usan las mismas observaciones de su cálculo para fuente y fechas, incluido spark separado; servicio `market.today` conserva presupuesto, orden, caché y validación de ruta. Las superficies públicas distinguen muestras, referencias y datos recientes sin fabricar fechas.
- El asistente conserva metadatos opcionales y compatibilidad con mensajes antiguos. SVG por mensaje y motor sólo al ampliar; menús mantienen copiar/voz/feedback/regenerar/compartir. Copiar conserva estimación y límites de cobertura, fechas reales y lectura alternativa de registros.
- Primitivas mantienen contratos, portales anidados y foco al montar; filtros compartidos son presentacionales y no exigen autenticación. Históricos, cotizaciones y moneda coinciden con la unidad que se presenta.
- Las comprobaciones se concentraron al final del conjunto. Se corrigieron expectativas antiguas, dependencias SSR, precisión/procedencia, favoritos, capas del gráfico y conservación de datos al fallar una actualización. Resultados definitivos a continuación.

## Evidencia de cierre — 17 de noviembre de 2026

- Build de producción: JavaScript, TypeScript y generación de 547 páginas completados (`final-verified-build.log`). ESLint de 92 archivos aprobados y de las correcciones posteriores, sin errores; última ejecución dirigida con salida 0 (`final-verified-lint.log`).
- Unitarios: última corrida completa, 197 archivos, 1.965/1.966 pruebas aprobadas; el único fallo restante era una expectativa estática anterior de filtros. Se corrigió y su archivo pasó 18/18, repetido tras el último cambio de texto demo (`final-verified-static.log`). Las regresiones nuevas de contexto y normalización de favoritas también pasaron. No se afirma una nueva corrida completa posterior.
- Navegador: la corrida inicial de 83 casos encontró fallos que se corrigieron y repitieron por grupos; incluye dos omisiones previstas por configuración (auth real y depósito deshabilitado). Las repeticiones comprobaron compra/venta/reinicio demo, filtros, teclado/Escape/fullscreen/tabla, fixture OHLCV, asistente, Alertas, comparación y recorridos móviles. Último grupo: 6/6, con curvas diferenciadas, vacío/error, cartera que conserva registros tras fallo de rango y reintenta, favoritas canónicas, aviso demo y retorno al Mercado con estado (`final-verified-browser.log`). Grupo anterior de interacción/selección: 5/5.
- Capturas con las curvas cargadas de comparador y cartera revisadas, además de ficha, cripto, posición y favoritas. Ancho comprobado a 360/390/430 px; gestos táctiles emulados y arrastre/zoom de escritorio comprobados. Las series y OHLCV interceptadas en estas pruebas son fixtures explícitas, no evidencia de cobertura productiva.
- Medición del artefacto final: chunk diferido del motor y su interfaz `2dubhuwki911a.js`, 185.672 bytes sin comprimir / 60.179 gzip. No es el incremento total de la aplicación ni una comparación con una base anterior. En 45 intervalos rAF por prueba: mediana 16,7 ms; p95 táctil emulado 16,7 ms y escritorio 33,4 ms. Mediciones locales, sin promesa de rendimiento en teléfonos físicos.
- G06 conserva la composición actual hipotética, separada del saldo real. G07 ofrece velas/volumen sólo si hay barras y metadatos compatibles; no certifica licencias, redistribución ni cobertura. El aviso global de demo ya no promete precios reales cuando se usan muestras.
- Una compilación anterior emitió la alerta de seguridad de la versión instalada de Next.js; el reintento y los builds posteriores completaron. La alerta queda pendiente de una tarea de actualización antes de producción; esta entrega no cambia dependencias adicionales ni declara seguridad productiva.
- Tres agentes GPT-6.1 Terra con razonamiento medio colaboraron en implementación y revisión. Staging selectivo preservó cambios locales previos; se corrigió también la ubicación del estado de retorno en la variante del índice. Sin migraciones, cambios de flags, push, despliegue ni firmas/envíos reales. El NO GO de dinero real del handoff sigue vigente.

Los logs, mediciones y capturas locales citados se conservan en `tmp/ui-approved-baseline/` (ignorado por Git). La revisión de las variantes selectivas fue por lectura; el build y el navegador verificaron el árbol de trabajo, que además contiene funciones locales ajenas excluidas del commit.

## Verificación completa posterior — T69, 17 de noviembre de 2026

Manu pidió completar las comprobaciones. Se ejecutaron todas las pruebas unitarias y toda la suite demo de navegador sobre el producto del build final de T68. Los resultados anteriores se conservan como registro histórico; estos son los resultados completos definitivos:

| Comprobación | Resultado | Evidencia local en `tmp/ui-approved-baseline/` |
| --- | --- | --- |
| Unitarios completos, dos trabajadores | Salida 0; 199/199 archivos, 1.969/1.969 pruebas, 379 s | `t69-full-unit-final.log` |
| Navegador completo, un trabajador | Salida 0; 87 aprobados, 2 omitidos, cero fallos, 19,7 min | `t69-full-browser.log` |
| ESLint general de las carpetas de código y configuraciones | Salida 0; cero errores y 26 advertencias de variables sin uso | `t69-full-lint.log` |

- La primera corrida unitaria detectó una expectativa textual antigua en `reference-series.test.ts`: buscaba las fuentes de las consultas actuales. Se actualizó para exigir las fuentes de la serie realmente visible, que puede ser el historial conservado durante un error. Todas las demás guardas permanecen; se repitió la suite completa después del cambio.
- Las dos omisiones del navegador son el acceso con Supabase real y el depósito en pesos deshabilitado por configuración. Los 87 casos aprobados cubren accesibilidad/teclado, onboarding, compra/venta/reinicio demo, billetera, ficha, mercado, portada/idioma, presupuestos de rendimiento, guardas/CSRF/CSP y todas las pruebas nuevas de gráficos, interacción y retorno con estado.
- Las 26 advertencias de lint están en `tests/unit/wallet-withdrawals-d02.test.ts`, que contiene trabajo local previo ajeno a estas mejoras. Se conserva sin modificar y fuera del commit T69.
- T69 sólo modifica la expectativa estática y este registro; el navegador reutilizó el artefacto `.next-e2e` de producción ya compilado con TypeScript en T68. El árbol local probado incluye cambios anteriores que se mantienen fuera de los commits de esta tarea.
- Apoyo GPT-6.1 Terra con razonamiento medio para unitarios/lint. Sin operaciones reales, migraciones, cambios de flags, dependencias, push ni despliegue. Los límites de fuentes/licencias, teléfono físico y seguridad productiva registrados en T68 siguen vigentes.
