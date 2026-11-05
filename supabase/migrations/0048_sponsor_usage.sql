-- Maverlang — 0048: cuotas durables del patrocinio de comisiones de red (T37).
--
-- NO APLICADA. Este archivo NO se pega en el SQL Editor de Supabase, NO se
-- ejecuta contra ninguna base real y NO enciende el patrocinio. Sólo se prueba
-- en el PostgreSQL 17 aislado de `supabase/tests`.
--
-- Requiere: 0002 (profiles). Idempotente: se puede volver a ejecutar.
--
-- Por qué existe:
--   `lib/solana/sponsorship/policy.ts` exige un `SponsorUsageStore` durable y
--   atómico; sin él, `DENY_ALL_SPONSOR_USAGE_STORE` niega todo. Un contador en
--   memoria no sirve: dos instancias del servidor verían cupos distintos y el
--   tope del sponsor se multiplicaría por la cantidad de instancias. Esta
--   migración crea el almacén compartido en PostgreSQL.
--
--   1. `sponsor_usage`: contadores por ventana.
--      - scope='user'    → (usuario, sponsor, hora) y (usuario, sponsor, día)
--      - scope='sponsor' → (sponsor, día), global de la empresa
--      Cada fila guarda `operations` y `lamports`. Las ventanas son locales de
--      America/Santiago, igual que los topes de trading (0042), para que el
--      corte diario coincida con el del producto.
--
--   2. `sponsor_usage_requests`: libro por `requestId` que hace idempotente la
--      reserva y permite liberar sin descontar dos veces. Un `requestId`
--      repetido con el mismo contenido y estado `reserved` devuelve la misma
--      decisión sin volver a sumar; con contenido distinto, o ya liberado, se
--      rechaza (fail-closed: un requestId liberado no se revive).
--
--   3. `reserve_sponsor_usage(...)`: en UNA transacción toma locks de
--      asesoramiento (sponsor primero, usuario después: mismo orden en todos
--      los caminos, sin deadlocks), lee los contadores de la hora/día, aplica
--      los topes y, si cabe, inserta el libro y suma los contadores. Devuelve
--      la decisión con la foto de uso. Los topes que llegan como parámetro se
--      revalidan contra los techos duros de `contracts.ts`: una llamada no
--      puede pedir "sin límite".
--
--   4. `release_sponsor_usage(...)`: devuelve el cupo de una reserva
--      `reserved`. Idempotente: la segunda llamada no descuenta de nuevo.
--      Descuenta las MISMAS ventanas de la reserva (calculadas desde
--      `created_at`), no las de "ahora".
--
-- Fail-closed: si la tabla o las funciones no existen, el almacén de
-- TypeScript devuelve rechazo (`SPONSOR_LIMITER_UNAVAILABLE`), nunca cupo
-- infinito. `SPONSOR_ENABLED` sigue en false por defecto y no hay ningún
-- sponsor registrado: esta migración prepara el almacén, NO habilita el
-- patrocinio ni autoriza a nadie a firmar.

-- 1. Contadores por ventana.
create table if not exists public.sponsor_usage (
  id uuid primary key default gen_random_uuid(),
  scope text not null,
  user_id uuid references public.profiles (id) on delete cascade,
  sponsor_id text not null,
  window_kind text not null,
  window_start timestamptz not null,
  operations integer not null default 0,
  lamports bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sponsor_usage_scope_check check (scope in ('user', 'sponsor')),
  constraint sponsor_usage_window_check check (window_kind in ('hour', 'day')),
  -- scope='user' exige usuario; scope='sponsor' (global del sponsor) no lo lleva.
  constraint sponsor_usage_scope_user_check check ((scope = 'user') = (user_id is not null)),
  constraint sponsor_usage_sponsor_check check (length(btrim(sponsor_id)) between 1 and 64),
  constraint sponsor_usage_operations_check check (operations >= 0),
  constraint sponsor_usage_lamports_check check (lamports >= 0)
);

-- Una fila por (usuario, sponsor, ventana). Índices parciales: en PostgreSQL
-- un unique con columnas NULL no compara los NULL, así que el tope global del
-- sponsor necesita su propio índice en vez de un unique con `user_id` nulo.
create unique index if not exists sponsor_usage_user_window_idx
  on public.sponsor_usage (user_id, sponsor_id, window_kind, window_start)
  where scope = 'user';

