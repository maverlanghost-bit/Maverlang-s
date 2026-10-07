-- Maverlang — refuerzo RLS tras la auditoría (M47).
-- NO APLICADA todavía: la aplica el operador en desarrollo DESPUÉS de 0008
-- (y en el proyecto público en M50). Se puede pegar completa en el SQL Editor.
-- Idempotente: se puede volver a ejecutar sin cambiar el comportamiento.
-- Fechas sin calificar con el catálogo (usa current_date y now()).
--
-- Lo que hace:
-- 1. Reafirma RLS en las 10 tablas de public (0002-0008 ya lo activan).
-- 2. Fija search_path = public, pg_temp en las funciones security definer que
--    traían search_path = '' (handle_new_user con la lógica M43 intacta y
--    handle_new_profile_demo); demo_trade/demo_reset ya lo traen desde 0007.
-- 3. Agrega un trigger que impide a `authenticated` cambiar columnas sensibles
--    propias de profiles (kyc_status, role, is_admin, country_blocked),
--    existan hoy o se agreguen después. service_role sigue pasando.
-- 4. Reafirma revokes/grants para que anon/authenticated tengan exactamente
--    lo de la matriz (docs/SEGURIDAD.md): waitlist y _migration_flags sin nada.

-- 1. RLS en toda tabla de public (idempotente, no cambia datos).
alter table public.profiles enable row level security;
alter table public.consents enable row level security;
alter table public.preferences enable row level security;
alter table public.demo_accounts enable row level security;
alter table public.demo_positions enable row level security;
alter table public.demo_orders enable row level security;
alter table public.assets enable row level security;
alter table public.user_favorites enable row level security;
alter table public.waitlist enable row level security;
alter table public._migration_flags enable row level security;

-- 2a. handle_new_user (misma lógica que 0005_registro_simple.sql): sólo cambia
-- el search_path a public, pg_temp. El trigger de auth la ejecuta como dueño.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  nombre text := nullif(btrim(meta->>'nombre'), '');
  rut text := nullif(btrim(meta->>'rut'), '');
  pais text := upper(nullif(btrim(meta->>'pais'), ''));
  nacimiento date;
  telefono text := nullif(btrim(meta->>'telefono'), '');
  us_flag text := lower(coalesce(meta->>'is_us_person', 'false'));
  us_person boolean := us_flag in ('true', 't', '1', 'yes');
  terms text := nullif(btrim(meta->>'terms_version'), '');
  privacy text := nullif(btrim(meta->>'privacy_version'), '');
  risks text := nullif(btrim(meta->>'risks_version'), '');
  accepted_raw text := nullif(btrim(meta->>'terms_accepted_at'), '');
  accepted_at timestamptz := pg_catalog.now();
  completo boolean := false;
begin
  begin
    nacimiento := nullif(meta->>'fecha_nacimiento', '')::date;
  exception
    when others then
      nacimiento := null;
  end;

  -- La fecha de aceptación vale sólo si parsea y no está en el futuro.
  if accepted_raw is not null then
    begin
      if accepted_raw::timestamptz <= pg_catalog.now() then
        accepted_at := accepted_raw::timestamptz;
      end if;
    exception
      when others then
        accepted_at := pg_catalog.now();
    end;
  end if;

  if pais = 'US' or us_person then
    raise exception 'registro_us_person' using errcode = '42501';
  end if;

  if nombre is not null and char_length(nombre) > 80 then
    nombre := null;
  end if;
  if pais is not null and pais !~ '^[A-Z]{2}$' then
    pais := null;
  end if;
  if telefono is null or telefono !~ '^\+[1-9][0-9]{7,14}$' then
    telefono := null;
  end if;
  if rut is not null and not public.rut_valido(rut) then
    rut := null;
  end if;
  if pais is distinct from 'CL' then
    rut := null;
  end if;

  completo :=
    nombre is not null
    and pais is not null
    and nacimiento is not null
    and nacimiento <= (current_date - interval '18 years')::date
    and telefono is not null
    and (pais is distinct from 'CL' or rut is not null)
    and terms is not null
    and privacy is not null
    and risks is not null;

  insert into public.profiles (
    id,
    email,
    nombre,
    rut,
    pais,
    fecha_nacimiento,
    telefono,
    is_us_person,
    onboarding_completed,
    language,
    display_currency
  ) values (
    new.id,
    new.email,
    nombre,
    rut,
    pais,
    nacimiento,
    telefono,
    false,
    completo,
    'es-CL',
    'CLP'
  )
  on conflict (id) do nothing;

  if terms is not null then
    insert into public.consents (user_id, doc, version, accepted_at)
    values (new.id, 'terminos', terms, accepted_at)
    on conflict (user_id, doc, version) do nothing;
  end if;
  if privacy is not null then
    insert into public.consents (user_id, doc, version, accepted_at)
    values (new.id, 'privacidad', privacy, accepted_at)
    on conflict (user_id, doc, version) do nothing;
  end if;
  if risks is not null then
    insert into public.consents (user_id, doc, version, accepted_at)
    values (new.id, 'riesgos', risks, accepted_at)
    on conflict (user_id, doc, version) do nothing;
  end if;

  return new;
