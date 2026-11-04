-- Maverlang — 0046: onboarding sólo con declaración no-US versionada,
-- residencia/nacionalidad explícitas y perfil completo.
--
-- DB-03 (revisión independiente): 0045/0046 endurecían `update_my_profile`,
-- pero el alta seguía acreditando el onboarding desde `user_metadata`:
-- `public.handle_new_user` (0015) calculaba `onboarding_completed = completo`
-- con nombre, país, fecha, teléfono, RUT y versiones legales enviadas por el
-- cliente. Un `signUp` con metadata completa creaba un perfil onboarded sin
-- pasar por la RPC y sin una declaración verificada. Esta migración reemplaza
-- ese trigger y garantiza que TODA cuenta nueva (demo, email, OAuth) nazca con
-- `onboarding_completed = false`; el único camino para encenderlo es
-- `update_my_profile`, con evidencia explícita en la misma llamada.
--
-- Reglas nuevas:
--
-- Alta (`handle_new_user`):
--   * Ignora por completo `onboarding_completed` y los campos de cumplimiento
--     del metadata (`is_us_person`, `residence_country`, `nationality_country`,
--     `us_person_declaration_version`, `us_person_declared_at`). No crea
--     consentimiento `us_person` ni evento de declaración desde metadata.
--   * Conserva el alta demo: crea el perfil y el trigger de 0003 crea la cuenta
--     demo; guarda los consentimientos legales (términos/privacidad/riesgos)
--     que el cliente aceptó, igual que antes.
--   * Conserva OAuth: un usuario sin metadata de perfil crea su fila vacía y
--     completa después por la RPC.
--   * Sigue rechazando el alta si el metadata declara un país/nacionalidad
--     bloqueado o `is_us_person=true` (chequeo conservador, no acreditación).
--   * Si el metadata trae `fecha_nacimiento`, se valida en el alta: una fecha
--     ilegible, futura o de una persona menor de 18 años rechaza la cuenta
--     completa (no se crea usuario, ni perfil, ni consentimientos). Sin fecha
--     (demo/paper, OAuth) el alta sigue funcionando igual.
--
-- RPC (`update_my_profile`):
--   * Para encender `onboarding_completed` exige, en esa misma llamada:
--       - respuesta explícita `is_us_person=false` o `us_person_declaration="no"`;
--       - `us_person_declaration_version` igual a la versión vigente en la DB
--         (`public.compliance_config`), no un texto arbitrario del cliente;
--       - `residence_country` y `nationality_country` ISO-2 no bloqueados;
--       - perfil completo: nombre, país, fecha de nacimiento adulta, teléfono
--         E.164 y RUT válido si el país es CL;
--       - consentimientos de términos y privacidad.
--   * La versión que se persiste es siempre la de la DB. La fecha de la
--     declaración la pone el servidor (`now()`); `us_person_declared_at` se
--     acepta por compatibilidad con el cliente actual, pero se ignora.
--   * Antes de completar no se pueden preescribir campos de declaración; así
--     no queda evidencia "de arrastre" que después sólo haya que encender.
--   * Después del onboarding sigue congelado como en 0045.
--
-- Versión vigente y sincronización operativa:
--   * `public.compliance_config.us_person_declaration_version` es la fuente de
--     verdad en DB para las declaraciones nuevas. Se siembra con el valor
--     actual del servidor (`2026-10-draft`).
--   * El valor debe coincidir con `US_PERSON_DECLARATION_VERSION` de
--     `config/compliance.ts` / `lib/env.ts` (`serverEnv`). Al rotar el texto:
--       1) desplegar el nuevo valor en la app;
--       2) ejecutar como service_role:
--          select public.set_us_person_declaration_version('nueva-version');
--       3) ejecutar como service_role:
--          select public.sync_profile_regularization_plan();
--     En la misma ventana de deploy. Un cliente con la versión vieja recibe
--     `version_declaracion_no_vigente` y debe volver a leer/aceptar. Los
--     perfiles ya onboarded con la versión anterior quedan en el plan de
--     regularización para volver a declarar por el flujo server-side.
--
-- Legados:
--   * No se toca ninguna fila existente ni se inventan declaraciones.
--   * `profile_regularization_plan` registra los huecos reales (identidad y
--     cumplimiento) de perfiles ya onboarded. `regularize_legacy_profile`
--     permite cerrarlos server-side con datos explícitos, versión vigente de
--     la DB y fecha del servidor; nunca rellena por defecto.
--   * `regularize_legacy_profile` sólo marca `regularized` cuando esa misma
--     llamada escribió evidencia nueva y el perfil quedó sin huecos. Sin
--     evidencia nueva el plan conserva su estado, y una fila `regularized`
--     cuyo perfil ya no tiene evidencia vigente se reabre a `pending` con
--     `resolved_at = null`: nunca queda una fecha de cierre obsoleta.
--
-- Requiere 0015, 0043, 0044 y 0045 aplicadas. No las modifica. Idempotente:
-- se puede volver a ejecutar; no resiembra ni reabre filas regularizadas.
-- No reaplicar 0015 después de esta migración: volvería a instalar el
-- `handle_new_user` vulnerable que acredita onboarding desde metadata.

-- 0. Versión vigente de la declaración (fuente de verdad en DB) --------------

