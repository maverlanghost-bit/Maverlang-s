# PROGRESO — Maverlang

## Más movidas hoy: variación prominente y tira sin cortes (2026-10-11)
- Hecho: sólo clases/orden visual en `ticker-card.tsx` y `market-screen.tsx`, sin tocar lógica de movidas (`moversOfPriced`), APIs ni props/datos. (1) Tarjeta: mantiene logo, símbolo, nombre corto y precio; la variación (`ChangeBadge` con sus colores `up`/`down` existentes) ahora va en bloque propio grande (`px-3 py-1 text-base font-semibold`) sobre el precio (`FlashPrice sm`). (2) Encabezado "Más movidas hoy" (`t.market.movers` es-CL intacto) sube a `text-lg font-semibold`. (3) Tira móvil: `-mx-1 px-1 pt-1 pb-2` para que el foco no se corte; tarjeta `w-64 sm:w-60` + `min-h-32` para toque adecuado.
- Archivos: `components/domain/ticker-card.tsx`, `app/(platform)/app/market-screen.tsx`. 2 commits atómicos en rama `b/mas-movidas`.
- Verificación: digo con todas sus letras: `npx tsc` NO corrido (`typescript` no instalado); sin revisión visual en `next dev`. Diff revisado a mano; `ChangeBadge` ya aceptaba `className`; sin props/datos nuevos ni variables sin declarar.
- Pendiente operador: ver `/app` en 390px (tira con snap, tarjetas completas) y 1280px; confirmar verde/rojo legibles.
## Ficha: Datos con precio, emisor, categoría y estado (2026-10-11)
- Hecho: sólo `KeyStats` ("Datos") en `detail-screen.tsx`, sin tocar trading, gráfico, APIs ni `price-panel.tsx`. (1) Nueva celda Precio actual (`quote.priceUsd` en tu moneda, etiqueta `priceClp/priceUsd` existente). (2) Nuevas celdas Emisor (`ticker.issuer`: Backed (xStocks)/Ondo), Categoría (etiqueta `t.market` ya resuelta) y Estado (`tradeBlock`: Operable / En revisión / Suspendida / No disponible, textos i18n existentes salvo "Operable" pedido en es-CL). (3) Sin market cap ni volumen: no existen en `Ticker`/`Quote`/`CatalogAsset` (grep: sólo `liquidityUsd` del pozo y `volumeWinner` interno de desempate). Grilla 2 col intacta, `tabular-nums` ya en `StatCell`.
- Archivos: `app/(platform)/app/accion/[ticker]/detail-screen.tsx` (+42). Commit atómico en rama `b/ordenes-limite`.
- Verificación: digo con todas sus letras: `npx tsc` NO corrido (`typescript` no instalado); sin revisión visual en `next dev`. Diff revisado a mano; sin imports/props inventados (sólo `Ticker["issuer"]` y `TradeBlock` locales); sin variables sin declarar (único uso de `KeyStats` actualizado).
- Pendiente operador: ver `/app/accion/AAPLx` en 390px y 1280px (10 celdas, "—" si falta dato); decidir etiqueta/celda "Operable" en `en` (hoy sale en español) y si "Categoría"/"Estado" pasan a `content/i18n`.
## Revisión login y recuperar contraseña (2026-10-10)
- Hecho: sólo clases CSS + aclaración del mensaje de envío, sin tocar lógica de auth, `lib/auth`, APIs ni flujo Supabase. (1) Login: "Ingresar" ya era protagonista (`size="lg"`); "Olvidé mi contraseña" y "Crear cuenta" a `min-h-11` con `focus-visible:ring-4`; alerta con `break-words`. (2) Recuperar: estado enviado dice "Te enviamos un correo con un enlace" + guía anti-enumeración; error y "Volver a ingresar" igual patrón. (3) Restablecer: error sin cortes + "Pedir otro enlace" a 44px. (4) `AuthFrame` compartido: logo y links legales con foco visible (patrón de `registro/wizard.tsx`).
- Archivos: `app/(platform)/app/ingresar/supabase-login.tsx`, `app/(platform)/app/{recuperar/recuperar-form,restablecer/restablecer-form}.tsx`, `components/auth/auth-frame.tsx`. 3 commits atómicos en rama `b/login-recuperar`.
- Verificación: digo con todas sus letras: `npx tsc` NO corrido (`typescript` no instalado); sin revisión visual en `next dev`. Diff sólo clases + copy (13+/13-), revisado a mano; sin variables ni props nuevas.
- Pendiente operador: ver `/app/ingresar`, `/app/recuperar`, `/app/restablecer` en 390px (toques 44px, focos, sin cortes) y 1280px.
## Revisión estructura páginas legales (2026-10-10)
- Hecho: sólo estructura/links/CSS, sin tocar cláusulas. (1) Nuevo `LegalNav` al pie de cada `/legal/[doc]` con links a los otros 3 docs (touch min-h-11, focus-visible). (2) `LegalBody`: `break-words` + `text-pretty` anti-cortes en móvil; tablas ya tenían `overflow-x-auto`.
- Archivos: `app/(marketing)/legal/[doc]/page.tsx`, `components/landing/legal-document.tsx`. Commit atómico en rama `b/legal-docs`.
- Verificación: digo con todas sus letras: `npx tsc` NO corrido (`typescript` no instalado); sin revisión visual en `next dev`. Diff revisado a mano.
- Pendiente operador: ver `/legal/terminos|privacidad|riesgos|comisiones` en 1280px y 390px (nav + fecha/versión).
## Pulido visual de la portada (2026-10-10)
- Hecho: sólo clases CSS, sin tocar copy, props, imports, datos ni lógica de precios. (1) Hero y CTA final: botones apilados a ancho completo en móvil (`flex-col`/`w-full`, fila centrada desde `sm`), escritorio idéntico; CTA "Prueba la demo gratis" a 44px y protagonista en 360px. (2) Reveal del hero con `motion-safe:animate-reveal` (con movimiento reducido el contenido aparece directo, sin parpadeo). (3) Cinta con `will-change-transform` (capa de compositor, sin saltos; el fallback estático con `prefers-reduced-motion` ya existía). (4) H2 del CTA final con `leading-[1.05]`, misma jerarquía que el H1.
- Archivos: `components/landing/{hero,ticker-marquee,final-cta}.tsx`. 3 commits atómicos en rama `b/portada-hero`.
- Verificación: diff sólo clases (10+/10-). Digo con todas sus letras: `npx tsc` NO corrido (sin `node_modules`); sin revisión visual en `next dev`.
- Pendiente operador: ver `/` en 360px y 1440px (CTAs apilados/centrados, cinta fluida, sin scroll horizontal) y con movimiento reducido.
- Próximos pasos: nada más de esta tarea.

## Página /costos honesta y completa (2026-10-10)
- Hecho: sólo copy, sin tocar API ni lógica. La tabla (`CostsSection`) y el detalle (`/costos`) agregan la fila que faltaba —"Cuenta del activo, la primera vez" (costo de red por abrir la cuenta del token, se muestra en el desglose)— con el lenguaje exacto de `content/legal/comisiones.md`. Comentario interno TODO-VERIFICAR/[POR DECIDIR] reemplazado por cita de fuente (`lib/wallet/send-cost.ts`, ARQUITECTURA §6: montos en SOL, sin conversión).
- Archivos: `components/landing/costs-section.tsx`, `app/(marketing)/costos/page.tsx`. 2 commits atómicos en rama `b/costos-page`.
- Cifras: 0% lanzamiento (fuente: `lib/env.ts` `FEE_BPS` default 0 + `config/fees.ts` + `comisiones.md`); "centavos de dólar" para red (fuente: `comisiones.md` + FAQ, sin endurecer a número: `NETWORK_FEE_SOL`=0.000005 y rent 0.0016 SOL se muestran en SOL según §6); diferencia de precio y proveedor sin montos (variables, se muestran antes de confirmar). Sin "gratis"/"sin costo" (grep OK). Link a `/legal/comisiones` existe (slug en `LEGAL_SLUGS`).
- Verificación: digo con todas sus letras: `npx tsc` NO corrido (`typescript` no instalado); sin revisión visual en `next dev`. Cambio sólo texto JSX + comentario, riesgo mínimo.
- Pendiente operador: `npx tsc --noEmit` y ver `/costos` en 1280px y 390px.
## Centro /ayuda: 6 FAQ demo + grupos (2026-10-10)
- Hecho: sólo contenido, sin tocar API ni lógica. 6 FAQ nuevas en `lib/content/faq.ts` (`home:false`, la portada intacta): demo, registro, contraseña, comprar-vender, cartera, autocustodia. Respuestas de 1–2 frases, es-CL sobrio, enlaces sólo a rutas reales.
- Hecho: `/ayuda` agrupa el FAQ en 3 secciones (Para partir / Para operar / Seguridad y costos) con el mismo `Accordion` (`min-h-11`, apilado en móvil). Sin buscador: no había y añadirlo sería lógica nueva.
- Archivos: `lib/content/faq.ts`, `app/(marketing)/ayuda/page.tsx`. 2 commits atómicos en rama `b/ayuda-page`.
- Verificación: copy contrastado con `registro/wizard.tsx` (correo+clave+enlace), `recuperar-form.tsx` (enlace+spam), `/seguridad` y `/como-funciona` (US$10.000, billetera propia, desglose previo). Digo con todas sus letras: `npx tsc` NO corrido (`typescript` no instalado); sin revisión visual en `next dev`.
- Pendiente operador: `npx tsc --noEmit` y ver `/ayuda` en 1280px y 390px (3 grupos, acordeones).
- Próximos pasos: nada más de esta tarea.

## Consistencia de copy landing: demo en dólares, depósito futuro en neutro (2026-10-10)
- Hecho: sólo copy, sin tocar API ni lógica. La demo habla en dólares (US$10.000 ficticios, precios en US$) como el hero; el depósito de dinero real queda en neutro ("cuando haya cuentas reales"), sin afirmar "en pesos" como método activo y sin nombrar proveedores.
- Archivos: `components/landing/how-it-works.tsx`, `app/(marketing)/{como-funciona,ayuda,costos,seguridad}/page.tsx`, `lib/content/faq.ts`. 5 commits atómicos en rama `b/landing-copy`.
- Verificación: grep sin "pesos/Khipu/en tu moneda" en `components/landing` ni `app/(marketing)` (sólo 1 comentario interno y el FAQ de retiro, condicional "si el proveedor permite…"). Digo con todas sus letras: `npx tsc` NO corrido (`typescript` no instalado); sin revisión visual en `next dev`.
- Pendiente operador: `npx tsc --noEmit` y ver `/`, `/como-funciona`, `/ayuda`, `/costos` en 1280px y 390px. Fuera de alcance (plataforma, intacto): `billetera/depositar/peso-deposit.tsx`, `onboarding/panel.tsx` ("depositar pesos").
- Próximos pasos: nada más de esta tarea.

## Página /seguridad completa y sobria (2026-10-10)
- Hecho: sólo copy y secciones, sin tocar lógica ni props. (1) `SecuritySection`: las 2 tarjetas con texto interno ("falta confirmar…", "en revisión") ahora usan frases ya publicadas del sitio (billetera de tu cuenta + "quien controle la cuenta…", Backed emite y puede restringir); se quitó el `[REVISIÓN ABOGADO]` inline de la tarjeta (el enlace lleva al borrador marcado). (2) `/seguridad`: nuevas secciones "La demo no es dinero real" (US$10.000 ficticios, precios reales, sin cobro — copy del hero/i18n) y "Buenas prácticas" (4 Cards reusadas: acceso, revisar desglose, practicar, leer riesgos), más el marco completo intacto.
- Archivos: `components/landing/security-section.tsx`, `app/(marketing)/seguridad/page.tsx`.
- Verificación: `Card` acepta `className` (`ui/card.tsx:4`); `npx tsc` NO corrido (`typescript` no instalado, `node_modules` incompleto). Digo con todas sus letras: sin build ni revisión visual en `next dev`.
- Pendiente operador: `npx tsc --noEmit`, `npm run lint`, y ver `/seguridad` en 1280px y 390px (portada `#seguridad` hereda el nuevo copy).
- Próximos pasos: nada más de esta tarea.

## Estados vacíos y guía del registro demo (2026-10-10)
- Hecho: sólo copy y UI, sin tocar lógica de registro, trading ni rutas API. (1) Cartera vacía: `EmptyState` con "Todavía no tienes inversiones" + guía demo US$10.000 y botón "Explorar el mercado" a `/app`. (2) Registro demo: guía bajo el título (US$10.000 ficticios, crear cuenta → explorar → primera compra) y errores claros de correo usado y clave débil (guía 12+ con letras y números). (3) Historial, activos y actividad con guía accionable en vez de texto muerto.
- Archivos: `content/i18n/{es-CL,en}.ts`, `cartera/portfolio-screen.tsx`, `registro/wizard.tsx`, `lib/auth/{registro-errors,registro-schema}.ts`.
- Verificación: paridad es/en comprobada por grep (`emptyBody` en ambos, `MARKET_HREF="/app"`). Digo con todas sus letras: `npx tsc`, `lint` y `vitest` NO corridos (`node_modules` incompleto en esta sesión).
- Pendiente operador: `npx tsc --noEmit`, `npm run lint`, `npm test`, y revisar en `next dev` la cartera vacía y el registro demo en 1280px y 390px.
## Pulido mobile de la hoja de compra/venta (2026-10-10)
- Hecho: sólo CSS mobile + copy de errores, sin tocar lógica de trading, montos ni API. (1) CTAs principales de la hoja (revisar, confirmar, depositar) a `min-h-12` (48px) con `text-base`; la hoja ya era bottom full-width en móvil (`inset-x-0`, `max-h-[85dvh]` con scroll) y se agregó `w-full min-w-0` anti-overflow. (2) `AmountInput` acepta `inputClassName`/`chipClassName` opcionales (otras pantallas intactas); la hoja los usa: campo `min-h-14 py-2`, atajos `min-h-12 px-4 text-base`. (3) Errores (`hint`, `quoteError`, halt) con `break-words text-balance leading-relaxed` y `max-w-full` para que se lean completos en 390px. (4) Copy es-CL más claro y con acción (monto menor o depositar); paridad en en. Sin cambios de negocio.
- Archivos: `components/domain/trade-sheet.tsx`, `components/ui/amount-input.tsx`, `content/i18n/es-CL.ts`, `content/i18n/en.ts`.
- Verificación: `npx eslint` y `npx tsc --noEmit` PENDIENTES (`node_modules` incompleto en esta sesión, `npm ci` previo con timeout); diff revisado a mano, sin cambios de lógica. PENDIENTE operador: correr ambos y revisar en 390px la hoja (`?operar=comprar|vender`), errores de fondos insuficientes y mínimo, y confirmar a 48px.
- Próximos pasos: nada más de esta tarea.

## Mercado — primeras filas con precio antes (2026-10-10)
- Hecho: sólo orden de carga, caché y UI de carga; sin tocar trading, Jupiter ni formato. (1) `fetchMintBatch` pide los lotes de 50 en paralelo (antes secuenciales): el primer lote no espera al resto; mismo reintento, TTL 5 s y `stale`. (2) Precios del mercado: sin refetch al enfocar la pestaña ni en segundo plano (el intervalo de 15 s los mantiene), y `placeholderData` conserva los últimos precios mientras revalida (sin parpadeo al placeholder). `staleTime` 15 s intacto. (3) `ResultsSkeleton` estático sin pulso (misma caja, pintado inicial más barato) y placeholder por fila con fondo (mismo tamaño, sin saltos).
- Archivos: `lib/market/price-batcher.ts`, `app/(platform)/app/market-screen.tsx`.
- Verificación: sintaxis OK con `node --check` en ambos. PENDIENTE operador: `npx tsc --noEmit`, `npm run lint`, `npm test`, y medir en `next dev` que las 20 primeras filas muestren precio antes.
- Próximos pasos: nada más de esta tarea.

## Accesibilidad y pulido mobile del flujo demo (2026-10-10)
- Hecho: sólo a11y + CSS mobile, sin tocar lógica de negocio ni trading. (1) Botones sólo-ícono ya tenían `aria-label`; se subió a 44px el buscar móvil y el avatar del top-bar (`size-10` → `size-11`). (2) Anillo `focus-visible:ring-4 ring-fg/20` donde faltaba: bottom-tabs, top-bar, stock-search (botón, cierre, reintento, opciones), sidebar, public-header, tabs, amount-input (campo + chips), input, links de registro/trade-sheet/detalle. (3) Toque ≥44px en móvil: confirmar/volver/reintentar/revisar de la hoja (`size="lg"` + `min-h-11`), links de pie del registro (`min-h-11`), chips y filtros ya eran `h-11`. (4) `useReducedMotion` en `market-screen.tsx` y `detail-screen.tsx` (`initial={false}` + `duration: 0` si reduce).
- Archivos: `registro/wizard.tsx`, `app-shell/{bottom-tabs,top-bar,stock-search,sidebar,public-header}`, `domain/trade-sheet.tsx`, `ui/{amount-input,input,tabs}`, `market-screen.tsx`, `accion/[ticker]/detail-screen.tsx`.
- Verificación: `tsc --noEmit` y `lint` PENDIENTES de corrida verde (ver nota). Sin cambios de copy ni de negocio.
- Pendiente operador: correr `npx tsc --noEmit` + `npm run lint` con `node_modules` completo (`npm ci` quedó a medias por timeout en esta sesión); revisar en 390px focos y tamaños.
- Próximos pasos: nada más de esta tarea; seguir con TAREAS.md.

## Mercado — la lista aparece antes (2026-10-08)
- Causa: la página no dibujaba nada hasta tener catálogo, precios y 20 gráficos. Cada gráfico volvía a pedir el precio, y la variación diaria frenaba todo el lote.
- Hecho: los nombres salen al llegar el catálogo. Los precios se completan después, sin la barra gris. Los gráficos esperan a que el lote de precios ya haya vuelto. Esa variación no retiene la lista más de 400 ms; si falta, entra en el refresco.
- Archivos: `market-screen.tsx`, `lib/market/{price-batcher,underlying-move}.ts`, `lib/services/prices.live.ts`.
- Verificación: tests de precios 23/23. En `next dev` (3210) la primera fila sale con el catálogo, sin `aria-busy`; los precios ~0,7 s después y ningún gráfico parte antes. «446 acciones». «Cargar más» llega a 40. En 390px la barra sigue oculta.

## Barra — logo fijo (2026-10-08)
- Hecho: el símbolo del favicon ya no cambia de tamaño ni se centra al colapsar. Queda en el mismo recuadro de 44px que los íconos (40×13px siempre).
- Archivo: `components/app-shell/sidebar.tsx`.
- Verificación: en `next dev` mock (3210) el centro del logo queda en x=30 abierto, cerrado y al reabrir; el ícono de Mercado también. En 390px la barra sigue oculta.

## Logos en la cartera (2026-10-08)
- Causa: la cartera y la billetera pedían el logo a `/api/tickers`, que sólo trae las xStocks. Una Ondo no está en esa lista, así que la fila quedaba en monograma.
- Hecho: si esa lista no trae logo, la fila usa el archivo local del símbolo (`AALon` → `/logos/aal.png`). Si el archivo no existe, sigue el monograma. Apple y el resto de xStocks no cambian.
- Archivos: `lib/catalog/logos.ts`, `portfolio-screen.tsx`, `wallet-screen.tsx`.
- Verificación: test del camino del logo. En `next dev` (3210, sesión mock) la cartera en 1280px y 390px muestra el logo de AALon (48px) y el de Apple. Sin errores de página.

## Precios y logos de Ondo (2026-10-08)
- Causa: Jupiter no manda `priceChange24h` en las Ondo, porque casi no operan. El precio del token se quedaba quieto y la variación salía 0 %. `logo_path` es null, así que se veía el monograma.
- Hecho: si falta esa variación, el titular usa el precio del subyacente que Jupiter sí actualiza, y la variación es la del día de esa acción. Las xStocks siguen con el precio del pozo. Se descargaron los logos de Ondo una vez a `public/logos` (396 nuevos, 48 ya estaban y no se pisaron). Sin archivo, queda el monograma.
- Archivos: `lib/market/{price-batcher,underlying-move,live-quotes}.ts`, `lib/services/prices.live.ts`, `lib/catalog/{assets,logos}.ts`, `scripts/descargar-logos-ondo.mjs`, `public/logos`.
- Verificación: tests de lote, variación, logos y mercado 29/29. En `next dev` (3210) AALon cotiza 12,80 con −0,39 % y ABNBon +1,62 %; NVIDIA sigue con la variación del pozo. En `/app` (1280 y 390) AALon muestra el logo y «Baja −0,39 %». La ficha carga el mismo logo y la variación de 24 h. El sitio público no cambia hasta que la rama esté en `main`.

## Ondo en el alcance curado (2026-10-08)
- Causa: maverlang.vercel.app usa `CATALOG_SCOPE=curated`. Ese alcance dejaba sólo las 50 xStocks (total 50, cero `on`). En local, sin esa variable, ya salían 446 y con precio. Las Ondo en `watch` siguen operables.
- Hecho: `curated` ahora también muestra las Ondo en `watch` o `listed`. Una xStock que no es curada sigue afuera. Si la empresa ya tiene xStocks, esa ficha se mantiene.
- Archivos: `lib/catalog/assets.ts`, `tests/unit/market-search.test.ts`.
- Verificación: tests de búsqueda, alcance y Ondo 48/48. Con `scope=curated` el API devuelve total 446 y la primera página abre en AALon. En `/app` (3210, 1280px) se ven American Airlines y Airbnb, «446 acciones». El sitio público no cambia hasta que esta rama esté en `main`.

## Cuenta real — aviso, sólo demo (2026-10-08)
- Hecho: pulsar «Cuenta real» (barra o perfil) no cambia de cuenta. Abre un aviso: estará disponible en poco tiempo y, mientras tanto, se conoce la plataforma. El botón lleva al mercado y la demo sigue activa. Una cookie vieja `mv_account=real` vuelve a demo.
- Archivos: `components/app-shell/account-switch.tsx`, `lib/hooks/use-account-mode.ts`, `content/i18n/es-CL.ts`, `en.ts`.
- Verificación: en `next dev` (3210, sesión mock) la cartera en 1280px abre el aviso al pulsar «Cuenta real», la demo sigue marcada y no aparece el vacío de la cuenta real. «Conocer la plataforma» va a `/app` y cierra el aviso. Escape lo cierra. La billetera sigue en demo. En 390px el aviso cabe en el perfil. Una cookie `mv_account=real` vuelve a demo al cargar el cliente.

## Hero +400 y Ondo operables (2026-10-08)
- Hecho: el chip del hero ya no dice «Sin cuenta en corredora de EE.UU.»; dice «Más de 400 activos» (el catálogo visible es 446). Las Ondo en `watch` quedan operables y sin chip «En revisión». No se escribió `listed` en la base, así las 50 curadas siguen operando. Si la empresa ya tiene xStocks, esa ficha se mantiene. Comprar una xStock en `watch` que no es Ondo sigue apagado.
- Archivos: `components/landing/hero.tsx`, `lib/catalog/assets.ts`, `portfolio-screen.tsx`, `tests/unit/ondo-issuer.test.ts`.
- Verificación: tests de Ondo, alcance, operación y búsqueda 55/55. En `next dev` (3210) el chip se ve en 1280px y 390px. AALon no trae «En revisión». La ficha ABNBon no dice «No disponible para operar» y la API la marca `tradable`. NVIDIA tampoco queda bloqueada.

