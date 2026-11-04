-- Maverlang — 0045: inmutabilidad del perfil después del onboarding.
--
-- Cierra tres huecos de 0043:
--   1. `update_my_profile` permitía `{"onboarding_completed": false}`. Con el
--      flag apagado, una segunda llamada podía cambiar residencia,
--      nacionalidad, declaración U.S. person y el resto de la identidad.
--   2. Aun sin revertir el flag, 0043 no congelaba `pais`, `rut`,
--      `fecha_nacimiento` ni `telefono`; y los valores vacíos podían anular
--      `residence_country`/`nationality_country` sin disparar el chequeo.
--   3. Antes del onboarding aceptaba cualquier `email` del cliente y lo
--      persistía; después lo congelaba. Como `findUserByEmail` busca en
--      `profiles.email`, eso permitía suplantar la identidad lógica de otra
--      persona en el panel admin.
--
-- Regla nueva:
--   * `onboarding_completed` sólo pasa de false a true. Una vez true no se
--     apaga por esta RPC.
--   * El email no lo elige el cliente: la RPC lee `auth.users.email` (el
--     correo confirmado por Supabase Auth) y sólo acepta que el patch traiga
--     ese mismo valor, comparado sin distinguir mayúsculas. Un email distinto
--     se rechaza con `email_no_verificado`. `profiles.email` se sincroniza
--     con auth.users en cada escritura.
--   * Con `onboarding_completed = true`, la RPC no cambia identidad ni
--     cumplimiento: pais, rut, fecha_nacimiento, telefono,
--     is_us_person, residence_country, nationality_country,
--     us_person_declaration_version ni us_person_declared_at. Enviar el mismo
--     valor es un no-op permitido (clientes que mandan el perfil completo).
--     El email es la excepción verificada: sólo cambia si auth.users cambió.
--   * `nombre`, `language` y `display_currency` siguen editables siempre.
--   * Antes del onboarding, la identidad y el cumplimiento se pueden guardar
--     con las mismas validaciones de 0043.
--
-- El "flujo autenticado especial" para corregir identidad/cumplimiento es
-- server-side (service_role) y queda fuera de esta RPC: `authenticated` no
-- tiene UPDATE de tabla ni de columnas críticas (0043/0044).
--
-- Permisos: la RPC y el trigger son SECURITY DEFINER y leen auth.users como
-- su owner (postgres). `authenticated` NO recibe SELECT sobre auth.users. Si
-- el owner no puede leer auth.users, la migración falla cerrada con 42501;
-- no se degrada a confiar en el email del JWT ni en el del cliente.
--
-- Requiere 0043 y 0044 aplicadas. No las modifica. Idempotente: se puede
-- volver a ejecutar. No reconstruye reversiones históricas del flag; sí
-- repara una vez los `profiles.email` que no coincidan con auth.users.

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
  v_nombre text;
  v_email text;
  v_auth_email text;
  v_pais text;
  v_rut text;
  v_fecha date;
  v_telefono text;
  v_is_us_person boolean;
  v_onboarding boolean;
  v_language text;
  v_currency text;
  v_residence text;
  v_nationality text;
  v_version text;
  v_declared_at timestamptz;
  v_locked boolean;
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

  v_locked := coalesce(v_row.onboarding_completed, false);

  -- Email verificado: auth.users es la fuente de verdad. La función es
  -- SECURITY DEFINER y lee la tabla como su owner; authenticated no tiene
  -- SELECT sobre auth.users. Sin fila o sin permiso, falla cerrado.
  begin
    select u.email into v_auth_email
      from auth.users u
     where u.id = v_uid;
  exception
    when insufficient_privilege then
      raise exception 'email_no_verificado' using errcode = '42501';
  end;
  if not found then
    raise exception 'email_no_verificado' using errcode = '42501';
  end if;

  -- Valores efectivos: se parte de la fila actual y se pisa sólo lo enviado.
  v_nombre := v_row.nombre;
  v_email := v_auth_email;
  v_pais := v_row.pais;
  v_rut := v_row.rut;
  v_fecha := v_row.fecha_nacimiento;
  v_telefono := v_row.telefono;
  v_is_us_person := v_row.is_us_person;
  v_onboarding := v_locked;
  v_language := v_row.language;
  v_currency := v_row.display_currency;
  v_residence := v_row.residence_country;
  v_nationality := v_row.nationality_country;
  v_version := v_row.us_person_declaration_version;
  v_declared_at := v_row.us_person_declared_at;

  -- 1. Preferencias y textos editables siempre.
  if p_patch ? 'nombre' then
    v_nombre := nullif(btrim(p_patch->>'nombre'), '');
    if v_nombre is not null and char_length(v_nombre) > 80 then
      raise exception 'nombre_largo' using errcode = '23514';
    end if;
  end if;
  if p_patch ? 'language' then
    v_txt := coalesce(p_patch->>'language', '');
    if v_txt not in ('es-CL', 'en') then
      raise exception 'language_invalida' using errcode = '23514';
    end if;
    v_language := v_txt;
  end if;
  if p_patch ? 'display_currency' then
    v_txt := upper(coalesce(p_patch->>'display_currency', ''));
    if v_txt not in ('CLP', 'USD') then
      raise exception 'currency_invalida' using errcode = '23514';
    end if;
    v_currency := v_txt;
  end if;

  -- 2. Identidad (sólo libre antes del onboarding).
  -- Literales regex estándar con UNA sola barra: PostgreSQL los interpreta
  -- como \s, \+ y \d. No usar E'' ni duplicar barras (cambiaría la semántica).
  if p_patch ? 'email' then
    v_txt := nullif(btrim(p_patch->>'email'), '');
    -- Sólo se acepta el email confirmado de auth.users. Si difiere, se
    -- valida el formato para dar un error útil y luego se falla cerrado.
    if lower(coalesce(v_txt, '')) is distinct from lower(coalesce(v_auth_email, '')) then
      if v_txt is not null and (char_length(v_txt) > 254 or v_txt !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
        raise exception 'email_invalido' using errcode = '23514';
      end if;
      raise exception 'email_no_verificado' using errcode = '42501';
    end if;
    -- Se persiste el valor canónico de auth.users, no el texto del cliente.
    v_email := v_auth_email;
  end if;
  if p_patch ? 'pais' then
    v_pais := nullif(upper(btrim(p_patch->>'pais')), '');
    if v_pais is not null and v_pais !~ '^[A-Z]{2}$' then
      raise exception 'pais_invalido' using errcode = '23514';
    end if;
  end if;
  if p_patch ? 'telefono' then
    v_telefono := nullif(btrim(p_patch->>'telefono'), '');
    if v_telefono is not null and v_telefono !~ '^\+[1-9][0-9]{7,14}$' then
      raise exception 'telefono_invalido' using errcode = '23514';
    end if;
  end if;
  if p_patch ? 'fecha_nacimiento' then
    v_txt := nullif(btrim(p_patch->>'fecha_nacimiento'), '');
    if v_txt is null then
      v_fecha := null;
    else
      if v_txt !~ '^\d{4}-\d{2}-\d{2}$' then
        raise exception 'fecha_invalida' using errcode = '23514';
      end if;
      begin
        v_fecha := v_txt::date;
      exception
        when others then
          raise exception 'fecha_invalida' using errcode = '23514';
      end;
      if v_fecha > current_date
        or v_fecha > (current_date - interval '18 years')::date then
        raise exception 'fecha_invalida' using errcode = '23514';
      end if;
    end if;
  end if;
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
    v_rut := v_txt;
  end if;
  -- Si el país deja de ser Chile, el RUT se limpia igual que en 0043.
  if p_patch ? 'pais' and v_pais is distinct from 'CL' then
    v_rut := null;
  end if;
  if p_patch ? 'is_us_person' then
    v_is_us_person := coalesce((p_patch->>'is_us_person')::boolean, false);
    if v_is_us_person is true then
      raise exception 'us_person_bloqueado' using errcode = '23514';
    end if;
  end if;

  -- 3. Onboarding: sólo se enciende con términos y privacidad; no se apaga.
  if p_patch ? 'onboarding_completed' then
    v_onboarding := coalesce((p_patch->>'onboarding_completed')::boolean, false);
  end if;
  if v_locked and v_onboarding is not true then
    raise exception 'onboarding_no_reversible' using errcode = '23514';
  end if;
  if v_onboarding is true and not v_locked then
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

  -- 4. Cumplimiento. Se valida el valor efectivo, no un fallback que oculte
  --    un vaciado posterior.
  if p_patch ? 'residence_country' then
    v_residence := nullif(upper(btrim(p_patch->>'residence_country')), '');
  end if;
  if p_patch ? 'nationality_country' then
    v_nationality := nullif(upper(btrim(p_patch->>'nationality_country')), '');
  end if;
  if p_patch ? 'us_person_declaration_version' then
    v_txt := nullif(btrim(p_patch->>'us_person_declaration_version'), '');
    if v_txt is distinct from v_row.us_person_declaration_version then
      v_version := v_txt;
      v_declared_at := now();
    else
      v_version := v_row.us_person_declaration_version;
      v_declared_at := v_row.us_person_declared_at;
    end if;
  end if;

  if p_patch ? 'pais' and v_pais = any (v_blocked) then
    raise exception 'pais_bloqueado' using errcode = '23514';
  end if;
  if coalesce(v_residence, v_pais) = any (v_blocked)
    or v_nationality = any (v_blocked) then
    raise exception 'pais_bloqueado' using errcode = '23514';
  end if;

  -- 5. Bloqueo de identidad/cumplimiento después del onboarding.
  --    Compara el valor que se escribiría contra la fila bloqueada, así los
  --    vacíos y los cambios de formato no pueden saltarse la regla.
  --    El email no se congela contra profiles.email: se sincroniza con
  --    auth.users en cada escritura; un cambio verificado de Supabase debe
  --    propagarse. El cliente no puede elegir otro valor (ver bloque 2).
  if v_locked then
    if v_pais is distinct from v_row.pais
      or v_rut is distinct from v_row.rut
      or v_fecha is distinct from v_row.fecha_nacimiento
      or v_telefono is distinct from v_row.telefono
      or v_is_us_person is distinct from v_row.is_us_person
      or v_residence is distinct from v_row.residence_country
      or v_nationality is distinct from v_row.nationality_country
      or v_version is distinct from v_row.us_person_declaration_version
      or v_declared_at is distinct from v_row.us_person_declared_at
    then
      raise exception 'cambio_no_permitido' using errcode = '23514';
    end if;
  end if;

  perform set_config('app.profile_write', 'on', true);

  update public.profiles set
    nombre = v_nombre,
    email = v_email,
    pais = v_pais,
    rut = v_rut,
    fecha_nacimiento = v_fecha,
    telefono = v_telefono,
    is_us_person = v_is_us_person,
    onboarding_completed = v_onboarding,
    language = v_language,
    display_currency = v_currency,
    residence_country = v_residence,
    nationality_country = v_nationality,
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

-- 6. Permisos del owner y sincronización con Supabase Auth -------------------
-- La RPC y el trigger leen auth.users como SECURITY DEFINER. No se otorga
-- SELECT a authenticated: el owner (rol que aplica esta migración) lo necesita.
-- Si falta, la migración falla cerrada en vez de dejar la RPC a medias.

do $$
begin
  if not has_table_privilege(current_user, 'auth.users', 'select') then
    raise exception 'update_my_profile: el owner necesita SELECT sobre auth.users'
      using errcode = '42501';
  end if;
  if not has_table_privilege(current_user, 'public.profiles', 'update') then
    raise exception 'update_my_profile: el owner necesita UPDATE sobre public.profiles'
      using errcode = '42501';
  end if;
end $$;

-- Supabase Auth actualiza auth.users.email cuando el cambio de correo queda
-- confirmado. Este trigger mantiene profiles.email sincronizado en el mismo
-- instante, sin esperar a que el usuario vuelva a guardar el perfil.
create or replace function public.sync_profile_email_from_auth()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform set_config('app.profile_write', 'on', true);
  update public.profiles
     set email = new.email,
         updated_at = now()
   where id = new.id
     and email is distinct from new.email;
  perform set_config('app.profile_write', 'off', true);
  return new;
end;
$$;

revoke all on function public.sync_profile_email_from_auth() from public, anon, authenticated;

drop trigger if exists on_auth_user_email_updated on auth.users;
create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.sync_profile_email_from_auth();

-- Reparación única de filas existentes: cualquier email forjado o quedado
-- atrás por un cambio de Supabase se reemplaza por el confirmado en auth.users.
-- No toca filas que ya coinciden. Es idempotente.
update public.profiles p
   set email = u.email,
       updated_at = now()
  from auth.users u
 where u.id = p.id
   and p.email is distinct from u.email;

revoke all on function public.update_my_profile(jsonb) from public, anon, authenticated;
grant execute on function public.update_my_profile(jsonb) to authenticated;
