-- Maverlang — avisos de precio por usuario.
-- NO APLICADA. Idempotente: se puede volver a ejecutar.
-- El tope de 20 avisos activos por cuenta lo revisa el API, no esta tabla.
-- Cada persona sólo lee, crea y borra las suyas. El cron (service_role)
-- marca triggered_at. El cliente no actualiza filas.

create table if not exists public.price_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  symbol text not null,
  direction text not null check (direction in ('above', 'below')),
  price_usd numeric(14, 4) not null check (price_usd > 0),
  active boolean not null default true,
  triggered_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists price_alerts_user_id_idx
  on public.price_alerts (user_id);

create index if not exists price_alerts_active_symbol_idx
  on public.price_alerts (active, symbol);

alter table public.price_alerts enable row level security;

drop policy if exists price_alerts_select_own on public.price_alerts;
create policy price_alerts_select_own
  on public.price_alerts
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists price_alerts_insert_own on public.price_alerts;
create policy price_alerts_insert_own
  on public.price_alerts
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists price_alerts_delete_own on public.price_alerts;
create policy price_alerts_delete_own
  on public.price_alerts
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.price_alerts from public, anon, authenticated;
grant select, insert, delete on table public.price_alerts to authenticated;
grant select, update on table public.price_alerts to service_role;
