# Análisis de referencias de diseño — Maverlang

Fecha: 4-oct-2026. Fuentes: HTML/CSS descargados en `build/ref/` (x.ai/bot y spacex.com) + contenido público de joinautopilot.com.
Regla: copiamos **principios y patrones**, nunca assets, logos, fuentes propietarias ni textos.

---

## 1. x.ai/bot — referencia PRINCIPAL (look & feel global, modo claro)
URL: https://x.ai/bot · CSS: `build/ref/xai_all.css`

### Lo que medimos (datos duros del CSS)
| Elemento | Valor real | Cómo lo usamos |
|---|---|---|
| Fondo | blanco puro `#fff` | Igual |
| Texto principal | `jet` hsl(0 0% 4%) ≈ `#0a0a0a`; tema `fg` `#252525` | `--fg: #0a0a0a`, cuerpo `#252525` |
| Texto secundario | `fog` hsl(216 4% 51%) ≈ `#7d8188` | `--fg-muted` |
| Cards / superficies | `ivory` hsl(40 18% 97%) ≈ `#f8f7f5`; `card-01/02/03` `#f2f2f2 / #ebebeb / #e1e1e1`; `nimbus` hsl(228 22% 95%) | Superficies en 3 niveles |
| Bordes | `dove` hsl(222 19% 86%) ≈ `#d5dae3`; también `color-mix(fg 2.5% / 10%)` | Bordes hairline casi invisibles |
| Acento | `sunset` hsl(22 100% 52%) ≈ `#ff6a08` (uso muy escaso) | Acento de marca puntual (badges "Nuevo", foco de hero) |
| Verde / rojo | ansi `#1f8a65` / `#cf2d56` | **Sube / baja** en precios |
| Tipografía display | "xVf" (propietaria), weight 500, letter-spacing -0.01em | **Geist Sans** 500 (OFL) |
| Números/código | GeistMono | **Geist Mono** con `tabular-nums` para precios |
| H1 | `text-4xl sm:text-5xl lg:text-6xl` (36→60px), `leading-[1.05]`, `tracking-tight`, `text-balance` | Igual |
| H2 | `text-3xl sm:text-4xl` | Igual |
| Cuerpo | `text-sm/base`, `leading-relaxed` (1.625) | Igual |
| Radios | cards `rounded-3xl` (24px); botones `rounded-full`; micro 2–4px | Igual |
| Botón primario | pill, fondo `fg` oscuro, texto blanco, `h-9 px-4 md:h-11 md:px-6`, `font-normal` | Igual |
| Botón secundario | pill `bg-card-03`, hover `bg-fg-10` | Igual |
| Header | fijo, `h-16`, `py-4`, `backdrop-blur`, CTA pill partido ("Download") | Igual, CTA "Abrir app" |
| Secciones | `py-20 / py-28 / py-32 / py-40`; contenido `max-w-7xl` (80rem) y `64rem`; inset de marco 20px | Igual |
| Motion | duración .14s; easing spring `cubic-bezier(.25,1,.5,1)`; keyframes `marquee`, `pulse`, `waveform` | Igual (marquee para cinta de tickers) |
| Sombra | casi nula (`shadow` estándar tailwind sólo en flotantes) | Sin sombras en cards; bordes + superficie |

### Patrones de composición que copiamos
1. **Pill de anuncio sobre el H1** ("Grok Bot is here • Read the launch post") → "Nuevo: compra Apple desde $1.000 • Ver cómo funciona".
2. **Hero centrado, H1 corto y contundente + 1 línea de subtítulo + 2 CTAs pill**.
3. **"Mock windows" del producto** dentro de cards `rounded-3xl` color ivory: en vez de screenshots, componentes reales en miniatura (tarjeta de compra, cartera con P&L). Se ven nítidos y se construyen con los mismos componentes del /app.
4. **Bloques de feature en grilla 2×2** con título `h3` corto + 1 frase + mini demo animada.
5. **Carrusel con tabs** ("Give each Bot a job") → "Elige tu acción": tabs con tickers, cada tab muestra un mini gráfico + precio.
6. **Precios con NumberFlow** (números animados) → precios de acciones y totales de cartera.
7. **FAQ en acordeón** ("Grok Bot Guides") y **CTA final** grande ("Meet your first Bot" → "Abre tu cuenta en 2 minutos").
8. **Copy breve, seguro, sin adjetivos vacíos.** Frases de 6–10 palabras.

