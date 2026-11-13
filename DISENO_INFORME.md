# DISENO_INFORME — Maverlang Stocks — Tanda DISEÑO (11 nov 2026)

Base: `mejora/diseno` (d32f087). Evidencia: `scratch/live/*.txt` + capturas `d_*.png` (1440 px) y `m_*.png` (390 px). Análisis de 5 sub-bots (D1 sistema/marco, D2 home, D3 ficha y catálogo, D4 contenido/legal/cripto, D5 app mercado y copiar). Sólo diseño: no se toca lógica, datos, API, `lib/**`, migraciones ni textos legales.

## 1. Resumen ejecutivo

El sitio ya es coherente y monocromo; el problema **no es la paleta sino la escala y la jerarquía**. Cuatro causas raíz explican casi todos los hallazgos:

1. **Tokens que fallan AA.** `--color-fg-subtle #8a8a8a` = 3,45:1 y `--color-info #2b7fd9` = 4,09:1 se usan como texto informativo y legal. `--color-border #e6e6e6` = 1,25:1 y `--color-surface-3 #e6e6e6` = 1,25:1 son el **único** indicio de que algo es un control → falla WCAG 1.4.11 y hace que botones secundarios, chips y buscadores parezcan deshabilitados.
2. **Microtipografía.** `.label` = mono 11 px, mayúsculas, `tracking .08em`, con **134 usos de `text-[11px]` en 60 archivos** y casos de 10 px (`hero.tsx:184`). Es el texto más repetido del producto y el menos legible, sobre todo a 390 px.
3. **Demasiado aire y poca jerarquía de acción.** `py-20 md:py-28 lg:py-32` en toda sección deja la ficha `/acciones/apple` casi vacía y hace que el footer pese más que el contenido; a la vez hay 3 CTA del mismo peso en el hero y **dos primarios negros sobre el pliegue** (header «Entrar» + hero).
4. **Cero estados reales.** Vacío/carga/error se resuelven con 4 frases sueltas hechas a mano; la tarjeta de precios de la home dice «En vivo» con punto verde incluso si el refetch falló.

Oportunidad de mayor impacto por línea cambiada: subir `.label` a 12 px con tracking menor, arreglar los 3 tokens de contraste y unificar botones/chips. Sólo eso cambia la percepción de todo el sitio.

## 2. Hallazgos priorizados

