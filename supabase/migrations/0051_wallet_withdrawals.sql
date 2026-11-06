-- 0051 — Libro de retiros de billetera con reserva atómica (auditoría D-02).
--
-- NO APLICADA. La pega el operador en el SQL Editor DESPUÉS de 0050.
-- Idempotente: se puede volver a ejecutar (create table/index if not exists,
-- create or replace function, revoke/grant y comment).
--
-- Por qué existe (D-02 del handoff de auditoría):
--   El retiro armaba la transacción y la devolvía al cliente sin dejar rastro
--   en el servidor. Sin un libro, dos requests simultáneos podían gastar dos
--   veces el mismo cupo, un reintento del cliente podía firmar y enviar el
--   mismo retiro dos veces, y no había forma de saber qué transacción se armó,
--   para qué monto y con qué tope. Esta tabla es la fuente de verdad:
--
--   - Reserva atómica: `reserve_wallet_withdrawal` toma locks de asesoramiento
--     (global primero, usuario después, mismo orden que 0047), valida topes
--     vigentes y, sólo si cabe, inserta la fila en estado `reserved`. La
--     transacción armada se guarda (`built_transaction_base64`) para que el
--     envío sea el mismo que se validó.
--   - Un solo libro vivo por usuario: el índice único parcial
--     `wallet_withdrawals_one_reserved_idx` hace imposible acumular reservas
--     especulativas. Una reserva nueva libera la anterior del mismo usuario;
--     sin eso, tres retiros de US$200 agotaban el tope diario sin retirar nada.
--   - Topes por operación, diarios, mensuales y global diario: se leen de
--     `public.user_limits` (fila propia) y de `app_flags`
--     (`limits_default`, `global_daily_usd`), con las mismas ventanas
--     America/Santiago que las reservas de trading.
--   - Idempotencia por `request_id`: repetir la misma reserva activa devuelve
--     la fila existente en vez de crear otra; repetirla con otro monto,
--     destino o referencia es `MV_WITHDRAWAL_CONFLICT`.
--   - Ciclo de vida explícito: `reserved` → `submitted` → `confirmed` |
--     `failed`, más `expired` y `released`. `claim_wallet_withdrawal_submit`
--     sólo permite reclamar una reserva vigente una vez; finalizar es un
--     UPDATE condicional que devuelve false si ya no había nada que mover.
--
-- Por qué servicios y no políticas RLS: el cliente nunca escribe el libro.
-- Las funciones son SECURITY INVOKER y sólo `service_role` tiene EXECUTE y
-- DML, así que no se escala privilegio desde la base. anon/authenticated no
-- leen ni escriben nada (sin políticas + revoke).
--
-- Comprobación (SQL Editor), después de aplicar:
--   select column_name from information_schema.columns
--     where table_schema = 'public' and table_name = 'wallet_withdrawals'
--     order by ordinal_position;
--   select proname, prosecdef from pg_proc
--     where pronamespace = 'public'::regnamespace
--       and proname like '%wallet_withdrawal%'
--     order by proname;

-- 1. Libro de retiros. No se borran filas: son traza de auditoría y respaldan
--    la conciliación on-chain del retiro.
create table if not exists public.wallet_withdrawals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  request_id text not null,
  reference text not null unique,
  mint text not null,
  symbol text not null,
  source_address text not null,
  destination_address text not null,
  amount_ui numeric not null check (amount_ui > 0),
  amount_usd numeric(18,2) not null check (amount_usd > 0),
  built_transaction_base64 text not null,
  status text not null default 'reserved'
    check (status in ('reserved', 'submitted', 'confirmed', 'failed', 'expired', 'released')),
  signature text,
  error text,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  confirmed_at timestamptz,
  unique (user_id, request_id)
);

-- Historial del usuario (pantalla de movimientos y conciliación).
create index if not exists wallet_withdrawals_user_created_idx
  on public.wallet_withdrawals (user_id, created_at desc);