create table if not exists public.compliance_config (
  singleton boolean primary key default true,
  us_person_declaration_version text not null,
  updated_at timestamptz not null default now(),
  constraint compliance_config_singleton_check check (singleton),
  constraint compliance_config_version_check
    check (char_length(btrim(us_person_declaration_version)) between 1 and 64)
);

insert into public.compliance_config (singleton, us_person_declaration_version)
values (true, '2026-10-draft')
on conflict (singleton) do nothing;

comment on table public.compliance_config is
  'Configuración de cumplimiento en DB. us_person_declaration_version debe coincidir con US_PERSON_DECLARATION_VERSION de config/compliance.ts/lib/env.ts.';
comment on column public.compliance_config.us_person_declaration_version is
  'Versión vigente que la RPC exige y persiste en declaraciones nuevas. Rotarla con set_us_person_declaration_version() junto al deploy de la app.';

drop trigger if exists compliance_config_set_updated_at on public.compliance_config;
create trigger compliance_config_set_updated_at
  before update on public.compliance_config
  for each row
  execute function public.set_updated_at();

alter table public.compliance_config enable row level security;
revoke all on table public.compliance_config from public, anon, authenticated;
grant select, update on table public.compliance_config to service_role;

create or replace function public.current_us_person_declaration_version()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.us_person_declaration_version
    from public.compliance_config c
   where c.singleton;
$$;

comment on function public.current_us_person_declaration_version() is
  'Versión vigente de la declaración no-US. La RPC la usa como única fuente; no acepta la versión del cliente.';

revoke all on function public.current_us_person_declaration_version()
  from public, anon, authenticated;
grant execute on function public.current_us_person_declaration_version()
  to service_role;

create or replace function public.set_us_person_declaration_version(p_version text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_version text := btrim(coalesce(p_version, ''));
begin
  if v_version = '' or char_length(v_version) > 64 then
    raise exception 'version_declaracion_invalida' using errcode = '22023';
  end if;
  if v_version !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$' then
    raise exception 'version_declaracion_invalida' using errcode = '22023';
  end if;

  insert into public.compliance_config (singleton, us_person_declaration_version, updated_at)
  values (true, v_version, now())
  on conflict (singleton) do update
    set us_person_declaration_version = excluded.us_person_declaration_version,
        updated_at = now();

  return jsonb_build_object('us_person_declaration_version', v_version);
end;
$$;

comment on function public.set_us_person_declaration_version(text) is
  'Rota la versión vigente en DB. Sólo service_role; ejecutar junto al deploy de US_PERSON_DECLARATION_VERSION en la app.';

revoke all on function public.set_us_person_declaration_version(text)
  from public, anon, authenticated;
grant execute on function public.set_us_person_declaration_version(text)
  to service_role;

-- 1. Alta: ningún perfil nuevo nace onboarded por metadata -------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_nombre text := nullif(btrim(v_meta->>'nombre'), '');
  v_rut text := nullif(btrim(v_meta->>'rut'), '');
  v_pais text := upper(nullif(btrim(v_meta->>'pais'), ''));
  v_nationality text := upper(nullif(btrim(v_meta->>'nationality_country'), ''));
  v_fecha_raw text := nullif(btrim(v_meta->>'fecha_nacimiento'), '');
  v_nacimiento date;
  v_telefono text := nullif(btrim(v_meta->>'telefono'), '');
  v_us_flag text := lower(coalesce(v_meta->>'is_us_person', 'false'));
  v_us_person boolean := v_us_flag in ('true', 't', '1', 'yes');
  v_terms text := nullif(btrim(v_meta->>'terms_version'), '');
  v_privacy text := nullif(btrim(v_meta->>'privacy_version'), '');
  v_risks text := nullif(btrim(v_meta->>'risks_version'), '');
  v_accepted_raw text := nullif(btrim(v_meta->>'terms_accepted_at'), '');
  v_accepted_at timestamptz := now();
  v_blocked constant text[] := array[
    'US', 'PR', 'GU', 'VI', 'AS', 'MP', 'UM', 'CA', 'GB', 'AU',
    'CU', 'IR', 'KP', 'SY', 'RU', 'BY'
  ];
begin
  -- Fecha declarada en el alta. Si viene, se valida acá y ANTES de escribir
  -- nada: una fecha ilegible o de una persona menor de 18 años aborta el alta
  -- completa (auth.users incluido), así no quedan ni perfil ni consentimientos
  -- de un menor. Sin fecha (demo/paper, OAuth) v_nacimiento queda null y el
  -- alta sigue como antes.
  if v_fecha_raw is not null then
    if v_fecha_raw !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception 'fecha_nacimiento_invalida' using errcode = '23514';
    end if;
    begin
      v_nacimiento := v_fecha_raw::date;
    exception
      when others then
        raise exception 'fecha_nacimiento_invalida' using errcode = '23514';
    end;
    if v_nacimiento > current_date then
      raise exception 'fecha_nacimiento_invalida' using errcode = '23514';
    end if;
    if v_nacimiento > (current_date - interval '18 years')::date then
      raise exception 'registro_menor_edad' using errcode = '42501';
    end if;
  end if;

  if v_accepted_raw is not null then
    begin
      if v_accepted_raw::timestamptz <= now() then
        v_accepted_at := v_accepted_raw::timestamptz;
      end if;
    exception
      when others then
        v_accepted_at := now();
    end;
  end if;

  -- Chequeo conservador del metadata. No acredita nada: sólo evita crear una
  -- cuenta que se declara bloqueada en el propio formulario.
  if v_pais = any (v_blocked)
    or v_nationality = any (v_blocked)
    or v_us_person then
    raise exception 'registro_us_person' using errcode = '42501';
  end if;

  if v_nombre is not null and char_length(v_nombre) > 80 then
    v_nombre := null;
  end if;
  if v_pais is not null and v_pais !~ '^[A-Z]{2}$' then
    v_pais := null;
  end if;
  if v_telefono is null or v_telefono !~ '^\+[1-9][0-9]{7,14}$' then
    v_telefono := null;
  end if;
  if v_rut is not null and not public.rut_valido(v_rut) then
    v_rut := null;
  end if;
  if v_pais is distinct from 'CL' then
    v_rut := null;
  end if;

  -- `onboarding_completed` SIEMPRE false. No se copian residencia,
  -- nacionalidad, versión ni fecha de declaración desde el cliente.
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
    v_nombre,
    v_rut,
    v_pais,
    v_nacimiento,
    v_telefono,
    false,
    false,
    'es-CL',
    'CLP'
  )
  on conflict (id) do nothing;

  -- Consentimientos legales del alta. La demo los necesita para su gate; el
  -- flujo real los vuelve a registrar por RPC. Nunca se crea `us_person` acá.
  if v_terms is not null then
    insert into public.consents (user_id, doc, version, accepted_at)
    values (new.id, 'terminos', v_terms, v_accepted_at)
    on conflict (user_id, doc, version) do nothing;
  end if;
  if v_privacy is not null then
    insert into public.consents (user_id, doc, version, accepted_at)
    values (new.id, 'privacidad', v_privacy, v_accepted_at)
    on conflict (user_id, doc, version) do nothing;
  end if;
  if v_risks is not null then
    insert into public.consents (user_id, doc, version, accepted_at)
    values (new.id, 'riesgos', v_risks, v_accepted_at)
    on conflict (user_id, doc, version) do nothing;
  end if;

  return new;