## Mercado — las nuevas en la primera fila (2026-10-08)
- Hecho: el listado ya no abre con las 10 xStocks líquidas y deja las Ondo más abajo, ni «Cargar más» vuelve a llenarse sólo de esas. Sin búsqueda se alternan en todo el catálogo, empezando por un nombre nuevo. La primera fila es American Airlines (AALon), chip «En revisión». El monograma quita el sufijo `on` (AAL, no AALON). Comprar sigue apagado. Total 446.
- Archivos: `lib/catalog/assets.ts`, `tests/unit/market-search.test.ts`.
- Verificación: tests de búsqueda, alcance y Ondo 46/46. En `next dev` (3210) `/app` muestra AALon en la primera fila visible, en 1280px (y=562) y 390px (y=617), con «En revisión». «Cargar más» sigue mostrando Adobe. La ficha ABNBon dice «No disponible para operar».

## Portada — etiquetas y cinta (2026-10-08)
- Hecho: se quitaron las etiquetas numeradas de la portada («02 — En vivo», «03 — Cómo funciona» y las demás, más los números 01–03 de los pasos). Bajo la cinta ya no dice «Actualizado hace…»; dice «Opera con más de 400 acciones tokenizadas.» El catálogo visible es 446, así que no se escribió «+450».
- Archivos: `components/landing/ticker-marquee.tsx`, `section.tsx`, secciones de la portada y `live-landing-prices.tsx`. También `app/(marketing)/page.tsx` y `como-funciona/page.tsx`.
- Verificación: eslint de esos archivos ok. En `next dev` (3210) la portada en 1280px y 390px muestra la línea, los precios de la cinta y los títulos, sin esas etiquetas ni «Actualizado hace». `/como-funciona` igual.

## Buscar en un menú (2026-10-08)
- Hecho: el buscador ya no filtra la página del mercado. En la barra hay un botón «Buscar»; al pulsarlo se abre un menú con el campo y las coincidencias (chip «En revisión»). En el celular el botón está en la barra de arriba, y sin sesión en la cabecera pública. Comprar las nuevas sigue apagado.
- Archivos: `components/app-shell/stock-search.tsx`, barra, cabecera y `market-screen.tsx`. Se quitó el desplegable de la página.
- Verificación: en `next dev` (3210) buscar «airbnb» muestra ABNBon sin cambiar «446 acciones» ni la URL, en la barra (1280px, también colapsada), en el celular (390px) y sin sesión. Escape cierra el menú. La ficha dice «No disponible para operar».

## Primera página del mercado (2026-10-08)
- Hecho: sin búsqueda, la primera página ya no es sólo las 50 xStocks. Esas tienen liquidez y las Ondo no, así que quedaban detrás. Ahora la mitad de esa página son las nuevas (chip «En revisión»). El total sigue en 446. Comprar sigue apagado.
- Archivos: `lib/catalog/assets.ts`, `tests/unit/market-search.test.ts`.
- Verificación: tests de búsqueda, alcance y Ondo 46/46. En `next dev` (3210) `/app` muestra Airbnb y NVIDIA, «446 acciones», en 1280px y 390px; «Cargar más» llega a 40 sin repetir Airbnb; la ficha ABNBon dice «No disponible para operar».

## Barra — logo a la mitad (2026-10-08)
- Hecho: el símbolo del favicon en la barra pasa de 80×26px a 40×13px (colapsada 24×8px). El clic sigue en un área de 44px.
- Verificación: en `next dev` mock (3210) el logo mide 40×13 expandido y 24×8 colapsado; Mercado, Cartera y Billetera siguen en la barra.

## Ondo visible en la demo (2026-10-08)
- Hecho: precios, historial y estado aceptan símbolos Ondo (`ABNBon`), no sólo los que terminan en `x`. El mercado de la demo las dibuja (446 en total, chip «En revisión»). Comprar sigue apagado: están en `watch`.
- Archivos: `lib/catalog/symbol.ts`, `lib/api/{contracts,handler}.ts`, `lib/services/prices.mock.ts`, tests de validación.
- Verificación: tests de contratos 29/29. En `next dev` (3210) buscar «airbnb» muestra ABNBon con «En revisión» en 1280px y 390px; la ficha abre con precio Jupiter y «No disponible para operar»; el mercado dice «446 acciones».

## Barra lateral — favicon y ancho (2026-10-08)
- Hecho: el encabezado de la barra usa `app/icon.png` (el mismo archivo que el favicon), recortado a la tinta, en vez del texto `site.name`. Tamaño de cabecera: 80×26px expandida y 48×16px colapsada. Ancho expandido 240px → 220px (colapsada sigue en 72px). El interruptor demo/real usa `compact` para quedar en una línea.
- Archivos: `components/app-shell/{sidebar,brand-image,account-switch}.tsx`, `components/ui/segmented-control.tsx`, `docs/DESIGN-SYSTEM.md`.
- Verificación: `npx tsc --noEmit` ok. En `next dev` mock (puerto 3210) la barra mide 220px, el símbolo es el favicon, «Cuenta demo / Cuenta real» mide 44px de alto (una línea), el menú (Perfil, Ajustes, USD/CLP, Cerrar sesión) abre, y Mercado/Cartera/Billetera siguen con el ítem activo. En 390px la barra no se muestra y queda la barra superior.

## Cierre bloque 1 (2026-10-08, operador)
- Integrado en main: M49, M56, M46, M59, M54, M52b, fix M53 (.in), fix M54 (vender siempre), M55 + fix cron diario (Hobby), M57, M57b, M87-base y M75 (main 56f8dfb antes de esta nota).
- Migraciones aplicadas en dev (pgtool, verificadas por objetos e idempotentes): 0010, 0022, 0011 y 0015. audit:rls 80 OK, 0 FALLA.
- Verificación pesada sobre main: build (.next-verify) ok; npm run e2e 8 passed, 1 skipped; npm run e2e:auth 1 passed. Geo en 3100: US /app/registro -> /bloqueado, US /app 200, CU / -> /bloqueado. Mercado: 446 visibles, 50 operables.
- Pendiente: hola@maverlang.com aún no existe en Supabase auth (make-admin cuando Manu se registre); corrida 2 de audit:catalog en horario regular (10:30-17:00 Chile); fila huérfana asset_safety_runs id 1; sync-xstocks --listed; push lo hace Manu.

## M87-base — CI en GitHub Actions (job checks) (2026-10-08)
- Hecho: `.github/workflows/ci.yml` (job `checks`: typecheck, lint, test, `scan:secrets`, `audit:deps`; `pull_request` + `push` a `main`; Node 22 según `engines`; `npm ci` con caché; timeout 20 min; sólo env mock/dummy, cero `secrets.*`) + `.github/pull_request_template.md` (checklist: criterios, checks HTTP, capturas UI, migraciones en dev). `scripts/e2e.mjs` ya es portable (`path.join` + `spawn(process.execPath)`, sin PowerShell/win32): sin cambios. NO hecho (ola 21, tras M86): job `e2e`, rama protegida en `docs/DEPLOY.md`, CODEOWNERS.
- Verificación: YAML parseado con `js-yaml` (8 steps, triggers ok, sin `secrets.*`); `npx tsc --noEmit` ok; `npm run lint` ok; `npm test` 444/444 (58 archivos); `npm run scan:secrets` limpio. Digo con todas sus letras: `npm run audit:deps` sale 1 (4 altas en 2 avisos ya justificados en `docs/SEGURIDAD.md` M58) → el step de auditoría del CI quedará en rojo hasta parche upstream o cambio de política; build prod y `npm run e2e` NO corridos (los corre el operador); el workflow corre en GitHub recién cuando Manu haga push.
- Pendiente operador/Manu: decidir política del step `audit:deps` (¿rojo hasta fix upstream vía Dependabot, o informativo?); build prod + `npm run e2e`; push (prohibido aquí) para ver el primer run en GitHub; protección de rama en ola 21 (Manu hoy hace push directo a `main`: no se cambia nada aún).
## M75 — bloqueo de países y declaración US person (2026-10-08)
- Hecho: dos niveles (navegar salvo CU/IR/KP/SY y UA-43/14/09; registro y operación real si la IP, la residencia, la nacionalidad o el país del documento está en la lista). Declaración versionada `2026-10-draft` en `profiles` + consent `us_person` (trigger). `0015_compliance.sql` escrita y NO aplicada. `realQuoteGeoDecision("GB")` devuelve `GEO_BLOCKED` y NO está conectada a `/api/trade/quote` (esas rutas siguen en 503 por M46).
- Archivos clave: `config/compliance.ts`, `lib/compliance/{real-quote,profile-write}.ts`, `lib/auth/gate.ts`, `middleware.ts`, onboarding/registro/`app/bloqueado`, `0015_compliance.sql`, `scripts/audit-rls.mjs`, `docs/SUPABASE.md`, `e2e/smoke.spec.ts`, `tests/unit/compliance-m75.test.ts`.
- Decisiones: lista [REVISIÓN ABOGADO] provisoria; `GEO_BLOCKED_COUNTRIES` sólo suma; `DEMO_FOR_BLOCKED=false` (true deja la demo, no la cotización real); alta demo M43 sigue sin país; no hay Google (M63): el onboarding queda para reutilizar; un VPN no se detecta del todo; `/admin` (M57) y `/app/ingresar/verificar` (M57b) siguen exentos. `scripts/check-env.mjs` se ajustó aunque no estaba en la lista (el env ya no tiene que traer US). `GET /api/geo` no se tocó: ningún componente lo llama y sigue mirando sólo el env.
- Verificación: `npx tsc --noEmit` ok; `npm run lint` ok; `npm test` 469/470 y el timeout de `real-disabled` (POST build → 503) verde aislado 7/7. Criterios: IP US en `/app` → next y en `/app/registro` → `/bloqueado?motivo=ubicacion` en `gate.test.ts` + cableado de `middleware.ts` (el curl HTTP NO se corrió: no levanté servidor); CU y UA-43 bloquean navegar, y CL+CL opera, en `compliance-m75.test.ts`; GB → `GEO_BLOCKED` en ese test y `app/api/trade/quote/route.ts` no importa `lib/compliance`; versión y fecha en `declarationRecord` y en las columnas/trigger de 0015 (no hay fila en Supabase: el SQL no se aplicó); el e2e de smoke pide Nacionalidad y "Declaro que no soy ciudadano" (no corrí `npm run e2e`).
- Pendiente operador/Manu: pegar `0015_compliance.sql` después de 0011; hasta entonces la declaración no queda guardada (el update reintenta sin esas columnas). Build `NEXT_DIST_DIR=.next-verify`, `npm run e2e` y `npm run e2e:auth` (gate, middleware y registro). Curl con `x-vercel-ip-country`. El abogado confirma la lista antes de M88.

## M55b-fix — cron diario compatible con Vercel Hobby (2026-10-08)
- Hecho: `vercel.json` con `0 16 * * 1-5` (16:00 UTC = 13:00 Chile, horario regular EE.UU.; antes `*/30 * * * 1-5` que Hobby rechaza en deploy); nota del cron en `docs/CATALOGO-SEGURIDAD.md` con la cita de la doc de Vercel y el cambio a `*/30` en M50 con Pro (resto cubierto con `audit:catalog --db`).
- Verificación: `npx tsc --noEmit` ok; `npm run lint` ok; `npm test` 431/431. Ningún test menciona `*/30` (sólo `vercel.json` lo traía).
- Pendiente operador: comentarios "cada 30 min" en `.env.example:106` y `lib/env.ts:268` quedaron intactos (alcance mínimo; actualizar en follow-up); deploy para confirmar que el cron diario pasa en Hobby.

## M55 — monitor de seguridad del catálogo (2026-10-08)
- Hecho: `runSafetyBatch({offset,limit})` en `lib/catalog/monitor.ts` (server-only: lote listed/watch por `safety_checked_at` nulos primero, xStocks por símbolo + precio v3 + 3 cotizaciones con ritmo/backoff M52 vía `parseOrderQuote`/`quoteCostBps`/`evaluateAsset`/`nextSafetyState` puros; Ondo sin xStocks con ref del hermano o v3, volumen nunca excluye; corte a 50 s); `GET /api/cron/catalog-health` (Bearer `CRON_SECRET` en tiempo constante: 401 sin/mal token, 503 "Cron deshabilitado." sin secreto; `{checked,changed,remaining}`, no-store); evento + `notifyOps` (sólo log `[catalog-health]`) al cruzar `listed`; `ASSET_UNAVAILABLE` (409) SÓLO en compra de activo conocido en revisión (venta intacta M54c, desconocido sigue `MINT_NOT_ALLOWED`); `vercel.json` cada 30 min lun–vie (+ nota Hobby máx. 1/día en `docs/CATALOGO-SEGURIDAD.md`).
- Archivos clave: `monitor.ts`, `cron/catalog-health/route.ts`, `alerts.ts`, `trade/quote/route.ts`, `result.ts`+`types`+i18n es/en (código nuevo), `vercel.json` (nuevo), `lib/env.ts`+`.env.example` (sólo comentario M55), `docs/CATALOGO-SEGURIDAD.md`, `tests/unit/catalog-health{,-route}.test.ts` (10 nuevos).
- Decisiones: rama `a/M55` (carril A, sin `git pull`); sin migración (ninguna); `CRON_SECRET` ya existía (M46); 503 reutiliza `REAL_DISABLED` con mensaje propio (único 503); transición M54 intacta; `git` denegado por el sandbox (rama confirmada por `.git/HEAD`).
- Verificación: `npx tsc --noEmit` ok; `eslint` de 11 archivos tocados ok (`npm run lint` completo excede 120 s, como en M54); `npm test` 430/431 (56 archivos, 10 nuevos; `scan-secrets` con 1 timeout por carga, verde aislado). Criterios: 401/401/503/200+`{checked,changed,remaining}`+no-store en test de ruta; lote 3 activos (pasa/watch por costo_venta_100_210bps/hidden por suspendido) con 2 eventos y warns en test; presupuesto con reloj falso en test; compra watch→409+texto y venta con posición→200 en test; cron fuera del matcher (`middleware.ts:118-120` excluye `/api`) en código. Digo con todas sus letras: NO comprobables aquí `force_hide`→mercado ≤5 min con base real, curl contra deploy, build prod ni `npm run e2e` (los corre el operador).
- Pendiente operador: `curl` 401/200 al cron con `CRON_SECRET` real, `force_hide` en base y mercado ≤5 min, cotización demo de watch (409+texto), build prod (`.next-verify`) + `npm run e2e`; verificar en M50 el límite Hobby de crons; `git add -A` + commit M55 (el sandbox denegó `git`: el árbol queda con los cambios sin commitear).
## M57b — verificación en dos pasos (TOTP) (2026-10-08)
- Hecho: `lib/auth/mfa.ts` (enroll, verify con challenge, list, remove, needsMfaStep). En Ajustes: Activar muestra QR y secreto, confirma 6 dígitos; Desactivar pide un código actual (verify sube a aal2 y después unenroll). Tras la contraseña, si `nextLevel === aal2` y `currentLevel === aal1` va a `/app/ingresar/verificar`; si no, el ingreso no cambia. Salir cierra la sesión.
- Archivos clave: `lib/auth/{mfa,gate}.ts`, `components/auth/mfa-settings.tsx`, `app/(platform)/app/ingresar/supabase-login.tsx`, `app/(platform)/app/ingresar/verificar/{page,form}.tsx`, `app/(platform)/app/ajustes/settings-screen.tsx`, `content/i18n/{es-CL,en}.ts`, `tests/unit/mfa.test.ts`.
- Decisiones: el gate rebotaba `/app/ingresar/*` con sesión; sin esa excepción la pantalla no aparece (no toqué `middleware.ts` ni `lib/admin`). CSP `img-src` ya permite `data:`: se muestra el QR y siempre el secreto; no abrí la CSP. `totpQrSrc` codifica el SVG para que un `#` no corte la imagen. Sin migración ni paquetes. `/app/perfil/seguridad` sigue en Próximamente (archivo fuera de la tarea).
- Verificación: `npx tsc --noEmit` ok; `npm run lint` ok (0 warnings); `npm test` 441/441 (57 archivos; `mfa.test.ts` 7). Criterios: sin factor → `needsMfaStep` false (test) y el login no arma la ruta (`supabase-login.tsx`); aal1→aal2 → ruta + el gate la deja (test); letras o largo ≠ 6 no llaman a `verify`; `https://` y `//` caen a `/app`; rechazo de Supabase → "Código incorrecto o vencido…"; `client-imports` verde. Digo con todas sus letras: NO comprobé en navegador activar, desactivar, ni que un código real deje la sesión en `aal2` y `/admin` muestre el panel (no levanté next dev; aquí no hay cuenta ni factor). NO corrí build ni `npm run e2e` / `e2e:auth`.
- Pendiente operador/Manu: build `NEXT_DIST_DIR=.next-verify`, `npm run e2e` y `npm run e2e:auth`; activar TOTP en Ajustes con la cuenta de Manu, ingresar y abrir `/admin`. MFA TOTP tiene que estar habilitado en el proyecto Supabase. La fila Perfil → Seguridad sigue en Próximamente.

## M54c-fix — vender siempre lo que se tiene (2026-10-08)
- Hecho: `requireOperable(symbol, side)` en `lib/catalog/tradable.ts` (buy exige `tradable`; sell basta con existir en catálogo con cualquier estado o snapshots, mint válido por emisor; desconocido → `MINT_NOT_ALLOWED` ambos lados); se usa en `/api/trade/quote` (vía `requireSymbolForSide`) y servicios demo mock/supabase; cartera avisa `hidden` ("Ya no está disponible para comprar…", es/en) y chip "En revisión" en `watch` con Vender disponible; detalle `watch`/`hidden` abre con posición (comprar off, vender on; `?operar=vender` funciona) y muestra "no encontrado" sin posición; `asset-status` expone `safetyStatus`/`tradable`/`underReview` opcionales; test `operable-side` (8).
- Archivos clave: `tradable.ts`, `handler.ts`, `trade/quote/route.ts`, `trade.mock.ts`, `demo.supabase.ts`, `asset-status(.shared).ts`, `contracts.ts`, `page.tsx`+`detail-screen.tsx`, `portfolio-screen.tsx`, i18n es/en, `tests/unit/operable-side.test.ts`.
- Verificación: `npx tsc --noEmit` ok; `npm run lint` ok; `npm test` 421/421 (54 archivos, 8 nuevos); `client-imports` verde. Criterios: compra watch→`MINT_NOT_ALLOWED`; venta watch/hidden con posición→ok; venta desconocida→`MINT_NOT_ALLOWED`; venta sin saldo→`INSUFFICIENT_FUNDS`; 50 curadas compran/venden igual. Digo con todas sus letras: NO comprobables aquí build prod ni `npm run e2e` (los corre el operador).
- Pendiente operador: build prod + `npm run e2e`; mirar cartera con posición `hidden` (aviso + Vender) y detalle `hidden` con/sin posición (`?operar=vender`).
## M57 — rol admin, flags y panel mínimo (2026-10-08)
- Hecho: lista blanca del cliente admin (`lib/services/*.supabase.ts`, `lib/catalog/monitor.ts`, `lib/admin/*`, `app/api/cron/*`); la escritura de la lista de espera pasó a `lib/services/waitlist.supabase.ts`. `0011_admin.sql` escrita y NO aplicada: `app_admins` (RLS, sin políticas), `is_admin` (security definer, execute sólo `service_role`), `app_flags` con semillas. `requireAdmin` exige `aal2` + fila o `notFound()`. `getFlag` cache 30 s y default seguro; no conectado a `/api/trade`. `/admin` (noindex, fuera del layout) busca, oculta o quita override con nota y evento, e interruptores con confirmación. `/admin` fuera del geobloqueo. `scripts/make-admin.mjs <email>`.
- Archivos clave: `tests/unit/admin-client-usage.test.ts`, `supabase/migrations/0011_admin.sql`, `lib/admin/{guard,store,override}.ts`, `lib/flags.ts`, `lib/services/waitlist.supabase.ts`, `lib/waitlist/server.ts`, `app/admin/{page,actions}.ts`, `middleware.ts`, `scripts/{make-admin,audit-rls}.mjs`, `docs/SUPABASE.md`, `tests/unit/{admin-m57,waitlist}.test.ts`.
- Decisiones: ocultar escribe `safety_status=hidden` al momento (caché del catálogo = 5 min; el monitor de M55 no existe); quitar override no re-lista. Los flags se guardan y todavía no cambian compras ni depósitos (M70/M74). `deposits_enabled` y `withdrawals_enabled` son default seguro, no semilla ni interruptor. El correo no va en el código.
- Verificación: `npx tsc --noEmit` ok; `npm run lint` ok; `npm test` 426/426 (55 archivos; 1ª pasada 1 timeout de `real-disabled` por carga junto a tsc/lint, verde aislado). Criterios: sin sesión, `aal1` o fuera de `app_admins` → `notFound` en `admin-m57`; `aal2`+admin → ok; `getFlag` con la base caída → false sin cache; ocultar deja `hidden`, la nota en el evento y `CATALOG_CACHE_MS` ≤ 5 min; lista blanca en `admin-client-usage` (2). Digo con todas sus letras: NO comprobables aquí el 404 HTTP de `/admin`, ocultar contra la base ni que el mercado lo saque en ≤ 5 min, ni build prod, ni `npm run e2e` / `e2e:auth` (no levanté next dev).
- Pendiente operador/Manu: pegar `0011_admin.sql` después de 0010; `node scripts/make-admin.mjs hola@maverlang.com`; build `NEXT_DIST_DIR=.next-verify`; `npm run e2e` y `npm run e2e:auth` (middleware y sesión); comprobar 404 sin sesión, con sesión normal y admin sin MFA, y que ocultar saca el activo en ≤ 5 min con la nota en `asset_safety_events`.

## M53b-fix — audit-catalog --db usa .in() y cierra la corrida si falla (2026-10-08)
- Hecho: `.in_("symbol", batch)` → `.in("symbol", batch)` en `syncSafetyToDb`; `git grep -E "\.(in_|eq_|is_|not_)\(" -- scripts lib` vacío (era el único); nuevo `closeSafetyRun` (finished_at + notes corto, sin claves ni cuerpos) en fallos post-insert de lectura/upsert/eventos; `syncSafetyToDb` acepta `admin` inyectable (sólo tests, producción intacta) + JSDoc con opcionales; test `audit-catalog-db.test.ts` (3, cliente falso encadenable sin red).
- Archivos clave: `scripts/audit-catalog.mjs`, `tests/unit/audit-catalog-db.test.ts`.
- Verificación: `npx tsc --noEmit` ok; `npm run lint` ok; `npm test` 413/413 (53 archivos, 3 nuevos; 1ª pasada con 1 timeout de `scan-secrets` por carga, verde aislado y en la 2ª completa). Criterios: sin `.in_(` en el repo; lotes 200/200/50 con `.in("symbol", …)`; fallo de lectura cierra el run y no escribe; feliz actualiza assets + eventos + cierre. Digo con todas sus letras: NO comprobables aquí `audit:catalog --db` real, build prod ni `npm run e2e` (los corre el operador).
- Pendiente operador: fila huérfana `asset_safety_runs` id 1 (`finished_at` null, corrida 07-oct caída por el bug `.in_`): NO tocada desde código ni SQL; cerrarla a mano con `update ... set finished_at = now(), notes = 'cerrada a mano: corrida 07-oct falló por bug .in_' where id = 1 and finished_at is null`. Luego correr `audit:catalog --db` en horario regular, build prod + `npm run e2e`.