-- Reservas y envíos vivos: es lo que suman los topes y lo que se barre al
-- vencer. Parcial para no recorrer el histórico.
create index if not exists wallet_withdrawals_active_user_idx
  on public.wallet_withdrawals (user_id, expires_at)
  where status in ('reserved', 'submitted');

-- Una sola reserva especulativa por usuario. La reserva nueva reemplaza a la
-- anterior; si el código llamara mal, la base lo impide igual.
create unique index if not exists wallet_withdrawals_one_reserved_idx
  on public.wallet_withdrawals (user_id)
  where status = 'reserved';

alter table public.wallet_withdrawals enable row level security;
alter table public.wallet_withdrawals force row level security;

-- Sin políticas: el libro lo escribe sólo el servidor con service_role
-- (BYPASSRLS), igual que trade_reservations (0047) y wallet_link_challenges
-- (0050). El cliente lee su historial por /api/*, nunca por PostgREST.
revoke all on table public.wallet_withdrawals from public, anon, authenticated;
-- Explícito para no depender de los privilegios por defecto del proyecto:
-- las funciones SECURITY INVOKER corren como service_role y necesitan estos
-- permisos incluso en un PostgreSQL sin los defaults de Supabase.
grant select, insert, update on table public.wallet_withdrawals to service_role;

comment on table public.wallet_withdrawals is
  'Libro de retiros con reserva atómica: una reserva viva por usuario, topes por operación/día/mes/global y transacción armada guardada. Escritura sólo service_role (D-02).';
comment on column public.wallet_withdrawals.request_id is
  'Idempotencia del cliente: repetir el mismo requestId devuelve la reserva activa en vez de crear otra.';
comment on column public.wallet_withdrawals.reference is
  'Referencia única del retiro (cotización/origen). Choca con otra fila = MV_WITHDRAWAL_CONFLICT, nunca se reutiliza.';
comment on column public.wallet_withdrawals.built_transaction_base64 is
  'Transacción exacta que se validó contra los topes. Se envía tal cual: lo que se firma es lo que se reservó.';
comment on column public.wallet_withdrawals.status is
  'reserved = cupo retenido y transacción entregada; submitted = firma recibida; confirmed/failed = resultado on-chain; expired/released = cupo devuelto.';
comment on column public.wallet_withdrawals.expires_at is
  'Vencimiento de la reserva. Una reserva vencida no cuenta cupo pero tampoco se puede reclamar: hay que reservar de nuevo.';
comment on column public.wallet_withdrawals.confirmed_at is
  'Se marca sólo al finalizar como confirmed: la conciliación no depende de updated_at.';

-- 2. Reserva atómica. Locks en el mismo orden que 0047 (global y después
--    usuario) para que ningún camino pueda quedar en deadlock con el trading.
--    SECURITY INVOKER: sólo service_role tiene EXECUTE y ya tiene BYPASSRLS.
create or replace function public.reserve_wallet_withdrawal(
  p_user_id uuid,
  p_request_id text,
  p_reference text,
  p_mint text,
  p_symbol text,
  p_source_address text,
  p_destination_address text,
  p_amount_ui numeric,
  p_amount_usd numeric,
  p_built_tx text,
  p_expires_at timestamptz
)
returns table (withdrawal_id uuid, reserved_expires_at timestamptz)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_request_id text := btrim(coalesce(p_request_id, ''));
  v_reference text := btrim(coalesce(p_reference, ''));
  v_mint text := btrim(coalesce(p_mint, ''));
  v_symbol text := btrim(coalesce(p_symbol, ''));
  v_source text := btrim(coalesce(p_source_address, ''));
  v_destination text := btrim(coalesce(p_destination_address, ''));
  v_built_tx text := btrim(coalesce(p_built_tx, ''));
  v_amount numeric(18,2) := round(p_amount_usd, 2);
  v_limits jsonb;
  v_per_order numeric := 500;
  v_daily numeric := 500;
  v_monthly numeric := 2000;
  v_global_daily numeric := 10000;
  v_existing public.wallet_withdrawals%rowtype;
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_month_start timestamptz;
  v_month_end timestamptz;
  v_day_out numeric := 0;
  v_month_out numeric := 0;
  v_global_out numeric := 0;
  v_id uuid;
  v_expires_at timestamptz;
begin
  -- Fail closed: una reserva con huecos no se puede auditar después.
  if p_user_id is null
     or v_request_id = '' or length(v_request_id) > 256
     or v_reference = ''
     or v_mint = ''
     or v_symbol = ''
     or v_source = ''
     or v_destination = ''
     or v_built_tx = ''
     or p_amount_ui is null or p_amount_ui <= 0
     or p_amount_usd is null or v_amount is null or v_amount <= 0 then
    raise exception 'MV_WITHDRAWAL_INVALID' using errcode = '22023';
  end if;
  if p_expires_at is null or p_expires_at <= now() then
    raise exception 'MV_WITHDRAWAL_EXPIRED' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('maverlang:withdraw:global', 0));
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  -- Idempotencia: mismo requestId (o misma referencia) repetido. Sólo es
  -- idempotente si la fila sigue viva y coincide en monto y destino; cualquier
  -- otra diferencia es un conflicto, no un reintento.
  select *
    into v_existing
    from public.wallet_withdrawals w
   where w.user_id = p_user_id
     and (w.request_id = v_request_id or w.reference = v_reference)
   order by w.created_at desc, w.id desc
   limit 1;
  if found then
    if v_existing.status = 'reserved'
       and v_existing.expires_at > now()
       and v_existing.amount_usd = v_amount
       and v_existing.destination_address = v_destination then
      return query select v_existing.id, v_existing.expires_at;
      return;
    end if;
    raise exception 'MV_WITHDRAWAL_CONFLICT' using errcode = '23505';
  end if;

  -- D-02: la reserva nueva reemplaza a la anterior del mismo usuario. Se libera
  -- (no se borra: es traza) para que el cupo no se acumule y para que el índice
  -- único de una sola reserva viva se pueda mantener.
  update public.wallet_withdrawals
     set status = 'released',
         updated_at = now()
   where user_id = p_user_id
     and status = 'reserved'
     and request_id <> v_request_id;

  -- Topes vigentes: fila propia > default de app_flags > constante segura.
  -- El retiro además tiene un techo duro de US$500 por operación.
  select value into v_limits from public.app_flags where key = 'limits_default';
  select least(
           coalesce(
             (select u.per_order_usd from public.user_limits u where u.user_id = p_user_id),
             public.safe_positive_numeric(v_limits -> 'per_order_usd', 500)
           ),
           500
         )
    into v_per_order;
  select coalesce(
           (select u.daily_usd from public.user_limits u where u.user_id = p_user_id),
           public.safe_positive_numeric(v_limits -> 'daily_usd', 500)
         )
    into v_daily;
  select coalesce(
           (select u.monthly_usd from public.user_limits u where u.user_id = p_user_id),
           public.safe_positive_numeric(v_limits -> 'monthly_usd', 2000)
         )
    into v_monthly;
  select public.safe_positive_numeric(value, 10000)
    into v_global_daily
    from public.app_flags
   where key = 'global_daily_usd';
  v_global_daily := coalesce(v_global_daily, 10000);

  if v_amount > v_per_order then
    raise exception 'MV_LIMIT_ORDER' using errcode = 'P0001';
  end if;

  -- Ventanas locales de Santiago: se calculan en local y se convierten a
  -- timestamptz, correcto también en los cambios de horario.
  v_day_start := (date_trunc('day', now() at time zone 'America/Santiago'))
    at time zone 'America/Santiago';
  v_day_end := (date_trunc('day', now() at time zone 'America/Santiago') + interval '1 day')
    at time zone 'America/Santiago';
  v_month_start := (date_trunc('month', now() at time zone 'America/Santiago'))
    at time zone 'America/Santiago';
  v_month_end := (date_trunc('month', now() at time zone 'America/Santiago') + interval '1 month')
    at time zone 'America/Santiago';

  -- Cupo comprometido del usuario: retiros ya enviados dentro de la ventana
  -- más las reservas vivas (aunque se hayan creado antes de medianoche: son
  -- cupo retenido, no gasto).
  select coalesce(sum(w.amount_usd), 0)
    into v_day_out
    from public.wallet_withdrawals w
   where w.user_id = p_user_id
     and (
       (w.status in ('submitted', 'confirmed')
        and w.created_at >= v_day_start
        and w.created_at < v_day_end)
       or (w.status = 'reserved' and w.expires_at > now())
     );

  select coalesce(sum(w.amount_usd), 0)
    into v_month_out
    from public.wallet_withdrawals w
   where w.user_id = p_user_id
     and (
       (w.status in ('submitted', 'confirmed')
        and w.created_at >= v_month_start
        and w.created_at < v_month_end)
       or (w.status = 'reserved' and w.expires_at > now())
     );

  -- Tope global del día: todos los usuarios. Las reservas vivas de cualquier
  -- usuario son cupo comprometido del día, sin importar cuándo se crearon.
  select coalesce(sum(w.amount_usd), 0)
    into v_global_out
    from public.wallet_withdrawals w
   where (w.status in ('submitted', 'confirmed')
          and w.created_at >= v_day_start
          and w.created_at < v_day_end)
      or (w.status = 'reserved' and w.expires_at > now());

  if v_month_out + v_amount > v_monthly then
    raise exception 'MV_LIMIT_MONTHLY' using errcode = 'P0001';
  end if;
  if v_day_out + v_amount > v_daily then
    raise exception 'MV_LIMIT_DAILY' using errcode = 'P0001';
  end if;
  if v_global_out + v_amount > v_global_daily then
    raise exception 'MV_LIMIT_GLOBAL' using errcode = 'P0001';
  end if;

  begin
    insert into public.wallet_withdrawals (
      user_id,
      request_id,
      reference,
      mint,
      symbol,
      source_address,
      destination_address,
      amount_ui,
      amount_usd,
      built_transaction_base64,
      status,
      expires_at
    )
    values (
      p_user_id,
      v_request_id,
      v_reference,
      v_mint,
      v_symbol,
      v_source,
      v_destination,
      p_amount_ui,
      v_amount,
      v_built_tx,
      'reserved',
      p_expires_at
    )
    returning id, expires_at into v_id, v_expires_at;
  exception
    -- La referencia es única global: si otra fila la tomó (otro usuario u otra
    -- reserva en paralelo) el reintento no puede seguir; se informa como
    -- conflicto para que el llamador regenere cotización.
    when unique_violation then
      raise exception 'MV_WITHDRAWAL_CONFLICT' using errcode = '23505';
  end;

  return query select v_id, v_expires_at;
end;
$$;

revoke all on function public.reserve_wallet_withdrawal(
  uuid, text, text, text, text, text, text, numeric, numeric, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.reserve_wallet_withdrawal(
  uuid, text, text, text, text, text, text, numeric, numeric, text, timestamptz
) to service_role;

-- 3. Reclamo del envío. La firma se acepta una sola vez y sólo sobre una
--    reserva vigente: si el cliente reintenta después de enviar, recibe el
--    estado real con claimed = false en vez de un segundo envío.
create or replace function public.claim_wallet_withdrawal_submit(
  p_user_id uuid,
  p_request_id text,
  p_signature text
)
returns table (
  withdrawal_id uuid,
  withdrawal_status text,
  withdrawal_signature text,
  claimed boolean
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_request_id text := btrim(coalesce(p_request_id, ''));
  v_signature text := btrim(coalesce(p_signature, ''));
  v_row public.wallet_withdrawals%rowtype;
  v_count integer := 0;
begin
  if p_user_id is null or v_request_id = '' then
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  select *
    into v_row
    from public.wallet_withdrawals w
   where w.user_id = p_user_id
     and w.request_id = v_request_id;
  if not found then
    return;
  end if;

  -- Ya reclamada (o ya resuelta): el llamador decide si es reintento o error.
  if v_row.status in ('submitted', 'confirmed', 'failed') then
    return query select v_row.id, v_row.status, v_row.signature, false;
    return;
  end if;

  if v_row.status = 'reserved' then
    if v_row.expires_at <= now() then
      raise exception 'MV_WITHDRAWAL_EXPIRED' using errcode = '22023';
    end if;
    if v_signature = '' then
      raise exception 'MV_WITHDRAWAL_INVALID' using errcode = '22023';
    end if;
    -- UPDATE condicional por estado: si una finalización concurrente ya movió
    -- la fila, no se sobreescribe y se falla cerrado.
    update public.wallet_withdrawals w
       set status = 'submitted',
           signature = v_signature,
           updated_at = now()
     where w.id = v_row.id
       and w.status = 'reserved';
    get diagnostics v_count = row_count;
    if v_count = 1 then
      return query select v_row.id, 'submitted'::text, v_signature, true;
      return;
    end if;
    raise exception 'MV_WITHDRAWAL_EXPIRED' using errcode = '22023';
  end if;

  -- released / expired sin firma previa: la reserva ya no es reclamable.
  raise exception 'MV_WITHDRAWAL_EXPIRED' using errcode = '22023';
end;
$$;

revoke all on function public.claim_wallet_withdrawal_submit(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.claim_wallet_withdrawal_submit(uuid, text, text)
  to service_role;

-- 4. Cierre del ciclo. UPDATE condicional: sólo mueve una fila viva, así que
--    finalizar dos veces devuelve false en vez de reescribir el resultado.
create or replace function public.finalize_wallet_withdrawal(
  p_user_id uuid,
  p_request_id text,
  p_status text,
  p_signature text default null,
  p_error text default null
)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_status text := btrim(coalesce(p_status, ''));
  v_request_id text := btrim(coalesce(p_request_id, ''));
  v_count integer := 0;
begin
  if v_status not in ('submitted', 'confirmed', 'failed', 'expired', 'released') then
    raise exception 'MV_WITHDRAWAL_INVALID' using errcode = '22023';
  end if;

  update public.wallet_withdrawals
     set status = v_status,
         signature = coalesce(p_signature, signature),
         error = p_error,
         confirmed_at = case when v_status = 'confirmed' then now() else confirmed_at end,
         updated_at = now()
   where user_id = p_user_id
     and request_id = v_request_id
     and status in ('reserved', 'submitted');
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;

revoke all on function public.finalize_wallet_withdrawal(uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.finalize_wallet_withdrawal(uuid, text, text, text, text)
  to service_role;

-- 5. Lectura acotada (estado del retiro y conciliación). Acepta el requestId o
--    el id de la fila: la ruta GET /api/wallet/send/status?id= usa el id.
create or replace function public.read_wallet_withdrawal(
  p_user_id uuid,
  p_request_id text
)
returns setof public.wallet_withdrawals
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select w.*
    from public.wallet_withdrawals w
   where p_user_id is not null
     and w.user_id = p_user_id
     and (
       w.request_id = btrim(coalesce(p_request_id, ''))
       or w.id::text = btrim(coalesce(p_request_id, ''))
     );
$$;

revoke all on function public.read_wallet_withdrawal(uuid, text)
  from public, anon, authenticated;
grant execute on function public.read_wallet_withdrawal(uuid, text)
  to service_role;

comment on function public.reserve_wallet_withdrawal(
  uuid, text, text, text, text, text, text, numeric, numeric, text, timestamptz
) is
  'Reserva atómica de retiro: locks global+usuario, topes vigentes, ventanas America/Santiago e idempotencia por requestId. Lanza MV_LIMIT_* / MV_WITHDRAWAL_* si no corresponde.';
comment on function public.claim_wallet_withdrawal_submit(uuid, text, text) is
  'Reclama la firma del retiro una sola vez sobre una reserva vigente. Reintentos devuelven el estado real con claimed = false.';
comment on function public.finalize_wallet_withdrawal(uuid, text, text, text, text) is
  'Cierra una reserva viva (submitted/confirmed/failed/expired/released). Devuelve false si ya no había nada que mover.';
comment on function public.read_wallet_withdrawal(uuid, text) is
  'Lee el retiro del usuario por requestId o por id. Null user o sin fila = vacío.';