end;
$$;

comment on function public.handle_new_user() is
  'Crea el perfil SIEMPRE con onboarding_completed=false. Ignora la acreditación de onboarding y los campos de cumplimiento del user_metadata; el onboarding real sólo se completa por update_my_profile.';

revoke all on function public.handle_new_user() from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant execute on function public.handle_new_user() to supabase_auth_admin;
  end if;
end $$;

-- 2. RPC de perfil -----------------------------------------------------------

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
    'is_us_person', 'us_person_declaration', 'onboarding_completed',
    'language', 'display_currency', 'residence_country', 'nationality_country',
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
  v_completion boolean := false;
  v_declaration_requested boolean := false;
  v_language text;
  v_currency text;
  v_residence text;
  v_nationality text;
  v_version text;
  v_declared_at timestamptz;
  v_current_version text;
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

  -- Fuente de verdad de la versión. Si la configuración no existe, completar
  -- falla cerrado; no se acepta la versión del parche.
  v_current_version := public.current_us_person_declaration_version();

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
  -- Si el país deja de ser Chile, el RUT se limpia igual que en 0043/0045.
  if p_patch ? 'pais' and v_pais is distinct from 'CL' then
    v_rut := null;
  end if;

  -- 3. Onboarding: sólo se enciende con términos y privacidad; no se apaga.
  if p_patch ? 'onboarding_completed' then
    if jsonb_typeof(p_patch->'onboarding_completed') <> 'boolean' then
      raise exception 'onboarding_invalido' using errcode = '23514';
    end if;
    v_onboarding := (p_patch->>'onboarding_completed')::boolean;
  end if;
  if v_locked and v_onboarding is not true then
    raise exception 'onboarding_no_reversible' using errcode = '23514';
  end if;
  v_completion := (not v_locked and v_onboarding is true);

  if v_completion then
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

  -- 4. Declaración: dos formas explícitas y equivalentes. `true` y los
  --    valores dudosos se rechazan; `false` nunca se deduce de un campo
  --    ausente. Antes de completar, estos campos no se pueden preescribir.
  v_declaration_requested := (p_patch ? 'is_us_person')
    or (p_patch ? 'us_person_declaration')
    or (p_patch ? 'residence_country')
    or (p_patch ? 'nationality_country')
    or (p_patch ? 'us_person_declaration_version');
  if v_declaration_requested and not v_locked and not v_completion then
    raise exception 'declaracion_solo_al_completar' using errcode = '23514';
  end if;

  if p_patch ? 'is_us_person' then
    if jsonb_typeof(p_patch->'is_us_person') <> 'boolean' then
      raise exception 'is_us_person_invalido' using errcode = '23514';
    end if;
    v_is_us_person := (p_patch->>'is_us_person')::boolean;
    if v_is_us_person is true then
      raise exception 'us_person_bloqueado' using errcode = '23514';
    end if;
  end if;
  if p_patch ? 'us_person_declaration' then
    if jsonb_typeof(p_patch->'us_person_declaration') <> 'string' then
      raise exception 'declaracion_invalida' using errcode = '23514';
    end if;
    v_txt := lower(btrim(coalesce(p_patch->>'us_person_declaration', '')));
    if v_txt = 'no' then
      v_is_us_person := false;
    elsif v_txt = 'yes' then
      raise exception 'us_person_bloqueado' using errcode = '23514';
    else
      raise exception 'declaracion_invalida' using errcode = '23514';
    end if;
  end if;

  if p_patch ? 'residence_country' then
    v_residence := nullif(upper(btrim(p_patch->>'residence_country')), '');
    if v_residence is not null and v_residence !~ '^[A-Z]{2}$' then
      raise exception 'residencia_invalida' using errcode = '23514';
    end if;
  end if;
  if p_patch ? 'nationality_country' then
    v_nationality := nullif(upper(btrim(p_patch->>'nationality_country')), '');
    if v_nationality is not null and v_nationality !~ '^[A-Z]{2}$' then
      raise exception 'nacionalidad_invalida' using errcode = '23514';
    end if;
  end if;

  -- La versión la impone la DB. `us_person_declared_at` se acepta por
  -- compatibilidad con el cliente actual, pero su valor NUNCA se usa.
  if p_patch ? 'us_person_declaration_version' then
    if jsonb_typeof(p_patch->'us_person_declaration_version') not in ('string', 'null') then
      raise exception 'version_declaracion_invalida' using errcode = '23514';
    end if;
    v_txt := nullif(btrim(coalesce(p_patch->>'us_person_declaration_version', '')), '');
    if v_txt is null then
      if v_completion then
        raise exception 'version_declaracion_requerida' using errcode = '23514';
      end if;
      raise exception 'version_declaracion_invalida' using errcode = '23514';
    end if;
    if char_length(v_txt) > 64 then
      raise exception 'version_declaracion_invalida' using errcode = '23514';
    end if;
    if v_completion
      and not (p_patch ? 'is_us_person' or p_patch ? 'us_person_declaration') then
      raise exception 'declaracion_requerida' using errcode = '23514';
    end if;

    if v_locked then
      v_version := v_txt;
      v_declared_at := case
        when v_txt is distinct from v_row.us_person_declaration_version then now()
        else v_row.us_person_declared_at
      end;
    else
      if v_current_version is null then
        raise exception 'version_config_ausente' using errcode = '55000';
      end if;
      if v_txt is distinct from v_current_version then
        raise exception 'version_declaracion_no_vigente' using errcode = '23514';
      end if;
      v_version := v_current_version;
      v_declared_at := now();
    end if;
  end if;

  -- 5. Evidencia obligatoria para completar el onboarding. Se exige en esta
  --    misma llamada: no se acepta encender el flag "de arrastre" con valores
  --    que quedaron de una escritura anterior.
  if v_completion then
    if not (p_patch ? 'is_us_person' or p_patch ? 'us_person_declaration') then
      raise exception 'declaracion_requerida' using errcode = '23514';
    end if;
    if v_is_us_person is not false then
      raise exception 'declaracion_requerida' using errcode = '23514';
    end if;
    if not (p_patch ? 'us_person_declaration_version') or v_version is null then
      raise exception 'version_declaracion_requerida' using errcode = '23514';
    end if;
    if v_current_version is null then
      raise exception 'version_config_ausente' using errcode = '55000';
    end if;
    if v_version is distinct from v_current_version then
      raise exception 'version_declaracion_no_vigente' using errcode = '23514';
    end if;
    if not (p_patch ? 'residence_country') or v_residence is null then
      raise exception 'residencia_requerida' using errcode = '23514';
    end if;
    if not (p_patch ? 'nationality_country') or v_nationality is null then
      raise exception 'nacionalidad_requerida' using errcode = '23514';
    end if;

    -- Perfil completo: no se completa el onboarding con una fila a medias.
    if v_nombre is null then
      raise exception 'nombre_requerido' using errcode = '23514';
    end if;
    if v_pais is null then
      raise exception 'pais_requerido' using errcode = '23514';
    end if;
    if v_fecha is null then
      raise exception 'fecha_requerida' using errcode = '23514';
    end if;
    if v_fecha > (current_date - interval '18 years')::date then
      raise exception 'fecha_invalida' using errcode = '23514';
    end if;
    if v_telefono is null then
      raise exception 'telefono_requerido' using errcode = '23514';
    end if;
    if v_pais = 'CL' and v_rut is null then
      raise exception 'rut_requerido' using errcode = '23514';
    end if;

    -- La declaración se está haciendo ahora. La fecha la pone el servidor.
    v_declared_at := now();
  end if;

  if coalesce(v_pais, '') = any (v_blocked)
    or coalesce(v_residence, '') = any (v_blocked)
    or coalesce(v_nationality, '') = any (v_blocked) then
    raise exception 'pais_bloqueado' using errcode = '23514';
  end if;

  -- 6. Bloqueo de identidad/cumplimiento después del onboarding.
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

