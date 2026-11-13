-- Maverlang — Copiar carteras: suscripción, cobro, seguimiento y feed (§5.5).
-- NO APLICADA: requiere el sí de Manu (Muelle).
-- La aplica el operador en el SQL Editor DESPUÉS de 0011 (app_flags) y de
-- 0028 (límites). Esta es la migración 0053.
-- Idempotente: se puede volver a ejecutar (create table/index if not exists,
-- create or replace, drop policy/trigger if exists). Las semillas usan
-- on conflict do nothing: una segunda pasada NO enciende un flag que el
-- operador ya cambió.
-- RLS: el usuario lee lo suyo en copy_subscriptions, copy_follows y copy_runs,
-- y escribe SÓLO sus copy_follows (máximo 10 por usuario). copy_subscriptions,
-- billing_events, copy_runs y copy_feed_snapshots los escribe sólo service_role.
-- Sin datos de tarjeta: billing_events guarda sólo el hash del payload.
-- Fechas con now(). Sin pg_catalog.current_date.

-- 1. Suscripción de Copiar. Una fila por usuario (user_id es la clave).
--    La prueba de 7 días se reconoce por trial_ends_at: si ya existe, no se
--    vuelve a otorgar. El estado real lo manda el webhook, nunca el checkout.
create table if not exists public.copy_subscriptions (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan text not null default 'monthly'
    check (plan in ('monthly', 'annual', 'fraccion_pro')),
  status text not null default 'none'
    check (status in ('none', 'pending', 'trial', 'active', 'past_due', 'canceled')),
  provider text not null default 'mercadopago'
    check (provider in ('mercadopago', 'fraccion_pro', 'manual')),
  provider_customer_id text,
  provider_subscription_id text,
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  cancel_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.copy_subscriptions enable row level security;

-- El usuario ve su suscripción; nadie escribe desde el cliente.
drop policy if exists "copy_subscriptions_select_own" on public.copy_subscriptions;
create policy "copy_subscriptions_select_own"
  on public.copy_subscriptions
  for select
  to authenticated
  using (auth.uid() = user_id);

revoke all on table public.copy_subscriptions from public, anon, authenticated;
grant select on table public.copy_subscriptions to authenticated;
grant all on table public.copy_subscriptions to service_role;

create unique index if not exists copy_subscriptions_provider_idx
  on public.copy_subscriptions (provider, provider_subscription_id)
  where provider_subscription_id is not null;

create index if not exists copy_subscriptions_status_idx
  on public.copy_subscriptions (status);

-- 2. Eventos del proveedor de cobro (idempotencia). El índice único por
--    (provider, provider_event_id) es lo que impide procesar dos veces el
--    mismo webhook. No se guardan datos de tarjeta: sólo el hash del cuerpo.
create table if not exists public.billing_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'mercadopago',
  provider_event_id text not null,
  type text not null,
  received_at timestamptz not null default now(),
  payload_hash text,
  processed_at timestamptz
);

alter table public.billing_events enable row level security;

revoke all on table public.billing_events from public, anon, authenticated;
grant all on table public.billing_events to service_role;

create unique index if not exists billing_events_provider_event_idx
  on public.billing_events (provider, provider_event_id);

create index if not exists billing_events_received_idx
  on public.billing_events (received_at desc);

-- 3. Carteras que sigue cada usuario. Guarda SIEMPRE el slug canónico y la
--    versión copiada; el máximo de 10 se valida en el trigger de abajo.
create table if not exists public.copy_follows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  slug text not null,
  version_id text not null,
  weights jsonb not null default '{}'::jsonb,
  account text not null default 'demo'
    check (account in ('demo', 'real')),
  notify boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.copy_follows enable row level security;

drop policy if exists "copy_follows_select_own" on public.copy_follows;
create policy "copy_follows_select_own"
  on public.copy_follows
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "copy_follows_insert_own" on public.copy_follows;
create policy "copy_follows_insert_own"
  on public.copy_follows
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "copy_follows_update_own" on public.copy_follows;
create policy "copy_follows_update_own"
  on public.copy_follows
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "copy_follows_delete_own" on public.copy_follows;
create policy "copy_follows_delete_own"
  on public.copy_follows
  for delete
  to authenticated
  using (auth.uid() = user_id);

revoke all on table public.copy_follows from public, anon, authenticated;
grant select, insert, update, delete on table public.copy_follows to authenticated;
grant all on table public.copy_follows to service_role;

create unique index if not exists copy_follows_user_slug_idx
  on public.copy_follows (user_id, slug);