| # | Prioridad | Página | Problema | Propuesta | Bot |
|---|---|---|---|---|---|
| 1 | ALTO | Global | `fg-subtle` 3,45:1, `info` 4,09:1 usados como texto; `border`/`surface-3` 1,25:1 como contorno de controles | Tokens: `fg-muted #5b5e63`, `fg-subtle #73767b`, `info #1762b8`, `border-control #848484` (3,74:1) | D1 |
| 2 | ALTO | Global | `.label` mono 11 px/`.08em`; 134 usos de 11 px, 10 px en la tarjeta de precios | `.label` 12 px/`.045em`/500 + `.eyebrow` (sans 13 px) + `.label-xs` sólo tablas densas | D1 |
| 3 | ALTO | Global | `focus-visible:ring-fg/20` (≈1,6:1) + `outline-none` anulan el foco global en 123 sitios; los `<a>` no tienen rescate | Quitar ring/outline-none; `.focus-ring` y ampliar la regla C-07 a `a[href]` | D1 |
| 4 | ALTO | Global | Dos primarios negros arriba (header «Entrar» + hero); secundario 1,25:1; `sm` = 36 px; todos `font-normal` | «Entrar» → ghost; secondary = contorno `border-control`; `sm: h-11 sm:h-9`; primario `font-medium` | D1 (+D2) |
| 5 | ALTO | /acciones/[slug] | Sin precio ni CTA arriba del pliegue; H1 36 px = H2 de la home; aside cae tras «Especificaciones» en móvil | Hero de producto: precio 40-48 px + `ChangeBadge` + CTA; aside `order-1`; H1 `text-4xl md:text-5xl` | D3 |
| 6 | ALTO | /acciones | 446 tarjetas en una grilla (≈18.000 px de scroll), sin precio, sin agrupar; píldora duplica el ticker («AAONon») | Tarjeta-fila compacta con sector; `xl:grid-cols-4`; grupos por letra con índice sticky; «Ver 48 más» local | D3 |
| 7 | ALTO | Home | Hero con 4 bloques de microtexto (subtítulo+párrafo+nota+3 chips+disclaimer ≈1,3 pantallas) y 3 CTA equivalentes | H1 + un dek 16 px; 1 primario + 1 secundario + 1 enlace de texto; reubicar disclaimer y nota (no se borran) | D2 |
| 8 | ALTO | Home | «Pausar precios» flota suelto entre hero y cinta; la cinta corta activos sin degradado y cambia de alto al pausar | Cabecera de cinta con el control; máscara `mask-image`; alto fijo y scroll horizontal en pausa | D2 |
| 9 | ALTO | Home | «Tres pasos»: `mt-auto` + mocks de alturas distintas → tarjeta 02 vacía arriba; numeral 32 px manda sobre el rótulo 11 px | Quitar `mt-auto`, `min-h` fijo en el slot; numeral decorativo `text-lg`; rótulo `text-xs text-fg-body` | D2 |
| 10 | ALTO | /costos, /seguridad | Doble titular idéntico (H1 de página + H2 de sección a la misma escala) | Prop `showIntro={false}` en `costs-section`/`security-section`; se conserva el H1 de página con ese texto | D2+D4 |
| 11 | ALTO | /legal/[doc] | Índice de 11 ítems ≈600 px antes del primer párrafo en móvil; cuerpo a 95-100 caracteres por línea | `<details>` en `<sm`; cuerpo `max-w-[68ch] text-[1.0625rem] leading-7`; índice `aside` sticky en `lg` | D4 |
| 12 | ALTO | /app/cripto | Sello «VERDE» en verde en 20+ filas compite con el precio y quema el verde de «sube» | Sello neutro con punto; `warn` sólo AMARILLO; up/down reservados a precio | D4 |
| 13 | ALTO | /app | `h2` «Tu día» antes del `h1` «Mercado»; destacada sin precio y CTA primario = «Seguir» | `<PageHeader>` arriba; precio grande en la destacada; primario «Ver acción», «Seguir» secundario | D5 |
| 14 | ALTO | /app | Nombres truncados («Aehr Test Syst…») porque la sparkline come 88 px en 390 px | `line-clamp-2` + `title`; sparkline `hidden sm:block` en la lista | D5 |
| 15 | ALTO | /app | La píldora fija «Horario nocturno» tapa la última fila (sin spacer) | `h-16 lg:hidden` al final; orbe a icono `size-11` en `<sm` | D5 |
| 16 | ALTO | /app, /app/copiar | Chips de filtro: grupo sin rótulo legible, activo fuera de vista, inactivos 1,06:1 | Dos grupos con rótulo `text-xs`; chips con `border-control`; «Filtros · X ▾` en móvil | D5 |
| 17 | MEDIO | /acciones/[slug] | «Resumen de operación» 1,08:1 sobre blanco, 3 puntos de cromo falso, CTA de 3 líneas por interpolar el nombre | Tarjeta blanca con hairline; «● En vivo · cada 30s»; CTA fija «Operar en la demo» | D3 |
| 18 | MEDIO | /acciones/[slug] | La ficha repite 3 veces lo mismo en 400 px («24/7» ×4) | Una sección «Sobre {name}»; frases legales como nota final; 2 badges en el hero | D3 |
| 19 | MEDIO | /comparar/[pair] | Tabla a 11 px `table-fixed` ilegible en 390 px; barras con `Math.abs` hacen igual una pérdida que una ganancia | Tabla-card en `<sm` o scroll con `text-xs`; barras con línea base al 50 % | D3 |
| 20 | MEDIO | /costos | La misma tabla 3 veces y `min-w-[32rem]` cortada en 390 px | Hero compacto + un desglose apilado + simulador; `md:min-w-[32rem]` | D4 (+D2) |
| 21 | MEDIO | Global contenido | H1/H2 distintos en cada página (4xl/5xl vs 3xl/4xl); H2 en `.label` | Escala fija H1 `3xl/4xl`, H2 `2xl/3xl`; `.label` sólo como eyebrow | D1+D4 |
| 22 | MEDIO | /ayuda vs /guías | Dos patrones de FAQ (acordeón cliente vs `<details>`) | Unificar en `<details>` (0 JS) vía `DisclosureList` | D1+D4 |
| 23 | MEDIO | /como-funciona | Única página de contenido sin CTA primaria | CTA «Probar la demo» + secundaria «Ver acciones» | D4 |
| 24 | MEDIO | Home | Estados: `live-landing-prices` sin `isError` (dice «En vivo» aunque falle); hero sin fallback si el filtro no da filas | Exponer `stale/error` y pintar «Último precio conocido» en `warn`; `slice(0,4)` de respaldo | D2 |
| 25 | MEDIO | Global | Vacío/error/carga en 3 idiomas; el reintento de error es el botón más débil | Cáscara única `rounded-3xl`; error con primario y `Badge tone=down`; skeleton por forma | D1 |
| 26 | MEDIO | Global | Card con `border` **y** `shadow-card` (doble hairline); 5 radios; sombras azuladas a mano en sidebar | Card `rounded-3xl` sin `border`; `--shadow-hairline`/`--shadow-raised`; sidebar a token | D1 |
| 27 | MEDIO | Global | `prefers-reduced-motion` fuerza 1 ms a animaciones infinitas → el skeleton parpadea | `animation-iteration-count: 1 !important`; `motion-safe:animate-pulse` | D1 |
| 28 | MEDIO | /app/copiar/* | Letra chica de confianza en `fg-subtle` 11 px (3,45:1) | `text-fg-muted` + mínimo `text-xs` en notas legales | D5 |
| 29 | MEDIO | /app/copiar/[slug] | «Evolución estimada» sin retorno, sin eje, sin valor final; sólo «Base 100» en 11 px | Retorno del período `text-2xl` + 2 marcas de eje en %; `figcaption` `text-xs` | D5 |
| 30 | MEDIO | /app/copiar/[slug] | Tabla de posiciones: header `flex` sin anchos + badge de ancho variable → sin columnas | `grid-cols-[minmax(0,1fr)_4rem_5rem_auto]` ≥sm; etiquetas inline en `<sm` | D5 |
| 31 | MEDIO | /app | Moneda ambigua (`$` CLP vs `US$`) y caída silenciosa a USD sin tipo de cambio | Pill «Precios en CLP · dólar ref. $950» / «US$ · sin tipo de cambio» + sufijo `CLP` (sin tocar `lib/format.ts`) | D5 |
| 32 | MEDIO | /app | 446 filas sin cabecera de columnas; total duplicado; «Cargar más» sin progreso | Cabecera sticky «Precio / Var. 24 h»; «20 de 446 · hace 8 s»; «Cargar 20 más» | D5 |
| 33 | MEDIO | /app/favoritas | Página huérfana (sin chips de sección ni frescura); fila partida en móvil | `MarketSectionChips` + `PriceFreshness`; fila única en móvil; campana/sparkline `hidden sm:flex` | D5 |
| 34 | BAJO | Varios | `Badge tone="brand"` = negro sobre negro; `tooltip side=bottom` sin `pointer-events-none`; «⌘K» en Windows; `scroll-padding` duplicado | `bg-fg text-white`; corregir tooltip; texto «Buscar»; quitar `scroll-mt-16` | D1 |
| 35 | BAJO | /app/copiar | Tres lenguajes de filtro en una pantalla; sello Fraccion.si 3 veces; fila con `border` + `divide-y` | Familia = píldoras del mercado; «Orden: X ▾»; sello sólo cabecera/pie; una sola línea | D5 |

## 3. Sistema visual propuesto (lo fija D1)

**Tokens (`app/globals.css`, compatibles: no se renombra nada)**
```css
--color-fg-muted: #5b5e63;          /* 6,5:1 en blanco · 1,7:1 más que hoy */
--color-fg-subtle: #73767b;         /* 4,56:1 — deja de ser "casi invisible" */
--color-info: #1762b8;              /* 6,0:1 blanco · 5,4:1 sobre info-bg */
--color-border-control: #848484;    /* 3,74:1 blanco · 3,46:1 sobre surface-1 */
--text-body: .9375rem; --text-lead: 1.0625rem; --text-lead--line-height: 1.55;
--shadow-hairline: 0 0 0 1px #e6e6e6;
--shadow-raised:   0 1px 3px rgb(12 15 20 / .05);
```
`#8a8a8a` queda sólo para `disabled`/decorativo, nunca como `text-*`.

