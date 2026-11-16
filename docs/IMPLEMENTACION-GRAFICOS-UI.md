# Implementación del plan de gráficos e interfaz

Objetivo aprobado: implementar las 16 mejoras de `PLAN-GRAFICOS-Y-UI.md`. Manu realizará la autorización de las verificaciones pesadas más adelante; no ejecutar build de producción, suites completas ni E2E hasta entonces. La aprobación incluye continuar con todos los bloques, sin pedir aprobación otra vez por cada etapa.

## Estado por propuesta

| ID | Alcance | Estado actual |
| --- | --- | --- |
| G01 | Procedencia, frescura, moneda e histórico | En curso: ficha distingue cotización/demo/subyacente; sólo se extienden ticks compatibles y fechados; eliminado reescalado histórico en helpers; destacado respeta moneda. Revisar etiquetas y métricas de las otras superficies. |
| G02 | Motor financiero compartido | Implementado en ficha de acción y cripto: carga diferida de Lightweight Charts 5.3, zoom, cursor, actualización incremental, pantalla completa, tabla/selector accesibles, alternativa SVG y atribución. Expandido también a cartera; otras superficies y revisión visual pendientes. |
| G03 | Herramientas compactas | Implementado en ficha: controles secundarios en Popover/Sheet; estudios activos removibles; versión SVG y subyacente externo explícitos. Revisión visual pendiente. |
| G04 | Comparaciones coherentes | Implementado en página y ficha: motor común, ventana compartida, base común temporal, lectura de registros conocidos sin buscar datos futuros, fechas originales y cortes por vacíos. Activos/rango en URL, errores/cobertura visibles, leyendas y simulación con la misma variación. Revisión visual pendiente. |
| G05 | Gráfico cripto consistente | Implementado el motor, formatos, contexto y estados sin datos; ficha reordenada como gráfico → operación → metadatos en móvil. Revisión visual pendiente. |
| G06 | Significado del histórico de cartera | Implementada la opción inicial: composición actual hipotética, efectivo/cantidades constantes, sin muestreo futuro ni cierre forzado al saldo, cobertura completa y huecos; saldo actual separado, fuente/fechas/FX explícitos y SPYx alineado. No se afirma patrimonio o rendimiento personal histórico; esa opción completa requiere datos adicionales. Revisión visual pendiente. |
| G07 | Velas, volumen y estudios verificables | Motor preparado y opciones condicionadas a datos válidos; falta extender contratos y resolver cobertura/fuente real. No se inventan barras ni volumen. |
| U01 | Mercado y filtros | Implementado en código: búsqueda API, filtros removibles, A–Z, alcance visible del ranking/favoritas, filas comunes, carga adicional y URL con páginas/vista. Revisión visual pendiente. |
| U02 | Screener y selección | Implementado en código: páginas fijas de 50, universo cargado/total, ampliación explícita, filtros/orden/columnas, tabla y móvil, selección 2–4 conservada al filtrar y URL. Lotes API limitados a 50 y dos en paralelo. Revisión visual pendiente. |
| U03 | Búsqueda y selectores | En curso: `AssetPicker` compartido para comparador y ficha, con búsqueda API, teclado, foco Radix, agrupación por tipo y límite de selección. Búsqueda global conservada y mejorada: identidad/emisor, demo/referencia/atraso, carga visible y fullscreen; sin instalar cmdk. Revisión visual pendiente. |
| U04 | Organización de ficha | Implementado en código: Resumen/Empresa/Token y riesgos, gráfico y avisos materiales fuera de pestañas, herramientas/simulaciones expandibles y extremos de simulación coherentes con el historial. Revisión visual pendiente. |
| U05 | Cartera y favoritas | Implementado en código: menú/detalle de posición sin abandonar cartera, costes/resultados desconocidos explícitos, unidades diferenciadas, LST hacia Ganar; favoritas reutiliza fila de Mercado y ofrece comparar/quitar, estados y fuentes coherentes. Revisión visual pendiente. |
| U06 | Presentación de operaciones/billetera | Implementado en código: Pagas/Recibes de cotización fresca, costes expandibles, Comprar/Vender con permisos existentes y nueva revisión al cambiar lado, hoja no descartable durante ejecución, dirección íntegra copiable al revisar envío. Funciones confirm preservadas salvo notificaciones UI. Revisión visual/operativa pendiente; NO GO real sin cambios. |
| U07 | Navegación y acceso móvil a cripto | Implementado en código: tipos de activo visibles y herramientas agrupadas; acceso a Cripto desde Mercado y retorno a Acciones desde Cripto/Ganar. Mercado activo en las rutas cripto móviles, sección Cripto separada en escritorio. Revisión visual pendiente. |
| U08 | Estados y overlays | En curso: Popover/Dropdown Menu de shadcn adaptados a tokens; portales respetan fullscreen; herramientas con foco Radix/hoja existente. Integración en otras superficies pendiente. |
| U09 | Asistente, Copiar y marketing | Pendiente. |

## Etapa inicial (T63)

- Dependencias exactas: `lightweight-charts@5.3.0`, `@radix-ui/react-popover@1.3.1`, `@radix-ui/react-dropdown-menu@2.2.1`. Se copiaron/adaptaron sólo componentes necesarios; no se clonaron repositorios ni se ejecutó el CLI sobre los componentes existentes.
- Históricos: `compatibleSpot` exige ticks del token + quote Jupiter no referencial y fecha real; normalización UTC/deduplicado por segundo; el spot no reescribe cierres ni series demo. Los helpers históricos de compatibilidad conservan precios originales.
- El gráfico conserva ventana al actualizar el último punto y expone zoom/restablecer/último. Las comparaciones necesitan todavía la política común de alineación de G04.
- Acciones: se eliminó el poller adicional `['quote', symbol]`; la cotización llega desde la pantalla existente. SVG se conserva como alternativa; falta de historial ya no cambia automáticamente al subyacente externo.
- Verificación ligera: TypeScript focalizado sobre los archivos de integración y dependencias, sin errores; ESLint dirigido y comprobación de diff. El build, suites, E2E, mediciones de producción y revisión visual de esta implementación están pendientes por instrucción de Manu.
- Trabajo previo: el repositorio tenía numerosos cambios locales anteriores. Se conserva un diff de referencia en `tmp/ui-approved-baseline/working.patch` (ignorado por Git); no incluir cambios ajenos en los commits de esta etapa.

## Próximo trabajo

Continuar G07 y U09, y cerrar las restantes superficies G01/U08. Mantener este registro por propuesta; no considerar finalizado el objetivo mientras queden propuestas pendientes.

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
