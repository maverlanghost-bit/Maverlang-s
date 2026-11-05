-- Maverlang — 0047: migración FORWARD de reservas de cupo (auditoría 2026-11).
--
-- Por qué existe:
--   `0042_trade_reservations.sql` cambió en el merge T32 (auditoría de
--   seguridad, commit e7b1fcc): la versión nueva agrega D-06 (una sola reserva
--   especulativa por usuario, `release_other_trade_reservations(...)` y el
--   índice único parcial `trade_reservations_one_active_idx`) y evita que
--   `consumed` cuente doble cuando ya existe la orden. Una base que YA ejecutó
--   la 0042 vieja (commit db3c416) no vuelve a correr 0042: el ledger de
--   migraciones no la reejecuta. Esta migración lleva esa base desde el
--   esquema de la 0042 vieja al esquema de la 0042 nueva del árbol.
--
-- NO APLICADA. Se pega en el SQL Editor (o la cadena del operador) sobre una
-- base que ya tiene 0042 vieja + 0031. No habilita dinero real: la compuerta
-- `REAL_EXECUTION_LOCKED` (lib/trade/real-guards.ts) sigue cerrada.
--
-- Idempotente: `create table/index if not exists`, `create or replace
-- function`, y la deduplicación es un no-op cuando no hay repetidas. Si el
-- unique ya existe, no falla.
--
-- Regla exacta de deduplicación (paso 2, la parte delicada):
--   Para cada (user_id, request_id) con más de una fila — sólo posible si la
--   base se creó con una variante anterior sin el unique —:
--     a) Canónica: la fila `consumed` si existe (es la ejecución y su
--        request_id es el que puede estar pareado con `public.orders`); entre
--        varias `consumed`, la más antigua (created_at, id). Si no hay
--        `consumed`, la `reserved` más antigua; si tampoco, la `released` más
--        antigua.
--     b) Las demás filas NO se borran: son traza de auditoría. Se les
--        re-etiqueta el request_id como `left(original, 190) || '#dup-' || id`
--        (≤ 256 caracteres, el límite que validan las funciones) para liberar
--        la clave sin perder el identificador original ni el monto ni las
--        fechas.
--     c) Las `reserved` perdedoras pasan a `released`: una reserva duplicada
--        no es cupo vivo y dos `reserved` del mismo usuario romperían el
--        índice parcial de una sola reserva activa.
--     d) Las `consumed` perdedoras CONSERVAN su estado y su monto: son la
--        traza de una ejecución que ya tiene orden. Consecuencia asumida: al
--        quedar con un request_id que ninguna orden usa, el cálculo de cupo
--        las cuenta mientras estén vigentes (minutos). Se prefiere bloquear
--        de más —fail-closed— antes que perder la traza de una ejecución.
--   Nunca se borra una fila de `trade_reservations`.

-- 1. Notional de la orden reclamada (integridad y conciliación). Idempotente.
alter table public.orders
  add column if not exists notional_usd numeric(18,2);

alter table public.orders
  drop constraint if exists orders_notional_usd_check;
alter table public.orders
  add constraint orders_notional_usd_check
  check (notional_usd is null or notional_usd > 0);

-- El tope global del día recorre órdenes reales por fecha, sin filtrar usuario.
create index if not exists orders_real_created_idx
  on public.orders (created_at)
  where is_demo = false;

-- 2. Tabla de reservas. Si la base nunca ejecutó 0042 vieja, se crea igual que
--    en la 0042 nueva; si ya existe, no se toca.
create table if not exists public.trade_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  request_id text not null,
  amount_usd numeric(18,2) not null check (amount_usd > 0),
  status text not null default 'reserved'
    check (status in ('reserved', 'consumed', 'released')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, request_id)
);

create index if not exists trade_reservations_active_user_idx
  on public.trade_reservations (user_id, expires_at)
  where status in ('reserved', 'consumed');

create index if not exists trade_reservations_active_idx
  on public.trade_reservations (expires_at)
  where status in ('reserved', 'consumed');

-- 3. Deduplicación de (user_id, request_id) ANTES del unique. La regla está
--    documentada en la cabecera; acá sólo se ejecuta. Si el unique ya existe
--    no hay repetidas y este UPDATE no modifica nada.
with duplicadas as (
  select r.id,
         row_number() over (
           partition by r.user_id, r.request_id
           order by case r.status
                      when 'consumed' then 0
                      when 'reserved' then 1
                      else 2
                    end,
                    r.created_at asc,
                    r.id asc
         ) as posicion
    from public.trade_reservations r
)
update public.trade_reservations t
   set request_id = left(t.request_id, 190) || '#dup-' || t.id::text,
       status = case when t.status = 'reserved' then 'released' else t.status end,
       updated_at = now()
  from duplicadas d
 where d.id = t.id
   and d.posicion > 1;