**Tipografía**
- `.label` → `font-mono text-xs uppercase tracking-[0.045em] font-medium text-fg-muted` (12 px).
- `.eyebrow` nuevo → `text-[13px] font-medium text-fg-muted` (sans, caja baja) para títulos de columna del footer, encabezados de ayuda y tablas de contenido.
- `.label-xs` nuevo → 11 px, sólo tablas densas y tablas de datos.
- H1 de página `text-3xl sm:text-4xl`; H1 de producto `text-4xl md:text-5xl`; H2 de sección `text-[1.75rem] sm:text-[2.125rem] leading-[1.15] text-balance`; H2 de contenido `text-2xl sm:text-3xl`.
- Cuerpo: `text-lead max-w-[62ch] text-fg-body` en secciones; prosa legal `max-w-[68ch]`.
- `h1,h2,h3 { text-wrap: balance }` en base.

**Contraste y estados**
- Texto normal ≥ 4,5:1; contornos de control ≥ 3:1 (`border-control`); separadores decorativos se quedan en `border`.
- Foco: un único `outline-2 outline-offset-2 outline-fg` global, aplicado también a `a[href]`; prohibido `ring-fg/20` + `outline-none`.
- Radios: `rounded-3xl` para tarjetas y paneles de estado, `rounded-2xl` para filas/cards internas, `rounded-xl` sólo en menús, `rounded-full` en píldoras. Card sin `border` (el hairline lo dibuja `shadow-card`).
- Estados: una sola cáscara (icono 40 px en `bg-surface-2`, título `text-base font-medium`, descripción `text-sm text-fg-muted max-w-sm`); error con `Badge tone="down"` + **botón primario** de reintento; skeleton con `motion-safe:animate-pulse` y forma real (`variant`).

