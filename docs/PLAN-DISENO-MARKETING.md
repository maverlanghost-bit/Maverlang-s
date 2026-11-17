# Plan de rediseño — portada y páginas previas a la plataforma

**Fecha:** 2026-11-17 · **Estado:** propuesta, pendiente de aprobación de Manu · **Código de producto:** sin cambios.

**Alcance:** todo lo que se ve antes de entrar a la app — `app/(marketing)` (`/`, `/acciones`, `/acciones/[slug]`, `/categorias`, `/comparar`, `/guias`, `/como-funciona`, `/costos`, `/seguridad`, `/ayuda`, `/legal/*`, 404/error) y las pantallas de acceso (`/app/ingresar`, `/app/registro`, `/app/recuperar`, `/app/restablecer`, `/app/ingresar/verificar`).
**Fuera de alcance:** la plataforma (`/app/*` una vez dentro), lógica de auth, datos, textos legales y cifras de negocio.

**Cómo se revisó:** sitio local en `DATA_MODE=mock`. Vistas en navegador a 1440 px: portada completa, `/acciones`, ficha de Apple, `/como-funciona`, `/costos`, `/guias`, ingreso y registro; portada también a 375 px. Código leído: portada, hero, pasos, reglas, cierre, header y `app/globals.css`. Referencia: ui.shadcn.com en vivo (portada, bloques y lista de componentes).
**No vistas en navegador:** `/categorias`, `/comparar`, `/seguridad` como página propia, `/ayuda` y `/legal/*`. Lo que se propone para ellas en el §7 sale del patrón común y de la estructura de archivos; se confirma al empezar cada etapa.

---

## 1. Diagnóstico: qué pasa hoy

La base es buena: Geist, monocromo, hairlines, copy honesto y accesibilidad cuidada. El problema no es de gusto, es de **jerarquía y de ritmo**.

| # | Hallazgo | Dónde |
|---|----------|-------|
| 1 | **El producto no aparece.** La portada describe la app con texto y una tabla de cuatro precios; no hay una sola imagen de cómo se ve operar. | Hero, "Tres pasos", "Cuatro reglas" |
| 2 | **Todas las secciones tienen la misma forma:** título a la izquierda, entradilla, grilla separada por hairlines. Sin cambios de superficie ni de composición, el ojo no distingue una sección de otra. | Toda la portada |
| 3 | **Mucho vacío sin intención.** A 1440 px el texto ocupa la mitad izquierda y la derecha queda en blanco; entre secciones hay franjas vacías de alto comparable al contenido. La portada mide 7.500 px en escritorio y 11.256 px en móvil (unas 14 pantallas). | Portada y cabeceras de páginas internas |
| 4 | **Escala tipográfica plana.** H1 48 px, H2 34 px, H3 18 px, cuerpo 14 px, todo en peso medio. Los títulos de sección no mandan y el cuerpo queda chico para una página de marketing. | `section.tsx`, `hero.tsx` |
| 5 | **Los "mocks" son texto suelto.** En "Tres pasos", cada ejemplo es una línea de cifras dentro de un espacio reservado mucho mayor. | `how-it-works.tsx` |
| 6 | **Avisos repetidos.** "Precios ilustrativos", "nosotros no custodiamos tus activos" y la nota de horario aparecen en casi cada sección. Son necesarios, pero repetidos compiten con el mensaje. | Hero, pasos, cinta, reglas, seguridad, cierre |
| 7 | **El header no tiene llamado a la acción.** Navegación pegada a la derecha y "Entrar" como texto; el botón de la demo desaparece al bajar. | `site-header.tsx` |
| 8 | **Cierre sobrecargado.** Manifiesto, tabla de horarios, tres viñetas, dos botones, un enlace y la tarjeta de lista de espera en un mismo bloque. | `final-cta.tsx` |
| 9 | **En móvil, cada fila de precio repite su metadato** ("24 h · Cotización del token · USD") y ocupa tres líneas. | Hero a 375 px |
| 10 | **Acceso sin contexto.** Ingreso y registro son una tarjeta angosta sobre blanco; los campos con relleno gris parecen deshabilitados. | `/app/ingresar`, `/app/registro` |
| 11 | **Páginas internas calcadas.** Rótulo + H1 + párrafo + línea de datos, siempre a la izquierda. El catálogo es una lista de texto; la ficha pública no muestra un gráfico en las primeras pantallas. | `/acciones`, `/costos`, `/guias`, `/acciones/[slug]` |

## 2. Qué tomar de shadcn/ui (y qué no)

