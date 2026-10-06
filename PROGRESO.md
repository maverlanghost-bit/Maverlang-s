# PROGRESO — Maverlang

## Estado
M29 hecha. La sesión puede ser de Supabase (`AUTH_MODE`); si falta config, queda en mock. El formulario de registro e ingreso todavía no. Siguiente: fuera de esta tarea.

## Tareas hechas

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
- Fase live: `.env.example` recomienda `PRICES_MODE=live`. Si la variable no existe, el código sigue en mock (tests y CI). Historial, trade, cartera, Koywe y Onramper siguen en stub. Auth de Supabase (M29) refresca la sesión; la migración SQL no está aplicada y el formulario no existe. Privy sigue en el código. La landing sigue con precios ilustrativos.
