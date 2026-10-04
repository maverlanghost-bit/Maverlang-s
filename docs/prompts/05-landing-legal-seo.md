# T05 — Landing C: FAQ, CTA, footer, legales, SEO
Lee: `PROGRESO.md`, `docs/ARQUITECTURA.md` §2.1.

Haz:
1. FAQ (Accordion) en `/` (6 preguntas) y `/ayuda` (completa): ¿Qué es una acción tokenizada? ¿Soy dueño de la acción? (no: token que replica el precio, sin derechos de voto) ¿Cómo deposito pesos? ¿Cuánto cuesta? ¿Puedo retirar? ¿Qué pasa si la empresa paga dividendos? ([VERIFICAR] mecánica xStocks) ¿Quién emite los tokens? ¿Está regulado en Chile? (respuesta prudente, [REVISIÓN ABOGADO]).
2. FinalCTA grande ("Abre tu cuenta en 2 minutos") y SiteFooter: columnas Producto/Legal/Contacto, disclaimer de riesgo, "No disponible para personas de EE.UU.", año.
3. `/legal/[doc]` renderiza `content/legal/{terminos,privacidad,riesgos,comisiones}.md` (frontmatter `version`, `updated`). Escribe borradores breves y estructurados con banner "Borrador — [REVISIÓN ABOGADO]". `generateStaticParams`.
4. `/bloqueado` (región no disponible).
5. Metadata: title template, description, OpenGraph (imagen OG generada con `next/og`), `robots.ts`, `sitemap.ts`, favicon/icono simple.

Listo cuando: todas las rutas de marketing navegan sin 404 y Lighthouse visual razonable.
Al terminar: PROGRESO.md + commit `T05: landing legal y SEO`.
