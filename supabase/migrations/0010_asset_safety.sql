-- Maverlang — estado de seguridad por activo (M53).
-- NO APLICADA todavía: la aplica el operador DESPUÉS del commit, cuando Manu autorice.
-- Pegar UNA vez en el SQL Editor DESPUÉS de 0009_rls_hardening.sql.
-- Idempotente: se puede volver a ejecutar (add column if not exists,
-- create table if not exists, drop policy if exists + create policy).
-- Fechas sin calificar con el catálogo (usa now()).
-- Las 50 curadas arrancan con consecutive_passes = 0 (default): nadie queda
-- listado a mano; el listado se gana con 2 corridas (M53/M55). La app sigue
-- leyendo como hoy hasta M54.

-- 1. Columnas de seguridad en public.assets. Ninguna es secreta:
-- la lectura pública del catálogo sigue igual.
alter table public.assets
  add column if not exists safety_status text not null default 'unknown'
    check (safety_status in ('listed', 'watch', 'hidden', 'unknown'));
alter table public.assets
  add column if not exists safety_reasons text[] not null default '{}';
alter table public.assets
  add column if not exists safety_metrics jsonb;
alter table public.assets
  add column if not exists safety_tier text;
alter table public.assets
  add column if not exists safety_checked_at timestamptz;
alter table public.assets
  add column if not exists safety_session text;
alter table public.assets
  add column if not exists consecutive_passes int not null default 0;
alter table public.assets
  add column if not exists consecutive_fails int not null default 0;
alter table public.assets
  add column if not exists listed_at timestamptz;
alter table public.assets
  add column if not exists hidden_at timestamptz;
alter table public.assets
  add column if not exists manual_override text
    check (manual_override in ('force_hide', 'force_list') or manual_override is null);
alter table public.assets
  add column if not exists manual_note text;

create index if not exists assets_safety_status_idx
  on public.assets (safety_status);

-- 2. Corridas de auditoría: una fila por ejecución con --db. Sólo service_role.
create table if not exists public.asset_safety_runs (
  id bigserial primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  session text,
  total int,
  passed int,
  source text,
  notes text
);

-- 3. Eventos por activo y corrida: qué cambió y por qué. Sólo service_role.
create table if not exists public.asset_safety_events (
  id bigserial primary key,
  run_id bigint references public.asset_safety_runs (id) on delete cascade,
  symbol text references public.assets (symbol) on delete cascade,
  result text,
  reasons text[],
  metrics jsonb,
  status_before text,
  status_after text,
  created_at timestamptz not null default now()
);

-- 4. RLS: assets sigue público de lectura; runs y events sin acceso
-- para anon ni authenticated (sólo el servidor con la secret key).
alter table public.assets enable row level security;
alter table public.asset_safety_runs enable row level security;
alter table public.asset_safety_events enable row level security;

drop policy if exists assets_select_public on public.assets;
create policy assets_select_public
  on public.assets
  for select
  to anon, authenticated
  using (true);

revoke all on table public.assets from public, anon, authenticated;
grant select on table public.assets to anon, authenticated;

revoke all on table public.asset_safety_runs from public, anon, authenticated;
revoke all on table public.asset_safety_events from public, anon, authenticated;

revoke all on sequence public.asset_safety_runs_id_seq from public, anon, authenticated;
revoke all on sequence public.asset_safety_events_id_seq from public, anon, authenticated;
