-- Maverlang — rol admin y flags de producto (M57).
-- NO APLICADA todavía: la aplica el operador DESPUÉS del commit, cuando Manu autorice.
-- Pegar UNA vez en el SQL Editor DESPUÉS de 0002 (conviene después de 0010
-- para que el panel pueda ocultar activos). Idempotente: se puede volver a
-- ejecutar (create table if not exists, create or replace, revoke/grant).
-- Las semillas usan on conflict do nothing: una segunda pasada NO apaga
-- un interruptor que el operador ya cambió.
-- Fechas sin calificar con el catálogo (usa now()).
-- Sin políticas para anon/authenticated: sólo el servidor con la secret key.

-- 1. Quién puede abrir /admin. Una fila por usuario de Auth.
create table if not exists public.app_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  note text
);

alter table public.app_admins enable row level security;

revoke all on table public.app_admins from public, anon, authenticated;

-- 2. is_admin: la consulta el servidor. anon y authenticated no pueden ejecutarla.
create or replace function public.is_admin(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.app_admins
    where user_id = uid
  );
$$;

revoke all on function public.is_admin(uuid) from public, anon, authenticated;
grant execute on function public.is_admin(uuid) to service_role;

-- 3. Interruptores. value es jsonb (boolean). Sin acceso de clientes.
create table if not exists public.app_flags (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

alter table public.app_flags enable row level security;

revoke all on table public.app_flags from public, anon, authenticated;

insert into public.app_flags (key, value)
values
  ('trading_enabled', 'false'::jsonb),
  ('onramp_enabled', 'false'::jsonb),
  ('offramp_enabled', 'false'::jsonb),
  ('signup_enabled', 'true'::jsonb),
  ('beta_only', 'true'::jsonb)
on conflict (key) do nothing;
