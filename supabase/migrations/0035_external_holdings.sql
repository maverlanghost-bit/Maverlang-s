-- Maverlang — seguimiento de cantidades leídas de una foto.
-- NO APLICADA. Pegar UNA vez en el SQL Editor. Idempotente.
-- No son tokens comprados ni saldos de la billetera: sólo un registro
-- por persona y ticker, con origen 'photo'.
-- Cada persona lee, crea y borra las suyas. No hay update: se reemplaza
-- borrando e insertando. El cliente no guarda la foto.

create table if not exists public.external_holdings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  ticker text not null check (char_length(btrim(ticker)) between 1 and 16),
  quantity numeric not null check (quantity > 0),
  source text not null default 'photo' check (source = 'photo'),
  created_at timestamptz not null default now()
);

create unique index if not exists external_holdings_user_ticker_uidx
  on public.external_holdings (user_id, ticker);

create index if not exists external_holdings_user_created_idx
  on public.external_holdings (user_id, created_at desc);

alter table public.external_holdings enable row level security;

drop policy if exists external_holdings_select_own on public.external_holdings;
create policy external_holdings_select_own
  on public.external_holdings
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists external_holdings_insert_own on public.external_holdings;
create policy external_holdings_insert_own
  on public.external_holdings
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists external_holdings_delete_own on public.external_holdings;
create policy external_holdings_delete_own
  on public.external_holdings
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.external_holdings from public, anon, authenticated;
grant select, insert, delete on table public.external_holdings to authenticated;
