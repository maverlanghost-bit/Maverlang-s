-- Maverlang — SEC-01: el usuario no reescribe su cumplimiento.
-- NO APLICADA. La pega el operador en el SQL Editor DESPUÉS de 0029.
-- Idempotente: se puede volver a ejecutar.
-- No toca 0001_init.sql.
--
-- Lo que hace:
-- 1. authenticated pierde el UPDATE de toda la fila de profiles.
--    Solo puede actualizar nombre, language y display_currency
--    (esas tres existen desde 0002). fecha_nacimiento y telefono
--    no entran: no son nombre, idioma ni moneda.
-- 2. Un trigger rechaza, para anon y authenticated, cualquier otro
--    cambio (país, email, rut, wallet, onboarding, declaración
--    U.S. person, kyc_status, role, is_admin, country_blocked, etc.).
--    service_role, el SQL Editor sin JWT y los triggers security definer
--    siguen pasando. Los triggers de 0009 y 0015 se dejan: este cubre
--    el hueco de 0015, que no miraba columnas si el onboarding no
--    estaba completo.
-- 3. consents: se quita el insert directo de authenticated. La lectura
--    de las filas propias se mantiene. handle_new_user y
--    record_us_person_declaration son security definer y siguen
--    insertando como dueño.

-- 1. Privilegios de columna. La política profiles_update_own (0002)
-- sigue limitando la fila al propio id.
revoke all on table public.profiles from public, anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (nombre, language, display_currency)
  on table public.profiles to authenticated;

-- 2. Defensa si alguien vuelve a dar UPDATE de la tabla entera.
create or replace function public.reject_profiles_client_locked_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  -- Solo estas las mueve el cliente. updated_at lo escribe
  -- profiles_set_updated_at; el resto queda congelado.
  allowed text[] := array['nombre', 'language', 'display_currency', 'updated_at'];
  col text;
  old_val jsonb := to_jsonb(old);
  new_val jsonb := to_jsonb(new);
  caller_role text := coalesce(auth.jwt() ->> 'role', '');
begin
  if caller_role not in ('anon', 'authenticated') then
    return new;
  end if;
  for col in select jsonb_object_keys(new_val)
  loop
    if col = any (allowed) then
      continue;
    end if;
    if (old_val -> col) is distinct from (new_val -> col) then
      raise exception 'cambio_no_permitido: %', col;
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists profiles_reject_client_locked_change on public.profiles;
create trigger profiles_reject_client_locked_change
  before update on public.profiles
  for each row
  execute function public.reject_profiles_client_locked_change();

revoke all on function public.reject_profiles_client_locked_change()
  from public, anon, authenticated;

-- 3. consents: sin insert desde el navegador ni desde el JWT del usuario.
drop policy if exists consents_insert_own on public.consents;

revoke all on table public.consents from public, anon, authenticated;
grant select on table public.consents to authenticated;

revoke all on sequence public.consents_id_seq from public, anon, authenticated;
