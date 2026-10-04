# T03 — Landing A: header, hero, cinta de tickers
Lee: `PROGRESO.md`, `docs/DISENO-REFERENCIAS.md` §1 y §4, `docs/DESIGN-SYSTEM.md` §4.

Haz en `components/landing/` y `app/(marketing)/`:
1. `(marketing)/layout.tsx` con SiteHeader (fijo, h-16, fondo blanco/80 + backdrop-blur al hacer scroll, logo texto con punto naranja de marca, links: Cómo funciona · Costos · Seguridad · Ayuda, CTA pill "Abrir app" → `/app`; menú móvil en Sheet).
2. Hero centrado: AnnouncementPill ("Comisión 0% en el lanzamiento • Ver costos"), H1 (propuesta: "Acciones de EE.UU. desde $1.000"), subtítulo 1 línea ("Compra fracciones de Apple, NVIDIA y más con pesos chilenos."), CTAs "Crear cuenta" (primary → `/app`) y "Cómo funciona" (secondary → `#como-funciona`). Debajo, una card ivory `rounded-3xl` con un mock de TickerRows (datos estáticos de `lib/mocks/landing.ts`, marcados "Precios ilustrativos").
3. TickerMarquee: cinta infinita de símbolos + variación (mismos datos mock), pausa en hover, `aria-hidden` con alternativa accesible.
4. Micro-labels estilo SpaceX (`.label`) sobre secciones. Reveal escalonado del hero.
Copy alternativo en comentarios para que Manu elija. Nada de cifras de usuarios/volumen.

Listo cuando: hero impecable en 360/768/1280, header con blur, marquee fluido.
Al terminar: PROGRESO.md + commit `T03: landing hero`.