**Jerarquía de CTA**
1. Un solo botón negro (`primary`) por vista.
2. `secondary` = contorno `border-control` sobre `bg-bg`, `font-medium`.
3. `ghost` = texto `fg-muted` que oscurece al hover.
4. Enlaces de acción = `text-sm font-medium underline underline-offset-4`.
- Alturas: `h-11` (44 px) base y en móvil; `h-9` sólo desde `sm`.
- En cabeceras y chrome (header de marketing, sidebar) no se usa `primary`.

**Ritmo**
- `LandingSection`: `py-14 sm:py-20 lg:py-24`; prop `density="compact"` (`pt-10 pb-16 md:pt-12 md:pb-20`) para fichas, hubs y legales.
- Ancho: marketing `max-w-7xl px-5`; app `max-w-6xl px-5`; una sola zanja horizontal en todo el sitio.

## 4. Plan de Fase B por sub-bot

### D1 — Sistema y marco (hace primero los tokens; los demás ya los asumen)
1. Tokens de §3 en `globals.css` + `.label/.eyebrow/.label-xs` + `text-wrap: balance` + `--color-border-control` expuesto como `border-control`.
2. Foco: `.focus-ring`, retirar la anulación en `components/ui/*`, `public-header`, `sidebar`, y ampliar la regla global a `a[href]`.
3. `button.tsx`: un solo primario por vista, `secondary` con `border-control`, `ghost` con `text-fg-muted`, `sm` `h-11 sm:h-9`, primario `font-medium`, danger hover `#a81a1a`.
4. `card.tsx` sin `border` y `rounded-3xl`; `badge.tsx` `brand` → `bg-fg text-white`; `segmented-control` sin triple borde; `empty/error/loading` a la cáscara única; `skeleton` con `motion-safe`.
5. `prefers-reduced-motion` corregido; `tooltip` `pointer-events-none` en `bottom`.
6. `section.tsx`: `py-14 sm:py-20 lg:py-24`, prop `density`, intro con `text-lead max-w-[62ch]`, H2 nuevo.
7. `site-header`: «Entrar» a `ghost`. `site-footer`: links `min-h-11 md:min-h-8`, «Producto» partido en dos columnas, legales en 2 columnas `text-[13px]`, `py-12 lg:py-14` — **sin borrar un solo string**.
8. `top-bar`: `ring-2 ring-bg` en el punto demo + píldora «Demo» de texto (el flag y el `aria-label` no cambian). `sidebar`: zinc → tokens, colapsar sólo desde el handle, «Buscar» en vez de «⌘K». `section-body` se deja como está (no se cablea).
9. Nuevos compartidos que D4 usará: `DisclosureList` (details) y `ContentTable` (tabla con scroll+apilado) en `components/ui/`. Si por presupuesto no alcanzan, D4 los resuelve localmente.

