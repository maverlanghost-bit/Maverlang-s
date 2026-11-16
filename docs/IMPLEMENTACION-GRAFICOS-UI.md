# Implementación del plan de gráficos e interfaz

Objetivo aprobado: implementar las 16 mejoras de `PLAN-GRAFICOS-Y-UI.md`. Manu realizará la autorización de las verificaciones pesadas más adelante; no ejecutar build de producción, suites completas ni E2E hasta entonces. La aprobación incluye continuar con todos los bloques, sin pedir aprobación otra vez por cada etapa.

## Estado por propuesta

| ID | Alcance | Estado actual |
| --- | --- | --- |
| G01 | Procedencia, frescura, moneda e histórico | En curso: ficha distingue cotización/demo/subyacente; sólo se extienden ticks compatibles y fechados; eliminado reescalado histórico en helpers; destacado respeta moneda. Revisar etiquetas y métricas de las otras superficies. |
| G02 | Motor financiero compartido | Implementado en ficha de acción y cripto: carga diferida de Lightweight Charts 5.3, zoom, cursor, actualización incremental, pantalla completa, tabla/selector accesibles, alternativa SVG y atribución. Expansión y revisión visual pendientes. |
| G03 | Herramientas compactas | Implementado en ficha: controles secundarios en Popover/Sheet; estudios activos removibles; versión SVG y subyacente externo explícitos. Revisión visual pendiente. |
| G04 | Comparaciones coherentes | Implementado en página y ficha: motor común, ventana compartida, base común temporal, lectura de registros conocidos sin buscar datos futuros, fechas originales y cortes por vacíos. Activos/rango en URL, errores/cobertura visibles, leyendas y simulación con la misma variación. Revisión visual pendiente. |
| G05 | Gráfico cripto consistente | Implementado el motor, formatos, contexto y estados sin datos; ficha reordenada como gráfico → operación → metadatos en móvil. Revisión visual pendiente. |
| G06 | Significado del histórico de cartera | Pendiente: distinguir reconstrucción de composición actual de patrimonio/rendimiento real. |
| G07 | Velas, volumen y estudios verificables | Motor preparado y opciones condicionadas a datos válidos; falta extender contratos y resolver cobertura/fuente real. No se inventan barras ni volumen. |
| U01 | Mercado y filtros | Pendiente. |
| U02 | Screener y selección | Pendiente. |
| U03 | Búsqueda y selectores | En curso: `AssetPicker` compartido para comparador y ficha, con búsqueda API, teclado, foco Radix, agrupación por tipo y límite de selección. Búsqueda global existente pendiente de pulido. |
| U04 | Organización de ficha | Pendiente. |
| U05 | Cartera y favoritas | Pendiente. |
| U06 | Presentación de operaciones/billetera | Pendiente; handoff de auditoría leído. Mantener lógica de firma y guardas. |
| U07 | Navegación y acceso móvil a cripto | Pendiente. |
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

Continuar U01/U02/U03/U07 (mercado, screener, búsqueda global, navegación) y después las pantallas de cartera/operaciones. Mantener este registro por propuesta; no considerar finalizado el objetivo mientras queden propuestas pendientes.

## Comparación y selección (T64)

- La ruta local `/app/comparar` ahora usa `components/charts/compare-screen.tsx`; se conserva sin modificar el antiguo archivo local no rastreado `components/domain/compare-pro-screen.tsx`. Se incorpora la ruta al commit porque forma parte del alcance aprobado.
- `lib/charts/comparison.ts` produce una vista analítica que conserva la fecha de cada observación utilizada; no interpola precios futuros. Umbral de hueco: cuatro días para cierres; tres veces la separación mediana (mínimo un minuto) para las otras series. Estos son criterios de presentación, no garantías del proveedor.
- Cada curva comienza en la misma ventana temporal. Datos ausentes tienen estado explícito. Para que los cortes sean visuales también en líneas, se crean segmentos separados: un whitespace de Lightweight Charts por sí solo puede conectar las líneas.
- La ficha reutiliza esa alineación para gráfico/leyendas y distingue fuente por activo. El benchmark elegido no se reemplaza silenciosamente por SPY cuando falla. La versión clásica se deshabilita para comparaciones con huecos; si falla el canvas, se ofrece tabla de registros.
- Popover y menús detectan el contenedor fullscreen para mantener visibles los selectores. La búsqueda compartida no ejecuta operaciones y no filtra dos veces los resultados de acciones del servidor.
- Verificación ligera: comprobaciones de ventana común, ausencia de observaciones futuras, precios preservados y cortes por huecos; TypeScript y lint dirigidos. Sin build, suite completa, E2E, servidor ni revisión visual de la implementación.