-- 4. Unique (user_id, request_id): se agrega sólo si no hay uno equivalente.
--    Si ya existe (caso normal: la 0042 vieja lo trae inline), no falla.
do $$
begin
  if not exists (
    select 1
      from pg_index i
     where i.indrelid = 'public.trade_reservations'::regclass
       and i.indisunique
       and i.indpred is null
       and i.indnkeyatts = 2
       and pg_get_indexdef(i.indexrelid, 1, true) = 'user_id'
       and pg_get_indexdef(i.indexrelid, 2, true) = 'request_id'
  ) then
    alter table public.trade_reservations
      add constraint trade_reservations_user_id_request_id_key
      unique (user_id, request_id);
  end if;
end;
$$;

-- 5. D-06: UNA sola reserva especulativa por usuario. Cada cotización creaba
--    una reserva nueva y las activas se sumaban: tres cotizaciones de US$200
--    agotaban el tope diario de US$500 sin operar. La reserva nueva reemplaza
--    a la anterior, así que el índice único hace imposible acumularlas aunque
--    el código llame mal. `consumed` queda fuera: esa reserva ya representa una
--    ejecución en curso o hecha.
--
--    Saneamiento previo: si la 0042 vieja dejó varias `reserved` por usuario,
--    se conserva la más reciente y se liberan las demás. Sin esto el índice no
--    podría crearse sobre datos viejos.
update public.trade_reservations r
   set status = 'released',
       updated_at = now()
 where r.status = 'reserved'
   and exists (
     select 1
       from public.trade_reservations newer
      where newer.user_id = r.user_id
        and newer.status = 'reserved'
        and (newer.created_at, newer.id) > (r.created_at, r.id)
   );

create unique index if not exists trade_reservations_one_active_idx
  on public.trade_reservations (user_id)
  where status = 'reserved';

-- Las filas no se borran: son traza de auditoría. Los índices parciales y el
-- filtro `expires_at > now()` mantienen barato el cálculo de cupo; la
-- retención/limpieza histórica queda para operación (no bloquea la reserva).

alter table public.trade_reservations enable row level security;
alter table public.trade_reservations force row level security;
revoke all on table public.trade_reservations from public, anon, authenticated;
-- Explícito para no depender de los privilegios por defecto del proyecto:
-- las funciones SECURITY INVOKER corren como service_role y necesitan estos
-- permisos incluso en un PostgreSQL sin los defaults de Supabase.
grant select, insert, update on table public.trade_reservations to service_role;

-- 6. Helper: lee un tope numérico positivo desde app_flags sin romper por
--    basura (jsonb number/string). Si no es válido, usa el default.
create or replace function public.safe_positive_numeric(p_value jsonb, p_default numeric)
returns numeric
language plpgsql
immutable
as $$
declare
  v_text text;
  v_number numeric;
