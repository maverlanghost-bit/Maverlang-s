-- Maverlang — 0043: perfil y consentimientos por RPC (security definer).
-- Cierra C-01: `authenticated` deja de tener UPDATE de tabla sobre `profiles`
-- y INSERT directo sobre `consents`. Las escrituras legítimas pasan por dos
-- funciones que validan auth.uid(), lista blanca de campos, país, edad, RUT y
-- consentimientos. Idempotente: se puede volver a ejecutar.
--
-- No aplicar 0038 después de esta migración: 0043 ya incluye el lockdown y
-- reemplaza su trigger. Si 0038 se ejecuta después, vuelve a crear el trigger
-- sin el bypass de la RPC y rompe el onboarding.

-- 1. RPC de perfil -----------------------------------------------------------

create or replace function public.update_my_profile(p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.profiles%rowtype;
  v_key text;
  v_allowed constant text[] := array[
    'nombre', 'email', 'pais', 'rut', 'fecha_nacimiento', 'telefono',
    'is_us_person', 'onboarding_completed', 'language', 'display_currency',
    'residence_country', 'nationality_country',
    'us_person_declaration_version', 'us_person_declared_at'
  ];
  v_blocked constant text[] := array[
    'US', 'PR', 'GU', 'VI', 'AS', 'MP', 'UM', 'CA', 'GB', 'AU',
    'CU', 'IR', 'KP', 'SY', 'RU', 'BY'
  ];
  v_txt text;
  v_pais text;
  v_onboarding boolean;
  v_residence text;
  v_nationality text;
  v_version text;
  v_declared_at timestamptz;
  v_has_terms boolean;
  v_has_privacy boolean;
begin
  if v_uid is null then
    raise exception 'no_session' using errcode = '42501';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'invalid_patch' using errcode = '22023';
  end if;

  for v_key in select jsonb_object_keys(p_patch) loop
    if not (v_key = any (v_allowed)) then
      raise exception 'campo_no_permitido' using errcode = '22023';
    end if;
  end loop;

  select * into v_row from public.profiles where id = v_uid for update;
  if not found then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;

  -- Textos simples.
  if p_patch ? 'nombre' then
    v_txt := nullif(btrim(p_patch->>'nombre'), '');
    if v_txt is not null and char_length(v_txt) > 80 then
      raise exception 'nombre_largo' using errcode = '23514';
    end if;
  end if;
  if p_patch ? 'email' then
    v_txt := nullif(btrim(p_patch->>'email'), '');
    if v_txt is not null and (char_length(v_txt) > 254 or v_txt !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
      raise exception 'email_invalido' using errcode = '23514';
    end if;
  end if;
  if p_patch ? 'pais' then
    v_txt := nullif(upper(btrim(p_patch->>'pais')), '');
    if v_txt is not null and v_txt !~ '^[A-Z]{2}$' then
      raise exception 'pais_invalido' using errcode = '23514';
    end if;
  end if;
  if p_patch ? 'telefono' then
    v_txt := nullif(btrim(p_patch->>'telefono'), '');
    if v_txt is not null and v_txt !~ '^\+[1-9][0-9]{7,14}$' then
      raise exception 'telefono_invalido' using errcode = '23514';
    end if;
  end if;
  if p_patch ? 'language' and (p_patch->>'language') not in ('es-CL', 'en') then
    raise exception 'language_invalida' using errcode = '23514';
  end if;
  if p_patch ? 'display_currency' and upper(p_patch->>'display_currency') not in ('CLP', 'USD') then
    raise exception 'currency_invalida' using errcode = '23514';
  end if;

  if p_patch ? 'fecha_nacimiento' then
    v_txt := nullif(btrim(p_patch->>'fecha_nacimiento'), '');
    if v_txt is not null then
      if v_txt !~ '^\d{4}-\d{2}-\d{2}$' then
        raise exception 'fecha_invalida' using errcode = '23514';
      end if;
      begin
        if v_txt::date > current_date
          or v_txt::date > (current_date - interval '18 years')::date then
          raise exception 'fecha_invalida' using errcode = '23514';
        end if;
      exception
        when others then
          raise exception 'fecha_invalida' using errcode = '23514';
      end;
    end if;
  end if;

  -- País efectivo del patch (para RUT y bloqueo).
  v_pais := upper(coalesce(
    nullif(btrim(p_patch->>'pais'), ''),
    v_row.pais
  ));

  if p_patch ? 'rut' then
    v_txt := nullif(btrim(p_patch->>'rut'), '');
    if v_txt is not null then
      if char_length(v_txt) > 16 then
        raise exception 'rut_invalido' using errcode = '23514';
      end if;
      if v_pais is distinct from 'CL' then
        raise exception 'rut_solo_cl' using errcode = '23514';
      end if;
      if not public.rut_valido(v_txt) then
        raise exception 'rut_invalido' using errcode = '23514';
      end if;
    end if;
  end if;

  if p_patch ? 'is_us_person' and (p_patch->>'is_us_person')::boolean is true then
    raise exception 'us_person_bloqueado' using errcode = '23514';
  end if;

  -- Onboarding: sólo se enciende con términos y privacidad aceptados.
  v_onboarding := case
    when p_patch ? 'onboarding_completed'
      then coalesce((p_patch->>'onboarding_completed')::boolean, false)
    else coalesce(v_row.onboarding_completed, false)
  end;
  if v_onboarding is true and coalesce(v_row.onboarding_completed, false) is not true then
    select exists (
      select 1 from public.consents c
      where c.user_id = v_uid and c.doc = 'terminos'
        and char_length(btrim(c.version)) > 0
    ) into v_has_terms;
    select exists (
      select 1 from public.consents c
      where c.user_id = v_uid and c.doc = 'privacidad'
        and char_length(btrim(c.version)) > 0
    ) into v_has_privacy;
    if not (v_has_terms and v_has_privacy) then
      raise exception 'faltan_consentimientos' using errcode = '23514';
    end if;
  end if;

  -- Cumplimiento: país bloqueado y cambios después del onboarding.
  v_residence := upper(coalesce(
    nullif(btrim(p_patch->>'residence_country'), ''),
    nullif(btrim(p_patch->>'pais'), ''),
    v_row.residence_country,
    v_row.pais
  ));
  v_nationality := upper(coalesce(
    nullif(btrim(p_patch->>'nationality_country'), ''),
    v_row.nationality_country
  ));
  if v_residence = any (v_blocked) or v_nationality = any (v_blocked) then
    raise exception 'pais_bloqueado' using errcode = '23514';
  end if;

  if coalesce(v_row.onboarding_completed, false) is true then
    if (p_patch ? 'residence_country'
          and upper(coalesce(nullif(btrim(p_patch->>'residence_country'), ''), v_row.residence_country))
              is distinct from v_row.residence_country)
      or (p_patch ? 'nationality_country'
          and upper(coalesce(nullif(btrim(p_patch->>'nationality_country'), ''), v_row.nationality_country))
              is distinct from v_row.nationality_country)
      or (p_patch ? 'is_us_person'
          and (p_patch->>'is_us_person')::boolean is distinct from v_row.is_us_person)
      or (p_patch ? 'us_person_declaration_version'
          and nullif(btrim(p_patch->>'us_person_declaration_version'), '')
              is distinct from v_row.us_person_declaration_version)
    then
      raise exception 'cambio_no_permitido' using errcode = '23514';
    end if;
  end if;

  -- La fecha de la declaración la pone el servidor; el cliente no la puede
  -- retrasar. Si la versión no cambia, se conserva la fecha anterior.
  v_version := case
    when p_patch ? 'us_person_declaration_version'
      then nullif(btrim(p_patch->>'us_person_declaration_version'), '')
    else v_row.us_person_declaration_version
  end;
  v_declared_at := case
    when p_patch ? 'us_person_declaration_version'
      and v_version is distinct from v_row.us_person_declaration_version
      then now()
    else v_row.us_person_declared_at
  end;

  perform set_config('app.profile_write', 'on', true);

  update public.profiles set
    nombre = case when p_patch ? 'nombre' then nullif(btrim(p_patch->>'nombre'), '') else nombre end,
    email = case when p_patch ? 'email' then nullif(btrim(p_patch->>'email'), '') else email end,
    pais = case when p_patch ? 'pais' then nullif(upper(btrim(p_patch->>'pais')), '') else pais end,
    rut = case
      when p_patch ? 'pais' and v_pais is distinct from 'CL' then null
      when p_patch ? 'rut' then nullif(btrim(p_patch->>'rut'), '')
      else rut
    end,
    fecha_nacimiento = case
      when p_patch ? 'fecha_nacimiento' then nullif(btrim(p_patch->>'fecha_nacimiento'), '')::date
      else fecha_nacimiento
    end,
    telefono = case when p_patch ? 'telefono' then nullif(btrim(p_patch->>'telefono'), '') else telefono end,
    is_us_person = case
      when p_patch ? 'is_us_person' then coalesce((p_patch->>'is_us_person')::boolean, false)
      else is_us_person
    end,
    onboarding_completed = v_onboarding,
    language = case when p_patch ? 'language' then p_patch->>'language' else language end,
    display_currency = case when p_patch ? 'display_currency' then upper(p_patch->>'display_currency') else display_currency end,
    residence_country = case
      when p_patch ? 'residence_country' then nullif(upper(btrim(p_patch->>'residence_country')), '')
      else residence_country
    end,
    nationality_country = case
      when p_patch ? 'nationality_country' then nullif(upper(btrim(p_patch->>'nationality_country')), '')
      else nationality_country
    end,
    us_person_declaration_version = v_version,
    us_person_declared_at = v_declared_at,
    updated_at = now()
  where id = v_uid
  returning * into v_row;

  perform set_config('app.profile_write', 'off', true);

  return jsonb_build_object(
    'id', v_row.id,
    'email', v_row.email,
    'nombre', v_row.nombre,
    'rut', v_row.rut,
    'pais', v_row.pais,
    'fecha_nacimiento', v_row.fecha_nacimiento,
    'telefono', v_row.telefono,
    'is_us_person', v_row.is_us_person,
    'onboarding_completed', v_row.onboarding_completed,
    'language', v_row.language,
    'display_currency', v_row.display_currency,
    'created_at', v_row.created_at
  );
end;
$$;

-- 2. RPC de consentimientos --------------------------------------------------

create or replace function public.add_my_consent(p_doc text, p_version text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_doc text := lower(btrim(coalesce(p_doc, '')));
  v_version text := btrim(coalesce(p_version, ''));
  v_row public.consents%rowtype;
begin
  if v_uid is null then
    raise exception 'no_session' using errcode = '42501';
  end if;
  if v_doc not in ('terminos', 'privacidad', 'riesgos') then
    raise exception 'doc_invalido' using errcode = '22023';
  end if;
  if v_version = '' or char_length(v_version) > 64 then
    raise exception 'version_invalida' using errcode = '22023';
  end if;

  insert into public.consents (user_id, doc, version, accepted_at)
  values (v_uid, v_doc, v_version, now())
  on conflict (user_id, doc, version) do nothing;

  select * into v_row
  from public.consents
  where user_id = v_uid and doc = v_doc and version = v_version;

  if not found then
    raise exception 'consent_not_found' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'user_id', v_row.user_id,
    'doc', v_row.doc,
    'version', v_row.version,
    'accepted_at', v_row.accepted_at
  );
end;
$$;

-- 3. Lockdown de grants ------------------------------------------------------

revoke all on table public.profiles from public, anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (nombre, language, display_currency) on table public.profiles to authenticated;

drop policy if exists consents_insert_own on public.consents;
revoke all on table public.consents from public, anon, authenticated;
grant select on table public.consents to authenticated;
revoke all on sequence public.consents_id_seq from public, anon, authenticated;

revoke all on function public.update_my_profile(jsonb) from public, anon, authenticated;
grant execute on function public.update_my_profile(jsonb) to authenticated;
revoke all on function public.add_my_consent(text, text) from public, anon, authenticated;
grant execute on function public.add_my_consent(text, text) to authenticated;

-- 4. Trigger de defensa en profundidad (0038) --------------------------------
-- Se recrea con bypass para la RPC. Si 0038 se ejecuta después, lo pisa y
-- rompe el onboarding: aplicar 0043 al final.

create or replace function public.reject_profiles_client_locked_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  allowed text[] := array['nombre', 'language', 'display_currency', 'updated_at'];
  col text;
  old_val jsonb := to_jsonb(old);
  new_val jsonb := to_jsonb(new);
  caller_role text := coalesce(auth.jwt() ->> 'role', '');
begin
  if current_setting('app.profile_write', true) = 'on' then
    return new;
  end if;
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

revoke all on function public.reject_profiles_client_locked_change() from public, anon, authenticated;
