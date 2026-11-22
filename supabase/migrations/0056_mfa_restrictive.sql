-- Maverlang — MFA también en la base (P0-4 / AUTH-1).
-- NO APLICADA. Idempotente: se puede volver a ejecutar.
-- Problema: el segundo factor sólo se exigía en Next.js. Con la contraseña de
-- la víctima y la clave pública, un JWT `aal1` leía `profiles` (RUT, teléfono,
-- fecha de nacimiento) y llamaba `update_my_profile` por REST sin pasar por el
-- middleware. Sólo `wallets` revisaba `aal` (0041).
-- Cierre:
--   1. Política RESTRICTIVE `for all to authenticated` con
--      `not public.mfa_step_pending()` en cada tabla de usuario. Una política
--      restrictiva se suma con AND a las permisivas existentes, así que no
--      habilita nada nuevo: sólo corta las sesiones aal1 con TOTP verificado.
--      `service_role` no usa estas políticas (bypass).
--   2. `update_my_profile` y `add_my_consent` (security definer) rechazan al
--      inicio con 42501 `mfa_requerido` si falta el segundo paso.
-- Requiere 0041 (mfa_step_pending), 0046 (última update_my_profile).
-- No volver a ejecutar 0043/0045/0046 después de esta migración: recrean las
-- RPC sin el chequeo. Si pasa, reaplicar 0056.

-- 1. Políticas restrictivas ---------------------------------------------------
do $$
declare
  t text;
  p text;
  tablas constant text[] := array[
    'profiles', 'consents', 'preferences', 'price_alerts', 'external_holdings',
    'user_favorites', 'demo_accounts', 'demo_positions', 'demo_orders',
    'copy_subscriptions', 'copy_runs', 'copy_follows', 'user_limits',
    'beta_users'
  ];
begin
  foreach t in array tablas loop
    if to_regclass(format('public.%I', t)) is null then
      raise notice '0056: la tabla public.% no existe; se omite', t;
      continue;
    end if;
    p := t || '_mfa_restrictive';
    execute format('drop policy if exists %I on public.%I', p, t);
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated '
      || 'using (not public.mfa_step_pending()) '
      || 'with check (not public.mfa_step_pending())',
      p, t
    );
  end loop;
end
$$;

-- 2. update_my_profile: se parte de la definición vigente en la base (0046) y
-- sólo se inserta el chequeo MFA tras el primer `begin` de nivel superior.
-- Todo lo demás (security definer, search_path, grants) queda idéntico.
do $$
declare
  v_def text;
  v_new text;
begin
  select pg_get_functiondef('public.update_my_profile(jsonb)'::regprocedure)
    into v_def;
  if v_def is null then
    raise exception '0056: no existe public.update_my_profile(jsonb); aplicar 0046 antes';
  end if;
  if position('mfa_requerido' in v_def) > 0 then
    raise notice '0056: update_my_profile ya tiene el chequeo MFA';
    return;
  end if;
  v_new := regexp_replace(
    v_def,
    E'\nbegin[ \t]*\r?\n',
    E'\nbegin\n  if public.mfa_step_pending() then\n'
      || E'    raise exception ''mfa_requerido'' using errcode = ''42501'';\n'
      || E'  end if;\n'
  );
  if v_new = v_def then
    raise exception '0056: no se pudo ubicar el begin de update_my_profile';
  end if;
  execute v_new;
end
$$;

revoke all on function public.update_my_profile(jsonb) from public, anon, authenticated;
grant execute on function public.update_my_profile(jsonb) to authenticated;

-- 3. add_my_consent con chequeo MFA. 0057 la vuelve a definir con validación
-- de versión y tope; la definición final es la de 0057 (mantiene este chequeo).
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
  if public.mfa_step_pending() then
    raise exception 'mfa_requerido' using errcode = '42501';
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

revoke all on function public.add_my_consent(text, text) from public, anon, authenticated;
grant execute on function public.add_my_consent(text, text) to authenticated;