end;
$$;

-- 2b. handle_new_profile_demo (misma lógica que 0003): sólo cambia el search_path.
create or replace function public.handle_new_profile_demo()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.demo_accounts (user_id)
    values (new.id)
    on conflict (user_id) do nothing;
  return new;
end;
$$;

-- 3. Columnas sensibles de profiles: authenticated no las cambia, ni las de
-- hoy ni las que se agreguen después. service_role sigue pasando (admin).
create or replace function public.reject_profiles_sensitive_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  sensitive text[] := array['kyc_status', 'role', 'is_admin', 'country_blocked'];
  col text;
  old_val jsonb;
  new_val jsonb;
  caller_role text := coalesce((auth.jwt() ->> 'role'), '');
begin
  if caller_role in ('service_role', 'supabase_auth_admin') then
    return new;
  end if;
  old_val := to_jsonb(old);
  new_val := to_jsonb(new);
  foreach col in array sensitive loop
    if (old_val ? col) and (new_val ? col)
      and (old_val -> col is distinct from new_val -> col) then
      raise exception 'cambio_no_permitido: %', col;
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists profiles_reject_sensitive_change on public.profiles;
create trigger profiles_reject_sensitive_change
  before update on public.profiles
  for each row
  execute function public.reject_profiles_sensitive_change();

revoke all on function public.reject_profiles_sensitive_change() from public, anon, authenticated;

-- 4. Grants exactos de la matriz (reafirman 0002-0008 sin cambiar el acceso).
revoke all on table public.profiles from public, anon, authenticated;
grant select, update on table public.profiles to authenticated;

revoke all on table public.consents from public, anon, authenticated;
grant select, insert on table public.consents to authenticated;

revoke all on table public.preferences from public, anon, authenticated;
grant select, insert, update on table public.preferences to authenticated;

revoke all on table public.demo_accounts from public, anon, authenticated;
grant select on table public.demo_accounts to authenticated;

revoke all on table public.demo_positions from public, anon, authenticated;
grant select on table public.demo_positions to authenticated;

revoke all on table public.demo_orders from public, anon, authenticated;
grant select on table public.demo_orders to authenticated;

revoke all on table public.assets from public, anon, authenticated;
grant select on table public.assets to anon, authenticated;

revoke all on table public.user_favorites from public, anon, authenticated;
grant select, insert, delete on table public.user_favorites to authenticated;

revoke all on table public.waitlist from public, anon, authenticated;
revoke all on table public._migration_flags from public, anon, authenticated;
grant all on table public._migration_flags to service_role;

revoke all on sequence public.consents_id_seq from public, anon, authenticated;
grant usage, select on sequence public.consents_id_seq to authenticated;
revoke all on sequence public.waitlist_id_seq from public, anon, authenticated;

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.handle_new_profile_demo() from public, anon, authenticated;
revoke all on function public.demo_trade(uuid, text, text, numeric, numeric, numeric) from public, anon, authenticated;
grant execute on function public.demo_trade(uuid, text, text, numeric, numeric, numeric) to service_role;
revoke all on function public.demo_reset(uuid) from public, anon, authenticated;
grant execute on function public.demo_reset(uuid) to service_role;
revoke all on function public.set_updated_at() from public, anon, authenticated;
grant execute on function public.set_updated_at() to authenticated;
revoke all on function public.rut_valido(text) from public, anon, authenticated;
grant execute on function public.rut_valido(text) to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant execute on function public.handle_new_user() to supabase_auth_admin;
  end if;
end $$;
