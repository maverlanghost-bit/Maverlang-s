-- Maverlang — SEC-11 y SEC-12.
-- NO APLICADA. La pega el operador en el SQL Editor DESPUÉS de 0030.
-- Idempotente. No toca 0001_init.sql.
--
-- SEC-11. orders, crypto_deposits, wallet_movements y
-- wallet_reconciliations tienen RLS y ninguna política (niegan por
-- defecto). Este archivo repite el revoke de 0010 por si el proyecto
-- todavía trae GRANT ALL en los privilegios por defecto, y fuerza RLS
-- para que el dueño no se lo salte. service_role tiene BYPASSRLS y
-- sigue leyendo y escribiendo (el servidor usa ese rol).
--
-- SEC-12. No se limita anon a safety_status = 'listed'.
-- lib/catalog/assets.ts lee public.assets con la clave pública, sin
-- filtrar estado, y necesita watch, unknown y hidden (la ficha y la
-- cotización piden hidden con allowHidden). Hoy casi no hay filas
-- listed: un filtro así vacía el mercado.
-- Tampoco se quita safety_metrics: el mismo select la pide
-- (tipo de producto y costo de compra). Si anon no puede verla,
-- PostgREST rechaza la petición entera.
-- Sí se esconden manual_note y manual_override, que el catálogo no
-- lee y el panel escribe con service_role. La vista assets_public
-- repite esas columnas públicas.

-- 1. Tablas de sólo servidor.
alter table public.orders enable row level security;
alter table public.orders force row level security;
revoke all on table public.orders from public, anon, authenticated;

alter table public.crypto_deposits enable row level security;
alter table public.crypto_deposits force row level security;
revoke all on table public.crypto_deposits from public, anon, authenticated;

alter table public.wallet_movements enable row level security;
alter table public.wallet_movements force row level security;
revoke all on table public.wallet_movements from public, anon, authenticated;

alter table public.wallet_reconciliations enable row level security;
alter table public.wallet_reconciliations force row level security;
revoke all on table public.wallet_reconciliations from public, anon, authenticated;

-- 2. Catálogo: mismas filas, sin las notas de admin.
revoke all on table public.assets from public, anon, authenticated;
grant select (
  symbol,
  xstocks_id,
  name,
  underlying,
  underlying_currency,
  isin,
  underlying_isin,
  exchange_mic,
  exchange_name,
  exchange_timezone,
  mint_solana,
  logo_url,
  logo_path,
  category,
  trading_hours_mode,
  is_trading_halted,
  current_period,
  open_now,
  next_change_at,
  limits,
  jupiter_liquidity_usd,
  curated,
  enabled,
  raw,
  synced_at,
  issuer,
  company_ticker,
  safety_status,
  safety_reasons,
  safety_metrics,
  safety_tier,
  safety_checked_at,
  safety_session,
  consecutive_passes,
  consecutive_fails,
  listed_at,
  hidden_at
) on table public.assets to anon, authenticated;

drop policy if exists assets_select_public on public.assets;
create policy assets_select_public
  on public.assets
  for select
  to anon, authenticated
  using (true);

create or replace view public.assets_public
with (security_invoker = true) as
select
  symbol,
  xstocks_id,
  name,
  underlying,
  underlying_currency,
  isin,
  underlying_isin,
  exchange_mic,
  exchange_name,
  exchange_timezone,
  mint_solana,
  logo_url,
  logo_path,
  category,
  trading_hours_mode,
  is_trading_halted,
  current_period,
  open_now,
  next_change_at,
  limits,
  jupiter_liquidity_usd,
  curated,
  enabled,
  raw,
  synced_at,
  issuer,
  company_ticker,
  safety_status,
  safety_reasons,
  safety_metrics,
  safety_tier,
  safety_checked_at,
  safety_session,
  consecutive_passes,
  consecutive_fails,
  listed_at,
  hidden_at
from public.assets;

revoke all on table public.assets_public from public, anon, authenticated;
grant select on table public.assets_public to anon, authenticated;