Medido en su portada: Geist (la misma fuente que ya usamos), H1 de 48 px en peso 600 con tracking −2,4 px, bajada de 18 px, par de botones compacto y, **inmediatamente debajo, una grilla densa de interfaz real** en tarjetas de radio medio, borde de bajo contraste y una superficie apenas distinta del fondo.

**Tomar:**
- Hero corto y, pegado a él, el producto real en tarjetas (bento).
- Títulos más pesados y apretados; cuerpo más grande.
- Tres niveles de superficie (fondo, tarjeta, apagado) en vez de sólo líneas.
- Header con la navegación junto al logo y las acciones a la derecha.
- Bloques de acceso en dos columnas (`login-03` / `login-04`).
- Componentes: Navigation Menu, Tabs, Accordion, Card, Badge, Breadcrumb, Tooltip, Hover Card, Carousel, Empty, Skeleton, Kbd.

**No tomar:** el modo oscuro como base (el sistema es "modo claro"), los nombres de tokens (`--background`, `--primary`; los nuestros ya están en uso en toda la app) ni instalar la CLI: se copian componentes selectivos a `components/ui`, como en T63.

## 3. Principios del rediseño

1. **Mostrar, no describir.** Cada afirmación va con una pieza de interfaz real alimentada por `getLandingQuotes()`. Ninguna cifra inventada.
2. **Monocromo con datos en color.** Negro, blanco y grises; verde y rojo sólo para variaciones.
3. **Ritmo por contraste.** Ninguna sección repite la composición de la anterior: centrado → bento → dividido → banda invertida.
4. **Decir cada aviso una vez, bien.** Los avisos legales se consolidan en el lugar donde importan; no se elimina ninguno.
5. **Misma honestidad, mejor forma.** No cambia ninguna promesa ni dato de negocio.

## 4. Fundaciones (sólo marketing)

| Tema | Hoy | Propuesta |
|------|-----|-----------|
| H1 portada | 48 px / 500 | 56–64 px en `lg`, peso 600, tracking −0,04em; 36 px en móvil |
| H2 sección | 34 px / 500 | 40–44 px, peso 600 |
| Cuerpo marketing | 14 px | 16 px mínimo; entradilla 18 px |
| Contenedor | `max-w-7xl` con texto a media caja | `max-w-6xl` y grilla de 12 columnas |
| Superficies | blanco + hairline | blanco · `surface-1` (tarjeta) · banda invertida `fg` |
| Radio de tarjeta | `rounded-3xl` | `rounded-2xl` en bento; `rounded-3xl` en marcos de producto |
| Sombras | sólo flotantes | se suma **una**: marco de producto (`shadow-float`) |
| Aire vertical | 56–96 px fijos | 64 / 96 / 128 px según peso de la sección |
| Movimiento | `Reveal` por bloque | entrada escalonada del bento, cifras que cuentan, transición entre pestañas; todo anulado con `prefers-reduced-motion` |

**Piezas nuevas en `components/landing/`:** `SectionHeader` (variantes centrada, dividida, con rótulo), `BentoGrid` / `BentoCard`, `ProductFrame` (marco de navegador y de teléfono), `StatTile`, `InvertedBand`, `PageHero`.
**Componentes shadcn a incorporar:** Navigation Menu (requiere `@radix-ui/react-navigation-menu`), Breadcrumb, Hover Card; Carousel sólo si se aprueba `embla-carousel-react`. `framer-motion` ya está instalado.

## 5. Header y footer

- **Header:** logo y navegación agrupados a la izquierda; a la derecha "Entrar" (ghost) y **"Probar la demo"** (píldora negra, siempre visible). Fondo translúcido con desenfoque y hairline al bajar.
- **"Explorar" como panel:** Categorías, Comparar y Guías con una línea de descripción cada una, más una tarjeta con una acción del catálogo.
- **Móvil:** hoja lateral con la navegación y el botón de la demo fijo abajo.
- **Footer:** cuatro columnas, logotipo grande al pie y una sola franja con el aviso legal general.

## 6. Portada nueva

De diez bloques a ocho, cada uno con una composición distinta.

