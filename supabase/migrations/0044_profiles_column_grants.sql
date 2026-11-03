-- Maverlang — 0044: limpieza de grants por columna de profiles/consents.
-- 0043 revoca privilegios de tabla, pero PostgreSQL mantiene los grants por
-- columna (REVOKE ALL ON TABLE no los toca). Si existían grants por columna
-- de una migración/manual anterior, el usuario todavía podía escribir esas
-- columnas. Este script los revoca todos y vuelve a dejar solo:
--   profiles: SELECT + UPDATE (nombre, language, display_currency)
--   consents: SELECT
-- Idempotente.

revoke all on table public.profiles from public, anon, authenticated;
revoke all on table public.consents from public, anon, authenticated;

do $$
declare
  c record;
begin
  for c in
    select column_name
    from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
  loop
    execute format(
      'revoke insert (%I), update (%I) on table public.profiles from authenticated',
      c.column_name, c.column_name
    );
    execute format(
      'revoke insert (%I), update (%I) on table public.profiles from anon',
      c.column_name, c.column_name
    );
    execute format(
      'revoke insert (%I), update (%I) on table public.profiles from public',
      c.column_name, c.column_name
    );
  end loop;
end $$;

grant select on table public.profiles to authenticated;
grant update (nombre, language, display_currency) on table public.profiles to authenticated;

do $$
declare
  c record;
begin
  for c in
    select column_name
    from information_schema.columns
    where table_schema = 'public' and table_name = 'consents'
  loop
    execute format(
      'revoke insert (%I), update (%I) on table public.consents from authenticated',
      c.column_name, c.column_name
    );
    execute format(
      'revoke insert (%I), update (%I) on table public.consents from anon',
      c.column_name, c.column_name
    );
    execute format(
      'revoke insert (%I), update (%I) on table public.consents from public',
      c.column_name, c.column_name
    );
  end loop;
end $$;

grant select on table public.consents to authenticated;
revoke all on sequence public.consents_id_seq from public, anon, authenticated;
