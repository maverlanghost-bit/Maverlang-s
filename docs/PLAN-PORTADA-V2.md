# Plan: portada v2 (T90)

Pedido de Manu (2026-11-22): la portada "se ve como muy texto, mucha IA", el hero "es lamentable". Quiere tarjetas, animaciones y que se vea mucho mejor. Dirección elegida: **broker premium vivo**. Antislop en modo **durante**.

## Diagnóstico de la portada actual (T70)

- 9.968 px de alto en escritorio y nueve bloques. Casi todo es prosa en columnas.
- Hero de plantilla: píldora sobre el H1, H1 centrado, dos botones gemelos y un mosaico (bento) de seis tarjetas.
- "Tres pasos" (1-2-3) y "Seis reglas" (seis tarjetas iguales) son los patrones típicos de página hecha por IA.
- Rótulos en mono mayúscula con tracking ancho sobre cada sección ("CÓMO FUNCIONA", "POR QUÉ", "COSTOS").
- Rayas (—) en el copy y el mismo aviso de horario repetido en tres lugares.

## Design Read

Portada de un broker de acciones tokenizadas para inversionistas minoristas chilenos, con lenguaje monocromo premium y los números como protagonistas. Diales **ENERGY 2 / RHYTHM 3 / MOTION 2**.

- **Foco por pantalla:** un solo elemento dominante en cada sección (el teléfono del hero, la cifra del calculador, la franja horaria, el 0 %).
- **Acento único:** el verde de "Compra realizada" (círculo con check). Es el momento de marca que ya existe en la plataforma (T85), y aparece una vez en el hero.
- **Motivo de identidad:** cifras en Geist Mono que cambian en vivo (precio, fracción, hora). Es el principio 3 del design system ("los números son protagonistas").
- **Paleta:** la de siempre (negro, grises, verde/rojo semántico). No se agregan colores.

## Estructura nueva (6 bloques + cinta, objetivo ~5.000 px en escritorio)

1. **Hero dividido.** A la izquierda: H1 (se mantiene), bajada corta sin rayas, CTA "Prueba la demo gratis" y enlace "Ver las acciones". Debajo, tres datos reales en mono: mínimo US$10 (`LANDING_MIN_ORDER_USD`), 24/7 on-chain y comisión 0 % en el lanzamiento. A la derecha, un **teléfono animado** con el flujo real de compra y precios en vivo:
   1. mercado;
   2. toque en Apple;
   3. sube la hoja de compra;
   4. se elige la burbuja de US$50;
   5. "Compra realizada" con check verde.

   El teléfono tiene botón de pausa, se detiene fuera de vista y queda estático con `prefers-reduced-motion`. Va rotulado como ejemplo.
2. **Cinta de precios** (se conserva).
3. **"No necesitas una acción entera."** Calculadora interactiva: eliges la acción y el monto, y ves cuántas acciones recibes y qué parte de una acción es, con un anillo que se llena. Usa el precio en vivo de la misma cotización.
4. **Banda negra 24/7** (la única invertida). Barra de 24 horas con la sesión de Nueva York marcada y un marcador "ahora" calculado en el navegador, más la semana bolsa vs. on-chain. Conserva el aviso de liquidez fuera de horario (una sola vez).
5. **"Es tuyo. Y esto no lo es."** Dos tarjetas de distinto peso: lo que tienes (grande) y lo que no tienes (menor), más el enlace a Seguridad. La arquitectura detallada queda en `/seguridad`.
6. **Costos en una franja.** Un "0 %" grande y los cuatro conceptos en lista corta, más el enlace a `/costos`, donde sigue el simulador.
7. **Preguntas** y **cierre** (se conservan; se quitan las rayas y los rótulos mono).

Salen de la portada `FeatureGrid` ("Seis reglas") y `HowItWorks`, que siguen en `/como-funciona`, además del bento del hero. Su contenido queda cubierto por el hero, el calculador, la banda y la sección de billetera.

## Reglas que se respetan

- Sin cifras inventadas: precios de `getLandingQuotes()`, mínimo de la constante y 0 % de la tabla de costos existente.
- Copy sin rayas y sin palabras de moda. CTAs específicos.
- Avisos obligatorios presentes una vez: origen de precios, horario y liquidez, no custodia y riesgos.
- Móvil primero: sin desborde a 360 px, objetivos táctiles de 44 px. La animación respeta el movimiento reducido y lleva pausa.
- Verificación liviana (tipos, lint de lo tocado, navegador). Build y suite completa sólo cuando Manu lo pida.