### Lo que NO copiamos
- Fuente xVf, logos, ilustraciones, textos.
- Modo oscuro (existe como `.dark`; no lo implementamos en v1).
- Tabla de precios/planes (no aplica).
- No decir "24/7". El horario es "24 horas, de lunes a viernes"; el fin de semana el mercado está cerrado.

---

## 2. spacex.com — referencia SECUNDARIA (dramatismo y ritmo)
URL: https://www.spacex.com · CSS: `build/ref/spacex.css`

### Datos medidos
- Fuente D-DIN / D-DIN-Bold; titulares y nav en **MAYÚSCULAS**, letter-spacing .02–.09em, nav .813rem bold, line-height 94%.
- Hero a pantalla completa, tipografía ~100px con tracking -1px.
- Animaciones de entrada: `translateY` + `opacity`, .75s ease-in-out, escalonadas .5s / 1s.
- Botones icono circulares 48px, fondo blanco 10%, `backdrop-blur(6px)`.

### Qué tomamos
- **Micro-etiquetas en mayúsculas** con tracking amplio (`text-[11px] uppercase tracking-[0.08em]`) en Geist Mono, sobre secciones ("01 — DEPOSITA", "02 — COMPRA").
- **Reveal escalonado** al hacer scroll (opacity 0→1, y 16px→0, 600ms, stagger 80ms). Respeta `prefers-reduced-motion`.
- **Un momento "cinemático"**: hero con número grande (precio vivo de AAPL animado) o cinta de tickers en marquee.

### Qué NO tomamos
- Fondo negro, imágenes full-bleed pesadas, video de fondo (peso/LCP).
- Mayúsculas en titulares largos (sólo labels).

---

## 3. "Autopilot" — referencia de PRODUCTO FINTECH
Nota: autopilot.xyz es un dominio en venta y la página de Tesla Autopilot devolvió 403. Interpretamos "Autopilot" como **joinautopilot.com** (app de inversión/copy-trading: "Investing Made Easy").
Su CSS está detrás de un Vercel Security Checkpoint (HTTP 429) → **detalles visuales [VERIFICAR] abriendo el sitio en un navegador**. Analizado sólo por contenido y estructura.

### Patrones de producto que tomamos
| Patrón Autopilot | Adaptación Maverlang |
|---|---|
| "Choose a Portfolio. Connect your Brokerage. That's it." (3 pasos) | "Deposita pesos. Elige una acción. Listo." |
| Cifra social grande ("$525.5M Currently Invested") | **NO** inventamos cifras. Usamos datos verificables: "10 acciones de EE.UU.", "Desde $1.000", "Comisión 0% en el lanzamiento". |
| Tabs de rendimiento 1W/1M/3M/6M/1Y | Tabs `1S 1M 3M 1A Todo` en detalle de acción y cartera |
| Tarjetas de portafolio con % rendimiento | Filas/tarjetas de acción con precio + variación coloreada |
| Modal con QR para bajar la app | Modal "Abrir en el celular" con QR a la URL de la web app (PWA) |
| "Top performers" | "Más movidas hoy" en el mercado |

### Qué NO tomamos
- Copy-trading de políticos / "seguir a alguien" (asesoría implícita → riesgo regulatorio CMF; ver PLAN-V2).
- Promesas de rentabilidad o rankings de "mejores".

---

## 4. Síntesis: el estilo Maverlang
> **"x.ai claro + disciplina de broker".** Blanco, negro y grises cálidos; verde/rojo sólo para variaciones; un acento naranja mínimo; números monoespaciados; cards grandes redondeadas; cero sombras; motion corto y elástico; labels en mayúsculas estilo SpaceX; flujos y tabs de tiempo estilo Autopilot.

Checklist rápido para el builder:
- [ ] ¿Hay más de un color saturado en pantalla aparte de verde/rojo? → quitar.
- [ ] ¿Los precios usan Geist Mono + `tabular-nums`? 
- [ ] ¿Cards con borde hairline y sin sombra?
- [ ] ¿Botones pill, h-11 en desktop?
- [ ] ¿Toda cifra/afirmación es verificable? (si no, quitarla)