begin
  if p_value is null then
    return p_default;
  end if;
  if jsonb_typeof(p_value) not in ('number', 'string') then
    return p_default;
  end if;
  v_text := btrim(p_value #>> '{}');
  if v_text !~ '^[0-9]+([.][0-9]+)?$' then
    return p_default;
  end if;
  v_number := v_text::numeric;
  if v_number is null or v_number <= 0 then
    return p_default;
  end if;
  return v_number;
exception
  when others then
    return p_default;
end;
$$;

revoke all on function public.safe_positive_numeric(jsonb, numeric)
  from public, anon, authenticated;
grant execute on function public.safe_positive_numeric(jsonb, numeric)
  to service_role;

-- 7. Liberación de reservas especulativas previas (D-06). Una cotización
--    nueva reemplaza a la anterior: se liberan las `reserved` del usuario que
--    no sean la que se está reservando. No toca `consumed` (ejecución en
--    curso) ni borra filas (traza de auditoría). `p_keep_request_id` vacío
--    libera todas.
create or replace function public.release_other_trade_reservations(
  p_user_id uuid,
  p_keep_request_id text
)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_keep text := btrim(coalesce(p_keep_request_id, ''));
  v_count integer := 0;
begin
  if p_user_id is null then
    raise exception 'MV_RESERVATION_INVALID' using errcode = '22023';
  end if;
  update public.trade_reservations
     set status = 'released',
         updated_at = now()
   where user_id = p_user_id
     and status = 'reserved'
     and request_id <> v_keep;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.release_other_trade_reservations(uuid, text)
  from public, anon, authenticated;
grant execute on function public.release_other_trade_reservations(uuid, text)
  to service_role;

-- 8. Reserva atómica. El lock global va primero y el del usuario después:
--    todos los caminos toman los locks en el mismo orden (sin deadlocks).
--    Las funciones son SECURITY INVOKER: sólo `service_role` tiene EXECUTE y
--    ese rol ya tiene BYPASSRLS; no se escala privilegio desde la función.
create or replace function public.reserve_trade_amount(
  p_user_id uuid,
  p_request_id text,
  p_amount_usd numeric,
  p_expires_at timestamptz
)
returns table (reservation_id uuid, reserved_expires_at timestamptz)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_amount numeric(18,2) := round(p_amount_usd, 2);
  v_request_id text := btrim(coalesce(p_request_id, ''));
  v_limits jsonb;
  v_per_order numeric := 200;
  v_daily numeric := 500;
  v_monthly numeric := 2000;
  v_global_daily numeric := 10000;
  v_existing public.trade_reservations%rowtype;
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_month_start timestamptz;
  v_month_end timestamptz;
  v_day_orders numeric := 0;
  v_month_orders numeric := 0;
  v_reserved numeric := 0;
  v_global_orders numeric := 0;
  v_global_reserved numeric := 0;
  v_reservation_id uuid;
  v_reserved_expires_at timestamptz;
begin
  if p_user_id is null then
    raise exception 'MV_RESERVATION_INVALID' using errcode = '22023';
  end if;
  if v_request_id = '' or length(v_request_id) > 256 then
    raise exception 'MV_RESERVATION_INVALID' using errcode = '22023';
  end if;
  if v_amount is null or v_amount <= 0 then
    raise exception 'MV_RESERVATION_INVALID' using errcode = '22023';
  end if;
  if p_expires_at is null or p_expires_at <= now() then
    raise exception 'MV_RESERVATION_EXPIRED' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('maverlang:trade:global', 0));
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  -- Idempotencia: repetir la misma reserva activa devuelve la existente.
  select *
    into v_existing
    from public.trade_reservations r
   where r.user_id = p_user_id
     and r.request_id = v_request_id;
  if found then
    if v_existing.status = 'reserved'
       and v_existing.expires_at > now()
       and v_existing.amount_usd = v_amount then
      return query select v_existing.id, v_existing.expires_at;
      return;
    end if;
    raise exception 'MV_RESERVATION_CONFLICT' using errcode = '23505';
  end if;

  -- D-06: la cotización nueva reemplaza a la anterior. Se liberan las
  -- reservas especulativas previas del usuario (vencidas o no) dentro de la
  -- misma transacción y bajo los locks: si no, cada cotización nueva sumaba
  -- otra retención y tres de US$200 agotaban el tope diario de US$500.
  perform public.release_other_trade_reservations(p_user_id, v_request_id);

  -- Topes vigentes: fila propia > default de app_flags > constante segura.
  select value into v_limits from public.app_flags where key = 'limits_default';
  select coalesce(
           (select u.per_order_usd from public.user_limits u where u.user_id = p_user_id),
           public.safe_positive_numeric(v_limits -> 'per_order_usd', 200)
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

  -- Ventanas locales de Santiago. Se calculan en local y se convierten a
  -- timestamptz: correcto también en cambios de horario.
  v_day_start := (date_trunc('day', now() at time zone 'America/Santiago'))
    at time zone 'America/Santiago';
  v_day_end := (date_trunc('day', now() at time zone 'America/Santiago') + interval '1 day')
    at time zone 'America/Santiago';
  v_month_start := (date_trunc('month', now() at time zone 'America/Santiago'))
    at time zone 'America/Santiago';
  v_month_end := (date_trunc('month', now() at time zone 'America/Santiago') + interval '1 month')
    at time zone 'America/Santiago';

  select coalesce(sum(
           case
             when o.side = 'buy' then coalesce(o.in_amount_ui, 0)
             else coalesce(
               nullif(o.out_amount_ui, 0),
               coalesce(o.in_amount_ui, 0) * coalesce(o.price_per_share_usd, 0)
             )
           end
         ), 0)
    into v_day_orders
    from public.orders o
   where o.user_id = p_user_id
     and o.is_demo = false
     and o.status in ('pending', 'submitted', 'confirmed', 'signed', 'built')
     and o.created_at >= v_day_start
     and o.created_at < v_day_end;

  select coalesce(sum(
           case
             when o.side = 'buy' then coalesce(o.in_amount_ui, 0)
             else coalesce(
               nullif(o.out_amount_ui, 0),
               coalesce(o.in_amount_ui, 0) * coalesce(o.price_per_share_usd, 0)
             )
           end
         ), 0)
    into v_month_orders
    from public.orders o
   where o.user_id = p_user_id
     and o.is_demo = false
     and o.status in ('pending', 'submitted', 'confirmed', 'signed', 'built')
     and o.created_at >= v_month_start
     and o.created_at < v_month_end;

  -- Reservas activas del usuario. Se cuentan todas las vigentes (aunque se
  -- hayan creado antes de medianoche): son cupo comprometido, no gasto.
  -- `consumed` cuenta sólo mientras NO exista su orden contable: la orden ya
  -- suma el mismo monto. Contarla otra vez bloqueaba operaciones legítimas
  -- hasta el vencimiento de la reserva.
  select coalesce(sum(r.amount_usd), 0)
    into v_reserved
    from public.trade_reservations r
   where r.user_id = p_user_id
     and r.status in ('reserved', 'consumed')
     and r.expires_at > now()
     and (
       r.status = 'reserved'
       or not exists (
         select 1
           from public.orders o
          where o.user_id = r.user_id
            and o.request_id = r.request_id
            and o.is_demo = false
            and o.status in ('pending', 'submitted', 'confirmed', 'signed', 'built')
       )
     );

  -- Tope global del día: órdenes de todos los usuarios + reservas activas.
  select coalesce(sum(
           case
             when o.side = 'buy' then coalesce(o.in_amount_ui, 0)
             else coalesce(
               nullif(o.out_amount_ui, 0),
               coalesce(o.in_amount_ui, 0) * coalesce(o.price_per_share_usd, 0)
             )
           end
         ), 0)
    into v_global_orders
    from public.orders o
   where o.is_demo = false
     and o.status in ('pending', 'submitted', 'confirmed', 'signed', 'built')
     and o.created_at >= v_day_start
     and o.created_at < v_day_end;

  -- El filtro por requestId es sólo del usuario: aplicarlo globalmente dejaba
  -- fuera la reserva de OTRO usuario que usara el mismo identificador. En este
  -- punto no existe una reserva de este usuario con `v_request_id` (la
  -- idempotencia salió antes), así que el global no necesita excluir nada.
  select coalesce(sum(r.amount_usd), 0)
    into v_global_reserved
    from public.trade_reservations r
   where r.status in ('reserved', 'consumed')
     and r.expires_at > now()
     and (
       r.status = 'reserved'
       or not exists (
         select 1
           from public.orders o
          where o.user_id = r.user_id
            and o.request_id = r.request_id
            and o.is_demo = false
            and o.status in ('pending', 'submitted', 'confirmed', 'signed', 'built')
       )
     );

  if v_month_orders + v_reserved + v_amount > v_monthly then
    raise exception 'MV_LIMIT_MONTHLY' using errcode = 'P0001';
  end if;
  if v_day_orders + v_reserved + v_amount > v_daily then
    raise exception 'MV_LIMIT_DAILY' using errcode = 'P0001';
  end if;
  if v_global_orders + v_global_reserved + v_amount > v_global_daily then
    raise exception 'MV_LIMIT_GLOBAL' using errcode = 'P0001';
  end if;

  insert into public.trade_reservations (user_id, request_id, amount_usd, status, expires_at)
  values (p_user_id, v_request_id, v_amount, 'reserved', p_expires_at)
  returning id, expires_at
    into v_reservation_id, v_reserved_expires_at;

  return query select v_reservation_id, v_reserved_expires_at;
end;
$$;

revoke all on function public.reserve_trade_amount(uuid, text, numeric, timestamptz)
  from public, anon, authenticated;
grant execute on function public.reserve_trade_amount(uuid, text, numeric, timestamptz)
  to service_role;

-- 9. Consumo idempotente. Sólo una reserva `reserved` y vigente pasa a
--    `consumed`; una vencida o ya consumida devuelve false (el llamador falla
--    cerrado o trata el reintento como idempotente).
create or replace function public.consume_trade_reservation(
  p_user_id uuid,
  p_request_id text,
  p_amount_usd numeric default null
)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_count integer := 0;
begin
  update public.trade_reservations
     set status = 'consumed',
         updated_at = now()
   where user_id = p_user_id
     and request_id = btrim(coalesce(p_request_id, ''))
     and status = 'reserved'
     and expires_at > now()
     and (p_amount_usd is null or amount_usd = round(p_amount_usd, 2));
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;

revoke all on function public.consume_trade_reservation(uuid, text, numeric)
  from public, anon, authenticated;
grant execute on function public.consume_trade_reservation(uuid, text, numeric)
  to service_role;

-- 10. Liberación. Sólo toca reservas activas; liberar dos veces es inocuo.
create or replace function public.release_trade_reservation(
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
  update public.trade_reservations
     set status = 'released',
         updated_at = now()
   where user_id = p_user_id
     and request_id = btrim(coalesce(p_request_id, ''))
     and status = 'reserved';
  get diagnostics v_count = row_count;
  return v_count = 1;
end;
$$;

revoke all on function public.release_trade_reservation(uuid, text)
  from public, anon, authenticated;
grant execute on function public.release_trade_reservation(uuid, text)
  to service_role;

-- 11. Re-etiqueta la reserva cuando Jupiter cambia el requestId al armar la
--     transacción. NO cambia el monto: ese monto ya se validó contra la
--     cotización y el build sólo puede desviarse dentro del slippage.
create or replace function public.rekey_trade_reservation(
  p_user_id uuid,
  p_old_request_id text,
  p_new_request_id text
)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_old text := btrim(coalesce(p_old_request_id, ''));
  v_new text := btrim(coalesce(p_new_request_id, ''));
  v_count integer := 0;
begin
  if p_user_id is null or v_old = '' or v_new = '' or length(v_new) > 256 then
    raise exception 'MV_RESERVATION_INVALID' using errcode = '22023';
  end if;
  if v_old = v_new then
    select count(*) into v_count
      from public.trade_reservations
     where user_id = p_user_id
       and request_id = v_new
       and status = 'reserved'
       and expires_at > now();
    if v_count <> 1 then
      raise exception 'MV_RESERVATION_MISSING' using errcode = 'P0001';
    end if;
    return true;
  end if;

  if exists (
    select 1
      from public.trade_reservations
     where user_id = p_user_id
       and request_id = v_new
       and request_id <> v_old
  ) then
    raise exception 'MV_RESERVATION_CONFLICT' using errcode = '23505';
  end if;

  update public.trade_reservations
     set request_id = v_new,
         updated_at = now()
   where user_id = p_user_id
     and request_id = v_old
     and status = 'reserved'
     and expires_at > now();
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    raise exception 'MV_RESERVATION_MISSING' using errcode = 'P0001';
  end if;
  return true;
end;
$$;

revoke all on function public.rekey_trade_reservation(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.rekey_trade_reservation(uuid, text, text)
  to service_role;

-- 12. Lectura acotada (build/submit y conciliación).
create or replace function public.read_trade_reservation(
  p_user_id uuid,
  p_request_id text
)
returns table (
  reservation_id uuid,
  amount_usd numeric,
  status text,
  expires_at timestamptz
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select r.id, r.amount_usd, r.status, r.expires_at
    from public.trade_reservations r
   where r.user_id = p_user_id
     and r.request_id = btrim(coalesce(p_request_id, ''))
   limit 1;
$$;

revoke all on function public.read_trade_reservation(uuid, text)
  from public, anon, authenticated;
grant execute on function public.read_trade_reservation(uuid, text)
  to service_role;

comment on table public.trade_reservations is
  'Cupo de trading reservado por usuario/requestId. Sólo service_role. La compuerta REAL_EXECUTION_LOCKED sigue cerrada.';
comment on function public.reserve_trade_amount(uuid, text, numeric, timestamptz) is
  'Reserva atómica de cupo: locks de asesoramiento, topes vigentes y ventanas America/Santiago. Lanza MV_LIMIT_* si no cabe. Una sola reserva especulativa por usuario (D-06).';
comment on function public.release_other_trade_reservations(uuid, text) is
  'D-06: libera las reservas especulativas del usuario salvo p_keep_request_id. No toca consumed ni borra filas.';
