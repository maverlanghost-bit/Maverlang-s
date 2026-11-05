-- Maverlang — 0049: la cotización real vive en la reserva compartida (ola 6 / T38).
--
-- NO APLICADA. La pega el operador en el SQL Editor DESPUÉS de 0042/0047.
-- Requiere: 0042 (o la 0042 nueva + 0047) y 0031. Idempotente: se puede volver
-- a ejecutar.
--
-- Por qué existe (hallazgo M-05 de la auditoría 2026-11):
--   la cotización viva del comercio real estaba en un `Map` del proceso
--   (`lib/services/trade.live.ts`). En Vercel cada instancia tiene el suyo, así
--   que la reserva que se cotizaba en una lambda no era la que se ejecutaba en
--   otra: build/submit respondían QUOTE_EXPIRED al azar.
--
--   La fila de `public.trade_reservations` ya es la dueña del dueño, del estado
--   y del vencimiento (0042/0047). Acá se le agregan dos columnas para que
--   también sea dueña del payload de la cotización:
--
--     quote_symbol   text    símbolo que se está operando (traza y diagnóstico)
--     quote_payload  jsonb   parámetros del swap + tx armada + bandera `built`
--
--   Con eso `quote` reserva cupo y guarda la cotización en la MISMA fila;
--   `build`/`submit` la leen desde cualquier instancia. Nada de memoria local.
--
--   Funciones (todas SECURITY INVOKER, sólo `service_role`):
--   1. `save_trade_quote(...)`: escribe el payload SÓLO si la reserva de ese
--      (usuario, requestId) sigue `reserved` y vigente, y sólo la primera vez.
--   2. `claim_trade_quote_build(...)`: compare-and-set de `built` false→true.
--      Sin esto dos builds simultáneos en dos instancias armarían dos
--      transacciones firmables de la misma operación.
--   3. `record_trade_quote_build(...)`: guarda montos efectivos y la tx armada
--      sin firmar, sólo si el claim ya ocurrió y sólo esas cuatro claves.
--   4. `read_trade_quote(...)`: lectura acotada por (usuario, requestId).
--
--   No edita 0042 ni 0047: sólo agrega columnas y funciones. No habilita dinero
--   real: `REAL_EXECUTION_LOCKED` (lib/trade/real-guards.ts) sigue cerrado y las
--   rutas reales siguen respondiendo 503.

-- 1. Columnas del payload en la reserva.
alter table public.trade_reservations
  add column if not exists quote_symbol text;

alter table public.trade_reservations
  add column if not exists quote_payload jsonb;

alter table public.trade_reservations
  drop constraint if exists trade_reservations_quote_payload_check;
alter table public.trade_reservations
  add constraint trade_reservations_quote_payload_check
  check (
    quote_payload is null
    or (
      jsonb_typeof(quote_payload) = 'object'
      and length(quote_payload::text) <= 65536
    )
  );

comment on column public.trade_reservations.quote_symbol is
  'Símbolo de la cotización guardada en esta reserva (ola 6).';
comment on column public.trade_reservations.quote_payload is
  'Cotización real (parámetros del swap, tx armada y bandera built). Sólo service_role.';

-- 2. Escritura del payload. No toca monto, estado ni vencimiento: el cupo y el
--    TTL ya los fijó `reserve_trade_amount` (0042). Sólo la primera escritura:
--    una cotización guardada no se reescribe.
create or replace function public.save_trade_quote(
  p_user_id uuid,
  p_request_id text,
  p_symbol text,
  p_payload jsonb
)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_count integer := 0;
begin
  if p_user_id is null then
    raise exception 'MV_QUOTE_INVALID' using errcode = '22023';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'MV_QUOTE_INVALID' using errcode = '22023';
  end if;
  if length(p_payload::text) > 65536 then
    raise exception 'MV_QUOTE_INVALID' using errcode = '22023';
  end if;

  update public.trade_reservations r
     set quote_symbol = left(btrim(coalesce(p_symbol, '')), 32),
         quote_payload = p_payload,
         updated_at = now()
   where r.user_id = p_user_id
     and r.request_id = btrim(coalesce(p_request_id, ''))
     and r.status = 'reserved'
     and r.expires_at > now()
     and r.quote_payload is null;
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;

