# T04 — Landing B: secciones de valor
Lee: `PROGRESO.md`, `docs/DISENO-REFERENCIAS.md` §1 (patrones) y §3.

Haz (cada sección `py-20 md:py-28`, `max-w-7xl`, label + H2 + texto corto):
1. `#como-funciona` HowItWorks: 3 pasos numerados "01 Deposita pesos (Khipu, transferencia)" · "02 Elige una acción" · "03 Listo: es tuya, en tu billetera". Cada paso con mini mock (usa componentes de `components/domain`).
2. ProductMock: card grande con tabs (estilo "Give each Bot a job") por ticker → muestra Sparkline + PriceText + botón "Comprar" decorativo.
3. FeatureGrid 2×2: Fracciones desde $1.000 · Tú controlas tus activos (autocustodia) · Costos claros antes de confirmar · Sin papeleo de broker extranjero. [Revisa que cada afirmación sea cierta según ARQUITECTURA §6; si dudas, márcala `TODO-VERIFICAR`].
4. `#costos` CostsSection: tabla Comisión Maverlang 0% (lanzamiento) · Spread/impacto de mercado (variable, se muestra antes de confirmar) · Red Solana (centavos de dólar) · Proveedor de depósito (según proveedor, ver al depositar). Link `/legal/comisiones`.
5. `#seguridad` SecuritySection: autocustodia vía billetera embebida, emisor regulado (xStocks/Backed — [VERIFICAR redacción]), qué NO es (no das derechos de accionista; riesgos) con link a `/legal/riesgos`.
6. Hook `useReveal` (IntersectionObserver) para reveal on scroll; respeta reduced-motion.

Listo cuando: secciones completas, consistentes con el DS, sin promesas no verificables.
Al terminar: PROGRESO.md + commit `T04: landing secciones`.
