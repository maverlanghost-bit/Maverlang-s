# T12 — Detalle de acción (`/app/accion/[ticker]`)
Lee: `PROGRESO.md`, `docs/ARQUITECTURA.md` §2.2 (Detalle), §6 (reglas 2 y 6), §7.

Haz:
1. Header: logo, nombre, símbolo + subyacente, favorito, compartir (Web Share API con fallback copiar).
2. Precio grande (PriceText) + variación del rango seleccionado + MarketStatusPill.
3. PriceChart (`lightweight-charts`, área en verde/rojo según signo del rango, sin grid pesado, crosshair que actualiza el precio mostrado) + SegmentedControl `1S 1M 3M 1A Todo`.
4. "Tu posición" (si existe): acciones, valor, P&L.
5. Stats: precio en USD y CLP, variación 24 h, multiplicador vigente, emisor.
6. "Sobre la empresa" (texto breve genérico por ticker en `content/tickers/*.ts`, sin datos financieros inventados) y "Sobre el token": emisor, mint con link a explorador (Solscan), multiplicador, riesgos (link `/legal/riesgos`).
7. Barra CTA fija abajo (móvil) / card lateral (desktop): Comprar · Vender (Vender deshabilitado sin posición). Abren `?operar=comprar|vender` (el TradeSheet se implementa en T13; ahora placeholder).
8. Ticker no permitido → `notFound()` con página 404 propia de la app.

Listo cuando: rangos cambian el gráfico; 404 para `/app/accion/FAKE`.
Al terminar: PROGRESO.md + commit `T12: detalle accion`.
