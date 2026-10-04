# T14 — Cartera (`/app/cartera`)
Lee: `PROGRESO.md`, `docs/ARQUITECTURA.md` §4 (Portfolio, Position) y §6 (regla 2).

Haz:
1. Header: valor total (CLP/USD según prefs), P&L total (monto y %; "—" si `null`), SegmentedControl de rango con gráfico de valor (mock).
2. AllocationBar (barra segmentada por posición + USDC disponible, leyenda).
3. Lista PositionRow: logo, nombre, acciones (con multiplicador aplicado; tooltip "incluye ajustes del emisor"), valor, P&L. Link al detalle.
4. "Disponible para invertir" (USDC) con CTA Depositar.
5. Historial de órdenes (de `getActivity` filtrado a buy/sell) con estado y link al explorador.
6. Estado vacío: ilustración simple + "Aún no tienes acciones" + CTA "Explorar mercado".

Listo cuando: los números cuadran con los mocks (suma de posiciones + cash = total).
Al terminar: PROGRESO.md + commit `T14: cartera`.