-- 3. Permisos del owner (mismo contrato que 0045) ----------------------------

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

revoke all on function public.update_my_profile(jsonb) from public, anon, authenticated;
grant execute on function public.update_my_profile(jsonb) to authenticated;

-- 4. Plan de regularización para perfiles existentes -------------------------
-- No se rellenan columnas de profiles. El plan sólo registra qué evidencia
-- falta y en qué estado va la revisión manual.

create table if not exists public.profile_regularization_plan (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  missing_fields text[] not null,
  status text not null default 'pending',
  plan_version text not null default '0046',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint profile_regularization_plan_status_check
    check (status in ('pending', 'contacted', 'regularized', 'dismissed')),
  constraint profile_regularization_plan_resolved_check
    check ((status in ('regularized', 'dismissed')) = (resolved_at is not null))
);

-- 0046 no está aplicada, pero si se reejecuta sobre una versión previa del
-- plan, se amplía la lista de huecos sin perder filas válidas.
alter table public.profile_regularization_plan
  drop constraint if exists profile_regularization_plan_fields_check;
alter table public.profile_regularization_plan
  add constraint profile_regularization_plan_fields_check
  check (
    cardinality(missing_fields) between 1 and 8
    and missing_fields <@ array[
      'nombre', 'pais', 'fecha_nacimiento', 'telefono', 'rut',
      'us_person_declaration', 'residence_country', 'nationality_country'
    ]::text[]
  );

