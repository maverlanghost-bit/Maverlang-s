-- Maverlang — historial real de precios (gráficos reales).
-- Idempotente: se puede volver a ejecutar.
--
-- Los gráficos no inventan curvas: esta tabla guarda observaciones reales del
-- precio spot (US$) por símbolo. Dos fuentes la alimentan:
--   1. El backfill histórico de CoinGecko (hasta 365 días) al sincronizar.
--   2. El grabador periódico (cron ~cada 5 min) que persiste el spot de
--      Jupiter que la app ya consulta para el mercado.
-- `history()` de `prices.live.ts` lee de acá y ya no lanza NOT_IMPLEMENTED.
--
-- Sin RLS: la escribe y la lee sólo el servidor (service role vía el admin
-- client de la capa lib/services/*.supabase.ts). Nunca desde el navegador.

create table if not exists public.price_ticks (
  symbol    text        not null,
  t         timestamptz not null,
  price_usd numeric     not null check (price_usd > 0),
  source    text        not null default 'jupiter',
  created_at timestamptz not null default now(),
  primary key (symbol, t, source)
);

-- Consultas típicas: último tramo de un símbolo, en orden de tiempo.
create index if not exists price_ticks_symbol_t_idx
  on public.price_ticks (symbol, t desc);

-- Para el barrido del backfill (¿qué símbolos ya tienen historia?).
create index if not exists price_ticks_source_idx
  on public.price_ticks (source, symbol);

-- Limpieza: los ticks intradía del grabador viven 90 días; el backfill
-- (source='coingecko') se conserva como base larga. No hay trigger: lo hace
-- una tarea programada cuando exista retención configurada.

-- Tabla de sólo servidor (service role): RLS activo y sin grants para
-- anon/authenticated. El navegador nunca la lee; pasa por /api/tickers/[symbol]/history.
alter table public.price_ticks enable row level security;
revoke all on table public.price_ticks from public, anon, authenticated;
