-- Maverlang — registro simple para la demo (M43).
-- NO APLICADA todavía: la aplica el operador en desarrollo.
-- Idempotente: sólo hace `create or replace` del trigger `handle_new_user()`.
-- No toca tablas, RLS ni políticas (siguen las de 0002).
--
-- Cambios respecto a 0002:
-- - `public.consents` guarda `accepted_at` desde `terms_accepted_at` de los
--   metadatos si es una fecha válida y no está en el futuro; si no, `now()`.
-- - Sin versión de términos o de privacidad, no crea esos consentimientos
--   (el registro del cliente lo exige igual).
-- - Mantiene el rechazo de `pais='US'` y el resto del comportamiento actual:
--   los usuarios del flujo completo (con `risks_version`) siguen funcionando.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
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