comment on table public.profile_regularization_plan is
  'Perfiles ya onboarded a los que les falta identidad o evidencia de declaración. No crea ni completa declaraciones: sólo registra la deuda y su estado de regularización.';

create index if not exists profile_regularization_plan_status_idx
  on public.profile_regularization_plan (status, created_at);

drop trigger if exists profile_regularization_plan_set_updated_at
  on public.profile_regularization_plan;
create trigger profile_regularization_plan_set_updated_at
  before update on public.profile_regularization_plan
  for each row
  execute function public.set_updated_at();

alter table public.profile_regularization_plan enable row level security;
revoke all on table public.profile_regularization_plan from public, anon, authenticated;
grant select, insert, update on table public.profile_regularization_plan to service_role;

-- Huecos de cumplimiento de un perfil onboarded. Devuelve {} si no está
-- onboarded o si ya tiene la evidencia. Sólo lo usa el flujo server-side.
create or replace function public.profile_declaration_missing_fields(p_user uuid)
returns text[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select array_remove(array[
      case
        when coalesce(p.is_us_person, true) is not false
          or char_length(btrim(coalesce(p.us_person_declaration_version, ''))) not between 1 and 64
          or p.us_person_declaration_version is distinct from public.current_us_person_declaration_version()
          or p.us_person_declared_at is null
        then 'us_person_declaration'
      end,
      case
        when coalesce(p.residence_country, '') !~ '^[A-Z]{2}$'
          or p.residence_country = any (array[
            'US', 'PR', 'GU', 'VI', 'AS', 'MP', 'UM', 'CA', 'GB', 'AU',
            'CU', 'IR', 'KP', 'SY', 'RU', 'BY'
          ]::text[])
        then 'residence_country'
      end,
      case
        when coalesce(p.nationality_country, '') !~ '^[A-Z]{2}$'
          or p.nationality_country = any (array[
            'US', 'PR', 'GU', 'VI', 'AS', 'MP', 'UM', 'CA', 'GB', 'AU',
            'CU', 'IR', 'KP', 'SY', 'RU', 'BY'
          ]::text[])
        then 'nationality_country'
      end
    ], null)
    from public.profiles p
    where p.id = p_user
      and p.onboarding_completed is true
  ), '{}'::text[]);
$$;

comment on function public.profile_declaration_missing_fields(uuid) is
  'Lista la evidencia de declaración/residencia/nacionalidad que falta en un perfil onboarded. No escribe nada.';

revoke all on function public.profile_declaration_missing_fields(uuid)
  from public, anon, authenticated;
grant execute on function public.profile_declaration_missing_fields(uuid) to service_role;

-- Huecos completos (identidad + cumplimiento) de un perfil onboarded. Evita
-- que un legado sin nombre/teléfono/fecha quede "regularizado" pero atrapado.
create or replace function public.profile_onboarding_gaps(p_user uuid)
returns text[]
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select array_remove(array[
      case
        when p.nombre is null
          or char_length(btrim(p.nombre)) not between 1 and 80
        then 'nombre'
      end,
      case
        when p.pais is null
          or p.pais !~ '^[A-Z]{2}$'
          or p.pais = any (array[
            'US', 'PR', 'GU', 'VI', 'AS', 'MP', 'UM', 'CA', 'GB', 'AU',
            'CU', 'IR', 'KP', 'SY', 'RU', 'BY'
          ]::text[])
        then 'pais'
      end,
      case
        when p.fecha_nacimiento is null
          or p.fecha_nacimiento > (current_date - interval '18 years')::date
        then 'fecha_nacimiento'
      end,
      case
        when p.telefono is null
          or p.telefono !~ '^\+[1-9][0-9]{7,14}$'
        then 'telefono'
      end,
      case
        when p.pais = 'CL'
          and (p.rut is null or not public.rut_valido(p.rut))
        then 'rut'
      end
    ], null) || public.profile_declaration_missing_fields(p.id)
    from public.profiles p
    where p.id = p_user
      and p.onboarding_completed is true
  ), '{}'::text[]);
$$;

comment on function public.profile_onboarding_gaps(uuid) is
  'Huecos reales de identidad y cumplimiento de un perfil onboarded. No escribe nada.';

revoke all on function public.profile_onboarding_gaps(uuid)
  from public, anon, authenticated;
grant execute on function public.profile_onboarding_gaps(uuid) to service_role;

-- Siembra idempotente: sólo inserta perfiles con huecos que aún no están en
-- el plan. No reabre ni pisa estados ya registrados.
create or replace function public.sync_profile_regularization_plan()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_inserted integer;
begin
  insert into public.profile_regularization_plan (user_id, missing_fields)
  select p.id, gaps.missing_fields
  from public.profiles p
  cross join lateral (
    select public.profile_onboarding_gaps(p.id) as missing_fields
  ) gaps
  where p.onboarding_completed is true
    and cardinality(gaps.missing_fields) > 0
  on conflict (user_id) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