```
┌──────────────────────────────────────────────────────────────┐
│ 1 HERO (centrado)                                            │
│     [Comisión 0% en el lanzamiento]                          │
│     Acciones de EE.UU. tokenizadas, en tu billetera          │
│     Fracciones desde US$10 · 24/7 · autocustodia             │
│     [Prueba la demo gratis]  [Ver acciones]                  │
│  ┌───────────────┬───────────────────────┬────────────────┐  │
│  │ Mercado       │ AAPLx  US$…  +x,xx %  │ Compra         │  │
│  │ TSLAx  …      │ ╱╲╱╲__╱╲╱ (gráfico)   │ US$10 → 0,0… ac│  │
│  │ AAPLx  …      │ 1D 1S 1M 3M 1A        │ [Revisar]      │  │
│  │ MSFTx  …      ├───────────┬───────────┼────────────────┤  │
│  │ NVDAx  …      │ Billetera │ Bolsa EE. │ Saldo demo     │  │
│  │               │ propia    │ UU. ahora │ US$10.000      │  │
│  └───────────────┴───────────┴───────────┴────────────────┘  │
├──────────────────────────────────────────────────────────────┤
│ 2 CINTA de precios (delgada, un solo aviso de fuente)        │
├──────────────────────────────────────────────────────────────┤
│ 3 CÓMO FUNCIONA (dividido)                                   │
│   01 Practica  ◀ activo      ┌──────────────────────────┐    │
│   02 Elige una acción        │  marco de teléfono con   │    │
│   03 Queda en tu billetera   │  la pantalla del paso    │    │
│                              └──────────────────────────┘    │
├──────────────────────────────────────────────────────────────┤
│ 4 POR QUÉ (bento 3×2, cada tarjeta con mini‑visual)          │
│   Fracciones │ Dólares │ 24/7 │ Sin corredora │ 0 % │ Tuyo   │
├──────────────────────────────────────────────────────────────┤
│ 5 BANDA INVERTIDA (negro) — "La bolsa abre de 9:30 a 16:00.  │
│   El mercado on‑chain sigue abierto." + semana en una barra  │
├──────────────────────────────────────────────────────────────┤
│ 6 COSTOS (dividido): 0 % grande + simulador │ desglose       │
├──────────────────────────────────────────────────────────────┤
│ 7 QUÉ TIENES Y QUÉ NO: dos columnas (tienes / no tienes) +   │
│   flujo horizontal Billetera → Solana/Jupiter → Emisor       │
├──────────────────────────────────────────────────────────────┤
│ 8 PREGUNTAS (título fijo a la izquierda, acordeón a la       │
│   derecha) → CIERRE: una frase, un botón, lista de espera    │
│   en una línea                                               │
└──────────────────────────────────────────────────────────────┘
```

**Detalle por bloque**

1. **Hero + bento de producto.** El bloque de cotizaciones pasa a ser una de cinco tarjetas con interfaz real: lista de mercado, ficha con gráfico, boleta de compra de ejemplo (US$10 → fracción al precio mostrado), billetera propia y estado de la bolsa de EE.UU. frente al mercado on‑chain. Se renderiza en servidor con las mismas cotizaciones de hoy; en móvil se apila en dos tarjetas visibles y el resto en carrusel.
2. **Cinta.** Más baja, con un único rótulo de fuente (demo o en vivo).
3. **Cómo funciona.** Los tres pasos pasan a pestañas verticales; a la derecha, un marco grande muestra la pantalla de ese paso. Reemplaza los tres ejemplos de texto.
4. **Por qué.** Funde "Cuatro reglas" con parte de Seguridad. Cada tarjeta lleva un visual pequeño: deslizador de monto, barra de la semana, cifra 0 %, diagrama de la llave. Se conserva la frase "Ninguna es una promesa de ganancia".
5. **Banda invertida.** El manifiesto de horario sale del cierre y gana su propia sección en negro, con la semana dibujada (horario de bolsa marcado, resto abierto) y la nota de liquidez.
6. **Costos.** El simulador existente (`cost-simulator.tsx`) sube a la portada junto al 0 %; la tabla de desglose queda en tarjeta.
7. **Qué tienes y qué no.** Comparación en dos columnas y la arquitectura como flujo horizontal de tres nodos.
8. **Preguntas y cierre.** Acordeón en dos columnas; el cierre queda en un titular, un botón y la lista de espera reducida a correo + casilla en una sola fila.

**Metas (objetivo, no medición):** portada cercana a 5.500 px en escritorio y 7.500 px en móvil; primer pantallazo con producto visible; LCP sin regresión.

## 7. Páginas internas

