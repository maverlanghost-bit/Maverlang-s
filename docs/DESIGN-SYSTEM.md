# Design System — Maverlang (modo claro, fintech)

Base: Tailwind CSS v4 (tokens en CSS con `@theme`) + shadcn/ui (opcional, re-tematizado). Fuentes: Geist Sans + Geist Mono (paquete `geist`, licencia OFL).
Origen de los valores: ver `DISENO-REFERENCIAS.md` (medidos del CSS de x.ai/bot).

## 1. Principios
1. **Claridad antes que decoración.** Cada pantalla responde: ¿cuánto tengo?, ¿cuánto vale?, ¿cuánto me cuesta?
2. **Monocromo + semántica.** Negro/gris para todo; verde = sube/éxito, rojo = baja/error, ámbar = advertencia, naranja = marca (muy poco).
3. **Números son protagonistas.** Geist Mono, `tabular-nums`, tamaños grandes, animación al cambiar.
4. **Transparencia de costos visible** siempre antes de confirmar (spread, comisión, red, rent).
5. **Motion corto (140–240ms), elástico, nunca bloqueante.** Respeta `prefers-reduced-motion`.

## 2. Tokens

### Color
| Token | Hex | Uso |
|---|---|---|
| `bg` | `#ffffff` | Fondo |
| `fg` | `#0a0a0a` | Títulos, botón primario |
| `fg-body` | `#252525` | Texto cuerpo |
| `fg-muted` | `#7d8188` | Secundario, labels |
| `fg-subtle` | `#a3a7ad` | Placeholder, deshabilitado |
| `surface-1` | `#f8f7f5` | Cards grandes (ivory) |
| `surface-2` | `#f2f2f2` | Inputs, filas hover |
| `surface-3` | `#e1e1e1` | Botón secundario, chips activos |
| `border` | `#ebebeb` (≈ fg 10%) | Bordes hairline |
| `border-strong` | `#d5dae3` | Inputs foco/estado |
| `up` | `#1f8a65` | Variación positiva |
| `up-bg` | `#e8f5ef` | Badge positivo |
| `down` | `#cf2d56` | Variación negativa, error |
| `down-bg` | `#fbecef` | Badge negativo |
| `warn` | `#b7791f` (texto) / `#fdf5e6` (bg) | Mercado cerrado, avisos |
| `info` | `#2b7fd9` / `#eaf3fd` | Info neutra |
| `brand` | `#ff6a08` | Acento puntual (badge "Nuevo", punto en logo) |

Contraste: `fg-muted` sobre blanco ≈ 4.0:1 → usar sólo ≥14px; texto pequeño crítico en `fg-body`.

### Tipografía
| Rol | Clase | Spec |
|---|---|---|
| Display H1 | `font-display text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight text-balance` | Geist 500, -0.01em |
| H2 | `font-display text-3xl sm:text-4xl tracking-tight` | 500 |
| H3 | `text-base font-medium leading-relaxed` | |
| Body | `text-sm sm:text-base leading-relaxed text-fg-body` | |
| Label (estilo SpaceX) | `font-mono text-[11px] uppercase tracking-[0.08em] text-fg-muted` | |
| Precio grande | `font-mono tabular-nums text-4xl sm:text-5xl tracking-tight` | |
| Precio en lista | `font-mono tabular-nums text-sm` | |

### Espaciado y layout
- Escala Tailwind estándar (4px). Gaps habituales: 2, 3, 4, 6, 8, 12, 16.
- Landing: secciones `py-20 md:py-28 lg:py-32`; contenedor `max-w-7xl px-5` (inset 20px); texto `max-w-2xl`.
- App: contenedor `max-w-6xl`; sidebar 220px (≥lg); bottom tab bar 64px (<lg) con `pb-[env(safe-area-inset-bottom)]`.
- Breakpoints: Tailwind default (sm 640, md 768, lg 1024, xl 1280). **Mobile-first**: 80% del tráfico esperado es móvil.

### Radios, bordes, sombras
- `radius-xs` 4px (chips mini), `radius-md` 12px (inputs), `radius-xl` 16px (filas/cards pequeñas), `radius-3xl` 24px (cards grandes, sheets), `full` (botones, badges).
- Bordes 1px `border`. **Sin sombras** salvo flotantes (dropdown, toast, sheet): `0 8px 30px rgb(0 0 0 / .08)`.

### Motion
- `--dur-fast` 140ms (hover, press), `--dur-base` 240ms (sheet, tabs), `--dur-slow` 600ms (reveal).
- `--ease-spring` `cubic-bezier(.25,1,.5,1)`; `--ease-inout` `cubic-bezier(.4,0,.2,1)`.
- Reveal on scroll: opacity 0→1 + translateY 16px→0, stagger 80ms.
- Press: `active:scale-[0.98]`.
- Marquee de tickers: 40s linear infinite, pausa en hover.

## 3. Componentes (inventario)
**Primitivos (`components/ui/`)**: Button (primary | secondary | ghost | danger; sizes sm/md/lg; loading), IconButton (circular 40/48px), Card, Badge (neutral/up/down/warn/brand), Input, AmountInput (moneda + mono grande), Select, Tabs, SegmentedControl (`1S 1M 3M 1A Todo`), Sheet (bottom en móvil / derecha en desktop), Dialog, Tooltip, Skeleton, Toast, Switch, Accordion, Avatar, Separator, QRCode, CopyButton, EmptyState, ErrorState.

