-- Cierres diarios reales de la acción subyacente (fuente: Yahoo chart, no oficial).
create table if not exists public.underlying_prices (
  underlying text        not null,          -- 'AAPL', 'BRK-B'
  date       date        not null,          -- día de sesión (America/New_York)
  close      numeric(14,4) not null check (close > 0),
  currency   text        not null default 'USD',
  source     text        not null default 'yahoo',
  created_at timestamptz not null default now(),
  primary key (underlying, date)
);
create index if not exists underlying_prices_u_date_idx on public.underlying_prices (underlying, date desc);
-- Igual que price_ticks: solo servidor (service role). El navegador pasa por /api.
alter table public.underlying_prices enable row level security;
revoke all on table public.underlying_prices from public, anon, authenticated;