### D2 — Home
1. Hero: un dek 16 px; un primario; «Ver acciones» secundario; «Cómo funciona» enlace de texto; píldora superior a `/#costos`; mover «Practica con US$10.000 ficticios» al encabezado de la tarjeta y el disclaimer de horario al pie de la cinta (reubicar, nunca borrar). `text-[10px]` → `text-xs` en toda el área.
2. Cinta: cabecera con rótulo + «Pausar precios» como control integrado; máscara de degradado; alto estable al pausar (scroll horizontal); quitar `border-[#767676]` hardcodeado.
3. «Tres pasos»: quitar `mt-auto`, `min-h-[7.5rem]` en el slot, `p-4` uniforme, numeral `text-lg text-fg-muted` y rótulo `text-xs text-fg-body`; tarjeta a `bg-surface-1`.
4. `costs-section`: prop `showIntro={false}` + tabla apilada en `<sm` (o `md:min-w-[32rem]` + fade); `security-section`: prop `showIntro={false}` + leyenda duplicada como `figcaption` de una línea (mismo texto); `cost-simulator`: «100,00 %» vía `Intl es-CL` y `fg-subtle` → `fg-muted`; `compare-chart`: copy del vacío «El gráfico no está disponible ahora.» y ejes a `text-xs text-fg-muted`.
5. `live-landing-prices`: exponer `stale/error` y pintar «Último precio conocido» con punto `warn`; `hero`: fallback `slice(0,4)`; `product-mock`/`landing-quote-preview`: tablist con `no-scrollbar` + máscara y `scrollIntoView`, «Opciones del gráfico» en `<details>` bajo `sm`.
6. `final-cta`: segunda frase del H2 a `text-fg-body` (no gris de 52 px) y un solo primario.

### D3 — Ficha y catálogo
1. `/acciones/[slug]`: hero de producto (logo 64, label, H1 `text-4xl md:text-5xl`, `StockLivePrice size="lg"` + `ChangeBadge` + CTA primaria en móvil); `aside` `order-1 lg:order-2` para que precio y CTA suban en 390 px; contenedor `lg:grid-cols-[minmax(0,1fr)_22rem]`.
2. Panel «Resumen de operación»: tarjeta blanca con hairline, «● En vivo · cada 30 s», precio `lg`, `dd` con `num` sólo en la cifra, CTA fija «Operar en la demo» + `aria-label` completo, `min-h-12` + skeleton.
3. Reagrupar duplicados: una sección «Sobre {name}» con las frases legales como nota final `text-xs`; hero con 2 badges; chips de categoría a «Para seguir entendiendo». **Ningún texto se borra.**
4. Catálogo: tarjeta-fila compacta con sector (prop desde el server, sin importar `categories.ts` en cliente), `sm:grid-cols-2 xl:grid-cols-4`, agrupación por letra con encabezado sticky, «Ver 48 más» local y leyenda «Acción = empresa · ETF = fondo»; quitar la píldora `symbol` duplicada.
5. `/comparar/[pair]`: tabla-card en `<sm` (o scroll con `text-xs`); barras con línea base al 50 % para valores con signo; `pl-[52px]` → `grid-cols-[40px_1fr]`; añadir «Comparar activos →» en la cabecera de `/acciones`.
6. Estados: `EmptyState` en los 4 vacíos del área; «sin resultados» con 3 chips de ejemplo; `acciones/[slug]/not-found.tsx` con «Ver todas las acciones».
7. Bordes/foco: `border-border` → `border-control` en buscador y píldoras; quitar `focus-visible:outline-none` + `ring-fg/20` de las 6 tarjetas-enlace; `min-h-11 sm:min-h-9` en píldoras y chips.
8. Elemento compartido dentro de su área: `components/landing/public-asset-card.tsx` (`variant card|row`) y reemplazo de los 10 `bg-white` por `bg-bg`.