## M52b — Ondo como segundo emisor (migración 0022 sin aplicar) (2026-10-08)
- Hecho: `gen-ondo-seed.mjs` genera `config/ondo.generated.ts` + `0022_ondo_issuer.sql` (444/212/192/6 exactos; TQQQ/SOXL/SOXS/SQQQ/PSQ+AIon fuera; todo en `watch`); `pickListingPerCompany` (tradable→visible→costo US$100→volumen) en search/bySymbol con redirect en el detalle; `staticChecks`/`tradable` por emisor (Ondo: registro + Stock/ETF, sin constantes xStocks; `Xs` sólo xStocks); auditoría con universo Ondo, parser RFQ/JupiterZ (`parseOrderQuote`), decimales reales, ref del hermano xStocks, volumen que nunca excluye y cache de cotizaciones con sesión (re-cotiza lo fallado de noche); `sync-xstocks` filtra Ondo; ficha Ondo muestra "Ondo" con monograma.
- Archivos clave: `scripts/gen-ondo-seed.mjs`, `config/ondo.generated.ts`, `0022_ondo_issuer.sql`, `data/ondo/*` (operador), `safety-core.mjs` (`classifyProduct` distingue short-inverso de bonos cortos/empresas "Ultra … Holdings"; `quoteCostBps` con decimales), `assets.ts` (`issuer`/`company_ticker`/`buy100CostBps`, select tolerante pre-0022), `tradable.ts`, `trade.live.ts` (nota RFQ), `accion/[ticker]/page.tsx` (redirect), `audit-catalog/sync-xstocks.mjs`, `docs/SUPABASE.md`, `tests/unit/ondo-issuer.test.ts` (25), `client-imports` (veta tradable).
- Decisiones: `git pull --ff-only` denegado por el sandbox (árbol limpio, se siguió igual); xStocks conserva "Backed (xStocks)" en ficha (copy legal intacto); `Ticker.decimals` sigue 8 en demo (live apagado; decimales reales sólo en auditoría); `audit --db` sin 0022 escribe xStocks y avisa una línea por Ondo; bug `.in_(` NO tocado; `parseOrderQuote` estricto (montos + AMM o RFQ cuentan).
- Verificación: `npx tsc --noEmit` ok; `npm run lint` ok (0 errores); `npm test` 410/410 (52 archivos, 25 nuevos); `gen-ondo-seed` 2 corridas idénticas; `scan:secrets` limpio. Criterios: conteos y exclusiones en test; listing (xStocks↔Ondo, costo, volumen) en test; mint Ondo fuera→hidden en test; watch→no opera y mint desconocido→false en test; RFQ válida=ruta y sin montos=`sin_ruta_compra_100` en test; vol 0 pasa y 1000@160bps falla en test. Digo con todas sus letras: NO comprobables aquí aplicar 0022, `audit:catalog`/`sync` contra la base, build prod ni `npm run e2e` (los corre el operador; el smoke mock AAPLx/apple sigue intacto en código).
- Pendiente operador/Manu: aplicar 0022 cuando Manu autorice; correr `audit:catalog` en horario regular 10:30–17:00 Chile (re-cotiza los 206 xStocks nocturnos: el cache ya es por sesión); build prod + `npm run e2e`; borrar `scripts/tmp-ondo-check.mjs` y `tmp-ondo-report.json` (temporales de esta sesión, fuera del commit; regla de no-borrar).

## M54 — catálogo ampliado con estado de seguridad (2026-10-07)
- Hecho: `CATALOG_SCOPE=curated|listed|all` (default `listed`; `all` en prod cae a `listed` con warn único); `assets.ts` mapea `safety_*` a `CatalogAsset` (`tradable`, `underReview`, `transitionKept`) con `annotateSafety`/`isTransitionActive` en un solo lugar; `lib/catalog/tradable.ts` (server-only: `isTradableMint`, `tradableBySymbol`, forma `Xs` 43–44 base58, fallback snapshot); rutas trade/quote, prices e historial con gates dinámicos; mercado con total "N acciones", chip "En revisión" y filtro "Otras"; detalle con CTA deshabilitado en revisión y 404 en `hidden`; `sync-xstocks --listed` implementado.
- Archivos clave: `lib/{env.ts,catalog/{assets,tradable}.ts,api/{contracts,client,handler}.ts,market/{browse,price-batcher}.ts,services/{trade.mock,demo.supabase,prices.mock}.ts,types}`, rutas `market/search|prices|history|trade/quote`, `market-screen`, `ticker-row`, `detail-screen`+`page`, i18n es/en, `check-env.mjs`, `sync-xstocks.mjs`, `tests/unit/catalog-scope.test.ts` (9 nuevos), `market-search`+`asset-status` actualizados, `e2e/smoke.spec.ts` (test M54 con fixture de 60).
- Decisiones: transición = sin ningún `listed` en el catálogo (NO por `asset_safety_runs`: hay fila huérfana id 1 con `finished_at` null); curados en transición operan sin chip; fallback = snapshot (nunca permitir todo); mock acepta símbolos bien formados en precios/historial (sólo mock); sin paquetes nuevos; `git pull --ff-only` denegado por el sandbox (árbol limpio, se siguió igual).
- Verificación: `npx tsc --noEmit` ok; `eslint` de 22 archivos tocados ok (`npm run lint` completo excede 180 s, como en M45); `npm test` 385/385 (51 archivos, 9 nuevos; 2 timeouts por carga en la 1ª pasada, verdes aislados y en la 2ª completa). Criterios: apple→AAPLx y paginación sin duplicados en test; watch/hidden→`MINT_NOT_ALLOWED` en servicio y ruta; Supabase caído→snapshot; `client-imports` verde. Digo con todas sus letras: NO comprobables aquí `total ≥ 200` con datos reales, build prod ni `npm run e2e` (los corre el operador).
- Pendiente operador/Manu: correr `sync-xstocks --listed` (NO corrido aquí por nota del operador) y commitear el generado; checks con datos reales (search, apple/nvidia, orden watch rechazada); build prod + `npm run e2e`. Bug previo aparte (NO tocado): `scripts/audit-catalog.mjs` línea ~915 usa `.in_(` en vez de `.in(` y la 1ª corrida no escribió eventos.

## M59 — validación de entornos (2026-10-07)
- Hecho: `lib/env.ts` con `APP_ENV`/`SUPABASE_PROJECT_ENV`/`SUPABASE_PROD_URL_EXPECTED`/`VERCEL_ENV`; estricto sólo con `APP_ENV=production|preview` explícito o proyecto `prod` (falla build/arranque con nombres, nunca valores); sin eso, demo/desarrollo con `console.warn` único. `instrumentation.ts` llama a `assertServerEnv()`. `npm run check:env` (`--env`, `--file`, tabla OK/FALTA/INVÁLIDA sin valores, exit 1 en estricto incompleto). `docs/ENTORNOS.md` (entornos, flujo rama→preview→main→producción, `APP_ENV=production` recién en M60). `e2e.mjs` borra `APP_ENV`/`SUPABASE_PROJECT_ENV` (mock leniente).
- Archivos clave: `lib/env.ts`, `instrumentation.ts`, `scripts/{check-env.mjs,e2e.mjs}`, `docs/ENTORNOS.md`, `.env.example`, `package.json`, `tests/unit/env-validation.test.ts` (20 nuevos).
- Decisiones: `git pull --ff-only` denegado por el sandbox (árbol limpio, se siguió igual); `VERCEL_ENV`/`NODE_ENV` nunca activan el estricto; preview exige proyecto `dev` + `REAL_TRADING_READY=false`; `DATA_MODE=live` sólo con `REAL_TRADING_READY=true`; `SUPABASE_PROD_URL_EXPECTED` sólo existe en producción; sin paquetes nuevos.
- Verificación: `npx tsc --noEmit` ok; `npm run lint` ok (0 errores, 0 warnings); `npm test` 376/376 (50 archivos, 20 nuevos); `npm run check:env` sale 0 con avisos; `-- --env production` y `-- --env preview` listan faltantes y salen 1; enmascarado (len+prefijo sólo públicas) comprobado con dummies. Digo con todas sus letras: NO comprobables aquí build prod, `npm run e2e`/`e2e:auth` ni checks con datos reales (los corre el operador).
- Pendiente operador/Manu: build prod (`NEXT_DIST_DIR=.next-verify`), `npm run e2e`, `npm run check:env` real; `APP_ENV=production` en Vercel recién en M60.