comment on function public.sync_profile_regularization_plan() is
  'Agrega al plan los perfiles onboarded con huecos de identidad o evidencia. Idempotente: no reabre filas existentes.';

revoke all on function public.sync_profile_regularization_plan()
  from public, anon, authenticated;
grant execute on function public.sync_profile_regularization_plan() to service_role;

select public.sync_profile_regularization_plan();

-- Vista de seguimiento: incluye filas del plan (aunque ya estén resueltas)
-- y huecos nuevos que todavía no tengan fila. Sólo service_role.
create or replace view public.profile_regularization_status
with (security_invoker = true)
as
select
  p.id as user_id,
  p.onboarding_completed,
  plan.status as plan_status,
  plan.missing_fields as planned_missing_fields,
  gaps.missing_fields as current_missing_fields,
  cardinality(gaps.missing_fields) = 0 as declaration_complete,
  plan.notes,
  plan.created_at as planned_at,
  plan.updated_at as plan_updated_at,
  plan.resolved_at
from public.profiles p
cross join lateral (
  select public.profile_onboarding_gaps(p.id) as missing_fields
) gaps
left join public.profile_regularization_plan plan on plan.user_id = p.id
where p.onboarding_completed is true
  and (plan.user_id is not null or cardinality(gaps.missing_fields) > 0);

comment on view public.profile_regularization_status is
  'Estado actual de los perfiles en regularización: qué falta, estado del plan y si ya tienen identidad y declaración completas.';

revoke all on table public.profile_regularization_status
  from public, anon, authenticated;
grant select on table public.profile_regularization_status to service_role;