create unique index if not exists sponsor_usage_sponsor_window_idx
  on public.sponsor_usage (sponsor_id, window_kind, window_start)
  where scope = 'sponsor';

-- 2. Libro por reserva. Guarda el SHA-256 del mensaje y la comisión: son los
--    datos con los que se libera exactamente lo mismo que se sumó. No guarda
--    la transacción, ni firmas, ni claves.
create table if not exists public.sponsor_usage_requests (
  id uuid primary key default gen_random_uuid(),
  request_id text not null,
  sponsor_id text not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  message_sha256 text not null,
  fee_lamports bigint not null,
  status text not null default 'reserved',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sponsor_usage_requests_status_check check (status in ('reserved', 'released')),
  constraint sponsor_usage_requests_request_check check (length(btrim(request_id)) between 1 and 200),
  constraint sponsor_usage_requests_sponsor_check check (length(btrim(sponsor_id)) between 1 and 64),
  constraint sponsor_usage_requests_sha_check check (message_sha256 ~ '^[0-9a-f]{64}$'),
  constraint sponsor_usage_requests_fee_check check (fee_lamports > 0)
);

create unique index if not exists sponsor_usage_requests_request_idx
  on public.sponsor_usage_requests (request_id);

create index if not exists sponsor_usage_requests_user_idx
  on public.sponsor_usage_requests (user_id, sponsor_id, created_at desc);

-- 3. RLS y privilegios: sólo `service_role`. Sin políticas: ningún cliente
--    autenticado lee ni escribe su propio uso (no le sirve y no debe poder
--    tocarlo).
alter table public.sponsor_usage enable row level security;
alter table public.sponsor_usage force row level security;
alter table public.sponsor_usage_requests enable row level security;
alter table public.sponsor_usage_requests force row level security;
revoke all on table public.sponsor_usage from public, anon, authenticated;
revoke all on table public.sponsor_usage_requests from public, anon, authenticated;
-- Explícito para no depender de los privilegios por defecto del proyecto: las
-- funciones SECURITY INVOKER corren como service_role y necesitan estos
-- permisos incluso en un PostgreSQL sin los defaults de Supabase.
grant select, insert, update on table public.sponsor_usage to service_role;
grant select, insert, update on table public.sponsor_usage_requests to service_role;

-- 4. Reserva atómica. Devuelve siempre una fila: `allowed` con el código de
--    rechazo y la foto de uso (los contadores leídos, sin sumar la reserva
--    cuando se rechaza). Nunca lanza por un límite excedido: la decisión es
--    un dato, no una excepción.
create or replace function public.reserve_sponsor_usage(
  p_request_id text,
  p_user_id uuid,
  p_sponsor_id text,
  p_fee_lamports bigint,
  p_message_sha256 text,
  p_max_per_user_hour integer,
  p_max_per_user_day integer,
  p_max_per_sponsor_day integer,
  p_max_lamports_user_day bigint,
  p_max_lamports_sponsor_day bigint,
  p_cooldown_ms bigint
)
returns table (
  allowed boolean,
  code text,
  remaining integer,
  user_hour_count integer,
  user_day_count integer,
  sponsor_day_count integer,
  user_day_lamports bigint,
  sponsor_day_lamports bigint,
  last_user_sponsorship_at timestamptz
)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  -- Techos duros de lib/solana/sponsorship/contracts.ts. Si divergen, esta
  -- función rechaza por política en vez de aceptar un tope mayor: fail-closed.
  c_max_per_user_hour constant integer := 10;
  c_max_per_user_day constant integer := 30;
  c_max_per_sponsor_day constant integer := 5000;
  c_max_lamports_user_day constant bigint := 20000000;
  c_max_lamports_sponsor_day constant bigint := 100000000;
  c_max_fee_lamports constant bigint := 10000000;
  c_max_cooldown_ms constant bigint := 86400000;

  v_request text := btrim(coalesce(p_request_id, ''));
  v_sponsor text := btrim(coalesce(p_sponsor_id, ''));
  v_sha text := lower(btrim(coalesce(p_message_sha256, '')));
  v_existing public.sponsor_usage_requests%rowtype;
  v_idempotent boolean := false;
  v_hour_start timestamptz;
  v_day_start timestamptz;
  v_user_hour integer := 0;
  v_user_day integer := 0;
  v_sponsor_day integer := 0;
  v_user_lamports bigint := 0;
  v_sponsor_lamports bigint := 0;
  v_last timestamptz := null;
  v_allowed boolean := false;
  v_code text := null;
  v_remaining integer := null;