**Dominio (`components/domain/`)**: TickerLogo, PriceText (NumberFlow + color por signo), ChangeBadge, Sparkline (SVG), PriceChart (lightweight-charts), TickerRow, TickerCard, MarketStatusPill, CostBreakdown, TradeSheet, PositionRow, AllocationBar, BalanceHeader, AddressBox, ActivityItem, RiskNotice, ConsentCheckbox.

**Landing (`components/landing/`)**: SiteHeader, AnnouncementPill, Hero, TickerMarquee, HowItWorks (3 pasos), ProductMock (usa componentes de dominio con mocks), FeatureGrid, CostsSection, SecuritySection, FAQ, FinalCTA, SiteFooter (con avisos legales).

### Specs clave
- **Button primary**: `h-9 px-4 md:h-11 md:px-6 rounded-full bg-fg text-white font-normal hover:bg-[#1f2329] active:scale-[0.98] transition duration-[140ms] focus-visible:ring-4 ring-fg/20 disabled:opacity-40`.
- **Button secondary**: igual pero `bg-surface-3 text-fg hover:bg-[#d6d6d6]`.
- **Card**: `rounded-3xl bg-surface-1 border border-border p-6 md:p-8`.
- **TickerRow**: alto 64px; logo 36px circular; símbolo `font-medium` + nombre `text-fg-muted text-sm`; a la derecha precio mono + ChangeBadge. Hover `bg-surface-2`. Toda la fila es link.
- **AmountInput**: número `font-mono text-5xl` centrado, moneda conmutable CLP ⇄ USD, chips rápidos `$5.000 · $10.000 · $50.000 · Máx`.
- **CostBreakdown**: lista clave/valor `text-sm`: Precio estimado · Recibes (acciones) · Comisión Maverlang (0%) · Comisión de red · Creación de cuenta de token (sólo 1ª vez) · Slippage máx. Siempre visible antes de "Confirmar".
- **MarketStatusPill**: "Mercado abierto" (up) / "Fuera del horario regular. El precio puede variar más" (warn, lun–vie) / "Mercado cerrado: abre el lunes" (warn, sábado y domingo).

## 4. Voz y copy (es-CL)
- Tú, directo, sin jerga cripto en la superficie: "acción tokenizada" se explica una vez; se evita "token", "swap", "wallet" en UI principal → "acción", "compra/venta", "billetera".
- Números en formato chileno: `$12.345` CLP (sin decimales), `US$ 1.234,56`; acciones con hasta 6 decimales (`0,004213 acc.`).
- Horario del producto: "24/7" (EN: "Trade 24/7"), según xstocks.fi. Fuera del horario regular de la bolsa de EE.UU. el precio puede variar más.
- Nunca: "gana", "rentabilidad asegurada", "sin riesgo".
- Disclaimer corto persistente en footer del /app: "Las acciones tokenizadas no otorgan derechos de accionista. Invertir implica riesgos." (texto final lo revisa abogado — [VERIFICAR]).

## 5. Accesibilidad
- Foco visible siempre (`ring-4 ring-fg/20`). Targets ≥44px en móvil.
- Color nunca es la única señal: variaciones con signo `+/-` y flecha.
- `aria-live="polite"` en precios que cambian (con throttling) y en estados de transacción.

## 6. Snippet de tokens — Tailwind v4 (`app/globals.css`)
Ver archivo listo: `docs/styles/tokens.css`. Resumen:
```css
@import "tailwindcss";
@theme {
  --font-sans: var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif;
  --font-display: var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif;
  --font-mono: var(--font-geist-mono), ui-monospace, SFMono-Regular, monospace;
  --color-bg: #ffffff; --color-fg: #0a0a0a; --color-fg-body: #252525;
  --color-fg-muted: #7d8188; --color-fg-subtle: #a3a7ad;
  --color-surface-1: #f8f7f5; --color-surface-2: #f2f2f2; --color-surface-3: #e1e1e1;
  --color-border: #ebebeb; --color-border-strong: #d5dae3;
  --color-up: #1f8a65; --color-up-bg: #e8f5ef; --color-down: #cf2d56; --color-down-bg: #fbecef;
  --color-warn: #b7791f; --color-warn-bg: #fdf5e6; --color-info: #2b7fd9; --color-info-bg: #eaf3fd;
  --color-brand: #ff6a08;
  --radius-3xl: 1.5rem;
  --ease-spring: cubic-bezier(.25,1,.5,1);
  --animate-marquee: marquee 40s linear infinite;
  @keyframes marquee { from { transform: translateX(0) } to { transform: translateX(-50%) } }
}
```
Fallback Tailwind v3 (`tailwind.config.ts` → `theme.extend`): `docs/styles/tailwind.v3.extend.ts`.

## 7. Checklist (usar en cada pantalla y en T19)
- [ ] Sólo verde/rojo como colores saturados (+ naranja de marca puntual).
- [ ] Precios en `font-mono tabular-nums`; CLP sin decimales, USD con 2, acciones hasta 6.
- [ ] Cards `rounded-3xl`, borde hairline, sin sombra.
- [ ] Botones pill; `h-11` desktop / `h-9`–`h-11` móvil; target ≥44px.
- [ ] Estados: loading (skeleton), vacío, error con reintento.
- [ ] Costos visibles antes de cualquier confirmación.
- [ ] Ninguna cifra o promesa no verificable; disclaimer presente.
- [ ] Funciona a 360px sin scroll horizontal.
- [ ] Foco visible y navegación por teclado.
- [ ] `prefers-reduced-motion` respetado.