create index if not exists copy_follows_user_created_idx
  on public.copy_follows (user_id, created_at desc);

-- Tope de 10 carteras por usuario. El lock por usuario evita que dos inserts
-- simultáneos pasen el conteo a la vez. Sólo corre en INSERT: actualizar
-- versión o aviso no cambia el número de filas.
create or replace function public.copy_follows_enforce_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  total integer;
begin
  perform pg_advisory_xact_lock(hashtext(new.user_id::text)::bigint);
  select count(*) into total
  from public.copy_follows
  where user_id = new.user_id;
  if total >= 10 then
    raise exception 'copy_follows_limit'
      using errcode = 'check_violation',
            hint = 'Máximo 10 carteras seguidas por usuario.';
  end if;
  return new;
end;
$$;

revoke all on function public.copy_follows_enforce_limit() from public, anon;
grant execute on function public.copy_follows_enforce_limit() to authenticated, service_role;

drop trigger if exists copy_follows_limit_trigger on public.copy_follows;
create trigger copy_follows_limit_trigger
  before insert on public.copy_follows
  for each row
  execute function public.copy_follows_enforce_limit();

-- 4. Rastro de cada mezcla ejecutada (auditoría; NO reemplaza orders).
--    legs lleva [{ symbol, usd, quote_id, status }] en jsonb.
create table if not exists public.copy_runs (
  id uuid primary key default gen_random_uuid(),
  plan_id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  slug text not null,
  version_id text not null,
  total_usd numeric(14, 2) not null check (total_usd > 0),
  account text not null default 'demo'
    check (account in ('demo', 'real')),
  legs jsonb not null default '[]'::jsonb,
  status text not null default 'started'
    check (status in ('started', 'partial', 'done', 'aborted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.copy_runs enable row level security;

drop policy if exists "copy_runs_select_own" on public.copy_runs;
create policy "copy_runs_select_own"
  on public.copy_runs
  for select
  to authenticated
  using (auth.uid() = user_id);

revoke all on table public.copy_runs from public, anon, authenticated;
grant select on table public.copy_runs to authenticated;
grant all on table public.copy_runs to service_role;

create index if not exists copy_runs_user_created_idx
  on public.copy_runs (user_id, created_at desc);

create index if not exists copy_runs_plan_idx
  on public.copy_runs (plan_id);

-- 5. Último dato bueno del feed firmado, para que un deploy en frío no
--    arranque vacío. La clave que usa el servidor es `snapshot_key` ('index' o
--    'detail:<slug>'); `kind`/`slug`/`body` son columnas GENERADAS que exponen
--    los mismos campos de §5.5 sin duplicar escritura. `payload` es el JSON
--    crudo ya validado. Sólo lo lee y escribe el servidor (lib/copy/feed.ts).
create table if not exists public.copy_feed_snapshots (
  snapshot_key text primary key,
  payload jsonb not null,
  kind text generated always as (
    case when snapshot_key = 'index' then 'index' else 'portfolio' end
  ) stored,
  slug text generated always as (
    case when snapshot_key like 'detail:%' then substr(snapshot_key, 8) else '' end
  ) stored,
  body jsonb generated always as (payload) stored,
  sha256 text,
  version_id text,
  generated_at timestamptz,
  signature_ok boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.copy_feed_snapshots enable row level security;

revoke all on table public.copy_feed_snapshots from public, anon, authenticated;
grant all on table public.copy_feed_snapshots to service_role;

-- 6. Semillas de los interruptores, todos APAGADOS. on conflict do nothing:
--    una segunda pasada no pisa lo que el operador ya cambió.
insert into public.app_flags (key, value)
values
  ('copy_enabled', 'false'::jsonb),
  ('copy_buy_enabled', 'false'::jsonb),
  ('copy_billing_enabled', 'false'::jsonb)
on conflict (key) do nothing;

comment on table public.copy_subscriptions is
  'Copiar: suscripción por usuario (Mercado Pago o Fraccion Pro). Escribe sólo service_role.';
comment on table public.billing_events is
  'Copiar: webhooks de cobro con idempotencia por (provider, provider_event_id). Sin datos de tarjeta.';
comment on table public.copy_follows is
  'Copiar: carteras seguidas por usuario (slug canónico, versión y pesos copiados). Máximo 10.';
comment on table public.copy_runs is
  'Copiar: rastro de mezclas ejecutadas y el quote_id de cada pierna. No reemplaza orders.';
comment on table public.copy_feed_snapshots is
  'Copiar: último dato bueno del feed firmado. Sólo servidor.';
