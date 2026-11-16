# Implementación del plan de gráficos e interfaz

Objetivo aprobado: implementar las 16 mejoras de `PLAN-GRAFICOS-Y-UI.md`. Manu realizará la autorización de las verificaciones pesadas más adelante; no ejecutar build de producción, suites completas ni E2E hasta entonces. La aprobación incluye continuar con todos los bloques, sin pedir aprobación otra vez por cada etapa.

## Estado por propuesta

| ID | Alcance | Estado actual |
| --- | --- | --- |
| G01 | Procedencia, frescura, moneda e histórico | En curso: ficha distingue cotización/demo/subyacente; sólo se extienden ticks compatibles y fechados; eliminado reescalado histórico en helpers; destacado respeta moneda. Revisar etiquetas y métricas de las otras superficies. |
| G02 | Motor financiero compartido | Implementado en ficha de acción y cripto: carga diferida de Lightweight Charts 5.3, zoom, cursor, actualización incremental, pantalla completa, tabla/selector accesibles, alternativa SVG y atribución. Expansión y revisión visual pendientes. |
| G03 | Herramientas compactas | Implementado en ficha: controles secundarios en Popover/Sheet; estudios activos removibles; versión SVG y subyacente externo explícitos. Revisión visual pendiente. |
| G04 | Comparaciones coherentes | Pendiente: trasladar comparador de página al motor común, alinear ventanas y cursor, cobertura y URL. |
| G05 | Gráfico cripto consistente | Implementado el motor, formatos, contexto y estados sin datos; ficha reordenada como gráfico → operación → metadatos en móvil. Revisión visual pendiente. |
| G06 | Significado del histórico de cartera | Pendiente: distinguir reconstrucción de composición actual de patrimonio/rendimiento real. |
| G07 | Velas, volumen y estudios verificables | Motor preparado y opciones condicionadas a datos válidos; falta extender contratos y resolver cobertura/fuente real. No se inventan barras ni volumen. |
| U01 | Mercado y filtros | Pendiente. |
| U02 | Screener y selección | Pendiente. |
| U03 | Búsqueda y selectores | Pendiente. |
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

Completar G04 con una ventana comparable explícita y el motor compartido, continuar U01/U02/U03/U07 y después las pantallas de cartera/operaciones. Mantener este registro por propuesta; no considerar finalizado el objetivo mientras queden propuestas pendientes.