begin
  -- 4.1 Entrada. Un dato malformado se rechaza; no se "normaliza" a un cupo.
  if p_user_id is null then
    v_code := 'SPONSOR_USER_NOT_ELIGIBLE';
  elsif v_request = '' or length(v_request) > 200 then
    v_code := 'SPONSOR_REQUEST_INVALID';
  elsif v_sponsor = '' or length(v_sponsor) > 64 then
    v_code := 'SPONSOR_POLICY_INVALID';
  elsif p_fee_lamports is null or p_fee_lamports <= 0 or p_fee_lamports > c_max_fee_lamports then
    v_code := 'SPONSOR_POLICY_INVALID';
  elsif v_sha !~ '^[0-9a-f]{64}$' then
    v_code := 'SPONSOR_REQUEST_INVALID';
  end if;

  -- 4.2 Topes pedidos. Nunca por sobre el techo duro del contrato.
  if v_code is null then
    if p_max_per_user_hour is null or p_max_per_user_hour <= 0
       or p_max_per_user_hour > c_max_per_user_hour
       or p_max_per_user_day is null or p_max_per_user_day <= 0
       or p_max_per_user_day > c_max_per_user_day
       or p_max_per_sponsor_day is null or p_max_per_sponsor_day <= 0
       or p_max_per_sponsor_day > c_max_per_sponsor_day
       or p_max_lamports_user_day is null or p_max_lamports_user_day <= 0
       or p_max_lamports_user_day > c_max_lamports_user_day
       or p_max_lamports_sponsor_day is null or p_max_lamports_sponsor_day <= 0
       or p_max_lamports_sponsor_day > c_max_lamports_sponsor_day
       or p_cooldown_ms is null or p_cooldown_ms < 0
       or p_cooldown_ms > c_max_cooldown_ms
    then
      v_code := 'SPONSOR_POLICY_INVALID';
    end if;
  end if;

  if v_code is null then
    -- 4.3 Locks: sponsor global primero, usuario después. Todos los caminos
    --     usan el mismo orden, así que no hay deadlocks entre reservas.
    perform pg_advisory_xact_lock(hashtextextended('maverlang:sponsor:' || v_sponsor, 0));
    perform pg_advisory_xact_lock(hashtextextended('maverlang:sponsor-user:' || p_user_id::text, 0));

    v_day_start := (date_trunc('day', now() at time zone 'America/Santiago'))
      at time zone 'America/Santiago';
    v_hour_start := (date_trunc('hour', now() at time zone 'America/Santiago'))
      at time zone 'America/Santiago';

    -- 4.4 Idempotencia por requestId. Reintentar la MISMA reserva devuelve
    --     la misma decisión sin volver a sumar.
    select *
      into v_existing
      from public.sponsor_usage_requests r
     where r.request_id = v_request;
    if found then
      if v_existing.status = 'reserved'
         and v_existing.user_id = p_user_id
         and v_existing.sponsor_id = v_sponsor
         and v_existing.fee_lamports = p_fee_lamports
         and v_existing.message_sha256 = v_sha
      then
        v_idempotent := true;
      else
        -- Mismo requestId con otro contenido, u ya liberado: no se revive.
        v_code := 'SPONSOR_REQUEST_INVALID';
      end if;
    end if;
  end if;

  if v_code is null then
    -- 4.5 Foto de uso, dentro de la transacción y con los locks tomados.
    select coalesce(sum(u.operations), 0)::integer
      into v_user_hour
      from public.sponsor_usage u
     where u.scope = 'user'
       and u.user_id = p_user_id
       and u.sponsor_id = v_sponsor
       and u.window_kind = 'hour'
       and u.window_start = v_hour_start;

    select coalesce(sum(u.operations), 0)::integer
      into v_user_day
      from public.sponsor_usage u
     where u.scope = 'user'
       and u.user_id = p_user_id
       and u.sponsor_id = v_sponsor
       and u.window_kind = 'day'
       and u.window_start = v_day_start;

    select coalesce(sum(u.operations), 0)::integer
      into v_sponsor_day
      from public.sponsor_usage u
     where u.scope = 'sponsor'
       and u.sponsor_id = v_sponsor
       and u.window_kind = 'day'
       and u.window_start = v_day_start;

    select coalesce(sum(u.lamports), 0)::bigint
      into v_user_lamports
      from public.sponsor_usage u
     where u.scope = 'user'
       and u.user_id = p_user_id
       and u.sponsor_id = v_sponsor
       and u.window_kind = 'day'
       and u.window_start = v_day_start;

    select coalesce(sum(u.lamports), 0)::bigint
      into v_sponsor_lamports
      from public.sponsor_usage u
     where u.scope = 'sponsor'
       and u.sponsor_id = v_sponsor
       and u.window_kind = 'day'
       and u.window_start = v_day_start;

    -- Último patrocinio vigente del usuario con ESE sponsor (enfriamiento).
    select max(r.created_at)
      into v_last
      from public.sponsor_usage_requests r
     where r.user_id = p_user_id
       and r.sponsor_id = v_sponsor
       and r.status = 'reserved';

    if v_idempotent then
      -- Ya está contado: se devuelve la misma respuesta sin tocar nada.
      v_allowed := true;
      v_remaining := greatest(0, p_max_per_user_day - v_user_day);
    else
      if v_last is not null
         and v_last > now() - make_interval(secs => p_cooldown_ms::double precision / 1000.0)
      then
        v_code := 'SPONSOR_COOLDOWN';
      elsif v_user_hour >= p_max_per_user_hour then
        v_code := 'SPONSOR_LIMIT_EXCEEDED';
      elsif v_user_day >= p_max_per_user_day then
        v_code := 'SPONSOR_LIMIT_EXCEEDED';
      elsif v_sponsor_day >= p_max_per_sponsor_day then
        v_code := 'SPONSOR_LIMIT_EXCEEDED';
      elsif v_user_lamports + p_fee_lamports > p_max_lamports_user_day then
        v_code := 'SPONSOR_LIMIT_EXCEEDED';
      elsif v_sponsor_lamports + p_fee_lamports > p_max_lamports_sponsor_day then
        v_code := 'SPONSOR_LIMIT_EXCEEDED';
      end if;

      if v_code is null then
        insert into public.sponsor_usage_requests (
          request_id, sponsor_id, user_id, message_sha256, fee_lamports, status
        ) values (
          v_request, v_sponsor, p_user_id, v_sha, p_fee_lamports, 'reserved'
        );

        insert into public.sponsor_usage as u (
          scope, user_id, sponsor_id, window_kind, window_start, operations, lamports
        ) values (
          'user', p_user_id, v_sponsor, 'hour', v_hour_start, 1, p_fee_lamports
        )
        on conflict (user_id, sponsor_id, window_kind, window_start) where u.scope = 'user'
        do update set
          operations = u.operations + 1,
          lamports = u.lamports + excluded.lamports,
          updated_at = now();

        insert into public.sponsor_usage as u (
          scope, user_id, sponsor_id, window_kind, window_start, operations, lamports
        ) values (
          'user', p_user_id, v_sponsor, 'day', v_day_start, 1, p_fee_lamports
        )
        on conflict (user_id, sponsor_id, window_kind, window_start) where u.scope = 'user'
        do update set
          operations = u.operations + 1,
          lamports = u.lamports + excluded.lamports,
          updated_at = now();

        insert into public.sponsor_usage as u (
          scope, user_id, sponsor_id, window_kind, window_start, operations, lamports
        ) values (
          'sponsor', null, v_sponsor, 'day', v_day_start, 1, p_fee_lamports
        )
        on conflict (sponsor_id, window_kind, window_start) where u.scope = 'sponsor'
        do update set
          operations = u.operations + 1,
          lamports = u.lamports + excluded.lamports,
          updated_at = now();

        v_allowed := true;
        v_remaining := greatest(0, p_max_per_user_day - v_user_day - 1);
        v_user_hour := v_user_hour + 1;
        v_user_day := v_user_day + 1;
        v_sponsor_day := v_sponsor_day + 1;
        v_user_lamports := v_user_lamports + p_fee_lamports;
        v_sponsor_lamports := v_sponsor_lamports + p_fee_lamports;
        v_last := now();
      end if;
    end if;
  end if;

  return query select
    v_allowed, v_code, v_remaining,
    v_user_hour, v_user_day, v_sponsor_day,
    v_user_lamports, v_sponsor_lamports, v_last;
