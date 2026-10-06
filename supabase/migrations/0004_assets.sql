-- Maverlang — catálogo xStocks automático.
-- Pegar UNA vez en el SQL Editor DESPUÉS de 0003_demo_accounts.sql.
-- No toca 0002 ni 0003: sólo agrega la tabla public.assets.
-- Idempotente: se puede volver a ejecutar.
-- NO aplicar desde la terminal: el operador la pega en el panel.

create table if not exists public.assets (
  symbol text primary key,
  xstocks_id text,
  name text not null,
  underlying text,
  underlying_currency text,
  isin text,
  underlying_isin text,
  exchange_mic text,
  exchange_name text,
  exchange_timezone text,
  mint_solana text unique,
  logo_url text,
  logo_path text,
  category text,
  trading_hours_mode text,
  is_trading_halted boolean not null default false,
  current_period text,
  open_now boolean,
  next_change_at timestamptz,
  limits jsonb,
  jupiter_liquidity_usd numeric,
  curated boolean not null default false,
  enabled boolean not null default true,
  raw jsonb,
  synced_at timestamptz not null default now()
);

create index if not exists assets_curated_idx
  on public.assets (curated);

create index if not exists assets_category_idx
  on public.assets (category);

create index if not exists assets_name_lower_idx
  on public.assets (lower(name));

-- Catálogo público de lectura: cualquiera puede verlo, nadie escribe desde el navegador.
alter table public.assets enable row level security;

drop policy if exists assets_select_public on public.assets;
create policy assets_select_public
  on public.assets
  for select
  to anon, authenticated
  using (true);

revoke all on table public.assets from public, anon, authenticated;
grant select on table public.assets to anon, authenticated;
