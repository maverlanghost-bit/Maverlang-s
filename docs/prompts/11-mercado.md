# T11 — Mercado (`/app`)
Lee: `PROGRESO.md`, `docs/ARQUITECTURA.md` §2.2 (Mercado) y §6 (regla 8).

Haz:
1. Buscador (símbolo, nombre, subyacente; sin acentos/mayúsculas; debounce 150 ms; atajo `/` en desktop).
2. Chips de filtro: Todas · Tecnología · ETFs · Fintech · Consumo · Favoritas. Orden: Popular (orden de config) · Mayor alza · Mayor baja · A–Z.
3. Sección "Más movidas hoy" (top 3 por |variación|, carrusel horizontal de TickerCard) — sólo criterio objetivo.
4. Lista de TickerRow con Sparkline (historial 1W), precio en moneda de preferencia (USD×FX para CLP), ChangeBadge. Link a `/app/accion/[symbol]`. Estrella de favorito (localStorage).
5. MarketStatusPill arriba (desde `/api/market/status`).
6. Skeletons, vacío ("Sin resultados para…"), error con reintento. Estado de filtros en query string.

Listo cuando: buscar "app" deja sólo Apple; filtros/orden/favoritas funcionan.
Al terminar: PROGRESO.md + commit `T11: mercado`.