### D4 — Contenido, legal y cripto
1. `/legal/[doc]`: índice en `<details>` bajo `sm` (y no renderizarlo con <3 secciones); cuerpo `max-w-[68ch] text-[1.0625rem] leading-7`; `lg:grid-cols-[minmax(0,1fr)_15rem]` con índice `aside sticky`; tabla legal con `min-w-[34rem]` y fade (o apilada); `text-[11px]` → `text-xs`.
2. `/costos`: quitar el bloque duplicado de 5 tarjetas y montar `CostsSection` con `showIntro={false}`; desglose apilado en `<sm`; `como-funciona`: CTA primaria «Probar la demo» + secundaria «Ver acciones»; H1 `3xl/4xl` y H2 `2xl/3xl` en las cinco páginas; H2 de `/ayuda` que hoy es `.label` vuelve a ser H2.
3. `/ayuda` y guías: un solo patrón de despliegue (`DisclosureList` de D1 si existe; si no, `<details>` local); índice de guías con título→descripción→meta y numeración `01/02/03`; vacío con `EmptyState` + CTA.
4. `/app/cripto`: sello a chip neutro (warn sólo AMARILLO), línea de contexto «Tokens de Solana · no son acciones xStocks», aviso compacto de 2 líneas arriba, `originLabel` oculto en `<sm`, `loading.tsx` alineado con la ficha real, «volver» `min-h-11`.
5. `crypto-market.tsx`: `bg-white/90` y sombra ad-hoc → `bg-surface-1`/`shadow-card`.

### D5 — App (mercado, favoritas, copiar) + `components/domain/market-today/*`
1. `/app`: `<PageHeader>` antes de `MarketToday`; destacada con precio grande + `ChangeBadge`; primario «Ver acción», secundario «Seguir»; gráfico `h-28 sm:h-36`; rango/tabs `min-h-11`.
2. Filas: `line-clamp-2` + `title` en nombre, `min-h-16`, sparkline `hidden sm:block` en la lista; símbolo mono `text-[13px]`, chip «Abierta» separado.
3. Spacer `h-16 lg:hidden` al final del mercado; orbe a icono `size-11` en `<sm` (aria-label intacto).
4. Chips: dos grupos rotulados `text-xs font-medium text-fg-muted`; inactivos `border border-border-control bg-bg`; «Filtros · {activo} ▾» en móvil; `scroll-px` para el activo.
5. Foco: quitar `outline-none` + `ring-fg/20` en chips, toggle, sección, tabs, tarjetas y orbe.
6. Copiar: `text-fg-subtle` → `text-fg-muted` y mínimo `text-xs` en notas legales (sin tocar textos); `perf-chart` con retorno `text-2xl` + 2 marcas de eje en % y `figcaption`; `positions-table` a grid con columnas reales; `plan-card`/`paywall` con precio y «7 días gratis» como `Badge` y el bloqueo junto al botón; familia/orden/búsqueda a un solo lenguaje de control; sello Fraccion.si sólo en cabecera y pie; quitar `border` de la fila (dejar `divide-y`).
7. Moneda: pill de contexto CLP/US$ + sufijo `CLP` (sin tocar `lib/format.ts`).
8. `favoritas`: `MarketSectionChips` + `PriceFreshness`, fila única en móvil, campana y sparkline `hidden sm:flex`, skeleton `h-16 sm:h-14`.
9. `change-badge.tsx`: prop opcional `size="sm|md"` (default = actual, compatible) para acompañar precios grandes (la usa D3).

## 5. Reglas de ejecución de la Fase B

- Cada sub-bot edita **sólo** sus archivos de §2 del encargo (+ `components/domain/market-today/*` asignado a D5).
- D1 sólo añade tokens/clases; no renombra ninguna existente.
- Prohibido borrar textos legales, el aviso demo, los logos y la frase «no custodiamos»; se permite reordenar y re-estilar.
- Sin dependencias nuevas, sin JS de cliente nuevo, sin tocar `lib/**`, `app/api/**`, migraciones ni `trade-*.tsx`/billetera.
- La verificación (tsc, eslint de cambiados, vitest rápido, guardas) la hace el orquestador, una sola vez, al final.