end;
$$;

revoke all on function public.reserve_sponsor_usage(
  text, uuid, text, bigint, text, integer, integer, integer, bigint, bigint, bigint
) from public, anon, authenticated;
grant execute on function public.reserve_sponsor_usage(
  text, uuid, text, bigint, text, integer, integer, integer, bigint, bigint, bigint
) to service_role;

-- 5. Liberación. Idempotente: sólo una reserva `reserved` descuenta, y
--    descuenta las ventanas de SU `created_at`, no las actuales.
create or replace function public.release_sponsor_usage(
  p_request_id text,
  p_sponsor_id text
)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_request text := btrim(coalesce(p_request_id, ''));
  v_sponsor text := btrim(coalesce(p_sponsor_id, ''));
  v_row public.sponsor_usage_requests%rowtype;
  v_hour_start timestamptz;
  v_day_start timestamptz;
  v_count integer := 0;
begin
  if v_request = '' or v_sponsor = '' then
    return false;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('maverlang:sponsor:' || v_sponsor, 0));

  select *
    into v_row
    from public.sponsor_usage_requests r
   where r.request_id = v_request
     and r.sponsor_id = v_sponsor
     and r.status = 'reserved'
   for update;

  if not found then
    -- No existe o ya se liberó: no se descuenta de nuevo.
    return false;
  end if;

  update public.sponsor_usage_requests
     set status = 'released',
         updated_at = now()
   where id = v_row.id;
  get diagnostics v_count = row_count;
  if v_count <> 1 then
    return false;
  end if;

  v_hour_start := (date_trunc('hour', v_row.created_at at time zone 'America/Santiago'))
    at time zone 'America/Santiago';
  v_day_start := (date_trunc('day', v_row.created_at at time zone 'America/Santiago'))
    at time zone 'America/Santiago';

  update public.sponsor_usage
     set operations = greatest(0, operations - 1),
         lamports = greatest(0, lamports - v_row.fee_lamports),
         updated_at = now()
   where sponsor_id = v_sponsor
     and (
       (scope = 'user' and user_id = v_row.user_id and window_kind = 'hour' and window_start = v_hour_start)
       or (scope = 'user' and user_id = v_row.user_id and window_kind = 'day' and window_start = v_day_start)
       or (scope = 'sponsor' and window_kind = 'day' and window_start = v_day_start)
     );

  return true;
end;
$$;

revoke all on function public.release_sponsor_usage(text, text)
  from public, anon, authenticated;
grant execute on function public.release_sponsor_usage(text, text)
  to service_role;

-- 6. Documentación viva.
comment on table public.sponsor_usage is
  'Cuotas del patrocinio de comisiones por ventana (usuario/hora, usuario/día, sponsor/día). Sólo service_role. No habilita el patrocinio.';
comment on table public.sponsor_usage_requests is
  'Libro por requestId de las reservas de patrocinio: idempotencia y liberación exacta. Sin transacciones, firmas ni claves.';
comment on function public.reserve_sponsor_usage(
  text, uuid, text, bigint, text, integer, integer, integer, bigint, bigint, bigint
) is
  'Reserva atómica de cupo de patrocinio con locks de asesoramiento y ventanas America/Santiago. Rechaza con código; nunca acepta topes por sobre los techos duros.';
comment on function public.release_sponsor_usage(text, text) is
  'Libera una reserva reserved y descuenta sus ventanas originales. Idempotente: no descuenta dos veces.';
