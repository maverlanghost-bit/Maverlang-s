-- Maverlang — límites por usuario, lista de beta y semillas (M74).
-- NO APLICADA. La pega el operador en el SQL Editor DESPUÉS de 0027
-- (y después de 0011, de donde vienen app_flags). Idempotente: se puede
-- volver a ejecutar (create table if not exists, on conflict do nothing).
-- Fechas con now(). Sin pg_catalog.current_date.
--
-- Lo que hace:
-- 1. public.user_limits: topes por usuario (null = usa el default de
--    app_flags.limits_default). Escritura sólo service_role.
-- 2. public.beta_users: lista cerrada de la beta. Escritura sólo service_role.
-- 3. Semillas en app_flags: limits_default (jsonb con los tres topes por
--    usuario) y global_daily_usd (tope global del día, en dólares).
-- 4. RLS: cada usuario puede LEER su propia fila (auth.uid() = user_id);
--    nadie escribe desde anon/authenticated (sin políticas de escritura y
--    con revoke + grant select only). El servidor usa la secret key.

-- 1. Topes por usuario.
create table if not exists public.user_limits (
  user_id uuid primary key references auth.users (id) on delete cascade,
  per_order_usd numeric check (per_order_usd is null or per_order_usd > 0),
  daily_usd numeric check (daily_usd is null or daily_usd > 0),
  monthly_usd numeric check (monthly_usd is null or monthly_usd > 0),
  note text,
  updated_at timestamptz not null default now()
);

alter table public.user_limits enable row level security;

-- Lectura de la fila propia; escritura sólo service_role.
create policy "user_limits_select_own"
  on public.user_limits
  for select
  to authenticated
  using (auth.uid() = user_id);

revoke all on table public.user_limits from public, anon, authenticated;
grant select on table public.user_limits to authenticated;

-- 2. Lista de beta.
create table if not exists public.beta_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  invited_by uuid references auth.users (id) on delete set null,
  invited_at timestamptz not null default now(),
  note text
);

alter table public.beta_users enable row level security;

create policy "beta_users_select_own"
  on public.beta_users
  for select
  to authenticated
  using (auth.uid() = user_id);

revoke all on table public.beta_users from public, anon, authenticated;
grant select on table public.beta_users to authenticated;

-- 3. Semillas de defaults (M74). on conflict do nothing: una segunda
-- pasada NO pisa un valor que el operador ya cambió.
insert into public.app_flags (key, value)
values
  (
    'limits_default',
    '{"per_order_usd":200,"daily_usd":500,"monthly_usd":2000}'::jsonb
  ),
  ('global_daily_usd', '10000'::jsonb)
on conflict (key) do nothing;
