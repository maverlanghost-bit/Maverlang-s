-- Maverlang — topes y validación de escrituras directas del usuario
-- (DB-C, DB-G, DB-K).
-- NO APLICADA. Idempotente: se puede volver a ejecutar.
-- Problema: `price_alerts`, `user_favorites` y `external_holdings` permiten
-- INSERT directo al rol `authenticated` y los topes (20 avisos, 200 favoritas)
-- vivían sólo en la API. Con la clave pública se podían inundar correos,
-- agotar Resend y dejar el cron (limit 2000) sin alcanzar a los demás.
-- `add_my_consent` aceptaba cualquier versión sin tope de filas.
-- Cierre: triggers BEFORE INSERT security definer con tope por usuario (con
-- advisory lock por usuario para que dos inserciones paralelas no lo burlen) y
-- formato de símbolo conservador; `add_my_consent` valida el formato de la
-- versión y topa los consentimientos por usuario y documento.
-- `compliance_config` sólo guarda la versión de la declaración U.S. person, no
-- las de términos/privacidad/riesgos, así que la versión se valida por formato.
-- Mantiene el chequeo MFA de 0056.

-- 1. price_alerts: 20 activos (igual que ACTIVE_ALERT_CAP) y 200 filas en total.
create or replace function public.price_alerts_enforce_caps()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_active integer;
  v_total integer;
begin
  if new.symbol is null or new.symbol !~ '^[A-Za-z0-9.]{1,12}(x|on)$' then
    raise exception 'simbolo_invalido' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('price_alerts:' || new.user_id::text, 0));
  select count(*) filter (where active and triggered_at is null), count(*)
    into v_active, v_total
    from public.price_alerts
   where user_id = new.user_id;
  if v_total >= 200 then
    raise exception 'tope_avisos_total' using errcode = '54000';
  end if;
  if new.active and new.triggered_at is null and v_active >= 20 then
    raise exception 'tope_avisos_activos' using errcode = '54000';
  end if;
  return new;
end;
$$;

revoke all on function public.price_alerts_enforce_caps() from public, anon, authenticated;

drop trigger if exists price_alerts_enforce_caps on public.price_alerts;
create trigger price_alerts_enforce_caps
  before insert on public.price_alerts
  for each row
  execute function public.price_alerts_enforce_caps();

-- 2. user_favorites: 200 (igual que FAVORITES_MAX).
create or replace function public.user_favorites_enforce_caps()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_total integer;
begin
  if new.symbol is null or new.symbol !~ '^[A-Za-z0-9._-]{1,12}$' then
    raise exception 'simbolo_invalido' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('user_favorites:' || new.user_id::text, 0));
  select count(*) into v_total from public.user_favorites where user_id = new.user_id;
  if v_total >= 200 then
    raise exception 'tope_favoritas' using errcode = '54000';
  end if;
  return new;
end;
$$;

revoke all on function public.user_favorites_enforce_caps() from public, anon, authenticated;

drop trigger if exists user_favorites_enforce_caps on public.user_favorites;
create trigger user_favorites_enforce_caps
  before insert on public.user_favorites
  for each row
  execute function public.user_favorites_enforce_caps();

-- 3. external_holdings: 100 posiciones por usuario (la API no define tope;
-- este es el techo de la base).
create or replace function public.external_holdings_enforce_caps()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_total integer;
begin
  if new.ticker is null or new.ticker !~ '^[A-Za-z0-9._-]{1,16}$' then
    raise exception 'simbolo_invalido' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('external_holdings:' || new.user_id::text, 0));
  select count(*) into v_total from public.external_holdings where user_id = new.user_id;
  if v_total >= 100 then
    raise exception 'tope_posiciones' using errcode = '54000';
  end if;
  return new;
end;
$$;

revoke all on function public.external_holdings_enforce_caps() from public, anon, authenticated;

drop trigger if exists external_holdings_enforce_caps on public.external_holdings;
create trigger external_holdings_enforce_caps
  before insert on public.external_holdings
  for each row
  execute function public.external_holdings_enforce_caps();

-- 4. add_my_consent: definición final (MFA de 0056 + versión validada + tope).
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
  v_count integer;
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
  if v_version !~ '^[A-Za-z0-9._-]{1,32}$' then
    raise exception 'version_invalida' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('consents:' || v_uid::text, 0));
  if not exists (
    select 1 from public.consents
     where user_id = v_uid and doc = v_doc and version = v_version
  ) then
    select count(*) into v_count
      from public.consents
     where user_id = v_uid and doc = v_doc;
    if v_count >= 20 then
      raise exception 'tope_consentimientos' using errcode = '54000';
    end if;
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