-- Cierre del plan. `regularized` exige que el perfil ya tenga identidad y
-- evidencia real; así no se puede cerrar una fila "en verde" sin declaración.
create or replace function public.resolve_profile_regularization(
  p_user uuid,
  p_status text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status text := lower(btrim(coalesce(p_status, '')));
  v_plan public.profile_regularization_plan%rowtype;
begin
  if v_status not in ('pending', 'contacted', 'regularized', 'dismissed') then
    raise exception 'estado_invalido' using errcode = '22023';
  end if;
  if p_user is null then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;

  select * into v_plan
    from public.profile_regularization_plan
   where user_id = p_user
   for update;
  if not found then
    raise exception 'plan_not_found' using errcode = 'P0002';
  end if;

  if v_status = 'regularized' then
    if not exists (
      select 1 from public.profiles
       where id = p_user and onboarding_completed is true
    ) then
      raise exception 'perfil_no_onboarded' using errcode = '23514';
    end if;
    if cardinality(public.profile_onboarding_gaps(p_user)) > 0 then
      raise exception 'perfil_sin_declaracion' using errcode = '23514';
    end if;
  end if;

  update public.profile_regularization_plan
     set status = v_status,
         notes = coalesce(p_notes, notes),
         resolved_at = case
           when v_status in ('regularized', 'dismissed') then now()
           else null
         end
   where user_id = p_user
   returning * into v_plan;

  return jsonb_build_object(
    'user_id', v_plan.user_id,
    'status', v_plan.status,
    'missing_fields', v_plan.missing_fields,
    'resolved_at', v_plan.resolved_at
  );
end;
$$;

comment on function public.resolve_profile_regularization(uuid, text, text) is
  'Actualiza el estado del plan. regularized sólo se acepta si el perfil ya tiene identidad completa y declaración versionada, fecha y residencia/nacionalidad.';

revoke all on function public.resolve_profile_regularization(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.resolve_profile_regularization(uuid, text, text)
  to service_role;

-- 5. Regularización segura de legados ----------------------------------------
-- Server-side (service_role). No acepta una versión inventada: usa la vigente
-- en DB. No rellena nada por defecto: exige declaración explícita, residencia,
-- nacionalidad y, si hacen falta, los datos de identidad. La fecha la pone el
-- servidor. Deja evento de auditoría y cierra el plan.
create or replace function public.regularize_legacy_profile(
  p_user uuid,
  p_is_us_person boolean,
  p_residence_country text,
  p_nationality_country text,
  p_identity jsonb default '{}'::jsonb,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.profiles%rowtype;
  v_key text;
  v_identity jsonb := coalesce(p_identity, '{}'::jsonb);
  v_allowed_identity constant text[] := array[
    'nombre', 'pais', 'rut', 'fecha_nacimiento', 'telefono'
  ];
  v_nombre text;
  v_pais text;
  v_rut text;
  v_fecha date;
  v_telefono text;
  v_residence text;
  v_nationality text;
  v_version text;
  v_declared_at timestamptz;
  v_txt text;
  v_gaps_before text[];
  v_declaration_changed boolean;
  v_identity_changed boolean;
  v_changed boolean;
  v_plan_updated integer := 0;
  v_claims_before text;
  v_gaps_after text[];
  v_plan_prev_status text;
  v_plan_status text;
  v_plan_resolved_at timestamptz;
  v_reopened boolean := false;
begin
  if p_user is null then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;
  if p_is_us_person is null then
    raise exception 'declaracion_requerida' using errcode = '23514';
  end if;
  if p_is_us_person is true then
    raise exception 'us_person_bloqueado' using errcode = '23514';
  end if;
  if p_is_us_person is not false then
    raise exception 'declaracion_invalida' using errcode = '23514';
  end if;

  if jsonb_typeof(v_identity) <> 'object' then
    raise exception 'invalid_patch' using errcode = '22023';
  end if;
  for v_key in select jsonb_object_keys(v_identity) loop
    if not (v_key = any (v_allowed_identity)) then
      raise exception 'campo_no_permitido' using errcode = '22023';
    end if;
  end loop;

  select * into v_row from public.profiles where id = p_user for update;
  if not found then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;
  if coalesce(v_row.onboarding_completed, false) is not true then
    raise exception 'perfil_no_onboarded' using errcode = '23514';
  end if;

  v_version := public.current_us_person_declaration_version();
  if v_version is null then
    raise exception 'version_config_ausente' using errcode = '55000';
  end if;

  v_nombre := v_row.nombre;
  v_pais := v_row.pais;
  v_rut := v_row.rut;
  v_fecha := v_row.fecha_nacimiento;
  v_telefono := v_row.telefono;

  if v_identity ? 'nombre' then
    v_nombre := nullif(btrim(v_identity->>'nombre'), '');
    if v_nombre is not null and char_length(v_nombre) > 80 then
      raise exception 'nombre_largo' using errcode = '23514';
    end if;
  end if;
  if v_identity ? 'pais' then
    v_pais := nullif(upper(btrim(v_identity->>'pais')), '');
    if v_pais is not null and v_pais !~ '^[A-Z]{2}$' then
      raise exception 'pais_invalido' using errcode = '23514';
    end if;
  end if;
  if v_identity ? 'fecha_nacimiento' then
    v_txt := nullif(btrim(v_identity->>'fecha_nacimiento'), '');
    if v_txt is not null then
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
    else
      v_fecha := null;
    end if;
  end if;
  if v_identity ? 'telefono' then
    v_telefono := nullif(btrim(v_identity->>'telefono'), '');
    if v_telefono is not null and v_telefono !~ '^\+[1-9][0-9]{7,14}$' then
      raise exception 'telefono_invalido' using errcode = '23514';
    end if;
  end if;
  if v_identity ? 'rut' then
    v_rut := nullif(btrim(v_identity->>'rut'), '');
    if v_rut is not null then
      if char_length(v_rut) > 16 then
        raise exception 'rut_invalido' using errcode = '23514';
      end if;
      if v_pais is distinct from 'CL' then
        raise exception 'rut_solo_cl' using errcode = '23514';
      end if;
      if not public.rut_valido(v_rut) then
        raise exception 'rut_invalido' using errcode = '23514';
      end if;
    end if;
  end if;
  if v_identity ? 'pais' and v_pais is distinct from 'CL' then
    v_rut := null;
  end if;

  v_residence := upper(btrim(coalesce(p_residence_country, '')));
  if v_residence = '' then
    raise exception 'residencia_requerida' using errcode = '23514';
  end if;
  if v_residence !~ '^[A-Z]{2}$' then
    raise exception 'residencia_invalida' using errcode = '23514';
  end if;
  if v_residence = any (array[
    'US', 'PR', 'GU', 'VI', 'AS', 'MP', 'UM', 'CA', 'GB', 'AU',
    'CU', 'IR', 'KP', 'SY', 'RU', 'BY'
  ]::text[]) then
    raise exception 'pais_bloqueado' using errcode = '23514';
  end if;

  v_nationality := upper(btrim(coalesce(p_nationality_country, '')));
  if v_nationality = '' then
    raise exception 'nacionalidad_requerida' using errcode = '23514';
  end if;
  if v_nationality !~ '^[A-Z]{2}$' then
    raise exception 'nacionalidad_invalida' using errcode = '23514';
  end if;
  if v_nationality = any (array[
    'US', 'PR', 'GU', 'VI', 'AS', 'MP', 'UM', 'CA', 'GB', 'AU',
    'CU', 'IR', 'KP', 'SY', 'RU', 'BY'
  ]::text[]) then
    raise exception 'pais_bloqueado' using errcode = '23514';
  end if;

  if coalesce(v_pais, '') = any (array[
    'US', 'PR', 'GU', 'VI', 'AS', 'MP', 'UM', 'CA', 'GB', 'AU',
    'CU', 'IR', 'KP', 'SY', 'RU', 'BY'
  ]::text[]) then
    raise exception 'pais_bloqueado' using errcode = '23514';
  end if;

  -- Perfil completo: la regularización no puede dejar a la persona atrapada
  -- con un perfil que la RPC rechazaría.
  if v_nombre is null then
    raise exception 'nombre_requerido' using errcode = '23514';
  end if;
  if v_pais is null then
    raise exception 'pais_requerido' using errcode = '23514';
  end if;
  if v_fecha is null then
    raise exception 'fecha_requerida' using errcode = '23514';
  end if;
  if v_fecha > (current_date - interval '18 years')::date then
    raise exception 'fecha_invalida' using errcode = '23514';
  end if;
  if v_telefono is null then
    raise exception 'telefono_requerido' using errcode = '23514';
  end if;
  if v_pais = 'CL' and v_rut is null then
    raise exception 'rut_requerido' using errcode = '23514';
  end if;

  v_gaps_before := public.profile_onboarding_gaps(p_user);
  if cardinality(v_gaps_before) > 0 then
    insert into public.profile_regularization_plan (user_id, missing_fields)
    values (p_user, v_gaps_before)
    on conflict (user_id) do nothing;
  end if;

  v_declaration_changed :=
    v_row.is_us_person is not false
    or v_row.us_person_declaration_version is distinct from v_version
    or v_row.us_person_declared_at is null
    or v_row.residence_country is distinct from v_residence
    or v_row.nationality_country is distinct from v_nationality;
  v_identity_changed :=
    v_nombre is distinct from v_row.nombre
    or v_pais is distinct from v_row.pais
    or v_rut is distinct from v_row.rut
    or v_fecha is distinct from v_row.fecha_nacimiento
    or v_telefono is distinct from v_row.telefono;
  v_changed := v_declaration_changed or v_identity_changed;

  v_declared_at := case
    when v_declaration_changed then now()
    else v_row.us_person_declared_at
  end;

  if v_changed then
    -- El trigger de 0015 mira el rol del JWT. Un operador que ejecuta desde el
    -- SQL Editor (postgres, sin claims) debe poder usar este flujo autorizado.
    v_claims_before := current_setting('request.jwt.claims', true);
    perform set_config(
      'request.jwt.claims',
      jsonb_build_object('role', 'service_role')::text,
      true
    );
    begin
      perform set_config('app.profile_write', 'on', true);
      update public.profiles set
        nombre = v_nombre,
        pais = v_pais,
        rut = v_rut,
        fecha_nacimiento = v_fecha,
        telefono = v_telefono,
        is_us_person = false,
        residence_country = v_residence,
        nationality_country = v_nationality,
        us_person_declaration_version = v_version,
        us_person_declared_at = v_declared_at,
        updated_at = now()
      where id = p_user;
      perform set_config('app.profile_write', 'off', true);
      perform set_config(
        'request.jwt.claims',
        coalesce(v_claims_before, ''),
        true
      );
    exception
      when others then
        perform set_config(
          'request.jwt.claims',
          coalesce(v_claims_before, ''),
          true
        );
        raise;
    end;

  end if;

  -- Estado real del perfil después de la escritura (o del no-op). Es la única
  -- fuente para decidir si el plan puede cerrarse: no se deduce de lo enviado.
  v_gaps_after := public.profile_onboarding_gaps(p_user);

  if v_changed then
    insert into public.compliance_events (user_id, type, data)
    values (
      p_user,
      'profile_regularization',
      jsonb_build_object(
        'version', v_version,
        'residence_country', v_residence,
        'nationality_country', v_nationality,
        'missing_fields_before', to_jsonb(v_gaps_before),
        'missing_fields_after', to_jsonb(v_gaps_after),
        'identity_changed', v_identity_changed,
        'notes', p_notes
      )
    );
  end if;

  -- Estado previo de la fila del plan: decide si hubo reapertura real.
  select plan.status into v_plan_prev_status
    from public.profile_regularization_plan plan
   where plan.user_id = p_user
   for update;

  if v_changed and cardinality(v_gaps_after) = 0 then
    -- Evidencia nueva en esta llamada y perfil sin huecos: recién ahora se
    -- puede declarar regularizado. La fecha es la de esta regularización, no
    -- la de un cierre anterior que ya quedó obsoleto.
    update public.profile_regularization_plan
       set status = 'regularized',
           notes = coalesce(nullif(btrim(p_notes), ''), notes),
           resolved_at = now()
     where user_id = p_user;
    get diagnostics v_plan_updated = row_count;
  elsif cardinality(v_gaps_after) > 0 then
    -- Sin evidencia suficiente no se cierra nada. Si la fila decía
    -- `regularized`, el perfil ya no tiene la evidencia que la sostenía: se
    -- reabre a `pending` y se borra el `resolved_at` viejo. Una fila
    -- `dismissed` es una decisión humana y no se reabre.
    update public.profile_regularization_plan
       set missing_fields = v_gaps_after,
           status = case when status = 'regularized' then 'pending' else status end,
           resolved_at = case when status = 'regularized' then null else resolved_at end,
           notes = coalesce(nullif(btrim(p_notes), ''), notes)
     where user_id = p_user
       and (
         status = 'regularized'
         or (status in ('pending', 'contacted')
             and missing_fields is distinct from v_gaps_after)
       );
    get diagnostics v_plan_updated = row_count;
    v_reopened := v_plan_updated > 0 and v_plan_prev_status = 'regularized';
  end if;

  select plan.status, plan.resolved_at
    into v_plan_status, v_plan_resolved_at
    from public.profile_regularization_plan plan
   where plan.user_id = p_user;

  return jsonb_build_object(
    'user_id', p_user,
    'status', v_plan_status,
    'changed', v_changed,
    'reopened', v_reopened,
    'version', v_version,
    'missing_fields_before', to_jsonb(v_gaps_before),
    'missing_fields_current', to_jsonb(v_gaps_after),
    'plan_updated', v_plan_updated > 0,
    'resolved_at', v_plan_resolved_at
  );
end;
$$;

comment on function public.regularize_legacy_profile(uuid, boolean, text, text, jsonb, text) is
  'Regulariza un perfil ya onboarded con declaración explícita, versión vigente de la DB, residencia/nacionalidad y datos de identidad faltantes. Sólo marca el plan como regularized si esta misma llamada escribió evidencia nueva y el perfil quedó sin huecos; si no, conserva el estado real y reabre con resolved_at=null una fila regularized sin evidencia vigente. No inventa evidencia ni fechas.';

revoke all on function public.regularize_legacy_profile(uuid, boolean, text, text, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.regularize_legacy_profile(uuid, boolean, text, text, jsonb, text)
  to service_role;
