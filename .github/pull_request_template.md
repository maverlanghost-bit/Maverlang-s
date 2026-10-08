<!-- Plantilla de PR (M87-base). Marcar todo lo que aplique antes de pedir revisión. -->

## Qué cambia

<!-- Resumen corto + tarea (Mnn) -->

## Verificación

- [ ] Criterios de aceptación del prompt cumplidos (uno por uno en PROGRESO.md, con comando/test/archivo; si alguno no se pudo comprobar sin build o servidor, decirlo con todas sus letras).
- [ ] Checks del prompt pasados: `npx tsc --noEmit`, `npm run lint`, `npm test` (y los que pida la tarea: HTTP, SQL o pantalla, corridos por el operador con datos reales).
- [ ] Capturas adjuntas (sólo si hay UI: antes/después en 360 y 1280).
- [ ] Migraciones aplicadas en desarrollo en orden (sólo si la tarea trae migración; nunca se commitean aplicadas, sólo el SQL).

## Riesgo

- [ ] Sin secretos en el diff (`git grep -n "sb_secret_"` sin claves; nada de `.env.local`).
- [ ] Sin cambios fuera del alcance de la tarea.
