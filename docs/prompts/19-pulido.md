# T19 — Pulido visual, accesibilidad y rendimiento
Lee: `PROGRESO.md`, `docs/DESIGN-SYSTEM.md` §5 y §7.

Haz una pasada por todas las rutas (landing y /app):
1. Aplica el checklist §7 pantalla por pantalla; corrige inconsistencias de espaciado, tipografía y colores.
2. Motion: transiciones de Sheet/Tabs con `--ease-spring`, press states, NumberFlow en precios/totales, reveal en landing.
3. Accesibilidad: foco, orden de tabulación, labels, `aria-live` en precios/estados, contraste.
4. Responsive 360 / 768 / 1280 sin scroll horizontal.
5. Copy es-CL: tono, formatos numéricos, sin anglicismos innecesarios.
6. Rendimiento: `next/image`, fuentes con `display: swap`, dynamic import de `lightweight-charts` y QR, landing estática.
Lista lo corregido y lo pendiente en PROGRESO.md.

Listo cuando: checklist sin pendientes críticos.
Al terminar: PROGRESO.md + commit `T19: pulido`.