| Página | Cambios |
|--------|---------|
| Todas | `PageHero` dividido: texto a la izquierda, pieza visual a la derecha (llena la mitad vacía). Migas de pan con Breadcrumb. |
| `/acciones` | Categorías como píldoras con contador; barra de búsqueda y filtros fija al bajar; vista de tarjetas con logo, precio y variación, con opción de tabla; atajo de teclado para buscar. |
| `/acciones/[slug]` | Gráfico en la cabecera cuando haya historial; datos clave como `StatTile`; pestañas fijas (Resumen · Empresa · Token · Preguntas); "Resumen de operación" fijo a la derecha con el botón de la demo. |
| `/categorias`, `/categorias/[slug]` | Tarjetas con pila de logos y número de activos; cabecera con los principales de la categoría. |
| `/comparar`, `/comparar/[pair]` | Cabecera "A vs B" con los dos logos; gráfico comparado arriba; tabla lado a lado con la diferencia resaltada. |
| `/como-funciona` | Versión extendida del bloque 3, con una sección por paso y su pantalla. |
| `/costos` | Simulador arriba, desglose debajo, ejemplo paso a paso de una orden. |
| `/seguridad` | Flujo de autocustodia como diagrama principal; "tienes / no tienes"; riesgos en tarjetas de aviso. |
| `/guias`, `/guias/[slug]` | Tarjetas editoriales con portada tipográfica; en la guía, índice fijo, barra de progreso y prosa a 18 px con medida de 68 caracteres. |
| `/ayuda` | Buscador grande, temas en grilla y acordeón por tema. |
| `/legal/*` | Índice fijo a la izquierda, texto a la derecha y el estado "[REVISIÓN ABOGADO]" como aviso visible arriba. |
| 404 / error | Mensaje, buscador de acciones y tres accesos directos. |

## 8. Acceso y registro

Sólo presentación; **no se toca la lógica de auth** (leer `docs/AUDITORIA-HANDOFF.md` antes de empezar esta etapa).

- **Dos columnas en escritorio:** formulario a la izquierda; a la derecha, panel con un marco de producto y tres hechos del producto ya publicados (0 % en lanzamiento, 24/7, autocustodia). En móvil, sólo el formulario.
- **Campos:** fondo blanco con borde de control en vez de relleno gris; foco con anillo; errores bajo el campo.
- **Registro:** indicador de tres pasos con nombres, no sólo "Paso 1 de 3"; "Usar la cuenta demo" como opción secundaria clara.
- **Recuperar / restablecer / verificar:** misma plantilla, con el estado (enviado, vencido, listo) como ilustración sobria.

## 9. Etapas (una por sesión)

| Etapa | Contenido | Depende de |
|-------|-----------|------------|
| **D1** | Fundaciones: tokens de marketing, `SectionHeader`, `BentoGrid`, `ProductFrame`, `StatTile`, `PageHero`; header y footer nuevos | — |
| **D2** | Hero + bento de producto + cinta | D1 |
| **D3** | Resto de la portada (bloques 3 a 8) | D2 |
| **D4** | `/como-funciona`, `/costos`, `/seguridad` | D3 |
| **D5** | `/acciones`, ficha, `/categorias`, `/comparar` | D1 |
| **D6** | `/guias`, `/ayuda`, `/legal`, 404 y error | D1 |
| **D7** | Ingreso, registro y recuperación | D1 |
| **D8** | Pase final: 360 / 390 / 430 / 768 / 1024 / 1440, contraste AA, teclado, movimiento reducido, LCP y CLS | todas |

Recomendación: **D1 → D2 → D3** primero; es donde está el mayor cambio visible. D5, D6 y D7 son independientes entre sí.

## 10. Decisiones que necesito de Manu

1. **Sombra y superficies.** `docs/DESIGN-SYSTEM.md` dice "sin sombras salvo flotantes". ¿Se permite una sombra suave en los marcos de producto y tarjetas con fondo `surface-1` en marketing? *Recomendado: sí.*
2. **Banda invertida en negro** para la sección 24/7. *Recomendado: sí, una sola.*
3. **Acento de color.** El documento de diseño define `brand #ff6a08`; el código usa negro. *Recomendado: seguir en monocromo.*
4. **Dependencias nuevas:** `@radix-ui/react-navigation-menu` (necesaria para "Explorar") y `embla-carousel-react` (opcional, bento en móvil). Se anotan en `PROGRESO.md`.
5. **Modo oscuro.** *Recomendado: fuera de este plan.*

## 11. Criterios de aceptación

- Producto visible en el primer pantallazo a 1440 px y a 390 px.
- Ninguna sección consecutiva con la misma composición.
- Todos los datos pasan por `lib/api/client.ts` → `/api/*` → `getServices()` o por las cotizaciones que ya recibe la portada; cero cifras nuevas.
- Cada aviso legal existente sigue presente al menos una vez en su página.
- Contraste AA, objetivos táctiles de 44 px, foco visible y `prefers-reduced-motion` respetados.
- Sin regresión de LCP ni de CLS frente a la portada actual, medidos antes y después.
