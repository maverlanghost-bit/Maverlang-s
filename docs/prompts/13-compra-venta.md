# T13 — Flujo de compra/venta (TradeSheet)
Lee: `PROGRESO.md`, `docs/ARQUITECTURA.md` §4 (Trade*), §6 (reglas 3–5), `docs/DESIGN-SYSTEM.md` §3 (AmountInput, CostBreakdown).

Haz `components/domain/TradeSheet.tsx` (Sheet controlado por `?operar=`):
1. Paso Monto: AmountInput con moneda conmutable (CLP/USDC para comprar; acciones/USDC para vender), chips rápidos, saldo disponible, validación (mínimo [definir en config, p. ej. US$1], saldo insuficiente → CTA "Depositar").
2. Cotización en vivo (debounce 400 ms → `quoteTrade`), countdown de expiración y re-cotización automática.
3. Paso Revisar: resumen grande ("Recibes ≈ 0,0123 acc. de Apple"), CostBreakdown completo (comisión 0% visible, red, rent sólo si aplica, impacto, slippage), aviso fuera de horario si mercado cerrado, link a riesgos.
4. Confirmar → `buildTrade` → firma (mock: espera 800 ms; Privy: `signTransaction` vía adaptador en `lib/auth`) → `submitTrade` → polling `status`.
5. Estados: Firmando… · Enviando… · ¡Listo! (con resumen, links "Ver en cartera" y explorador) · Error (mensajes humanos por `ApiErrorCode`: PRICE_DEVIATION, QUOTE_EXPIRED, INSUFFICIENT_FUNDS, UPSTREAM) con reintentar.
6. Al confirmar: invalidar queries de cartera/saldos/actividad. Probar errores con `mockError`.

Listo cuando: compra y venta mock completas, todos los estados visibles.
Al terminar: PROGRESO.md + commit `T13: compra venta`.