revoke all on function public.save_trade_quote(uuid, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.save_trade_quote(uuid, text, text, jsonb)
  to service_role;

-- 3. Claim atómico del armado: una cotización se arma UNA sola vez, también
--    entre instancias. Devuelve false si ya estaba armada, si la reserva dejó
--    de estar activa o si no hay payload.
create or replace function public.claim_trade_quote_build(
  p_user_id uuid,
  p_request_id text
)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_count integer := 0;
begin
  if p_user_id is null then
    raise exception 'MV_QUOTE_INVALID' using errcode = '22023';
  end if;

  update public.trade_reservations r
     set quote_payload = jsonb_set(r.quote_payload, '{built}', 'true'::jsonb, true),
         updated_at = now()
   where r.user_id = p_user_id
     and r.request_id = btrim(coalesce(p_request_id, ''))
     and r.status = 'reserved'
     and r.expires_at > now()
     and r.quote_payload is not null
     and coalesce(r.quote_payload ->> 'built', 'false') = 'false';
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;

revoke all on function public.claim_trade_quote_build(uuid, text)
  from public, anon, authenticated;
grant execute on function public.claim_trade_quote_build(uuid, text)
  to service_role;

-- 4. Persistencia de la tx armada. Sólo cuatro claves: un patch no puede
--    reescribir el dueño, el monto ni la bandera `built`.
create or replace function public.record_trade_quote_build(
  p_user_id uuid,
  p_request_id text,
  p_patch jsonb
)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_count integer := 0;
begin
  if p_user_id is null then
    raise exception 'MV_QUOTE_INVALID' using errcode = '22023';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception 'MV_QUOTE_INVALID' using errcode = '22023';
  end if;

  update public.trade_reservations r
     set quote_payload = r.quote_payload || jsonb_build_object(
           'inAmountUi', p_patch -> 'inAmountUi',
           'outAmountUi', p_patch -> 'outAmountUi',
           'priceUsd', p_patch -> 'priceUsd',
           'builtTransactionBase64', p_patch -> 'builtTransactionBase64'
         ),
         updated_at = now()
   where r.user_id = p_user_id
     and r.request_id = btrim(coalesce(p_request_id, ''))
     and r.status in ('reserved', 'consumed')
     and r.expires_at > now()
     and r.quote_payload is not null
     and coalesce(r.quote_payload ->> 'built', 'false') = 'true';
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;

revoke all on function public.record_trade_quote_build(uuid, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.record_trade_quote_build(uuid, text, jsonb)
  to service_role;

-- 5. Lectura acotada. Devuelve el estado y el vencimiento de la RESERVA junto al
--    payload: el dominio decide con ellos (una `released` no se arma ni se
--    envía) y falla cerrado si el payload no está.
create or replace function public.read_trade_quote(
  p_user_id uuid,
  p_request_id text
)
returns table (
  quote_symbol text,
  quote_payload jsonb,
  quote_status text,
  quote_expires_at timestamptz
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select r.quote_symbol, r.quote_payload, r.status, r.expires_at
    from public.trade_reservations r
   where r.user_id = p_user_id
     and r.request_id = btrim(coalesce(p_request_id, ''))
     and r.quote_payload is not null
   limit 1;
$$;

revoke all on function public.read_trade_quote(uuid, text)
  from public, anon, authenticated;
grant execute on function public.read_trade_quote(uuid, text)
  to service_role;

comment on function public.save_trade_quote(uuid, text, text, jsonb) is
  'Ola 6/T38: guarda la cotización real en su reserva activa, una sola vez.';
comment on function public.claim_trade_quote_build(uuid, text) is
  'Ola 6/T38: claim atómico del armado (built false->true). Una cotización se arma una vez.';
comment on function public.record_trade_quote_build(uuid, text, jsonb) is
  'Ola 6/T38: guarda montos efectivos y la tx sin firmar de una cotización ya reclamada.';
comment on function public.read_trade_quote(uuid, text) is
  'Ola 6/T38: lectura de la cotización real por usuario y requestId.';