## M46 — escáner de secretos y guía de rotación (2026-10-07)
- Hecho: `scripts/scan-secrets.mjs` (`npm run scan:secrets`, sin deps: árbol + `--history` + bundle, enmascara 6+…, exit 1; `sb_secret_` suelto no cuenta) + `scripts/project-guard.mjs` (imprime sólo el ref, exige `--confirm-project` fuera de desarrollo) en 5 scripts con secret; `REAL_TRADING_READY` (default `false`) + `CRON_SECRET`/`SENTRY_AUTH_TOKEN`/`RESEND_API_KEY`/`HELIUS_API_KEY` en `lib/env.ts`+`.env.example`; 503 `REAL_DISABLED` en 6 rutas (trade/* sólo camino real, demo intacta) + código en result/tipos/i18n es-en; `requireCronSecret` (tiempo constante); waitlist en lista blanca comentada; sección Secretos en `docs/SEGURIDAD.md` (M49 intacto).
- Archivos clave: `scripts/{scan-secrets,project-guard}.mjs`, `lib/{env,api/{handler,result}}.ts`, 6 `app/api/**/route.ts`, `tests/unit/{no-secrets-in-client,scan-secrets,admin-routes-protected,real-disabled}.test.ts` (23 nuevos), `docs/SEGURIDAD.md`, `package.json`.
- Decisiones: `git pull --ff-only` denegado por el sandbox (árbol limpio, 4 commits por delante según operador; se siguió igual); `--history` y scripts con secret NO corridos aquí (los corre el operador); fixtures de tests armados por partes para que el escáner no se marque a sí mismo; `trade/quote` (sólo cotiza) sin 503, según alcance.
- Verificación: `npx tsc --noEmit` ok; `npm run lint` ok; `npm test` 356/356 (49 archivos, 23 nuevos); `npm run scan:secrets` → "limpio" (exit 0). Criterios: árbol con 0 en CLI; fixture temporal `sb_secret_`+16 detectado y enmascarado en test; salida sin valor completo en test; admin sin sesión/CRON en test (waitlist blanca); 503 por ruta en test (3 siempre + 3 camino real). Digo con todas sus letras: NO comprobables aquí `--history`, scripts con secret, bundle `.next-verify`, build prod, `npm run e2e` ni checks HTTP (los corre el operador).
- Pendiente operador/Manu: `npm run scan:secrets -- --history` (si sale la vieja: anotar "clave rotada, el valor del historial ya no sirve", sin reescribir); Manu rota la clave; repo GitHub (M50) **privado**; build prod (`NEXT_DIST_DIR=.next-verify`) + `npm run e2e` + checks HTTP del 503 y demo intacta.

## M56b-fix — origen permitido según el host de la solicitud (2026-10-07)
- Hecho: `assertSameOrigin` acepta el `Origin`/`Referer` si su `origin` iguala `NEXT_PUBLIC_SITE_URL` o si su `host` coincide con `x-forwarded-host` (primer valor), `host` o el host de `req.url` (Next no lo garantiza tras proxies: e2e en `127.0.0.1:3456` daba 403). Resto intacto: sin origen → 403, evil → 403, GET/HEAD/OPTIONS y exentas pasan. Test nuevo (a/b pasan, c 403); `e2e/` sin POST directo: no se toca.
- Archivos clave: `lib/api/handler.ts`, `tests/unit/api-routes-validated.test.ts` (16).
- Verificación: `npx tsc --noEmit` ok; `npm run lint` ok; `npm test` 333/333 (45 archivos, 1 nuevo). Digo con todas sus letras: NO comprobables aquí `npm run e2e` ni el 403 real en navegador (los corre el operador).
- Pendiente operador: `npm run e2e` (demo-usd + smoke en puerto 3456).

## M56 — validación de entradas y CSRF (2026-10-07)
- Hecho: `parseJson(req,schema,{maxBytes:16KB})` (413 + 400 `VALIDATION` con campos sin valores, `.strict()`), `parseQuery` (q≤64, símbolo `^[A-Za-z0-9.]{1,12}x$`, page/pageSize acotados), `assertSameOrigin` (403 `FORBIDDEN_ORIGIN`, exentos `/api/onramp/webhook` y `/api/cron/*`) y `handle()` con `requestId` + mensaje genérico en 500 (detalle sólo en log). 24 rutas migradas (orden: origin→rate limit→parse); `queryOf`/`bodyOf` quedan como alias. Montos trade: finito>0, ≤2 dec USD (≤8 acciones), USDC≤`MAX_ORDER_USD`=1000 (`config/trade.ts`); CLP/acciones se topan en el servicio. Códigos nuevos `FORBIDDEN_ORIGIN`/`PAYLOAD_TOO_LARGE` (result+tipos+i18n es/en+cliente con `requestId`).
- Archivos clave: `lib/api/{handler,contracts,result,client}.ts`, `lib/types/index.ts`, `config/trade.ts`, 17 `app/api/**/route.ts`, `tests/unit/api-routes-validated.test.ts` (15), i18n es/en.
- Decisiones: `git pull --ff-only` denegado por el sandbox (árbol limpio, se siguió igual); M54 pendiente → símbolo validado con regex + `requireSymbol` existente; webhook sin Origin ni `parseJson` (firma con cuerpo crudo); waitlist conserva su forma `{message}/{error}`; CLP sin tope de esquema (lo convierte el servicio); e2e sin POST directo (sólo intercepción waitlist: el navegador manda Origin).
- Verificación: `npx tsc --noEmit` ok; `npm run lint` ok; `npm test` 332/332 (45 archivos, 15 nuevos). Criterios: cobertura 100 % en el test estático; demo/Ajustes/perfil intactos en tests (`demo-account`, `display-currency`, `contracts`, `waitlist`) y formas de respuesta sin cambios; 500 sin fugas en test de comportamiento. Digo con todas sus letras: NO comprobables aquí build prod, `npm run e2e` ni el 403 real en navegador (los corre el operador).
- Pendiente operador/Manu: build prod (`.next-verify`), `npm run e2e`, probar Origin evil en `/api/demo/reset` y cuerpo de 20 KB contra el deploy; nada que revisar de copy legal (sin textos nuevos salvo mensajes de error).

## M49b-fix — check de upstash con formato REST correcto (2026-10-07)
- Hecho: `scripts/check-upstash.mjs` envía cada comando como `POST` a `${url}/` con cuerpo `["INCR"|"EXPIRE"|"GET"|"DEL", key, ...]`; limpieza con `DEL` en `finally`; salida con `process.exitCode` (sin `process.exit()` tras `fetch`); sin imprimir claves.
- Verificación: `npx tsc --noEmit` ok; `npm run lint` ok; `npm test` 317/317 (44 archivos). `npm run check:upstash` NO corrido aquí (claves reales; lo corre el operador).
- Pendiente operador: `npm run check:upstash` con variables reales (esperado "OK upstash").

## M49 — límite de solicitudes (2026-10-07)
- Hecho: `lib/security/rate-limit.ts` (server-only; `limit(key,policy)` + `withRateLimit(req,pol,parts)` → 429 con `Retry-After`/`X-RateLimit-Remaining`; Upstash si hay URL+token, si no memoria con aviso en prod; `RATE_LIMIT_TEST_SEARCH` sólo dev) + `RATE_LIMITED` (429) en tipos/result/i18n es-en + cliente sin reintento de 429 (`queryRetry` en providers) + `check:upstash` + sección Supabase Auth/Turnstile en SEGURIDAD.md + tests (10).
- Archivos clave: `lib/security/rate-limit.ts`, 18 rutas `app/api/**`, `lib/{env,api/{handler,client}}.ts`, `app/providers.tsx`, `waitlist-form.tsx`, `scripts/{check-upstash,e2e,e2e-auth}.mjs`, `tests/unit/rate-limit.test.ts`, `docs/SEGURIDAD.md`, `.env.example`.
- Decisiones: instalados `@upstash/ratelimit`+`@upstash/redis` (límite global en Vercel; la memoria no frena bots); rutas `handle` con 429 `ApiResult`, waitlist `plain`; `onramp/session` como trade, `balances/activity` como `me`; `git pull --ff-only` denegado por el sandbox (árbol limpio, se siguió igual).
- Verificación: `npx tsc --noEmit` ok; `npm run lint` ok; `npm test` 317/317 (44 archivos, 10 nuevos); `audit:deps` igual que M58 (las 2 altas previas justificadas, nada nuevo de upstash). Digo con todas sus letras: NO comprobables aquí las 25 llamadas HTTP a search, build prod ni e2e (los corre el operador).
- Pendiente operador/Manu: `npm run check:upstash`, build prod (`.next-verify`), `npm run e2e`, probar el 429 real en search/trade; revisar Auth → Rate Limits en el panel Supabase.

## M53 — estado de seguridad por activo (2026-10-07)
- Hecho: `0010_asset_safety.sql` (NO aplicada: 12 columnas en assets + `asset_safety_runs`/`asset_safety_events` con RLS sin políticas, idempotente) + `nextSafetyState`/`isVisibleStatus`/`isTradableStatus` en `safety-core.mjs` (histéresis: 2 pasadas con una en market listan; overnight nunca oculta; estático o 2 fallas market ocultan; overrides) + `audit-catalog.mjs --db` (sonda 0010 → "aplica 0010" exit 2 sin escribir; upsert sólo columnas de seguridad; eventos) + `audit-rls.mjs` con las 2 tablas + tests (24+6) + docs SUPABASE/CATALOGO-SEGURIDAD.
- Archivos clave: `supabase/migrations/0010_asset_safety.sql`, `lib/catalog/safety-core.mjs`, `scripts/{audit-catalog,audit-rls}.mjs`, `tests/unit/{catalog-safety-state,migration-0010}.test.ts`, `docs/{SUPABASE,CATALOGO-SEGURIDAD}.md`.
- Decisiones: `git pull --ff-only` denegado por el sandbox (árbol limpio, 13 commits por delante según operador; se siguió igual). Curadas con passes=0 (se ganan el listado). Sesión por `--session` o período mayoritario; desconocida = conservadora. Sin paquetes nuevos.
- Verificación: `npx tsc --noEmit` ok; `npm run lint` ok; `npm test` 307/307 (43 archivos, 30 nuevos); `--symbols AAPLx --db` imprime "aplica 0010" con exit 2 (el harness normaliza todo no-cero a 1: se comprobó con wrapper que imprime el código); upsert sin mint/name/curated en test. Digo con todas sus letras: NO comprobables aquí aplicar 0010, el --db real, build prod ni e2e (los corre el operador).
- Pendiente operador/Manu: aplicar 0010 en desarrollo cuando Manu autorice, correr `npm run audit:catalog -- --db --session market`, build prod, `npm run e2e`; la app lee el estado en M54.

## M52 — auditoría de seguridad del catálogo (2026-10-07)
- Hecho: `lib/catalog/safety-core.mjs` (umbrales congelados, classifyProduct, effectiveMultiplier, quoteCostBps, staticChecks, evaluateAsset; sin red ni entorno) + `scripts/audit-catalog.mjs` (`npm run audit:catalog`: lotes 100/50, cotiza sólo aptos, reintento 429/5xx, caché diario reanudable, CSV 25 columnas PASA/NO PASA) + `tests/unit/catalog-safety.test.ts` (15) + `docs/CATALOGO-SEGURIDAD.md` (34 líneas). Se incluye el fixture `data/catalogo-ampliado-2026-10-06.csv` del operador.
- Archivos clave: `lib/catalog/safety-core.mjs`, `scripts/audit-catalog.mjs`, `tests/unit/catalog-safety.test.ts`, `docs/CATALOGO-SEGURIDAD.md`, `package.json`.
- Decisiones: `type` escribe `etp_apalancado` (compatible con el CSV del box); `result` PASA/NO PASA; "Ultra-Short Income" → etf directo; `git pull --ff-only` denegado por el sandbox (árbol sólo con mis cambios, se siguió igual). Sin paquetes nuevos.
- Verificación: `npx tsc --noEmit` ok; `eslint` de los 3 archivos ok; `npm test` 277/277 (41 archivos, 15 nuevos); smoke `--symbols AAPLx,NVDAx,AEHRx,TSLLx` ok (CSV 25 cols; AAPLx/NVDAx PASA con métricas numéricas; TSLLx NO PASA con `producto_apalancado…|bolsa_no_informada`; `data/audit-smoke.csv` borrado). Digo con todas sus letras: NO comprobables aquí build prod, e2e ni la auditoría completa (la corre el operador en sesión regular).
- Pendiente operador/Manu: AEHRx y TSLLx ya no están en la API de xStocks (1172 nodos hoy vs 1271 ayer; el script los audita contra el snapshot con aviso); build prod, `npm run e2e`, auditoría completa en sesión regular y comparación con el CSV del box.

## M58 — auditoría de dependencias y limpieza (2026-10-07)
- Hecho: sección "Dependencias" en `docs/SEGURIDAD.md` (audit 2026-10-07: 0 críticas, 4 altas en 2 avisos con justificación; sin `--force`); `ONRAMP_MODEL=widget|api` en `lib/env.ts`+`.env.example` (api descartado: con `NODE_ENV=production` el arranque falla; adaptador intacto para M75) + `liveOnramp()` y test `onramp-model` (5); `.github/dependabot.yml` (npm semanal, minor+patch agrupados, tope 5); `npm run audit:deps`; `engines: node >= 22`; `.gitignore` con `.next-*/`, `data/audit-cache/`.
- Archivos clave: `docs/SEGURIDAD.md`, `lib/{env.ts,onramp/model.ts,services/index.ts}`, `.github/dependabot.yml`, `package.json`, `.gitignore`, `.env.example`, `docs/.env.example`, `tests/unit/onramp-model.test.ts`.
- Decisiones: `git pull --ff-only` denegado por el sandbox (árbol limpio, 11 commits por delante como avisó el operador; se siguió igual). Sin `npm install`: spl-token 0.4.15 y privy 3.47.0 ya son su última línea y el único fix es `--force` con breaking (prohibido). `depcheck` marcó geist/tailwind/postcss pero `git grep` confirmó uso real (`app/fonts.ts`, `globals.css`, `postcss.config.mjs`): no se desinstala nada; `@solana-program/memo` lo exige Privy. `t18-check.ts` no trackeado ni importado: queda en disco, borrado físico pendiente del operador (regla de no-borrar).
- Verificación: `npx tsc --noEmit` ok; `npm run lint` ok; `npm test` 262/262 (40 archivos, 5 nuevos); `npm ls` sin invalid/missing; `npm run audit:deps` sale 1 por las 2 altas justificadas en SEGURIDAD.md (rama "o justificación" del criterio). Digo con todas sus letras: NO comprobables aquí build prod, `npm run e2e` ni el fallo de arranque con `ONRAMP_MODEL=api` en producción (sólo unit del helper puro; el build del operador usa el default y arranca).
- Pendiente operador/Manu: build prod (`NEXT_DIST_DIR=.next-verify`), `npm run e2e`, borrar `t18-check.ts` del disco; Vercel 22/24 definitivo lo confirma M50.

## M48f-fix — cierre de sesión e2e desde perfil (2026-10-07)
- `e2e/auth-supabase.spec.ts`: tras la cartera navega a `/app/perfil/cuenta` y cierra sesión con `getByRole("button", { name: "Cerrar sesión" }).first()` (el botón vive en `account-screen.tsx`, no en la cartera). Sin tocar componentes.
- Verificación: `npx tsc --noEmit` ok; `npm run lint` ok; `npm test` 257/257 (39 archivos); sin build ni e2e.
- Bugs previos (vienen de antes de M44, van como tarea aparte): (1) comprar indicando acciones no funciona: `maxAmount` en `lib/trade/amount.ts` devuelve vacío para compra + `SHARES` y la hoja muestra "Sin precio no podemos calcular este monto"; (2) el mínimo por orden se muestra en CLP ("Mínimo por orden: $9.678").

## M48e-fix — mensaje de la lista de espera fuera del form (2026-10-07)
- `e2e/portada-lista-espera.spec.ts`: el éxito se busca fuera del form (`page.getByRole("status")` con `WAITLIST_SUCCESS_MESSAGE`, `WaitlistForm` reemplaza el form por `<p role="status">`) + `toHaveCount(0)` del form (portada con un único form en `FinalCTA`); intercepción y correo/`consent: true` intactos. Verificación: `npx tsc --noEmit` ok; `npm run lint` ok; `npm test` 257/257 (39 archivos); sin build ni e2e.

## M48d-fix — e2e de montos y lista de espera sin base real (2026-10-07)
- `e2e/demo-usd.spec.ts`: las 4 aserciones de montos leen el árbol accesible (`monto()` con `ariaSnapshot` sin espacios: `$950.000`/`$855.000`) en vez del `textContent` (NumberFlow dibuja columnas 0–9). Componentes y mock intactos (cartera vacía, US$1.000).
- `e2e/portada-lista-espera.spec.ts`: `page.route("**/api/waitlist")` responde 200 con `{ message: WAITLIST_SUCCESS_MESSAGE }` y verifica correo + `consent: true`; cabecera aclara la intercepción. Sin tocar `lib/waitlist/**` ni la ruta API.
- Legal: línea (e) al final de `docs/PENDIENTES-LEGALES.md` (M45 pasó montos de pesos a US$ en `terminos.md`); `terminos.md` intacto.
- Frases de depósito en pesos de /como-funciona, /ayuda, /costos, `content/i18n`, `privacidad.md` y `comisiones.md` siguen pendientes de M83; no se tocaron aquí.
- Verificación: `npx tsc --noEmit` ok; `npm run lint` ok; `npm test` 257/257 (39 archivos). Digo con todas sus letras: NO comprobables aquí build prod ni `npm run e2e` (los corre el operador).

## M48c-fix — CSP con nonce en páginas de marketing y e2e al día (2026-10-07)
- Sin `force-static` en `app/(marketing)/layout.tsx` y `app/bloqueado/page.tsx` (comentario M48 de una línea; eran los únicos en `app/`, sin tocar `app/api/**` ni la CSP): `await connection()` del layout raíz vuelve dinámico el render, el HTML sale con nonce y la portada hidrata con CSP `enforce` + `strict-dynamic`.
- e2e `smoke.spec.ts`: buscador como `combobox "Buscar acciones"` + `option /AAPLx|Apple/` (resultados con `role="option"` en `search-suggestions.tsx`); termina en `/app/accion/AAPLx`. Sin tocar componentes.
- e2e `demo-usd.spec.ts`: montos 950.000/855.000 con regex que tolera espacios (`/\$\s*9\s*5\s*0\s*\.\s*0\s*0\s*0/`) sobre la tarjeta "Disponible para invertir" (NumberFlow parte los dígitos en spans); el "ya no está" de $855.000 con `not.toContainText`. Mock de cartera intacto (vacío, US$1.000). `portada-lista-espera.spec.ts` sin cambios.
- Verificación: `npx tsc --noEmit` ok; `npm run lint` ok; `npm test` 257/257 (39 archivos). Digo con todas sus letras: NO comprobables aquí build prod ni `npm run e2e` (los corre el operador).

## M48b-fix — nonce de la CSP en modo Supabase (2026-10-07)
- Arreglo: `middleware.ts` rama `next` ya no copia todas las cabeceras de `refreshed` (pisaba `x-middleware-override-headers` con `x-nonce`/CSP y bloqueaba scripts con `strict-dynamic` en enforce); ahora usa `mergeSupabaseIntoNext(refreshed, next)` (`lib/supabase/middleware.ts`), que copia sólo cookies + `cache-control`/`expires`/`pragma` vía `copySupabaseResponse` y nunca `x-middleware-*`. Política CSP intacta.
- Verificación: `npx tsc --noEmit` ok; `npm run lint` ok; `npm test` 257/257 (39 archivos, `csp.test.ts` 15 con test nuevo que conserva `x-nonce`/CSP en override-headers y pasa cookie + `cache-control`).

## M48 — Cabeceras de seguridad y CSP (2026-10-07)
- Hecho: `lib/security/csp.ts` (`buildCsp({nonce,isDev,supabaseUrl,rpcUrl,rpcCluster,reportUri})`, `resolveCspMode`, `generateNonce`; nonce+`strict-dynamic`, `unsafe-eval` sólo dev, Privy según su doc + Turnstile, RPC desde env o endpoint del cluster, `upgrade-insecure-requests` sólo prod) + `lib/security/headers.ts` (6 cabeceras, HSTS sólo prod); `middleware.ts` genera nonce, reenvía `x-nonce`/CSP al render y firma páginas+redirects (matcher intacto, gate/Supabase intactos); `next.config.ts` con `poweredByHeader:false` y `headers()` (`/(.*)` + `nosniff` en `/api/*`); `jsonResult` con `nosniff`; `CSP_MODE`/`CSP_REPORT_URI` en `lib/env.ts`+`.env.example`; `await connection()` en layout raíz (el nonce exige todo dinámico: la portada pierde su ISR de 30 s); `docs/SEGURIDAD.md` con apagado de emergencia (`CSP_MODE=report-only` en Vercel + redeploy); e2e nuevo en `smoke.spec.ts` (CSP en `/` y `/app`, nonce distinto, 0 errores CSP en consola).
- Archivos clave: `lib/security/{csp,headers}.ts`, `middleware.ts`, `next.config.ts`, `app/layout.tsx`, `lib/{env.ts,api/handler.ts}`, `tests/unit/csp.test.ts` (14), `e2e/smoke.spec.ts`, `docs/SEGURIDAD.md`, `.env.example`.
- Decisiones: `git pull --ff-only` denegado por el sandbox (árbol limpio, sólo commits previos; se siguió igual); default `enforce` en prod y `report-only` en dev; WalletConnect-verify/Turnstile incluidos por doc de Privy aunque hoy no se usan; Jupiter/mindicador/RPC privado fuera de la CSP (sólo servidor); solscan son links, no fetches; sin instalar paquetes.
- Verificación: `npx tsc --noEmit` ok; `npm run lint` ok; `npm test` 256/256 (39 archivos, 14 nuevos: prod sin `unsafe-eval`, `frame-ancestors none`, `object-src none`, host Supabase, sin `*` en `script-src`, dev con `unsafe-eval`, HSTS sólo prod, next.config sin powered-by); `git status` sin `.env.local` ni `tsconfig`; `git grep sb_secret_` sólo menciones viejas. Digo con todas sus letras: NO comprobables aquí `curl -I` con nonce distinto, build prod, `npm run e2e` en navegador ni pantallas sin errores de CSP (los corre el operador).
- Pendiente operador/Manu: build prod, `npm run e2e`, `curl -I /` y `/app` (6 cabeceras + CSP con nonce distinto), y checklist visual (mercado, detalle con gráfico, registro/ingreso, hoja demo sin errores CSP); si la demo se rompe: `CSP_MODE=report-only` en Vercel + redeploy.

## M47 — Auditoría RLS con dos usuarios + refuerzo 0009 (2026-10-07)
- Hecho: `scripts/audit-rls.mjs` (`npm run audit:rls`, `--dry-run` sin conexión; crea 2 usuarios, prueba anon/A→B/A-propio en SELECT/INSERT/UPDATE/DELETE y rpc con user_id ajeno, sale 1 si hay FALLA, borra usuarios en `finally`); `supabase/audits/rls-report.sql` (sólo lectura: sin RLS, políticas, definer sin search_path, grants); `0009_rls_hardening.sql` (idempotente, RLS×10, search_path fijo en handle_new_user M43 + demo trigger, trigger anti-columnas sensibles, grants de la matriz); `docs/SEGURIDAD.md` + sección en `SUPABASE.md`; test `rls-audit.test.ts` (6).
- Archivos clave: `scripts/audit-rls.mjs`, `supabase/{audits/rls-report.sql,migrations/0009_rls_hardening.sql}`, `docs/{SEGURIDAD,SUPABASE}.md`, `tests/unit/rls-audit.test.ts`, `package.json`.
- Decisiones: `git pull --ff-only` denegado por el sandbox (árbol limpio, sólo commits previos; se siguió igual); 0009 asume 0005–0008 aplicadas antes; demo_trade/reset no se reescriben (0007 ya fija search_path, 0009 reafirma grants); sensibles cubiertas aunque no existan hoy; sin instalar paquetes.
- Verificación: `--dry-run` imprime 12 filas OK; `npx tsc --noEmit` ok; `npm run lint` ok; `npm test` 242/242 (38 archivos, 6 nuevos). Digo con todas sus letras: NO comprobables aquí el live `npm run audit:rls` contra desarrollo (requiere .env.local y 0005–0009 aplicadas), build prod ni e2e (los corre el operador).
- Pendiente operador/Manu: aplicar 0005–0009 en orden en desarrollo, correr `npm run audit:rls` (esperado 0), build prod, `npm run e2e`; cada tabla futura suma su fila a `AUDIT_TABLES`.

M45b-fix — eslint ignora .next-verify (2026-10-07): `npm run lint` fallaba por la salida del build de verificación; se agregó `.next-verify/**` a `globalIgnores`.

> Estado de la base (2026-10-06): las migraciones 0002, 0003 y 0004 YA están aplicadas en el proyecto Supabase actual y `public.assets` está sincronizada. No hay que pegar nada en el SQL Editor; las instrucciones de `docs/SUPABASE.md` sirven sólo para un proyecto nuevo.

## M45 — Portada demo gratis, copy en US$ y lista de espera (2026-10-07)
- Hecho: hero y CTA final con "Prueba la demo gratis" → `/app/registro` + microcopy "Practica con US$1.000 ficticios y precios reales."; copy "desde US$10" (`LANDING_MIN_ORDER_USD=10`, el menor mínimo real: límites xStocks ~US$10, nunca bajo la hoja que usa `effectiveMinOrderUsd`) y "compras en dólares (US$)"; lista de espera (migración `0008_waitlist.sql` NO aplicada + `POST /api/waitlist` + `WaitlistForm` en portada `source=landing` y cuenta Real `source=cuenta_real`); flag `NEXT_PUBLIC_COMPANY_LOGOS` default `on` (`lib/config/brand.ts`, `off` = monogramas con `aria-label` y 0 pedidos a `/logos/`); 4 puntos [REVISIÓN ABOGADO] en `PENDIENTES-LEGALES.md`. Sin avisos demo, sin tocar app-shell, custodia ni 24/7.
- Archivos clave: `hero/feature-grid/final-cta/waitlist-form`, `asset-status.shared.ts`, `config/trade.ts` intacto, `api/waitlist/route.ts`, `lib/waitlist/{message,server}.ts`, `0008_waitlist.sql`, `lib/config/brand.ts`, `ticker-logo.tsx`, `real-account-empty.tsx`, `brand.ts`+env+`.env.example`, `site.ts`, `share-image.tsx`, `terminos.md`, `SUPABASE.md`, tests `brand-logos/landing-copy/waitlist`, `e2e/portada-lista-espera.spec.ts`.
- Decisiones: `git pull --ff-only` denegado por el sandbox (árbol sólo con mis cambios, se siguió igual); sin Supabase y fuera de live la ruta valida y responde 200 sin guardar (e2e mock verde); en live sin 0008 responde 500; `companyLogosEnv` leniente (mal escrito cae a `on`); `share-image`/`site.ts`/`terminos.md` alineados (compra en US$); `audit-rls.mjs` no existe (regla desde M47).
- Verificación: `npx tsc --noEmit` ok; `eslint` de 19 archivos tocados ok (`npm run lint` completo excede 120 s); `npm test` 236/236 (37 archivos, incl. 20 nuevos); `git status` sin `.env.local` ni `tsconfig`/app-shell; `git grep sb_secret_` sólo menciones viejas en PROGRESO. Criterios: CTA→registro y microcopy en código+e2e escrito; copy test falla con "desde $1.000"/"pagas en pesos"/"pagando con pesos" y exige custodia+24/7; waitlist 400/200/trampa/duplicado/sin logs en tests; logos on/off en tests. Digo con todas sus letras: NO comprobables aquí aplicar 0008, build prod ni e2e en navegador (los corre el operador).
- Pendiente operador/Manu: aplicar 0008 en desarrollo, build prod, `npm run e2e`, checks bloque C; Manu decide sobre frases "en pesos" de DEPÓSITO que se dejaron: `how-it-works.tsx` ("Tres pasos, en pesos", "Deposita pesos"), `como-funciona/page.tsx` (título, "Depositas en pesos", monto en pesos), `ayuda/page.tsx` ("Deposita pesos…"), `costos/page.tsx` ("al depositar pesos"), i18n `deposit*/onramp/noFx/currencyHint`, `privacidad.md`/`comisiones.md`; el depósito Real se redefine en M78/M80.

## M44 — Saldo demo de US$1.000 (2026-10-07)
- Hecho: (A) lint del buscador (`setSuggestActive(0)` en el `onChange`, fuera el `useEffect`) y `tsconfig.json` sin `.next-verify` (commit `c2e3812`). (B) demo en USD: migración `0007_demo_usd.sql` (`cash_usd`/`initial_usd` 1000, `total_usd`, `p_usdclp` opcional, reset a 1000, `_migration_flags` una-sola-vez), servicio/cartera/hoja en USD con display M40, mock US$1.000 sin posiciones, copy "US$1.000 ficticios".
- Archivos clave: `0007_demo_usd.sql`, `demo.supabase.ts`, `demo.logic.ts`, `demo-state.ts`, `demo/reset/route.ts`, `api/client.ts`, i18n es/en, `portfolio-screen.tsx`, `SUPABASE.md`, tests `demo-account`/`demo-migration`, e2e `demo-usd`, `smoke.spec.ts`.
- Decisiones: firma `demo_trade` intacta; `*_clp` deprecadas sin borrar; rendimiento = total − `initialUsd`; CLP por API sin dólar → 400 claro; operar en USD/acciones no exige dólar; `git pull --ff-only` denegado por el sandbox (árbol limpio y al día, se siguió igual).
- Verificación: `npx tsc --noEmit` ok; `npm run lint` ok; `npm test` 216/216 (34 archivos); greps `DEMO_INITIAL_CLP|1_000_000|1.000.000` y `cash_clp` vacíos en código. Digo con todas sus letras: NO comprobables aquí aplicar 0007 (dos veces), build de producción ni e2e en navegador (los corre el operador).
- Pendiente operador/Manu: aplicar 0007 dos veces en desarrollo (checks en `SUPABASE.md`), build prod, `npm run e2e`, `npm run e2e:auth` y checks del bloque C; mirar cartera (US$1.000/≈ $950.000), compra US$100 y Reiniciar.

## N21 — Navbar suave + logo chico + sidebar fija (2026-10-07)
- Hecho: navbar del landing sube/baja en 500 ms (antes 240 ms). Logo h-5 (antes h-6). Sidebar con iconos siempre fijos: marca favicon + nombre, nav y avatar en slots fijos; al colapsar sólo se ocultan las palabras (max-w/opacity). Expandida muestra marca + nombre.
- La M al colapsar = falta `public/brand/maverlang-mark.png`. Operador: `Copy-Item "app\icon.png" "public\brand\maverlang-mark.png"`.
- Verificación: sin `tsc/test` aquí; pendiente: `npx tsc --noEmit`, `npm test`, probar colapsar (Ctrl/Cmd+B) y scroll del landing.
- Archivos: `sidebar.tsx`, `site-header.tsx`, `brand-image.tsx`.

## N20 — Buscador con sugerencias (2026-10-07)
- Hecho: al escribir se abre un desplegable con top 6 (logo, nombre, símbolo, precio y variación), esqueletos al cargar, "Buscar «q»" para aplicar y teclado (↑↓/Enter/Esc). Clic o Enter va al detalle. Lógica pura `topSuggestions` en `browse.ts` + tests (3).
- Verificación: sin `tsc/test` aquí (sin shell); pendiente operador: `npx tsc --noEmit`, `npm test`, buscar "apple" en `/app` y navegar con teclado y clic.
- Archivos: `search-suggestions.tsx` (nuevo), `market-screen.tsx`, `browse.ts`, `suggestions.test.ts`, i18n es/en.

## N19 — Ordenar + filtrar en una tira (2026-10-07)
- Hecho: una sola tira "Ordenar y filtrar": orden (Popular, Mayor alza, Mayor baja) + divisor + filtros; sin A–Z (URL vieja con `orden=az` cae a Popular; API y tipos intactos). Scroll horizontal sin barra visible (`no-scrollbar`) y fundido a la derecha que avisa que hay más.
- Verificación: sin `tsc/test` aquí (sin shell); pendiente operador: `npx tsc --noEmit`, `npm test`, revisar `/app` en móvil y desktop.
- Archivos: `market-screen.tsx`, `globals.css`, i18n es/en.

## N18 — Volver al mercado + color del precio en el gráfico (2026-10-07)
- Hecho: flecha "Volver al mercado" arriba del detalle (`/app`). Al recorrer el gráfico el precio ya no destella por cada punto: se tiñe sólo contra el actual (rojo si el punto es menor, verde si es mayor, neutro si igual); el destello en vivo sigue igual sin hover.
- Verificación: sin `tsc/test` aquí (sin shell); pendiente operador: `npx tsc --noEmit`, `npm test`, abrir un detalle y pasar el cursor por el gráfico.
- Archivos: `detail-screen.tsx`, `price-panel.tsx`, `portfolio-screen.tsx` (mismo arreglo en el total), `flash-price.tsx`, `use-price-flash.ts` (pausa), `icons.tsx` (`IconBack`), i18n es/en.

## N17 — Atajos acumulativos + marca Maverlang (2026-10-07)
- Hecho: chips de compra suman (3× US$10 = US$30, tope en Máx); acciones 0,1 / 0,5 / 1. Punto naranja fuera en header, footer, auth, CTA, BrandMark y sidebar colapsada (ahora favicon `maverlang-mark.png` con respaldo M). `icon.tsx` con M (sin punto).
- Pendiente operador (sin shell aquí): mover el PNG a `public/brand/` y exportar el mark cuadrado — comandos abajo. `app/favicon.ico` viejo (punto) hay que borrarlo para que rija `icon.tsx`/nuevo favicon. Luego `npx tsc --noEmit`, `npm test`, ver compra y sidebar.
- Estado 2026-10-07: el PNG sigue en la raíz (`Maverlang Logo-1.png`, no se sirve) y no existe `public/brand/`. Sin esos archivos el logo no puede aparecer: el código ya apunta a `/brand/maverlang-logo.png` y `/brand/maverlang-mark.png`.
- Fix robustez (2026-10-07): nuevo `brand-image.tsx` (`BrandLogoImage` → texto si falta el PNG; `BrandMarkImage` → M si falta). Se usa en header, footer, auth, sidebar colapsada y CTA: sin archivos verás nombre/M en vez de ícono roto.
- Fix logo blanco (2026-10-07): fuera `dark:invert` del logo (la app es sólo clara; con Windows en oscuro Tailwind lo invertía).
- Archivos: `amount-input.tsx`, `brand-mark.tsx`, `sidebar.tsx`, `site-header/footer.tsx`, `auth-frame.tsx`, `final-cta.tsx`, `app/icon.tsx`.

## N16 — Compra en USD o acciones (2026-10-07)
- Hecho: comprar ofrece USD ⇄ Acciones (sin CLP); venta igual que antes. Etiqueta "USD" (no USDC). Smoke e2e compra con "US$ 100". Backend y tests de montos intactos (CLP sigue válido por API).
- Verificación: sin `tsc/test/e2e` aquí (sin shell); pendiente operador: `npx tsc --noEmit`, `npm test`, `npm run e2e`, comprar 1 acc en demo.
- Archivos: `trade-sheet.tsx`, `e2e/smoke.spec.ts`.

## N15 — Precio ejecutable + aviso de despegue + mints verificados (2026-10-07)
- Hecho: titular = precio ejecutable del pozo; Jupiter ahora trae `marketPriceUsd` + `liquidityUsd` (tipos, contratos, parser, batcher). Si despega ≥1% vs mercado, aviso "Despegue del pozo: X% vs mercado" + filas Precio de mercado y Liquidez del pozo en Datos. Tests `pool-price.test.ts` (5).
- Mints: 13/13 (12 + UBERx) idénticos a `api.xstocks.fi` oficial. Nada falso.
- Verificación: sin `tsc/test/build` aquí (sin shell); pendiente operador: `npx tsc --noEmit`, `npm test`, mirar `/app/accion/UBERx` (aviso + Datos).
- Archivos: `types`, `contracts.ts`, `live-quotes.ts`, `price-batcher.ts`, `dislocation.ts`, `price-panel.tsx`, `detail-screen.tsx`, i18n.

## N13 — Detalle a 5 s con key Jupiter (2026-10-07)
- Hecho: `SPOT_MS` 5 s en detalle y hoja de compra; listas siguen en 15 s. Cache servidor 5 s por mint. Con key Free (1 req/s ≈ 60/min) el gasto típico (~16/min) va sobrado; sin key igual funciona con más 429.
- Verificación: sin `tsc/test/build` aquí (sin shell); pendiente operador: `npx tsc --noEmit`, `npm test`, mirar detalle 30 s (destello cada 5 s).
- Archivos: `queries.ts`, `price-batcher.ts`, `detail-screen.tsx`, `trade-sheet.tsx`, tests `price-batcher` + `live-prices-visible`.

## N12 — Favoritas en la cuenta (2026-10-06)
- Hecho: migración `0006_user_favorites.sql` (NO aplicada) + `GET/PUT /api/me/favorites` (sesión, zod, tope 200) en mock/RLS/live. Con sesión: une servidor+local y sube lo nuevo; sin sesión o sin 0006: sigue lo local. Vacío de Favoritas con guía. Tests `favorites.test.ts` (8).
- Verificación: sin `tsc/test/build` aquí (sin shell); pendiente operador: aplicar 0006, `npx tsc --noEmit`, `npm test`, entrar en 2 navegadores y marcar estrella.
- Archivos: `0006`, `lib/favorites/merge.ts`, contratos/cliente/ruta, 3 servicios, `use-favorites.ts`, `market-screen.tsx`, i18n, `SUPABASE.md`.
- Fix build (2026-10-07): `RestInit` acepta `DELETE` (lo pedía `saveFavorites` en `users.supabase.ts`).

## N11 — Fuera insignia demo en compra (2026-10-06)
- Hecho: `trade-sheet` sin Badge Demo ni nota (quedó solo en top-bar/cartera donde sí orienta). Import sin uso fuera.
- Verificación: sin `tsc/lint/build` aquí (sin shell); pendiente operador: `npx tsc --noEmit`, comprar en demo.
- Archivos: `components/domain/trade-sheet.tsx`.
- Favoritas (diagnóstico, sin cambio aún): hoy viven solo en este navegador (`a24_favorites`), no en la cuenta; el filtro Favoritas vacío muestra el vacío genérico.

## N10 — Moneda por defecto: se mantiene CLP (2026-10-06)
- Revertido el cambio a USD: CLP sigue por defecto (mercado chileno). Sin cambios efectivos vs M40.
- Pendiente (demo US$1000): ver nota N10 original — pide migración 0006 + reescritura. A confirmar.

## N9 — Cartera sin saltos + aviso solo con retraso (2026-10-06)
- Hecho: fuera "Valor del punto en el gráfico" de cartera (era lo que empujaba el gráfico) + `mb-2` bajo el total. `PriceFreshness` con `delayedOnly` en cartera, detalle y mercado: sin "Actualizado hace Xs"; solo "Precio con retraso" si stale o > 60 s. Portada intacta.
- Verificación: sin `tsc/lint/build` aquí (sin shell); pendiente operador: `npx tsc --noEmit`, `npm test`, mirar `/app/cartera` (hover sin saltos) y detalle/mercado.
- Archivos: `portfolio-screen.tsx`, `price-panel.tsx`, `market-screen.tsx`, `price-freshness.tsx`.

## N8 — Sidebar: menú con cierre afuera + riel limpio (2026-10-06)
- Hecho: menú de perfil se cierra con clic afuera y Escape. Riel colapsado sin botón salir ni insignia D (solo avatar → `/app/perfil`; el cambio demo/real sigue en expandido y perfil). Fuera los botones de contraer/expandir (se alterna con clic en el fondo y Ctrl/Cmd+B).
- Verificación: sin `tsc/lint/build` aquí (sin shell); pendiente operador: `npx tsc --noEmit`, probar clic fondo, menú y Escape en 1280.
- Archivos: `components/app-shell/sidebar.tsx`.

## N7 — Sidebar sin nota demo + real próximamente (2026-10-06)
- Hecho: `AccountSwitch` sin nota ni insignia (el selector ya dice Cuenta demo). Cuenta real: "Cuentas reales: próximamente. De momento no ofrecemos cuentas reales. Te avisaremos cuando estén disponibles." (es/en). Hoja de compra y resto intactos.
- Verificación: sin `tsc/lint/build` aquí (sin shell); pendiente operador: `npx tsc --noEmit`, mirar sidebar y cuenta real.
- Archivos: `account-switch.tsx`, `es-CL.ts`, `en.ts`.

## N6 — Perfil y Ajustes al menú del usuario (2026-10-06)
- Hecho: sidebar y tabs con 3 ítems (Mercado, Cartera, Billetera). Clic en el perfil del sidebar abre menú con Perfil, Ajustes, switch USD/CLP y salir. En móvil, avatar en el TopBar → `/app/perfil`. Rutas y páginas intactas.
- Verificación: sin `tsc/lint/build` aquí (sin shell); pendiente operador: `npx tsc --noEmit`, `npm run e2e`, mirar `/app` y `/app/cartera` en 360/1280 (menú, moneda, salir).
- Archivos: `nav.ts`, `sidebar.tsx`, `bottom-tabs.tsx`, `top-bar.tsx`.

## N5 — Navbar que se oculta al bajar (2026-10-06)
- Hecho: `SiteHeader` se esconde con `-translate-y-full` al bajar y reaparece al subir o arriba del todo; con menú móvil abierto siempre visible. Transición 240ms con `ease-spring`. Primer render visible (sin flash).
- Verificación: sin `tsc/lint/build` aquí (sin shell); pendiente operador: `npx tsc --noEmit`, probar en `/` bajar/subir a 360/1280, con menú abierto y con reduced-motion.
- Archivos: `components/landing/site-header.tsx`.

## N4 — Páginas dedicadas + centro de ayuda (2026-10-06)
- Hecho: nuevas `/como-funciona` (reusa HowItWorks + notas), `/costos` (reusa CostsSection + detalle), `/seguridad` (reusa SecuritySection + marco). Navbar apunta a páginas (no a `#`). `/ayuda` es centro de ayuda con 6 guías + FAQ. Sitemap y ARQUITECTURA §2.1 al día. Homepage intacta.
- Verificación: sin `tsc/lint/build` aquí (sin shell); pendiente operador: `npx tsc --noEmit`, `npm run build` (estático), mirar las 4 rutas a 360/1280.
- Archivos: `app/(marketing)/{como-funciona,costos,seguridad,ayuda}/page.tsx`, `site-header.tsx`, `app/sitemap.ts`.
- Fix build (2026-10-06): `/como-funciona` envuelve `HowItWorks` en `<LiveLandingPrices>` (el `LandingPrice` lo exige; era el prerender-error de Vercel).

## N3 — Custodia en lenguaje simple (2026-10-06)
- Hecho: landing sin "billetera/wallet Solana": hero, grilla, seguridad, paso 3 e intro del cómo funciona dicen "tu propia billetera —nosotros no custodiamos tus activos". Títulos sin "autocustodia". FAQ/legales intactos ([REVISIÓN ABOGADO]).
- Verificación: sin `tsc/lint/build` aquí (sin shell); pendiente operador: `npx tsc --noEmit`, mirar `/` (hero, grilla, cómo funciona, seguridad).
- Archivos: `hero.tsx`, `feature-grid.tsx`, `security-section.tsx`, `how-it-works.tsx`, `announcement-pill.tsx` (comentarios).

## N2 — Copy 24/7 según xstocks.fi (2026-10-06)
- Hecho: hero, pill, grilla, lead de mercado (es/en), FAQ y reglas (AGENTS, DESIGN-SYSTEM, DISENO-REFERENCIAS, SUPABASE) a "24/7". Fuente verificada: xstocks.fi dice "tradeable 24/7" / "24/7 Trading Hours". Aviso conservado: fuera del horario regular el precio puede variar más. Lógica de estado del subyacente intacta (regular/extendido/cerrado, tests).
- Verificación: sin `tsc/lint/build` aquí (sin shell); pendiente operador: `npx tsc --noEmit`, `npm test`, mirar `/`, `/ayuda`, `/app`.
- Archivos: `hero.tsx`, `announcement-pill.tsx`, `feature-grid.tsx`, `es-CL.ts`, `en.ts`, `faq.ts`, reglas.

## N1 — Hero sin numerito y menos aire arriba (2026-10-06)
- Hecho: eliminado `01 — Tokenizadas` de `components/landing/hero.tsx:63`; `pt-12→pt-8`, `md:pt-20→md:pt-14`, `lg:pt-24→lg:pt-16`; pill ahora primera pieza sin `mt-5`.
- Verificación: sin `tsc/lint/build` aquí (sin shell); pendiente operador: `npx tsc --noEmit`, mirar `/` a 360/1280.
- No se cambia horario a 24/7: xStocks cierra fin de semana; regla AGENTS.md §4 lo prohíbe.

## M43b — fix e2e y mínimo de compra (2026-10-06, fix(M43): minimo de compra y e2e smoke)
- Hecho: `effectiveMinOrderUsd` es el máximo entre `MIN_TRADE_USD` y el de la acción; `amountBlock` recibe `minUsd` y `blockCopy` muestra ese mismo mínimo; la hoja pasa `chips` con `quickTradeAmounts` (nunca bajo el mínimo, sin pasar el disponible cuando cabe) y quedó un solo "Mínimo por orden". Smoke: compra con `$10.000`, precio visitante con `/\$\s?[\d.]+/` (moneda única M40) y perfil con link/heading "Ajustes" → "Settings".
- Archivos clave: `lib/market/asset-status.shared.ts`, `lib/trade/amount.ts`, `components/domain/trade-sheet.tsx`, `e2e/smoke.spec.ts`, `tests/unit/trade-minimum.test.ts` (6).
- Decisiones: `minUsd` opcional con default `MIN_TRADE_USD` (venta y callers viejos intactos); `SHARES` también filtra por mínimo; `e2e/registro-demo.spec.ts` intacto; sin migraciones.
- Verificación: `npx tsc --noEmit` ok; `npm run lint` ok; `npm test` 186/186 (30 archivos); sin `next dev/build`, sin `npm run e2e` (lo corre el operador). Digo con todas sus letras: NO comprobable aquí el e2e en navegador ni la hoja con datos reales.
- Pendiente operador: correr `npm run e2e` (smoke + registro-demo) y mirar `/app/accion/AAPLx` (rápidos sin $5.000 bajo mínimo, un solo mínimo, Revisar habilitado con $10.000).

## M43 — Registro simple para la demo (2026-10-06, M43: registro simple para la demo)
- Hecho: alta demo en un paso (modo alta: correo, contraseña, repetir contraseña y checkbox "Acepto los Términos y Condiciones y la Política de Privacidad" con links en pestaña nueva a `/legal/terminos` y `/legal/privacidad`; botón "Crear mi cuenta demo"; `user_metadata` sólo con `terms_version`, `privacy_version`, `terms_accepted_at` y `signup_source:"demo"`). `claimsDemoReady()` (términos+privacidad, o perfil completo antiguo) y gate sin redirect a `/app/onboarding`: con demoReady entra a todo `/app`; sin aceptación va a `/app/aceptar` (mismo checkbox; guarda vía `/api/me/consents`, alinea el JWT y refresca). Migración `0005_registro_simple.sql` (NO aplicada) reescribe `handle_new_user()` con `accepted_at` válido/no futuro o `now()` y `on conflict do nothing`. Real sigue en "Próximamente" + "Cuando la cuenta Real esté disponible te pediremos tus datos y verificaremos tu identidad." con link al onboarding (se conserva, accesible directo).
- Archivos clave: `lib/auth/{registro-schema,registro-client,gate,paths,login-client,server-session}.ts`, `lib/supabase/middleware.ts`, `middleware.ts`, `app/(platform)/app/{registro/wizard,aceptar/*,accion/[ticker]/page,accion/[ticker]/detail-screen,ingresar/supabase-login}`, `RealAccountEmpty`, i18n, `0005_registro_simple.sql`, `tests/unit/{registro-demo,gate}.test.ts`, `e2e/registro-demo.spec.ts`.
- Decisiones: `registroSchemaAt`/`perfilListo` intactos (vuelven para Real/KYC); mock conserva su onboarding; `/app/onboarding` ya no rebota con demoReady; aceptar también hace `updateUser` porque el gate lee el JWT, no la tabla; `supabaseDemoReady` opcional con fallback a `supabaseOnboarded`; textos legales nuevos con "[REVISIÓN ABOGADO]".
- Verificación: `npx tsc --noEmit` ok; `npm run lint` ok; `npm test` 180/180 (29 archivos, incl. `registro-demo` 12: esquema exacto, `claimsDemoReady`, gate, SQL estático con `on conflict`+`set search_path`); `git grep sb_secret_` sin claves nuevas; `.env.local` fuera de `git status`; sin `next dev/build`, sin e2e (los corre el operador). Criterios: DOM de 4 campos comprobado en código (email/password/repetir/checkbox, sin RUT ni perfil) + e2e mock escrito (sin checkbox: error exacto y no navega; con todo: `/app` + Mercado). Digo con todas sus letras: NO comprobables aquí las 2 filas de `consents` tras 0005, la compra demo sin perfil contra Supabase ni el e2e en navegador (sin base ni servidor en esta ejecución).
- Pendiente operador/Manu: aplicar 0005 en desarrollo y comprobar por SQL las 2 filas de `consents` (versión + `accepted_at`); correr build de producción, `npm run e2e`, `npm run e2e:auth` y checks con datos reales (bloque C); mirar `/app/registro` (4 campos, error sin checkbox, `signUp` no se llama), `/app/aceptar`, `/app` sin perfil (compra demo, nunca onboarding) y Real ("Próximamente" + nota).

## M42b — Hidratación portada (2026-10-06, fix(M42): hidratacion de la portada)
- Hecho: el error #418 en "/" era `PriceFreshness` con `useState(() => Date.now())`: el "Actualizado hace Xs" difería entre el HTML ISR (hasta 30 s viejo) y el navegador. Nuevo `useMounted()` (`useSyncExternalStore`, `getServerSnapshot: false`) + `resolveFreshnessText`/`FRESHNESS_PLACEHOLDER_TEXT` (puros, en `freshness.ts`): primer render estable con la misma altura, contador desde `useEffect` cada 1 s. Aplicado en `LandingFreshness` y en `PriceFreshness` (M41, también lo usan detalle/mercado/cartera). Resto de la portada revisado: `useLandingQuote` usa los `initial` del servidor, números con `es-CL` fijo, `Reveal`/`Tabs`/`SiteHeader`/`FlashPrice` con primer render estable.
- Archivos clave: `lib/hooks/use-mounted.ts`, `lib/market/freshness.ts`, `components/domain/price-freshness.tsx`, `components/landing/live-landing-prices.tsx`, `tests/unit/landing-freshness-hydration.test.ts` (3).
- Decisiones: sin `suppressHydrationWarning`; comportamiento visible intacto (US$, 20 s, destello, en vivo/ilustrativos); `client-imports` sigue verde (sin server-only en cliente).
- Verificación: `npx tsc --noEmit` ok; `eslint` de los 5 archivos tocados ok; `npm test` 168/168 (28 archivos); `git grep sb_secret_` sin claves nuevas. Sin `next dev/build`, sin e2e, sin push.
- Pendiente: el operador confirma en producción que "/" ya no muestra el error #418 (con y sin preferencia de moneda).

## M42 — Portada con precios reales (2026-10-06, M42: portada con precios reales)
- Hecho: `lib/landing/live-quotes.ts` (server-only; 1 llamada a `prices.list` con los ~10 símbolos de la muestra, timeout 2,5 s, cache 30 s; sin `PRICES_MODE=live`, fallo o timeout → muestra con `live: false`). `page.tsx` async con `revalidate = 30`. `LiveLandingPrices` + `useLandingQuote` + `<LandingPrice full|tape>` (cliente; refresco 20 s, `refetchOnWindowFocus`) + `LandingSharesValue` + un solo `LandingFreshness` bajo la cinta. Hero/cinta/pasos/ficha reciben `quotes` y `live`; etiqueta exacta según origen ("Precios en dólares (US$), en vivo" vs "Precios ilustrativos"); precios en US$ con `formatUsd`/destello M41; sin series en la portada (`sparkline` opcional, muestra como respaldo). `TickerRow` suma `priceSlot` opcional (mercado intacto). Tests `landing-live-quotes.test.ts` (8); `client-imports` vigila `lib/landing/live-quotes`.
- Archivos clave: `lib/landing/live-quotes.ts`, `app/(marketing)/page.tsx`, `components/landing/{live-landing-prices,landing-quote-preview,hero,ticker-marquee,how-it-works,product-mock}.tsx`, `components/domain/ticker-row.tsx`, `lib/mocks/landing.ts`, `tests/unit/{landing-live-quotes,client-imports}.test.ts`.
- Decisiones: `live` global true sólo si todo llega jupiter sin `reference`; parcial mezcla valores con `live` por quote. Con la muestra la query cliente queda apagada. Depósito de HowItWorks sigue en CLP. Copy 24 h, registro/login, mercado, barra móvil y M34-M41 intactos.
- Verificación: `npx tsc --noEmit` ok; `eslint` de los 12 archivos tocados ok (2 warnings menores corregidos); `npm test` 165/165 (27 archivos); `git grep sb_secret_` sin claves nuevas. Sin `next dev/build`, sin e2e, sin push.
- Pendiente: mirar `/` con `PRICES_MODE=live` (números en vivo, destello, "Actualizado hace Xs", etiqueta en vivo) y con fallo (muestra + "Precios ilustrativos"); confirmar ISR 30 s en el entorno del operador.

## M40b — Dólar robusto (2026-10-06, fix(M40): dolar robusto)
- Hecho: `live-fx.ts` con timeout 6 s + 1 reintento, fallo recordado 15 s, último valor válido hasta 24 h marcado `stale` (source `stale`, contrato intacto), dedup en vuelo y respaldo `open.er-api.com` (`rates.CLP`, `FX_FALLBACK_URL`). `livePrices.list` calienta el dólar en segundo plano; `fx()` lo usa. Cartera demo sin cambios: el `stale` fluye como tasa válida y sólo sin ningún dólar mantiene el error actual. Tests `live-fx-robust.test.ts` (6).
- Archivos clave: `lib/market/live-fx.ts`, `lib/services/prices.live.ts`, `lib/env.ts` (`FX_FALLBACK_URL`), `.env.example`, `tests/unit/live-fx-robust.test.ts`.
- Decisiones: fresco sin campo `stale` (compat con tests M34); `stale` vale para M40 (tasa > 0 = CLP conocido); respaldo de 1 intento tras 2 de mindicador; textos M40 y M41 intactos.
- Verificación: `npx tsc --noEmit` ok; `eslint` de los 4 archivos tocados ok; `npm test` 157/157 (26 archivos); `git grep sb_secret_` sin claves nuevas. Sin `next dev/build`, sin e2e, sin push.
- Pendiente: mirar `/app` y `/app/cartera` en arranque en frío con `PRICES_MODE=live` (CLP desde el inicio, sin "Dólar no disponible" salvo caída total).

## M41 — Precios en vivo visibles (2026-10-06, M41: precios en vivo visibles)
- Hecho: polling 15 s intacto + `refetchOnWindowFocus: true` sólo en precios (`usePrices`, mercado) y gráfico abierto (`useHistory` cada 60 s visible, `refetchIntervalInBackground: false`). `PriceFreshness` ("Actualizado hace Xs" / "Updated Xs ago", `aria-live="off"`, intervalo 1 s) en detalle, cabecera de lista y cartera; `stale` o > 60 s → `text-warn` + "Precio con retraso". `usePriceFlash` (puro + hook 700 ms, sin flash en primer render ni cambio de moneda) vía `FlashPrice` (`bg-up-bg`/`bg-down-bg`) en precio grande, filas/tarjetas y cartera. Último punto del gráfico sigue siendo el spot. Tests `live-prices-visible.test.ts` (10).
- Archivos clave: `lib/{market/freshness,hooks/use-price-flash,hooks/queries}.ts`, `components/domain/{price-freshness,flash-price,ticker-row,ticker-card,position-row}.tsx`, `price-panel`, detalle, `market-screen`, cartera, i18n (`prices.delayed`).
- Decisiones: filas siguen servidor (envuelven `FlashPrice` cliente); textos del formato viven en `freshness.ts` y el sufijo en i18n; `useHistories` (sparklines) sin repoll; moneda única M40 y precio único M34 intactos.
- Verificación: `npx tsc --noEmit` ok; `eslint` por archivo ok; `npm test` 151/151 (25 archivos); `git grep sb_secret_` sin claves nuevas. Sin `next dev/build`, sin e2e, sin push.
- Pendiente: mirar detalle/mercado/cartera con polling real (destello, "Actualizado hace Xs", "Precio con retraso" tras 429), reducir movimiento, EN.

## M40 — Una sola moneda (2026-10-06, M40: una sola moneda)
- Hecho: `lib/preferences/currency.ts` (resolve sesión>local>CLP + cookie `mv_currency` 1 año) y `useDisplayCurrency/useSetDisplayCurrency` (local con useSyncExternalStore, DB si hay sesión, UI al instante); `useT` la usa. `/app/ajustes` pública (moneda primero, idioma después, vale visitante); `/app/perfil/idioma` redirige; perfil y sidebar/bottom-tabs suman Ajustes (IconGear). Switch USD/CLP en top-bar, header público y sidebar. Detalle sin celdas USD/CLP; trade/cartera/billetera/mercado en moneda única; orden CLP→USD antes de cotizar + "La orden se ejecuta en dólares (US$X)". `useFx` cada 5 min. Tests `display-currency.test.ts` (11).
- Archivos clave: `lib/preferences/currency.ts`, `lib/hooks/use-display-currency.ts`, `app/(platform)/app/ajustes/`, `components/{app-shell/currency-switch,domain/preferences-form}`, detalle, `trade-sheet`, cartera, billetera, `paths.ts`, `nav.ts`, i18n.
- Decisiones: idioma visitante también en local (`mv_language`); depósitos en pesos y catálogo intactos; sin CLP sin FX se muestra USD; sell en SHARES sigue en unidades.
- Verificación: `npx tsc --noEmit` ok; `eslint` por archivo ok (completo excede 120 s); `npm test` 141/141 (24 archivos); `git grep sb_secret_` sin claves nuevas. Sin `next dev/build`, sin e2e, sin push.
- Pendiente: mirar `/app/ajustes` con y sin sesión, switch en móvil/escritorio, detalle sin duplicados, compra en CLP con línea en dólares, cartera/billetera en una moneda.

## M39b — Separar asset-status cliente/servidor (2026-10-06, fix(M39): separar asset-status cliente/servidor (build))
- Hecho: `lib/market/asset-status.shared.ts` nuevo (tipos + `chipKeyForStatus`, `tradeBlockForStatus`, `effectiveMinOrderUsd`, `normalizeMode`, `normalizePeriod`; sin `server-only`, sin `lib/env` ni catálogo). `asset-status.ts` conserva `server-only`, `status()`, `isLiveStatusEnabled()`, cache y fetch, y re-exporta lo compartido. `detail-screen.tsx` y `trade-sheet.tsx` importan del `.shared`. Test `client-imports.test.ts` (1) falla si un `"use client"` importa `asset-status` sin `.shared`, `catalog/assets`, `lib/env` o `server-only`.
- Verificación: `npx tsc --noEmit` ok; `eslint` de los 5 archivos tocados ok (`npm run lint` completo excede el límite de 120 s de la shell); `npm test` 130/130 (23 archivos); `git grep` sin `sb_secret_` ni import cliente→servidor. Sin `next dev/build`, sin e2e, sin push.
- Pendiente: el operador corre `next build` para confirmar el fix; mirar `/app/accion/AAPLx` con `MARKET_STATUS_MODE=live`.

## M39 — Horario real por acción (2026-10-06, M39: horario real por accion)
- Hecho: `lib/market/asset-status.ts` (server-only; xStocks assets+system/status timeout 2,5 s cache 60 s; fallback catálogo→mock; sólo con `PRICES_MODE`/`MARKET_STATUS_MODE=live`). `GET /api/market/status?symbol=` (sin símbolo sigue el estado general). Detalle con chips reales (suspendida/abierto/extendido/nocturno/cerrado + "abre el lunes 09:00" en America/Santiago) y línea "Horario: 24 horas, de lunes a viernes" o "Horario de bolsa (NY)". Hoja de compra con "Mínimo por orden" y validación suave; suspendida deshabilita CTA demo. Lista con punto por fila desde el catálogo. `MARKET_STATUS_MODE` en `lib/env.ts` y `.env.example`. Tests `asset-status.test.ts` (6).
- Archivos clave: `lib/market/asset-status.ts`, `lib/catalog/assets.ts` (+columnas modo/período/open/next/limits), `lib/format.ts` (`formatReopenWhen`), `app/api/market/status/route.ts`, contratos/cliente/hooks, detalle, `trade-sheet`, `ticker-row`, `market-screen`, `market-status-pill`, i18n.
- Decisiones: `maxOrderFiatValue` 0 se conserva (no opera en ese período); `offHours` mock → `extended` abierto; `unknown` → cerrado; dot de lista sólo con dato del catálogo. Precio único, sidebar, demo, registro/login, mercado público, barra móvil y `?operar=vender` sin cambios.
- Verificación: `npx tsc --noEmit` ok; `npm run lint` ok; `npm test` 129/129 (22 archivos); `git grep` sin secretos ni "24/7" nuevo; `.env.local` fuera de `git status`. Sin `next dev/build`, sin e2e (límite de shell), sin push.
- Pendiente: mirar `/app/accion/AAPLx` con `MARKET_STATUS_MODE=live` (chips, horario, mínimo, suspendida) y `/app` (puntos por fila); cron de sync ya trae los campos (M37/M38).

## M38b — Catálogo paginado (2026-10-06, fix(M38): catalogo paginado)
- `fetchAssetsFromSupabase` pagina con `order=curated.desc,symbol.asc`, `limit=1000` + `offset` (tope 10 páginas; fallo parcial usa lo obtenido). Si hay filas pero ninguna curada y el alcance es `curated`, fallback a `config/tickers.ts`. Sin filtro `curated=eq.true` en servidor para no romper el cache compartido ni `bySymbol`. Tests: `catalog-pagination.test.ts` (4). `tsc`, `lint`, `npm test` 123/123 ok.

## Estado
M38 hecha y verificada (`npx tsc --noEmit`, `npm run lint`, `npm test` 119). M36 y M37 ya commiteadas (2b089d3); la migración 0004 está aplicada y public.assets tiene 1171 filas. Sin `next dev/build`, sin push, sin e2e (límite de shell).

## Tareas hechas

### M38 — Mercado escalable (2026-10-06, M38: mercado escalable) [VERIFICADA, POR COMMITEAR]
- Hecho: `lib/catalog/assets.ts` (server-only; lee public.assets con publishable key, cache 5 min; `search` con q/categoría/scope/página/orden + `bySymbol`; fallback a `config/tickers.ts`). `GET /api/market/search` (zod, pageSize máx 50, cache 30/60 s, logo local o null, `lowLiquidity` < US$10.000). `lib/market/price-batcher.ts` (lotes de 50, dedup en vuelo, cache 15 s, `stale` tras 429 con backoff); `livePrices` y `/api/prices` (máx 50) lo usan. Mercado con debounce 300 ms, "Cargar más", skeleton, vacío "No encontramos acciones con ese nombre", una llamada de precios por página y "Baja liquidez". Detalle por `bySymbol` con CTA deshabilitado si no habilitada/suspendida.
- Archivos clave: `lib/catalog/assets.ts`, `lib/market/price-batcher.ts`, `app/api/market/search/route.ts`, `market-screen.tsx`, detalle (`page.tsx`, `detail-screen.tsx`), contratos/cliente/hooks, i18n, `.env.example`.
- Decisiones: Supabase se lee por REST con fetch (mockeable, sin cookies); filtro/orden en memoria sobre 1171 filas. `stale` es campo opcional nuevo en `Quote`. Favoritas se filtra en cliente. Precio único M34, sidebar, demo, registro/login, mercado público, barra móvil y `?operar=vender` sin cambios.
- Verificación: `npx tsc --noEmit` ok; `npm run lint` ok; `npm test` 119/119 (20 archivos, incl. `market-search` 11 y `price-batcher` 8); `git grep` sin secretos; `.env.local` fuera de `git status`.
- Pendiente: clave de Jupiter de Manu (portal.jup.ag); mirar `/app` (buscar, chips, "Cargar más", "Baja liquidez") y `/app/accion/AAPLx` en navegador; con `CATALOG_SCOPE=all`, precios/operar fuera de los 50 curados siguen limitados a `config/tickers.ts`.
- Próximo: fuera de esta tarea.

## Tareas hechas

### M37 — Catálogo xStocks automático (2026-10-06, M37: catalogo xstocks automatico) [VERIFICADA, POR COMMITEAR]
- Hecho: migración `0004_assets.sql` (tabla `assets`, RLS sólo SELECT para anon/authenticated, índices curated/category/lower(name)). Curada de 50 en `data/curated-symbols.json` (fuente única) + `config/curated-symbols.ts`. Script `scripts/sync-xstocks.mjs` (`npm run sync:xstocks`, flags --dry-run/--no-db/--no-files; API paginada, Jupiter con reintento y respaldo CSV, logos una vez, upsert service_role, genera `config/tickers.generated.ts`). `config/tickers.ts` sale del generado (mismos exports; 12 mints intactos). `CATALOG_SCOPE=curated|all` (default curated; all para M38) en `lib/env.ts` y `.env.example`.
- Archivos clave: `supabase/migrations/0004_assets.sql`, `data/{xstocks-solana-2026-10-06.csv,curated-symbols.json}`, `config/{curated-symbols.ts,tickers.generated.ts,tickers.ts}`, `scripts/sync-xstocks.mjs`, `lib/catalog/xstocks.ts`, `lib/{types,api/contracts,market/browse,mocks/prices,env.ts}`, mercado, detalle, i18n, `docs/SUPABASE.md`.
- Decisiones: categorías nuevas finance/health/energy/industrial/commodity (filtros y chips extendidos). Generado sin liquidez para no cambiar en cada sync. `HOODx/MSTRx` enabled true (no suspendidos). Mock con ancla determinista para símbolos nuevos; demo/landing/precio único/sidebar/`?operar=vender` sin cambios.
- Verificación: `npx tsc --noEmit` ok; `npm run lint` ok; `npm test` 100/100 (18 archivos, incl. `xstocks-catalog.test.ts` 7); sync real `--no-db`: total 1171, con Solana 1171, 38 logos bajados + 12 existentes, 0 errores; `git grep` sin secretos; `.env.local` fuera de `git status`.
- Pendiente: (0004 ya aplicada el 2026-10-06 vía psql y catálogo sincronizado: 1171 filas) cron diario en Vercel cuando haya deploy (M40); revisar marcas/logos con abogado. [REVISIÓN ABOGADO] logos/marcas.
- Próximo: M38 (fuera de esta tarea).

### M36 — Cuenta demo por usuario (2026-10-06, M36: cuenta demo por usuario) [VERIFICADA, POR COMMITEAR]
- Hecho: migración `0003_demo_accounts.sql` (demo_accounts/positions/orders, RLS sólo lectura propia, `demo_trade` con promedio ponderado y errores cortos, `demo_reset`, trigger + backfill; sólo `service_role` ejecuta). Servicio server-only `lib/services/demo.supabase.ts` (precio del servicio de M34 y dólar real; sin dólar o con precio de referencia rechaza con mensaje claro; escrituras por rpc). Rutas portfolio/balances/activity/quote/build/submit/status leen la demo del usuario con `mv_account=demo` (defecto); `real` devuelve vacío/bloquea; mock sigue en memoria. Nueva `POST /api/demo/reset`. Selector demo/real en sidebar (icono con tooltip si colapsado), perfil y top bar (insignia Demo); real muestra "Próximamente: depósitos reales"; demo muestra insignia, nota de simulación y botón Reiniciar (Cartera y Perfil). i18n es-CL/en y `docs/SUPABASE.md` con cómo aplicar 0003.
- Archivos clave: `supabase/migrations/0003_demo_accounts.sql`, `lib/services/{demo.supabase,demo.logic}.ts`, `lib/account/{mode,server}.ts`, `lib/hooks/use-account-mode.ts`, `app/api/{portfolio,wallet/*/trade/*,demo/reset}`, `components/{app-shell/account-switch,domain/{real-account-empty,reset-demo-button}}`, shell, cartera, billetera, perfil, detalle, trade-sheet, i18n.
- Decisiones: saldo demo en CLP ($1.000.000); cartera/balances se exponen en USD vía dólar real (sin inventar: si falta, error con reintento). Cotizaciones en memoria (60 s); saldo/posiciones/órdenes en Supabase. Sin billetera, la demo firma con el id de usuario. En billetera demo no hay fila SOL: se oculta ese bloque y la dirección dice "sin dirección en Solana". Registro/login, mercado público, precio único, sidebar, barra móvil y `?operar=vender` sin cambios.
- Verificación (2026-10-06, r2): `npx tsc --noEmit` ok; `npm run lint` ok tras renombrar `useUserDemo`/`useRealAccount` a `isUserDemoRequest`/`isRealAccountRequest` (el prefijo `use` los marcaba como hooks) y quitar el `setState` en efecto de `useAccountMode` (inicializador perezoso lee la cookie); `npm test` 93/93 (17 archivos, incl. `demo-account.test.ts` 11); `npm run e2e` 2 passed + 1 skipped (mock, `.next-e2e`). Revisión SQL: idempotente, RLS sólo-lectura propia, grants sólo a `service_role`, sin `pg_catalog.current_date` (usa `now()`); corregida venta parcial en `demo_trade` (antes no restaba las acciones si quedaba saldo). Búsqueda de claves de Supabase en el código limpia; `.env.local` no aparece en `git status`.
- Pendiente: ninguno (0003 aplicada el 2026-10-06 vía psql; commit e839f5b). Sin `next dev/build`, sin push.
- Próximo: fuera de esta tarea.

## Tareas hechas

### M35 — Sidebar colapsable (2026-10-06, M35: sidebar colapsable)
- Hecho: sidebar de escritorio con dos estados: expandido (240px) y colapsado (riel de 72px con iconos, logo punto y sin textos). Clic en el fondo alterna (links/botones/inputs no); cursor `w/e-resize` sólo en el fondo (`cursor-pointer` en lo interactivo). Botón visible con `aria-label` y `aria-expanded`, atajo Ctrl/Cmd+B (ignora inputs). Colapsado usa `Tooltip` con `aria-label` por item. Cookie `mv_sidebar` (1 año, path=/) leída en el layout: primer HTML sin flash. Ancho con `transition-[width]` 200ms (reduced-motion global lo deja en 1ms). i18n en `shell.collapseSidebar/expandSidebar`. `npx tsc --noEmit`, `npm run lint`, `npm test` (82, +7) y `npm run e2e` (2, 1 skipped) ok. Sin `next dev` ni `npm run build`.
- Archivos clave: `lib/app-shell/sidebar.ts`, `components/app-shell/{sidebar,app-shell}.tsx`, `app/(platform)/app/layout.tsx`, `components/ui/icons.tsx` (IconPanel, IconLogout), `content/i18n/{es-CL,en}.ts`, `tests/unit/sidebar.test.ts`.
- Decisiones: la grilla pasa a `lg:grid-cols-[auto_minmax(0,1fr)]` para animar el ancho del aside sin saltos. Helpers puros sin DOM (entorno vitest `node`): `parseSidebarState`, `serializeSidebarCookie`, `shouldToggleSidebarClick` (closest a `a,button,input,textarea,select,[contenteditable]`), `shouldIgnoreSidebarShortcut`. Colapsado oculta el saldo largo y el botón de salir es sólo icono con label. Móvil, header público y `?operar=vender` sin cambios.
- Pendiente: mirar `/app` y `/app/cartera` en escritorio con sesión (alternar con clic de fondo, botón y Ctrl+B; tooltip y foco; persistencia al recargar; sin flash). No se abrió el navegador.
- Próximo: fuera de esta tarea.

### M34 — Precio único en la ficha (2026-10-06, M34: precio unico consistente)
- Hecho: titular, Datos, posición y orden demo usan el mismo spot. Jupiter `usdPrice` no se vuelve a dividir (AAPLx 332,78 sigue en 332,78). La serie de referencia se reescala para terminar en ese spot y lleva la etiqueta "Ilustrativo". Variación, máximo y mínimo del rango salen de esa serie. "Variación 24 h" es `priceChange24h` de Jupiter, en el mercado y en Datos. El % bajo el titular es el del rango elegido. Con `PRICES_MODE=live`, `/api/fx/usdclp` lee mindicador (cache 45 min, timeout 2,5 s, `source` live y la fecha). Si falla, no usa 950: el precio queda en USD y dice "Dólar no disponible". Sin el flag, todo sigue en mock. `npx tsc --noEmit`, `npm run lint`, `npm test` (75) y `npm run e2e` (2, 1 skipped) ok. Sin `next dev` ni `npm run build`.
- Archivos clave: `lib/market/{live-quotes,live-fx,series,demo-price}.ts`, `lib/services/{index,prices.live,demo-prices,trade.mock,portfolio.mock}.ts`, `lib/mocks/demo-state.ts`, ficha y mercado, `tests/unit/price-consistency.test.ts`.
- Decisiones: el dólar live va con `PRICES_MODE`, sin flag nuevo. La 24 h no sale del gráfico. El historial real sigue sin proveedor. El e2e fuerza precios mock para no depender de la red. La landing sigue ilustrativa.
- Pendiente: mirar `/app/accion/AAPLx` con `PRICES_MODE=live` (titular, CLP, gráfico, Datos, posición y `?operar=vender`) y la nota si mindicador falla. No se abrió el navegador.
- Próximo: fuera de esta tarea.

### M33 — Registro sin confirmación de correo (2026-10-06, M33: registro sin confirmacion de correo)
- Hecho: si `signUp` trae sesión, refresca y entra al `next` saneado (o `/app`) con el toast "Cuenta creada". Si la sesión es null, sigue "Revisa tu correo". La metadata del alta cumple `claimsOnboarded`. `npm run verify:auth`: PASS 8, FAIL 0, SKIP 0. El paso b quedó PASS: el usuario creado sin confirmar sigue sin poder entrar ("email not confirmed"); el SKIP no se disparó. `npx tsc --noEmit`, `npm run lint`, `npm test` (70) y `npm run e2e` (2, 1 skipped) ok. Sin `next dev` ni `npm run build`.
- Archivos clave: `lib/auth/registro-client.ts`, `app/(platform)/app/registro/wizard.tsx`, `scripts/verificar-auth.mjs`, `tests/unit/registro-destination.test.ts`, `content/i18n/{es-CL,en}.ts`, `docs/SUPABASE.md`.
- Decisiones: el código soporta confirmación apagada y encendida. No se tocó `0002`. Errores (correo ya registrado, etc.) siguen en español. En mock el alta no cambia. El paso b del script es SKIP sólo si ese ingreso devuelve sesión.
- Pendiente: mirar `/app/registro?next=/app/accion/AAPLx?operar=comprar` en el navegador (esta ejecución no levanta Next). Si el panel ya tiene Confirm email en OFF, un alta real debería entrar directo; el script no lo vio porque crea el usuario con `email_confirm: false`. Asociar la cartera real al usuario.
- Próximo: fuera de esta tarea.

### M32 — Verificación de auth con Supabase (2026-10-05, M32: verificacion auth)
- Hecho: `npm run verify:auth` crea el usuario con el admin API (sin `signUp` ni correos), exige confirmación, confirma, ingresa, cierra sesión y borra. Resultado: PASS a createUser, PASS b signIn sin confirmar, PASS c signIn confirmado, SKIP d select, SKIP d update, SKIP d rls (migración no aplicada), PASS e signOut, PASS limpieza. RESUMEN PASS (5 PASS, 0 FAIL, 3 SKIP). `npx tsc --noEmit`, `npm run lint`, `npm test` (66), `npm run build` y `npm run e2e` (2, 1 skipped) ok. Sin `next dev`.
- Archivos clave: `scripts/verificar-auth.mjs`, `scripts/e2e-auth.mjs`, `e2e/auth-supabase.spec.ts`, `lib/supabase/secret.ts`, `docs/SUPABASE.md`.
- Decisiones: un SKIP de perfil no falla el script. `npm run e2e:auth` no entra en `npm run e2e` y no se corrió aquí (levanta Next). La clave de servidor quedó en `lib/supabase/secret.ts` (`server-only`). Ningún componente cliente importa `lib/supabase/admin`. No hay literales de clave en el repo. `.env.local` sigue ignorado por git.
- Pendiente: aplicar `0002` y volver a correr `npm run verify:auth` (d debería pasar). Correr `npm run e2e:auth` donde se pueda levantar Next. La cartera real sigue sin asociarse al usuario.
- Próximo: fuera de esta tarea.

### M31 — Login real con Supabase (2026-10-05, M31: login real supabase)
- Hecho: `/app/ingresar` en supabase pide correo y contraseña (`signInWithPassword`). Errores en español, reenvío si falta confirmar, Google en Próximamente. Tras entrar, `next` saneado (por ejemplo `/app/accion/AAPLx?operar=comprar`); si falta el registro, el wizard conserva `next`. Salir hace `signOut`, limpia cookies mock y vuelve a `/` (perfil y sidebar). `/app/recuperar` y `/app/restablecer` públicas. Cartera, billetera, perfil y subrutas exigen sesión. En supabase, quote, build, submit, cartera, billetera, `/api/me*` y `/api/onramp/session` usan `getUser` y responden 401 sin usuario. El webhook no cambia. Mock igual. `npx tsc --noEmit`, `npm run lint`, `npm test` (66) y `npm run e2e` (2, mock) ok. Sin `next dev`.
- Archivos clave: `lib/auth/{login-schema,login-errors,login-client,gate,paths}.ts`, `app/(platform)/app/{ingresar,recuperar,restablecer}`, `lib/services/auth.supabase.ts`, `lib/api/handler.ts`, `docs/SUPABASE.md`.
- Decisiones: la cartera y la billetera siguen en el mock de la demo (la sesión supabase no trae billetera). Google no se enciende. Con sesión, ingresar y registro redirigen; recuperar y restablecer no. El enlace de clave va a `/auth/callback?next=/app/restablecer`.
- Pendiente: asociar la cartera real al usuario. (0002 ya aplicada.) Plantillas de correo opcionales y Redirect URLs en `docs/SUPABASE.md`. No se abrió el navegador.
- Próximo: fuera de esta tarea.


### M30 — Registro real con Supabase (2026-10-05, M30: registro real supabase)
- Hecho: migración `0002_supabase_auth.sql`, idempotente, para pegar una vez. `/app/registro` en 3 pasos. En modo supabase, `signUp` con confirmación y pantalla "Revisa tu correo" (reenviar a los 60 s). `/api/me` lee `public.profiles` con la sesión (RLS). Si falta la tabla, aviso discreto. El gate mira `user_metadata` del JWT y no consulta la tabla. `npx tsc --noEmit`, `npm run lint`, `npm test` (56) y `npm run e2e` (2, mock) ok. Sin `next dev`.
- Archivos clave: `supabase/migrations/0002_supabase_auth.sql`, `docs/SUPABASE.md`, `lib/auth/registro-schema.ts`, `app/(platform)/app/registro/*`, `lib/services/users.rls.ts`, `lib/auth/gate.ts`.
- Decisiones: `0001` queda con el aviso "NO APLICAR" (no se mueve ni se borra). En mock el formulario valida y entra a la demo. La landing sigue en `/app/ingresar`. El header y "Crear cuenta para invertir" van a `/app/registro` y conservan `next`. Si faltan datos, `/app/onboarding` reusa el wizard. Cartera, billetera y órdenes siguen en mock. El wizard está en español, como el onboarding.
- Pendiente: (0002 ya aplicada.) En el panel: Site URL `http://localhost:3000`; Redirect URLs `http://localhost:3000/auth/callback` y `http://localhost:3000/**`; confirmación de correo activa; el SMTP integrado tiene un límite bajo de correos por hora (en producción, SMTP propio). No se abrió el navegador: esta ejecución no levanta `next dev`. Ingreso, salir y recuperar son M31.
- Próximo: fuera de esta tarea.

### M29 — Base de Supabase (2026-10-05, M29: supabase base)
- Hecho: clientes en `lib/supabase` (`@supabase/ssr` 0.12.7, `@supabase/supabase-js` 2.117.2). `authMode()` es supabase sólo con el flag y URL + clave pública; si falta algo, mock y un `console.warn` una vez. El middleware refresca con `getClaims` (no `getSession`) y copia las cookies al redirect. `/auth/callback` canjea `code` o `token_hash`. `npm run e2e` construye y sirve con auth mock en `.next-e2e`. `npx tsc --noEmit`, `npm run lint`, `npm test` (45) y `npm run e2e` (2) ok. Sin `next dev`.
- Archivos clave: `lib/supabase/*`, `lib/auth/{mode,gate,provider,server-session,supabase-provider,callback-next}.ts`, `middleware.ts`, `app/auth/callback/route.ts`, `scripts/e2e.mjs`, `lib/env.ts`, `.env.example`, `docs/ARQUITECTURA.md`.
- Decisiones: el cliente usa sólo `NEXT_PUBLIC_AUTH_MODE` (hidratación alineada); el servidor prioriza `AUTH_MODE`. Privy queda y no manda si el modo es supabase. `/auth/*` no pasa por geobloqueo, para canjear el correo. Onboarding sigue en `a24_onb`. `SUPABASE_SECRET_KEY` reemplaza el nombre viejo, que queda de alias. `DATA_MODE` y `PRICES_MODE` no cambian. `login()` va a `/app/ingresar`; `logout()` hace `signOut` y vuelve a `/`.
- Pendiente: aplicar `supabase/migrations/0001_init.sql` (el remoto está vacío). Registro (M30) e ingreso/recuperar (M31). Google sigue apagado; la confirmación por correo está activa. No se levantó `next dev`.
- Próximo: fuera de esta tarea.

### M28 — Mercado público sin cuenta (2026-10-05, M28: mercado publico sin cuenta)
- Hecho: sin sesión, `/app` y `/app/accion/[ticker]` responden y no redirigen. Cartera, billetera (depositar, enviar, recibir) y perfil redirigen a `/app/ingresar?next=…`. Con sesión y sin onboarding se ve el mercado; operar manda a completar el registro y conserva `?operar`. Geobloqueo igual. `npx tsc --noEmit`, `npm run lint`, `npm test` (35) y `npm run build` ok. `npm run e2e` (2) ok. Sin `next dev`.
- Archivos clave: `lib/auth/{paths,gate,server-session}.ts`, `middleware.ts`, `components/app-shell/{app-shell,public-header}.tsx`, detalle, landing, `content/i18n/{es-CL,en}.ts`, `tests/unit/gate.test.ts`, `e2e/smoke.spec.ts`, `docs/ARQUITECTURA.md`.
- Decisiones: `isPublicAppPath` y `readServerSession` leen las mismas cookies que el gate, para enchufar Supabase después. El ingreso no tiene modo: los dos CTA llevan sólo `next`. Sin sesión no se monta el TradeSheet ni se llama a cartera, billetera ni `/api/me` (`usePrefs` sólo con sesión). Favoritas siguen: están en este navegador, no en la cuenta. En la landing, "Ver acciones" va a `/app`; "Crear cuenta" y "Entrar" van a `/app/ingresar`.
- Pendiente: mirar `/`, `/app` y `/app/accion/AAPLx` a 360 y en escritorio (header público, CTA, barra, `?operar=vender` ya logueado). El e2e es 1280. No se integró Supabase.
- Próximo: fuera de esta tarea.

### M27 — Logos reales de empresas (2026-10-05, M27: logos de empresas)
- Hecho: 12 PNG de xStocks (400×400, con transparencia) en `public/logos/<underlying>.png`. `config/tickers.ts` apunta a `.png`. El monograma sigue si falta o falla la imagen. Mercado, detalle, cartera, billetera, hoja de compra/venta y landing pasan `logoUrl`. `npx tsc --noEmit`, `npm run lint` y `npm test` (28) ok. Sin `next dev`.
- Archivos clave: `public/logos/*.png`, `scripts/descargar-logos.mjs`, `config/tickers.ts`, `components/domain/{ticker-logo,trade-sheet}.tsx`, `lib/mocks/landing.ts`, landing (hero, how-it-works, product-mock), `tests/unit/ticker-logos.test.ts`, `docs/PENDIENTES-LEGALES.md`.
- Decisiones: no hizo falta `simple-icons`: los 12 respondieron 200 `image/png`. `object-cover` llena el círculo (el PNG es cuadrado; las esquinas transparentes quedan fuera). Fondo `bg-bg` si hay transparencia. Se quitó `unoptimized`: son PNG locales y Next los optimiza; `onError` sigue cayendo al monograma. Marcas sólo para identificar el activo.
- Pendiente: [REVISIÓN ABOGADO] del uso de marcas (`docs/PENDIENTES-LEGALES.md`). Mirar mercado, detalle, compra/venta y landing a 360 y en escritorio. No se levantó el servidor. `/dev/ui` deja un monograma de ejemplo sin `logoUrl`.
- Próximo: fuera de esta tarea.

### M26 — Horario 24/5 y precios reales activos (2026-10-05, M26: horario 24/5 y precios reales activos)
- Hecho: hero, pill, chips, grilla, lead del mercado y FAQ dicen "24 horas, de lunes a viernes" (EN: "Trade 24 hours a day, Monday to Friday"). Sábado y domingo: "Mercado cerrado: abre el lunes". Lun–vie fuera de 09:30–16:00 NY: "Fuera del horario regular" y el aviso de que el precio puede variar más. `.env.example` recomienda `PRICES_MODE=live`. Sin la variable, el código sigue en mock. Si Jupiter falla o falta un ticker, sigue la ancla y "Precio de referencia". Consulta a Jupiter lite de AAPLx: usdPrice 333,39 (acción de referencia 332,85); la ancla mock sigue cerca de 228. `npx tsc --noEmit`, `npm run lint` y `npm test` (27) ok. Sin `next dev`.
- Archivos clave: `components/landing/{hero,announcement-pill,feature-grid,faq}.tsx`, `lib/content/faq.ts`, `lib/mocks/market.ts`, `content/i18n/{es-CL,en}.ts`, `.env.example`, `tests/unit/market-hours.test.ts`.
- Decisiones: `MarketStatus.session` es `regular`, `offHours` o `closed`. El fin de semana no bloquea la orden: sólo cambia el aviso. La regla quedó en AGENTS.md y en DESIGN-SYSTEM. No se leyó `.env.local`.
- Pendiente: la landing es `force-static` y sigue con precios ilustrativos (hero, cinta, mock de producto y sparklines). Unirla al servicio live rompería ese estático o dejaría el precio congelado al build; el historial sigue en mock. Mirar `/`, `/ayuda`, `/app` y `/app/accion/AAPLx` (chip, FAQ, precio real y "Precio de referencia" si falta un ticker). Barra, `?operar=vender`, chips, stats y gráfico no se rehicieron.
- Próximo: fuera de esta tarea.

### M25 — Precios reales detrás de un flag (2026-10-05, M25: precios reales detras de flag (mock por defecto))
- Hecho: `PRICES_MODE=mock` por defecto. Con `live`, el precio actual sale de Jupiter Price v3 (`JUPITER_BASE_URL/price/v3`). `JUPITER_API_KEY` es opcional y no va en el código. Timeout 2,5 s, cache 10 s. Se descartan precios ≤ 0 o no numéricos. Si falla la red o falta un ticker, se usa la ancla y `reference: true` (en el detalle, «Precio de referencia»). Historial, dólar y horario siguen en mock. Con el flag apagado no hay red. `npx tsc --noEmit`, `npm run lint` y `npm test` (23) ok. Sin `next dev`.
- Activar: `PRICES_MODE=live` en el servidor (no hace falta `DATA_MODE=live`) y reiniciar el proceso. La clave de Jupiter es opcional.
- Archivos clave: `lib/market/live-quotes.ts`, `lib/services/{prices.live,index}.ts`, `lib/env.ts`, `.env.example`, `tests/unit/live-prices.test.ts`, `app/(platform)/app/accion/[ticker]/price-panel.tsx`.
- Decisiones: flag propio, para no encender trade, cartera ni auth. El multiplicador on-chain se intenta con tope de 0,8 s y cache de 5 min; si el RPC no llega, queda 1. `PRICE_DEVIATION_MAX_BPS` sigue sólo en la cotización de la orden. Cartera y orden mock siguen en la ancla. El aviso no sale en el modo mock.
- Pendiente: mirar `/app` y `/app/accion/AAPLx` con el flag (precio, aviso si falta un ticker, gráfico, barra, `?operar=vender`). Sin RPC privado el multiplicador puede quedar en 1.
- Próximo: fuera de esta tarea.

### M24 — Gráfico UX: crosshair y sin recrear (2026-10-05, M24: grafico UX crosshair y sin recrear chart)
- Hecho: lightweight-charts se crea al montar y se destruye al salir. El rango hace `setData` y `fitContent`; el color (sube, baja o plano) entra con `applyOptions`. `autoSize` redimensiona. Crosshair en imán, líneas punteadas. Cursor o arrastre horizontal: precio y fecha es-CL (`formatDateTime`); al salir, último precio y variación del rango. Rangos con `aria-pressed` y foco visible. La caja no cambia de alto: skeleton encima mientras carga. El arrastre vertical sigue siendo de la página. `npx tsc --noEmit` y `npm run lint` ok. Sin `next dev`.
- Archivos clave: `components/domain/price-chart.tsx`, `app/(platform)/app/accion/[ticker]/price-panel.tsx`, `components/ui/segmented-control.tsx`.
- Decisiones: no hay rango 1D; siguen 1S, 1M, 3M, 1A y Todo. La hora usa `lib/format.ts` (America/Santiago). Sólo un gesto claramente horizontal elige un punto; si no, la página se desplaza. Al soltar el dedo vuelve el precio. No se tocó la barra, los chips, `?operar=vender` ni la cartera. Datos mock.
- Pendiente: mirar `/app/accion/AAPLx` a 360 y en escritorio (crosshair, rangos, scroll vertical, skeleton, barra y `?operar=vender`).
- Próximo: M25.

### M23 — Detalle premium: logos, chips y stats (2026-10-05, M23: detalle premium logos chips y stats)
- Hecho: si no hay archivo en `public/logos`, monograma circular (símbolo sin la "x", color estable, borde). Header 56px; filas 36px. Chips: categoría, "Token en Solana" y horario (abierto o mercado ampliado, con la nota del API). Grilla 2 columnas en celular y 3 en escritorio: precio USD y CLP, variación 24 h, variación, máximo y mínimo del rango. Mint con copiar y Solscan. Emisor y aviso de congelamiento, con link a riesgos. `npx tsc --noEmit` y `npm run lint` ok. Sin `next dev`.
- Archivos clave: `components/domain/ticker-logo.tsx`, `app/(platform)/app/accion/[ticker]/{detail-screen,price-panel}.tsx`, `lib/market/series.ts`, `content/i18n/{es-CL,en}.ts`, `components/domain/position-row.tsx`, `app/(platform)/app/billetera/wallet-screen.tsx`.
- Decisiones: no se copian logos de marcas (TODO-VERIFICAR). Sin capitalización ni volumen en los datos: no se muestran. El mock no tiene cierre total, así que fuera del horario regular el chip dice "Mercado ampliado" y sigue el aviso de precio. No se dice "24/7". El multiplicador queda en "Sobre el token". La barra y `?operar=vender` no se tocaron.
- Pendiente: mirar `/app/accion/AAPLx` a 360 y en escritorio (chips, grilla, copiar, barra, `?operar=vender`). Mercado, cartera y billetera heredan el monograma.
- Próximo: M24.

### M22 — Detalle en celular: padding del CTA y deep-link de vender (2026-10-05, M22: detalle mobile padding CTA y deep-link vender)
- Hecho: la barra queda sobre las tabs, con safe-area, sin solaparse. El scroll reserva el alto medido de las tabs (ya incluye el safe-area) + el alto real del CTA + 16px. `--app-detail-cta` usa ese alto y se borra al salir. Botones de la barra: mínimo 44px, padding 16–20px, gap y texto entero a 360px. `?operar=vender|comprar` abre la hoja al cargar; atrás la cierra; cerrar quita el parámetro sin recarga. En la cartera, cada posición con saldo tiene Vender hacia `/app/accion/XXX?operar=vender`, fuera del enlace de la fila. Sin saldo, la hoja dice «No tienes XXX para vender». `npx tsc --noEmit` y `npm run lint` ok. Sin `next dev`.
- Archivos clave: `app/(platform)/app/accion/[ticker]/detail-screen.tsx`, `components/app-shell/{app-shell,bottom-tabs}.tsx`, `app/globals.css`, `app/(platform)/app/cartera/portfolio-screen.tsx`, `components/domain/{position-row,trade-sheet}.tsx`, `content/i18n/{es-CL,en}.ts`.
- Decisiones: no se suma el safe-area dos veces. El respiro móvil del shell pasa de 24px a 16px. Desde `lg` la card lateral no cambia. Abrir desde el botón hace `pushState`; cerrar un deep link hace `replaceState` (no `router.replace`, para no refetch).
- Pendiente: mirar `/app/accion/AAPLx` y `/app/cartera` a 360–430 (barra, scroll hasta el aviso, Vender, `?operar=vender` con y sin saldo, atrás y cerrar). Escritorio no se recorrió aquí.
- Próximo: M23.

### M21 — Copy del hero (2026-10-05, M21: hero copy tokenizacion y mercado ampliado)
- Hecho: H1 "Acciones de EE.UU. tokenizadas, en tu billetera"; subtítulo con fracciones desde $1.000, Solana, pesos y "casi a cualquier hora". Pill: token en billetera → `#como-funciona`. Tres chips bajo los CTAs. FeatureGrid #1 suma token y horario ampliado. OG alineado. `npx tsc --noEmit` y `npm run lint` ok. Sin `next dev`.
- Archivos clave: `components/landing/{hero,announcement-pill,feature-grid}.tsx`, `components/ui/icons.tsx`, `lib/seo/share-image.tsx`, `e2e/smoke.spec.ts`.
- Decisiones: 1 variante activa; 2 ALTERNATIVA en comentarios. No se dice 24/7 ni CMF ni accionista registrado. El chip del medio usa "wallet" como pide la tarea; el resto dice "billetera". i18n no se tocó: la landing no sale de ahí. Comisión 0% sigue en costos.
- Pendiente: mirar `/` a 360/768/1280 (H1, wrap de chips, pill). El smoke no se corrió aquí.
- Próximo: fase live, fuera de este paquete.

### T20 — Verificación final (2026-10-05, T20: verificacion final)
- Hecho: `npm run lint`, `npm run typecheck`, `npm run build`, `npm test` (12) y `npm run e2e` en verde. Vitest cubre format, scaled-ui (newMultiplier con timestamp pasado y futuro), fee (0 bps no arma instrucción), allowlist (mint falso rechazado) y zod (request inválido → VALIDATION). El smoke mock recorre landing, `/app` sin sesión → ingresar, login, onboarding, mercado, AAPL, compra, cartera, dirección inválida bloqueada e idioma en inglés.
- Archivos clave: `tests/unit/*`, `e2e/smoke.spec.ts`, `vitest.config.ts`, `playwright.config.ts`, `package.json`.
- Decisiones: devDependencies `vitest@3.2.4` y `@playwright/test` (las pide T20). Vitest 5 exige `@types/node` 22 y el repo está en 20. `npm run e2e` sirve el build con `next start` en 127.0.0.1:3456 y lo cierra; hace falta `npm run build` antes. `t18-check.ts` sigue en disco, ahora en `.gitignore`, sin borrarlo.
- Bugs: ninguno de producto. El primer e2e chocó con el announcer vacío de Next (`role="alert"`); el aviso de dirección sí estaba. Se afinó el selector.
- Deuda: Next 16 avisa de pasar `middleware.ts` a `proxy.ts`. Los dos archivos juntos rompen el build, así que se deja el nombre de §2.3. `bigint-buffer` sigue en JS porque npm bloqueó el install-script. Stubs live sin llamar. El smoke es 1280×800; 360/768 no se recorrió aquí.
- TODO-VERIFICAR: mints de `config/tickers.ts` contra xstocks.fi; mínimo CLP y métodos de Koywe/Onramper; dividendos y emisor en la FAQ; autocustodia y exportar la clave (Privy); patrocinio del fee-payer [POR DECIDIR]; firma del webhook de Onramper; logos y marcas (`docs/PENDIENTES-LEGALES.md`) [REVISIÓN ABOGADO]; el texto final del disclaimer.
- [REVISIÓN ABOGADO]: `content/legal/{terminos,privacidad,riesgos}.md`, FAQ de regulación, footer, banner de `/legal`, paso 3 del onboarding, baja de cuenta y disclaimer del shell.
- Próximo: fase live, fuera de este paquete.

### T19 — Pulido visual, accesibilidad y rendimiento (2026-10-05, T19: pulido)
- Hecho: checklist en landing y `/app`. Tabs con `animate-tab` y `--ease-spring` (el Sheet ya lo usaba), press `active:scale-[0.98]`, NumberFlow en el saldo del shell. Cierre de Sheet/Dialog a 44px. `aria-live` en el USDC de la billetera y en la cotización; el countdown no se anuncia. Contraste a 4,5:1. Copy es-CL sin "app", "slippage", "spread", "exchange", "SDK" ni "broker". Fuentes con `display: swap`. QR y `lightweight-charts` en import dinámico. Logo con `next/image`. Landing y `/bloqueado` en `force-static`. `overflow-x-clip` en el body. `npx tsc --noEmit` y `npm run lint` ok. Sin `next dev`.
- Archivos clave: `app/fonts.ts`, `app/globals.css`, `components/ui/{tabs,qr-code,qr-mark,overlay}.tsx`, `components/domain/{balance-header,ticker-logo,price-chart}.tsx`, `content/i18n/es-CL.ts`, landing y legales.
- Decisiones: gris `#6c6f75`, sube `#1c7c5b`, baja `#cc2c55`, aviso `#99651a`. El placeholder sigue en `fg-subtle`. La lista del mercado no anuncia cada precio (refresco de 15 s); sí el precio grande, los totales y la cotización. "Deslizamiento máx." y "Diferencia de precio". El dólar sigue el Intl es-CL (`US$1.234,56`, sin espacio). Sin archivos en `public/logos`: si el logo falla, quedan las iniciales.
- Pendiente: mirar 360/768/1280 (landing, mercado, detalle, compra, cartera, billetera, depositar, perfil, ingresar y onboarding). No se corrió `next build`, así que `force-static` no quedó confirmado ahí.
- Próximo: T20.

### T18 — Librería Solana y stubs live (2026-10-05, T18: solana backend stubs)
- Hecho: multiplicador Token-2022, comisión USDC, dirección, allowlist, conexión y sponsor. TODOs de Jupiter, cartera, Privy, Koywe y Onramper. Queries de Supabase escritas, sólo si `DATA_MODE=live`. `0001_init.sql` presente. `npx tsc --noEmit` y `npm run lint` ok. Sin `next dev`. Las funciones puras se probaron con un script local.
- Archivos clave: `lib/solana/{scaled-ui,fee,address,allowlist,connection,sponsor}.ts`, `lib/services/{prices,trade,portfolio}.live.ts`, `users.supabase.ts`, `auth.privy.ts`, `onramp.{koywe,onramper}.ts`.
- Decisiones: se instalaron `@solana/web3.js` 1.99 y `@solana/spl-token` 0.4.15 (stack §1; no estaban). El helper es `getScaledUiAmountConfig`. Sin literales `0n`: el target es ES2017. `connection.ts` no importa `serverEnv`, para que el cliente use sólo la URL pública. La baja live va a `audit_log`: `profiles` no tiene columna. Idioma y moneda siguen en `profiles`. USDC usa el programa clásico. Ningún componente cliente importa `serverEnv`, `sponsor` ni servicios (`onboarding/page.tsx` es de servidor). PostgREST, sin `@supabase/supabase-js`.
- Pendiente: borrar `t18-check.ts` (queda en el disco, fuera del commit). No se corrió `next build`. En live faltan las llamadas, `@privy-io/server-auth`, orgId de Koywe y el secret de webhook de Onramper. `npm` bloqueó el install-script de `bigint-buffer`; web3.js usó el fallback JS.
- Próximo: T19.

### T17 — Perfil y ajustes (2026-10-05, T17: perfil ajustes)
- Hecho: `/app/perfil` con avatar, correo, país, menú y versión. Cuenta (nombre con `PATCH /api/me`, correo de sólo lectura, país, ID con copiar, solicitud de baja). Seguridad (métodos, exportar clave sin mostrarla, sesiones y 2FA en Próximamente). Notificaciones e idioma/moneda con `setPrefs` optimista. Legal con versión, fecha y links. `npx tsc --noEmit` y `npm run lint` ok. Sin `next dev`.
- Archivos clave: `app/(platform)/app/perfil/**`, `lib/auth/export-wallet.ts`, `lib/hooks/use-update-prefs.ts`, `app/api/me/{consents,deletion}`, `lib/mocks/demo-state.ts`, `content/i18n/{es-CL,en}.ts`.
- Decisiones: subrutas de §2.2. `GET /api/me/consents` y `POST /api/me/deletion` no están en §2.4: la tabla y la baja los necesitan. La baja mock guarda la fecha y no mueve saldos ni borra la cuenta. La clave sale por adaptador: mock no tiene clave; live usa `useExportWallet` de Privy y esta app no la recibe. Privy 3.47 no lista sesiones y el alta de 2FA no está cableada: ambas dicen Próximamente. Idioma y moneda cambian al instante el `/app` que usa `useT`. Landing, `/ayuda`, ingresar y onboarding siguen en español. La versión sale de `package.json`.
- Pendiente: mirar `/app/perfil` y las cinco pantallas a 360 y 1280 (nombre, copiar ID, diálogo de baja, exportar clave, switches, idioma y tabla). En live, baja y consentimientos siguen en el stub de Supabase.
- Próximo: T18.

### T16 — Depositar pesos (2026-10-05, T16: deposito onramp)
- Hecho: `/app/billetera/depositar` con Con pesos y Con USDC. Monto CLP, chips, mínimo, estimado y costo desde `createOnrampSession`. Continuar con Koywe abre el diálogo mock (pago → procesando → USDC acreditado); Otros métodos usa Onramper. Al pagar, el webhook mock suma USDC, deja un Depósito en la actividad, refresca saldos y muestra toast. `npx tsc --noEmit` y `npm run lint` ok. Sin `next dev`.
- Archivos clave: `app/(platform)/app/billetera/depositar/**`, `lib/onramp/**`, `config/onramp.ts`, `lib/services/onramp.mock.ts`, `lib/mocks/demo-state.ts`, `lib/api/{client,contracts}.ts`, `content/i18n/{es-CL,en}.ts`.
- Decisiones: mínimo 10.000 CLP en config, [VERIFICAR] con el proveedor. El costo mock es $0: no se inventa la comisión. Khipu, EtPay y transferencia son info, [VERIFICAR en Koywe]. `lib/onramp` es la interfaz común: mock = diálogo; live = URL o SDK (el servicio live sigue en stub). El crédito entra por `POST /api/onramp/webhook`; repetir la misma sesión no suma. La actividad es `kind: deposit`.
- Pendiente: mirar `/app/billetera/depositar` a 360 y 1280 (chips, mínimo, widget, toast, actividad, saldo y la pestaña USDC). En live el SDK de Koywe no está conectado.
- Próximo: T17.

### T15 — Billetera (2026-10-05, T15: billetera)
- Hecho: `/app/billetera` con USDC grande, SOL de red (explicación y aviso si no alcanza rent + red), Depositar · Enviar · Recibir, activos, dirección con copiar y actividad de todas las clases agrupada por día en Santiago. `/recibir` con QR, copiar, compartir y los avisos de red y de tokens. `/enviar` bloquea una dirección que no es base58 de 32 bytes, avisa si es la propia, monto con máx., revisión con red y rent mock, y confirma con `buildSend`, firma y los estados de T13. El envío mock queda en la actividad. `npx tsc --noEmit` y `npm run lint` ok. Sin `next dev`.
- Archivos clave: `app/(platform)/app/billetera/**`, `lib/solana/address.ts`, `lib/wallet/{send-cost,days,display,explorer}.ts`, `lib/mocks/demo-state.ts`, `lib/services/{portfolio.mock,trade.mock}.ts`, `content/i18n/{es-CL,en}.ts`.
- Decisiones: SOL no se envía (`MINT_NOT_ALLOWED`). La rent mock (0,0016 SOL) aparece si el destino no es la propia dirección; no se pasa a pesos. Enviar a la propia dirección no cambia el saldo. El débito y la actividad `kind: send` ocurren en `POST /api/trade/submit` al firmar, porque §2.4 no tiene submit de envío. La orden interna sólo sirve para el polling. Depositar sigue en T16. `address.ts` queda para T18.
- Pendiente: mirar `/app/billetera`, `/recibir` y `/enviar` a 360 y 1280 (dirección inválida, propia, máx., confirmar y actividad). Solscan no tiene las firmas `mock-sig-…`. Con 0,05 SOL de la demo el aviso de SOL bajo no se ve.
- Próximo: T16.

### T14 — Cartera (2026-10-05, T14: cartera)
- Hecho: `/app/cartera` con valor total (CLP/USD), P&L en monto y % ("—" si es null), rangos y gráfico de valor, AllocationBar, PositionRow, USDC con Depositar, historial buy/sell y vacío. La demo cuadra: 228,40 + 65,58 + 199,12 + 250 USDC = 743,10 USD. `npx tsc --noEmit` y `npm run lint` ok. Sin `next dev`.
- Archivos clave: `app/(platform)/app/cartera/*`, `components/domain/{allocation-bar,position-row,activity-item}.tsx`, `lib/portfolio/series.ts`, `lib/hooks/use-hide-balance.ts`, `lib/format.ts`, `content/i18n/{es-CL,en}.ts`.
- Decisiones: `Position.shares` ya incluye el multiplicador; no se vuelve a aplicar. El tooltip dice "incluye ajustes del emisor". El gráfico es historial de precios × las acciones de hoy + USDC; el último punto es `totalUsd`. Sin acciones no hay gráfico: quedan el vacío, el USDC y el historial. Depositar apunta a `/app/billetera/depositar` (T16). El ojo del shell también tapa montos y gráfico.
- Pendiente: mirar `/app/cartera` a 360 y 1280 (rangos, hover, asignación, filas, historial, ojo y vacío). Solscan no tiene las firmas `mock-sig-…`.
- Próximo: T15.

### T13 — Compra/venta (2026-10-05, T13: compra venta)
- Hecho: TradeSheet con `?operar=comprar|vender`. Monto CLP/USDC o acciones/USDC, chips, saldo y mínimo US$ 1. Cotización a los 400 ms, countdown y nueva cotización al vencer. Revisar muestra el resumen, CostBreakdown (comisión 0%, red, rent si abre cuenta, impacto, slippage), el aviso si el mercado está cerrado y el link a riesgos. Confirmar hace build, firma (mock 800 ms; Privy `signTransaction`) , submit y polling. Estados: Firmando, Enviando, Listo (cartera y Solscan) y Error con reintento. Al confirmar se invalidan cartera, saldos y actividad. `npx tsc --noEmit` y `npm run lint` ok. Sin `next dev`.
- Archivos clave: `components/domain/{trade-sheet,cost-breakdown}.tsx`, `components/ui/amount-input.tsx`, `lib/trade/amount.ts`, `lib/auth/{sign-transaction.ts,privy-signer.tsx}`, `lib/api/client.ts`, `config/trade.ts`, detalle de la acción, `content/i18n/{es-CL,en}.ts`.
- Decisiones: el archivo va en kebab-case, como el resto de `components/domain`. El mínimo vive en `config/trade.ts`, no en el env. USDC se muestra como US$. "Depositar" apunta a `/app/billetera/depositar` (la página es T16). Si faltan acciones al vender, no se ofrece depositar. Red y rent van en SOL, sin pasarlos a dólares. La firma mock devuelve la misma transacción. `?mockError=CODE` se reenvía a quote, build, submit y status.
- Pendiente: mirar compra y venta de AAPLx a 360 y 1280 (monto, chips, cotización, revisar, confirmar, listo). Probar `?operar=comprar&mockError=PRICE_DEVIATION` y también `QUOTE_EXPIRED`, `INSUFFICIENT_FUNDS` y `UPSTREAM`. Solscan no tiene las firmas `mock-sig-…`. En live, firmar depende de la billetera Privy.
- Próximo: T14.

### T13 — Peer Solana de Privy (2026-10-05, T13: fix dependencias Privy Solana)
- Hecho: el 500 de `/`, `/ayuda` y `/app/accion/AAPLx` era `Can't resolve '@solana-program/memo'` desde `@privy-io/react-auth/solana`. Se instaló `@solana-program/memo@0.10.0`. system 0.10.0, token 0.9.0, `@solana/kit` 5.5.1 y `@solana/wallet-standard-features` 1.5.0 ya resolvían. `npx tsc --noEmit` y `npm run lint` ok. Sin `next dev`.
- Decisiones: memo 0.10.0 exacto, no 0.14.1. El peer de Privy es `>=0.8.0`; su devDependency `^0.14.1` pide kit `^8` y el subpath `@solana/kit/program-client-core`, que kit 5.5.1 (lo trae `x402`) no tiene. No se tocó el import: en mock, `AuthProvider` carga Privy con `import()` sólo si `shouldUsePrivy()`.
- Pendiente: el operador debe recargar el servidor y confirmar que esas tres rutas ya no dan 500. La firma live no se probó.

### T12 — Detalle de acción (2026-10-05, T12: detalle accion)
- Hecho: `/app/accion/[ticker]` con header, precio, gráfico por rango, posición, datos, empresa y token, y CTA. Fuera del catálogo operable → 404 de la app. `npx tsc --noEmit` ok. ESLint de los archivos tocados ok. Sin `next dev`.
- Archivos clave: `app/(platform)/app/accion/[ticker]/*`, `components/domain/price-chart.tsx`, `content/tickers/*`, `app/not-found.tsx`, `content/i18n/{es-CL,en}.ts`.
- Decisiones: el server usa `tradableTicker` (HOODx y MSTRx también 404). Rangos `1S 1M 3M 1A Todo` = `1W 1M 3M 1Y ALL`; parte en 1M. El área es verde, roja o gris según el signo del rango. El crosshair cambia el precio grande. `?operar=comprar|vender` abre un Sheet vacío (el TradeSheet es T13). Vender queda deshabilitado sin acciones. Textos de empresa sin cifras. El mint abre Solscan. Se dice que el emisor puede congelar el token, con link a `/legal/riesgos`. En móvil, `--app-detail-cta` deja el aviso y el toast sobre la barra. `lightweight-charts` se carga al dibujar y conserva el logo de atribución.
- Pendiente: mirar `/app/accion/AAPLx` a 360 y 1280 (rangos, crosshair, favorito, compartir, comprar y vender). Con sesión, `/app/accion/FAKE` y `/app/accion/HOODx` deben ser la 404; sin cookie el middleware manda a ingresar. La posición demo está en AAPL, NVDA y TSLA.
- Próximo: T13.

### T11 — Mercado (2026-10-05, T11: mercado)
- Hecho: `/app` lista las acciones habilitadas. Buscador (símbolo, nombre, subyacente; sin acentos; debounce 150 ms; `/` en ≥1024px). Chips Todas · Tecnología · ETFs · Fintech · Consumo · Favoritas. Orden Popular (config) · Mayor alza · Mayor baja · A–Z. "Más movidas hoy" = top 3 por |variación|. TickerRow con sparkline 1W, precio en la moneda de preferencia (CLP = USD×FX) y estrella. MarketStatusPill desde `/api/market/status`. Skeletons, vacío y error con reintento. `npx tsc --noEmit` y `npm run lint` ok. El filtro "app" → solo AAPLx se probó en Node. Sin `next dev`.
- Archivos clave: `app/(platform)/app/{page,market-screen}.tsx`, `components/domain/{ticker-card,ticker-row,market-status-pill,favorite-button}.tsx`, `lib/market/browse.ts`, `lib/hooks/{queries,use-favorites}.ts`, `lib/api/client.ts`, `content/i18n/{es-CL,en}.ts`.
- Decisiones: query `q`, `filtro` (`tech|etf|fintech|consumer|favorites`) y `orden` (`gain|loss|az`). Popular y Todas no se escriben. Favoritos en `localStorage` `a24_favorites` (`{v:1,symbols}`). HOODx y MSTRx no se listan. "Más movidas" usa el filtro activo, no la búsqueda, y se oculta mientras hay texto: "app" deja solo Apple. No es una recomendación. La estrella va fuera del link. Historial 1W por símbolo, sparkline de 32 puntos.
- Pendiente: mirar `/app` a 360 y 1280 (buscar "app", chips, orden, estrella, pill, vacío y error). `/app/accion/[symbol]` sigue sin página (T12).
- Próximo: T12.

### T10 — Shell de la plataforma (2026-10-05, T10: shell plataforma)
- Hecho: AppShell en `/app`. ≥lg sidebar 240px; <lg TopBar y BottomTabs de 64px con safe-area. Item activo resaltado. Mercado, Cartera, Billetera y Perfil son placeholders con PageHeader y EmptyState. `npx tsc --noEmit` y `npm run lint` ok. Sin `next dev`.
- Archivos clave: `app/(platform)/app/{layout,page,cartera,billetera,perfil}`, `components/app-shell/*`, `components/domain/balance-header.tsx`, `components/ui/{page-header,loading-state,error-state}.tsx`, `content/i18n/{es-CL,en}.ts`, `lib/hooks/{use-t,queries}.ts`.
- Decisiones: ingresar y onboarding siguen en su carpeta; AppShell no les monta el chrome (un layout en `app/(platform)/app` envuelve cualquier route group hijo). Saldo = `totalUsd` de la cartera, en la moneda de `usePrefs`; CLP usa `GET /api/fx/usdclp` (`getFx`/`useFx`, 1 h en el cliente). Ocultar saldo en `localStorage` (`a24_hide_balance:<userId>`). Sin preferencias: es-CL y CLP. Los montos siguen en formato es-CL. Disclaimer de §4, [REVISIÓN ABOGADO]. El toast usa `--app-chrome-bottom` para no quedar bajo las tabs.
- Pendiente: mirar 360 y 1280 (sidebar, tabs, saldo, ojo, disclaimer y las 4 secciones). `/app/billetera/depositar` sigue sin página (T16).
- Próximo: T11.

### T09 — Onboarding (2026-10-05, T09: onboarding)
- Hecho: `/app/onboarding` es un wizard de 5 pasos, mobile-first, sin AppShell. País (si `US`, no disponible), declaración US person, 3 consentimientos versionados, billetera y “Todo listo”. `npx tsc --noEmit` y `npm run lint` ok. Sin `next dev`.
- Archivos clave: `app/(platform)/app/onboarding/*` (wizard, schema zod, borrador y países).
- Decisiones: versiones desde `serverEnv` (`TERMS_VERSION`, `PRIVACY_VERSION`, `RISKS_VERSION`) como props; el cliente no importa `lib/env`. Borrador en `localStorage` (`a24_onb_draft`, por usuario) y `clampDraft` impide saltar pasos. Paso 3 hace `POST /api/me/consents` por documento; el cierre repite el POST, luego `PATCH /api/me` (`country`, `isUsPerson: false`, `onboardingCompleted`) y cookie `a24_onb=1`. La dirección sale de la sesión (mock o Privy); no se inventa una. Sin cookie, `finished` no vale: logout no deja entrar a `/app`.
- Pendiente: mirar el flujo en el navegador (360 y desktop): país, `US`, declaración, documentos, billetera, “Explorar acciones” y “Depositar pesos”. `/app` y `/app/billetera/depositar` siguen sin página (T10 y T16). El layout de T10 no debe envolver `/app/onboarding` con AppShell.
- Próximo: T10.

### T08 — Auth y middleware (2026-10-05, T08: auth y middleware)
- Hecho: `useSession()` con mock y Privy. `/app/ingresar` (email y Google). `middleware.ts` geobloquea y guarda `/app/*`. Logout limpia `a24_mock_session` y `a24_onb` y vuelve a `/`. `npx tsc --noEmit` y `npm run lint` ok. El gate se probó aparte, sin `next dev`.
- Archivos clave: `lib/auth/*`, `middleware.ts`, `app/(platform)/app/ingresar/*`, `app/(platform)/app/onboarding/*`, `app/providers.tsx`, `package.json`.
- Decisiones: Privy (`@privy-io/react-auth` 3.47, del stack) sólo si `NEXT_PUBLIC_DATA_MODE=live` y hay `NEXT_PUBLIC_PRIVY_APP_ID`. Si no, mock y el SDK no se monta. Props leídas en los tipos 3.47: `loginMethods: ["email","google"]`, `embeddedWallets.solana.createOnLogin: "users-without-wallets"`. Onboarding = cookie `a24_onb=1` (también en live, hasta poder leer el perfil). `?country=` sólo fuera de production. `next` sólo bajo `/app`. Next 16 avisa que `middleware.ts` pasó a `proxy.ts`; se deja el nombre de §2.3 (los dos archivos juntos rompen el build). `/app/onboarding` es un alto con cerrar sesión: los pasos son T09. `/api/me` de la demo sigue con `onboardingCompleted: true`; el guard usa la cookie.
- Pendiente: mirar en el navegador `/app` → ingresar, login demo → onboarding, logout → `/`, `?country=US` → `/bloqueado`. Con `a24_onb=1`, `/app` aún no tiene página (T10). `@privy-io/server-auth` sigue en §10. No se instalaron los peers opcionales `@solana/kit`.
- Próximo: T09.

### T07 — API, cliente y hooks (2026-10-05, T07: api y cliente)
- Hecho: un `route.ts` por endpoint de §2.4 (`runtime` node). `npx tsc --noEmit` y `npm run lint` ok. Smoke sin `next dev`: `/api/tickers` (12, cache 3600), `/api/prices?symbols=AAPLx,NVDAx` (no-store), historial `1M` (120 puntos). HOODx → `MINT_NOT_ALLOWED`. Cartera sin cookie → 401; con `a24_mock_session` → demo. Geo `US` bloqueado. Cotización, `/api/me` y el webhook también.
- Archivos clave: `app/api/**/route.ts`, `lib/api/{handler,client}.ts`, `lib/hooks/queries.ts`, `app/providers.tsx`, `app/layout.tsx`.
- Decisiones: el catálogo sale del allowlist (§5 no tiene servicio de tickers). Precios e historial `no-store`; FX y mercado también, porque dependen del reloj. Sesión en cartera, saldos, actividad y en lo que pide `userId` (submit, onramp, me, consentimientos, preferencias). `?mockError=` envuelve la llamada al servicio, no el login. Toaster = `ToastProvider` ya existente. `usePrices` refresca cada 15 s. Sin header de país se asume CL. `.gitignore` usa `/build/` (sólo la raíz): `build/` ocultaba `app/api/**/build`.
- Pendiente: mirar esas rutas en el navegador (no se levantó servidor). Enviar SOL queda `MINT_NOT_ALLOWED` (no está en el allowlist). El cliente no envuelve fx, mercado, estado de orden ni geo.
- Próximo: T08.

### T06 — Núcleo de dominio (2026-10-05, T06: nucleo dominio)
- Hecho: tipos §4, contratos zod de §2.4, `ApiResult` y mapa HTTP, `serverEnv`/`publicEnv`, fees, `formatRelative`, mocks deterministas, `Services` mock y stubs live, allowlist. `npm run typecheck` y `npm run lint` ok. Smoke sin `next dev`: compra mock, errores, FX 950, horario NY.
- Archivos clave: `lib/types/index.ts`, `lib/api/{contracts,result}.ts`, `lib/env.ts`, `config/fees.ts`, `lib/format.ts`, `lib/mocks/*`, `lib/services/*`, `lib/solana/allowlist.ts`.
- Decisiones: se agregó `server-only` (marcador de Next; el scaffold no lo traía). `*Pct` es ratio, como `formatPercent`. Multiplicador mock 1. FX ~950 y SOL a 150 USD son relleno con `source` mock. Demo: 1 AAPLx, 0,5 NVDAx, 0,8 TSLAx y 250 USDC. `sendBuild` vive en portfolio (§2.4 no está en el bloque §5). `withMockError` simula `?mockError=`. Cotización 60 s. Si el saldo cambia al confirmar, la orden queda `failed`.
- Pendiente: mirar la app con `next dev` (no se levantó servidor). El horario mock no incluye feriados de EE.UU. HOODx y MSTRx siguen apagados. Los stubs live no llaman a Jupiter, Koywe ni Supabase.
- Próximo: T07.

### T05 — Landing C (2026-10-05, T05: landing legal y SEO)
- Hecho: FAQ (6 en `/`, 8 en `/ayuda`), FinalCTA, SiteFooter, `/legal/[doc]` desde markdown, `/bloqueado`, metadata, OG, robots, sitemap e iconos. `npx tsc --noEmit`, `npm run lint` y `npm run build` ok (rutas estáticas). Sin `next dev`.
- Archivos clave: `components/landing/{faq,final-cta,site-footer,legal-document}.tsx`, `lib/content/{faq,legal}.ts`, `content/legal/*.md`, `app/{layout,robots,sitemap,icon,apple-icon,opengraph-image,twitter-image}.tsx`, `app/bloqueado/page.tsx`, `app/(marketing)/{layout,page,ayuda,legal}`.
- Decisiones: sin dependencia nueva; el servidor parsea el md y reemplaza `{{brand}}` por `site.name`. Banner en la página. Comisión 0% como T04; dividendo y emisor [VERIFICAR]; no se afirma autorización de la CMF. Retiro a banco sin plazo prometido. `dynamicParams = false`. robots niega `/app`, `/api`, `/dev`, `/bloqueado`. `favicon.ico` reescrito (punto naranja), más `icon.tsx`.
- Pendiente: mirar `/`, `/ayuda`, `/legal/*` y `/bloqueado` a 360/768/1280. Correo de soporte vacío.
- T05b (2026-10-05, T05b: copy propiedad del token): el token es del usuario y está en su billetera. FAQ y `/ayuda` aclaran que no es accionista registrado, que no hay voto y que el token sigue el precio. Misma idea en el paso 3, la grilla, seguridad, el footer y, en lo mínimo, riesgos y términos.
- Próximo: T06.

### T04 — Landing B (2026-10-05, T04: landing secciones)
- Hecho: HowItWorks, ProductMock, FeatureGrid, CostsSection, SecuritySection y `useReveal`. `npx tsc --noEmit` y `npm run lint` ok. Sin servidor.
- Archivos clave: `components/landing/{how-it-works,product-mock,feature-grid,costs-section,security-section,reveal,section}.tsx`, `lib/hooks/{use-reveal,reveal-motion}.ts`, `app/(marketing)/page.tsx`, `app/globals.css`.
- Decisiones: reveal visible en SSR/sin JS; con motion, lo que está fuera de vista entra al hacer scroll (600ms, stagger 80ms, 16px). Lo ya visible no se oculta. Reduced-motion queda estático. Comprar del mock no es un control. Precios ilustrativos. No se dice «emisor regulado» ni que la clave ya se exporta (TODO-VERIFICAR, Privy). «Sin papeleo» = sin cuenta en un broker de EE.UU.; sí hay términos. Red: orden de centavos de dólar, monto al confirmar. Rent ≈0,0016 SOL no se pasa a USD (patrocinio [POR DECIDIR]). Grilla 2×2 desde `sm`.
- Pendiente: mirar `/` a 360/768/1280 (reveal, tabs, tabla). `/legal/comisiones` y `/legal/riesgos` llegan en T05. Cerrar redacción de emisor y autocustodia.
- Próximo: T05.

### T03 — Landing A (2026-10-05, T03: landing hero)
- Hecho: header fijo (blur al scroll, menú en Sheet), hero centrado, card ivory con TickerRows y cinta infinita. `npx tsc --noEmit` y `npm run lint` ok. Sin servidor.
- Archivos clave: `app/(marketing)/layout.tsx`, `app/(marketing)/page.tsx`, `components/landing/{site-header,announcement-pill,hero,ticker-marquee}.tsx`, `lib/mocks/landing.ts`, `app/globals.css`.
- Decisiones: marca desde `site.name` con punto naranja. Copy elegido; alternativas en comentarios de `hero.tsx` y `announcement-pill.tsx`. Precios sólo ilustrativos, sin logos de emisor (iniciales). Cinta `aria-hidden` más lista para lector de pantalla; pausa en hover; estática si `prefers-reduced-motion`. Links a `/#como-funciona`, `/#costos`, `/#seguridad` y `/ayuda`.
- Pendiente: mirar `/` a 360/768/1280 (blur, marquee, sin scroll horizontal). `/app`, `/ayuda` y las anclas todavía no tienen página.
- Próximo: T04.

### T02 — Primitivos UI (2026-10-04, T02: primitivos UI)
- Hecho: primitivos en `components/ui/`, presentacionales en `components/domain/` (TickerLogo, PriceText, ChangeBadge, Sparkline, TickerRow), `lib/format.ts` con `Intl` es-CL y catálogo `/dev/ui` (`notFound()` si `NODE_ENV==="production"`). `npx tsc --noEmit` y `npm run lint` ok.
- Archivos clave: `components/ui/*`, `components/domain/*`, `lib/format.ts`, `app/dev/ui/page.tsx`, `app/dev/ui/catalog.tsx`, `app/globals.css`.
- Decisiones: sin Radix (no está en el stack; Dialog/Sheet/Tabs/Select/Tooltip/Switch/Accordion con roles, foco y Esc). Sheet lateral desde `md`. IconButton mediano 44px en móvil y 48px desde `md`. `formatPercent` recibe un ratio (0,012 = 1,2%). PriceText no anuncia cambios salvo `live`. Chips de monto en USD cuando la moneda es USD.
- Pendiente: mirar `/dev/ui` a 360px con `npm run dev` (no se levantó servidor).
- Próximo: T03.

### T01 — Scaffold (2026-10-04, T01: scaffold)
- Hecho: Next.js 16.3.8 (App Router, TS strict, Tailwind v4, ESLint, sin `src/`, alias `@/*`). Tokens, Geist, `lang="es-CL"`, estructura §3, copias de tickers / `.env.example` / SQL, página `/` temporal. `npm run typecheck`, `npm run lint` y `npm run build` ok (`/` estática).
- Archivos clave: `package.json`, `app/layout.tsx`, `app/globals.css`, `app/(marketing)/page.tsx`, `config/site.ts`, `config/tickers.ts`, `lib/cn.ts`, `lib/types/index.ts`, `.env.example`, `supabase/migrations/0001_init.sql`.
- Decisiones: paquete npm `maverlang-stocks` (npm rechaza mayúsculas en la carpeta). Marca desde `NEXT_PUBLIC_BRAND_NAME` (fallback "Maverlang Stocks"). Stub `Ticker` para que el allowlist compile. `docs/` fuera de tsc y ESLint. zod 4, la última al instalar.
- Pendiente: mirar `/` con `npm run dev` (no se levantó servidor). Sustituir el stub de `Ticker` en la tarea de tipos.
- Próximo: T02.

## Decisiones globales
- Marca: Maverlang (nombre comercial "Maverlang Stocks") (configurable por env).
- Comisión propia: 0 bps al lanzamiento.
- Paquete npm: `maverlang-stocks`.

## Pendientes / bloqueos
- Ubicación definitiva del repo (OneDrive vs C:\dev).
- Textos legales: [REVISIÓN ABOGADO]. Mints contra xstocks.fi, mínimo y métodos de on-ramp, dividendos, emisor, autocustodia Privy, patrocinio [POR DECIDIR] y firma del webhook de Onramper: [VERIFICAR] antes de producción.
- Logos y marcas del catálogo: sólo identifican el activo. Archivos de xStocks/Backed en `public/logos`. Ver `docs/PENDIENTES-LEGALES.md`. [REVISIÓN ABOGADO] antes de producción.
- El smoke de T20 cubre el flujo mock a 1280×800. Sigue sin mirarse 360/768 (landing, mercado, detalle, compra, cartera, billetera, depositar, perfil) ni `?country=US`, `?mockError=`, FAKE/HOODx en 404 y el ojo del saldo.
- Borrar `t18-check.ts` (sigue en el disco; `.gitignore` evita commitearlo).
- Fase live: `.env.example` recomienda `PRICES_MODE=live`. Si la variable no existe, el código sigue en mock (tests y CI). Con live, el spot y el dólar son reales; el historial sigue ilustrativo y anclado a ese spot. Trade on-chain, Koywe y Onramper siguen en stub. Auth de Supabase: registro (M30), ingreso (M31) y verificación (M32, perfil en SKIP). Falta aplicar `0002` y correr `npm run e2e:auth`. La cartera mock no está asociada al usuario. Privy sigue en el código. La landing sigue con precios ilustrativos.
